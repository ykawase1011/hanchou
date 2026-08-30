#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
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

function runStatus(commandName: string, args: string[], capture: boolean): ReturnType<typeof spawnSync> {
  return spawnSync(commandName, args, capture ? { encoding: "utf8" } : { stdio: "inherit" });
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function loadLaunchAgent(label: string, plist: string): void {
  const launchctl = which("launchctl");
  if (platform() !== "darwin" || launchctl === undefined) {
    console.log(`launchctl unavailable; not loaded: ${label}`);
    return;
  }
  if (process.getuid === undefined) throw new LaunchdError("cannot determine the current user id");
  const domain = `gui/${process.getuid()}`;
  const service = `${domain}/${label}`;
  const loaded = runStatus(launchctl, ["print", service], true).status === 0;
  if (loaded) {
    const result = runStatus(launchctl, ["bootout", service], false);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new LaunchdError(`launchctl bootout failed: ${service}`);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (runStatus(launchctl, ["print", service], true).status !== 0) break;
      sleep(100);
    }
  }
  let lastError = "";
  let loadedSuccessfully = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = runStatus(launchctl, ["bootstrap", domain, plist], true);
    if (result.error) throw result.error;
    if (result.status === 0) {
      loadedSuccessfully = true;
      break;
    }
    lastError = String(result.stderr || result.stdout || "").trim();
    sleep(100);
  }
  if (!loadedSuccessfully) throw new LaunchdError(`cannot load ${service}: ${lastError}`);
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
  const ui = valueAsTable(profile.ui, "ui");
  const specs: [string, string, Record<string, string>][] = [
    [
      join(ROOT, "templates", "launchd", "herdr.plist.tmpl"),
      join(generated, `dev.hanchou.${args.profile}.herdr.plist`),
      {
        ...common,
        HERDR_BIN: command("herdr"),
        HERDR_SESSION: valueAsString(herdr.session, "herdr.session"),
      },
    ],
    [
      join(ROOT, "templates", "launchd", "beads-ui.plist.tmpl"),
      join(generated, `dev.hanchou.${args.profile}.beads-ui.plist`),
      {
        ...common,
        BDUI_BIN: command("bdui"),
        BD_BIN: command("bd"),
        HOST: valueAsString(ui.beads_ui_host, "ui.beads_ui_host"),
        PORT: String(valueAsNumber(ui.beads_ui_port, "ui.beads_ui_port")),
      },
    ],
  ];

  for (const [source, target, values] of specs) {
    const rendered = replacePlaceholders(readText(source), values);
    if (existsSync(target) && readText(target) !== rendered) backup(target);
    atomicWrite(target, rendered);
    console.log(`wrote ${target}`);
    if (args.install) {
      const destination = join(homedir(), "Library", "LaunchAgents", basename(target));
      mkdirSync(dirname(destination), { recursive: true });
      if (existsSync(destination) && readText(destination) !== rendered) backup(destination);
      atomicWrite(destination, rendered);
      console.log(`installed ${destination}`);
      loadLaunchAgent(target.slice(0, -".plist".length).split("/").at(-1) as string, destination);
    }
  }
  if (args.install) console.log("LaunchAgents installed and loaded in the current GUI domain.");
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
