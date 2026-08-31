#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readToml } from "../lib/toml.ts";
import type { TomlTable, TomlValue } from "../lib/toml.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_ROOT = resolvePath(expandEnvironment(process.env.HANCHOU_CONFIG_ROOT ?? join(ROOT, "config")));

class LaunchdError extends Error {}

function readText(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function replacePlaceholders(template: string, values: Record<string, string>): string {
  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{{${key}}}`, htmlEscape(value));
  }
  const missing = [...template.matchAll(/\{\{([^}]*)/g)].map((match) => match[1] as string);
  if (missing.length > 0) throw new LaunchdError(`unresolved placeholders: ${missing.join(", ")}`);
  return template;
}

function which(name: string): string | undefined {
  const candidates = name.includes("/")
    ? [name]
    : (process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin")
        .split(":")
        .map((directory) => join(directory || ".", name));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return resolve(candidate);
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}

function command(name: string): string {
  const value = which(name);
  if (!value) throw new LaunchdError(`required command not found: ${name}`);
  return value;
}

function configuredCommand(environmentName: string, fallbackName: string): string {
  const configured = process.env[environmentName];
  if (configured === undefined) return command(fallbackName);
  if (!isAbsolute(configured)) throw new LaunchdError(`${environmentName} must be an absolute path`);
  let canonical: string;
  try {
    canonical = realpathSync(configured);
    accessSync(canonical, constants.X_OK);
    if (!statSync(canonical).isFile()) throw new Error("not a file");
  } catch {
    throw new LaunchdError(`${environmentName} must identify an executable file`);
  }
  return canonical;
}

function fingerprint(label: string, files: string[], values: string[]): string {
  const digest = createHash("sha256");
  digest.update(`${label}\0`);
  for (const value of values) digest.update(`value\0${value.length}\0${value}\0`);
  for (const path of files) {
    const canonical = realpathSync(path);
    digest.update(`file\0${canonical}\0`);
    digest.update(readFileSync(canonical));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function expandEnvironment(value: string): string {
  return value.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (original, braced: string | undefined, bare: string | undefined) => {
    const name = braced ?? bare ?? "";
    return Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] ?? "" : original;
  });
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function resolvePath(value: string): string {
  const absolute = resolve(expandHome(expandEnvironment(value)));
  let existing = absolute;
  const suffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return absolute;
    suffix.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync(existing), ...suffix);
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try { fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  let temporary: string | undefined;
  let descriptor: number | undefined;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = join(dirname(path), `.${basename(path)}.${process.pid}.${attempt}`);
      try {
        descriptor = openSync(candidate, "wx", 0o600);
        temporary = candidate;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (temporary === undefined || descriptor === undefined) {
      throw new LaunchdError(`cannot allocate temporary file for ${path}`);
    }
    writeFileSync(descriptor, text, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
    temporary = undefined;
    fsyncDirectory(dirname(path));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporary !== undefined) {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function timestamp(date = new Date()): string {
  const component = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}${component(date.getMonth() + 1)}${component(date.getDate())}-${component(date.getHours())}${component(date.getMinutes())}${component(date.getSeconds())}`;
}

function backup(path: string): void {
  if (!existsSync(path)) return;
  const destination = `${path}.bak.${timestamp()}`;
  const metadata = statSync(path);
  copyFileSync(path, destination);
  chmodSync(destination, metadata.mode);
  utimesSync(destination, metadata.atime, metadata.mtime);
  console.log(`backup: ${destination}`);
}

function reloadMarkerExists(path: string): boolean {
  let metadata;
  try { metadata = lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new LaunchdError(`reload marker must be a regular non-symlink file: ${path}`);
  if (process.getuid !== undefined && metadata.uid !== process.getuid()) throw new LaunchdError(`reload marker must be owned by the effective user: ${path}`);
  if ((metadata.mode & 0o022) !== 0) throw new LaunchdError(`reload marker must not be group/world writable: ${path}`);
  return true;
}

function ensureReloadMarker(path: string, label: string, destination: string): void {
  if (reloadMarkerExists(path)) return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, `${JSON.stringify({ schema: "hanchou.launchd-reload.v1", label, destination })}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(dirname(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST" && reloadMarkerExists(path)) return;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function clearReloadMarker(path: string): void {
  if (!reloadMarkerExists(path)) return;
  unlinkSync(path);
  fsyncDirectory(dirname(path));
}

interface InstallLockOwner {
  schema: "hanchou.launchd-install-lock.v1";
  profile: string;
  pid: number;
  token: string;
}

function installLockOwner(path: string, profile: string): { owner: InstallLockOwner; metadata: Stats } {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new LaunchdError(`LaunchAgent install lock must be a regular non-symlink file: ${path}`);
  if (process.getuid !== undefined && metadata.uid !== process.getuid()) throw new LaunchdError(`LaunchAgent install lock must be owned by the effective user: ${path}`);
  if ((metadata.mode & 0o022) !== 0) throw new LaunchdError(`LaunchAgent install lock must not be group/world writable: ${path}`);
  if (metadata.size > 4096) throw new LaunchdError(`LaunchAgent install lock is unexpectedly large: ${path}`);
  let value: unknown;
  try { value = JSON.parse(readText(path)); }
  catch { throw new LaunchdError(`LaunchAgent install lock has invalid JSON: ${path}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LaunchdError(`LaunchAgent install lock has invalid contents: ${path}`);
  const record = value as Record<string, unknown>;
  if (record.schema !== "hanchou.launchd-install-lock.v1"
    || record.profile !== profile
    || !Number.isSafeInteger(record.pid) || Number(record.pid) <= 0
    || typeof record.token !== "string" || !/^[0-9a-f]{32}$/.test(record.token)) {
    throw new LaunchdError(`LaunchAgent install lock has invalid contents: ${path}`);
  }
  return { owner: record as unknown as InstallLockOwner, metadata };
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function removeOwnedPath(path: string, expected: Stats): void {
  let current;
  try { current = lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!sameFile(current, expected)) return;
  unlinkSync(path);
  fsyncDirectory(dirname(path));
}

function withProfileInstallLock<T>(generated: string, profile: string, operation: () => T): T {
  const lockPath = join(generated, ".launchd-install.lock");
  const token = randomBytes(16).toString("hex");
  const owner: InstallLockOwner = { schema: "hanchou.launchd-install-lock.v1", profile, pid: process.pid, token };
  const ownerPath = join(generated, `.launchd-install.owner.${process.pid}.${token}`);
  atomicWrite(ownerPath, `${JSON.stringify(owner)}\n`);
  let acquired: Stats | undefined;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        linkSync(ownerPath, lockPath);
        fsyncDirectory(generated);
        acquired = lstatSync(lockPath);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = installLockOwner(lockPath, profile);
        if (processExists(existing.owner.pid)) {
          throw new LaunchdError(`another LaunchAgent install is already running for profile ${profile} (pid ${existing.owner.pid}); wait for it to finish, then retry`);
        }
        removeOwnedPath(lockPath, existing.metadata);
        const staleOwnerPath = join(generated, `.launchd-install.owner.${existing.owner.pid}.${existing.owner.token}`);
        try { removeOwnedPath(staleOwnerPath, existing.metadata); }
        catch { /* stale owner cleanup is best-effort after the canonical lock is gone */ }
      }
    }
    if (acquired === undefined) throw new LaunchdError(`cannot acquire LaunchAgent install lock for profile ${profile}`);
    try { return operation(); }
    finally { removeOwnedPath(lockPath, acquired); }
  } finally {
    let ownerMetadata;
    try { ownerMetadata = lstatSync(ownerPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (ownerMetadata !== undefined) removeOwnedPath(ownerPath, ownerMetadata);
  }
}

function runStatus(commandName: string, args: string[], capture: boolean): ReturnType<typeof spawnSync> {
  return spawnSync(commandName, args, capture ? { encoding: "utf8" } : { stdio: "inherit" });
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function bootstrapLaunchAgent(launchctl: string, domain: string, service: string, plist: string): void {
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = runStatus(launchctl, ["bootstrap", domain, plist], true);
    if (result.error) throw result.error;
    if (result.status === 0 || runStatus(launchctl, ["print", service], true).status === 0) return;
    lastError = String(result.stderr || result.stdout || `exit status ${result.status}`).trim();
    sleep(250);
  }
  throw new LaunchdError(`cannot register ${service} after retrying for 15 seconds: ${lastError}`);
}

function kickstartLaunchAgent(launchctl: string, domain: string, service: string, plist: string): void {
  let lastError = "";
  let recoveredRegistration = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = runStatus(launchctl, ["kickstart", "-p", service], true);
    if (result.error) throw result.error;
    if (result.status === 0) {
      const pid = String(result.stdout ?? "").trim();
      console.log(`kickstarted ${service}${/^\d+$/.test(pid) ? ` (pid ${pid})` : ""}`);
      return;
    }
    lastError = String(result.stderr || result.stdout || `exit status ${result.status}`).trim();
    // A service may disappear after the initial `print` or immediately after a
    // successful bootstrap. Recover that registration race once, then resume
    // the same bounded, non-destructive kickstart loop.
    if (!recoveredRegistration && runStatus(launchctl, ["print", service], true).status !== 0) {
      bootstrapLaunchAgent(launchctl, domain, service, plist);
      recoveredRegistration = true;
      continue;
    }
    sleep(250);
  }
  throw new LaunchdError(`cannot kickstart ${service} after retrying for 15 seconds: ${lastError}`);
}

function loadLaunchAgent(label: string, plist: string, reload: boolean, settlePaths: string[] = []): void {
  const launchctl = which("launchctl");
  if (platform() !== "darwin" || launchctl === undefined) {
    console.log(`launchctl unavailable; not loaded: ${label}`);
    return;
  }
  if (process.getuid === undefined) throw new LaunchdError("cannot determine the current user id");
  const domain = `gui/${process.getuid()}`;
  const service = `${domain}/${label}`;
  const loaded = runStatus(launchctl, ["print", service], true).status === 0;
  if (loaded && !reload) {
    // `bootstrap` may register a RunAtLoad job without scheduling its first
    // process immediately. A non-destructive kickstart (without `-k`) starts a
    // dormant job and leaves an already-running instance in place.
    kickstartLaunchAgent(launchctl, domain, service, plist);
    console.log(`loaded ${service} (current)`);
    return;
  }
  if (loaded) {
    const result = runStatus(launchctl, ["bootout", service], true);
    if (result.error) throw result.error;
    if (result.status !== 0 && runStatus(launchctl, ["print", service], true).status === 0) {
      const detail = String(result.stderr || result.stdout || "").trim();
      throw new LaunchdError(`launchctl bootout failed: ${service}${detail ? `: ${detail}` : ""}`);
    }
    let unloaded = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (runStatus(launchctl, ["print", service], true).status !== 0) {
        unloaded = true;
        break;
      }
      sleep(100);
    }
    if (!unloaded) throw new LaunchdError(`launchctl service did not finish unloading within 10 seconds: ${service}`);
    for (let attempt = 0; attempt < 100 && settlePaths.some((path) => existsSync(path)); attempt += 1) sleep(100);
    for (const path of settlePaths) {
      if (existsSync(path)) console.log(`WARN old service endpoint remains after 10 seconds; deferring live/stale socket handling to the pinned service: ${path}`);
    }
  }
  bootstrapLaunchAgent(launchctl, domain, service, plist);
  kickstartLaunchAgent(launchctl, domain, service, plist);
  console.log(`loaded ${service}`);
}

function valueAsTable(value: TomlValue | undefined, name: string): TomlTable {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be a TOML table`);
  }
  return value;
}

function valueAsString(value: TomlValue | undefined, name: string): string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function valueAsNumber(value: TomlValue | undefined, name: string): number {
  if (typeof value !== "number") throw new TypeError(`${name} must be a number`);
  return value;
}

interface Arguments {
  profile: "work" | "personal";
  install: boolean;
}

function usage(stream: NodeJS.WriteStream): void {
  stream.write("usage: render-launchd.ts [-h] [--install] {work,personal}\n");
}

function parseArguments(): Arguments | number {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    usage(args.length === 1 ? process.stdout : process.stderr);
    return args.length === 1 ? 0 : 2;
  }
  const installCount = args.filter((argument) => argument === "--install").length;
  const positional = args.filter((argument) => argument !== "--install");
  if (installCount > 1 || positional.length !== 1 || (positional[0] !== "work" && positional[0] !== "personal")) {
    usage(process.stderr);
    return 2;
  }
  return { profile: positional[0], install: installCount === 1 };
}

function renderLaunchAgents(
  args: Arguments,
  profile: TomlTable,
  paths: Record<string, string>,
  generated: string,
  root: string,
  controlDirectory: string,
): number {
  const defaultPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
  const pathValue = process.env.PATH ?? defaultPath;
  const common: Record<string, string> = {
    PROFILE: args.profile,
    STATE_ROOT: root,
    CONTROL_DIR: controlDirectory,
    BEADS_DIR: paths.beads_dir ?? "",
    RELAY_DIR: paths.relay_dir ?? "",
    REPO_ROOT: ROOT,
    CONFIG_ROOT,
    PATH: pathValue,
  };
  const herdr = valueAsTable(profile.herdr, "herdr");
  const herdrSession = valueAsString(herdr.session, "herdr.session");
  const herdrSocket = herdrSession === "default"
    ? join(homedir(), ".config", "herdr", "herdr.sock")
    : join(homedir(), ".config", "herdr", "sessions", herdrSession, "herdr.sock");
  const herdrClientSocket = join(dirname(herdrSocket), "herdr-client.sock");
  const ui = valueAsTable(profile.ui, "ui");
  const beadsUiHost = valueAsString(ui.beads_ui_host, "ui.beads_ui_host");
  const beadsUiPort = String(valueAsNumber(ui.beads_ui_port, "ui.beads_ui_port"));
  const dashboardHost = valueAsString(ui.dashboard_host, "ui.dashboard_host");
  const dashboardPort = String(valueAsNumber(ui.dashboard_port, "ui.dashboard_port"));
  const beadsUiBin = command("bdui");
  const nodeBin = configuredCommand("HANCHOU_PINNED_NODE_BIN", "node");
  const herdrBin = configuredCommand("HANCHOU_PINNED_HERDR_BIN", "herdr");
  const hanchouEntry = join(ROOT, "libexec", "hanchou.ts");
  const versions = readToml(join(CONFIG_ROOT, "versions.toml"));
  const versionComponents = valueAsTable(versions.components, "versions.components");
  const beadsUiVersion = valueAsString(valueAsTable(versionComponents.beads_ui, "versions.components.beads_ui").version, "versions.components.beads_ui.version");
  const beadsUiFingerprint = fingerprint("beads-ui", [beadsUiBin], [beadsUiHost, beadsUiPort, beadsUiVersion]);
  const dashboardFingerprint = fingerprint(
    "dashboard",
    [hanchouEntry, join(ROOT, "lib", "dashboard.ts"), join(ROOT, "lib", "dashboard-snapshot.ts"), join(ROOT, "lib", "toml.ts"), join(CONFIG_ROOT, "profiles", `${args.profile}.toml`)],
    [dashboardHost, dashboardPort, nodeBin],
  );
  const specs: [string, string, Record<string, string>][] = [
    [
      join(ROOT, "templates", "launchd", "herdr.plist.tmpl"),
      join(generated, `dev.hanchou.${args.profile}.herdr.plist`),
      {
        ...common,
        HERDR_BIN: herdrBin,
        HERDR_SESSION: herdrSession,
      },
    ],
    [
      join(ROOT, "templates", "launchd", "beads-ui.plist.tmpl"),
      join(generated, `dev.hanchou.${args.profile}.beads-ui.plist`),
      {
        ...common,
        BDUI_BIN: beadsUiBin,
        BD_BIN: command("bd"),
        HOST: beadsUiHost,
        PORT: beadsUiPort,
        FINGERPRINT: beadsUiFingerprint,
      },
    ],
    [
      join(ROOT, "templates", "launchd", "dashboard.plist.tmpl"),
      join(generated, `dev.hanchou.${args.profile}.dashboard.plist`),
      {
        ...common,
        NODE_BIN: nodeBin,
        HANCHOU_ENTRY: hanchouEntry,
        HOST: dashboardHost,
        PORT: dashboardPort,
        FINGERPRINT: dashboardFingerprint,
      },
    ],
  ];

  const prepared: Array<{ label: string; destination: string; reload: boolean; settlePaths: string[]; marker: string }> = [];
  for (const [source, target, values] of specs) {
    const rendered = replacePlaceholders(readText(source), values);
    const generatedChanged = !existsSync(target) || readText(target) !== rendered;
    if (existsSync(target) && generatedChanged) backup(target);
    if (generatedChanged) atomicWrite(target, rendered);
    console.log(`${generatedChanged ? "wrote" : "current"} ${target}`);
    if (args.install) {
      const destination = join(homedir(), "Library", "LaunchAgents", basename(target));
      mkdirSync(dirname(destination), { recursive: true });
      const destinationChanged = !existsSync(destination) || readText(destination) !== rendered;
      const label = target.slice(0, -".plist".length).split("/").at(-1) as string;
      const marker = join(generated, `.${label}.reload-pending`);
      if (destinationChanged) ensureReloadMarker(marker, label, destination);
      if (existsSync(destination) && destinationChanged) backup(destination);
      if (destinationChanged) atomicWrite(destination, rendered);
      console.log(`${destinationChanged ? "installed" : "current"} ${destination}`);
      prepared.push({
        label,
        destination,
        reload: destinationChanged || reloadMarkerExists(marker),
        settlePaths: label.endsWith(".herdr") ? [herdrSocket, herdrClientSocket] : [],
        marker,
      });
    }
  }
  if (args.install) {
    // Render and install every plist before touching a running service. Load the
    // non-destructive UI services first so a delayed Herdr shutdown cannot leave
    // a newly introduced dashboard absent after a partial upgrade.
    const priority = (label: string): number => label.endsWith(".dashboard") ? 0 : label.endsWith(".beads-ui") ? 1 : 2;
    for (const item of prepared.sort((left, right) => priority(left.label) - priority(right.label))) {
      loadLaunchAgent(item.label, item.destination, item.reload, item.settlePaths);
      clearReloadMarker(item.marker);
    }
    console.log("LaunchAgents installed and loaded in the current GUI domain.");
  }
  return 0;
}

function main(): number {
  const args = parseArguments();
  if (typeof args === "number") return args;
  const profile = readToml(join(CONFIG_ROOT, "profiles", `${args.profile}.toml`));
  const state = valueAsTable(profile.state, "state");
  const paths = Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, resolvePath(valueAsString(value, `state.${key}`))]),
  );
  const generated = join(homedir(), ".config", "hanchou", args.profile, "generated");
  const root = paths.root;
  const controlDirectory = paths.control_dir;
  if (root === undefined || controlDirectory === undefined) throw new TypeError("profile state paths are incomplete");
  const logs = join(root, "logs");
  for (const path of [generated, controlDirectory, logs]) mkdirSync(path, { recursive: true });
  const render = (): number => renderLaunchAgents(args, profile, paths, generated, root, controlDirectory);
  return args.install ? withProfileInstallLock(generated, args.profile, render) : render();
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
