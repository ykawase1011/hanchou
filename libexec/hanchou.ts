#!/usr/bin/env node

import { spawnSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { get as httpGet } from "node:http";
import { platform, tmpdir, userInfo } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseToml, readToml } from "../lib/toml.ts";
import { createDashboardServer } from "../lib/dashboard.ts";
import { createSnapshotSubprocessProvider } from "../lib/dashboard-snapshot.ts";

type JsonObject = Record<string, any>;
type RunResult = { returncode: number; stdout: string; stderr: string };
type RunOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  check?: boolean;
  capture?: boolean;
  timeout?: number;
  displayArgv?: string[];
  redactOutput?: boolean;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MISE_CONFIG = join(ROOT, "mise.toml");
const DEFAULT_CONFIG_ROOT = join(ROOT, "config");
let CONFIG_ROOT = DEFAULT_CONFIG_ROOT;
const VALID_PROFILES = new Set(["work", "personal"]);
const RELAY_EVENT_TYPES = new Set([
  "accepted", "checkpoint", "needs_decision", "blocked", "completed", "failed",
  "discovered_work", "schedule_proposal", "human_request", "schedule_due", "delivery_requested",
]);
const TERMINAL_TYPES = new Set(["completed", "failed"]);
const REPORTING_POLICIES = new Set([
  "silent", "parent_only", "on_failure", "on_change", "on_terminal", "always", "digest", "immediate",
]);
const DELIVERY_RENDERERS = new Set(["orchestrator", "editor", "producer"]);
const DELIVERY_KINDS = new Set(["task_terminal", "decision", "schedule_report", "daily_digest", "alert", "manual"]);
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DELIVERY_ID_PATTERN = /^dly_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const INBOX_STATES = new Set(["pending", "processing", "acknowledged", "dead-letter"]);
const DELIVERY_STATES = new Set(["pending", "rendered", "delivered", "failed"]);
const TERMINAL_JOURNAL_SCHEMA = "hanchou.relay-terminal-journal.v1";
const INBOX_TRANSITION_JOURNAL_SCHEMA = "hanchou.relay-inbox-transition-journal.v1";
const INSTANCE_SCHEMA = "hanchou.instance.v1";
const INSTANCE_TRANSACTION_SCHEMA = "hanchou.instance-transaction.v1";
const OFFICIAL_CORE_SOURCE = "https://github.com/ykawase1011/hanchou.git";
const OFFICIAL_SKILLS_SOURCE = "https://github.com/ykawase1011/hanchou-skills.git";
const OFFICIAL_INSTANCE_REF = "refs/heads/main";
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/;

type InstanceCommits = {
  core: string;
  skills: string;
};

type InstanceMetadata = {
  schema: "hanchou.instance.v1";
  profile: string;
  instance_root: string;
  core_path: string;
  skills_path: string;
  launcher_path: string;
  source: {
    core: string;
    skills: string;
    ref: string;
  };
  current: InstanceCommits;
  previous: InstanceCommits | null;
  legacy_orchestrator_roots: string[];
  created_at: string;
  updated_at: string;
};

type InstanceTransaction = {
  schema: "hanchou.instance-transaction.v1";
  profile: string;
  action: "update" | "rollback";
  from: InstanceCommits;
  to: InstanceCommits;
  status: "switching" | "post-activation" | "rollback-failed";
  started_at: string;
  error?: string;
};

type InstanceCommandOverrides = {
  root?: string;
  coreSource?: string;
  skillsSource?: string;
  ref?: string;
  interactive?: boolean;
  validateCandidate?: (corePath: string, skillsPath: string) => void;
  postActivate?: (launcherPath: string, profile: string) => void;
};

type ProjectEntry = {
  id: string;
  path: string;
  canonical_path: string;
  allowed_profiles: string[];
  default_leaf_role?: string;
  default_leaf_kind?: string;
  labels?: string[];
};

type WorkspaceRootEntry = {
  id: string;
  path: string;
  canonical_path: string;
  allowed_profiles: string[];
  trust: "descendant-git-repositories";
};

type ProjectRegistry = {
  schema_version: 1;
  default_policy: "deny";
  registry_path: string;
  registry_digest: string | null;
  projects: ProjectEntry[];
  workspace_roots: WorkspaceRootEntry[];
};

type ProjectAuthorization = {
  schema: "hanchou.project-authorization.v1";
  profile: string;
  project: string;
  repo_path: string;
  source_kind: "project" | "workspace_root";
  source_id: string;
  workspace_root: string | null;
  registry_path: string;
  registry_digest: string;
};

type OrchestratorRuntimeBinding = {
  schema: "hanchou.orchestrator-runtime.v1" | "hanchou.orchestrator-runtime.v2";
  profile: string;
  session: string;
  agent_name: string;
  workspace_label: string;
  core_root: string;
  workspace_cwd: string;
  workspace_id: string;
  tab_id: string;
  pane_id: string;
  terminal_id: string;
  created_at: string;
  updated_at: string;
};

type OrchestratorStopTarget = {
  workspace_id: string;
  tab_id: string;
  pane_id: string;
  terminal_id: string;
  bound: boolean;
  managed: boolean;
  unmanaged: boolean;
  unmanaged_reasons: string[];
  focused: boolean;
  agents: string[];
  status: string;
  base_directory: string;
  working_directory: string;
  foreground_process_count: number;
  additional_process_count: number | null;
  processes: string[];
  process_working_directories: string[];
  identity_fingerprint: string;
};

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

class ArgumentError extends Error {
  readonly context: string;
  constructor(context: string, message: string) {
    super(message);
    this.name = "ArgumentError";
    this.context = context;
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function utcnow(): string {
  return new Date().toISOString();
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function expand(value: string): string {
  let rendered = value.replace(/^~(?=$|\/)/, operatorHome());
  rendered = rendered.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, plain) => {
    const key = braced || plain;
    if (key === "HOME") return operatorHome();
    return process.env[key] ?? match;
  });
  const lexical = resolve(rendered);
  const suffix: string[] = [];
  let ancestor = lexical;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) return lexical;
    suffix.unshift(basename(ancestor));
    ancestor = parent;
  }
  return join(realpathSync(ancestor), ...suffix);
}

function pathExists(path: string): boolean {
  return existsSync(path);
}

function lexists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function which(name: string): string | null {
  if (name.includes("/")) return existsSync(name) ? resolve(name) : null;
  const search = (process.env.PATH ?? "").split(":");
  for (const directory of search) {
    const candidate = join(directory || ".", name);
    try {
      if (statSync(candidate).isFile() && (statSync(candidate).mode & 0o111) !== 0) return candidate;
    } catch { /* continue */ }
  }
  return null;
}

function trustedSearchPath(): string {
  return [
    join(operatorHome(), ".local", "bin"),
    join(operatorHome(), ".local", "share", "mise", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

export function trustedMiseExecutable(): string {
  const candidates = [
    "/opt/homebrew/bin/mise",
    "/usr/local/bin/mise",
    "/home/linuxbrew/.linuxbrew/bin/mise",
    "/usr/bin/mise",
    join(operatorHome(), ".local", "share", "mise", "bin", "mise"),
    join(operatorHome(), ".local", "bin", "mise"),
  ];
  for (const candidate of candidates) {
    try {
      const resolved = realpathSync(candidate);
      const info = statSync(resolved);
      const ownerAllowed = typeof process.getuid !== "function" || info.uid === process.getuid() || info.uid === 0;
      if (info.isFile() && (info.mode & 0o111) !== 0 && (info.mode & 0o022) === 0 && ownerAllowed) return resolved;
    } catch { /* try the next fixed location */ }
  }
  throw new CommandError("required command not found in a trusted location: mise (install it with `brew install mise`)");
}

function trustedGitExecutable(): string {
  const candidates = [
    "/usr/bin/git",
    "/opt/homebrew/bin/git",
    "/usr/local/bin/git",
    "/home/linuxbrew/.linuxbrew/bin/git",
    join(operatorHome(), ".local", "bin", "git"),
  ];
  for (const candidate of candidates) {
    try {
      const resolved = realpathSync(candidate);
      const info = statSync(resolved);
      const ownerAllowed = typeof process.getuid !== "function" || info.uid === process.getuid() || info.uid === 0;
      if (info.isFile() && (info.mode & 0o111) !== 0 && (info.mode & 0o022) === 0 && ownerAllowed) return resolved;
    } catch { /* try the next fixed location */ }
  }
  throw new CommandError("required command not found in a trusted location: git (install it with `brew install git`)");
}

function trustedMiseEnvironment(): NodeJS.ProcessEnv {
  const home = operatorHome();
  const data = join(home, ".local", "share", "mise");
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    PATH: trustedSearchPath(),
    MISE_DATA_DIR: data,
    MISE_INSTALLS_DIR: join(data, "installs"),
  };
  for (const key of [
    "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "no_proxy", "GITHUB_TOKEN", "GH_TOKEN", "CI",
  ]) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}

function pinnedMiseToolPath(name: "herdr" | "node" | "npm" | "npx"): string {
  if (name === "npm" || name === "npx") pinnedMiseToolPath("node");
  const tools = miseTools();
  const family = name === "herdr" ? "herdr" : "node";
  const version = tools[family];
  if (!version || !/^[A-Za-z0-9._+-]+$/.test(version)) {
    throw new CommandError(`mise.toml requires a simple pinned ${family} version`);
  }
  const familyRoot = join(operatorHome(), ".local", "share", "mise", "installs", family);
  const candidate = name === "herdr"
    ? join(familyRoot, version, "herdr")
    : join(familyRoot, version, "bin", name);
  let resolvedRoot: string;
  let resolvedTool: string;
  let info: Stats;
  try {
    resolvedRoot = realpathSync(familyRoot);
    resolvedTool = realpathSync(candidate);
    info = statSync(resolvedTool);
  } catch {
    throw new CommandError(`pinned ${name} is not installed at ${candidate}; run \`mise install\``);
  }
  if (!pathWithin(resolvedRoot, resolvedTool)) {
    throw new CommandError(`pinned ${name} resolves outside the effective user's mise install root: ${resolvedTool}`);
  }
  if (!info.isFile() || (info.mode & 0o111) === 0) throw new CommandError(`pinned ${name} is not executable: ${resolvedTool}`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new CommandError(`pinned ${name} must be owned by the effective OS user: ${resolvedTool}`);
  }
  if ((info.mode & 0o022) !== 0) throw new CommandError(`pinned ${name} must not be group/world writable: ${resolvedTool}`);
  return name === "npm" || name === "npx" ? candidate : resolvedTool;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function shellJoin(argv: string[]): string {
  return argv.map(shellQuote).join(" ");
}

export function run(argv: string[], options: RunOptions = {}): RunResult {
  const capture = options.capture ?? false;
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeout,
    killSignal: "SIGKILL",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  const rendered = shellJoin(options.displayArgv ?? argv);
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") throw new CommandError(`command timed out after ${(options.timeout ?? 0) / 1000}s: ${rendered}`);
    throw new CommandError(`cannot run command: ${rendered}: ${result.error.message}`);
  }
  const returncode = result.status ?? (result.signal ? 128 : 1);
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if ((options.check ?? true) && returncode !== 0) {
    let detail = (stderr || stdout).trim();
    if (options.redactOutput && detail) detail = "<command output redacted>";
    throw new CommandError(`command failed (${returncode}): ${rendered}${detail ? `\n${detail}` : ""}`);
  }
  return { returncode, stdout, stderr };
}

function commandPath(name: string): string {
  if (name === "mise") return trustedMiseExecutable();
  if (name === "herdr" || name === "node" || name === "npm" || name === "npx") return pinnedMiseToolPath(name);
  const found = which(name);
  if (!found) throw new CommandError(`required command not found: ${name}`);
  return found;
}

function loadToml(path: string): JsonObject {
  try { return readToml(path) as JsonObject; }
  catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(`cannot read TOML ${path}: ${error}`);
  }
}

export function loadProfile(requested: string | null = null): [string, JsonObject] {
  const selected = requested || process.env.HANCHOU_PROFILE || "work";
  if (!VALID_PROFILES.has(selected)) throw new CommandError(`unknown profile: ${selected}`);
  const path = join(CONFIG_ROOT, "profiles", `${selected}.toml`);
  if (!existsSync(path)) throw new CommandError(`profile not found: ${path}`);
  const profile = loadToml(path);
  validatedHerdrSession(selected, profile);
  return [selected, profile];
}

function validatedHerdrSession(name: string, profile: JsonObject): string {
  if (!VALID_PROFILES.has(name)) throw new CommandError(`unknown profile: ${name}`);
  const session = profile.herdr?.session;
  if (typeof session !== "string" || session !== name) {
    throw new CommandError(`profile herdr.session must exactly match the selected profile: expected ${name}`);
  }
  return session;
}

function profilePaths(profile: JsonObject): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile.state ?? {})) result[key] = expand(String(value));
  return result;
}

function operatorHome(): string {
  const configured = userInfo().homedir;
  if (!isAbsolute(configured) || !isDirectory(configured)) {
    throw new CommandError(`cannot resolve the operator home directory from the effective OS user: ${configured}`);
  }
  return realpathSync(configured);
}

function projectRegistryPath(name: string): string {
  return join(operatorHome(), ".config", "hanchou", name, "projects.local.toml");
}

function defaultWorkspaceRoot(name: string): string {
  return join(operatorHome(), "HanchouWorkspace", name, "repositories");
}

function onboardingWorkspacePath(value: string): string {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CommandError("workspace root must be a non-empty path without control characters");
  }
  if (value.includes("$")) throw new CommandError("workspace root must not contain environment-variable expansion");
  const home = operatorHome();
  const rendered = value === "~" ? home : value.startsWith("~/") ? join(home, value.slice(2)) : value;
  if (!isAbsolute(rendered)) throw new CommandError("workspace root must be absolute or start with ~/");
  const lexical = resolve(rendered);
  if (pathWithin(lexical, home, true)) {
    throw new CommandError(`workspace root must not be filesystem root, HOME, or an ancestor of HOME: ${lexical}`);
  }
  if (!pathWithin(home, lexical)) {
    throw new CommandError(`onboarding workspace root must be strictly below the operator HOME: ${lexical}`);
  }

  let existing = lexical;
  while (!lexists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  if (lexists(existing)) {
    let canonical: string;
    try { canonical = realpathSync(existing); }
    catch (error) { throw new CommandError(`cannot inspect workspace root ancestor ${existing}: ${error}`); }
    if (canonical !== existing) {
      throw new CommandError(`workspace root must not contain symlink components: ${existing} resolves to ${canonical}`);
    }
  }
  if (lexists(lexical)) {
    validateAuthorityComponent(lexical, "workspace root", false);
    const canonical = realpathSync(lexical);
    if (canonical !== lexical) throw new CommandError(`workspace root must not contain symlink components: ${lexical} resolves to ${canonical}`);
  }
  let component = home;
  validateAuthorityComponent(component, "workspace root parent", false);
  for (const part of relative(home, lexical).split(/[\\/]+/)) {
    component = join(component, part);
    if (!lexists(component)) break;
    validateAuthorityComponent(component, "workspace root parent", false);
  }
  return lexical;
}

function createOnboardingWorkspace(path: string): void {
  if (!lexists(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
  }
  let component = operatorHome();
  for (const part of relative(component, path).split(/[\\/]+/)) {
    component = join(component, part);
    validateAuthorityComponent(component, "workspace root parent", false);
  }
  validateAuthorizedDirectory(realpathSync(path), "workspace root");
}

function ensureOnboardingRegistryDirectory(path: string): void {
  const home = operatorHome();
  for (const candidate of [join(home, ".config"), join(home, ".config", "hanchou"), dirname(path)]) {
    if (!lexists(candidate)) mkdirSync(candidate, { mode: 0o700 });
    validateAuthorityComponent(candidate, "Hanchou onboarding config directory", false);
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function onboardProfile(args: JsonObject, name: string, interactive = Boolean(process.stdin.isTTY)): void {
  const workspaceRoot = onboardingWorkspacePath(defaultWorkspaceRoot(name));
  const registryPath = projectRegistryPath(name);
  const rootId = `${name}-repositories`;
  let alreadyRegistered = false;
  if (existsSync(registryPath) && existsSync(workspaceRoot)) {
    const registry = loadProjectRegistry(name, false);
    alreadyRegistered = registry.workspace_roots.some((item) => item.id === rootId && item.canonical_path === workspaceRoot && item.allowed_profiles.includes(name));
  }

  console.log(`Hanchou onboarding plan: ${name}`);
  console.log(`  dedicated workspace: ${workspaceRoot}${existsSync(workspaceRoot) ? " (exists)" : " (create with mode 0700)"}`);
  console.log(`  human-owned registry: ${registryPath}${alreadyRegistered ? " (current)" : existsSync(registryPath) ? " (backup before change)" : " (create with mode 0600)"}`);
  console.log(`  authorization: workspace root ${rootId} / descendant-git-repositories${alreadyRegistered ? " (already registered)" : ""}`);
  console.log("  effect: every Git repository created strictly below this dedicated root is dispatch-authorized");
  console.log("  boundary: keep secrets, private repositories, downloads, and mixed local files outside this root");

  if (!args.yes) {
    console.log(`\nNo changes made. Review the plan, then run from your ordinary terminal:\n  hanchou onboard ${name} --yes`);
    return;
  }
  if (process.env.HERDR_ENV === "1" || process.env.HANCHOU_AGENT_ID) {
    throw new CommandError("onboard changes human-owned trust and must be run from an ordinary terminal outside a Herdr-managed pane");
  }
  if (!interactive) throw new CommandError("onboard --yes requires an interactive terminal controlled by the human operator");

  const registry = loadProjectRegistry(name, true);
  const conflictingProjectId = registry.projects.find((item) => item.id === rootId);
  if (conflictingProjectId) {
    throw new CommandError(`workspace root id ${rootId} conflicts with existing project authority: ${conflictingProjectId.canonical_path}`);
  }
  const conflictingProjectPath = registry.projects.find((item) => item.canonical_path === workspaceRoot);
  if (conflictingProjectPath) {
    throw new CommandError(`workspace root path is already registered as project ${conflictingProjectPath.id}: ${workspaceRoot}`);
  }
  const sameId = registry.workspace_roots.find((item) => item.id === rootId);
  if (sameId && (sameId.canonical_path !== workspaceRoot || !sameId.allowed_profiles.includes(name))) {
    throw new CommandError(`workspace root id ${rootId} is already registered with different authority: ${sameId.canonical_path}`);
  }
  const samePath = registry.workspace_roots.find((item) => item.canonical_path === workspaceRoot);
  if (samePath && samePath.id !== rootId) {
    throw new CommandError(`workspace root path is already registered as ${samePath.id}: ${workspaceRoot}`);
  }
  for (const item of registry.workspace_roots) {
    if (item.id === rootId) continue;
    if (pathWithin(item.canonical_path, workspaceRoot, true) || pathWithin(workspaceRoot, item.canonical_path, true)) {
      throw new CommandError(`workspace roots must not overlap: ${item.id} (${item.canonical_path}) and ${rootId} (${workspaceRoot})`);
    }
  }

  createOnboardingWorkspace(workspaceRoot);
  ensureOnboardingRegistryDirectory(registryPath);

  if (!sameId) {
    const snippet = [
      "[[workspace_roots]]",
      `id = ${tomlString(rootId)}`,
      `path = ${tomlString(workspaceRoot)}`,
      `allowed_profiles = [${tomlString(name)}]`,
      'trust = "descendant-git-repositories"',
    ].join("\n");
    const current = existsSync(registryPath) ? readText(registryPath).trimEnd() : 'schema_version = 1\ndefault_policy = "deny"';
    const candidate = `${current}\n\n${snippet}\n`;
    try { parseToml(candidate); }
    catch (error) { throw new CommandError(`cannot append workspace authorization to ${registryPath}: ${error}`); }
    backupAndWrite(registryPath, candidate);
  }

  const verified = loadProjectRegistry(name, false);
  const registered = verified.workspace_roots.find((item) => item.id === rootId && item.canonical_path === workspaceRoot && item.allowed_profiles.includes(name));
  if (!registered) throw new CommandError(`workspace authorization verification failed: ${rootId}`);
  console.log(`\nonboarding workspace ready: ${workspaceRoot}`);
  console.log(`authorization ready: ${rootId}`);
  console.log(`next: clone or create only Agent-safe Git repositories below ${workspaceRoot}`);
  console.log(`then: ${displayedProfileCommand(name, "bootstrap")} && ${displayedProfileCommand(name, "launch")}`);
}

function defaultInstanceRoot(name: string): string {
  return join(operatorHome(), "HanchouWorkspace", name);
}

function displayedHanchouExecutable(name: string): string {
  const launcher = process.env.HANCHOU_INSTANCE_LAUNCHER;
  const expected = join(defaultInstanceRoot(name), "bin", "hanchou");
  if (process.env.HANCHOU_INSTANCE_PROFILE === name && launcher && isAbsolute(launcher) && resolve(launcher) === resolve(expected)) {
    return shellQuote(expected);
  }
  return "hanchou";
}

function displayedProfileCommand(name: string, command: string, suffix = ""): string {
  const executable = displayedHanchouExecutable(name);
  const profile = executable === "hanchou" ? ` ${name}` : "";
  return `${executable} ${command}${profile}${suffix}`;
}

function instanceLayout(name: string, overrideRoot?: string): Record<string, string> {
  const root = onboardingWorkspacePath(overrideRoot ?? defaultInstanceRoot(name));
  return {
    root,
    core: join(root, "hanchou"),
    skills: join(root, "hanchou-skills"),
    repositories: join(root, "repositories"),
    launcher: join(root, "bin", "hanchou"),
    control: join(root, ".hanchou"),
    metadata: join(root, ".hanchou", "instance.json"),
    transaction: join(root, ".hanchou", "transaction.json"),
    plans: join(root, ".hanchou", "plans"),
  };
}

function instancePlanCache(name: string): string {
  return join(operatorHome(), ".cache", "hanchou", "instance-plans", name);
}

function ensurePrivateDirectoryChain(path: string, label: string): void {
  const home = operatorHome();
  if (!pathWithin(home, path)) throw new CommandError(`${label} must be strictly below the operator HOME: ${path}`);
  let component = home;
  validateAuthorityComponent(component, label, false);
  for (const part of relative(home, path).split(/[\\/]+/).filter(Boolean)) {
    component = join(component, part);
    if (!lexists(component)) {
      try { mkdirSync(component, { mode: 0o700 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    validateAuthorityComponent(component, label, false);
  }
  chmodSync(path, 0o700);
}

function instanceSources(overrides: InstanceCommandOverrides): { core: string; skills: string; ref: string } {
  return {
    core: overrides.coreSource ?? OFFICIAL_CORE_SOURCE,
    skills: overrides.skillsSource ?? OFFICIAL_SKILLS_SOURCE,
    ref: overrides.ref ?? OFFICIAL_INSTANCE_REF,
  };
}

function instanceGitEnvironment(): NodeJS.ProcessEnv {
  const env = trustedMiseEnvironment();
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_ASKPASS = "/usr/bin/false";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  env.GIT_NO_REPLACE_OBJECTS = "1";
  env.GIT_ATTR_NOSYSTEM = "1";
  env.GIT_LFS_SKIP_SMUDGE = "1";
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
}

function instanceGit(args: string[], cwd?: string): RunResult {
  return run([
    trustedGitExecutable(),
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "credential.helper=",
    "-c", "gc.auto=0",
    "-c", "maintenance.auto=false",
    "-c", "fetch.writeCommitGraph=false",
    ...args,
  ], {
    env: instanceGitEnvironment(),
    cwd,
    capture: true,
    timeout: 180_000,
    redactOutput: true,
  });
}

function validateCommit(value: unknown, label: string): string {
  if (typeof value !== "string" || !GIT_COMMIT_PATTERN.test(value)) throw new CommandError(`invalid ${label}: ${String(value)}`);
  return value;
}

function remoteInstanceCommit(source: string, ref: string): string {
  const proc = instanceGit(["ls-remote", "--exit-code", source, ref]);
  const rows = proc.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length !== 1) throw new CommandError(`expected one public Git ref for ${ref} at ${source}`);
  const [commit, observedRef, ...extra] = rows[0].split(/\s+/);
  if (extra.length || observedRef !== ref) throw new CommandError(`unexpected public Git ref response for ${ref} at ${source}`);
  return validateCommit(commit, `commit returned for ${source}`);
}

function remoteInstanceCommits(sources: { core: string; skills: string; ref: string }): InstanceCommits {
  return {
    core: remoteInstanceCommit(sources.core, sources.ref),
    skills: remoteInstanceCommit(sources.skills, sources.ref),
  };
}

function checkoutCommit(path: string): string {
  return validateCommit(instanceGit(["-C", path, "rev-parse", "HEAD"]).stdout.trim(), `checkout HEAD at ${path}`);
}

function validateManagedGitAdminTree(gitDirectory: string, label: string): void {
  const objectsDirectory = join(gitDirectory, "objects");
  const requiredDirectories = [
    gitDirectory,
    objectsDirectory,
    join(objectsDirectory, "info"),
    join(objectsDirectory, "pack"),
    join(gitDirectory, "refs"),
    join(gitDirectory, "logs"),
    join(gitDirectory, "info"),
    join(gitDirectory, "hooks"),
  ];
  const requiredFiles = [
    join(gitDirectory, "HEAD"),
    join(gitDirectory, "config"),
    join(gitDirectory, "index"),
    join(gitDirectory, "logs", "HEAD"),
  ];
  for (const path of requiredDirectories) {
    if (!lexists(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
      throw new CommandError(`${label} Git administrative directory must be a regular non-symlink directory: ${path}`);
    }
  }
  for (const path of requiredFiles) {
    if (!lexists(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
      throw new CommandError(`${label} Git administrative file must be a regular non-symlink file: ${path}`);
    }
  }

  const visit = (path: string): void => {
    let info: Stats;
    try { info = lstatSync(path); }
    catch (error) { throw new CommandError(`cannot inspect ${label} Git administrative state ${path}: ${error}`); }
    if (info.isSymbolicLink()) {
      throw new CommandError(`${label} Git administrative state must not contain symbolic links: ${path}`);
    }
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new CommandError(`${label} Git administrative state must be owned by the effective OS user: ${path}`);
    }
    if (info.isDirectory()) {
      for (const entry of readdirSync(path)) visit(join(path, entry));
      return;
    }
    if (!info.isFile()) {
      throw new CommandError(`${label} Git administrative state must contain only directories and regular files: ${path}`);
    }
    if (basename(path).endsWith(".lock")) {
      throw new CommandError(`${label} Git administrative state contains an unexpected lock file: ${path}`);
    }
    // Local clones may legitimately hard-link immutable object files. Git's
    // mutable administration files must be single-link files so checkout or
    // reflog writes cannot modify an operator file through a planted hard link.
    if (!pathWithin(objectsDirectory, path, true) && info.nlink !== 1) {
      throw new CommandError(`${label} Git administrative file must not be hard-linked: ${path}`);
    }
  };
  visit(gitDirectory);
}

function validateManagedGitAdminState(path: string, source: string, label: string): void {
  const gitDirectory = join(path, ".git");
  const configPath = join(gitDirectory, "config");
  const indexPath = join(gitDirectory, "index");
  validateManagedGitAdminTree(gitDirectory, label);
  validateAuthorityComponent(configPath, `${label} Git config`, true);
  validateAuthorityComponent(indexPath, `${label} Git index`, true);

  const allowedValues: Record<string, Set<string>> = {
    "core.repositoryformatversion": new Set(["0"]),
    "core.filemode": new Set(["true", "false"]),
    "core.bare": new Set(["false"]),
    "core.logallrefupdates": new Set(["true"]),
    "core.ignorecase": new Set(["true", "false"]),
    "core.precomposeunicode": new Set(["true", "false"]),
    "remote.origin.url": new Set([source]),
    "remote.origin.tagopt": new Set(["--no-tags"]),
    "remote.origin.fetch": new Set([
      "+refs/heads/*:refs/remotes/origin/*",
      "+refs/heads/main:refs/remotes/origin/main",
    ]),
    "branch.main.remote": new Set(["origin"]),
    "branch.main.merge": new Set(["refs/heads/main"]),
  };
  const entries = instanceGit(["-C", path, "config", "--local", "--no-includes", "--null", "--list"])
    .stdout.split("\0").filter(Boolean);
  const seen = new Set<string>();
  for (const entry of entries) {
    const separator = entry.indexOf("\n");
    if (separator <= 0) throw new CommandError(`${label} Git config contains a malformed entry`);
    const key = entry.slice(0, separator).toLowerCase();
    const value = entry.slice(separator + 1);
    if (seen.has(key)) throw new CommandError(`${label} Git config contains duplicate key ${key}`);
    seen.add(key);
    if (!allowedValues[key]?.has(value)) {
      throw new CommandError(`${label} Git config contains unapproved ${key}`);
    }
  }
  for (const key of ["core.repositoryformatversion", "core.filemode", "core.bare", "core.logallrefupdates", "remote.origin.url", "remote.origin.fetch"]) {
    if (!seen.has(key)) throw new CommandError(`${label} Git config is missing required key ${key}`);
  }

  const hooksDirectory = join(gitDirectory, "hooks");
  if (lexists(hooksDirectory)) {
    validateAuthorityComponent(hooksDirectory, `${label} Git hooks directory`, false);
    const unexpectedHooks = readdirSync(hooksDirectory).filter((entry) => !entry.endsWith(".sample"));
    if (unexpectedHooks.length) throw new CommandError(`${label} Git hooks directory contains unapproved entries: ${unexpectedHooks.sort().join(", ")}`);
  }
  for (const forbidden of [
    join(gitDirectory, "config.worktree"),
    join(gitDirectory, "commondir"),
    join(gitDirectory, "info", "attributes"),
    join(gitDirectory, "info", "grafts"),
    join(gitDirectory, "objects", "info", "alternates"),
    join(gitDirectory, "refs", "replace"),
  ]) {
    if (lexists(forbidden)) throw new CommandError(`${label} Git administrative state is not allowed: ${forbidden}`);
  }
  const packedRefs = join(gitDirectory, "packed-refs");
  if (lexists(packedRefs)) {
    validateAuthorityComponent(packedRefs, `${label} packed refs`, true);
    if (readText(packedRefs).split(/\r?\n/).some((line) => line.includes(" refs/replace/"))) {
      throw new CommandError(`${label} Git packed refs contain a replace ref`);
    }
  }
  const infoExclude = join(gitDirectory, "info", "exclude");
  if (lexists(infoExclude)) {
    validateAuthorityComponent(infoExclude, `${label} Git info exclude`, true);
    const rules = readText(infoExclude).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    if (rules.length) throw new CommandError(`${label} Git info exclude contains unapproved ignore rules`);
  }
  const indexed = instanceGit(["-C", path, "ls-files", "-v", "-z"]).stdout.split("\0").filter(Boolean);
  const flagged = indexed.filter((entry) => !entry.startsWith("H "));
  if (flagged.length) throw new CommandError(`${label} Git index contains skip-worktree, assume-unchanged, or other nonstandard flags`);
}

function ensureCleanManagedCheckout(path: string, source: string, expected: string, label: string, allowIgnoredArtifacts = false): void {
  validateAuthorityDirectoryChain(path, `${label} checkout`);
  const gitDirectory = join(path, ".git");
  if (!lexists(gitDirectory)) throw new CommandError(`${label} checkout is not a managed Git repository: ${path}`);
  validateAuthorityComponent(gitDirectory, `${label} Git directory`, false);
  validateManagedGitAdminState(path, source, label);
  const origin = instanceGit(["-C", path, "remote", "get-url", "origin"]).stdout.trim();
  if (origin !== source) throw new CommandError(`${label} checkout origin mismatch: expected ${source}, got ${origin}`);
  const actual = checkoutCommit(path);
  if (actual !== expected) throw new CommandError(`${label} checkout drift: expected ${expected}, got ${actual}`);
  const symbolic = run([trustedGitExecutable(), "-C", path, "symbolic-ref", "-q", "HEAD"], {
    env: instanceGitEnvironment(), capture: true, check: false, timeout: 30_000, redactOutput: true,
  });
  if (symbolic.returncode === 0) throw new CommandError(`${label} checkout must remain detached at an exact commit: ${path}`);
  const status = instanceGit(["-C", path, "status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim();
  if (status) throw new CommandError(`${label} checkout has local changes; preserve or remove them before updating: ${path}`);
  if (!allowIgnoredArtifacts) {
    const ignored = instanceGit(["-C", path, "ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).stdout;
    if (ignored) throw new CommandError(`${label} checkout contains ignored files outside the reviewed commit: ${path}`);
  }
}

function fetchExactCommitWithoutFetchHead(repository: string, source: string, expected: string, label: string): void {
  instanceGit([
    "-C", repository,
    "fetch",
    "--no-tags",
    "--no-write-fetch-head",
    "--no-auto-maintenance",
    "--no-auto-gc",
    source,
    expected,
  ]);
  const fetched = validateCommit(
    instanceGit(["-C", repository, "rev-parse", "--verify", `${expected}^{commit}`]).stdout.trim(),
    label,
  );
  if (fetched !== expected) throw new CommandError(`${label} mismatch: expected ${expected}, got ${fetched}`);
}

function instancePlanToken(value: JsonObject): string {
  return createHash("sha256").update(JSON.stringify(sortedJson(value))).digest("hex");
}

function readVersion(path: string): string {
  const versionPath = join(path, "VERSION");
  if (!existsSync(versionPath)) throw new CommandError(`candidate VERSION is missing: ${versionPath}`);
  const value = readText(versionPath).trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(value)) throw new CommandError(`candidate VERSION is invalid: ${value}`);
  return value;
}

function cloneInstanceRepository(source: string, ref: string, expected: string, destination: string): void {
  if (lexists(destination)) throw new CommandError(`candidate destination already exists: ${destination}`);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(branch) || branch.includes("..")) {
    throw new CommandError(`managed instance ref must name a simple branch: ${ref}`);
  }
  instanceGit(["clone", "--no-tags", "--single-branch", "--branch", branch, source, destination]);
  const actual = checkoutCommit(destination);
  if (actual !== expected) throw new CommandError(`public ${ref} moved while preparing the candidate: expected ${expected}, got ${actual}; rerun the plan`);
  instanceGit(["-C", destination, "checkout", "--detach", expected]);
  ensureCleanManagedCheckout(destination, source, expected, "candidate");
}

function requireFastForwardCandidate(path: string, current: string, candidate: string, label: string): void {
  if (current === candidate) return;
  const ancestry = run([trustedGitExecutable(), "-C", path, "merge-base", "--is-ancestor", current, candidate], {
    env: instanceGitEnvironment(), capture: true, check: false, timeout: 30_000, redactOutput: true,
  });
  if (ancestry.returncode !== 0) {
    throw new CommandError(`${label} public main is not a fast-forward from the installed commit; refuse update and inspect the upstream history`);
  }
}

export function candidateValidationEnvironment(corePath: string, skillsPath: string): NodeJS.ProcessEnv {
  const candidateRoot = dirname(corePath);
  if (dirname(skillsPath) !== candidateRoot) throw new CommandError("candidate Core and Skills must share one validation root");
  validateAuthorityDirectoryChain(candidateRoot, "candidate validation root");
  const validationHome = mkdtempSync(join(candidateRoot, ".validation-"));
  chmodSync(validationHome, 0o700);
  validateAuthorityDirectoryChain(validationHome, "candidate validation home");
  const env = trustedMiseEnvironment();
  for (const key of [
    "GITHUB_TOKEN", "GH_TOKEN", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "no_proxy",
  ]) delete env[key];
  env.HOME = validationHome;
  env.XDG_CONFIG_HOME = join(validationHome, ".config");
  env.XDG_CACHE_HOME = join(validationHome, ".cache");
  env.XDG_DATA_HOME = join(validationHome, ".local", "share");
  env.NPM_CONFIG_USERCONFIG = "/dev/null";
  env.NPM_CONFIG_CACHE = join(validationHome, ".npm");
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  return env;
}

function cleanupCandidateValidationHome(path: string, candidateRoot: string): void {
  try {
    if (dirname(path) !== candidateRoot || !basename(path).startsWith(".validation-")) {
      throw new CommandError("candidate validation HOME is outside its fixed root");
    }
    validateAuthorityDirectoryChain(path, "candidate validation home");
    validateAuthorityComponent(path, "candidate validation home", false);
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.log(`WARN candidate validation HOME was retained: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateInstancePair(corePath: string, skillsPath: string): void {
  const versions = loadToml(join(corePath, "config", "versions.toml"));
  const expectedSkillsVersion = versions.components?.hanchou_skills?.version;
  const actualSkillsVersion = readVersion(skillsPath);
  if (typeof expectedSkillsVersion !== "string" || expectedSkillsVersion !== actualSkillsVersion) {
    throw new CommandError(`candidate pair mismatch: Core requires Hanchou Skills ${String(expectedSkillsVersion)}, got ${actualSkillsVersion}`);
  }
  const coreCliSkill = join(corePath, "skills", "hanchou-cli", "SKILL.md");
  const publicCliSkill = join(skillsPath, "skills", "hanchou-cli", "SKILL.md");
  if (!existsSync(coreCliSkill) || !existsSync(publicCliSkill) || readText(coreCliSkill) !== readText(publicCliSkill)) {
    throw new CommandError("candidate pair mismatch: the shared hanchou-cli Skill is not byte-identical");
  }
  const sources = loadToml(join(corePath, "config", "skills", "sources.example.toml"));
  for (const source of sources.sources ?? []) {
    if (source?.enabled !== true || source.location !== "../hanchou-skills") continue;
    for (const skill of source.skills ?? []) {
      if (typeof skill !== "string" || !existsSync(join(skillsPath, "skills", skill, "SKILL.md"))) {
        throw new CommandError(`candidate pair mismatch: configured public Skill is missing: ${String(skill)}`);
      }
    }
  }
}

function defaultValidateInstanceCandidate(corePath: string, skillsPath: string): void {
  const mise = trustedMiseExecutable();
  const env = candidateValidationEnvironment(corePath, skillsPath);
  try {
    for (const repository of [corePath, skillsPath]) {
      run([mise, "-C", repository, "install"], { cwd: repository, env, timeout: 600_000 });
      run([mise, "-C", repository, "exec", "--", "npm", "ci", "--ignore-scripts"], { cwd: repository, env, timeout: 600_000 });
      run([mise, "-C", repository, "exec", "--", "make", "check"], { cwd: repository, env, timeout: 900_000 });
    }
    validateInstancePair(corePath, skillsPath);
  } finally {
    cleanupCandidateValidationHome(String(env.HOME), dirname(corePath));
  }
}

function prepareInstanceCandidate(
  name: string,
  root: string,
  current: InstanceCommits | null,
  sources: { core: string; skills: string; ref: string },
  commits: InstanceCommits,
  registryDigest: string | null,
  overrides: InstanceCommandOverrides,
): JsonObject {
  const cacheParent = current ? join(root, ".hanchou", "candidates") : instancePlanCache(name);
  ensurePrivateDirectoryChain(cacheParent, "instance candidate cache");
  const temporary = mkdtempSync(join(cacheParent, ".preparing-"));
  try {
    const corePath = join(temporary, "hanchou");
    const skillsPath = join(temporary, "hanchou-skills");
    cloneInstanceRepository(sources.core, sources.ref, commits.core, corePath);
    cloneInstanceRepository(sources.skills, sources.ref, commits.skills, skillsPath);
    if (current) {
      requireFastForwardCandidate(corePath, current.core, commits.core, "Core");
      requireFastForwardCandidate(skillsPath, current.skills, commits.skills, "Skills");
    }
    validateCandidateInDisposableClones(corePath, skillsPath, sources, commits, overrides);
    ensureCleanManagedCheckout(corePath, sources.core, commits.core, "candidate Core");
    ensureCleanManagedCheckout(skillsPath, sources.skills, commits.skills, "candidate Skills");
    const planBody: JsonObject = {
      schema: "hanchou.instance-plan.v1",
      operation: current ? "update" : "init",
      profile: name,
      instance_root: root,
      sources,
      current,
      candidate: commits,
      versions: { core: readVersion(corePath), skills: readVersion(skillsPath) },
      registry_digest: registryDigest,
    };
    const token = instancePlanToken(planBody);
    const destination = join(cacheParent, token);
    if (lexists(destination)) {
      rmSync(temporary, { recursive: true, force: true });
      const existing = trustedPlanRecord(join(destination, "plan.json"));
      const existingBody = { ...existing };
      delete existingBody.token;
      delete existingBody.candidate_path;
      delete existingBody.prepared_at;
      if (!deepEqual(existingBody, planBody)) throw new CommandError(`instance plan token collision at ${destination}`);
      validatePreparedCandidate(existing, overrides, false);
      return existing;
    }
    durableRename(temporary, destination);
    const record = { ...planBody, token, candidate_path: destination, prepared_at: utcnow() };
    atomicWrite(join(destination, "plan.json"), `${JSON.stringify(record)}\n`, 0o600);
    return record;
  } catch (error) {
    if (lexists(temporary)) rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function trustedPlanRecord(path: string): JsonObject {
  validateAuthorityDirectoryChain(dirname(path), "instance plan directory");
  if (!trustedLifecycleArtifact(path, "instance plan")) throw new CommandError(`instance plan not found: ${path}`);
  const record = readJsonFile(path, "instance plan");
  if (record.schema !== "hanchou.instance-plan.v1" || typeof record.token !== "string" || !/^[a-f0-9]{64}$/.test(record.token)) {
    throw new CommandError(`invalid instance plan: ${path}`);
  }
  const body = { ...record };
  delete body.token;
  delete body.candidate_path;
  delete body.prepared_at;
  if (instancePlanToken(body) !== record.token) throw new CommandError(`instance plan fingerprint mismatch: ${path}`);
  const candidateRoot = dirname(path);
  if (record.candidate_path !== candidateRoot) {
    throw new CommandError(`instance plan candidate path must exactly match its fixed plan directory: ${path}`);
  }
  return record;
}

function trustedInstanceMetadata(
  name: string,
  root: string,
  required = true,
  expectedSources = { core: OFFICIAL_CORE_SOURCE, skills: OFFICIAL_SKILLS_SOURCE, ref: OFFICIAL_INSTANCE_REF },
): InstanceMetadata | null {
  const layout = instanceLayout(name, root);
  if (lexists(layout.control)) validateAuthorityDirectoryChain(layout.control, "instance control directory");
  if (!lexists(layout.metadata)) {
    if (required) throw new CommandError(`Hanchou instance is not initialized: ${layout.metadata}; run the seed Core's \`hanchou init ${name}\``);
    return null;
  }
  if (!trustedLifecycleArtifact(layout.metadata, "instance metadata")) return null;
  validateAuthorityDirectoryChain(layout.root, "instance root");
  validateInstanceControlFile(layout.launcher, "profile-local launcher");
  if ((lstatSync(layout.launcher).mode & 0o111) === 0) throw new CommandError(`profile-local launcher is not executable: ${layout.launcher}`);
  const value = readJsonFile(layout.metadata, "instance metadata");
  const expected: JsonObject = {
    schema: INSTANCE_SCHEMA,
    profile: name,
    instance_root: realpathSync(layout.root),
    core_path: realpathSync(layout.core),
    skills_path: realpathSync(layout.skills),
    launcher_path: realpathSync(layout.launcher),
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw new CommandError(`instance metadata mismatch for ${key}: expected ${expectedValue}, got ${String(value[key])}`);
  }
  if (value.source?.core !== expectedSources.core || value.source?.skills !== expectedSources.skills || value.source?.ref !== expectedSources.ref) {
    throw new CommandError("instance metadata does not use the fixed official public repositories and main ref");
  }
  for (const key of ["core", "skills"]) validateCommit(value.current?.[key], `instance current.${key}`);
  if (value.previous !== null) for (const key of ["core", "skills"]) validateCommit(value.previous?.[key], `instance previous.${key}`);
  if (!Array.isArray(value.legacy_orchestrator_roots) || value.legacy_orchestrator_roots.some((item: unknown) => typeof item !== "string" || !isAbsolute(item))) {
    throw new CommandError(`instance metadata has invalid legacy_orchestrator_roots: ${layout.metadata}`);
  }
  for (const key of ["created_at", "updated_at"]) if (!isTimestamp(value[key])) throw new CommandError(`instance metadata has invalid ${key}: ${layout.metadata}`);
  ensureCleanManagedCheckout(layout.core, expectedSources.core, value.current.core, "managed Core");
  ensureCleanManagedCheckout(layout.skills, expectedSources.skills, value.current.skills, "managed Skills");
  validateExistingInstanceControlSurface(layout, layout.core);
  return value as InstanceMetadata;
}

function configuredInstance(name: string, required = false): { layout: Record<string, string>; metadata: InstanceMetadata } | null {
  const configuredRoot = process.env.HANCHOU_INSTANCE_ROOT;
  if (!configuredRoot) {
    if (required) throw new CommandError(`this command must be run through ${defaultInstanceRoot(name)}/bin/hanchou`);
    return null;
  }
  if (!isAbsolute(configuredRoot)) throw new CommandError("HANCHOU_INSTANCE_ROOT must be an absolute path fixed by the profile-local launcher");
  const expectedProfile = process.env.HANCHOU_INSTANCE_PROFILE;
  if (expectedProfile !== name) throw new CommandError(`profile-local launcher mismatch: expected profile ${expectedProfile ?? "(unset)"}, selected ${name}`);
  const expectedRoot = defaultInstanceRoot(name);
  if (resolve(configuredRoot) !== resolve(expectedRoot)) {
    throw new CommandError(`profile-local launcher root mismatch: expected ${expectedRoot}, got ${configuredRoot}`);
  }
  const layout = instanceLayout(name, configuredRoot);
  let metadata: InstanceMetadata;
  try { metadata = trustedInstanceMetadata(name, layout.root, true) as InstanceMetadata; }
  catch (error) {
    const transaction = readInstanceTransaction(layout.transaction);
    if (transaction) {
      throw new CommandError(`incomplete ${transaction.action} transaction (${transaction.status}) at ${layout.transaction}; automatic commands are blocked until the managed checkouts and metadata are manually inspected and repaired`);
    }
    throw error;
  }
  if (realpathSync(ROOT) !== metadata.core_path) {
    throw new CommandError(`profile-local launcher loaded the wrong Core: expected ${metadata.core_path}, got ${realpathSync(ROOT)}`);
  }
  return { layout, metadata };
}

function instanceWorkspaceRoot(name: string): string {
  const instance = configuredInstance(name, false);
  return instance ? realpathSync(instance.layout.root) : realpathSync(ROOT);
}

function instanceProjectCwd(name: string): string {
  const instance = configuredInstance(name, false);
  return instance ? realpathSync(instance.layout.root) : realpathSync(ROOT);
}

function renderInstanceLauncher(name: string): string {
  return `#!/bin/bash -p
set -euo pipefail
PATH="/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

HANCHOU_LOCAL_SOURCE="${"${BASH_SOURCE[0]}"}"
while [[ -L "$HANCHOU_LOCAL_SOURCE" ]]; do
  HANCHOU_LOCAL_SOURCE_DIR="$(cd "$(dirname "$HANCHOU_LOCAL_SOURCE")" && pwd -P)"
  HANCHOU_LOCAL_SOURCE="$(readlink "$HANCHOU_LOCAL_SOURCE")"
  [[ "$HANCHOU_LOCAL_SOURCE" != /* ]] && HANCHOU_LOCAL_SOURCE="$HANCHOU_LOCAL_SOURCE_DIR/$HANCHOU_LOCAL_SOURCE"
done
HANCHOU_LOCAL_BIN_DIR="$(cd "$(dirname "$HANCHOU_LOCAL_SOURCE")" && pwd -P)"
HANCHOU_LOCAL_ROOT="$(cd "$HANCHOU_LOCAL_BIN_DIR/.." && pwd -P)"
HANCHOU_LOCAL_CORE="$HANCHOU_LOCAL_ROOT/hanchou"

if [[ -L "$HANCHOU_LOCAL_CORE" || ! -d "$HANCHOU_LOCAL_CORE" || ! -x "$HANCHOU_LOCAL_CORE/bin/hanchou" ]]; then
  echo "hanchou: managed Core is missing or unsafe: $HANCHOU_LOCAL_CORE" >&2
  exit 127
fi

unset HANCHOU_CONFIG_ROOT
HANCHOU_INSTANCE_ROOT="$HANCHOU_LOCAL_ROOT"
HANCHOU_INSTANCE_PROFILE=${shellQuote(name)}
HANCHOU_PROFILE=${shellQuote(name)}
HANCHOU_INSTANCE_LAUNCHER="$HANCHOU_LOCAL_BIN_DIR/hanchou"
export HANCHOU_INSTANCE_ROOT HANCHOU_INSTANCE_PROFILE HANCHOU_PROFILE HANCHOU_INSTANCE_LAUNCHER

exec "$HANCHOU_LOCAL_CORE/bin/hanchou" "$@"
`;
}

function instanceInstructions(name: string, sourceRoot: string): string {
  const templatePath = join(sourceRoot, "templates", "instance", "AGENTS.md.tmpl");
  if (existsSync(templatePath)) return readText(templatePath).replaceAll("{{PROFILE}}", name);
  return `# Hanchou ${name} profile workspace

This directory is the Hanchou L0 control workspace for profile \`${name}\`.
The managed Core is \`./hanchou\`; public Hanchou Skills are in
\`./hanchou-skills\`; human-authorized project repositories are below
\`./repositories\`.

When this session is the Herdr Agent named \`orchestrator\`, read and follow:

- \`hanchou/roles/orchestrator/ROLE.md\`
- \`hanchou/docs/SESSION_HANDOFF.md\`
- \`hanchou/docs/RELAY.md\`
- \`hanchou/docs/REPORTING.md\`

Use \`./bin/hanchou\` for Hanchou commands. Do not edit the managed
\`hanchou\` or \`hanchou-skills\` checkouts; a human updates them with
\`./bin/hanchou update\`. Do not directly implement work inside
\`repositories/\` from L0. Resolve authorization and delegate project work to
an isolated worker/worktree. This profile root is a policy boundary for
convenience, not an OS-level security boundary.
`;
}

function validateInitInstanceTarget(layout: Record<string, string>): void {
  if (!lexists(layout.root)) return;
  validateAuthorityDirectoryChain(layout.root, "instance root");
  const allowed = new Set(["repositories", ".hanchou"]);
  const unexpected = readdirSync(layout.root).filter((entry) => !allowed.has(entry));
  if (unexpected.length) {
    throw new CommandError(`instance root contains unknown entries; refusing to overwrite: ${unexpected.sort().join(", ")}`);
  }
  if (lexists(layout.repositories)) validateAuthorityComponent(layout.repositories, "instance repository shelf", false);
  if (lexists(layout.control)) {
    validateAuthorityComponent(layout.control, "instance control directory", false);
    const controlEntries = readdirSync(layout.control);
    if (controlEntries.length) {
      throw new CommandError(`uninitialized instance control directory is not empty; inspect before retrying: ${controlEntries.sort().join(", ")}`);
    }
  }
}

function validateInitDeploymentDestinations(layout: Record<string, string>): void {
  for (const path of [
    layout.core,
    layout.skills,
    join(layout.root, "bin"),
    join(layout.root, ".codex"),
    join(layout.root, ".claude"),
    join(layout.root, "AGENTS.md"),
    join(layout.root, "CLAUDE.md"),
    layout.metadata,
  ]) {
    if (lexists(path)) throw new CommandError(`init deployment target appeared after review; refusing to overwrite: ${path}`);
  }
}

function validateInstanceControlFile(path: string, label = "instance managed control file"): void {
  validateAuthorityComponent(path, label, true);
  if (lstatSync(path).nlink !== 1) throw new CommandError(`${label} must not be hard-linked: ${path}`);
}

function writeInstanceControlFile(path: string, text: string): void {
  validateAuthorityDirectoryChain(dirname(path), "instance control directory");
  if (lexists(path)) validateInstanceControlFile(path);
  backupAndWrite(path, text);
}

function validateExistingInstanceControlSurface(layout: Record<string, string>, sourceRoot: string): void {
  for (const directory of [
    join(layout.root, "bin"),
    join(layout.root, ".codex"),
    join(layout.root, ".codex", "agents"),
    join(layout.root, ".codex", "rules"),
    join(layout.root, ".claude"),
    join(layout.root, ".claude", "agents"),
  ]) validateAuthorityComponent(directory, "instance managed control directory", false);
  const files = [
    layout.launcher,
    join(layout.root, "AGENTS.md"),
    join(layout.root, "CLAUDE.md"),
    join(layout.root, ".codex", "config.toml"),
    join(layout.root, ".codex", "rules", "hanchou.rules"),
    ...listMatchingFiles(join(sourceRoot, ".codex", "agents"), ".toml").map((source) => join(layout.root, ".codex", "agents", basename(source))),
    ...listMatchingFiles(join(sourceRoot, ".claude", "agents"), ".md").map((source) => join(layout.root, ".claude", "agents", basename(source))),
  ];
  for (const path of files) validateInstanceControlFile(path);
}

function materializeInstanceControlSurface(name: string, layout: Record<string, string>, sourceRoot = ROOT): void {
  for (const directory of [join(layout.root, "bin"), join(layout.root, ".codex"), join(layout.root, ".codex", "agents"), join(layout.root, ".codex", "rules"), join(layout.root, ".claude"), join(layout.root, ".claude", "agents")]) {
    if (!lexists(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    validateAuthorityDirectoryChain(directory, "instance control directory");
  }
  writeInstanceControlFile(layout.launcher, renderInstanceLauncher(name));
  chmodSync(layout.launcher, 0o700);
  writeInstanceControlFile(join(layout.root, "AGENTS.md"), instanceInstructions(name, sourceRoot));
  writeInstanceControlFile(join(layout.root, "CLAUDE.md"), instanceInstructions(name, sourceRoot));
  const codexConfig = readText(join(sourceRoot, ".codex", "config.toml"))
    .replaceAll("roles/orchestrator/ROLE.md", "hanchou/roles/orchestrator/ROLE.md");
  writeInstanceControlFile(join(layout.root, ".codex", "config.toml"), codexConfig);
  writeInstanceControlFile(join(layout.root, ".codex", "rules", "hanchou.rules"), readText(join(sourceRoot, ".codex", "rules", "hanchou.rules")));
  for (const source of listMatchingFiles(join(sourceRoot, ".codex", "agents"), ".toml")) {
    writeInstanceControlFile(join(layout.root, ".codex", "agents", basename(source)), readText(source));
  }
  for (const source of listMatchingFiles(join(sourceRoot, ".claude", "agents"), ".md")) {
    writeInstanceControlFile(join(layout.root, ".claude", "agents", basename(source)), readText(source));
  }
}

function writeInstanceMetadata(path: string, metadata: InstanceMetadata): void {
  atomicWrite(path, `${JSON.stringify(metadata)}\n`, 0o600);
}

function requireHumanInstanceApply(operation: string, args: JsonObject, interactive: boolean): string {
  if (!args.yes) throw new CommandError(`${operation} apply requires --yes`);
  if (process.env.HERDR_ENV === "1" || process.env.HANCHOU_AGENT_ID) {
    throw new CommandError(`${operation} --yes must be run from an ordinary terminal outside a Herdr-managed Agent`);
  }
  if (!interactive) throw new CommandError(`${operation} --yes requires an interactive terminal controlled by the human operator`);
  if (typeof args.plan !== "string" || !/^[a-f0-9]{64}$/.test(args.plan)) throw new CommandError(`${operation} --yes requires the exact 64-character --plan token`);
  return args.plan;
}

function requireHumanInstanceReview(operation: string, interactive: boolean): void {
  if (process.env.HERDR_ENV === "1" || process.env.HANCHOU_AGENT_ID) {
    throw new CommandError(`${operation} prepares or switches executable supply-chain code and must run outside a Herdr-managed Agent`);
  }
  if (!interactive) throw new CommandError(`${operation} requires an interactive terminal controlled by the human operator`);
}

function printInstancePlan(record: JsonObject): void {
  const operation = String(record.operation);
  console.log(`Hanchou instance ${operation} plan: ${record.profile}`);
  console.log(`  instance root: ${record.instance_root}`);
  console.log(`  Core: ${record.current?.core ?? "not installed"} -> ${record.candidate.core} (version ${record.versions.core})`);
  console.log(`  Skills: ${record.current?.skills ?? "not installed"} -> ${record.candidate.skills} (version ${record.versions.skills})`);
  console.log(`  source ref: ${record.sources.ref}`);
  console.log("  candidate: downloaded and validated; deployed checkouts are unchanged");
  console.log(`  plan token: ${record.token}`);
  const command = operation === "init"
    ? `${shellQuote(join(ROOT, "bin", "hanchou"))} init ${record.profile} --plan ${record.token} --yes`
    : `${shellQuote(join(String(record.instance_root), "bin", "hanchou"))} ${operation} --plan ${record.token} --yes`;
  console.log(`\nReview the exact commits above, then run from an ordinary terminal:\n  ${command}`);
}

function expectedCandidateRecordPath(base: string, token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new CommandError(`invalid instance plan token: ${token}`);
  return join(base, token, "plan.json");
}

function validatePreparedCandidate(record: JsonObject, overrides: InstanceCommandOverrides, runValidation = true): void {
  const candidateRoot = String(record.candidate_path);
  const expectedRoot = join(dirname(candidateRoot), String(record.token));
  if (candidateRoot !== expectedRoot) throw new CommandError("instance plan candidate path is not bound to its token");
  const corePath = join(candidateRoot, "hanchou");
  const skillsPath = join(candidateRoot, "hanchou-skills");
  ensureCleanManagedCheckout(corePath, String(record.sources.core), validateCommit(record.candidate.core, "candidate Core commit"), "candidate Core");
  ensureCleanManagedCheckout(skillsPath, String(record.sources.skills), validateCommit(record.candidate.skills, "candidate Skills commit"), "candidate Skills");
  if (runValidation) validateCandidateInDisposableClones(
    corePath,
    skillsPath,
    { core: String(record.sources.core), skills: String(record.sources.skills) },
    { core: String(record.candidate.core), skills: String(record.candidate.skills) },
    overrides,
  );
  ensureCleanManagedCheckout(corePath, String(record.sources.core), record.candidate.core, "candidate Core");
  ensureCleanManagedCheckout(skillsPath, String(record.sources.skills), record.candidate.skills, "candidate Skills");
}

function removePreparedCandidate(record: JsonObject): void {
  const candidateRoot = String(record.candidate_path);
  const expectedRoot = join(dirname(candidateRoot), String(record.token));
  if (candidateRoot !== expectedRoot) throw new CommandError("refusing to remove an unbound instance candidate path");
  validateAuthorityDirectoryChain(candidateRoot, "instance candidate directory");
  validateAuthorityComponent(candidateRoot, "instance candidate directory", false);
  rmSync(candidateRoot, { recursive: true, force: true });
}

function cleanupPreparedCandidate(record: JsonObject): void {
  try { removePreparedCandidate(record); }
  catch (error) {
    console.log(`WARN validated candidate cache was retained: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clonePreparedCheckout(sourcePath: string, publicSource: string, commit: string, destination: string): void {
  instanceGit(["clone", "--no-hardlinks", "--no-tags", sourcePath, destination]);
  instanceGit(["-C", destination, "remote", "set-url", "origin", publicSource]);
  instanceGit(["-C", destination, "checkout", "--detach", commit]);
  ensureCleanManagedCheckout(destination, publicSource, commit, "managed candidate");
}

function validateCandidateInDisposableClones(
  corePath: string,
  skillsPath: string,
  sources: { core: string; skills: string },
  commits: InstanceCommits,
  overrides: InstanceCommandOverrides,
): void {
  if (dirname(corePath) !== dirname(skillsPath)) throw new CommandError("candidate Core and Skills must share one root");
  const validationRoot = mkdtempSync(join(dirname(corePath), ".candidate-check-"));
  try {
    const validationCore = join(validationRoot, "hanchou");
    const validationSkills = join(validationRoot, "hanchou-skills");
    clonePreparedCheckout(corePath, sources.core, commits.core, validationCore);
    clonePreparedCheckout(skillsPath, sources.skills, commits.skills, validationSkills);
    (overrides.validateCandidate ?? defaultValidateInstanceCandidate)(validationCore, validationSkills);
    ensureCleanManagedCheckout(validationCore, sources.core, commits.core, "validated disposable Core", true);
    ensureCleanManagedCheckout(validationSkills, sources.skills, commits.skills, "validated disposable Skills", true);
  } finally {
    try {
      validateAuthorityDirectoryChain(validationRoot, "candidate validation directory");
      validateAuthorityComponent(validationRoot, "candidate validation directory", false);
      rmSync(validationRoot, { recursive: true, force: true });
    } catch (error) {
      console.log(`WARN disposable candidate validation directory was retained: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function initInstanceCommand(
  args: JsonObject,
  name: string,
  profile: JsonObject,
  overrides: InstanceCommandOverrides = {},
): void {
  const sources = instanceSources(overrides);
  const layout = instanceLayout(name, overrides.root);
  const interactive = overrides.interactive ?? Boolean(process.stdin.isTTY);
  requireHumanInstanceReview("init", interactive);
  const existing = trustedInstanceMetadata(name, layout.root, false, sources);
  if (existing) {
    console.log(`Hanchou instance already initialized: ${layout.root}`);
    console.log(`use: ${layout.launcher} update`);
    return;
  }
  validateInitInstanceTarget(layout);
  for (const [label, path] of [["managed Core", layout.core], ["managed Skills", layout.skills], ["profile-local launcher", layout.launcher]] as Array<[string, string]>) {
    if (lexists(path)) throw new CommandError(`${label} path already exists without trusted instance metadata; refusing to overwrite: ${path}`);
  }
  const registry = loadProjectRegistry(name, true);

  if (!args.yes) {
    const lockRoot = join(operatorHome(), ".config", "hanchou", name);
    ensurePrivateDirectoryChain(lockRoot, "instance lifecycle lock directory");
    const record = withLock(join(lockRoot, ".instance-lifecycle.lock"), () => {
      const commits = remoteInstanceCommits(sources);
      return prepareInstanceCandidate(name, layout.root, null, sources, commits, registry.registry_digest, overrides);
    });
    printInstancePlan(record);
    return;
  }

  const token = requireHumanInstanceApply("init", args, interactive);
  const recordPath = expectedCandidateRecordPath(instancePlanCache(name), token);
  const record = trustedPlanRecord(recordPath);
  if (record.operation !== "init" || record.profile !== name || record.instance_root !== layout.root || record.token !== token) {
    throw new CommandError("init plan does not match this profile and instance root");
  }
  if (!deepEqual(record.sources, sources) || record.current !== null) throw new CommandError("init plan source/current state mismatch");
  if (record.registry_digest !== registry.registry_digest) throw new CommandError("init plan is stale because the human-owned project registry changed");
  validatePreparedCandidate(record, overrides, false);

  const lockRoot = join(operatorHome(), ".config", "hanchou", name);
  ensurePrivateDirectoryChain(lockRoot, "instance lifecycle lock directory");
  withLock(join(lockRoot, ".instance-lifecycle.lock"), () => {
    if (trustedInstanceMetadata(name, layout.root, false, sources)) throw new CommandError(`Hanchou instance was initialized concurrently: ${layout.root}`);
    validateInitInstanceTarget(layout);
    for (const path of [layout.core, layout.skills, layout.launcher]) if (lexists(path)) throw new CommandError(`init target appeared after review: ${path}`);
    const lockedRegistry = loadProjectRegistry(name, true);
    if (lockedRegistry.registry_digest !== record.registry_digest) throw new CommandError("init plan is stale because the project registry changed after review");

    ensurePrivateDirectoryChain(layout.control, "instance control directory");
    const staging = mkdtempSync(join(layout.control, ".installing-"));
    const installedPaths: Array<{ path: string; dev: number; ino: number; directory: boolean }> = [];
    const installStagedPath = (source: string, destination: string): void => {
      if (lexists(destination)) throw new CommandError(`init deployment target appeared during installation; refusing to overwrite: ${destination}`);
      const sourceInfo = lstatSync(source);
      if (sourceInfo.isDirectory() && !sourceInfo.isSymbolicLink()) {
        mkdirSync(destination, { mode: 0o700 });
        const installed = lstatSync(destination);
        installedPaths.push({ path: destination, dev: installed.dev, ino: installed.ino, directory: true });
        for (const entry of readdirSync(source)) {
          const childDestination = join(destination, entry);
          if (lexists(childDestination)) throw new CommandError(`init child target appeared during installation: ${childDestination}`);
          renameSync(join(source, entry), childDestination);
        }
        rmdirSync(source);
      } else if (sourceInfo.isFile() && !sourceInfo.isSymbolicLink()) {
        linkSync(source, destination);
        const installed = lstatSync(destination);
        installedPaths.push({ path: destination, dev: installed.dev, ino: installed.ino, directory: false });
        unlinkSync(source);
      } else {
        throw new CommandError(`staged instance target must be a regular file or directory: ${source}`);
      }
      fsyncDirectory(dirname(destination));
    };
    const validateInstalledIdentities = (): void => {
      for (const installed of installedPaths) {
        const current = lstatSync(installed.path);
        if (current.dev !== installed.dev || current.ino !== installed.ino || current.isDirectory() !== installed.directory) {
          throw new CommandError(`installed instance target identity changed before commit: ${installed.path}`);
        }
      }
    };
    try {
      clonePreparedCheckout(join(record.candidate_path, "hanchou"), sources.core, record.candidate.core, join(staging, "hanchou"));
      clonePreparedCheckout(join(record.candidate_path, "hanchou-skills"), sources.skills, record.candidate.skills, join(staging, "hanchou-skills"));
      validateCandidateInDisposableClones(
        join(staging, "hanchou"),
        join(staging, "hanchou-skills"),
        sources,
        record.candidate as InstanceCommits,
        overrides,
      );
      ensureCleanManagedCheckout(join(staging, "hanchou"), sources.core, record.candidate.core, "staged Core");
      ensureCleanManagedCheckout(join(staging, "hanchou-skills"), sources.skills, record.candidate.skills, "staged Skills");
      const stagedSurface = instanceLayout(name, join(staging, "surface"));
      materializeInstanceControlSurface(name, stagedSurface, join(staging, "hanchou"));
      const recheckedRegistry = loadProjectRegistry(name, true);
      if (record.registry_digest !== recheckedRegistry.registry_digest) {
        throw new CommandError("init plan is stale because the project registry changed during candidate validation");
      }
      validateInitDeploymentDestinations(layout);
      onboardProfile({ yes: true }, name, interactive);
      validateInitDeploymentDestinations(layout);
      installStagedPath(join(staging, "hanchou"), layout.core);
      installStagedPath(join(staging, "hanchou-skills"), layout.skills);
      for (const entry of ["bin", ".codex", ".claude", "AGENTS.md", "CLAUDE.md"]) {
        installStagedPath(join(stagedSurface.root, entry), join(layout.root, entry));
      }
      validateInstalledIdentities();
      ensureCleanManagedCheckout(layout.core, sources.core, record.candidate.core, "installed Core");
      ensureCleanManagedCheckout(layout.skills, sources.skills, record.candidate.skills, "installed Skills");
      validateExistingInstanceControlSurface(layout, layout.core);
      const now = utcnow();
      const legacyRoot = realpathSync(ROOT) === realpathSync(layout.core) ? [] : [realpathSync(ROOT)];
      const metadata: InstanceMetadata = {
        schema: INSTANCE_SCHEMA,
        profile: name,
        instance_root: realpathSync(layout.root),
        core_path: realpathSync(layout.core),
        skills_path: realpathSync(layout.skills),
        launcher_path: realpathSync(layout.launcher),
        source: sources,
        current: clone(record.candidate),
        previous: null,
        legacy_orchestrator_roots: legacyRoot,
        created_at: now,
        updated_at: now,
      };
      writeInstanceMetadata(layout.metadata, metadata);
      cleanupPreparedCandidate(record);
      if (lexists(staging)) {
        try { rmSync(staging, { recursive: true, force: true }); }
        catch (error) { console.log(`WARN init staging directory was retained: ${error instanceof Error ? error.message : String(error)}`); }
      }
    } catch (error) {
      if (!lexists(layout.metadata)) {
        for (const installed of installedPaths.reverse()) {
          if (!lexists(installed.path)) continue;
          const current = lstatSync(installed.path);
          if (current.dev !== installed.dev || current.ino !== installed.ino || current.isDirectory() !== installed.directory) {
            console.log(`WARN retained replaced init target during cleanup: ${installed.path}`);
            continue;
          }
          rmSync(installed.path, { recursive: installed.directory, force: true });
        }
      }
      if (lexists(staging)) rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  });
  console.log(`\nHanchou instance ready: ${layout.root}`);
  console.log(`local command: ${layout.launcher}`);
  console.log(`next: cd ${shellQuote(layout.root)} && ./bin/hanchou bootstrap && ./bin/hanchou doctor`);
}

function operationInstance(name: string, overrides: InstanceCommandOverrides): { layout: Record<string, string>; metadata: InstanceMetadata; sources: { core: string; skills: string; ref: string } } {
  const sources = instanceSources(overrides);
  if (overrides.root) {
    const layout = instanceLayout(name, overrides.root);
    const metadata = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
    return { layout, metadata, sources };
  }
  const configured = configuredInstance(name, true) as { layout: Record<string, string>; metadata: InstanceMetadata };
  return { ...configured, sources };
}

function defaultPostActivate(launcherPath: string): void {
  const env = { ...process.env };
  delete env.HERDR_ENV;
  delete env.HANCHOU_AGENT_ID;
  run([launcherPath, "bootstrap"], { env, timeout: 1_800_000 });
  run([launcherPath, "doctor"], { env, timeout: 300_000 });
}

function readInstanceTransaction(path: string): InstanceTransaction | null {
  if (!lexists(path)) return null;
  if (!trustedLifecycleArtifact(path, "instance transaction")) return null;
  const value = readJsonFile(path, "instance transaction");
  if (value.schema !== INSTANCE_TRANSACTION_SCHEMA || !new Set(["update", "rollback"]).has(value.action) || !new Set(["switching", "post-activation", "rollback-failed"]).has(value.status)) {
    throw new CommandError(`invalid instance transaction: ${path}`);
  }
  for (const side of ["from", "to"]) for (const key of ["core", "skills"]) validateCommit(value[side]?.[key], `transaction ${side}.${key}`);
  if (!isTimestamp(value.started_at)) throw new CommandError(`invalid instance transaction timestamp: ${path}`);
  return value as InstanceTransaction;
}

function checkoutPreparedCommit(managedPath: string, candidatePath: string, expected: string): void {
  fetchExactCommitWithoutFetchHead(managedPath, candidatePath, expected, "prepared candidate");
  instanceGit(["-C", managedPath, "checkout", "--detach", expected]);
}

function switchInstance(
  action: "update" | "rollback",
  name: string,
  layout: Record<string, string>,
  metadata: InstanceMetadata,
  record: JsonObject,
  overrides: InstanceCommandOverrides,
): void {
  const from = clone(metadata.current);
  const to = clone(record.candidate) as InstanceCommits;
  const candidateCore = join(String(record.candidate_path), "hanchou");
  const candidateSkills = join(String(record.candidate_path), "hanchou-skills");
  ensureCleanManagedCheckout(layout.core, metadata.source.core, from.core, "managed Core before switch");
  ensureCleanManagedCheckout(layout.skills, metadata.source.skills, from.skills, "managed Skills before switch");
  validatePreparedCandidate(record, overrides, false);
  fetchExactCommitWithoutFetchHead(layout.core, candidateCore, to.core, "prepared Core candidate");
  fetchExactCommitWithoutFetchHead(layout.skills, candidateSkills, to.skills, "prepared Skills candidate");
  instanceGit(["-C", layout.core, "update-ref", "refs/hanchou/previous", from.core]);
  instanceGit(["-C", layout.skills, "update-ref", "refs/hanchou/previous", from.skills]);

  const transaction: InstanceTransaction = {
    schema: INSTANCE_TRANSACTION_SCHEMA,
    profile: name,
    action,
    from,
    to,
    status: "switching",
    started_at: utcnow(),
  };
  atomicWrite(layout.transaction, `${JSON.stringify(transaction)}\n`, 0o600);
  const postActivate = overrides.postActivate ?? defaultPostActivate;
  try {
    ensureCleanManagedCheckout(layout.core, metadata.source.core, from.core, "managed Core at activation");
    ensureCleanManagedCheckout(layout.skills, metadata.source.skills, from.skills, "managed Skills at activation");
    checkoutPreparedCommit(layout.core, candidateCore, to.core);
    checkoutPreparedCommit(layout.skills, candidateSkills, to.skills);
    ensureCleanManagedCheckout(layout.core, metadata.source.core, to.core, "activated Core");
    ensureCleanManagedCheckout(layout.skills, metadata.source.skills, to.skills, "activated Skills");
    const activated: InstanceMetadata = {
      ...metadata,
      current: to,
      previous: from,
      updated_at: utcnow(),
    };
    writeInstanceMetadata(layout.metadata, activated);
    materializeInstanceControlSurface(name, layout);
    transaction.status = "post-activation";
    atomicWrite(layout.transaction, `${JSON.stringify(transaction)}\n`, 0o600);
    postActivate(layout.launcher, name);
    unlinkSync(layout.transaction);
    cleanupPreparedCandidate(record);
  } catch (error) {
    const original = error instanceof Error ? error.message : String(error);
    try {
      instanceGit(["-C", layout.core, "checkout", "--detach", from.core]);
      instanceGit(["-C", layout.skills, "checkout", "--detach", from.skills]);
      ensureCleanManagedCheckout(layout.core, metadata.source.core, from.core, "restored Core");
      ensureCleanManagedCheckout(layout.skills, metadata.source.skills, from.skills, "restored Skills");
      writeInstanceMetadata(layout.metadata, metadata);
      materializeInstanceControlSurface(name, layout);
      postActivate(layout.launcher, name);
      unlinkSync(layout.transaction);
      throw new CommandError(`${action} failed after switch and was rolled back to the previous commits: ${original}`);
    } catch (rollbackError) {
      if (rollbackError instanceof CommandError && rollbackError.message.startsWith(`${action} failed after switch and was rolled back`)) throw rollbackError;
      transaction.status = "rollback-failed";
      transaction.error = `${original}; rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
      atomicWrite(layout.transaction, `${JSON.stringify(transaction)}\n`, 0o600);
      throw new CommandError(`${action} failed and automatic rollback is incomplete; inspect ${layout.transaction}: ${transaction.error}`);
    }
  }
}

export function updateInstanceCommand(
  args: JsonObject,
  name: string,
  _profile: JsonObject,
  overrides: InstanceCommandOverrides = {},
): void {
  const interactive = overrides.interactive ?? Boolean(process.stdin.isTTY);
  requireHumanInstanceReview("update", interactive);
  const { layout, metadata, sources } = operationInstance(name, overrides);
  if (readInstanceTransaction(layout.transaction)) {
    throw new CommandError(`an incomplete instance transaction exists at ${layout.transaction}; automatic commands are intentionally blocked until the managed checkouts and metadata are manually inspected and repaired`);
  }

  if (!args.yes) {
    const record = withLock(join(layout.control, ".instance-lifecycle.lock"), () => {
      const locked = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
      const candidate = remoteInstanceCommits(sources);
      if (deepEqual(candidate, locked.current)) return null;
      const registry = loadProjectRegistry(name, true);
      return prepareInstanceCandidate(name, layout.root, locked.current, sources, candidate, registry.registry_digest, overrides);
    });
    if (!record) {
      console.log(`Hanchou instance is current: Core ${metadata.current.core}, Skills ${metadata.current.skills}`);
      return;
    }
    printInstancePlan(record);
    return;
  }

  const token = requireHumanInstanceApply("update", args, interactive);
  const record = trustedPlanRecord(expectedCandidateRecordPath(join(layout.control, "candidates"), token));
  if (record.operation !== "update" || record.profile !== name || record.instance_root !== layout.root || record.token !== token) throw new CommandError("update plan does not match this instance");
  if (!deepEqual(record.sources, sources) || !deepEqual(record.current, metadata.current)) throw new CommandError("update plan is stale because instance state changed");
  const registry = loadProjectRegistry(name, true);
  if (record.registry_digest !== registry.registry_digest) throw new CommandError("update plan is stale because the project registry changed");
  validatePreparedCandidate(record, overrides, false);

  withLock(join(layout.control, ".instance-lifecycle.lock"), () => {
    const locked = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
    if (!deepEqual(locked.current, record.current)) throw new CommandError("update plan is stale because managed commits changed after review");
    if (readInstanceTransaction(layout.transaction)) throw new CommandError("another instance transaction is incomplete");
    const lockedRegistry = loadProjectRegistry(name, true);
    if (record.registry_digest !== lockedRegistry.registry_digest) throw new CommandError("update plan is stale because the project registry changed after review");
    validatePreparedCandidate(record, overrides);
    const rechecked = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
    if (!deepEqual(rechecked, locked)) throw new CommandError("managed instance state changed while the update candidate was being validated");
    const recheckedRegistry = loadProjectRegistry(name, true);
    if (record.registry_digest !== recheckedRegistry.registry_digest) throw new CommandError("project registry changed while the update candidate was being validated");
    switchInstance("update", name, layout, rechecked, record, overrides);
  });
  console.log(`Hanchou instance updated: Core ${record.candidate.core}, Skills ${record.candidate.skills}`);
  console.log("Hanchou did not issue an Orchestrator workspace stop. Bootstrap may reload changed services; restart L0 explicitly to load changed role instructions.");
}

function prepareLocalInstanceCandidate(
  name: string,
  layout: Record<string, string>,
  metadata: InstanceMetadata,
  target: InstanceCommits,
  registryDigest: string | null,
  overrides: InstanceCommandOverrides,
): JsonObject {
  const cacheParent = join(layout.control, "candidates");
  ensurePrivateDirectoryChain(cacheParent, "instance candidate cache");
  const temporary = mkdtempSync(join(cacheParent, ".preparing-"));
  try {
    for (const [managed, source, commit, destination] of [
      [layout.core, metadata.source.core, target.core, join(temporary, "hanchou")],
      [layout.skills, metadata.source.skills, target.skills, join(temporary, "hanchou-skills")],
    ] as Array<[string, string, string, string]>) {
      mkdirSync(destination, { mode: 0o700 });
      instanceGit(["-C", destination, "init"]);
      instanceGit(["-C", destination, "remote", "add", "origin", source]);
      fetchExactCommitWithoutFetchHead(destination, managed, commit, "rollback candidate");
      instanceGit(["-C", destination, "checkout", "--detach", commit]);
      ensureCleanManagedCheckout(destination, source, commit, "rollback candidate");
    }
    validateCandidateInDisposableClones(
      join(temporary, "hanchou"),
      join(temporary, "hanchou-skills"),
      metadata.source,
      target,
      overrides,
    );
    ensureCleanManagedCheckout(join(temporary, "hanchou"), metadata.source.core, target.core, "rollback candidate Core");
    ensureCleanManagedCheckout(join(temporary, "hanchou-skills"), metadata.source.skills, target.skills, "rollback candidate Skills");
    const body: JsonObject = {
      schema: "hanchou.instance-plan.v1",
      operation: "rollback",
      profile: name,
      instance_root: layout.root,
      sources: metadata.source,
      current: metadata.current,
      candidate: target,
      versions: { core: readVersion(join(temporary, "hanchou")), skills: readVersion(join(temporary, "hanchou-skills")) },
      registry_digest: registryDigest,
    };
    const token = instancePlanToken(body);
    const destination = join(cacheParent, token);
    if (lexists(destination)) {
      rmSync(temporary, { recursive: true, force: true });
      const existing = trustedPlanRecord(join(destination, "plan.json"));
      const existingBody = { ...existing };
      delete existingBody.token;
      delete existingBody.candidate_path;
      delete existingBody.prepared_at;
      if (!deepEqual(existingBody, body)) throw new CommandError(`instance rollback plan token collision at ${destination}`);
      validatePreparedCandidate(existing, overrides, false);
      return existing;
    }
    durableRename(temporary, destination);
    const record = { ...body, token, candidate_path: destination, prepared_at: utcnow() };
    atomicWrite(join(destination, "plan.json"), `${JSON.stringify(record)}\n`, 0o600);
    return record;
  } catch (error) {
    if (lexists(temporary)) rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function rollbackInstanceCommand(
  args: JsonObject,
  name: string,
  _profile: JsonObject,
  overrides: InstanceCommandOverrides = {},
): void {
  const interactive = overrides.interactive ?? Boolean(process.stdin.isTTY);
  requireHumanInstanceReview("rollback", interactive);
  const { layout, metadata, sources } = operationInstance(name, overrides);
  const incomplete = readInstanceTransaction(layout.transaction);
  if (incomplete) {
    throw new CommandError(`automatic recovery is incomplete at ${layout.transaction}; managed checkout state must be inspected before a reviewed rollback can be prepared`);
  }
  if (!metadata.previous) throw new CommandError("no previous validated Hanchou release is available to roll back to");

  if (!args.yes) {
    const record = withLock(join(layout.control, ".instance-lifecycle.lock"), () => {
      const locked = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
      if (!locked.previous) throw new CommandError("no previous validated Hanchou release is available to roll back to");
      const registry = loadProjectRegistry(name, true);
      return prepareLocalInstanceCandidate(name, layout, locked, locked.previous, registry.registry_digest, overrides);
    });
    printInstancePlan(record);
    return;
  }

  const token = requireHumanInstanceApply("rollback", args, interactive);
  const record = trustedPlanRecord(expectedCandidateRecordPath(join(layout.control, "candidates"), token));
  if (record.operation !== "rollback" || record.profile !== name || record.instance_root !== layout.root || record.token !== token) throw new CommandError("rollback plan does not match this instance");
  if (!deepEqual(record.sources, sources) || !deepEqual(record.current, metadata.current) || !deepEqual(record.candidate, metadata.previous)) {
    throw new CommandError("rollback plan is stale because current/previous instance state changed");
  }
  const registry = loadProjectRegistry(name, true);
  if (record.registry_digest !== registry.registry_digest) throw new CommandError("rollback plan is stale because the project registry changed");
  validatePreparedCandidate(record, overrides, false);

  withLock(join(layout.control, ".instance-lifecycle.lock"), () => {
    const locked = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
    if (!deepEqual(locked.current, record.current) || !deepEqual(locked.previous, record.candidate)) throw new CommandError("rollback plan is stale because commits changed after review");
    if (readInstanceTransaction(layout.transaction)) throw new CommandError("another instance transaction is incomplete");
    const lockedRegistry = loadProjectRegistry(name, true);
    if (record.registry_digest !== lockedRegistry.registry_digest) throw new CommandError("rollback plan is stale because the project registry changed after review");
    validatePreparedCandidate(record, overrides);
    const rechecked = trustedInstanceMetadata(name, layout.root, true, sources) as InstanceMetadata;
    if (!deepEqual(rechecked, locked)) throw new CommandError("managed instance state changed while the rollback candidate was being validated");
    const recheckedRegistry = loadProjectRegistry(name, true);
    if (record.registry_digest !== recheckedRegistry.registry_digest) throw new CommandError("project registry changed while the rollback candidate was being validated");
    switchInstance("rollback", name, layout, rechecked, record, overrides);
  });
  console.log(`Hanchou instance rolled back: Core ${record.candidate.core}, Skills ${record.candidate.skills}`);
  console.log("Hanchou did not issue an Orchestrator workspace stop. Bootstrap may reload changed services; restart L0 explicitly to load restored role instructions.");
}

function validateAuthorityComponent(path: string, label: string, requireFile: boolean): void {
  let info;
  try { info = lstatSync(path); }
  catch (error) { throw new CommandError(`cannot inspect ${label} ${path}: ${error}`); }
  validateAuthorityMetadata(info, path, label, requireFile);
}

function validateAuthorityMetadata(info: Stats, path: string, label: string, requireFile: boolean): void {
  if (info.isSymbolicLink() || (requireFile ? !info.isFile() : !info.isDirectory())) {
    throw new CommandError(`${label} must be a regular non-symlink ${requireFile ? "file" : "directory"}: ${path}`);
  }
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new CommandError(`${label} must be owned by the effective OS user: ${path}`);
  }
  if ((info.mode & 0o022) !== 0) {
    throw new CommandError(`${label} must not be group/world writable: ${path}`);
  }
}

function validateAuthorityDirectoryChain(path: string, label: string): void {
  const home = operatorHome();
  if (!pathWithin(home, path, true)) throw new CommandError(`${label} must be below the operator HOME: ${path}`);
  let component = home;
  validateAuthorityComponent(component, label, false);
  for (const part of relative(home, path).split(/[\\/]+/).filter(Boolean)) {
    component = join(component, part);
    validateAuthorityComponent(component, label, false);
  }
}

function validateAuthorityPath(path: string): void {
  const home = operatorHome();
  const configHome = join(home, ".config");
  const hanchouHome = join(configHome, "hanchou");
  const profileHome = dirname(path);
  for (const [candidate, label] of [
    [configHome, "operator config directory"],
    [hanchouHome, "Hanchou config directory"],
    [profileHome, "Hanchou profile config directory"],
  ] as Array<[string, string]>) {
    if (existsSync(candidate)) validateAuthorityComponent(candidate, label, false);
  }
  validateAuthorityComponent(path, "project registry", true);
}

function readProjectRegistrySnapshot(path: string): { source: string; raw: JsonObject } {
  validateAuthorityPath(path);
  let descriptor: number;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    throw new CommandError(`cannot securely open project registry ${path}: ${error}`);
  }
  try {
    validateAuthorityMetadata(fstatSync(descriptor), path, "project registry", true);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(descriptor));
    let raw: JsonObject;
    try { raw = parseToml(source) as JsonObject; }
    catch (error) { throw new CommandError(`cannot read TOML ${path}: ${error}`); }
    return { source, raw };
  } finally {
    closeSync(descriptor);
  }
}

function validateStringArray(value: unknown, label: string, allowed: Set<string> | null = null): string[] {
  if (!Array.isArray(value) || !value.length || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw new CommandError(`${label} must be a non-empty string array`);
  }
  const rows = value.map(String);
  if (new Set(rows).size !== rows.length) throw new CommandError(`${label} contains duplicate values`);
  if (allowed) {
    const unsupported = rows.filter((item) => !allowed.has(item));
    if (unsupported.length) throw new CommandError(`${label} contains unsupported values: ${unsupported.join(", ")}`);
  }
  return rows;
}

function registryCanonicalPath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CommandError(`${label} must be a non-empty path without control characters`);
  }
  if (value.includes("$")) throw new CommandError(`${label} must not contain environment-variable expansion`);
  const home = operatorHome();
  const rendered = value === "~" ? home : value.startsWith("~/") ? join(home, value.slice(2)) : value;
  if (!isAbsolute(rendered)) throw new CommandError(`${label} must be absolute or start with ~/`);
  const lexical = resolve(rendered);
  if (!isDirectory(lexical)) throw new CommandError(`${label} directory not found: ${lexical}`);
  const canonical = realpathSync(lexical);
  if (canonical !== lexical) throw new CommandError(`${label} must not contain symlink components: ${lexical} resolves to ${canonical}`);
  return canonical;
}

function validateAuthorizedDirectory(canonical: string, label: string): void {
  const home = operatorHome();
  if (pathWithin(canonical, home, true)) {
    throw new CommandError(`${label} must not be filesystem root, HOME, or an ancestor of HOME: ${canonical}`);
  }
  validateAuthorityComponent(canonical, label, false);
}

function pathWithin(root: string, target: string, allowEqual = false): boolean {
  const suffix = relative(root, target);
  if (!suffix) return allowEqual;
  return !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

function encodedRelativeProjectPath(root: string, repository: string): string {
  return relative(root, repository).split(/[\\/]+/).map((part) => encodeURIComponent(part)).join("/");
}

function dynamicRootProjectId(root: WorkspaceRootEntry, repository: string): string {
  return `root:${root.id}/${encodedRelativeProjectPath(root.canonical_path, repository)}`;
}

function validateRegistryId(value: unknown, label: string): string {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) {
    throw new CommandError(`${label} must match ${PROJECT_ID_PATTERN.source}`);
  }
  return value;
}

function loadProjectRegistry(name: string, allowMissing = true): ProjectRegistry {
  const path = projectRegistryPath(name);
  if (!existsSync(path)) {
    if (!allowMissing) {
      throw new CommandError(`project registry not found for profile ${name}: ${path}; new dispatch is denied until a human creates this file`);
    }
    return { schema_version: 1, default_policy: "deny", registry_path: path, registry_digest: null, projects: [], workspace_roots: [] };
  }
  const { source, raw } = readProjectRegistrySnapshot(path);
  const allowedTopLevel = new Set(["schema_version", "default_policy", "projects", "workspace_roots"]);
  const unknownTopLevel = Object.keys(raw).filter((key) => !allowedTopLevel.has(key));
  if (unknownTopLevel.length) throw new CommandError(`project registry has unsupported top-level keys: ${unknownTopLevel.join(", ")}`);
  if (raw.schema_version !== 1) throw new CommandError("project registry schema_version must be 1");
  if (raw.default_policy !== "deny") throw new CommandError('project registry default_policy must be "deny"');
  const projectRows = raw.projects ?? [];
  const rootRows = raw.workspace_roots ?? [];
  if (!Array.isArray(projectRows)) throw new CommandError("project registry projects must be an array of tables");
  if (!Array.isArray(rootRows)) throw new CommandError("project registry workspace_roots must be an array of tables");

  const projects: ProjectEntry[] = projectRows.map((row: any, index: number) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new CommandError(`projects[${index}] must be a table`);
    const allowedKeys = new Set(["id", "path", "allowed_profiles", "default_leaf_role", "default_leaf_kind", "labels"]);
    const unknown = Object.keys(row).filter((key) => !allowedKeys.has(key));
    if (unknown.length) throw new CommandError(`projects[${index}] has unsupported keys: ${unknown.join(", ")}`);
    const canonical = registryCanonicalPath(row.path, `projects[${index}].path`);
    validateAuthorizedDirectory(canonical, `projects[${index}].path`);
    const entry: ProjectEntry = {
      id: validateRegistryId(row.id, `projects[${index}].id`),
      path: String(row.path ?? ""),
      canonical_path: canonical,
      allowed_profiles: validateStringArray(row.allowed_profiles, `projects[${index}].allowed_profiles`, VALID_PROFILES),
    };
    if (row.default_leaf_role !== undefined) {
      if (typeof row.default_leaf_role !== "string" || !new Set(["researcher", "implementer", "reviewer", "writer", "editor"]).has(row.default_leaf_role)) {
        throw new CommandError(`projects[${index}].default_leaf_role must be a supported Leaf role`);
      }
      entry.default_leaf_role = row.default_leaf_role;
    }
    if (row.default_leaf_kind !== undefined) {
      if (typeof row.default_leaf_kind !== "string" || !new Set(["codex", "claude"]).has(row.default_leaf_kind)) throw new CommandError(`projects[${index}].default_leaf_kind must be codex or claude`);
      entry.default_leaf_kind = row.default_leaf_kind;
    }
    if (row.labels !== undefined) entry.labels = validateStringArray(row.labels, `projects[${index}].labels`);
    return entry;
  });

  const workspaceRoots: WorkspaceRootEntry[] = rootRows.map((row: any, index: number) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new CommandError(`workspace_roots[${index}] must be a table`);
    const allowedKeys = new Set(["id", "path", "allowed_profiles", "trust"]);
    const unknown = Object.keys(row).filter((key) => !allowedKeys.has(key));
    if (unknown.length) throw new CommandError(`workspace_roots[${index}] has unsupported keys: ${unknown.join(", ")}`);
    const canonical = registryCanonicalPath(row.path, `workspace_roots[${index}].path`);
    validateAuthorizedDirectory(canonical, `workspace_roots[${index}].path`);
    if (row.trust !== "descendant-git-repositories") throw new CommandError(`workspace_roots[${index}].trust must be descendant-git-repositories`);
    return {
      id: validateRegistryId(row.id, `workspace_roots[${index}].id`),
      path: String(row.path),
      canonical_path: canonical,
      allowed_profiles: validateStringArray(row.allowed_profiles, `workspace_roots[${index}].allowed_profiles`, VALID_PROFILES),
      trust: "descendant-git-repositories",
    };
  });

  const duplicate = (values: string[]): string | null => {
    const seen = new Set<string>();
    for (const value of values) { if (seen.has(value)) return value; seen.add(value); }
    return null;
  };
  const duplicateProjectId = duplicate(projects.map((item) => item.id));
  if (duplicateProjectId) throw new CommandError(`project registry contains duplicate project id: ${duplicateProjectId}`);
  const duplicateProjectPath = duplicate(projects.map((item) => item.canonical_path));
  if (duplicateProjectPath) throw new CommandError(`project registry contains duplicate project path: ${duplicateProjectPath}`);
  const duplicateAuthorityId = duplicate([...projects.map((item) => item.id), ...workspaceRoots.map((item) => item.id)]);
  if (duplicateAuthorityId) throw new CommandError(`project registry contains duplicate project/workspace-root id: ${duplicateAuthorityId}`);
  for (let left = 0; left < workspaceRoots.length; left += 1) {
    for (let right = left + 1; right < workspaceRoots.length; right += 1) {
      const first = workspaceRoots[left] as WorkspaceRootEntry;
      const second = workspaceRoots[right] as WorkspaceRootEntry;
      if (pathWithin(first.canonical_path, second.canonical_path, true) || pathWithin(second.canonical_path, first.canonical_path, true)) {
        throw new CommandError(`workspace roots must not overlap: ${first.id} (${first.canonical_path}) and ${second.id} (${second.canonical_path})`);
      }
    }
  }
  return {
    schema_version: 1,
    default_policy: "deny",
    registry_path: path,
    registry_digest: createHash("sha256").update(source).digest("hex"),
    projects,
    workspace_roots: workspaceRoots,
  };
}

function resolveCandidateRepository(repoValue: string): string {
  if (typeof repoValue !== "string" || !repoValue || /[\u0000-\u001f\u007f]/.test(repoValue)) throw new CommandError("repo_path must be a non-empty path without control characters");
  if (repoValue.includes("$") || !isAbsolute(repoValue)) throw new CommandError("repo_path must be an absolute path without environment-variable expansion");
  const lexical = resolve(repoValue);
  if (!isDirectory(lexical)) throw new CommandError(`repository directory not found: ${lexical}`);
  const canonical = realpathSync(lexical);
  if (canonical !== lexical) throw new CommandError(`repo_path must not contain symlink components: ${lexical} resolves to ${canonical}`);
  return canonical;
}

function authorizeProjectRepository(name: string, projectId: string | null, repoValue: string): ProjectAuthorization {
  const registry = loadProjectRegistry(name, false);
  const repository = resolveCandidateRepository(repoValue);
  validateAuthorizedDirectory(repository, "repository");
  const explicit = registry.projects.find((item) => item.canonical_path === repository);
  let sourceKind: "project" | "workspace_root";
  let sourceId: string;
  let resolvedProject: string;
  let workspaceRoot: string | null = null;
  if (explicit) {
    if (!explicit.allowed_profiles.includes(name)) throw new CommandError(`project "${explicit.id}" is not allowed for profile "${name}"`);
    if (projectId !== null && projectId !== explicit.id) {
      throw new CommandError(`repo_path is registered as project "${explicit.id}", but Bead metadata.project is "${projectId}"`);
    }
    sourceKind = "project"; sourceId = explicit.id; resolvedProject = explicit.id;
  } else {
    const root = registry.workspace_roots.find((item) => item.allowed_profiles.includes(name) && pathWithin(item.canonical_path, repository));
    if (!root) throw new CommandError(`repository is not authorized for profile "${name}": ${repository}; a human must edit ${registry.registry_path}`);
    const expected = dynamicRootProjectId(root, repository);
    if (projectId !== null && projectId !== expected) {
      throw new CommandError(`repo_path is authorized by workspace root "${root.id}", but metadata.project must be "${expected}"`);
    }
    sourceKind = "workspace_root"; sourceId = root.id; resolvedProject = expected; workspaceRoot = root.canonical_path;
  }
  return {
    schema: "hanchou.project-authorization.v1",
    profile: name,
    project: resolvedProject,
    repo_path: repository,
    source_kind: sourceKind,
    source_id: sourceId,
    workspace_root: workspaceRoot,
    registry_path: registry.registry_path,
    registry_digest: registry.registry_digest as string,
  };
}

function miseTools(): Record<string, string> {
  if (!existsSync(MISE_CONFIG)) throw new CommandError(`mise config not found: ${MISE_CONFIG}`);
  const tools = loadToml(MISE_CONFIG).tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) throw new CommandError(`invalid [tools] table: ${MISE_CONFIG}`);
  return Object.fromEntries(Object.entries(tools).map(([key, value]) => [String(key), String(value)]));
}

function profileEnv(name: string, profile: JsonObject): NodeJS.ProcessEnv {
  const paths = profilePaths(profile);
  const inherited = { ...process.env };
  const home = operatorHome();
  const gitPathOverrides = new Set([
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_CONFIG",
    "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_COUNT", "GIT_EXEC_PATH",
  ]);
  for (const key of Object.keys(inherited)) {
    if (gitPathOverrides.has(key) || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key) || key === "NODE_OPTIONS" || key === "NODE_PATH") delete inherited[key];
  }
  inherited.HOME = home;
  inherited.XDG_CONFIG_HOME = join(home, ".config");
  inherited.XDG_DATA_HOME = join(home, ".local", "share");
  inherited.XDG_CACHE_HOME = join(home, ".cache");
  inherited.MISE_DATA_DIR = join(home, ".local", "share", "mise");
  inherited.MISE_INSTALLS_DIR = join(home, ".local", "share", "mise", "installs");
  try {
    inherited.PATH = `${dirname(pinnedMiseToolPath("node"))}:${inherited.PATH ?? trustedSearchPath()}`;
  } catch {
    // bootstrap installs the pinned runtime before any managed npm/npx command;
    // doctor reports the missing runtime without hiding the rest of its checks.
  }
  const instance = configuredInstance(name, false);
  const instanceEnvironment: NodeJS.ProcessEnv = instance ? {
    HANCHOU_INSTANCE_ROOT: instance.layout.root,
    HANCHOU_INSTANCE_PROFILE: name,
    HANCHOU_INSTANCE_LAUNCHER: instance.layout.launcher,
  } : {};
  return {
    ...inherited,
    ...instanceEnvironment,
    HANCHOU_PROFILE: name,
    HANCHOU_HOME: paths.root,
    HANCHOU_CONFIG_HOME: join(home, ".config", "hanchou", name),
    HANCHOU_CONFIG_ROOT: CONFIG_ROOT,
    HANCHOU_REPO_ROOT: ROOT,
    HANCHOU_CORE_ROOT: ROOT,
    HANCHOU_WORKSPACE_ROOT: instance?.layout.root ?? ROOT,
    HANCHOU_BEADS_DIR: paths.beads_dir,
    HANCHOU_RELAY_DIR: paths.relay_dir,
    BEADS_DIR: paths.beads_dir,
    BD_AGENT_PROFILE: profile.beads?.agent_profile ?? "conservative",
  };
}

function nudgeText(agent: string): string {
  return `[HANCHOU_RELAY] Durable Inbox events are pending for \`${agent}\`. Run \`hanchou inbox claim --to ${agent} --json\`, read each full event, apply the durable action, then \`hanchou inbox ack <event-id> --by ${agent}\`. Do not infer completion from this nudge alone.`;
}

/**
 * Codex 0.151 can execute shell tools through a persistent app-server whose
 * base environment is not the environment of the Herdr pane that launched the
 * TUI. Pass only Hanchou's non-secret control-plane context as per-run config
 * so shell tools retain the pane identity without globally claiming that every
 * Codex session runs inside Herdr.
 */
export function codexManagedEnvironmentArgs(
  name: string,
  profile: JsonObject,
  agentId: string,
  paneId: string,
  workspaceId: string,
  tabId: string,
): string[] {
  const profileEnvironment = profileEnv(name, profile);
  const sessionDirectory = join(operatorHome(), ".config", "herdr", "sessions", name);
  const values: Record<string, string> = {
    HERDR_ENV: "1",
    HERDR_SESSION: name,
    HERDR_SOCKET_PATH: join(sessionDirectory, "herdr.sock"),
    HERDR_BIN_PATH: commandPath("herdr"),
    HERDR_PANE_ID: paneId,
    HANCHOU_AGENT_ID: validateAgentId(agentId, "managed Agent ID"),
  };
  values.HERDR_WORKSPACE_ID = workspaceId;
  values.HERDR_TAB_ID = tabId;
  for (const key of [
    "HANCHOU_PROFILE", "HANCHOU_HOME", "HANCHOU_CONFIG_HOME", "HANCHOU_CONFIG_ROOT",
    "HANCHOU_REPO_ROOT", "HANCHOU_CORE_ROOT", "HANCHOU_WORKSPACE_ROOT", "HANCHOU_INSTANCE_ROOT",
    "HANCHOU_INSTANCE_PROFILE", "HANCHOU_INSTANCE_LAUNCHER", "HANCHOU_BEADS_DIR", "HANCHOU_RELAY_DIR", "BEADS_DIR",
    "BD_AGENT_PROFILE",
  ]) {
    const value = profileEnvironment[key];
    if (value !== undefined) values[key] = value;
  }
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).flatMap(([key, value]) => [
    "-c",
    `shell_environment_policy.set.${key}=${JSON.stringify(value)}`,
  ]);
}

/**
 * Permit only the selected Herdr control socket for managed Codex commands.
 * Command networking must be enabled for AF_UNIX access, so start Codex's
 * network proxy and replace any inherited domain rules with an empty policy.
 * Without the proxy, enabled command networking is direct and domain policy is
 * not enforced.
 */
export function codexManagedNetworkArgs(name: string): string[] {
  const socketPath = join(operatorHome(), ".config", "herdr", "sessions", name, "herdr.sock");
  return [
    "-c", "sandbox_workspace_write.network_access=true",
    "-c", "features.network_proxy.enabled=true",
    "-c", "features.network_proxy.domains={}",
    "-c", "features.network_proxy.allow_local_binding=false",
    "-c", "features.network_proxy.allow_upstream_proxy=false",
    "-c", "features.network_proxy.dangerously_allow_all_unix_sockets=false",
    "-c", "features.network_proxy.dangerously_allow_non_loopback_proxy=false",
    "-c", "features.network_proxy.enable_socks5=false",
    "-c", "features.network_proxy.enable_socks5_udp=false",
    "-c", `features.network_proxy.unix_sockets={${JSON.stringify(socketPath)}="allow"}`,
  ];
}

function herdrArgv(name: string, ...args: string[]): string[] {
  return [commandPath("herdr"), "--session", name, ...args];
}

function atomicWrite(path: string, text: string, mode = 0o600): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}`);
  const fd = openSync(temporary, "wx", mode);
  try {
    writeFileSync(fd, text, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(temporary, mode);
  try { renameSync(temporary, path); }
  catch (error) {
    try { unlinkSync(temporary); } catch { /* already removed */ }
    throw error;
  }
  try {
    const directoryFd = openSync(dirname(path), "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch { /* directory fsync is unavailable on some platforms */ }
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function durableRename(source: string, destination: string): void {
  renameSync(source, destination);
  const sourceDirectory = dirname(source);
  const destinationDirectory = dirname(destination);
  fsyncDirectory(destinationDirectory);
  if (sourceDirectory !== destinationDirectory) fsyncDirectory(sourceDirectory);
}

function backupAndWrite(path: string, text: string): boolean {
  const current = existsSync(path) ? readText(path) : null;
  if (current === text) return false;
  if (existsSync(path)) {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const backup = join(dirname(path), `${basename(path)}.bak.${stamp}`);
    copyFileSync(path, backup);
    console.log(`backup: ${backup}`);
  }
  atomicWrite(path, text, 0o600);
  return true;
}

function ensureState(name: string, profile: JsonObject): void {
  const paths = profilePaths(profile);
  for (const key of ["root", "control_dir", "worktree_dir", "report_dir", "relay_dir"]) mkdirSync(paths[key], { recursive: true });
  for (const part of [
    "inbox/pending", "inbox/processing", "inbox/acknowledged", "inbox/dead-letter",
    "deliveries/pending", "deliveries/rendered", "deliveries/delivered", "deliveries/failed",
    "receipts", "payloads", "locks",
  ]) {
    const target = safeRelayDirectory(paths.relay_dir, ...part.split("/"));
    mkdirSync(target, { recursive: true });
    safeRelayDirectory(paths.relay_dir, ...part.split("/"));
  }
  const configHome = join(operatorHome(), ".config", "hanchou", name);
  mkdirSync(join(configHome, "generated"), { recursive: true });
  const target = join(configHome, "skills.toml");
  if (!existsSync(target)) {
    const configured = profile.skills?.sources_file;
    const candidates: string[] = [];
    if (configured) candidates.push(isAbsolute(configured) ? configured : join(CONFIG_ROOT, configured));
    candidates.push(join(CONFIG_ROOT, "skills", "sources.toml"), join(CONFIG_ROOT, "skills", "sources.example.toml"), join(DEFAULT_CONFIG_ROOT, "skills", "sources.example.toml"));
    const source = candidates.find(existsSync);
    if (!source) throw new CommandError("no skills source template found");
    copyFileSync(source, target);
  }
}

function sortedJson(value: any): any {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedJson(value[key])]));
  return value;
}

function pyCompact(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pyCompact).join(", ")}]`;
  return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pyCompact(item)}`).join(", ")}}`;
}

function jsonPrint(value: any, pretty = false): void {
  console.log(pretty ? JSON.stringify(value, null, 2) : pyCompact(value));
}

function validateIdentifier(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new CommandError(`invalid ${label}: expected ${pattern.source}`);
  }
  return value;
}

function validateEventId(value: unknown): string {
  return validateIdentifier(value, EVENT_ID_PATTERN, "event ID");
}

function validateDeliveryId(value: unknown): string {
  return validateIdentifier(value, DELIVERY_ID_PATTERN, "delivery ID");
}

function validateAgentId(value: unknown, label = "agent ID"): string {
  return validateIdentifier(value, AGENT_ID_PATTERN, label);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function requireManagedAgentIdentity(requested: string, operation: string): void {
  const configured = process.env.HANCHOU_AGENT_ID;
  if (!configured) throw new CommandError(`${operation} requires HANCHOU_AGENT_ID from a Hanchou-managed Agent`);
  const current = validateAgentId(configured, "managed Agent identity");
  if (requested !== current) throw new CommandError(`${operation} target ${requested} does not match managed Agent identity ${current}`);
}

function safeRelayDirectory(root: string, ...segments: string[]): string {
  let current = resolve(root);
  for (const segment of ["", ...segments]) {
    if (segment) current = join(current, segment);
    if (!lexists(current)) continue;
    const info = lstatSync(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new CommandError(`Relay path component must be a regular non-symlink directory: ${current}`);
  }
  return current;
}

function readJsonFile(path: string, label: string): JsonObject {
  let info;
  try { info = lstatSync(path); }
  catch (error) { throw new CommandError(`cannot inspect ${label} ${path}: ${error}`); }
  if (info.isSymbolicLink() || !info.isFile()) throw new CommandError(`${label} must be a regular non-symlink file: ${path}`);
  let fd: number | null = null;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) throw new Error("record is no longer a regular file");
    const value = JSON.parse(readFileSync(fd, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("top-level JSON value must be an object");
    return value;
  } catch (error) { throw new CommandError(`cannot read ${label} ${path}: ${error}`); }
  finally { if (fd !== null) closeSync(fd); }
}

function listJsonFiles(directory: string): Array<[string, JsonObject]> {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(directory, name))
    .map((path) => {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || !info.isFile()) throw new CommandError(`JSON record must be a regular non-symlink file: ${path}`);
      return { path, mtimeMs: info.mtimeMs };
    })
    .sort((left, right) => left.mtimeMs - right.mtimeMs)
    .map(({ path }) => [path, readJsonFile(path, "JSON record")] as [string, JsonObject]);
}

function userCodexRulePaths(): string[] {
  const root = join(expand(process.env.CODEX_HOME ?? "~/.codex"), "rules");
  return codexRulePaths(root);
}

export function codexRulePaths(root: string): string[] {
  if (!existsSync(root)) return [];
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return visit(path);
    return entry.isFile() && entry.name.endsWith(".rules") ? [path] : [];
  });
  return visit(root).sort();
}

export function codexPolicyRulePaths(
  userRoot = join(expand(process.env.CODEX_HOME ?? "~/.codex"), "rules"),
  projectRoot = join(process.env.HANCHOU_WORKSPACE_ROOT ?? ROOT, ".codex", "rules"),
): string[] {
  return [...new Set([...codexRulePaths(userRoot), ...codexRulePaths(projectRoot)])];
}

function broadUserInboxRulePaths(): string[] {
  const broadPattern = /^\[\s*["']hanchou["']\s*,\s*["']inbox["']\s*,?\s*\]$/;
  return userCodexRulePaths().filter((rulesPath) => {
    const source = stripRuleComments(readText(rulesPath));
    for (const body of ruleCallBodies(source, "prefix_rule")) {
      const fields = ruleKeywordArguments(body);
      const decisionSource = fields.get("decision");
      const decision = decisionSource?.match(/^(["'])([^"']+)\1$/)?.[2] ?? "allow";
      if (broadPattern.test(fields.get("pattern") ?? "") && decision === "allow") return true;
    }
    return false;
  });
}

function stripRuleComments(source: string): string {
  let result = "";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") { quote = character; result += character; continue; }
    if (character === "#") {
      while (index + 1 < source.length && source[index + 1] !== "\n") index += 1;
      continue;
    }
    result += character;
  }
  return result;
}

function ruleCallBodies(source: string, callName: string): string[] {
  const bodies: string[] = [];
  for (let index = 0; index < source.length;) {
    const found = source.indexOf(callName, index);
    if (found < 0) break;
    const before = source[found - 1] ?? "";
    const after = source[found + callName.length] ?? "";
    if (/[_A-Za-z0-9]/.test(before) || /[_A-Za-z0-9]/.test(after)) { index = found + callName.length; continue; }
    let open = found + callName.length;
    while (/\s/.test(source[open] ?? "")) open += 1;
    if (source[open] !== "(") { index = open; continue; }
    let depth = 1;
    let quote = "";
    let escaped = false;
    for (let cursor = open + 1; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      if (depth === 0) {
        bodies.push(source.slice(open + 1, cursor));
        index = cursor + 1;
        break;
      }
    }
    if (depth !== 0) break;
  }
  return bodies;
}

function ruleKeywordArguments(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (let index = 0; index < body.length;) {
    while (index < body.length && /[\s,]/.test(body[index])) index += 1;
    const nameMatch = /^[_A-Za-z][_A-Za-z0-9]*/.exec(body.slice(index));
    if (!nameMatch) { index += 1; continue; }
    const name = nameMatch[0];
    index += name.length;
    while (/\s/.test(body[index] ?? "")) index += 1;
    if (body[index] !== "=") { while (index < body.length && body[index] !== ",") index += 1; continue; }
    index += 1;
    while (/\s/.test(body[index] ?? "")) index += 1;
    const start = index;
    let quote = "";
    let escaped = false;
    let nested = 0;
    while (index < body.length) {
      const character = body[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
      } else if (character === '"' || character === "'") quote = character;
      else if (["(", "[", "{"].includes(character)) nested += 1;
      else if (")]}".includes(character)) nested -= 1;
      else if (character === "," && nested === 0) break;
      index += 1;
    }
    fields.set(name, body.slice(start, index).trim());
    if (body[index] === ",") index += 1;
  }
  return fields;
}

function withLock<T>(lockPath: string, operation: () => T, timeoutMs = 120_000): T {
  mkdirSync(dirname(lockPath), { recursive: true });
  const marker = openSync(lockPath, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  closeSync(marker);
  const heldPath = `${lockPath}.held`;
  const token = `${process.pid}:${randomBytes(16).toString("hex")}`;
  let fd: number | null = null;
  const deadline = Date.now() + timeoutMs;
  while (fd === null) {
    try {
      fd = openSync(heldPath, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid, token })}\n`);
      fsyncSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline) throw new CommandError(`timed out acquiring lock: ${lockPath}`);
      let reaper: number | null = null;
      try {
        reaper = openSync(`${heldPath}.reap`, "wx", 0o600);
        const held = lstatSync(heldPath);
        let owner: JsonObject | null = null;
        if (held.isSymbolicLink() || !held.isFile()) {
          unlinkSync(heldPath);
          continue;
        }
        try { owner = readJsonFile(heldPath, "lock owner"); } catch { /* incomplete owner record */ }
        let ownerAlive = true;
        if (owner && Number.isInteger(owner.pid)) {
          try { process.kill(owner.pid, 0); }
          catch (probeError) { ownerAlive = (probeError as NodeJS.ErrnoException).code !== "ESRCH"; }
        } else if (Date.now() - held.mtimeMs > 30_000) ownerAlive = false;
        if (!ownerAlive) unlinkSync(heldPath);
      } catch { /* another contender may be checking the same owner */ }
      finally {
        if (reaper !== null) {
          try { closeSync(reaper); } catch { /* already closed */ }
          try { unlinkSync(`${heldPath}.reap`); } catch { /* already removed */ }
        }
      }
      sleep(25);
    }
  }
  try { return operation(); }
  finally {
    try { closeSync(fd); } catch { /* already closed */ }
    try {
      const owner = readJsonFile(heldPath, "lock owner");
      if (owner.token === token) unlinkSync(heldPath);
    } catch { /* already removed or replaced */ }
  }
}

function renderHerdrConfig(name: string, profile: JsonObject): string {
  let templatePath = join(CONFIG_ROOT, "herdr", "config.toml.tmpl");
  if (!existsSync(templatePath)) templatePath = join(DEFAULT_CONFIG_ROOT, "herdr", "config.toml.tmpl");
  let template = readText(templatePath);
  const paths = profilePaths(profile);
  const replacements: Record<string, string> = {
    WORKTREE_DIR: paths.worktree_dir,
    HEADLESS_COLS: String(profile.herdr.headless_cols),
    HEADLESS_ROWS: String(profile.herdr.headless_rows),
    BEADS_UI_URL: `http://${profile.ui.beads_ui_host}:${profile.ui.beads_ui_port}`,
  };
  for (const [key, value] of Object.entries(replacements)) template = template.replaceAll(`{{${key}}}`, value);
  if (template.includes("{{")) throw new CommandError("unresolved Herdr config template placeholders");
  return template;
}

function renderLaunchd(name: string, profile: JsonObject, install: boolean): void {
  const argv = [commandPath("node"), join(ROOT, "scripts", "render-launchd.ts"), name];
  if (install) argv.push("--install");
  const env = profileEnv(name, profile);
  env.HANCHOU_PINNED_NODE_BIN = commandPath("node");
  env.HANCHOU_PINNED_HERDR_BIN = commandPath("herdr");
  run(argv, { env });
}

function renderAgents(check = false): void {
  const argv = [commandPath("node"), join(ROOT, "scripts", "render-agents.ts")];
  if (check) argv.push("--check");
  run(argv);
}

function usageSnapshotPath(profile: JsonObject): string {
  return profile.model_routing?.usage_snapshot ? expand(profile.model_routing.usage_snapshot) : join(profilePaths(profile).root, "usage.json");
}

function routingPolicyPath(profile: JsonObject): string {
  const configured = profile.model_routing?.policy_file ?? "model-routing.toml";
  const candidates = [isAbsolute(configured) ? configured : join(CONFIG_ROOT, configured), isAbsolute(configured) ? configured : join(DEFAULT_CONFIG_ROOT, configured)];
  const path = candidates.find(existsSync);
  if (!path) throw new CommandError(`model routing policy not found: ${configured}`);
  return path;
}

function loadRoutingPolicy(profile: JsonObject): JsonObject { return loadToml(routingPolicyPath(profile)); }

function emptyUsageSnapshot(): JsonObject {
  return {
    schema: "hanchou.usage-snapshot.v1", updated_at: null,
    providers: {
      codex: { source: "unknown", weekly_remaining_percent: null, session_remaining_percent: null, reset_at: null },
      claude: { source: "unknown", weekly_remaining_percent: null, session_remaining_percent: null, reset_at: null },
    },
  };
}

function loadUsageSnapshot(profile: JsonObject): JsonObject {
  const path = usageSnapshotPath(profile);
  if (!existsSync(path)) return emptyUsageSnapshot();
  let data: JsonObject;
  try { data = JSON.parse(readText(path)); }
  catch (error) { throw new CommandError(`cannot read usage snapshot ${path}: ${error}`); }
  if (data.schema !== "hanchou.usage-snapshot.v1") throw new CommandError(`unsupported usage snapshot schema: ${data.schema}`);
  return data;
}

function saveUsageSnapshot(profile: JsonObject, data: JsonObject): string {
  const path = usageSnapshotPath(profile);
  data.schema = "hanchou.usage-snapshot.v1";
  data.updated_at = utcnow();
  atomicWrite(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

function parseSnapshotTime(value: any): number | null {
  if (!value || typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function usageProviderState(snapshot: JsonObject, provider: string, policy: JsonObject): JsonObject {
  const record = snapshot.providers?.[provider] ?? {};
  const remaining = record.weekly_remaining_percent;
  const updated = parseSnapshotTime(snapshot.updated_at);
  const staleMinutes = Number(policy.thresholds?.stale_after_minutes ?? 180);
  const stale = updated === null || Date.now() - updated > staleMinutes * 60_000;
  let state = "unknown";
  if (!stale && remaining !== null && remaining !== undefined) {
    const critical = Number(policy.thresholds?.critical_remaining_percent ?? 10);
    const pressure = Number(policy.thresholds?.pressure_remaining_percent ?? 25);
    state = Number(remaining) <= critical ? "critical" : Number(remaining) <= pressure ? "pressure" : "normal";
  }
  return { state, stale, ...record };
}

function usageSet(args: JsonObject, name: string, profile: JsonObject): void {
  for (const [label, value] of [["weekly remaining", args.weekly_remaining], ["session remaining", args.session_remaining]]) {
    if (value !== null && value !== undefined && !(Number(value) >= 0 && Number(value) <= 100)) throw new CommandError(`${label} must be between 0 and 100`);
  }
  ensureState(name, profile);
  const snapshot = loadUsageSnapshot(profile);
  snapshot.providers ??= {};
  snapshot.providers[args.provider] ??= {};
  const provider = snapshot.providers[args.provider];
  Object.assign(provider, { source: args.source, weekly_remaining_percent: args.weekly_remaining, session_remaining_percent: args.session_remaining, reset_at: args.reset_at });
  const path = saveUsageSnapshot(profile, snapshot);
  const result = { profile: name, path, provider: args.provider, record: provider, updated_at: snapshot.updated_at };
  if (args.json) jsonPrint(result, true);
  else console.log(`updated ${args.provider} usage: weekly remaining ${Number(args.weekly_remaining).toFixed(1)}% (${path})`);
}

function usageShow(args: JsonObject, name: string, profile: JsonObject): void {
  const snapshot = loadUsageSnapshot(profile);
  const policy = loadRoutingPolicy(profile);
  const providers = Object.fromEntries(["codex", "claude"].map((provider) => [provider, usageProviderState(snapshot, provider, policy)]));
  const result = { profile: name, path: usageSnapshotPath(profile), updated_at: snapshot.updated_at, providers };
  if (args.json) { jsonPrint(result, true); return; }
  console.log(`usage snapshot: ${result.path}`);
  console.log(`updated:        ${result.updated_at || "never"}`);
  for (const [provider, state] of Object.entries(providers)) {
    const remaining = state.weekly_remaining_percent;
    const rendered = remaining === null || remaining === undefined ? "unknown" : `${Number(remaining).toFixed(1)}%`;
    console.log(`${provider.padEnd(8)} weekly=${rendered.padEnd(8)} state=${state.state} source=${state.source ?? "unknown"}`);
  }
}

function resolveRoute(name: string, profile: JsonObject, role: string, taskKind: string, japanese = false): JsonObject {
  const policy = loadRoutingPolicy(profile);
  const routes = policy.routes ?? {};
  if (!(role in routes)) throw new CommandError(`unknown routing role: ${role}`);
  const route = routes[role];
  const snapshot = loadUsageSnapshot(profile);
  const states = Object.fromEntries(["codex", "claude"].map((provider) => [provider, usageProviderState(snapshot, provider, policy)]));
  const primaryProvider = route.primary_provider;
  const primaryModel = route.primary_model;
  const fallbackProvider = route.fallback_provider;
  const fallbackModel = route.fallback_model;
  const forced = Boolean(route.force_provider) || japanese || new Set(["writing", "japanese", "business-writing", "final-prose-review"]).has(taskKind);
  let chosenProvider = primaryProvider;
  let chosenModel = primaryModel;
  let reason = "default route";
  if (forced) {
    chosenProvider = "codex";
    chosenModel = taskKind === "high-stakes-writing" || role === "orchestrator" ? "gpt-5.6-sol" : primaryProvider === "codex" ? primaryModel : "gpt-5.6-terra";
    reason = "Codex is required for Japanese/final prose policy";
  } else if (fallbackProvider) {
    const primaryRemaining = states[primaryProvider]?.weekly_remaining_percent;
    const fallbackRemaining = states[fallbackProvider]?.weekly_remaining_percent;
    const primaryPressure = new Set(["pressure", "critical"]).has(states[primaryProvider]?.state);
    const fallbackHealthier = states[fallbackProvider]?.state === "normal" || (
      primaryRemaining !== null && primaryRemaining !== undefined && fallbackRemaining !== null && fallbackRemaining !== undefined && Number(fallbackRemaining) > Number(primaryRemaining)
    );
    if (primaryPressure && fallbackHealthier) {
      chosenProvider = fallbackProvider; chosenModel = fallbackModel;
      reason = `${primaryProvider} usage is ${states[primaryProvider].state}; shifted to healthier provider`;
    }
  }
  const pressured = ["codex", "claude"].filter((provider) => new Set(["pressure", "critical"]).has(states[provider].state)).length;
  const policyConfig = policy.policy ?? {};
  const concurrency = pressured === 0 ? Number(policyConfig.max_concurrency_normal ?? 4) : pressured === 1 ? Number(policyConfig.max_concurrency_one_provider_pressure ?? 2) : Number(policyConfig.max_concurrency_both_pressure ?? 1);
  return { profile: name, role, task_kind: taskKind, provider: chosenProvider, model: chosenModel, reason, max_concurrency: concurrency, usage: states, snapshot_path: usageSnapshotPath(profile) };
}

function usageRecommend(args: JsonObject, name: string, profile: JsonObject): void {
  const result = resolveRoute(name, profile, args.role, args.task_kind, Boolean(args.japanese));
  if (args.json) jsonPrint(result, true);
  else {
    console.log(`${args.role}: ${result.provider} / ${result.model}`);
    console.log(`reason: ${result.reason}`);
    console.log(`recommended max concurrency: ${result.max_concurrency}`);
  }
}

function printPlan(name: string, profile: JsonObject): void {
  const paths = profilePaths(profile);
  const tools = miseTools();
  const projects = loadProjectRegistry(name, true);
  console.log(`Hanchou apply plan: ${name}`);
  console.log(`  config root: ${CONFIG_ROOT}`);
  console.log(`  orchestrator: ${profile.orchestrator.kind} / ${profile.orchestrator.model || "provider-default"} / logical agent ${profile.orchestrator.agent_name}`);
  console.log(`  Herdr session: ${profile.herdr.session}`);
  console.log(`  state: ${paths.root}`);
  console.log(`  Beads: ${paths.beads_dir} (${profile.beads.mode})`);
  console.log(`  Hanchou dashboard: ${dashboardUrl(profile)}`);
  console.log(`  task UI: http://${profile.ui.beads_ui_host}:${profile.ui.beads_ui_port}`);
  console.log(`  install mise tools from ${MISE_CONFIG}: Herdr ${tools.herdr}, Node.js ${tools.node}`);
  console.log("  render canonical roles to .codex/agents and .claude/agents");
  console.log(`  use project-local Codex Inbox rules: ${join(instanceProjectCwd(name), ".codex", "rules", "hanchou.rules")}`);
  console.log("  backup + replace generated user Agent definitions and ~/.config/herdr/config.toml");
  console.log("  install/update explicit public Skills plus optional machine-local overlays");
  console.log("  install Herdr Claude/Codex integrations");
  console.log(`  install pinned herdr-automations; herdr-beads enabled: ${profile.ui.herdr_beads_enabled ? "True" : "False"}`);
  console.log("  link this checkout as the Hanchou Herdr plugin");
  console.log(`  Relay state: ${paths.relay_dir} (Inbox + Delivery)`);
  console.log("  reporting defaults: root on_terminal, child parent_only, automation on_failure, daily digest always");
  console.log("  initialize central Beads store and provider integrations");
  console.log("  backup + render/install ~/Library/LaunchAgents entries for Herdr, beads-ui, and the read-only Hanchou dashboard");
  console.log(`  model routing: ${routingPolicyPath(profile)}`);
  console.log(`  usage snapshot: ${usageSnapshotPath(profile)}`);
  console.log(`  project registry: ${projects.registry_path} (${projects.projects.length} explicit, ${projects.workspace_roots.length} trusted roots${projects.registry_digest ? "" : "; absent means dispatch deny-all"})`);
  for (const broadRule of broadUserInboxRulePaths()) console.log(`  WARNING: remove overly broad user rule [\"hanchou\", \"inbox\"] from ${broadRule} after making a backup`);
}

function listMatchingFiles(directory: string, suffix: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(suffix)).sort().map((name) => join(directory, name));
}

function installAgentDefinitions(): void {
  const codexHome = expand(process.env.CODEX_HOME ?? "~/.codex");
  const claudeHome = expand(process.env.CLAUDE_CONFIG_DIR ?? "~/.claude");
  const destinations: Array<[string, string, string]> = [
    [join(ROOT, ".codex", "agents"), join(codexHome, "agents"), ".toml"],
    [join(ROOT, ".claude", "agents"), join(claudeHome, "agents"), ".md"],
  ];
  for (const [sourceDirectory, destinationDirectory, suffix] of destinations) {
    mkdirSync(destinationDirectory, { recursive: true });
    for (const source of listMatchingFiles(sourceDirectory, suffix)) {
      const target = join(destinationDirectory, basename(source));
      const changed = backupAndWrite(target, readText(source));
      console.log(`agent definition: ${target} (${changed ? "updated" : "current"})`);
    }
  }
}

function seedAutomationsConfig(profile: JsonObject, env: NodeJS.ProcessEnv): void {
  const pluginId = profile.scheduler.plugin_id;
  const proc = run([commandPath("herdr"), "plugin", "config-dir", pluginId], { env, capture: true });
  const configDirectory = expand(proc.stdout.trim());
  const target = join(configDirectory, "automations.yaml");
  if (existsSync(target)) { console.log(`automations config: preserve existing ${target}`); return; }
  const reference = String(profile.scheduler.config_template);
  const candidates = [isAbsolute(reference) ? reference : join(CONFIG_ROOT, reference), isAbsolute(reference) ? reference : join(ROOT, reference)];
  const templatePath = candidates.find(existsSync);
  if (!templatePath) throw new CommandError(`automation template not found: ${reference}`);
  const paths = profilePaths(profile);
  const rendered = readText(templatePath).replaceAll("{{REPO_ROOT}}", ROOT).replaceAll("{{REPORT_DIR}}", paths.report_dir);
  atomicWrite(target, rendered, 0o600);
  console.log(`automations config: seeded disabled examples at ${target}`);
}

function installSkillSources(name: string, profile: JsonObject, env: NodeJS.ProcessEnv): void {
  const configHome = join(operatorHome(), ".config", "hanchou", name);
  const sourceConfigs: Array<[JsonObject, boolean]> = [[loadToml(join(configHome, "skills.toml")), false]];
  const localOverlay = profile.skills?.local_overlay_file;
  if (localOverlay) {
    const localPath = expand(localOverlay);
    if (existsSync(localPath)) sourceConfigs.push([loadToml(localPath), true]);
  }
  const cliVersion = loadToml(join(ROOT, "config", "versions.toml")).components.skills_cli.version;
  const cacheRoot = join(operatorHome(), ".cache", "hanchou", "skills");
  const sources: Array<[JsonObject, boolean]> = [];
  for (const [config, machineLocal] of sourceConfigs) for (const source of config.sources ?? []) sources.push([source, machineLocal]);
  for (const [source, machineLocal] of sources) {
    if (!source.enabled) continue;
    const visibility = source.visibility ?? "public";
    if (visibility === "private" && !machineLocal && !profile.skills?.install_private) continue;
    const location = String(source.location);
    let installPath: string;
    if (location === ".") installPath = ROOT;
    else if (source.ref) {
      const destination = join(cacheRoot, String(source.name), String(source.ref).replaceAll("/", "_"));
      if (!existsSync(join(destination, ".git"))) {
        mkdirSync(dirname(destination), { recursive: true });
        run([commandPath("git"), "clone", "--filter=blob:none", location, destination], { env });
      }
      run([commandPath("git"), "-C", destination, "fetch", "--depth", "1", "origin", String(source.ref)], { env });
      run([commandPath("git"), "-C", destination, "checkout", "--detach", "FETCH_HEAD"], { env });
      installPath = destination;
    } else {
      const candidate = location.startsWith("~") ? expand(location) : isAbsolute(location) ? expand(location) : resolve(ROOT, location);
      installPath = existsSync(candidate) ? candidate : location;
    }
    const argv = [commandPath("npx"), "-y", `skills@${cliVersion}`, "add", installPath];
    for (const skill of source.skills ?? []) argv.push("--skill", String(skill));
    for (const agent of source.agents ?? []) argv.push("--agent", String(agent));
    if (source.scope === "global") argv.push("--global");
    if (source.copy ?? true) argv.push("--copy");
    argv.push("--yes");
    run(argv, { env, cwd: instanceProjectCwd(name) });
  }
}

function bootstrapProfile(name: string, profile: JsonObject): void {
  const mise = trustedMiseExecutable();
  for (const prerequisite of ["git", "gh", "bd", "codex", "claude"]) if (!which(prerequisite)) throw new CommandError(`required bootstrap prerequisite not found: ${prerequisite}`);
  run([mise, "-C", ROOT, "install"], { cwd: ROOT, env: trustedMiseEnvironment() });
  applyProfile(name, profile, true, true);
}

function applyProfile(name: string, profile: JsonObject, yes: boolean, installUpstream: boolean): void {
  if (!yes) { printPlan(name, profile); throw new CommandError("apply requires --yes; use `hanchou plan <profile>` for preview"); }
  if (installUpstream) for (const prerequisite of ["mise", "git", "bd", "codex", "claude", "herdr", "node", "npm", "npx"]) commandPath(prerequisite);
  ensureState(name, profile);
  const activeInstance = configuredInstance(name, false);
  if (activeInstance) materializeInstanceControlSurface(name, activeInstance.layout);
  const env = profileEnv(name, profile);
  renderAgents();
  installAgentDefinitions();
  const herdrConfig = join(operatorHome(), ".config", "herdr", "config.toml");
  const changed = backupAndWrite(herdrConfig, renderHerdrConfig(name, profile));
  console.log(`Herdr config: ${changed ? "updated" : "current"} (${herdrConfig})`);
  const localBin = join(operatorHome(), ".local", "bin", "hanchou");
  mkdirSync(dirname(localBin), { recursive: true });
  if (lexists(localBin)) unlinkSync(localBin);
  const instance = configuredInstance(name, false);
  const commandTarget = instance?.layout.launcher ?? join(ROOT, "bin", "hanchou");
  symlinkSync(commandTarget, localBin);
  console.log(`linked ${localBin} -> ${commandTarget}`);
  if (installUpstream) {
    run([commandPath("herdr"), "integration", "install", "codex"], { env });
    run([commandPath("herdr"), "integration", "install", "claude"], { env });
    const versions = loadToml(join(ROOT, "config", "versions.toml")).components;
    run([commandPath("herdr"), "plugin", "install", versions.herdr_automations.source, "--ref", `v${versions.herdr_automations.version}`, "--yes"], { env });
    if (profile.ui.herdr_beads_enabled) run([commandPath("herdr"), "plugin", "install", versions.herdr_beads.source, "--ref", versions.herdr_beads.ref, "--yes"], { env });
    run([commandPath("herdr"), "plugin", "link", ROOT], { env });
    seedAutomationsConfig(profile, env);
    run([commandPath("npm"), "install", "-g", `beads-ui@${versions.beads_ui.version}`], { env });
    const control = profilePaths(profile).control_dir;
    mkdirSync(control, { recursive: true });
    run([commandPath("bd"), "init", "--quiet", "--stealth", "--skip-hooks", "--skip-agents", "--init-if-missing", "--prefix", profile.beads.prefix ?? "hch"], { env, cwd: control });
    run([commandPath("bd"), "setup", "codex"], { env, cwd: control });
    run([commandPath("bd"), "setup", "claude"], { env, cwd: control });
    installSkillSources(name, profile, env);
    renderLaunchd(name, profile, true);
  } else console.log(`upstream install skipped; run \`${displayedProfileCommand(name, "bootstrap")}\` or add --install-upstream to install integrations, plugins, Beads UI, skills, and LaunchAgents`);
  if (changed) {
    try { run(herdrArgv(name, "server", "reload-config"), { env, check: false, capture: true }); }
    catch { /* apply without upstream installation leaves reload for bootstrap */ }
  }
  console.log("apply complete");
}

function parseJsonOutput(proc: RunResult): any {
  const text = proc.stdout.trim();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new CommandError(`expected JSON output, received: ${text.slice(0, 500)}`); }
}

function findAgentStatus(value: any): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["status", "state", "agent_status"]) {
      const candidate = value[key];
      if (typeof candidate === "string" && new Set(["idle", "done", "working", "blocked", "unknown"]).has(candidate)) return candidate;
    }
    for (const child of Object.values(value)) { const status = findAgentStatus(child); if (status) return status; }
  } else if (Array.isArray(value)) {
    for (const child of value) { const status = findAgentStatus(child); if (status) return status; }
  }
  return null;
}

function getAgentStatus(profileName: string, agent: string, strict = false): string | null {
  try { return findAgentStatus(parseJsonOutput(run(herdrArgv(profileName, "agent", "get", agent), { capture: true }))); }
  catch (error) {
    if (String(error).includes("agent_not_found")) return null;
    if (strict) throw error;
    return null;
  }
}

function getAgentInfo(profileName: string, agent: string, strict = false): JsonObject | null {
  try {
    const value = parseJsonOutput(run(herdrArgv(profileName, "agent", "get", agent), { capture: true }));
    const record = value?.result?.agent;
    if (record && typeof record === "object" && !Array.isArray(record)) return record;
    if (strict) throw new CommandError(`unexpected Herdr agent response for ${agent}: ${pyCompact(value)}`);
    return null;
  } catch (error) {
    if (String(error).includes("agent_not_found")) return null;
    if (strict) throw error;
    return null;
  }
}

function herdrRecords(profileName: string, noun: "agent" | "workspace" | "pane", key: string, ...args: string[]): JsonObject[] {
  const value = parseJsonOutput(run(herdrArgv(profileName, noun, "list", ...args), { capture: true }));
  const records = value?.result?.[key];
  if (!Array.isArray(records) || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    throw new CommandError(`unexpected Herdr ${noun} list response: ${pyCompact(value)}`);
  }
  return records;
}

function orchestratorRuntimePath(profile: JsonObject): string {
  return join(profilePaths(profile).control_dir, ".hanchou-orchestrator-runtime.json");
}

function trustedLifecycleArtifact(path: string, description: string): boolean {
  if (!lexists(path)) return false;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new CommandError(`${description} must be a regular file: ${path}`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new CommandError(`${description} must be owned by the effective OS user: ${path}`);
  }
  if ((info.mode & 0o077) !== 0) throw new CommandError(`${description} must have mode 0600: ${path}`);
  return true;
}

function orchestratorRuntimeBinding(name: string, profile: JsonObject): OrchestratorRuntimeBinding | null {
  const path = orchestratorRuntimePath(profile);
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new CommandError(`Orchestrator runtime binding must be a regular file: ${path}`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new CommandError(`Orchestrator runtime binding must be owned by the effective OS user: ${path}`);
  if ((info.mode & 0o077) !== 0) throw new CommandError(`Orchestrator runtime binding must have mode 0600: ${path}`);
  let value: JsonObject;
  try { value = readJsonFile(path, "Orchestrator runtime binding"); }
  catch (error) { throw new CommandError(`cannot trust Orchestrator runtime binding ${path}: ${error}`); }
  const expected = {
    profile: name,
    session: validatedHerdrSession(name, profile),
    agent_name: String(profile.orchestrator.agent_name),
    workspace_label: String(profile.orchestrator.workspace_label),
  };
  for (const [key, required] of Object.entries(expected)) {
    if (value[key] !== required) throw new CommandError(`Orchestrator runtime binding mismatch for ${key}: expected ${required}, got ${String(value[key])}`);
  }
  for (const key of ["workspace_id", "tab_id", "pane_id", "terminal_id", "created_at", "updated_at"]) {
    if (typeof value[key] !== "string" || !value[key]) throw new CommandError(`Orchestrator runtime binding has invalid ${key}: ${path}`);
  }
  const allowedRoots = orchestratorAllowedWorkspaceRoots(name);
  if (value.schema === "hanchou.orchestrator-runtime.v1") {
    if (typeof value.cwd !== "string" || !allowedRoots.some((root) => sameExistingDirectory(value.cwd, root))) {
      throw new CommandError(`Orchestrator runtime binding has an unapproved legacy cwd: ${String(value.cwd)}`);
    }
    return { ...value, core_root: value.cwd, workspace_cwd: realpathSync(value.cwd) } as OrchestratorRuntimeBinding;
  }
  if (value.schema !== "hanchou.orchestrator-runtime.v2") throw new CommandError(`unsupported Orchestrator runtime binding schema: ${String(value.schema)}`);
  if (!sameExistingDirectory(value.core_root, ROOT)) throw new CommandError(`Orchestrator runtime binding Core mismatch: expected ${realpathSync(ROOT)}, got ${String(value.core_root)}`);
  if (typeof value.workspace_cwd !== "string" || !allowedRoots.some((root) => sameExistingDirectory(value.workspace_cwd, root))) {
    throw new CommandError(`Orchestrator runtime binding has an unapproved workspace cwd: ${String(value.workspace_cwd)}`);
  }
  return { ...value, core_root: realpathSync(value.core_root), workspace_cwd: realpathSync(value.workspace_cwd) } as OrchestratorRuntimeBinding;
}

function orchestratorAllowedWorkspaceRoots(name: string): string[] {
  const roots = [instanceWorkspaceRoot(name)];
  const instance = configuredInstance(name, false);
  if (instance) {
    for (const path of instance.metadata.legacy_orchestrator_roots) {
      try {
        const canonical = realpathSync(path);
        if (!roots.includes(canonical)) roots.push(canonical);
      } catch { /* a removed legacy Core is no longer an allowed live cwd */ }
    }
  }
  return roots;
}

function clearLegacyOrchestratorRoots(name: string): void {
  const instance = configuredInstance(name, false);
  if (!instance || !instance.metadata.legacy_orchestrator_roots.length) return;
  withLock(join(instance.layout.control, ".instance-lifecycle.lock"), () => {
    const current = trustedInstanceMetadata(name, instance.layout.root, true, instance.metadata.source) as InstanceMetadata;
    if (!current.legacy_orchestrator_roots.length) return;
    writeInstanceMetadata(instance.layout.metadata, {
      ...current,
      legacy_orchestrator_roots: [],
      updated_at: utcnow(),
    });
  });
  console.log("cleared completed legacy Orchestrator cwd migration allowance");
}

function saveOrchestratorRuntime(
  name: string,
  profile: JsonObject,
  record: JsonObject,
  previous: OrchestratorRuntimeBinding | null = null,
  adoptedWorkspaceCwd: string | null = null,
): OrchestratorRuntimeBinding {
  const ids: Record<string, string> = {};
  for (const key of ["workspace_id", "tab_id", "pane_id", "terminal_id"]) {
    if (typeof record[key] !== "string" || !record[key]) throw new CommandError(`cannot bind Orchestrator: Herdr record has no ${key}`);
    ids[key] = record[key];
    if (previous && previous[key as keyof OrchestratorRuntimeBinding] !== record[key]) {
      throw new CommandError(`cannot replace recorded Orchestrator ${key}; live identity changed during reconciliation`);
    }
  }
  const now = utcnow();
  const binding: OrchestratorRuntimeBinding = {
    schema: previous?.schema ?? "hanchou.orchestrator-runtime.v2",
    profile: name,
    session: validatedHerdrSession(name, profile),
    agent_name: String(profile.orchestrator.agent_name),
    workspace_label: String(profile.orchestrator.workspace_label),
    core_root: previous?.core_root ?? realpathSync(ROOT),
    workspace_cwd: previous?.workspace_cwd ?? (adoptedWorkspaceCwd ? realpathSync(adoptedWorkspaceCwd) : instanceWorkspaceRoot(name)),
    workspace_id: ids.workspace_id,
    tab_id: ids.tab_id,
    pane_id: ids.pane_id,
    terminal_id: ids.terminal_id,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
  const persisted = binding.schema === "hanchou.orchestrator-runtime.v1"
    ? { ...binding, cwd: binding.workspace_cwd }
    : binding;
  if (binding.schema === "hanchou.orchestrator-runtime.v1") {
    delete (persisted as JsonObject).core_root;
    delete (persisted as JsonObject).workspace_cwd;
  }
  atomicWrite(orchestratorRuntimePath(profile), `${JSON.stringify(persisted)}\n`);
  return binding;
}

function sameExistingDirectory(left: unknown, right: string): boolean {
  if (typeof left !== "string" || !left) return false;
  try { return realpathSync(left) === realpathSync(right); }
  catch { return false; }
}

function boundOrchestratorPane(
  name: string,
  binding: OrchestratorRuntimeBinding,
  workspaces: JsonObject[],
): JsonObject | null {
  const workspace = workspaces.find((item) => item.workspace_id === binding.workspace_id);
  if (!workspace) return null;
  const mismatch = (
    workspace.label !== binding.workspace_label
    || workspace.pane_count !== 1
    || workspace.tab_count !== 1
    || (workspace.worktree !== undefined && workspace.worktree !== null)
  );
  if (mismatch) throw new CommandError(`recorded Orchestrator workspace ${binding.workspace_id} changed shape; no replacement was created`);
  const panes = herdrRecords(name, "pane", "panes", "--workspace", binding.workspace_id);
  if (panes.length !== 1) throw new CommandError(`recorded Orchestrator workspace ${binding.workspace_id} no longer has exactly one pane; no replacement was created`);
  const pane = panes[0];
  if (
    pane.workspace_id !== binding.workspace_id
    || pane.tab_id !== binding.tab_id
    || pane.pane_id !== binding.pane_id
    || pane.terminal_id !== binding.terminal_id
    || !sameExistingDirectory(pane.cwd, binding.workspace_cwd)
  ) {
    throw new CommandError(`recorded Orchestrator pane identity changed in ${binding.workspace_id}; no replacement was created`);
  }
  return pane;
}

function validateNamedOrchestrator(
  name: string,
  profile: JsonObject,
  record: JsonObject,
  workspaces: JsonObject[],
  binding: OrchestratorRuntimeBinding | null,
): JsonObject {
  const agentName = String(profile.orchestrator.agent_name);
  const expectedKind = String(profile.orchestrator.kind ?? "codex").toLowerCase();
  const detectedKind = String(record.agent ?? "").toLowerCase();
  const boundLaunchPending = Boolean(binding && record.launch_pending === true && !detectedKind);
  if (record.name !== agentName || (detectedKind !== expectedKind && !boundLaunchPending)) {
    throw new CommandError(`Agent \`${agentName}\` does not match the configured ${expectedKind} Orchestrator identity; no workspace was created`);
  }
  if (binding) {
    const pane = boundOrchestratorPane(name, binding, workspaces);
    if (!pane) throw new CommandError(`recorded Orchestrator workspace ${binding.workspace_id} is missing; no replacement was created`);
    for (const key of ["workspace_id", "tab_id", "pane_id", "terminal_id"]) {
      if (record[key] !== binding[key as keyof OrchestratorRuntimeBinding]) {
        throw new CommandError(`named Agent \`${agentName}\` does not match recorded ${key}; no replacement was created`);
      }
    }
    return pane;
  }
  const workspace = workspaces.find((item) => item.workspace_id === record.workspace_id);
  if (
    !workspace
    || workspace.label !== String(profile.orchestrator.workspace_label)
    || workspace.pane_count !== 1
    || workspace.tab_count !== 1
    || (workspace.worktree !== undefined && workspace.worktree !== null)
  ) {
    throw new CommandError(`unbound Agent \`${agentName}\` is not in a dedicated single-pane \`${profile.orchestrator.workspace_label}\` workspace; no workspace was created`);
  }
  const panes = herdrRecords(name, "pane", "panes", "--workspace", String(record.workspace_id));
  if (panes.length !== 1) throw new CommandError(`unbound Agent \`${agentName}\` workspace does not have exactly one pane; no workspace was created`);
  const pane = panes[0];
  if (
    pane.workspace_id !== record.workspace_id
    || pane.tab_id !== record.tab_id
    || pane.pane_id !== record.pane_id
    || pane.terminal_id !== record.terminal_id
    || !orchestratorAllowedWorkspaceRoots(name).some((root) => sameExistingDirectory(pane.cwd, root))
  ) {
    throw new CommandError(`unbound Agent \`${agentName}\` does not match the dedicated Hanchou pane identity; no workspace was created`);
  }
  return pane;
}

function legacyOrchestratorWorkspaces(profile: JsonObject, workspaces: JsonObject[]): JsonObject[] {
  const label = String(profile.orchestrator.workspace_label);
  return workspaces.filter((workspace) => workspace.label === label);
}

function legacyOrchestratorMessage(name: string, profile: JsonObject, workspaces: JsonObject[]): string {
  const ids = workspaces.map((workspace) => String(workspace.workspace_id ?? "unknown")).join(", ");
  return `found ${workspaces.length} unbound Herdr workspace(s) labeled \`${profile.orchestrator.workspace_label}\` (${ids}); no new workspace was created. Open \`${displayedProfileCommand(name, "open herdr")}\`, keep any workspace containing Agent \`${profile.orchestrator.agent_name}\`, and close only the verified empty duplicates with Ctrl+B then Shift+D. If no live Agent exists, close every stale labeled workspace, then rerun \`${displayedProfileCommand(name, "start-orchestrator")}\``;
}

function nudgeAgent(profileName: string, agent: string): [boolean, string | null] {
  const status = getAgentStatus(profileName, agent);
  if (!new Set(["idle", "done"]).has(status ?? "")) return [false, status];
  try { run(herdrArgv(profileName, "agent", "prompt", agent, nudgeText(agent)), { capture: true }); return [true, status]; }
  catch { return [false, status]; }
}

function relayRoot(profile: JsonObject): string { return profilePaths(profile).relay_dir; }
function eventPath(root: string, state: string, eventId: string): string {
  if (!INBOX_STATES.has(state)) throw new CommandError(`invalid Inbox state: ${state}`);
  return join(safeRelayDirectory(root, "inbox", state), `${validateEventId(eventId)}.json`);
}
function deliveryPath(root: string, state: string, deliveryId: string): string {
  if (!DELIVERY_STATES.has(state)) throw new CommandError(`invalid Delivery state: ${state}`);
  return join(safeRelayDirectory(root, "deliveries", state), `${validateDeliveryId(deliveryId)}.json`);
}

function withInboxTransition<T>(root: string, operation: () => T): T {
  return withLock(join(safeRelayDirectory(root, "locks"), "inbox-transition.lock"), operation);
}

function withDeliveryTransition<T>(root: string, operation: () => T): T {
  return withLock(join(safeRelayDirectory(root, "locks"), "delivery-transition.lock"), operation);
}

function validateStoredEvent(path: string, event: JsonObject): void {
  const eventId = validateEventId(event.event_id);
  validateAgentId(event.to_agent, "event recipient");
  validateAgentId(event.from_agent, "event sender");
  if (basename(path) !== `${eventId}.json`) throw new CommandError(`event filename does not match event_id: ${path}`);
}

function validateStoredDelivery(path: string, delivery: JsonObject): void {
  const deliveryId = validateDeliveryId(delivery.delivery_id);
  if (basename(path) !== `${deliveryId}.json`) throw new CommandError(`delivery filename does not match delivery_id: ${path}`);
}

function journal(root: string, record: JsonObject): void {
  const lock = join(safeRelayDirectory(root, "locks"), "journal.lock");
  withLock(lock, () => {
    appendJournalRecord(root, record);
  });
}

function appendJournalRecord(root: string, record: JsonObject): void {
  const path = join(safeRelayDirectory(root), "journal.jsonl");
  const fd = openSync(path, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(fd, `${pyCompact(sortedJson(record))}\n`, "utf8");
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

function journalOnce(root: string, identity: JsonObject, record: JsonObject, allowLegacy: boolean): void {
  const lock = join(safeRelayDirectory(root, "locks"), "journal.lock");
  withLock(lock, () => {
    const path = join(safeRelayDirectory(root), "journal.jsonl");
    if (existsSync(path)) {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || !info.isFile()) throw new CommandError(`Relay journal must be a regular non-symlink file: ${path}`);
      let fd: number | null = null;
      try {
        fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        if (!fstatSync(fd).isFile()) throw new Error("journal is no longer a regular file");
        const lines = readFileSync(fd, "utf8").split("\n").filter((line) => line.trim());
        let matchingRecords = 0;
        for (const line of lines) {
          let candidate: JsonObject;
          try {
            candidate = JSON.parse(line);
            if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("journal line must be a JSON object");
          }
          catch (error) { throw new CommandError(`cannot read Relay journal ${path}: ${error}`); }
          if (Object.entries(identity).every(([key, value]) => candidate[key] === value)) {
            const exact = pyCompact(sortedJson(candidate)) === pyCompact(sortedJson(record));
            if (!exact && !(allowLegacy && legacyTerminalJournalMatches(candidate, record))) throw new CommandError(`Relay journal entry does not match terminal state: ${pyCompact(identity)}`);
            matchingRecords += 1;
          }
        }
        if (matchingRecords > 1) throw new CommandError(`Relay journal contains duplicate terminal entries: ${pyCompact(identity)}`);
        if (matchingRecords === 1) return;
      } finally { if (fd !== null) closeSync(fd); }
    }
    appendJournalRecord(root, record);
  });
}

function legacyTerminalJournalMatches(candidate: JsonObject, expected: JsonObject): boolean {
  if (expected.schema !== TERMINAL_JOURNAL_SCHEMA || "schema" in candidate) return false;
  const expectedKeys = Object.keys(expected).filter((key) => key !== "schema").sort();
  if (pyCompact(Object.keys(candidate).sort()) !== pyCompact(expectedKeys)) return false;
  if (typeof candidate.at !== "string" || Number.isNaN(Date.parse(candidate.at))) return false;
  return expectedKeys.filter((key) => key !== "at").every((key) => pyCompact(sortedJson(candidate[key])) === pyCompact(sortedJson(expected[key])));
}

function ensureExactJsonRecord(path: string, label: string, expected: JsonObject): void {
  if (existsSync(path)) {
    const actual = readJsonFile(path, label);
    if (pyCompact(sortedJson(actual)) !== pyCompact(sortedJson(expected))) throw new CommandError(`${label} does not match terminal state: ${path}`);
    return;
  }
  atomicWrite(path, `${JSON.stringify(expected, null, 2)}\n`);
}

function inboxAcknowledgementEvidence(eventId: string, event: JsonObject): JsonObject {
  if (event.dead_letter?.journal_schema !== undefined) throw new CommandError(`event has conflicting acknowledgement and dead-letter evidence: ${eventId}`);
  if (event.retry !== undefined) throw new CommandError(`event has conflicting acknowledgement and retry evidence: ${eventId}`);
  const ack = event.ack;
  if (!ack || typeof ack !== "object" || !isTimestamp(ack.at) || typeof ack.by !== "string") throw new CommandError(`acknowledged event is missing acknowledgement evidence: ${eventId}`);
  validateAgentId(ack.by, "Inbox acknowledgement actor");
  if (ack.journal_schema !== undefined && ack.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`acknowledged event has an unsupported journal schema: ${eventId}`);
  return ack;
}

function ensureInboxAcknowledgement(root: string, eventId: string, event: JsonObject): void {
  const ack = inboxAcknowledgementEvidence(eventId, event);
  const receipt = { ...ack, schema: "hanchou.relay-receipt.v1", event_id: eventId };
  ensureExactJsonRecord(join(safeRelayDirectory(root, "receipts"), `inbox-${eventId}.json`), "Inbox receipt", receipt);
  journalOnce(root, { action: "acknowledged", event_id: eventId }, { schema: TERMINAL_JOURNAL_SCHEMA, at: ack.at, action: "acknowledged", event_id: eventId, by: ack.by }, ack.journal_schema === undefined);
}

function inboxDeadLetterEvidence(eventId: string, event: JsonObject): JsonObject {
  if (event.ack) throw new CommandError(`event has conflicting acknowledgement and dead-letter evidence: ${eventId}`);
  const deadLetter = event.dead_letter;
  if (!deadLetter || typeof deadLetter !== "object" || !isTimestamp(deadLetter.at) || typeof deadLetter.reason !== "string") throw new CommandError(`dead-lettered event is missing dead-letter evidence: ${eventId}`);
  if (deadLetter.journal_schema !== undefined && deadLetter.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`dead-lettered event has an unsupported journal schema: ${eventId}`);
  if (deadLetter.journal_schema === TERMINAL_JOURNAL_SCHEMA) {
    if (!Number.isInteger(deadLetter.retry_count) || Number(deadLetter.retry_count) < 0) throw new CommandError(`dead-lettered event has invalid retry evidence: ${eventId}`);
    if (Number(deadLetter.retry_count) !== Number(event.retry_count ?? 0)) throw new CommandError(`dead-lettered event retry evidence does not match event state: ${eventId}`);
  }
  return deadLetter;
}

function ensureInboxDeadLetter(root: string, eventId: string, event: JsonObject): void {
  const deadLetter = inboxDeadLetterEvidence(eventId, event);
  if (deadLetter.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`legacy dead-letter evidence must be migrated before journal repair: ${eventId}`);
  const record: JsonObject = {
    schema: TERMINAL_JOURNAL_SCHEMA, at: deadLetter.at, action: "dead-lettered",
    event_id: eventId, reason: deadLetter.reason, retry_count: deadLetter.retry_count,
  };
  journalOnce(root, { action: "dead-lettered", event_id: eventId, retry_count: deadLetter.retry_count }, record, false);
}

function migrateLegacyInboxDeadLetter(root: string, path: string, event: JsonObject): void {
  const eventId = validateEventId(event.event_id);
  const deadLetter = inboxDeadLetterEvidence(eventId, event);
  if (deadLetter.journal_schema === TERMINAL_JOURNAL_SCHEMA) { ensureInboxDeadLetter(root, eventId, event); return; }
  const retryCount = Number(event.retry_count ?? 0);
  if (!Number.isInteger(retryCount) || retryCount < 0) throw new CommandError(`dead-lettered event has invalid retry evidence: ${eventId}`);
  deadLetter.retry_count = retryCount;
  deadLetter.journal_schema = TERMINAL_JOURNAL_SCHEMA;
  atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
  ensureInboxDeadLetter(root, eventId, event);
}

function inboxRetryEvidence(eventId: string, event: JsonObject): JsonObject | null {
  const retry = event.retry;
  if (retry === undefined) return null;
  if (!retry || typeof retry !== "object" || !isTimestamp(retry.at)) throw new CommandError(`event has invalid retry evidence: ${eventId}`);
  if (retry.journal_schema !== INBOX_TRANSITION_JOURNAL_SCHEMA) throw new CommandError(`event has an unsupported retry journal schema: ${eventId}`);
  if (!new Set(["processing", "dead-letter"]).has(retry.from_state)) throw new CommandError(`event has invalid retry source evidence: ${eventId}`);
  if (!Number.isSafeInteger(retry.retry_count) || Number(retry.retry_count) < 1) throw new CommandError(`event has invalid retry count evidence: ${eventId}`);
  if (!Number.isSafeInteger(event.retry_count) || Number(event.retry_count) !== Number(retry.retry_count)) throw new CommandError(`event retry evidence does not match retry_count: ${eventId}`);
  if (event.ack) throw new CommandError(`event has conflicting acknowledgement and retry evidence: ${eventId}`);
  return retry;
}

function ensureInboxRetry(root: string, eventId: string, event: JsonObject): void {
  const retry = inboxRetryEvidence(eventId, event);
  if (!retry) throw new CommandError(`event is missing retry evidence: ${eventId}`);
  journalOnce(
    root,
    { action: "retried", event_id: eventId, retry_count: retry.retry_count },
    {
      schema: INBOX_TRANSITION_JOURNAL_SCHEMA,
      at: retry.at,
      action: "retried",
      event_id: eventId,
      from_state: retry.from_state,
      retry_count: retry.retry_count,
    },
    false,
  );
}

function ensureInboxRetrySourceEvidence(root: string, eventId: string, event: JsonObject, retry: JsonObject, state: string): void {
  if (retry.from_state === "processing") {
    if (event.dead_letter && new Set(["processing", "pending"]).has(state)) throw new CommandError(`processing retry has conflicting dead-letter evidence: ${eventId}`);
    return;
  }
  const deadLetter = event.dead_letter;
  if (!deadLetter) {
    if (state === "dead-letter") throw new CommandError(`dead-letter retry is missing source evidence: ${eventId}`);
    return;
  }
  if (typeof deadLetter !== "object" || !isTimestamp(deadLetter.at) || typeof deadLetter.reason !== "string") throw new CommandError(`dead-letter retry has invalid source evidence: ${eventId}`);
  if (deadLetter.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`dead-letter retry has unsupported source evidence: ${eventId}`);
  const priorRetryCount = Number(retry.retry_count) - 1;
  if (!Number.isSafeInteger(deadLetter.retry_count) || Number(deadLetter.retry_count) !== priorRetryCount) throw new CommandError(`dead-letter retry source count does not precede retry_count: ${eventId}`);
  journalOnce(
    root,
    { action: "dead-lettered", event_id: eventId, retry_count: priorRetryCount },
    {
      schema: TERMINAL_JOURNAL_SCHEMA,
      at: deadLetter.at,
      action: "dead-lettered",
      event_id: eventId,
      reason: deadLetter.reason,
      retry_count: priorRetryCount,
    },
    false,
  );
}

function inboxLeaseRecoveryEvidence(eventId: string, event: JsonObject): JsonObject | null {
  const recovery = event.lease_recovery;
  if (recovery === undefined) return null;
  if (!recovery || typeof recovery !== "object" || !isTimestamp(recovery.at)) throw new CommandError(`event has invalid lease recovery evidence: ${eventId}`);
  if (recovery.journal_schema !== INBOX_TRANSITION_JOURNAL_SCHEMA) throw new CommandError(`event has an unsupported lease recovery journal schema: ${eventId}`);
  if (!Number.isSafeInteger(recovery.recovery_count) || Number(recovery.recovery_count) < 1) throw new CommandError(`event has invalid lease recovery count evidence: ${eventId}`);
  if (!Number.isSafeInteger(event.recovery_count) || Number(event.recovery_count) !== Number(recovery.recovery_count)) throw new CommandError(`event lease recovery evidence does not match recovery_count: ${eventId}`);
  return recovery;
}

function ensureInboxLeaseRecovery(root: string, eventId: string, event: JsonObject): void {
  const recovery = inboxLeaseRecoveryEvidence(eventId, event);
  if (!recovery) throw new CommandError(`event is missing lease recovery evidence: ${eventId}`);
  journalOnce(
    root,
    { action: "lease-recovered", event_id: eventId, recovery_count: recovery.recovery_count },
    {
      schema: INBOX_TRANSITION_JOURNAL_SCHEMA,
      at: recovery.at,
      action: "lease-recovered",
      event_id: eventId,
      recovery_count: recovery.recovery_count,
    },
    false,
  );
}

function retireInboxTransitionEvidence(root: string, eventId: string, event: JsonObject): void {
  if (event.retry !== undefined) {
    ensureInboxRetry(root, eventId, event);
    delete event.retry;
  }
  if (event.lease_recovery !== undefined) {
    ensureInboxLeaseRecovery(root, eventId, event);
    delete event.lease_recovery;
  }
}

type InboxTransitionReplay = { active: boolean; moved: boolean; path: string };

function recoverStagedInboxRetry(root: string, path: string, event: JsonObject): InboxTransitionReplay | null {
  const eventId = validateEventId(event.event_id);
  const retry = inboxRetryEvidence(eventId, event);
  if (!retry) return null;
  if (event.lease_recovery) throw new CommandError(`event has conflicting retry and lease recovery evidence: ${eventId}`);
  const state = basename(dirname(path));
  ensureInboxRetrySourceEvidence(root, eventId, event, retry, state);
  if (state === "processing" && event.lease) {
    ensureInboxRetry(root, eventId, event);
    return { active: false, moved: false, path };
  }
  if (new Set(["acknowledged", "dead-letter"]).has(state) && state !== retry.from_state) {
    ensureInboxRetry(root, eventId, event);
    return { active: false, moved: false, path };
  }
  if (state !== "pending" && state !== retry.from_state) throw new CommandError(`retry evidence conflicts with Inbox state ${state}: ${eventId}`);
  if (state === "processing" && retry.from_state !== "processing") throw new CommandError(`retry source evidence conflicts with processing state: ${eventId}`);
  if (state === "dead-letter" && retry.from_state !== "dead-letter") throw new CommandError(`retry source evidence conflicts with dead-letter state: ${eventId}`);

  const destination = eventPath(root, "pending", eventId);
  const moved = resolve(path) !== resolve(destination);
  if (moved) durableRename(path, destination);
  let normalized = false;
  if (event.lease !== undefined) { delete event.lease; normalized = true; }
  if (event.dead_letter !== undefined) { delete event.dead_letter; normalized = true; }
  if (normalized) atomicWrite(destination, `${JSON.stringify(event, null, 2)}\n`);
  ensureInboxRetry(root, eventId, event);
  return { active: true, moved, path: destination };
}

function recoverStagedInboxLeaseRecovery(root: string, path: string, event: JsonObject): InboxTransitionReplay | null {
  const eventId = validateEventId(event.event_id);
  const recovery = inboxLeaseRecoveryEvidence(eventId, event);
  if (!recovery) return null;
  if (event.retry) throw new CommandError(`event has conflicting retry and lease recovery evidence: ${eventId}`);
  const state = basename(dirname(path));
  if (event.ack || event.dead_letter || (state === "processing" && event.lease) || new Set(["acknowledged", "dead-letter"]).has(state)) {
    ensureInboxLeaseRecovery(root, eventId, event);
    return { active: false, moved: false, path };
  }
  if (state !== "processing" && state !== "pending") throw new CommandError(`lease recovery evidence conflicts with Inbox state ${state}: ${eventId}`);
  if (event.lease) throw new CommandError(`staged lease recovery still has lease evidence: ${eventId}`);
  const destination = eventPath(root, "pending", eventId);
  const moved = resolve(path) !== resolve(destination);
  if (moved) durableRename(path, destination);
  ensureInboxLeaseRecovery(root, eventId, event);
  return { active: true, moved, path: destination };
}

function deliveryCompletionEvidence(deliveryId: string, record: JsonObject): JsonObject {
  if (record.status !== "delivered") throw new CommandError(`delivered record has inconsistent status: ${deliveryId}`);
  if (record.failure) throw new CommandError(`delivery has conflicting delivered and failure evidence: ${deliveryId}`);
  const delivered = record.delivered;
  if (!delivered || typeof delivered !== "object" || !isTimestamp(delivered.at) || typeof delivered.adapter !== "string") throw new CommandError(`delivered record is missing delivery evidence: ${deliveryId}`);
  if (delivered.journal_schema !== undefined && delivered.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`delivered record has an unsupported journal schema: ${deliveryId}`);
  return delivered;
}

function ensureDeliveryCompletion(root: string, deliveryId: string, record: JsonObject): void {
  const delivered = deliveryCompletionEvidence(deliveryId, record);
  const receipt = { ...delivered, schema: "hanchou.delivery-receipt.v1", delivery_id: deliveryId };
  ensureExactJsonRecord(join(safeRelayDirectory(root, "receipts"), `delivery-${deliveryId}.json`), "Delivery receipt", receipt);
  journalOnce(root, { action: "delivery-delivered", delivery_id: deliveryId }, { schema: TERMINAL_JOURNAL_SCHEMA, at: delivered.at, action: "delivery-delivered", delivery_id: deliveryId, adapter: delivered.adapter }, delivered.journal_schema === undefined);
}

function deliveryRenderedEvidence(deliveryId: string, record: JsonObject): JsonObject {
  if (record.status !== "rendered") throw new CommandError(`rendered delivery has inconsistent status: ${deliveryId}`);
  if (record.failure || record.delivered) throw new CommandError(`delivery has conflicting rendered terminal evidence: ${deliveryId}`);
  const rendered = record.rendered;
  if (!rendered || typeof rendered !== "object" || !isTimestamp(rendered.at) || typeof rendered.by !== "string") throw new CommandError(`rendered delivery is missing render evidence: ${deliveryId}`);
  if (rendered.journal_schema !== undefined && rendered.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`rendered delivery has an unsupported journal schema: ${deliveryId}`);
  if (rendered.journal_schema === TERMINAL_JOURNAL_SCHEMA) {
    if (!Number.isInteger(rendered.attempts) || Number(rendered.attempts) < 0) throw new CommandError(`rendered delivery has invalid attempt evidence: ${deliveryId}`);
    if (Number(rendered.attempts) !== Number(record.attempts ?? 0)) throw new CommandError(`rendered delivery attempt evidence does not match record state: ${deliveryId}`);
  }
  return rendered;
}

function ensureDeliveryRendered(root: string, deliveryId: string, record: JsonObject): void {
  const rendered = deliveryRenderedEvidence(deliveryId, record);
  if (rendered.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`legacy render evidence must be migrated before journal repair: ${deliveryId}`);
  journalOnce(
    root,
    { action: "delivery-rendered", delivery_id: deliveryId, attempts: rendered.attempts },
    { schema: TERMINAL_JOURNAL_SCHEMA, at: rendered.at, action: "delivery-rendered", delivery_id: deliveryId, by: rendered.by, attempts: rendered.attempts },
    false,
  );
}

function migrateLegacyDeliveryRendered(root: string, path: string, record: JsonObject): void {
  const deliveryId = validateDeliveryId(record.delivery_id);
  const rendered = deliveryRenderedEvidence(deliveryId, record);
  if (rendered.journal_schema === TERMINAL_JOURNAL_SCHEMA) { ensureDeliveryRendered(root, deliveryId, record); return; }
  const attempts = Number(record.attempts ?? 0);
  if (!Number.isInteger(attempts) || attempts < 0) throw new CommandError(`rendered delivery has invalid attempt evidence: ${deliveryId}`);
  rendered.attempts = attempts;
  rendered.journal_schema = TERMINAL_JOURNAL_SCHEMA;
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`);
  ensureDeliveryRendered(root, deliveryId, record);
}

function deliveryFailureEvidence(deliveryId: string, record: JsonObject): JsonObject {
  if (record.status !== "failed") throw new CommandError(`failed delivery has inconsistent status: ${deliveryId}`);
  if (record.delivered) throw new CommandError(`delivery has conflicting failure and delivered evidence: ${deliveryId}`);
  const failure = record.failure;
  if (!failure || typeof failure !== "object" || !isTimestamp(failure.at) || typeof failure.reason !== "string") throw new CommandError(`failed delivery is missing failure evidence: ${deliveryId}`);
  if (failure.journal_schema !== undefined && failure.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`failed delivery has an unsupported journal schema: ${deliveryId}`);
  if (failure.journal_schema === TERMINAL_JOURNAL_SCHEMA) {
    if (!Number.isInteger(failure.attempts) || Number(failure.attempts) < 1) throw new CommandError(`failed delivery has invalid attempt evidence: ${deliveryId}`);
    if (Number(failure.attempts) !== Number(record.attempts)) throw new CommandError(`failed delivery attempt evidence does not match record state: ${deliveryId}`);
  }
  return failure;
}

function ensureDeliveryFailure(root: string, deliveryId: string, record: JsonObject): void {
  const failure = deliveryFailureEvidence(deliveryId, record);
  if (failure.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`legacy failure evidence must be migrated before journal repair: ${deliveryId}`);
  journalOnce(
    root,
    { action: "delivery-failed", delivery_id: deliveryId, attempts: failure.attempts },
    { schema: TERMINAL_JOURNAL_SCHEMA, at: failure.at, action: "delivery-failed", delivery_id: deliveryId, reason: failure.reason, attempts: failure.attempts },
    false,
  );
}

function migrateLegacyDeliveryFailure(root: string, path: string, record: JsonObject): void {
  const deliveryId = validateDeliveryId(record.delivery_id);
  const failure = deliveryFailureEvidence(deliveryId, record);
  if (failure.journal_schema === TERMINAL_JOURNAL_SCHEMA) { ensureDeliveryFailure(root, deliveryId, record); return; }
  const attempts = Number(record.attempts);
  if (!Number.isInteger(attempts) || attempts < 1) throw new CommandError(`failed delivery has invalid attempt evidence: ${deliveryId}`);
  failure.attempts = attempts;
  failure.journal_schema = TERMINAL_JOURNAL_SCHEMA;
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`);
  ensureDeliveryFailure(root, deliveryId, record);
}

function deliveryRetryEvidence(deliveryId: string, record: JsonObject): JsonObject | null {
  const retry = record.retry;
  if (retry === undefined) return null;
  if (!retry || typeof retry !== "object" || !isTimestamp(retry.at)) throw new CommandError(`delivery has invalid retry evidence: ${deliveryId}`);
  if (retry.journal_schema !== TERMINAL_JOURNAL_SCHEMA) throw new CommandError(`delivery has an unsupported retry journal schema: ${deliveryId}`);
  if (!Number.isInteger(retry.attempts) || Number(retry.attempts) < 1 || Number(retry.attempts) > Number(record.attempts)) throw new CommandError(`delivery has invalid retry attempt evidence: ${deliveryId}`);
  return retry;
}

function ensureDeliveryRetry(root: string, deliveryId: string, record: JsonObject): void {
  const retry = deliveryRetryEvidence(deliveryId, record);
  if (!retry) throw new CommandError(`delivery is missing retry evidence: ${deliveryId}`);
  journalOnce(
    root,
    { action: "delivery-retried", delivery_id: deliveryId, attempts: retry.attempts },
    { schema: TERMINAL_JOURNAL_SCHEMA, at: retry.at, action: "delivery-retried", delivery_id: deliveryId, attempts: retry.attempts },
    false,
  );
}

function recoverStagedDeliveryRetry(root: string, path: string, record: JsonObject): string | null {
  const deliveryId = validateDeliveryId(record.delivery_id);
  let retry = deliveryRetryEvidence(deliveryId, record);
  const pathState = basename(dirname(path));
  const attempts = Number(record.attempts);
  const legacyRetryShape = !retry && record.status === "pending" && !record.failure && Number.isInteger(attempts) && attempts >= 1
    && new Set(["failed", "pending"]).has(pathState);
  if (legacyRetryShape) {
    // Public v2.3.1 could stop either before or after the source rename, while
    // leaving no durable retry marker. attempts>=1 distinguishes it from a
    // never-failed pending record; migrate both locations to exact evidence.
    record.retry = { at: utcnow(), attempts, journal_schema: TERMINAL_JOURNAL_SCHEMA };
    atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`);
    retry = record.retry;
  }
  if (!retry) return null;
  if (Number(retry.attempts) < Number(record.attempts) || new Set(["rendered", "delivered"]).has(record.status)) {
    ensureDeliveryRetry(root, deliveryId, record);
    return null;
  }
  if (record.status === "failed") {
    deliveryFailureEvidence(deliveryId, record);
    const destination = deliveryPath(root, "pending", deliveryId);
    if (resolve(path) !== resolve(destination)) durableRename(path, destination);
    delete record.failure;
    record.status = "pending";
    atomicWrite(destination, `${JSON.stringify(record, null, 2)}\n`);
    ensureDeliveryRetry(root, deliveryId, record);
    return destination;
  }
  if (record.status === "pending") {
    if (record.failure) throw new CommandError(`retried delivery still has failure evidence: ${deliveryId}`);
    const destination = deliveryPath(root, "pending", deliveryId);
    if (resolve(path) !== resolve(destination)) durableRename(path, destination);
    ensureDeliveryRetry(root, deliveryId, record);
    return destination;
  }
  throw new CommandError(`delivery retry evidence conflicts with status ${record.status}: ${deliveryId}`);
}

function recoverStagedInboxAcknowledgement(root: string, path: string, event: JsonObject): string | null {
  if (!event.ack) return null;
  const eventId = validateEventId(event.event_id);
  if (event.dead_letter?.journal_schema !== undefined) throw new CommandError(`event has conflicting acknowledgement and dead-letter evidence: ${eventId}`);
  const ack = inboxAcknowledgementEvidence(eventId, event);
  if (event.lease) throw new CommandError(`staged acknowledgement still has lease evidence: ${eventId}`);
  if (event.to_agent !== ack.by) throw new CommandError(`staged acknowledgement actor does not match event recipient: ${eventId}`);
  const destination = eventPath(root, "acknowledged", eventId);
  if (resolve(path) !== resolve(destination)) durableRename(path, destination);
  ensureInboxAcknowledgement(root, eventId, event);
  return destination;
}

function recoverStagedInboxDeadLetter(root: string, path: string, event: JsonObject): string | null {
  if (!event.dead_letter) return null;
  if (event.retry !== undefined) throw new CommandError(`retry evidence must be replayed before dead-letter evidence: ${validateEventId(event.event_id)}`);
  // Public v2.3.1 could leave a markerless dead_letter object behind after a
  // successful retry. Only the versioned marker is unambiguous evidence that
  // a new dead-letter transition was durably staged in a source directory.
  if (event.dead_letter.journal_schema === undefined) return null;
  const eventId = validateEventId(event.event_id);
  if (event.ack) throw new CommandError(`event has conflicting acknowledgement and dead-letter evidence: ${eventId}`);
  inboxDeadLetterEvidence(eventId, event);
  if (event.lease) throw new CommandError(`staged dead-letter still has lease evidence: ${eventId}`);
  const destination = eventPath(root, "dead-letter", eventId);
  if (resolve(path) !== resolve(destination)) durableRename(path, destination);
  ensureInboxDeadLetter(root, eventId, event);
  return destination;
}

function legacyDeadLetterHasRetryProof(root: string, eventId: string, deadLetterAt: string): boolean {
  const deadLetterEpoch = Date.parse(deadLetterAt);
  if (Number.isNaN(deadLetterEpoch)) return false;
  return withLock(join(safeRelayDirectory(root, "locks"), "journal.lock"), () => {
    const path = join(safeRelayDirectory(root), "journal.jsonl");
    if (!existsSync(path)) return false;
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new CommandError(`Relay journal must be a regular non-symlink file: ${path}`);
    let fd: number | null = null;
    try {
      fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      if (!fstatSync(fd).isFile()) throw new Error("journal is no longer a regular file");
      for (const line of readFileSync(fd, "utf8").split("\n").filter((item) => item.trim())) {
        let candidate: JsonObject;
        try {
          candidate = JSON.parse(line);
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("journal line must be a JSON object");
        } catch (error) { throw new CommandError(`cannot read Relay journal ${path}: ${error}`); }
        if (candidate.action !== "retried" || candidate.event_id !== eventId || candidate.from_state !== "dead-letter") continue;
        if (typeof candidate.at === "string" && Date.parse(candidate.at) > deadLetterEpoch) return true;
      }
      return false;
    } finally { if (fd !== null) closeSync(fd); }
  });
}

function resolveLegacyDeadLetterSource(root: string, path: string, event: JsonObject): boolean {
  const deadLetter = event.dead_letter;
  if (!deadLetter || deadLetter.journal_schema !== undefined) return false;
  const eventId = validateEventId(event.event_id);
  const retryProven = typeof deadLetter.at === "string" && legacyDeadLetterHasRetryProof(root, eventId, deadLetter.at);
  // A v2.3.1 acknowledgement or lease can only have been created after retry;
  // dead-letter staging deleted the lease and could not coexist with ack.
  const retryResidue = Boolean(event.ack || event.lease || retryProven);
  if (retryResidue) {
    delete event.dead_letter;
    atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
    return false;
  }
  // Without durable proof of a completed retry, the markerless shape is
  // ambiguous with a v2.3.1 crash after source write. Preserve terminal intent.
  migrateLegacyInboxDeadLetter(root, path, event);
  recoverStagedInboxDeadLetter(root, path, event);
  return true;
}

function recoverStagedDeliveryCompletion(root: string, path: string, record: JsonObject): string | null {
  if (!record.delivered && record.status !== "delivered") return null;
  const deliveryId = validateDeliveryId(record.delivery_id);
  if (!record.delivered || record.status !== "delivered") throw new CommandError(`staged delivery evidence is inconsistent: ${deliveryId}`);
  deliveryCompletionEvidence(deliveryId, record);
  const destination = deliveryPath(root, "delivered", deliveryId);
  if (resolve(path) !== resolve(destination)) durableRename(path, destination);
  ensureDeliveryCompletion(root, deliveryId, record);
  return destination;
}

function recoverStagedDeliveryRendered(root: string, path: string, record: JsonObject): string | null {
  if (record.status !== "rendered") return null;
  const deliveryId = validateDeliveryId(record.delivery_id);
  deliveryRenderedEvidence(deliveryId, record);
  const destination = deliveryPath(root, "rendered", deliveryId);
  if (resolve(path) !== resolve(destination)) durableRename(path, destination);
  if (record.rendered.journal_schema === undefined) migrateLegacyDeliveryRendered(root, destination, record);
  else ensureDeliveryRendered(root, deliveryId, record);
  return destination;
}

function recoverStagedDeliveryFailure(root: string, path: string, record: JsonObject): string | null {
  if (!record.failure && record.status !== "failed") return null;
  const deliveryId = validateDeliveryId(record.delivery_id);
  if (!record.failure || record.status !== "failed") throw new CommandError(`staged delivery failure evidence is inconsistent: ${deliveryId}`);
  deliveryFailureEvidence(deliveryId, record);
  const destination = deliveryPath(root, "failed", deliveryId);
  if (resolve(path) !== resolve(destination)) durableRename(path, destination);
  if (record.failure.journal_schema === undefined) migrateLegacyDeliveryFailure(root, destination, record);
  else ensureDeliveryFailure(root, deliveryId, record);
  return destination;
}

function reconcileDeliveryTransitionsUnlocked(root: string): number {
  let recovered = 0;
  for (const state of ["pending", "rendered", "delivered", "failed"]) {
    for (const [path, record] of listJsonFiles(safeRelayDirectory(root, "deliveries", state))) {
      validateStoredDelivery(path, record);
      const retryPath = recoverStagedDeliveryRetry(root, path, record);
      if (retryPath && resolve(retryPath) !== resolve(path)) { recovered += 1; continue; }
      if (recoverStagedDeliveryCompletion(root, path, record)) {
        if (state !== "delivered") recovered += 1;
        continue;
      }
      if (recoverStagedDeliveryFailure(root, path, record)) {
        if (state !== "failed") recovered += 1;
        continue;
      }
      if (recoverStagedDeliveryRendered(root, path, record)) {
        if (state !== "rendered") recovered += 1;
        continue;
      }
      if (record.status !== state) throw new CommandError(`Delivery directory/status mismatch for ${record.delivery_id}: directory=${state}, status=${record.status ?? "missing"}`);
    }
  }
  return recovered;
}

function validateRoute(event: JsonObject): void {
  const depth = event.delegation_depth ?? 1;
  const fromRole = event.from_role;
  const toRole = event.to_role;
  if (![0, 1, 2].includes(depth)) throw new CommandError("delegation_depth must be 0, 1, or 2");
  const leafRoles = new Set(["worker", "reviewer", "researcher", "implementer", "writer", "editor"]);
  if (leafRoles.has(fromRole)) {
    const expected = depth === 2 ? "mission-lead" : "orchestrator";
    if (toRole !== expected) throw new CommandError(`leaf event at depth ${depth} must route to ${expected}, not ${toRole}`);
  }
  if (fromRole === "mission-lead" && toRole !== "orchestrator") throw new CommandError("mission-lead events must route to orchestrator");
  if (new Set(["gateway", "scheduler", "relay"]).has(fromRole) && toRole !== "orchestrator") throw new CommandError(`${fromRole} events must route to orchestrator`);
  if (fromRole === "orchestrator" && !new Set(["mission-lead", "worker", "reviewer", "researcher", "implementer", "writer", "editor"]).has(toRole)) throw new CommandError("orchestrator assignments must target an execution role");
  if (new Set(["completed", "failed", "needs_decision", "blocked"]).has(event.type) && !event.task_id) throw new CommandError(`${event.type} events require --task`);
}

function relayEmit(args: JsonObject, name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  ensureState(name, profile);
  if (!RELAY_EVENT_TYPES.has(args.type)) throw new CommandError(`unsupported relay event type: ${args.type}`);
  const eventId = validateEventId(args.event_id || `evt_${randomUUID().replaceAll("-", "")}`);
  const fromAgent = validateAgentId(args.from_agent, "event sender");
  requireManagedAgentIdentity(fromAgent, "Relay emit");
  validateAgentId(args.to_agent, "event recipient");
  let origin = null;
  if (args.origin) { try { origin = JSON.parse(args.origin); } catch (error) { throw new CommandError(`invalid --origin JSON: ${error}`); } }
  const event = {
    schema: "hanchou.relay-event.v1", event_id: eventId, type: args.type, task_id: args.task,
    execution_id: args.execution, from_agent: args.from_agent, from_role: args.from_role,
    to_agent: args.to_agent, to_role: args.to_role, delegation_depth: args.delegation_depth,
    created_at: utcnow(), summary: args.summary, detail_ref: args.detail_ref,
    artifacts: args.artifact ?? [], verification: args.verification ?? [], origin,
  };
  validateRoute(event);
  const path = withInboxTransition(root, () => {
    const pendingPath = eventPath(root, "pending", eventId);
    if (["pending", "processing", "acknowledged", "dead-letter"].some((state) => existsSync(eventPath(root, state, eventId)))) throw new CommandError(`event already exists: ${eventId}`);
    atomicWrite(pendingPath, `${JSON.stringify(event, null, 2)}\n`);
    journal(root, { at: utcnow(), action: "enqueued", event_id: eventId, to_agent: args.to_agent });
    return pendingPath;
  });
  let nudged = false;
  let status: string | null = null;
  if (!args.no_nudge) {
    [nudged, status] = nudgeAgent(name, args.to_agent);
    if (nudged) journal(root, { at: utcnow(), action: "nudged", event_id: eventId, to_agent: args.to_agent });
  }
  const result = { ok: true, event_id: eventId, path, nudged, target_status: status };
  if (args.json) jsonPrint(result); else console.log(`queued ${eventId} (nudged=${String(nudged).replace(/^./, (char) => char.toUpperCase())}, status=${status === null ? "None" : status})`);
}

function iterEvents(root: string, state: string): Array<[string, JsonObject]> {
  if (!INBOX_STATES.has(state)) throw new CommandError(`invalid Inbox state: ${state}`);
  return listJsonFiles(safeRelayDirectory(root, "inbox", state)).map(([path, event]) => {
    validateStoredEvent(path, event);
    return [path, event];
  });
}
function iterDeliveries(root: string, state: string): Array<[string, JsonObject]> {
  if (!DELIVERY_STATES.has(state)) throw new CommandError(`invalid Delivery state: ${state}`);
  return listJsonFiles(safeRelayDirectory(root, "deliveries", state)).map(([path, delivery]) => {
    validateStoredDelivery(path, delivery);
    if (delivery.status !== state) throw new CommandError(`Delivery directory/status mismatch for ${delivery.delivery_id}: directory=${state}, status=${delivery.status ?? "missing"}`);
    return [path, delivery];
  });
}

function inboxList(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  if (args.to) validateAgentId(args.to, "Inbox recipient");
  const states = args.state ? [args.state] : ["pending", "processing", "acknowledged", "dead-letter"];
  const rows: JsonObject[] = [];
  for (const state of states) for (const [path, event] of iterEvents(root, state)) {
    if (args.to && event.to_agent !== args.to) continue;
    rows.push({ state, event_id: event.event_id, type: event.type, task_id: event.task_id, from: event.from_agent, to: event.to_agent, created_at: event.created_at, summary: event.summary, path });
  }
  if (args.json) jsonPrint(rows, true);
  else {
    if (!rows.length) console.log("inbox empty");
    for (const row of rows) console.log(`${String(row.state).padEnd(13)} ${row.event_id} ${String(row.type).padEnd(20)} ${row.task_id || "-"} -> ${row.to}  ${row.summary}`);
  }
}

function inboxClaim(args: JsonObject, name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  ensureState(name, profile);
  const target = validateAgentId(args.to || profile.orchestrator.agent_name, "Inbox claimant");
  requireManagedAgentIdentity(target, "Inbox claim");
  const limit = args.limit || profile.relay?.max_batch || 20;
  if (!Number.isInteger(limit) || limit < 1) throw new CommandError("Inbox claim limit must be a positive integer");
  const claimed: JsonObject[] = withInboxTransition(root, () => {
    const records: JsonObject[] = [];
    for (const [path, event] of iterEvents(root, "pending")) {
      recoverStagedInboxRetry(root, path, event);
      if (recoverStagedInboxDeadLetter(root, path, event)) continue;
      if (resolveLegacyDeadLetterSource(root, path, event)) continue;
      if (recoverStagedInboxAcknowledgement(root, path, event)) continue;
      recoverStagedInboxLeaseRecovery(root, path, event);
      if (records.length >= limit) break;
      if (event.to_agent !== target) continue;
      retireInboxTransitionEvidence(root, validateEventId(event.event_id), event);
      event.lease = { claimed_by: target, claimed_at: utcnow(), expires_at_epoch: Math.floor(Date.now() / 1000) + Number(profile.relay?.lease_seconds ?? 900) };
      const destination = eventPath(root, "processing", event.event_id);
      atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
      durableRename(path, destination);
      records.push({ ...event, path: destination });
      journal(root, { at: utcnow(), action: "claimed", event_id: event.event_id, agent: target });
    }
    return records;
  });
  if (args.json) jsonPrint(claimed, true);
  else {
    for (const event of claimed) console.log(`claimed ${event.event_id}: ${event.summary}`);
    if (!claimed.length) console.log("no pending events");
  }
}

function locateEvent(root: string, eventId: string, states: string[]): [string, string, JsonObject] {
  validateEventId(eventId);
  for (const state of states) {
    const path = eventPath(root, state, eventId);
    if (existsSync(path)) {
      const event = readJsonFile(path, "Relay event");
      validateStoredEvent(path, event);
      return [state, path, event];
    }
  }
  throw new CommandError(`event not found: ${eventId}`);
}

function inboxAck(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const eventId = validateEventId(args.event_id);
  const result = withInboxTransition(root, (): JsonObject => {
    const [state, path, event] = locateEvent(root, eventId, ["processing", "acknowledged", "pending"]);
    const actor = validateAgentId(args.by || event.to_agent, "Inbox acknowledgement actor");
    requireManagedAgentIdentity(actor, "Inbox acknowledgement");
    if (event.to_agent !== actor) {
      if (state === "acknowledged" || event.ack) throw new CommandError(`event ${eventId} was not acknowledged by ${actor}`);
      throw new CommandError(`event ${eventId} is not claimed by ${actor}`);
    }
    const retryReplay = recoverStagedInboxRetry(root, path, event);
    if (retryReplay?.active) throw new CommandError(`event retry completed; claim again before acknowledgement: ${eventId}`);
    if (recoverStagedInboxDeadLetter(root, path, event)) throw new CommandError(`cannot acknowledge dead-lettered event: ${eventId}`);
    if (resolveLegacyDeadLetterSource(root, path, event)) throw new CommandError(`cannot acknowledge dead-lettered event: ${eventId}`);
    if (state === "acknowledged") {
      if (event.to_agent !== actor || event.ack?.by !== actor) throw new CommandError(`event ${eventId} was not acknowledged by ${actor}`);
      ensureInboxAcknowledgement(root, eventId, event);
      return { ok: true, event_id: eventId, already: true };
    }
    if (event.ack) {
      if (event.ack?.by !== actor) throw new CommandError(`event ${eventId} was not acknowledged by ${actor}`);
      const destination = recoverStagedInboxAcknowledgement(root, path, event);
      return { ok: true, event_id: eventId, already: true, recovered: true, path: destination };
    }
    const recoveryReplay = recoverStagedInboxLeaseRecovery(root, path, event);
    if (recoveryReplay?.active) throw new CommandError(`event lease recovery completed; claim again before acknowledgement: ${eventId}`);
    if (state !== "processing") throw new CommandError(`event must be claimed before acknowledgement: ${eventId}`);
    const claimedBy = event.lease?.claimed_by;
    const expiresAt = Number(event.lease?.expires_at_epoch ?? 0);
    if (event.to_agent !== actor || claimedBy !== actor) throw new CommandError(`event ${eventId} is not claimed by ${actor}`);
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) throw new CommandError(`event lease expired; recover and claim again: ${eventId}`);
    retireInboxTransitionEvidence(root, eventId, event);
    event.ack = { at: utcnow(), by: actor, note: args.note, journal_schema: TERMINAL_JOURNAL_SCHEMA };
    delete event.lease;
    const destination = eventPath(root, "acknowledged", eventId);
    atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
    durableRename(path, destination);
    ensureInboxAcknowledgement(root, eventId, event);
    return { ok: true, event_id: eventId, already: false, path: destination };
  });
  if (args.json) jsonPrint(result); else console.log(`acknowledged ${args.event_id}`);
}

function inboxRetry(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const eventId = validateEventId(args.event_id);
  const already = withInboxTransition(root, () => {
    const [state, path, event] = locateEvent(root, eventId, ["processing", "dead-letter", "pending"]);
    const retryReplay = recoverStagedInboxRetry(root, path, event);
    if (retryReplay?.active) return true;
    if (recoverStagedInboxAcknowledgement(root, path, event)) throw new CommandError(`cannot retry acknowledged event: ${eventId}`);
    if (state === "dead-letter") {
      if (!event.dead_letter) throw new CommandError(`dead-lettered event is missing dead-letter evidence: ${eventId}`);
      if (event.dead_letter.journal_schema === undefined) migrateLegacyInboxDeadLetter(root, path, event);
      else ensureInboxDeadLetter(root, eventId, event);
    } else if (recoverStagedInboxDeadLetter(root, path, event)) {
      throw new CommandError(`recovered staged dead-letter; retry again: ${eventId}`);
    } else if (resolveLegacyDeadLetterSource(root, path, event)) {
      throw new CommandError(`recovered legacy staged dead-letter; retry again: ${eventId}`);
    }
    const recoveryReplay = recoverStagedInboxLeaseRecovery(root, path, event);
    if (recoveryReplay?.active) throw new CommandError(`event lease recovery completed; retry requires a claimed or dead-lettered event: ${eventId}`);
    if (state === "pending") throw new CommandError(`event is already pending: ${eventId}`);
    const retryCount = Number(event.retry_count ?? 0);
    if (!Number.isSafeInteger(retryCount) || retryCount < 0 || retryCount >= Number.MAX_SAFE_INTEGER) throw new CommandError(`event has invalid retry_count: ${eventId}`);
    retireInboxTransitionEvidence(root, eventId, event);
    if (state === "processing") delete event.lease;
    const nextRetryCount = retryCount + 1;
    event.retry_count = nextRetryCount;
    event.retry = {
      at: utcnow(),
      from_state: state,
      retry_count: nextRetryCount,
      journal_schema: INBOX_TRANSITION_JOURNAL_SCHEMA,
    };
    atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
    const replay = recoverStagedInboxRetry(root, path, event);
    if (!replay?.active) throw new CommandError(`failed to replay staged retry: ${eventId}`);
    return false;
  });
  console.log(`${already ? "already retried" : "retried"} ${eventId}`);
}

function inboxDeadLetter(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const eventId = validateEventId(args.event_id);
  const already = withInboxTransition(root, () => {
    const [state, path, event] = locateEvent(root, eventId, ["processing", "pending", "dead-letter"]);
    const retryReplay = recoverStagedInboxRetry(root, path, event);
    if (retryReplay?.active && retryReplay.moved) throw new CommandError(`recovered staged retry; dead-letter again if still required: ${eventId}`);
    if (recoverStagedInboxDeadLetter(root, path, event)) return true;
    if (recoverStagedInboxAcknowledgement(root, path, event)) throw new CommandError(`cannot dead-letter acknowledged event: ${eventId}`);
    if (state === "dead-letter") {
      if (!event.dead_letter) throw new CommandError(`dead-lettered event is missing dead-letter evidence: ${eventId}`);
      if (event.dead_letter.journal_schema === undefined) migrateLegacyInboxDeadLetter(root, path, event);
      else ensureInboxDeadLetter(root, eventId, event);
      return true;
    }
    const recoveryReplay = recoverStagedInboxLeaseRecovery(root, path, event);
    if (recoveryReplay?.active && recoveryReplay.moved) throw new CommandError(`recovered staged lease recovery; dead-letter again if still required: ${eventId}`);
    retireInboxTransitionEvidence(root, eventId, event);
    const retryCount = Number(event.retry_count ?? 0);
    if (!Number.isSafeInteger(retryCount) || retryCount < 0) throw new CommandError(`event has invalid retry_count: ${eventId}`);
    delete event.lease;
    event.dead_letter = { at: utcnow(), reason: args.reason, retry_count: retryCount, journal_schema: TERMINAL_JOURNAL_SCHEMA };
    const destination = eventPath(root, "dead-letter", eventId);
    atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`); durableRename(path, destination);
    ensureInboxDeadLetter(root, eventId, event);
    return false;
  });
  console.log(`${already ? "already dead-lettered" : "dead-lettered"} ${eventId}`);
}

function inboxShow(args: JsonObject, _name: string, profile: JsonObject): void {
  const [state, path, event] = locateEvent(relayRoot(profile), args.event_id, ["pending", "processing", "acknowledged", "dead-letter"]);
  jsonPrint({ state, path, event }, true);
}

function relayRecover(name: string, profile: JsonObject, quiet = false): number {
  const root = relayRoot(profile);
  const recovered = withInboxTransition(root, () => {
    let count = 0;
    const now = Math.floor(Date.now() / 1000);
    for (const [path, event] of iterEvents(root, "processing")) {
      const retryReplay = recoverStagedInboxRetry(root, path, event);
      if (retryReplay?.active) { if (retryReplay.moved) count += 1; continue; }
      if (recoverStagedInboxDeadLetter(root, path, event)) { count += 1; continue; }
      if (resolveLegacyDeadLetterSource(root, path, event)) { count += 1; continue; }
      if (recoverStagedInboxAcknowledgement(root, path, event)) { count += 1; continue; }
      const recoveryReplay = recoverStagedInboxLeaseRecovery(root, path, event);
      if (recoveryReplay?.active) { if (recoveryReplay.moved) count += 1; continue; }
      const expires = Number(event.lease?.expires_at_epoch ?? 0);
      if (Number.isFinite(expires) && expires > now) continue;
      const eventId = validateEventId(event.event_id);
      const recoveryCount = Number(event.recovery_count ?? 0);
      if (!Number.isSafeInteger(recoveryCount) || recoveryCount < 0 || recoveryCount >= Number.MAX_SAFE_INTEGER) throw new CommandError(`event has invalid recovery_count: ${eventId}`);
      retireInboxTransitionEvidence(root, eventId, event);
      delete event.lease;
      const nextRecoveryCount = recoveryCount + 1;
      event.recovery_count = nextRecoveryCount;
      event.lease_recovery = { at: utcnow(), recovery_count: nextRecoveryCount, journal_schema: INBOX_TRANSITION_JOURNAL_SCHEMA };
      atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
      const replay = recoverStagedInboxLeaseRecovery(root, path, event);
      if (!replay?.active) throw new CommandError(`failed to replay staged lease recovery: ${eventId}`);
      count += 1;
    }
    for (const [path, event] of iterEvents(root, "pending")) {
      recoverStagedInboxRetry(root, path, event);
      if (recoverStagedInboxDeadLetter(root, path, event)) { count += 1; continue; }
      if (resolveLegacyDeadLetterSource(root, path, event)) { count += 1; continue; }
      if (recoverStagedInboxAcknowledgement(root, path, event)) { count += 1; continue; }
      recoverStagedInboxLeaseRecovery(root, path, event);
    }
    return count;
  });
  if (!quiet) console.log(`recovered ${recovered} event(s)`);
  return recovered;
}

function pendingSignature(root: string, target: string): string {
  const ids = iterEvents(root, "pending").filter(([, event]) => event.to_agent === target).map(([, event]) => event.event_id);
  return ids.length ? createHash("sha256").update(ids.join("\n")).digest("hex") : "";
}

function relayDispatch(name: string, profile: JsonObject, quiet = false): JsonObject {
  ensureState(name, profile);
  const root = relayRoot(profile);
  relayRecover(name, profile, true);
  const statePath = join(root, "wake-state.json");
  const wakeState: JsonObject = existsSync(statePath) ? JSON.parse(readText(statePath)) : {};
  const targets = [...new Set(iterEvents(root, "pending").map(([, event]) => event.to_agent).filter(Boolean))].sort();
  const result: JsonObject = { profile: name, targets: [] };
  for (const target of targets) {
    const signature = pendingSignature(root, target);
    const status = getAgentStatus(name, target);
    const prior = wakeState[target] ?? {};
    const shouldNudge = Boolean(signature) && (profile.relay?.nudge_when ?? ["idle", "done"]).includes(status) && (prior.signature !== signature || !new Set(["idle", "done"]).has(prior.status));
    let nudged = false;
    if (shouldNudge) {
      [nudged] = nudgeAgent(name, target);
      if (nudged) journal(root, { at: utcnow(), action: "event-nudged", to_agent: target, signature });
    }
    wakeState[target] = { signature, status, nudged, observed_at: utcnow() };
    result.targets.push({ agent: target, status, pending_signature: signature, nudged });
  }
  atomicWrite(statePath, `${JSON.stringify(wakeState, null, 2)}\n`);
  if (!quiet) jsonPrint(result);
  return result;
}

async function relayDaemon(name: string, profile: JsonObject): Promise<void> {
  ensureState(name, profile);
  const root = relayRoot(profile);
  const poll = Math.max(1, Number(profile.relay?.poll_seconds ?? 2));
  let stopping = false;
  let wake: (() => void) | null = null;
  const stop = (): void => { stopping = true; wake?.(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  console.log(`hanchou relay daemon started: profile=${name} root=${root}`);
  try {
    while (!stopping) {
      relayDispatch(name, profile, true);
      if (!stopping) await new Promise<void>((resolvePromise) => {
        const timer = setTimeout(resolvePromise, poll * 1000);
        wake = () => { clearTimeout(timer); resolvePromise(); };
      });
      wake = null;
    }
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
  console.log("hanchou relay daemon stopped");
}

function validateDestination(destination: JsonObject): void {
  const kind = destination.type;
  const allowed = new Set(["local_session", "origin", "slack_channel", "slack_thread", "discord_channel", "discord_thread", "file"]);
  if (!allowed.has(kind)) throw new CommandError(`unsupported destination type: ${kind}`);
  if (new Set(["slack_channel", "slack_thread", "discord_channel", "discord_thread"]).has(kind) && !destination.alias && !destination.channel_id) throw new CommandError(`${kind} destination requires alias or channel_id`);
  if (kind === "file" && !destination.path) throw new CommandError("file destination requires path");
}

function locateDelivery(root: string, deliveryId: string, states: string[]): [string, string, JsonObject] {
  validateDeliveryId(deliveryId);
  for (const state of states) {
    const path = deliveryPath(root, state, deliveryId);
    if (existsSync(path)) {
      const delivery = readJsonFile(path, "Delivery record");
      validateStoredDelivery(path, delivery);
      return [state, path, delivery];
    }
  }
  throw new CommandError(`delivery not found: ${deliveryId}`);
}

function deliveryCreate(args: JsonObject, name: string, profile: JsonObject): void {
  ensureState(name, profile);
  const root = relayRoot(profile);
  if (!DELIVERY_KINDS.has(args.kind)) throw new CommandError(`unsupported delivery kind: ${args.kind}`);
  if (!REPORTING_POLICIES.has(args.policy)) throw new CommandError(`unsupported reporting policy: ${args.policy}`);
  if (!DELIVERY_RENDERERS.has(args.renderer)) throw new CommandError(`unsupported renderer: ${args.renderer}`);
  let destination: JsonObject;
  try { destination = JSON.parse(args.destination); }
  catch (error) { throw new CommandError(`invalid --destination JSON: ${error}`); }
  validateDestination(destination);
  const deliveryId = validateDeliveryId(args.delivery_id || `dly_${randomUUID().replaceAll("-", "")}`);
  if (args.source_event) validateEventId(args.source_event);
  const record = {
    schema: "hanchou.delivery.v1", delivery_id: deliveryId, kind: args.kind, task_id: args.task,
    source_event_id: args.source_event, created_at: utcnow(), policy: args.policy, renderer: args.renderer,
    destination, summary: args.summary, body_ref: args.body_ref, dedupe_key: args.dedupe_key,
    coalesce_key: args.coalesce_key, not_before: args.not_before, status: "pending", attempts: 0,
  };
  const path = withDeliveryTransition(root, () => {
    const pendingPath = deliveryPath(root, "pending", deliveryId);
    if (["pending", "rendered", "delivered", "failed"].some((state) => existsSync(deliveryPath(root, state, deliveryId)))) throw new CommandError(`delivery already exists: ${deliveryId}`);
    atomicWrite(pendingPath, `${JSON.stringify(record, null, 2)}\n`);
    journal(root, { at: utcnow(), action: "delivery-created", delivery_id: deliveryId, task_id: args.task });
    return pendingPath;
  });
  const result = { ok: true, delivery_id: deliveryId, path };
  if (args.json) jsonPrint(result); else console.log(`created ${deliveryId}`);
}

function deliveryList(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const states = args.state ? [args.state] : ["pending", "rendered", "delivered", "failed"];
  const rows: JsonObject[] = withDeliveryTransition(root, () => {
    reconcileDeliveryTransitionsUnlocked(root);
    const result: JsonObject[] = [];
    for (const state of states) for (const [path, record] of iterDeliveries(root, state)) {
      if (args.task && record.task_id !== args.task) continue;
      result.push({ state, delivery_id: record.delivery_id, kind: record.kind, task_id: record.task_id, policy: record.policy, renderer: record.renderer, destination: record.destination, summary: record.summary, created_at: record.created_at, path });
    }
    return result;
  });
  if (args.json) jsonPrint(rows, true);
  else {
    if (!rows.length) console.log("delivery queue empty");
    for (const row of rows) console.log(`${String(row.state).padEnd(10)} ${row.delivery_id} ${String(row.kind).padEnd(16)} ${row.task_id || "-"} -> ${row.destination?.type ?? "?"}  ${row.summary}`);
  }
}

function deliveryShow(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [state, path, delivery] = withDeliveryTransition(root, () => {
    reconcileDeliveryTransitionsUnlocked(root);
    return locateDelivery(root, args.delivery_id, ["pending", "rendered", "delivered", "failed"]);
  });
  jsonPrint({ state, path, delivery }, true);
}

function deliveryRendered(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  withDeliveryTransition(root, () => {
    const [state, path, record] = locateDelivery(root, args.delivery_id, ["pending", "rendered"]);
    recoverStagedDeliveryRetry(root, path, record);
    if (recoverStagedDeliveryCompletion(root, path, record)) throw new CommandError(`cannot render delivered record: ${args.delivery_id}`);
    if (recoverStagedDeliveryFailure(root, path, record)) throw new CommandError(`cannot render failed record; retry first: ${args.delivery_id}`);
    if (recoverStagedDeliveryRendered(root, path, record)) {
      console.log(`${state === "rendered" ? "already" : "recovered"} rendered ${args.delivery_id}`);
      return;
    }
    if (state !== "pending" || record.status !== "pending") throw new CommandError(`delivery must be pending before rendering: ${args.delivery_id}`);
    if (args.message && args.message_file) throw new CommandError("use only one of --message or --message-file");
    const message = args.message_file ? readText(args.message_file) : args.message;
    record.rendered = { at: utcnow(), by: args.by, message, attempts: Number(record.attempts ?? 0), journal_schema: TERMINAL_JOURNAL_SCHEMA };
    record.status = "rendered";
    const destination = deliveryPath(root, "rendered", args.delivery_id);
    atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); durableRename(path, destination);
    ensureDeliveryRendered(root, args.delivery_id, record);
    console.log(`rendered ${args.delivery_id}`);
  });
}

function deliveryDelivered(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  withDeliveryTransition(root, () => {
    let [state, path, record] = locateDelivery(root, args.delivery_id, ["pending", "rendered", "delivered"]);
    recoverStagedDeliveryRetry(root, path, record);
    if (state === "delivered") {
      ensureDeliveryCompletion(root, args.delivery_id, record);
      console.log(`already delivered ${args.delivery_id}`);
      return;
    }
    if (recoverStagedDeliveryCompletion(root, path, record)) {
      console.log(`recovered delivered ${args.delivery_id}`);
      return;
    }
    if (recoverStagedDeliveryFailure(root, path, record)) throw new CommandError(`cannot deliver failed record; retry first: ${args.delivery_id}`);
    const recoveredRendered = recoverStagedDeliveryRendered(root, path, record);
    if (recoveredRendered) { state = "rendered"; path = recoveredRendered; }
    if (!new Set(["pending", "rendered"]).has(record.status)) throw new CommandError(`delivery cannot be delivered from status ${record.status}: ${args.delivery_id}`);
    record.delivered = { at: utcnow(), adapter: args.adapter, external_id: args.external_id, note: args.note, journal_schema: TERMINAL_JOURNAL_SCHEMA };
    record.status = "delivered";
    const destination = deliveryPath(root, "delivered", args.delivery_id);
    atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); durableRename(path, destination);
    ensureDeliveryCompletion(root, args.delivery_id, record);
    console.log(`delivered ${args.delivery_id}`);
  });
}

function deliveryFail(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  withDeliveryTransition(root, () => {
    let [state, path, record] = locateDelivery(root, args.delivery_id, ["pending", "rendered", "failed"]);
    const recoveredRetry = recoverStagedDeliveryRetry(root, path, record);
    if (recoveredRetry && resolve(recoveredRetry) !== resolve(path)) throw new CommandError(`recovered staged retry; run fail again: ${args.delivery_id}`);
    if (recoverStagedDeliveryCompletion(root, path, record)) throw new CommandError(`cannot fail delivered record: ${args.delivery_id}`);
    if (recoverStagedDeliveryFailure(root, path, record)) {
      console.log(`${state === "failed" ? "already" : "recovered"} failed ${args.delivery_id}`);
      return;
    }
    const recoveredRendered = recoverStagedDeliveryRendered(root, path, record);
    if (recoveredRendered) { state = "rendered"; path = recoveredRendered; }
    if (!new Set(["pending", "rendered"]).has(record.status)) throw new CommandError(`delivery cannot fail from status ${record.status}: ${args.delivery_id}`);
    const attempts = Number(record.attempts ?? 0) + 1;
    record.failure = { at: utcnow(), reason: args.reason, attempts, journal_schema: TERMINAL_JOURNAL_SCHEMA };
    record.attempts = attempts;
    record.status = "failed";
    const destination = deliveryPath(root, "failed", args.delivery_id);
    atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); durableRename(path, destination);
    ensureDeliveryFailure(root, args.delivery_id, record);
    console.log(`failed ${args.delivery_id}`);
  });
}

function deliveryRetry(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  withDeliveryTransition(root, () => {
    let [state, path, record] = locateDelivery(root, args.delivery_id, ["failed", "pending", "rendered"]);
    if (recoverStagedDeliveryCompletion(root, path, record)) throw new CommandError(`cannot retry delivered record: ${args.delivery_id}`);
    const recoveredRetry = recoverStagedDeliveryRetry(root, path, record);
    if (recoveredRetry) {
      console.log(`${state === "pending" ? "already" : "recovered"} retried ${args.delivery_id}`);
      return;
    }
    if (state === "pending") {
      if (recoverStagedDeliveryFailure(root, path, record)) throw new CommandError(`recovered staged failed record; retry again: ${args.delivery_id}`);
      throw new CommandError(`pending delivery has no retry evidence: ${args.delivery_id}`);
    }
    const recoveredFailed = recoverStagedDeliveryFailure(root, path, record);
    if (!recoveredFailed) throw new CommandError(`delivery must be failed before retry: ${args.delivery_id}`);
    state = "failed";
    path = recoveredFailed;
    record.retry = { at: utcnow(), attempts: Number(record.attempts), journal_schema: TERMINAL_JOURNAL_SCHEMA };
    atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`);
    recoverStagedDeliveryRetry(root, path, record);
    console.log(`retried ${args.delivery_id}`);
  });
}

const DEFAULT_TASK_KINDS: Record<string, string> = {
  "mission-lead": "planning", researcher: "research", implementer: "code", reviewer: "code-review", writer: "writing", editor: "final-prose-review",
};
const LEAF_EXECUTION_ROLES = new Set(["researcher", "implementer", "reviewer", "writer", "editor"]);
const EXECUTION_IDENTITY_FIELDS = ["profile", "project", "repo_path", "execution_mode", "owner_role", "owner_agent", "role"];

function executionRoot(profile: JsonObject): string { return join(profilePaths(profile).control_dir, "executions"); }

function safeComponent(value: string, limit = 48): string {
  let rendered = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  if (!rendered) rendered = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return rendered.slice(0, limit);
}

function executionPath(profile: JsonObject, taskId: string): string {
  const digest = createHash("sha256").update(taskId).digest("hex").slice(0, 10);
  return join(executionRoot(profile), `${safeComponent(taskId, 36)}-${digest}.json`);
}

function loadExecution(profile: JsonObject, taskId: string): JsonObject | null {
  const path = executionPath(profile, taskId);
  if (!existsSync(path)) return null;
  let record: any;
  try { record = JSON.parse(readText(path)); }
  catch (error) { throw new CommandError(`cannot read execution record ${path}: ${error}`); }
  if (!record || typeof record !== "object" || Array.isArray(record) || record.task_id !== taskId) throw new CommandError(`invalid execution record: ${path}`);
  return record;
}

function saveExecution(profile: JsonObject, record: JsonObject): string {
  record.updated_at = utcnow();
  const path = executionPath(profile, String(record.task_id));
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

function iterExecutions(profile: JsonObject): JsonObject[] {
  const root = executionRoot(profile);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => name.endsWith(".json")).sort().flatMap((name) => {
    try {
      const record = JSON.parse(readText(join(root, name)));
      return record && typeof record === "object" && record.task_id ? [record] : [];
    } catch { return []; }
  });
}

function executionLock<T>(profile: JsonObject, taskId: string, operation: () => T): T {
  const digest = createHash("sha256").update(taskId).digest("hex").slice(0, 16);
  return withLock(join(relayRoot(profile), "locks", `execution-${digest}.lock`), operation);
}

function bdRun(name: string, profile: JsonObject, argv: string[], actor: string | null = null, check = true): RunResult {
  const command = [commandPath("bd")];
  if (actor) command.push("--actor", actor);
  command.push(...argv);
  return run(command, { env: profileEnv(name, profile), cwd: profilePaths(profile).control_dir, check, capture: true });
}

function findBeadRecord(value: any, taskId: string): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.id === taskId) return value;
    for (const key of ["issue", "bead", "result", "issues", "data"]) if (key in value) { const record = findBeadRecord(value[key], taskId); if (record) return record; }
  } else if (Array.isArray(value)) for (const child of value) { const record = findBeadRecord(child, taskId); if (record) return record; }
  return null;
}

function loadBead(name: string, profile: JsonObject, taskId: string): JsonObject {
  const record = findBeadRecord(parseJsonOutput(bdRun(name, profile, ["show", taskId, "--json"])), taskId);
  if (!record) throw new CommandError(`cannot find Bead in JSON response: ${taskId}`);
  return record;
}

function beadMetadata(bead: JsonObject): JsonObject {
  let metadata = bead.metadata;
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(metadata); }
    catch { throw new CommandError(`Bead ${bead.id} metadata is not valid JSON`); }
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new CommandError(`Bead ${bead.id} requires hanchou.task.v1 metadata`);
  return clone(metadata);
}

function validateTaskMetadata(metadata: JsonObject, name: string, taskId: string): void {
  if (metadata.schema !== "hanchou.task.v1") throw new CommandError(`Bead ${taskId} metadata schema must be hanchou.task.v1`);
  for (const key of ["profile", "project", "owner_role", "owner_agent"]) if (typeof metadata[key] !== "string" || !metadata[key].trim()) throw new CommandError(`Bead ${taskId} metadata requires non-empty ${key}`);
  if (metadata.profile !== name) throw new CommandError(`Bead ${taskId} belongs to profile ${metadata.profile}, not ${name}`);
  if (metadata.execution_mode !== "leaf") throw new CommandError(`Bead ${taskId} execution_mode must be leaf; mission dispatch is not implemented`);
  if (typeof metadata.repo_path !== "string" || !metadata.repo_path.trim()) throw new CommandError(`Bead ${taskId} metadata requires repo_path`);
  const role = metadata.role;
  if (typeof role !== "string" || !LEAF_EXECUTION_ROLES.has(role)) throw new CommandError(`Bead ${taskId} has unsupported execution role: ${role}`);
  const rolePath = join(ROOT, "roles", role, "role.toml");
  if (!existsSync(rolePath)) throw new CommandError(`role definition not found: ${rolePath}`);
  if (loadToml(rolePath).name !== role) throw new CommandError(`role definition mismatch: ${rolePath}`);
}

function updateBeadMetadata(name: string, profile: JsonObject, taskId: string, metadata: JsonObject, actor: string, claim = false, status: string | null = null): void {
  const argv = ["update", taskId];
  if (claim) argv.push("--claim");
  if (status) argv.push("--status", status);
  argv.push("--metadata", JSON.stringify(metadata), "--json");
  bdRun(name, profile, argv, actor);
}

function gitInspectionEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "SYSTEMROOT"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.HOME = operatorHome();
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  env.GIT_ATTR_NOSYSTEM = "1";
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

function inspectGit(repo: string, args: string[], check = true, safeRuntime = true): RunResult {
  const runtime = safeRuntime ? ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"] : [];
  return run([commandPath("git"), ...runtime, "-C", repo, ...args], {
    env: gitInspectionEnvironment(),
    capture: true,
    check,
  });
}

function configuredExternalGitFilters(repo: string): string[] {
  const proc = inspectGit(
    repo,
    ["config", "--includes", "--get-regexp", "^filter\\..*\\.(clean|smudge|process)$"],
    false,
    false,
  );
  if (proc.returncode === 1) return [];
  if (proc.returncode !== 0) {
    const detail = (proc.stderr || proc.stdout).trim();
    throw new CommandError(`cannot inspect repository Git filters${detail ? `: ${detail}` : ""}`);
  }
  return proc.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function validateRepo(repo: string): string {
  if (!isDirectory(repo)) throw new CommandError(`repository directory not found: ${repo}`);
  const top = realpathSync(inspectGit(repo, ["rev-parse", "--show-toplevel"]).stdout.trim());
  if (top !== realpathSync(repo)) throw new CommandError(`repo_path must be the Git top level: ${repo} (top level is ${top})`);
  inspectGit(repo, ["rev-parse", "--verify", "HEAD"]);
  const commonValue = inspectGit(repo, ["rev-parse", "--git-common-dir"]).stdout.trim();
  const commonPath = realpathSync(isAbsolute(commonValue) ? commonValue : resolve(repo, commonValue));
  if (!pathWithin(repo, commonPath, true)) {
    throw new CommandError(`repository Git common directory must stay inside the authorized repository: ${commonPath}`);
  }
  validateAuthorityComponent(commonPath, "repository Git common directory", false);
  const filters = configuredExternalGitFilters(repo);
  if (filters.length) {
    throw new CommandError(`repository has external Git clean/smudge/process filters; remove them before dispatch: ${filters.join(", ")}`);
  }
  if (inspectGit(repo, ["status", "--porcelain", "--untracked-files=normal", "--no-ahead-behind"]).stdout.trim()) throw new CommandError(`repository must be clean before dispatch: ${repo}`);
  return repo;
}

function taskRoutingMetadata(route: JsonObject, profile: JsonObject): JsonObject {
  return { role: route.role, task_kind: route.task_kind, provider: route.provider, model: route.model, reason: route.reason, usage_snapshot_updated_at: loadUsageSnapshot(profile).updated_at };
}

function taskExecutionIdentity(metadata: JsonObject): JsonObject {
  return Object.fromEntries(EXECUTION_IDENTITY_FIELDS.map((key) => [key, clone(metadata[key])]));
}

function validateExecutionIdentity(metadata: JsonObject, expected: JsonObject, taskId: string): void {
  const changed = EXECUTION_IDENTITY_FIELDS.filter((key) => JSON.stringify(metadata[key]) !== JSON.stringify(expected[key]));
  if (changed.length) throw new CommandError(`Bead ${taskId} execution identity changed in: ${changed.join(", ")}`);
}

function executionTaskMetadata(
  metadata: JsonObject,
  profile: JsonObject,
  parameters: {
    executionId: string; route: JsonObject; session: string; agentName: string; kind: string;
    bindingState: string; branch: string; worktreePath: string; workspaceId?: string | null;
    tabId?: string | null; paneId?: string | null; providerSessionId?: string | null;
  },
): JsonObject {
  const result = clone(metadata);
  result.execution_id = parameters.executionId;
  result.routing = taskRoutingMetadata(parameters.route, profile);
  result.herdr = {
    session: parameters.session, agent_name: parameters.agentName, kind: parameters.kind,
    workspace_id: parameters.workspaceId ?? null, tab_id: parameters.tabId ?? null, pane_id: parameters.paneId ?? null,
    provider_session_id: parameters.providerSessionId ?? null, binding_state: parameters.bindingState,
    worktree_path: parameters.worktreePath, branch: parameters.branch,
  };
  if (result.reporting === null || result.reporting === undefined) {
    result.reporting = {
      policy: profile.reporting?.default_child_task_policy ?? "parent_only",
      renderer: profile.reporting?.default_renderer ?? "orchestrator",
      destination: { type: "local_session", agent: result.owner_agent }, coalesce: "root_task", digest_key: null,
      origin: { type: "local_session", agent: result.owner_agent },
    };
  }
  return result;
}

function patchExecutionMetadata(
  name: string,
  profile: JsonObject,
  taskId: string,
  executionId: string,
  desired: JsonObject,
  expectedIdentity: JsonObject,
  claim = false,
  status: string | null = null,
): JsonObject {
  const bead = loadBead(name, profile, taskId);
  const latest = beadMetadata(bead);
  validateTaskMetadata(latest, name, taskId);
  validateExecutionIdentity(latest, expectedIdentity, taskId);
  const observed = latest.execution_id;
  if (![null, undefined, "", executionId].includes(observed)) throw new CommandError(`Bead ${taskId} execution ownership conflict: expected ${executionId}, observed ${observed}`);
  const patch: JsonObject = { execution_id: executionId };
  for (const key of ["routing", "herdr"]) if (key in desired) patch[key] = clone(desired[key]);
  if ((latest.reporting === null || latest.reporting === undefined) && desired.reporting !== null && desired.reporting !== undefined) patch.reporting = clone(desired.reporting);
  updateBeadMetadata(name, profile, taskId, patch, String(latest.owner_agent), claim, status);
  return { ...clone(latest), ...patch };
}

function nestedValue(value: any, key: string): any {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value[key] !== null && value[key] !== undefined) return value[key];
    for (const child of Object.values(value)) { const candidate = nestedValue(child, key); if (candidate !== null && candidate !== undefined) return candidate; }
  } else if (Array.isArray(value)) for (const child of value) { const candidate = nestedValue(child, key); if (candidate !== null && candidate !== undefined) return candidate; }
  return null;
}

function createExecutionWorktree(name: string, profile: JsonObject, repo: string, baseCommit: string, branch: string, worktreePath: string, label: string, agentName: string): [string, string, string] {
  const managedAgentId = validateAgentId(agentName, "managed Agent ID");
  const proc = run(herdrArgv(name, "worktree", "create", "--cwd", repo, "--base", baseCommit, "--branch", branch, "--path", worktreePath, "--label", label, "--no-focus"), { env: profileEnv(name, profile), capture: true, timeout: 120_000 });
  const value = parseJsonOutput(proc);
  const workspaceId = value?.result?.workspace?.workspace_id;
  const initialTabId = value?.result?.tab?.tab_id;
  const createdWorktreePath = value?.result?.worktree?.path;
  if (typeof workspaceId !== "string" || typeof initialTabId !== "string" || typeof createdWorktreePath !== "string") throw new CommandError(`cannot read workspace/tab/worktree from Herdr worktree response: ${pyCompact(value)}`);
  if (resolve(createdWorktreePath) !== resolve(worktreePath)) throw new CommandError(`Herdr created an unexpected worktree path: ${createdWorktreePath}`);
  const tabProc = run(herdrArgv(name, "tab", "create", "--workspace", workspaceId, "--cwd", createdWorktreePath, "--label", managedAgentId, "--env", `HANCHOU_AGENT_ID=${managedAgentId}`, "--no-focus"), { env: profileEnv(name, profile), capture: true, timeout: 120_000 });
  const tabValue = parseJsonOutput(tabProc);
  const tabId = tabValue?.result?.tab?.tab_id;
  const paneId = tabValue?.result?.root_pane?.pane_id;
  if (typeof tabId !== "string" || typeof paneId !== "string") throw new CommandError(`cannot read tab/pane IDs from Herdr tab response: ${pyCompact(tabValue)}`);
  run(herdrArgv(name, "tab", "close", initialTabId), { env: profileEnv(name, profile), capture: true, timeout: 30_000 });
  return [workspaceId, tabId, paneId];
}

function safeAgentName(taskId: string, executionId: string, role: string): string {
  const digest = createHash("sha256").update(`${taskId}:${executionId}`).digest("hex").slice(0, 10);
  const rolePart = role.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 15).replace(/^[-_]+|[-_]+$/g, "") || "worker";
  return `hch_${digest}_${rolePart}`.slice(0, 32);
}

export function workerAgentArgv(
  name: string,
  profile: JsonObject,
  agentName: string,
  paneId: string,
  route: JsonObject,
  role: string,
  reportPath: string,
  workspaceId: string | null = null,
  tabId: string | null = null,
): string[] {
  const kind = route.provider;
  const managedAgentId = validateAgentId(agentName, "managed Agent ID");
  const argv = herdrArgv(name, "agent", "start", managedAgentId, "--kind", kind, "--pane", paneId, "--timeout", "120000", "--");
  const paths = profilePaths(profile);
  if (kind === "claude") {
    const roleData = loadToml(join(ROOT, "roles", role, "role.toml"));
    const claude = roleData.claude;
    if (!claude || typeof claude !== "object" || claude.enabled === false) throw new CommandError(`Claude execution is disabled for role: ${role}`);
    let permissionMode = claude.permission_mode;
    const tools = claude.tools;
    if (typeof permissionMode !== "string" || !permissionMode) throw new CommandError(`role ${role} requires claude.permission_mode`);
    if (permissionMode === "default") permissionMode = "auto";
    if (!Array.isArray(tools) || !tools.length || !tools.every((tool) => typeof tool === "string" && tool)) throw new CommandError(`role ${role} requires non-empty claude.tools`);
    return [...argv, "--model", route.model, "--permission-mode", permissionMode, "--tools", tools.join(","), "--add-dir", dirname(reportPath), "--add-dir", paths.relay_dir];
  }
  const sessionDirectory = join(operatorHome(), ".config", "herdr", "sessions", name);
  if (typeof workspaceId !== "string" || !workspaceId || typeof tabId !== "string" || !tabId) {
    throw new CommandError("Codex worker startup requires Herdr workspace and tab IDs");
  }
  return [
    ...argv,
    "-m", route.model,
    "--sandbox", "workspace-write",
    "--approve-for-me",
    "--add-dir", dirname(reportPath),
    "--add-dir", paths.relay_dir,
    "--add-dir", sessionDirectory,
    ...codexManagedNetworkArgs(name),
    ...codexManagedEnvironmentArgs(name, profile, managedAgentId, paneId, workspaceId, tabId),
  ];
}

function providerSessionId(agent: JsonObject): string | null {
  const session = agent.agent_session;
  if (!session || typeof session !== "object" || Array.isArray(session)) return null;
  for (const key of ["agent_session_id", "session_id", "id", "value"]) if (typeof session[key] === "string" && session[key]) return session[key];
  return null;
}

function beadText(bead: JsonObject, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = bead[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) return value.map(String).join("\n");
  }
  return fallback;
}

function activeBeadBlockers(bead: JsonObject): string[] {
  if (!Array.isArray(bead.dependencies)) return [];
  return bead.dependencies.filter((dependency: any) => dependency && typeof dependency === "object" && dependency.dependency_type === "blocks" && dependency.status !== "closed").map((dependency: any) => String(dependency.id || "unknown"));
}

function buildWorkerPrompt(name: string, bead: JsonObject, metadata: JsonObject, record: JsonObject): string {
  const taskId = String(bead.id);
  const role = String(metadata.role);
  const ownerAgent = String(metadata.owner_agent);
  const ownerRole = String(metadata.owner_role);
  const depth = ownerRole === "mission-lead" ? 2 : 1;
  const reportPath = String(record.report_path);
  const title = beadText(bead, ["title"], taskId);
  const description = beadText(bead, ["description", "body"], "No additional description supplied.");
  const acceptance = beadText(bead, ["acceptance_criteria", "acceptance"], "Complete the bounded request and verify the result.");
  const roleContract = readText(join(ROOT, "roles", role, "ROLE.md")).trim();
  const taskAction = new Set(["researcher", "reviewer"]).has(role)
    ? "Do not modify the project worktree. Perform the bounded analysis, run the stated verification, and write the findings to the durable report path. Use the current worktree HEAD as the `commit:<sha>` provenance artifact; do not create an empty commit."
    : "Implement the task, run the stated verification, commit the result, and write a bounded final report to the durable report path.";
  const relayPrefix = `hanchou --profile ${shellQuote(name)} relay emit --task ${shellQuote(taskId)} --execution ${shellQuote(String(record.execution_id))} --from-agent ${shellQuote(String(record.agent_name))} --from-role ${shellQuote(role)} --to-agent ${shellQuote(ownerAgent)} --to-role ${shellQuote(ownerRole)} --delegation-depth ${depth}`;
  return `Execute exactly one bounded Hanchou task as the \`${role}\` worker.
Load and follow the \`hanchou-worker\` and \`hanchou-relay\` Skills before working.

Canonical role contract:
${roleContract}

Task ID: ${taskId}
Title: ${title}
Description:
${description}

Acceptance criteria:
${acceptance}

Repository/worktree: ${record.worktree_path}
Branch: ${record.branch}
Durable report: ${reportPath}

Make project changes only in this worktree. Outside it, write only the exact
durable report path above and use the Hanchou CLI for the assigned Relay event.
Never edit Beads, Delivery, schedule, or Relay state directly. Do not contact
the human or spawn another Herdr agent. ${taskAction}
Then emit exactly one terminal Relay event. For success, run:

${relayPrefix} --type completed --summary '<bounded outcome>' --detail-ref ${shellQuote(reportPath)} --artifact commit:<sha> --verification '<command/result>' --json

For an unrecoverable failure, write the diagnosis to the same report path and
run the same command with \`--type failed\` and an accurate summary/artifact/
verification. The Relay record, not terminal prose, is the completion signal.
`;
}

function promptWorkerAgent(name: string, profile: JsonObject, bead: JsonObject, metadata: JsonObject, record: JsonObject, agent: JsonObject): string {
  if (record.prompted_at) return executionPath(profile, String(record.task_id));
  const prompt = buildWorkerPrompt(name, bead, metadata, record);
  const baseline = agent.state_change_seq;
  record.phase = "prompting"; record.prompt_attempted_at = utcnow();
  if (Number.isInteger(baseline)) record.prompt_baseline_state_change_seq = baseline;
  saveExecution(profile, record);
  const promptArgv = herdrArgv(name, "agent", "prompt", String(record.agent_name), prompt, "--wait", "--until", "working", "--until", "idle", "--until", "done", "--until", "blocked", "--timeout", "10000");
  const displayArgv = promptArgv.map((value) => value === prompt ? "<redacted-prompt>" : value);
  run(promptArgv, { capture: true, timeout: 15_000, displayArgv, redactOutput: true });
  record.phase = "prompted"; record.prompted_at = utcnow();
  return saveExecution(profile, record);
}

function executionEvents(profile: JsonObject, taskId: string): JsonObject[] {
  const root = relayRoot(profile); const rows: JsonObject[] = [];
  for (const state of ["pending", "processing", "acknowledged", "dead-letter"]) for (const [path, event] of iterEvents(root, state)) if (event.task_id === taskId) rows.push({ state, path, event });
  return rows;
}

function eventMatchesExecution(event: JsonObject, record: JsonObject): boolean {
  const expectedDepth = record.owner_role === "mission-lead" ? 2 : 1;
  return event.task_id === record.task_id && event.execution_id === record.execution_id && event.from_agent === record.agent_name && event.from_role === record.role && event.to_agent === record.owner_agent && event.to_role === record.owner_role && event.delegation_depth === expectedDepth;
}

function completionEvidenceAnomalies(event: JsonObject, record: JsonObject): string[] {
  const eventId = String(event.event_id || "unknown");
  const prefix = `terminal event ${eventId}`;
  const anomalies: string[] = [];
  const reportValue = record.report_path;
  const detailRef = event.detail_ref;
  if (typeof reportValue !== "string" || !reportValue) anomalies.push(`${prefix} has no execution report path`);
  else {
    const reportPath = expand(reportValue);
    if (typeof detailRef !== "string" || !detailRef) anomalies.push(`${prefix} has no detail_ref`);
    else if (detailRef !== reportValue) anomalies.push(`${prefix} detail_ref does not match the execution report path`);
    if (!isFile(reportPath)) anomalies.push(`${prefix} execution report does not exist`);
  }
  if (!Array.isArray(event.verification) || !event.verification.length || !event.verification.every((item: any) => typeof item === "string" && item.trim())) anomalies.push(`${prefix} has no valid verification evidence`);
  if (event.type !== "completed") return anomalies;
  const commitRefs = Array.isArray(event.artifacts) ? event.artifacts.filter((item: any) => typeof item === "string" && item.startsWith("commit:")).map((item: string) => item.slice("commit:".length)) : [];
  if (commitRefs.length !== 1) { anomalies.push(`${prefix} must have exactly one commit artifact`); return anomalies; }
  const commitRef = commitRefs[0];
  if (!/^[0-9a-fA-F]{7,64}$/.test(commitRef)) { anomalies.push(`${prefix} has an invalid commit artifact`); return anomalies; }
  const worktreeValue = record.worktree_path;
  if (typeof worktreeValue !== "string" || !worktreeValue) { anomalies.push(`${prefix} has no execution worktree path`); return anomalies; }
  const worktreePath = expand(worktreeValue);
  if (!isDirectory(worktreePath)) { anomalies.push(`${prefix} execution worktree does not exist`); return anomalies; }
  try {
    const head = inspectGit(worktreePath, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim();
    const reported = inspectGit(worktreePath, ["rev-parse", "--verify", `${commitRef}^{commit}`]).stdout.trim();
    if (reported !== head) anomalies.push(`${prefix} commit artifact does not match worktree HEAD`);
  } catch (error) { anomalies.push(`${prefix} commit artifact cannot be verified: ${error instanceof Error ? error.message : error}`); }
  return anomalies;
}

function executionDeliveries(profile: JsonObject, taskId: string): JsonObject[] {
  const root = relayRoot(profile);
  return withDeliveryTransition(root, () => {
    reconcileDeliveryTransitionsUnlocked(root);
    const rows: JsonObject[] = [];
    for (const state of ["pending", "rendered", "delivered", "failed"]) for (const [path, delivery] of iterDeliveries(root, state)) if (delivery.task_id === taskId) rows.push({ state, path, delivery });
    return rows;
  });
}

function executionDispatch(args: JsonObject, name: string, profile: JsonObject): void {
  ensureState(name, profile);
  mkdirSync(executionRoot(profile), { recursive: true });
  const taskId = args.task_id;
  executionLock(profile, taskId, () => {
    if (loadExecution(profile, taskId)) throw new CommandError(`execution already exists for ${taskId}; use execution inspect/reconcile`);
    const bead = loadBead(name, profile, taskId);
    let metadata = beadMetadata(bead);
    validateTaskMetadata(metadata, name, taskId);
    if (![null, undefined, ""].includes(metadata.execution_id)) throw new CommandError(`Bead ${taskId} is already owned by execution ${metadata.execution_id}`);
    if (bead.status !== "open") throw new CommandError(`Bead ${taskId} must be open before dispatch (status=${bead.status})`);
    const blockers = activeBeadBlockers(bead);
    if (blockers.length) throw new CommandError(`Bead ${taskId} has active blockers: ${blockers.join(", ")}`);
    const projectAuthorization = authorizeProjectRepository(name, String(metadata.project), String(metadata.repo_path));
    const repo = validateRepo(projectAuthorization.repo_path);
    const baseCommit = inspectGit(repo, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim();
    if (!baseCommit) throw new CommandError(`cannot resolve repository HEAD commit: ${repo}`);
    const role = String(metadata.role);
    const taskKind = String(metadata.routing?.task_kind || DEFAULT_TASK_KINDS[role]);
    const route = resolveRoute(name, profile, role, taskKind, new Set(["writer", "editor"]).has(role));
    const executionId = `exe_${randomUUID().replaceAll("-", "")}`;
    const agentName = safeAgentName(taskId, executionId, role);
    const branch = `hanchou/${safeComponent(taskId, 28).toLowerCase()}-${executionId.slice(-8)}`;
    const worktreePath = join(profilePaths(profile).worktree_dir, safeComponent(taskId), executionId);
    const reportPath = join(profilePaths(profile).report_dir, safeComponent(taskId), `${executionId}.md`);
    mkdirSync(dirname(reportPath), { recursive: true });
    const kind = String(route.provider);
    const taskIdentity = taskExecutionIdentity(metadata);
    const record: JsonObject = {
      schema: "hanchou.execution.v1", execution_id: executionId, task_id: taskId, phase: "created", created_at: utcnow(),
      repo_path: repo, base_commit: baseCommit, worktree_path: worktreePath, branch, report_path: reportPath,
      project_authorization: projectAuthorization,
      role, owner_role: metadata.owner_role, owner_agent: metadata.owner_agent, task_identity: taskIdentity,
      route: taskRoutingMetadata(route, profile), herdr_session: name, agent_name: agentName, kind,
      workspace_id: null, tab_id: null, pane_id: null, provider_session_id: null,
    };
    saveExecution(profile, record);
    let claimed = false;
    let taskMetadata = executionTaskMetadata(metadata, profile, { executionId, route, session: name, agentName, kind, bindingState: "pending", branch, worktreePath });
    let agent: JsonObject = {};
    let path = executionPath(profile, taskId);
    try {
      taskMetadata = patchExecutionMetadata(name, profile, taskId, executionId, taskMetadata, taskIdentity, true);
      claimed = true; record.phase = "claimed"; saveExecution(profile, record);
      const [workspaceId, tabId, paneId] = createExecutionWorktree(name, profile, repo, baseCommit, branch, worktreePath, `${taskId} ${role}`, agentName);
      Object.assign(record, { phase: "workspace_created", workspace_id: workspaceId, tab_id: tabId, pane_id: paneId }); saveExecution(profile, record);
      const started = run(workerAgentArgv(name, profile, agentName, paneId, route, role, reportPath, workspaceId, tabId), { env: profileEnv(name, profile), check: false, capture: true, timeout: 140_000 });
      agent = getAgentInfo(name, agentName, true) ?? {};
      if (!Object.keys(agent).length) {
        if (started.returncode !== 0) throw new CommandError(`Herdr could not start ${agentName}: ${(started.stderr || started.stdout).trim()}`);
        throw new CommandError(`Herdr started worker but did not register ${agentName}`);
      }
      record.provider_session_id = providerSessionId(agent);
      record.phase = started.returncode !== 0 ? "awaiting_ready" : "agent_started";
      if (started.returncode !== 0) record.start_error = (started.stderr || started.stdout).trim();
      saveExecution(profile, record);
      taskMetadata = executionTaskMetadata(taskMetadata, profile, {
        executionId, route, session: name, agentName, kind, bindingState: "live", branch, worktreePath,
        workspaceId, tabId, paneId, providerSessionId: record.provider_session_id,
      });
      taskMetadata = patchExecutionMetadata(name, profile, taskId, executionId, taskMetadata, taskIdentity);
      if (record.phase === "awaiting_ready") {
        path = saveExecution(profile, record);
        journal(relayRoot(profile), { at: utcnow(), action: "execution-awaiting-ready", task_id: taskId, execution_id: executionId, agent: agentName, agent_status: findAgentStatus(agent) });
      } else {
        path = promptWorkerAgent(name, profile, bead, taskMetadata, record, agent);
        agent = getAgentInfo(name, agentName, true) ?? agent;
        journal(relayRoot(profile), { at: utcnow(), action: "execution-dispatched", task_id: taskId, execution_id: executionId, agent: agentName });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedPhase = String(record.phase);
      const agentStarted = new Set(["agent_started", "awaiting_ready", "prompting", "prompted"]).has(failedPhase);
      record.phase = "attention_required"; record.failed_phase = failedPhase; record.error = message; saveExecution(profile, record);
      if (claimed) {
        const failedMetadata = executionTaskMetadata(taskMetadata, profile, {
          executionId, route, session: name, agentName, kind, bindingState: agentStarted ? "live" : "lost", branch, worktreePath,
          workspaceId: record.workspace_id, tabId: record.tab_id, paneId: record.pane_id, providerSessionId: record.provider_session_id,
        });
        try { patchExecutionMetadata(name, profile, taskId, executionId, failedMetadata, taskIdentity, false, "blocked"); }
        catch (updateError) { record.bead_update_error = updateError instanceof Error ? updateError.message : String(updateError); saveExecution(profile, record); }
      }
      throw new CommandError(`execution dispatch failed after ${failedPhase}: ${message}`);
    }
    const result = {
      ok: true, task_id: taskId, execution_id: executionId, phase: record.phase, agent_name: agentName,
      workspace_id: record.workspace_id, tab_id: record.tab_id, pane_id: record.pane_id, worktree_path: worktreePath, branch,
      project_authorization: projectAuthorization,
      record_path: path, agent_status: findAgentStatus(agent), requires_ready_reconcile: record.phase === "awaiting_ready",
    };
    if (args.json) jsonPrint(result); else if (record.phase === "awaiting_ready") console.log(`worker ${agentName} is awaiting readiness/trust review in ${record.workspace_id} (${executionId})`); else console.log(`dispatched ${taskId} as ${agentName} in ${record.workspace_id} (${executionId})`);
  });
}

function executionInspection(name: string, profile: JsonObject, taskId: string): JsonObject {
  const bead = loadBead(name, profile, taskId);
  const record = loadExecution(profile, taskId);
  const metadata = beadMetadata(bead);
  let agent = null;
  if (record?.agent_name) agent = getAgentInfo(name, String(record.agent_name), true);
  return { task_id: taskId, bead, task_metadata: metadata, execution: record, agent, agent_status: agent ? findAgentStatus(agent) : null, events: executionEvents(profile, taskId), deliveries: executionDeliveries(profile, taskId) };
}

function executionInspect(args: JsonObject, name: string, profile: JsonObject): void {
  const result = executionInspection(name, profile, args.task_id);
  if (args.json) { jsonPrint(result, true); return; }
  const execution = result.execution ?? {};
  console.log(`task:       ${args.task_id} / ${result.bead.status}`);
  console.log(`execution:  ${execution.execution_id ?? "-"} / ${execution.phase ?? "not-dispatched"}`);
  console.log(`agent:      ${execution.agent_name ?? "-"} / ${result.agent_status || "not-running"}`);
  console.log(`events:     ${result.events.length}`);
  console.log(`deliveries: ${result.deliveries.length}`);
}

function deepEqual(left: any, right: any): boolean {
  return JSON.stringify(sortedJson(left)) === JSON.stringify(sortedJson(right));
}

function reconcileExecution(name: string, profile: JsonObject, taskId: string): JsonObject {
  return executionLock(profile, taskId, () => {
    const record = loadExecution(profile, taskId);
    if (!record) throw new CommandError(`execution record not found for ${taskId}`);
    const bead = loadBead(name, profile, taskId);
    let metadata = beadMetadata(bead);
    validateTaskMetadata(metadata, name, taskId);
    const expectedExecutionId = String(record.execution_id || "");
    let expectedIdentity: JsonObject;
    if (record.task_identity && typeof record.task_identity === "object" && !Array.isArray(record.task_identity)) expectedIdentity = record.task_identity;
    else { expectedIdentity = taskExecutionIdentity(metadata); record.task_identity = expectedIdentity; saveExecution(profile, record); }
    let herdr = metadata.herdr && typeof metadata.herdr === "object" && !Array.isArray(metadata.herdr) ? metadata.herdr : {};
    const actions: string[] = [];
    const anomalies: string[] = [];
    let binding = herdr.binding_state;
    const observedExecutionId = metadata.execution_id;
    let message: string | null = null;
    if (!expectedExecutionId || ![null, undefined, "", expectedExecutionId].includes(observedExecutionId)) message = `execution ownership conflict: expected ${expectedExecutionId || "missing"}, observed ${observedExecutionId}`;
    else {
      try { validateExecutionIdentity(metadata, expectedIdentity, taskId); }
      catch (error) { message = error instanceof Error ? error.message : String(error); }
    }
    if (message !== null) {
      record.phase = "attention_required"; record.error = message; saveExecution(profile, record);
      const events = executionEvents(profile, taskId);
      const terminalEvents = events.filter((row) => TERMINAL_TYPES.has(row.event.type));
      const deliveries = executionDeliveries(profile, taskId);
      return { task_id: taskId, execution_id: record.execution_id, phase: record.phase, binding_state: binding, agent_status: null, actions, anomalies: [message], terminal_events: terminalEvents.length, bound_terminal_events: 0, deliveries: deliveries.length };
    }
    if ([null, undefined, ""].includes(observedExecutionId)) {
      metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, { execution_id: expectedExecutionId }, expectedIdentity);
      actions.push("execution-id-restored");
      herdr = metadata.herdr && typeof metadata.herdr === "object" && !Array.isArray(metadata.herdr) ? metadata.herdr : {};
      binding = herdr.binding_state;
    }
    const agentName = String(record.agent_name || herdr.agent_name || "");
    let agent = agentName ? getAgentInfo(name, agentName, true) : null;
    let status = agent ? findAgentStatus(agent) : null;
    if (agent && new Set(["pending", "lost"]).has(binding)) {
      herdr.binding_state = "live";
      herdr.workspace_id = record.workspace_id || herdr.workspace_id;
      herdr.tab_id = record.tab_id || herdr.tab_id;
      herdr.pane_id = record.pane_id || herdr.pane_id;
      herdr.provider_session_id = providerSessionId(agent) || record.provider_session_id;
      metadata.herdr = herdr;
      metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity);
      herdr = metadata.herdr;
      if (record.phase !== "awaiting_ready") record.phase = record.prompted_at ? "prompted" : "agent_started";
      delete record.error; actions.push("binding-restored-live"); binding = "live";
    } else if (!agent && new Set(["pending", "live"]).has(binding)) {
      herdr.binding_state = "lost"; metadata.herdr = herdr;
      metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity, false, bead.status === "closed" ? null : "blocked");
      herdr = metadata.herdr; record.phase = "attention_required"; record.error = "bound Herdr agent is not live";
      actions.push("binding-marked-lost"); anomalies.push("active Bead has no live Herdr agent"); binding = "lost";
    } else if (!agent && binding === "lost") anomalies.push("execution remains recoverable but has no live Herdr agent");

    if (record.phase === "awaiting_ready") {
      if (!agent) anomalies.push("worker awaiting readiness is no longer live");
      else if (new Set(["idle", "done"]).has(status ?? "")) {
        try {
          record.project_authorization = authorizeProjectRepository(name, String(metadata.project), String(metadata.repo_path));
          herdr.binding_state = "live";
          herdr.workspace_id = record.workspace_id || herdr.workspace_id;
          herdr.tab_id = record.tab_id || herdr.tab_id;
          herdr.pane_id = record.pane_id || herdr.pane_id;
          herdr.provider_session_id = providerSessionId(agent) || record.provider_session_id;
          metadata.herdr = herdr;
          metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity, false, bead.status !== "in_progress" ? "in_progress" : null);
          herdr = metadata.herdr; record.phase = "agent_started"; delete record.start_error; saveExecution(profile, record);
          promptWorkerAgent(name, profile, bead, metadata, record, agent);
          actions.push("awaiting-ready-prompted"); binding = "live";
          agent = getAgentInfo(name, agentName, true); status = agent ? findAgentStatus(agent) : null;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          record.phase = "attention_required"; record.failed_phase = "awaiting_ready_authorization_or_prompt"; record.error = detail; saveExecution(profile, record);
          metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity, false, "blocked");
          herdr = metadata.herdr; actions.push("awaiting-ready-prompt-blocked"); anomalies.push(`worker became ready but authorization or prompt delivery failed: ${detail}`);
        }
      } else anomalies.push(`worker is awaiting readiness (agent status=${status || "unknown"})`);
    }

    const events = executionEvents(profile, taskId);
    const terminalEvents = events.filter((row) => TERMINAL_TYPES.has(row.event.type));
    const boundTerminalEvents = terminalEvents.filter((row) => eventMatchesExecution(row.event, record));
    const acknowledgedBound = boundTerminalEvents.filter((row) => row.state === "acknowledged");
    let validAcknowledgedTerminal: JsonObject | null = null;
    const evidenceAnomalies: string[] = [];
    for (const row of acknowledgedBound) {
      const rowAnomalies = completionEvidenceAnomalies(row.event, record);
      if (!rowAnomalies.length && validAcknowledgedTerminal === null) validAcknowledgedTerminal = row;
      evidenceAnomalies.push(...rowAnomalies);
    }
    if (terminalEvents.length && !boundTerminalEvents.length) anomalies.push("terminal Relay events exist for the task but none match this execution binding");
    anomalies.push(...evidenceAnomalies);
    const deliveries = executionDeliveries(profile, taskId);
    const reporting = metadata.reporting && typeof metadata.reporting === "object" && !Array.isArray(metadata.reporting) ? metadata.reporting : {};
    const policy = reporting.policy ?? "on_terminal";
    const terminalType = validAcknowledgedTerminal?.event.type ?? null;
    const deliveryRequired = !new Set(["silent", "parent_only"]).has(policy) && !(policy === "on_failure" && terminalType !== "failed");
    const terminalEventId = validAcknowledgedTerminal?.event.event_id ?? null;
    const sourceDeliveries = deliveries.filter((row) => row.delivery.source_event_id === terminalEventId);
    const matchingDeliveries = sourceDeliveries.filter((row) => row.state === "delivered" && row.delivery.kind === "task_terminal" && row.delivery.policy === policy && row.delivery.renderer === (reporting.renderer ?? "orchestrator") && deepEqual(row.delivery.destination, reporting.destination));
    const deliveryDelivered = sourceDeliveries.length === 1 && matchingDeliveries.length === 1;
    if (bead.status === "closed" && validAcknowledgedTerminal && (!deliveryRequired || deliveryDelivered) && binding !== "settled") {
      herdr.binding_state = "settled"; metadata.herdr = herdr;
      metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity);
      herdr = metadata.herdr; record.phase = "settled"; record.settled_at = utcnow(); actions.push("binding-settled"); binding = "settled";
    } else if (new Set(["idle", "done"]).has(status ?? "") && !boundTerminalEvents.length && bead.status !== "closed") anomalies.push("Herdr agent is settled but no terminal Relay event matches this execution binding");
    if (bead.status === "closed" && !validAcknowledgedTerminal) anomalies.push("closed Bead has no valid acknowledged terminal Relay event for this execution");
    if (bead.status === "closed" && deliveryRequired) {
      if (!sourceDeliveries.length) anomalies.push("closed root Bead has no Delivery for its terminal event");
      else if (sourceDeliveries.length > 1) anomalies.push("closed root Bead has multiple Delivery records for its terminal event");
      else if (!matchingDeliveries.length) anomalies.push("closed root Bead has no contract-matching delivered Delivery for its terminal event");
    }
    saveExecution(profile, record);
    return { task_id: taskId, execution_id: record.execution_id, phase: record.phase, binding_state: binding, agent_status: status, actions, anomalies, terminal_events: terminalEvents.length, bound_terminal_events: boundTerminalEvents.length, deliveries: deliveries.length };
  });
}

function executionReconcile(args: JsonObject, name: string, profile: JsonObject): void {
  ensureState(name, profile); mkdirSync(executionRoot(profile), { recursive: true }); relayRecover(name, profile, true);
  const taskIds = args.task_id ? [args.task_id] : iterExecutions(profile).map((record) => String(record.task_id));
  const results = taskIds.map((taskId) => reconcileExecution(name, profile, taskId));
  if (args.json) { jsonPrint(args.task_id && results.length ? results[0] : results, true); return; }
  if (!results.length) console.log("no execution records");
  for (const result of results) console.log(`${result.task_id}: ${result.phase} / ${result.binding_state} / actions=${result.actions.length} anomalies=${result.anomalies.length}`);
}

function dashboardUrl(profile: JsonObject): string {
  const host = String(profile.ui.dashboard_host);
  const port = Number(profile.ui.dashboard_port);
  if (host !== "127.0.0.1" && host !== "::1") throw new CommandError(`dashboard host must be loopback: ${host}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CommandError(`dashboard port must be an integer from 1 to 65535: ${port}`);
  return `http://${host === "::1" ? `[${host}]` : host}:${port}`;
}

function taskUiUrl(profile: JsonObject): string {
  const host = String(profile.ui.beads_ui_host);
  const port = Number(profile.ui.beads_ui_port);
  if (host !== "127.0.0.1" && host !== "::1") throw new CommandError(`beads-ui host must be loopback: ${host}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CommandError(`beads-ui port must be an integer from 1 to 65535: ${port}`);
  return `http://${host === "::1" ? `[${host}]` : host}:${port}`;
}

function recordArray(value: any, pluralKey: string, predicate: (item: JsonObject) => boolean): JsonObject[] {
  const results: JsonObject[] = [];
  const seen = new Set<any>();
  const visit = (candidate: any): void => {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (item && typeof item === "object" && !Array.isArray(item) && predicate(item)) results.push(item);
        else visit(item);
      }
      return;
    }
    if (Array.isArray(candidate[pluralKey])) visit(candidate[pluralKey]);
    for (const [key, child] of Object.entries(candidate)) if (key !== pluralKey && new Set(["result", "data", "items", "issues", "agents"]).has(key)) visit(child);
  };
  visit(value);
  return results;
}

function dashboardTasks(name: string, profile: JsonObject): JsonObject {
  try {
    const proc = bdRun(name, profile, ["list", "--json"], null, false);
    if (proc.returncode !== 0) throw new CommandError(`bd list failed (${proc.returncode})`);
    let value: unknown;
    try { value = JSON.parse(proc.stdout); }
    catch { throw new CommandError("bd list returned invalid JSON"); }
    const records = recordArray(value, "issues", (item) => typeof item.id === "string" && typeof item.status === "string");
    const byStatus: Record<string, number> = {};
    const terminal = new Set(["closed", "completed", "done", "cancelled", "canceled"]);
    for (const item of records) {
      const status = String(item.status).toLowerCase();
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    const active = records.filter((item) => !terminal.has(String(item.status).toLowerCase()));
    return {
      available: true,
      active: active.length,
      total: records.length,
      by_status: byStatus,
      items: active.slice(0, 50).map((item) => ({ id: String(item.id), title: String(item.title ?? "(untitled)"), status: String(item.status) })),
    };
  } catch (error) {
    return { available: false, active: null, total: null, by_status: {}, items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function dashboardAgents(name: string): { available: boolean; items: JsonObject[]; error?: string } {
  try {
    const proc = run(herdrArgv(name, "agent", "list"), { check: false, capture: true, timeout: 15_000 });
    if (proc.returncode !== 0) throw new CommandError(`herdr agent list failed (${proc.returncode})`);
    let value: unknown;
    try { value = JSON.parse(proc.stdout); }
    catch { throw new CommandError("herdr agent list returned invalid JSON"); }
    const records = recordArray(value, "agents", (item) => Boolean(item.agent_name ?? item.name ?? item.agent ?? item.pane_id) && Boolean(findAgentStatus(item)));
    const unique = new Map<string, JsonObject>();
    for (const item of records) {
      const nameValue = String(item.agent_name ?? item.name ?? item.agent ?? item.pane_id);
      unique.set(nameValue, {
        name: nameValue,
        role: String(item.role ?? item.agent_kind ?? item.kind ?? "agent"),
        status: findAgentStatus(item) ?? "unknown",
      });
    }
    return { available: true, items: [...unique.values()] };
  } catch (error) {
    return { available: false, items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function herdrStatusSnapshot(name: string, timeout = 15_000): JsonObject {
  try {
    const proc = run(herdrArgv(name, "status", "server", "--json"), { check: false, capture: true, timeout });
    if (proc.returncode !== 0) return { running: false, version: null, error: `herdr server status failed (${proc.returncode})` };
    let value: unknown;
    try { value = JSON.parse(proc.stdout); }
    catch { return { running: false, version: null, error: "herdr server status returned invalid JSON" }; }
    if (!value || typeof value !== "object" || Array.isArray(value)) return { running: false, version: null, error: "herdr server status returned invalid JSON" };
    const status = String((value as JsonObject).status ?? "");
    const version = typeof (value as JsonObject).version === "string" ? (value as JsonObject).version : null;
    return { running: status === "running", version, error: null };
  } catch (error) {
    return { running: false, version: null, error: error instanceof Error ? error.message : "herdr server status failed" };
  }
}

function herdrOperationalSnapshot(name: string, timeout = 15_000): JsonObject {
  const probeTimeout = Math.max(250, Math.floor(timeout / 2));
  const status = herdrStatusSnapshot(name, probeTimeout);
  if (!status.running) return { ...status, operational: false };
  try {
    const proc = run(herdrArgv(name, "agent", "list"), { check: false, capture: true, timeout: probeTimeout });
    if (proc.returncode !== 0) {
      return { ...status, operational: false, error: `Herdr control plane rejected a read-only probe (${proc.returncode}); the server may be shutting down` };
    }
    let value: unknown;
    try { value = JSON.parse(proc.stdout); }
    catch { return { ...status, operational: false, error: "Herdr control plane returned invalid JSON" }; }
    const result = value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject).result : null;
    if (!result || typeof result !== "object" || Array.isArray(result) || !Array.isArray((result as JsonObject).agents)) {
      return { ...status, operational: false, error: "Herdr control plane returned an invalid agent list response" };
    }
    return { ...status, operational: true, error: null };
  } catch (error) {
    return { ...status, operational: false, error: error instanceof Error ? error.message : "Herdr control plane probe failed" };
  }
}

export function herdrmCompatibility(name: string, profile: JsonObject): JsonObject {
  const home = operatorHome();
  const applications = [
    "/Applications/herdrm.app", "/Applications/HerdrM.app",
    join(home, "Applications", "herdrm.app"), join(home, "Applications", "HerdrM.app"),
  ];
  const application = applications.find((candidate) => isDirectory(candidate)) ?? null;
  const session = validatedHerdrSession(name, profile);
  const defaultSocket = join(home, ".config", "herdr", "herdr.sock");
  const namedSocket = session === "default" ? defaultSocket : join(home, ".config", "herdr", "sessions", session, "herdr.sock");
  let compatible = false;
  let socketIdentity: JsonObject | null = null;
  if (lexists(defaultSocket) && lexists(namedSocket)) {
    try {
      const defaultInfo = statSync(defaultSocket);
      const namedInfo = statSync(namedSocket);
      const effectiveUid = typeof process.getuid === "function" ? process.getuid() : null;
      compatible = defaultInfo.isSocket() && namedInfo.isSocket()
        && (effectiveUid === null || (defaultInfo.uid === effectiveUid && namedInfo.uid === effectiveUid))
        && defaultInfo.dev === namedInfo.dev && defaultInfo.ino === namedInfo.ino;
      if (compatible) socketIdentity = { device: String(defaultInfo.dev), inode: String(defaultInfo.ino) };
    } catch { compatible = false; }
  }
  let message: string;
  if (!application) message = "Herdrmは未installです（optional）。";
  else if (!compatible) message = `Herdrm 0.5.xはdefault socket固定のため、live Unix socketの同一性を証明できないHanchou session \`${session}\`には安全に接続できません。別sessionの自動起動を防ぐためopenしません。`;
  else message = "同じHerdr socketを確認しました。監視・attach専用で利用できます。";
  return { installed: Boolean(application), application, compatible, session, default_socket: defaultSocket, named_socket: namedSocket, socket_identity: socketIdentity, message };
}

export function ensureHerdrmCompatibility(name: string, profile: JsonObject): JsonObject {
  const initial = herdrmCompatibility(name, profile);
  if (!initial.installed) return initial;
  const namedSocket = String(initial.named_socket);
  const defaultSocket = String(initial.default_socket);
  if (!initial.compatible && !lexists(namedSocket)) return initial;
  try {
    validateAuthorityDirectoryChain(dirname(defaultSocket), "Herdrm default socket directory");
    validateAuthorityDirectoryChain(dirname(namedSocket), "Hanchou named socket directory");
  } catch {
    return {
      ...initial,
      compatible: false,
      socket_identity: null,
      message: "Herdr socketの親directoryにsymlink、所有者不一致、またはgroup/world writable権限があるため、安全にHerdrmを開けません。",
    };
  }
  if (initial.compatible || lexists(defaultSocket)) return initial;
  let namedInfo: Stats;
  try { namedInfo = lstatSync(namedSocket); }
  catch { return initial; }
  if (!namedInfo.isSocket()) return initial;
  if (typeof process.getuid === "function" && namedInfo.uid !== process.getuid()) return initial;

  try {
    symlinkSync(namedSocket, defaultSocket);
    const verified = herdrmCompatibility(name, profile);
    const currentNamed = lstatSync(namedSocket);
    const linked = statSync(defaultSocket);
    const unchanged = currentNamed.isSocket()
      && currentNamed.dev === namedInfo.dev && currentNamed.ino === namedInfo.ino && currentNamed.uid === namedInfo.uid
      && linked.isSocket() && linked.dev === namedInfo.dev && linked.ino === namedInfo.ino && linked.uid === namedInfo.uid;
    if (!verified.compatible || !unchanged) {
      throw new CommandError("created Herdrm compatibility link, but the live Hanchou socket changed during verification; the link was preserved without unlinking any path, so retry after Herdr is stable");
    }
    console.log(`created Herdrm compatibility link: ${defaultSocket} -> ${namedSocket}`);
    return verified;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return herdrmCompatibility(name, profile);
    throw error;
  }
}

async function dashboardSnapshot(name: string, profile: JsonObject): Promise<JsonObject> {
  const paths = profilePaths(profile);
  const registry = loadProjectRegistry(name, true);
  const activeInstance = configuredInstance(name, false);
  const herdr = herdrStatusSnapshot(name);
  const tasks = dashboardTasks(name, profile);
  const agentResult = dashboardAgents(name);
  const taskUrl = taskUiUrl(profile);
  const taskUiRunning = await endpointOk(`${taskUrl}/`, 2_000);
  const orchestratorStatus = getAgentStatus(name, String(profile.orchestrator.agent_name));
  const pendingInbox = existsSync(paths.relay_dir) ? iterEvents(paths.relay_dir, "pending").length : 0;
  const pendingDeliveries = existsSync(paths.relay_dir) ? iterDeliveries(paths.relay_dir, "pending").length : 0;
  return {
    generated_at: utcnow(),
    profile: name,
    system: {
      herdr_running: Boolean(herdr.running && agentResult.available), herdr_version: herdr.version,
      orchestrator_status: orchestratorStatus ?? "not-running",
      task_ui_running: taskUiRunning,
      dashboard_url: dashboardUrl(profile), task_ui_url: taskUrl,
    },
    tasks,
    agents: agentResult.items,
    agents_available: agentResult.available,
    agents_error: agentResult.error ?? null,
    relay: { pending_inbox: pendingInbox, pending_deliveries: pendingDeliveries },
    workspace: {
      registry_configured: Boolean(registry.registry_digest), registry_path: registry.registry_path,
      roots: registry.workspace_roots.filter((item) => item.allowed_profiles.includes(name)).map((item) => ({ id: item.id, path: item.canonical_path })),
      projects: registry.projects.filter((item) => item.allowed_profiles.includes(name)).length,
    },
    herdrm: herdrmCompatibility(name, profile),
    commands: {
      status: displayedProfileCommand(name, "status"),
      update: activeInstance ? `${shellQuote(activeInstance.layout.launcher)} update` : `hanchou init ${name}`,
      herdr: displayedProfileCommand(name, "open herdr"),
      orchestrator: displayedProfileCommand(name, "open orchestrator"),
      tasks: displayedProfileCommand(name, "open tasks"),
      automations: displayedProfileCommand(name, "open automations"),
      herdrm: displayedProfileCommand(name, "open herdrm"),
    },
  };
}

async function dashboardCommand(args: JsonObject, name: string, profile: JsonObject): Promise<void> {
  if (args.dashboard_command === "snapshot") {
    const snapshot = await dashboardSnapshot(name, profile);
    jsonPrint(snapshot, true);
    return;
  }
  const host = String(profile.ui.dashboard_host);
  const port = Number(profile.ui.dashboard_port);
  const snapshot = createSnapshotSubprocessProvider({
    command: process.execPath,
    args: ["--experimental-strip-types", fileURLToPath(import.meta.url), "dashboard", "snapshot", name],
    cwd: ROOT,
    env: profileEnv(name, profile),
    timeoutMs: 4_000,
    maxOutputBytes: 1024 * 1024,
  });
  const handle = await createDashboardServer({ host, port, profile: name, snapshot });
  console.log(`Hanchou dashboard listening: ${handle.url}`);
  const close = (): void => {
    void handle.close().catch((error) => {
      process.stderr.write(`hanchou: cannot close dashboard: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}

function openUrl(url: string): void {
  console.log(url);
  const opener = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(opener, args, { detached: true, stdio: "ignore" });
    child.once("error", () => { /* URL was printed for manual use. */ });
    child.unref();
  }
  catch { /* URL was printed for manual use */ }
}

function openHerdrm(name: string, profile: JsonObject): void {
  if (platform() !== "darwin") throw new CommandError("Herdrm is a macOS 14+ native application");
  const initial = herdrmCompatibility(name, profile);
  if (!initial.installed) throw new CommandError("Herdrm is optional and not installed; install it manually with `brew install owo-network/brew/herdrm`");
  const session = validatedHerdrSession(name, profile);
  const server = herdrOperationalSnapshot(session, 2_000);
  const expectedVersion = miseTools().herdr;
  if (!server.running || !server.operational || server.version !== expectedVersion) {
    throw new CommandError(`cannot verify the pinned live Herdr ${expectedVersion} session before opening Herdrm`);
  }
  const state = ensureHerdrmCompatibility(name, profile);
  if (!state.compatible) throw new CommandError(String(state.message));
  console.log("WARNING: use Herdrm only to monitor or attach to Hanchou Agents. Do not create Hanchou Orchestrators or workers from Herdrm New Agent.");
  console.log(`WARNING: a direct Herdr agent/terminal attach has one writable owner. Detach any old \`${displayedProfileCommand(name, "open orchestrator")}\` direct view with Ctrl+B then q before attaching to the same pane in Herdrm.`);
  const child = spawn("open", ["-a", "herdrm"], { detached: true, stdio: "ignore" });
  child.once("error", () => { /* Compatibility was reported; the operator can open the app manually. */ });
  child.unref();
}

async function launchProfile(args: JsonObject, name: string, profile: JsonObject): Promise<void> {
  const [herdr, dashboardReady, tasksReady] = await Promise.all([
    waitForHerdrReady(name, 8_000),
    waitForEndpoint(`${dashboardUrl(profile)}/health`, 8_000, dashboardHealthMatches),
    waitForEndpoint(`${taskUiUrl(profile)}/`, 8_000, beadsUiMatches),
  ]);
  if (!herdr.ready || !dashboardReady || !tasksReady) {
    const missing = [!herdr.ready ? "Herdr" : null, !dashboardReady ? "dashboard" : null, !tasksReady ? "beads-ui" : null].filter(Boolean).join(", ");
    const launchAgentNames = [
      !herdr.ready ? "herdr" : null,
      !dashboardReady ? "dashboard" : null,
      !tasksReady ? "beads-ui" : null,
    ].filter((value): value is string => Boolean(value));
    const absent = launchAgentNames.filter((service) => !existsSync(join(operatorHome(), "Library", "LaunchAgents", `dev.hanchou.${name}.${service}.plist`)));
    const controlPlane = !herdr.ready && herdr.running && !herdr.operational
      ? ` Herdr answered the version Ping but rejected a control-plane probe (${herdr.error ?? "shutdown/reload in progress"}).`
      : "";
    const upgrade = absent.length
      ? ` Missing LaunchAgents: ${absent.join(", ")}; Hanchou may have been updated after the last bootstrap.`
      : "";
    throw new CommandError(`Hanchou services are not ready (${missing}).${controlPlane}${upgrade} Run \`${displayedProfileCommand(name, "bootstrap")}\`, wait a few seconds, then retry`);
  }
  const orchestrator = startOrchestrator(name, profile);
  if (!args.no_browser) openUrl(dashboardUrl(profile));
  if (args.herdrm) {
    try { openHerdrm(name, profile); }
    catch (error) { console.log(`WARN Herdrm not opened: ${error instanceof Error ? error.message : error}`); }
  }
  console.log(orchestrator === "ready" ? `Hanchou ready: ${name}` : `Hanchou services ready; Orchestrator initialization pending: ${name}`);
  console.log(`dashboard: ${dashboardUrl(profile)}`);
  console.log(`Herdr TUI: ${displayedProfileCommand(name, "open herdr")}`);
}

function startOrchestrator(name: string, profile: JsonObject): "ready" | "pending" {
  ensureState(name, profile);
  const control = profilePaths(profile).control_dir;
  const workspaceRoot = instanceWorkspaceRoot(name);
  return withLock(join(control, ".hanchou-orchestrator-lifecycle.lock"), () => {
    const agentName = String(profile.orchestrator.agent_name);
    const managedAgentId = validateAgentId(agentName, "managed Agent ID");
    const kind = String(profile.orchestrator.kind ?? "codex");
    const marker = join(control, ".hanchou-orchestrator-init.json");
    const beadsDirectory = profilePaths(profile).beads_dir;
    const docsPrefix = sameExistingDirectory(workspaceRoot, ROOT) ? "" : "hanchou/";
    const initial = `Initialize as the Hanchou L0 Orchestrator for profile \`${name}\`. Read AGENTS.md, ${docsPrefix}roles/orchestrator/ROLE.md, ${docsPrefix}docs/SESSION_HANDOFF.md, ${docsPrefix}docs/RELAY.md, and ${docsPrefix}docs/REPORTING.md. The authoritative Beads store is \`BEADS_DIR=${beadsDirectory}\`. Use that absolute path for every \`bd\` command if BEADS_DIR is not already inherited; never fall back to a project-local Beads store. Run \`./bin/hanchou status\` and inspect only the control-plane state. If the Codex workspace sandbox denies that bounded command, retry the exact command through normal approval/escalation without using a bypass. Do not research or modify project repositories in this session. In the readiness reply, list any in-progress or blocked Beads tasks, inspect the Herdr Agents, and state the number of currently running delegated tasks; explicitly report zero for each empty result. Also report any blocking setup issue.`;
    const initialize = (record: JsonObject): "ready" | "pending" => {
      const identity = String(record.terminal_id || record.pane_id || "unknown");
      if (existsSync(marker)) {
        try { if (JSON.parse(readText(marker)).identity === identity) { console.log(`orchestrator already exists: ${agentName}`); return "ready"; } }
        catch { /* initialize again */ }
      }
      const statusValue = String(record.agent_status ?? "unknown");
      if (!new Set(["idle", "done"]).has(statusValue)) {
        console.log(`orchestrator \`${agentName}\` exists with status ${statusValue}; initialization remains pending`);
        console.log(`open its full Herdr view with \`${displayedProfileCommand(name, "open orchestrator")}\``);
        console.log(`if this Agent must be replaced, enter \`/exit\` inside it, detach with Ctrl+B then q, and rerun \`${displayedProfileCommand(name, "start-orchestrator")}\`; Hanchou will reuse the same workspace`);
        return "pending";
      }
      const promptArgv = herdrArgv(name, "agent", "prompt", agentName, initial);
      run(promptArgv, { capture: true, displayArgv: promptArgv.map((value) => value === initial ? "<redacted-prompt>" : value), redactOutput: true });
      atomicWrite(marker, `${JSON.stringify({ identity, initialized_at: utcnow() })}\n`);
      console.log(`initialized orchestrator \`${agentName}\``);
      return "ready";
    };
    const keepNamed = (record: JsonObject): "ready" | "pending" => {
      const knownWorkspaces = herdrRecords(name, "workspace", "workspaces");
      const previous = orchestratorRuntimeBinding(name, profile);
      const pane = validateNamedOrchestrator(name, profile, record, knownWorkspaces, previous);
      saveOrchestratorRuntime(name, profile, record, previous, previous ? null : String(pane.cwd));
      const matching = legacyOrchestratorWorkspaces(profile, knownWorkspaces);
      if (matching.length > 1) {
        const staleIds = matching.filter((workspace) => workspace.workspace_id !== record.workspace_id).map((workspace) => workspace.workspace_id).join(", ");
        console.log(`WARN ${matching.length} workspaces are labeled \`${profile.orchestrator.workspace_label}\`; the live named Agent in ${record.workspace_id} was kept and no workspace was created. Inspect possible duplicates ${staleIds} with \`${displayedProfileCommand(name, "open herdr")}\`.`);
      }
      return initialize(record);
    };
    const existing = getAgentInfo(name, agentName, true);
    if (existing) return keepNamed(existing);

    let agents = herdrRecords(name, "agent", "agents");
    const listedNamed = agents.find((agent) => agent.name === agentName);
    if (listedNamed) return keepNamed(listedNamed);
    const workspaces = herdrRecords(name, "workspace", "workspaces");
    let binding = orchestratorRuntimeBinding(name, profile);
    let pane: JsonObject | null = null;
    if (binding) {
      pane = boundOrchestratorPane(name, binding, workspaces);
      if (!pane) {
        const moved = herdrRecords(name, "pane", "panes").find((item) => item.terminal_id === binding?.terminal_id);
        if (moved) {
          throw new CommandError(`recorded Orchestrator terminal ${binding.terminal_id} moved to workspace ${String(moved.workspace_id ?? "unknown")}; no replacement was created`);
        }
        const legacy = legacyOrchestratorWorkspaces(profile, workspaces);
        if (legacy.length) throw new CommandError(legacyOrchestratorMessage(name, profile, legacy));
        unlinkSync(orchestratorRuntimePath(profile));
        binding = null;
      } else {
        const occupants = agents.filter((agent) => agent.workspace_id === binding?.workspace_id && agent.pane_id === binding?.pane_id);
        if (occupants.length > 1) throw new CommandError(`recorded Orchestrator pane ${binding.pane_id} has multiple Agent records; no replacement was created`);
        const occupant = occupants[0];
        if (occupant) {
          if (occupant.name && occupant.name !== agentName) throw new CommandError(`recorded Orchestrator pane ${binding.pane_id} belongs to Agent \`${occupant.name}\`; no replacement was created`);
          if (!occupant.name && !occupant.launch_pending) {
            if (String(occupant.agent ?? "").toLowerCase() !== kind.toLowerCase()) {
              throw new CommandError(`recorded Orchestrator pane ${binding.pane_id} contains an unexpected ${String(occupant.agent ?? "unknown")} Agent; no replacement was created`);
            }
            const renamed = run(herdrArgv(name, "agent", "rename", binding.pane_id, agentName), { check: false, capture: true });
            if (renamed.returncode === 0) {
              const recovered = getAgentInfo(name, agentName, true);
              if (!recovered) throw new CommandError(`Herdr renamed the recorded Agent but did not return \`${agentName}\``);
              saveOrchestratorRuntime(name, profile, recovered, binding);
              console.log(`recovered Orchestrator name \`${agentName}\` in workspace ${binding.workspace_id}`);
              return initialize(recovered);
            }
          }
          console.log(`recorded Orchestrator Agent in pane ${binding.pane_id} is still starting or awaiting review; no replacement was created`);
          console.log(`open it with \`${displayedProfileCommand(name, "open orchestrator")}\``);
          return "pending";
        }
        if (pane.agent !== undefined || pane.agent_session !== undefined) {
          throw new CommandError(`recorded Orchestrator pane ${binding.pane_id} is occupied; no replacement was created`);
        }
      }
    }

    if (!binding) {
      const legacy = legacyOrchestratorWorkspaces(profile, workspaces);
      if (legacy.length) throw new CommandError(legacyOrchestratorMessage(name, profile, legacy));
      const created = run(herdrArgv(name, "workspace", "create", "--cwd", workspaceRoot, "--label", profile.orchestrator.workspace_label, "--env", `HANCHOU_AGENT_ID=${managedAgentId}`, "--no-focus"), { capture: true });
      const data = parseJsonOutput(created);
      const workspaceId = data?.result?.workspace?.workspace_id ?? null;
      const tabId = data?.result?.tab?.tab_id ?? nestedValue(data, "tab_id");
      const paneId = data?.result?.root_pane?.pane_id;
      let terminalId = data?.result?.root_pane?.terminal_id;
      if (typeof workspaceId !== "string" || typeof tabId !== "string" || typeof paneId !== "string") {
        throw new CommandError(`cannot read workspace/tab/root pane IDs from Herdr response: ${pyCompact(data)}`);
      }
      if (typeof terminalId !== "string" || !terminalId) {
        const createdPanes = herdrRecords(name, "pane", "panes", "--workspace", workspaceId);
        const createdPane = createdPanes.find((item) => item.pane_id === paneId);
        terminalId = createdPane?.terminal_id;
      }
      if (typeof terminalId !== "string" || !terminalId) throw new CommandError(`cannot read root terminal ID for new Orchestrator workspace ${workspaceId}`);
      const createdPaneRecord = { ...data.result.root_pane, workspace_id: workspaceId, tab_id: tabId, pane_id: paneId, terminal_id: terminalId };
      pane = createdPaneRecord;
      binding = saveOrchestratorRuntime(name, profile, createdPaneRecord);
      clearLegacyOrchestratorRoots(name);
    }

    try { if (existsSync(marker)) unlinkSync(marker); } catch (error) { throw new CommandError(`cannot reset Orchestrator initialization marker: ${error}`); }
    const argv = herdrArgv(name, "agent", "start", managedAgentId, "--kind", kind, "--pane", binding.pane_id, "--timeout", "120000");
    const model = profile.orchestrator.model;
    if (model) argv.push("--", kind === "claude" ? "--model" : "-m", model);
    if (kind === "codex") {
      if (!argv.includes("--")) argv.push("--");
      const paths = profilePaths(profile);
      const sessionDirectory = join(operatorHome(), ".config", "herdr", "sessions", name);
      argv.push(
        "--approve-for-me",
        "--add-dir", paths.root,
        "--add-dir", sessionDirectory,
        "--add-dir", join(operatorHome(), ".config", "herdr", "plugins", "config"),
        ...codexManagedNetworkArgs(name),
        ...codexManagedEnvironmentArgs(name, profile, agentName, binding.pane_id, binding.workspace_id, binding.tab_id),
      );
    }
    const started = run(argv, { check: false, capture: true });
    if (started.returncode !== 0) {
      agents = herdrRecords(name, "agent", "agents");
      const pending = agents.find((agent) => agent.workspace_id === binding?.workspace_id && agent.pane_id === binding?.pane_id);
      if (pending) {
        if (!pending.name && !pending.launch_pending) {
          if (String(pending.agent ?? "").toLowerCase() !== kind.toLowerCase()) {
            throw new CommandError(`recorded Orchestrator pane ${binding.pane_id} contains an unexpected ${String(pending.agent ?? "unknown")} Agent after startup; no replacement was created`);
          }
          const renamed = run(herdrArgv(name, "agent", "rename", binding.pane_id, agentName), { check: false, capture: true });
          if (renamed.returncode === 0) {
            const recovered = getAgentInfo(name, agentName, true);
            if (!recovered) throw new CommandError(`Herdr renamed the started Agent but did not return \`${agentName}\``);
            saveOrchestratorRuntime(name, profile, recovered, binding);
            console.log(`recovered Orchestrator name \`${agentName}\` in workspace ${binding.workspace_id}`);
            const state = initialize(recovered);
            console.log(`started ${kind} orchestrator \`${agentName}\` in pane ${binding.pane_id}`);
            return state;
          }
        }
        if (pending.name === agentName) {
          saveOrchestratorRuntime(name, profile, pending, binding);
          return initialize(pending);
        }
        console.log(`orchestrator in pane ${binding.pane_id} is awaiting startup or first-run trust/hook review; no replacement was created`);
        console.log(`open it with \`${displayedProfileCommand(name, "open orchestrator")}\``);
        return "pending";
      }
      throw new CommandError(`cannot start orchestrator in recorded workspace ${binding.workspace_id}; the binding was kept for a safe retry: ${(started.stderr || started.stdout).trim()}`);
    }
    let record = getAgentInfo(name, agentName, true);
    if (!record) {
      const byPane = getAgentInfo(name, binding.pane_id, true);
      if (byPane && !byPane.name && !byPane.launch_pending && String(byPane.agent ?? "").toLowerCase() === kind.toLowerCase()) {
        run(herdrArgv(name, "agent", "rename", binding.pane_id, agentName), { capture: true });
        record = getAgentInfo(name, agentName, true);
      }
    }
    if (!record) throw new CommandError(`orchestrator started in recorded workspace ${binding.workspace_id} but Herdr did not register \`${agentName}\``);
    saveOrchestratorRuntime(name, profile, record, binding);
    const state = initialize(record);
    console.log(`started ${kind} orchestrator \`${agentName}\` in pane ${binding.pane_id}`);
    return state;
  }, 180_000);
}

function orchestratorPaneProcessInfo(name: string, paneId: string): JsonObject {
  const value = parseJsonOutput(run(herdrArgv(name, "pane", "process-info", "--pane", paneId), { capture: true }));
  const info = value?.result?.process_info;
  const positiveU32 = (candidate: unknown): boolean => Number.isInteger(candidate) && Number(candidate) > 0 && Number(candidate) <= 0xffff_ffff;
  const optionalPositiveU32 = (candidate: unknown): boolean => candidate === undefined || candidate === null || positiveU32(candidate);
  const optionalString = (candidate: unknown): boolean => candidate === undefined || candidate === null || typeof candidate === "string";
  if (
    value?.result?.type !== "pane_process_info"
    || !info
    || typeof info !== "object"
    || Array.isArray(info)
    || info.pane_id !== paneId
    || !optionalPositiveU32(info.shell_pid)
    || !optionalPositiveU32(info.foreground_process_group_id)
    || !optionalString(info.tty)
  ) {
    throw new CommandError(`unexpected Herdr process-info response for pane ${paneId}: ${pyCompact(value)}`);
  }
  // Herdr 0.8.2 omits this field when the vector is empty. Normalize that
  // official wire shape before applying the stricter available-shell check.
  const foregroundProcesses = info.foreground_processes === undefined ? [] : info.foreground_processes;
  if (!Array.isArray(foregroundProcesses)) {
    throw new CommandError(`unexpected Herdr process-info response for pane ${paneId}: ${pyCompact(value)}`);
  }
  for (const processInfo of foregroundProcesses) {
    if (!processInfo || typeof processInfo !== "object" || Array.isArray(processInfo) || !positiveU32(processInfo.pid) || typeof processInfo.name !== "string") {
      throw new CommandError(`unexpected foreground process record for pane ${paneId}: ${pyCompact(processInfo)}`);
    }
    if (
      !optionalString(processInfo.argv0)
      || (processInfo.argv !== undefined && processInfo.argv !== null && (!Array.isArray(processInfo.argv) || processInfo.argv.some((item: unknown) => typeof item !== "string")))
      || !optionalString(processInfo.cmdline)
      || !optionalString(processInfo.cwd)
    ) {
      throw new CommandError(`unexpected foreground process record for pane ${paneId}: ${pyCompact(processInfo)}`);
    }
  }
  return { ...info, foreground_processes: foregroundProcesses };
}

function normalizedPaneProcessName(value: unknown): string {
  if (typeof value !== "string") return "";
  const leaf = value.split(/[\\/]/).at(-1) ?? value;
  return leaf.replace(/^-/, "").replace(/\.exe$/i, "").toLowerCase();
}

function isAvailablePaneShell(processInfo: JsonObject): boolean {
  const shellPid = processInfo.shell_pid;
  const processes = processInfo.foreground_processes;
  if (!Number.isInteger(shellPid) || shellPid <= 0 || processInfo.foreground_process_group_id !== shellPid || !Array.isArray(processes) || processes.length !== 1) return false;
  const processRecord = processes[0];
  const supported = new Set(["sh", "bash", "dash", "zsh", "fish", "ksh", "mksh", "csh", "tcsh", "elvish", "xonsh", "nu", "pwsh", "powershell", "cmd"]);
  return processRecord.pid === shellPid && supported.has(normalizedPaneProcessName(processRecord.name));
}

function paneShellProcessTree(processInfo: JsonObject): JsonObject[] {
  if (platform() !== "darwin" && platform() !== "linux") {
    throw new CommandError(`cannot verify pane shell descendants on unsupported platform ${platform()}`);
  }
  const shellPid = processInfo.shell_pid;
  if (!Number.isInteger(shellPid) || shellPid <= 0) throw new CommandError("pane process-info has no valid shell pid");
  const output = run(["/bin/ps", "-axo", "pid=,ppid=,pgid=,tty=,comm="], { capture: true }).stdout;
  const records: JsonObject[] = [];
  const seenPids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);
    if (!match) throw new CommandError(`cannot parse OS process record while checking pane shell ${shellPid}`);
    const record = { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), tty: match[4], name: match[5] };
    if (seenPids.has(record.pid)) throw new CommandError(`duplicate OS process id ${record.pid} while checking pane shell ${shellPid}`);
    seenPids.add(record.pid);
    records.push(record);
  }
  const shell = records.find((record) => record.pid === shellPid);
  if (!shell) throw new CommandError(`pane shell ${shellPid} is absent from the OS process table`);
  if (!shell.tty || shell.tty === "?" || shell.tty === "??" || shell.tty === "-") {
    throw new CommandError(`pane shell ${shellPid} has no verifiable terminal in the OS process table`);
  }
  const foregroundShell = (processInfo.foreground_processes as JsonObject[])[0];
  if (normalizedPaneProcessName(shell.name) !== normalizedPaneProcessName(foregroundShell?.name)) {
    throw new CommandError(`pane shell ${shellPid} changed identity from ${String(foregroundShell?.name ?? "unknown")} to ${String(shell.name)}`);
  }
  const related = new Map<number, JsonObject>();
  related.set(shellPid, shell);
  for (const record of records) {
    if (record.tty === shell.tty) related.set(record.pid, record);
  }
  const ancestorPids = new Set<number>([shellPid]);
  let added = true;
  while (added) {
    added = false;
    for (const record of records) {
      if (ancestorPids.has(record.pid) || !ancestorPids.has(record.ppid)) continue;
      ancestorPids.add(record.pid);
      related.set(record.pid, record);
      added = true;
    }
  }
  return [...related.values()].sort((left, right) => left.pid - right.pid);
}

function unmanagedOrchestratorStopRefusal(name: string, workspaceId: string, reason: string, bound: boolean): CommandError {
  if (bound) {
    return new CommandError(`refusing to stop bound workspace ${orchestratorStopPlanField(workspaceId)}: ${orchestratorStopPlanField(reason)}; --include-unmanaged applies only to unbound legacy panes; no workspace was closed`);
  }
  return new CommandError(`refusing to stop same-label workspace ${orchestratorStopPlanField(workspaceId)}: ${orchestratorStopPlanField(reason)}; no workspace was closed. Inspect it in Herdr first. If every process may be terminated, run \`${displayedProfileCommand(name, "stop-orchestrator", " --all --include-unmanaged")}\` to print a human-reviewed cleanup plan`);
}

function verifyNoPaneAgent(name: string, workspaceId: string, paneId: string): void {
  const result = run(herdrArgv(name, "agent", "get", paneId), { check: false, capture: true });
  const text = (result.returncode === 0 ? result.stdout : result.stderr || result.stdout).trim();
  let value: any;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    throw new CommandError(`refusing to stop same-label workspace ${orchestratorStopPlanField(workspaceId)}: direct pane Agent lookup returned malformed JSON; no workspace was closed`);
  }
  if (result.returncode === 0) {
    if (value?.result?.agent && typeof value.result.agent === "object" && !Array.isArray(value.result.agent)) {
      throw new CommandError(`refusing to stop same-label workspace ${orchestratorStopPlanField(workspaceId)}: pane Agent lookup disagrees with the successful Agent list; no workspace was closed`);
    }
    throw new CommandError(`refusing to stop same-label workspace ${orchestratorStopPlanField(workspaceId)}: direct pane Agent lookup returned an unexpected success response; no workspace was closed`);
  }
  if (value?.error?.code !== "agent_not_found") {
    const code = value?.error?.code ?? "unknown";
    throw new CommandError(`refusing to stop same-label workspace ${orchestratorStopPlanField(workspaceId)}: direct pane Agent lookup failed with ${orchestratorStopPlanField(code)}; no workspace was closed`);
  }
}

function orchestratorStopTarget(
  name: string,
  profile: JsonObject,
  workspace: JsonObject,
  agents: JsonObject[],
  binding: OrchestratorRuntimeBinding | null,
  includeUnmanaged: boolean,
): OrchestratorStopTarget {
  const workspaceId = workspace.workspace_id;
  if (typeof workspaceId !== "string" || !workspaceId) throw new CommandError("cannot stop Orchestrator: Herdr workspace has no workspace_id");
  if (
    workspace.label !== String(profile.orchestrator.workspace_label)
    || workspace.pane_count !== 1
    || workspace.tab_count !== 1
    || (workspace.worktree !== undefined && workspace.worktree !== null)
  ) {
    throw new CommandError(`refusing to stop same-label workspace ${workspaceId}: expected one tab, one pane, and no worktree; no workspace was closed`);
  }
  const panes = herdrRecords(name, "pane", "panes", "--workspace", workspaceId);
  if (panes.length !== 1) throw new CommandError(`refusing to stop same-label workspace ${workspaceId}: expected exactly one pane; no workspace was closed`);
  const pane = panes[0];
  for (const key of ["pane_id", "terminal_id", "tab_id"] as const) {
    if (typeof pane[key] !== "string" || !pane[key]) {
      throw new CommandError(`refusing to stop same-label workspace ${workspaceId}: pane has no ${key}; no workspace was closed`);
    }
  }
  const bound = binding?.workspace_id === workspaceId;
  const allowedWorkspaceRoots = bound && binding ? [binding.workspace_cwd] : orchestratorAllowedWorkspaceRoots(name);
  if (
    pane.workspace_id !== workspaceId
    || workspace.active_tab_id !== pane.tab_id
    || !allowedWorkspaceRoots.some((root) => sameExistingDirectory(pane.cwd, root))
  ) {
    throw new CommandError(`refusing to stop same-label workspace ${workspaceId}: pane identity or cwd is outside the approved Hanchou workspace roots; no workspace was closed`);
  }
  const occupants = agents.filter((agent) => agent.workspace_id === workspaceId);
  if (occupants.length > 1) {
    throw new CommandError(`refusing to stop same-label workspace ${workspaceId}: multiple Agent records occupy its only pane; no workspace was closed`);
  }
  for (const occupant of occupants) {
    for (const key of ["workspace_id", "tab_id", "pane_id", "terminal_id"] as const) {
      const expected = key === "workspace_id" ? workspaceId : pane[key];
      if (occupant[key] !== expected) {
        throw new CommandError(`refusing to stop same-label workspace ${workspaceId}: Agent ${key} does not match its only pane; no workspace was closed`);
      }
    }
  }
  if (!occupants.length) {
    verifyNoPaneAgent(name, workspaceId, String(pane.pane_id));
  }
  if (bound) {
    for (const key of ["workspace_id", "tab_id", "pane_id", "terminal_id"] as const) {
      const actual = key === "workspace_id" ? workspaceId : pane[key];
      if (binding[key] !== actual) {
        throw new CommandError(`refusing to stop bound workspace ${workspaceId}: recorded ${key} does not match; no workspace was closed`);
      }
    }
  }
  const agentName = String(profile.orchestrator.agent_name);
  const expectedKind = String(profile.orchestrator.kind ?? "codex").toLowerCase();
  const occupant = occupants[0] ?? null;
  const named = occupant?.name === agentName;
  if (bound && occupant) {
    const kind = typeof occupant.agent === "string" ? occupant.agent.toLowerCase() : "";
    const pending = occupant.launch_pending === true && !kind;
    if (occupant.name !== agentName || (kind !== expectedKind && !pending)) {
      throw new CommandError(`refusing to stop bound workspace ${workspaceId}: its Agent is not the configured ${expectedKind} Orchestrator; no workspace was closed`);
    }
  } else if (!bound && occupant) {
    const kind = typeof occupant.agent === "string" ? occupant.agent.toLowerCase() : "";
    if (!named || kind !== expectedKind) {
      throw new CommandError(`refusing to stop unbound workspace ${workspaceId}: its Agent is not the configured named ${expectedKind} Orchestrator; no workspace was closed`);
    }
  }
  const unmanagedReasons: string[] = [];
  if (!occupant && (pane.agent !== undefined || pane.agent_session !== undefined)) {
    if (!includeUnmanaged || bound) {
      throw unmanagedOrchestratorStopRefusal(name, workspaceId, "pane reports Agent authority without a matching Agent record", bound);
    }
    unmanagedReasons.push("stale_pane_authority");
  }
  const processInfo = orchestratorPaneProcessInfo(name, String(pane.pane_id));
  const foregroundProcesses = processInfo.foreground_processes as JsonObject[];
  let shellProcessTree: JsonObject[] = [];
  let shellProcessTreeVerified = false;
  if (!occupant && !isAvailablePaneShell(processInfo)) {
    if (!includeUnmanaged || bound) {
      throw unmanagedOrchestratorStopRefusal(name, workspaceId, "unowned legacy pane is not an available interactive shell", bound);
    }
    unmanagedReasons.push("foreground_busy");
  }
  if (!occupant) {
    const currentDirectories = [pane.foreground_cwd, ...foregroundProcesses.map((processRecord) => processRecord.cwd)];
    if (currentDirectories.some((directory) => !allowedWorkspaceRoots.some((root) => sameExistingDirectory(directory, root)))) {
      throw unmanagedOrchestratorStopRefusal(name, workspaceId, "available shell is not currently in an approved Hanchou workspace cwd", bound);
    }
    if (isAvailablePaneShell(processInfo)) {
      try {
        shellProcessTree = paneShellProcessTree(processInfo);
        shellProcessTreeVerified = true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (!includeUnmanaged || bound) {
          throw unmanagedOrchestratorStopRefusal(name, workspaceId, `cannot verify the available shell's observable process set: ${detail}`, bound);
        }
        unmanagedReasons.push("process_scan_unavailable");
      }
      if (shellProcessTreeVerified && shellProcessTree.length !== 1) {
        if (!includeUnmanaged || bound) {
          throw unmanagedOrchestratorStopRefusal(name, workspaceId, `available shell has ${shellProcessTree.length - 1} background or descendant process(es)`, bound);
        }
        unmanagedReasons.push("background_processes_observed");
      }
    }
  }
  unmanagedReasons.sort();
  const descriptions = occupants.map((occupant) => {
    const occupantName = typeof occupant.name === "string" && occupant.name ? occupant.name : "unnamed";
    const kind = typeof occupant.agent === "string" && occupant.agent ? occupant.agent : occupant.launch_pending ? "launch-pending" : "unknown";
    const status = typeof occupant.agent_status === "string" ? occupant.agent_status : "unknown";
    return `${occupantName}/${kind}/${status}`;
  });
  if (!descriptions.length && typeof pane.agent === "string" && pane.agent) descriptions.push(`pane:${pane.agent}/${String(pane.agent_status ?? "unknown")}`);
  const status = typeof workspace.agent_status === "string"
    ? workspace.agent_status
    : typeof pane.agent_status === "string" ? pane.agent_status : "unknown";
  const identity = {
    workspace_id: workspaceId,
    tab_id: pane.tab_id,
    pane_id: pane.pane_id,
    terminal_id: pane.terminal_id,
    bound,
    unmanaged: unmanagedReasons.length > 0,
    unmanaged_reasons: unmanagedReasons,
    workspace_agent_status: workspace.agent_status ?? null,
    pane_agent: pane.agent ?? null,
    pane_agent_session: pane.agent_session ?? null,
    pane_agent_status: pane.agent_status ?? null,
    pane_cwd: pane.cwd ?? null,
    pane_foreground_cwd: pane.foreground_cwd ?? null,
    pane_revision: pane.revision ?? null,
    agents: occupants.map((item) => ({
      name: item.name ?? null,
      agent: item.agent ?? null,
      launch_pending: item.launch_pending === true,
      workspace_id: item.workspace_id,
      tab_id: item.tab_id,
      pane_id: item.pane_id,
      terminal_id: item.terminal_id,
      agent_session: item.agent_session ?? null,
      agent_status: item.agent_status ?? null,
      state_change_seq: item.state_change_seq ?? null,
      revision: item.revision ?? null,
      interactive_ready: item.interactive_ready === true,
      cwd: item.cwd ?? null,
    })),
    process: {
      shell_process_tree_verified: shellProcessTreeVerified,
      shell_pid: processInfo.shell_pid ?? null,
      foreground_process_group_id: processInfo.foreground_process_group_id ?? null,
      foreground_processes: foregroundProcesses
        .map((item) => ({
          pid: item.pid,
          name: item.name,
          argv0: item.argv0 ?? null,
          argv: item.argv ?? null,
          cmdline: item.cmdline ?? null,
          cwd: item.cwd ?? null,
        }))
        .sort((left, right) => left.pid - right.pid || left.name.localeCompare(right.name)),
      shell_process_tree: shellProcessTree.map((item) => ({ pid: item.pid, ppid: item.ppid, pgid: item.pgid, tty: item.tty, name: item.name })),
    },
  };
  return {
    workspace_id: workspaceId,
    tab_id: String(pane.tab_id),
    pane_id: String(pane.pane_id),
    terminal_id: String(pane.terminal_id),
    bound,
    managed: bound || named,
    unmanaged: unmanagedReasons.length > 0,
    unmanaged_reasons: unmanagedReasons,
    focused: workspace.focused === true || pane.focused === true,
    agents: descriptions,
    status,
    base_directory: String(pane.cwd ?? "unknown"),
    working_directory: String(pane.foreground_cwd ?? pane.cwd ?? "unknown"),
    foreground_process_count: foregroundProcesses.length,
    additional_process_count: occupant || !shellProcessTreeVerified ? null : Math.max(0, shellProcessTree.length - 1),
    processes: foregroundProcesses.map((item) => `${item.pid}:${item.name}`),
    process_working_directories: foregroundProcesses.map((item) => `${item.pid}:${item.name}@${String(item.cwd ?? "unknown")}`),
    identity_fingerprint: createHash("sha256").update(JSON.stringify(sortedJson(identity))).digest("hex"),
  };
}

function orchestratorStopSnapshot(name: string, profile: JsonObject, includeUnmanaged: boolean): {
  targets: OrchestratorStopTarget[];
  binding: OrchestratorRuntimeBinding | null;
  runtimeExists: boolean;
  markerExists: boolean;
  planToken: string;
  workspaceIds: Set<string>;
  includeUnmanaged: boolean;
} {
  const control = profilePaths(profile).control_dir;
  const runtimePath = orchestratorRuntimePath(profile);
  const markerPath = join(control, ".hanchou-orchestrator-init.json");
  const runtimeExists = trustedLifecycleArtifact(runtimePath, "Orchestrator runtime binding");
  const markerExists = trustedLifecycleArtifact(markerPath, "Orchestrator initialization marker");
  const binding = runtimeExists ? orchestratorRuntimeBinding(name, profile) : null;
  const workspaces = herdrRecords(name, "workspace", "workspaces");
  const workspaceIds = new Set(workspaces.map((workspace) => String(workspace.workspace_id)));
  const agents = herdrRecords(name, "agent", "agents");
  const candidates = legacyOrchestratorWorkspaces(profile, workspaces);
  const candidateIds = new Set(candidates.map((workspace) => String(workspace.workspace_id)));
  const agentName = String(profile.orchestrator.agent_name);
  const namedOutside = agents.find((agent) => agent.name === agentName && !candidateIds.has(String(agent.workspace_id)));
  if (namedOutside) {
    throw new CommandError(`refusing to stop: named Agent \`${agentName}\` is outside the dedicated \`${profile.orchestrator.workspace_label}\` workspace set; no workspace was closed`);
  }
  if (binding) {
    const boundWorkspace = workspaces.find((workspace) => workspace.workspace_id === binding.workspace_id);
    if (boundWorkspace && !candidateIds.has(binding.workspace_id)) {
      throw new CommandError(`refusing to stop: bound workspace ${binding.workspace_id} no longer has label \`${profile.orchestrator.workspace_label}\`; no workspace was closed`);
    }
    if (!boundWorkspace) {
      const moved = herdrRecords(name, "pane", "panes").find((pane) => pane.terminal_id === binding.terminal_id);
      if (moved) {
        throw new CommandError(`refusing to stop: bound terminal ${binding.terminal_id} moved to workspace ${String(moved.workspace_id ?? "unknown")}; no workspace was closed`);
      }
    }
  }
  const targets = candidates.map((workspace) => orchestratorStopTarget(name, profile, workspace, agents, binding, includeUnmanaged));
  const planIdentity = {
    schema: "hanchou.orchestrator-stop-plan.v2",
    profile: name,
    profile_digest: createHash("sha256").update(readFileSync(join(CONFIG_ROOT, "profiles", `${name}.toml`))).digest("hex"),
    profile_state_paths: sortedJson(profilePaths(profile)),
    session: validatedHerdrSession(name, profile),
    config_root: realpathSync(CONFIG_ROOT),
    core_root: realpathSync(ROOT),
    workspace_cwds: orchestratorAllowedWorkspaceRoots(name),
    workspace_label: String(profile.orchestrator.workspace_label),
    agent_name: agentName,
    agent_kind: String(profile.orchestrator.kind ?? "codex").toLowerCase(),
    include_unmanaged: includeUnmanaged,
    runtime_exists: runtimeExists,
    marker_exists: markerExists,
    binding: binding ? {
      workspace_id: binding.workspace_id,
      tab_id: binding.tab_id,
      pane_id: binding.pane_id,
      terminal_id: binding.terminal_id,
    } : null,
    targets: [...targets]
      .sort((left, right) => left.workspace_id.localeCompare(right.workspace_id))
      .map((target) => ({
        workspace_id: target.workspace_id,
        tab_id: target.tab_id,
        pane_id: target.pane_id,
        terminal_id: target.terminal_id,
        bound: target.bound,
        managed: target.managed,
        unmanaged: target.unmanaged,
        focused: target.focused,
        identity_fingerprint: target.identity_fingerprint,
      })),
  };
  const planToken = createHash("sha256").update(JSON.stringify(sortedJson(planIdentity))).digest("hex");
  return { targets, binding, runtimeExists, markerExists, planToken, workspaceIds, includeUnmanaged };
}

function orchestratorStopPlanField(value: unknown): string {
  const encoded = JSON.stringify(String(value));
  return encoded.slice(1, -1).replace(/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function printOrchestratorStopPlan(name: string, profile: JsonObject, snapshot: ReturnType<typeof orchestratorStopSnapshot>): void {
  console.log(`Hanchou Orchestrator stop plan: ${name}`);
  console.log(`  Herdr session: ${validatedHerdrSession(name, profile)}`);
  console.log(`  scope: every validated \`${profile.orchestrator.workspace_label}\` workspace in an approved profile workspace cwd`);
  console.log(`  unmanaged legacy panes: ${snapshot.includeUnmanaged ? "included after hard containment checks" : "excluded (default)"}`);
  for (const target of snapshot.targets) {
    const ownership = target.bound ? "bound" : target.managed ? "named" : target.unmanaged ? "UNMANAGED-ACTIVE" : "legacy";
    const unmanagedDetail = target.unmanaged ? ` / reasons=${target.unmanaged_reasons.map(orchestratorStopPlanField).join("; ")}` : "";
    const agents = target.agents.map(orchestratorStopPlanField).join(",") || "-";
    const processes = target.processes.map(orchestratorStopPlanField).join(",") || "-";
    const processWorkingDirectories = target.process_working_directories.map(orchestratorStopPlanField).join(",") || "-";
    console.log(`  CLOSE ${orchestratorStopPlanField(target.workspace_id)} / tab=${orchestratorStopPlanField(target.tab_id)} / pane=${orchestratorStopPlanField(target.pane_id)} / terminal=${orchestratorStopPlanField(target.terminal_id)} / ${ownership} / agent=${agents} / status=${orchestratorStopPlanField(target.status)} / processes=${processes} / process_cwds=${processWorkingDirectories} / observed_additional=${target.additional_process_count ?? "n/a"} / cwd=${orchestratorStopPlanField(target.working_directory)} / base_cwd=${orchestratorStopPlanField(target.base_directory)} / focused=${target.focused ? "yes" : "no"}${unmanagedDetail}`);
  }
  if (snapshot.targets.some((target) => target.unmanaged)) {
    console.log("  WARNING: UNMANAGED rows are not proven idle. Apply terminates their entire pane OS sessions, including unobserved processes.");
    if (snapshot.targets.some((target) => target.unmanaged_reasons.includes("process_scan_unavailable"))) {
      console.log("  WARNING: process_scan_unavailable means Hanchou could not establish whether any additional process exists.");
    }
    if (snapshot.targets.some((target) => target.unmanaged_reasons.includes("stale_pane_authority"))) {
      console.log("  WARNING: stale_pane_authority means the pane still reports Agent metadata that Herdr Agent lookup does not resolve.");
    }
    console.log("  WARNING: Herdr 0.8.2 has no conditional close; pane state can still change between final revalidation and close.");
  }
  console.log(`  effect: close ${snapshot.targets.length} Herdr workspace(s); Herdr terminates every process in each pane OS session, including processes not shown above`);
  if (snapshot.targets.some((target) => target.additional_process_count !== null)) {
    console.log("  legacy scan: best-effort same-TTY plus shell descendants; it cannot atomically enumerate the whole OS session");
  }
  console.log("  preserved: Herdr server/session, Beads, Relay, Dashboard, repositories, and worktrees");
  if (snapshot.runtimeExists || snapshot.markerExists) console.log("  local lifecycle state: clear only after every target is verified closed");
  console.log(`  plan token: ${snapshot.planToken}`);
}

function orchestratorStopReviewCommand(name: string, includeUnmanaged: boolean): string {
  return displayedProfileCommand(name, "stop-orchestrator", ` --all${includeUnmanaged ? " --include-unmanaged" : ""}`);
}

function stopPartialError(
  name: string,
  includeUnmanaged: boolean,
  message: string,
  closed: string[],
  remaining: string[],
  uncertain: string[] = [],
): CommandError {
  return new CommandError(`${message}; closed=[${closed.join(", ")}], remaining=[${remaining.join(", ")}], uncertain=[${uncertain.join(", ")}]. Run \`${orchestratorStopReviewCommand(name, includeUnmanaged)}\` again, review the new plan, and use its exact apply command`);
}

function partialStopDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.replaceAll("; no workspace was closed", "");
}

function ensureOrchestratorLifecycleLockDirectory(control: string): void {
  if (!lexists(control)) {
    mkdirSync(control, { recursive: true, mode: 0o700 });
    chmodSync(control, 0o700);
    return;
  }
  const info = lstatSync(control);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new CommandError(`Orchestrator control directory must be a real directory: ${control}`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new CommandError(`Orchestrator control directory must be owned by the effective OS user: ${control}`);
  }
  if ((info.mode & 0o022) !== 0) throw new CommandError(`Orchestrator control directory must not be group/world writable: ${control}`);
}

function stopOrchestrator(
  name: string,
  profile: JsonObject,
  yes: boolean,
  reviewedPlan: string | null,
  includeUnmanaged: boolean,
): void {
  if (yes) {
    if (process.env.HERDR_ENV === "1" || process.env.HANCHOU_AGENT_ID) {
      throw new CommandError("stop-orchestrator --yes must be run from an ordinary terminal outside a Herdr-managed Agent");
    }
    if (!process.stdin.isTTY) throw new CommandError("stop-orchestrator --yes requires an interactive terminal controlled by the human operator");
  }
  if (!yes) {
    const snapshot = orchestratorStopSnapshot(name, profile, includeUnmanaged);
    printOrchestratorStopPlan(name, profile, snapshot);
    if (!snapshot.targets.length && !snapshot.runtimeExists && !snapshot.markerExists) {
      console.log(`orchestrator already stopped: ${name}`);
      return;
    }
    console.log(`\nNo changes made. Review every CLOSE row, then run this exact command from your ordinary terminal:\n  ${orchestratorStopReviewCommand(name, includeUnmanaged)} --plan ${snapshot.planToken} --yes`);
    return;
  }

  const control = profilePaths(profile).control_dir;
  const reviewed = orchestratorStopSnapshot(name, profile, includeUnmanaged);
  printOrchestratorStopPlan(name, profile, reviewed);
  if (reviewedPlan !== reviewed.planToken) {
    throw new CommandError(`reviewed stop plan does not match the current Herdr state; no workspace was closed. Review the rows above, then use the exact command containing plan token ${reviewed.planToken}`);
  }
  if (!reviewed.targets.length && !reviewed.runtimeExists && !reviewed.markerExists) {
    console.log(`orchestrator already stopped: ${name}`);
    return;
  }
  ensureOrchestratorLifecycleLockDirectory(control);
  withLock(join(control, ".hanchou-orchestrator-lifecycle.lock"), () => {
    const initial = orchestratorStopSnapshot(name, profile, includeUnmanaged);
    if (reviewedPlan !== initial.planToken) {
      throw new CommandError("Herdr state changed while the lifecycle lock was acquired; no workspace was closed. Run the read-only stop plan again and review its new exact apply command");
    }
    const originalIds = new Set(initial.targets.map((target) => target.workspace_id));
    const ordered = [...initial.targets].sort((left, right) => {
      const leftRank = left.unmanaged ? 0 : left.bound ? 3 : left.managed ? 2 : 1;
      const rightRank = right.unmanaged ? 0 : right.bound ? 3 : right.managed ? 2 : 1;
      return leftRank - rightRank || left.workspace_id.localeCompare(right.workspace_id);
    });
    const closed: string[] = [];
    for (const target of ordered) {
      const remaining = ordered.filter((candidate) => !closed.includes(candidate.workspace_id)).map((candidate) => candidate.workspace_id);
      let current: ReturnType<typeof orchestratorStopSnapshot>;
      try {
        current = orchestratorStopSnapshot(name, profile, includeUnmanaged);
      } catch (error) {
        const detail = partialStopDetail(error);
        throw stopPartialError(name, includeUnmanaged, `cannot revalidate before closing workspace ${target.workspace_id}: ${detail}`, closed, remaining);
      }
      const unexpected = current.targets.find((candidate) => !originalIds.has(candidate.workspace_id));
      if (unexpected) {
        throw stopPartialError(name, includeUnmanaged, `a new same-label workspace ${unexpected.workspace_id} appeared during stop`, closed, [...remaining, unexpected.workspace_id]);
      }
      const live = current.targets.find((candidate) => candidate.workspace_id === target.workspace_id);
      if (!live) {
        if (current.workspaceIds.has(target.workspace_id)) {
          throw stopPartialError(name, includeUnmanaged, `workspace ${target.workspace_id} still exists but moved outside the reviewed stop scope`, closed, remaining);
        }
        closed.push(target.workspace_id);
        continue;
      }
      for (const key of ["tab_id", "pane_id", "terminal_id"] as const) {
        if (live[key] !== target[key]) {
          throw stopPartialError(name, includeUnmanaged, `workspace ${target.workspace_id} changed ${key} during stop`, closed, remaining);
        }
      }
      if (live.identity_fingerprint !== target.identity_fingerprint) {
        throw stopPartialError(name, includeUnmanaged, `workspace ${target.workspace_id} changed Agent or process identity during stop`, closed, remaining);
      }
      let result: RunResult;
      try {
        result = run(herdrArgv(name, "workspace", "close", target.workspace_id), { check: false, capture: true });
      } catch (error) {
        const detail = partialStopDetail(error);
        throw stopPartialError(name, includeUnmanaged, `cannot determine whether workspace ${target.workspace_id} received the close request: ${detail}`, closed, remaining, [target.workspace_id]);
      }
      let after: JsonObject[];
      try {
        after = herdrRecords(name, "workspace", "workspaces");
      } catch (error) {
        const detail = partialStopDetail(error);
        throw stopPartialError(name, includeUnmanaged, `cannot verify workspace ${target.workspace_id} after its close request: ${detail}`, closed, remaining, [target.workspace_id]);
      }
      const absent = !after.some((workspace) => workspace.workspace_id === target.workspace_id);
      if (result.returncode !== 0 && !absent) {
        const detail = (result.stderr || result.stdout).trim().slice(0, 500) || "Herdr rejected workspace close";
        throw stopPartialError(name, includeUnmanaged, `cannot close workspace ${target.workspace_id}: ${detail}`, closed, remaining);
      }
      if (!absent) throw stopPartialError(name, includeUnmanaged, `Herdr returned success but workspace ${target.workspace_id} is still present`, closed, remaining);
      closed.push(target.workspace_id);
      console.log(`closed Orchestrator workspace ${target.workspace_id}`);
    }

    let finalSnapshot: ReturnType<typeof orchestratorStopSnapshot>;
    try {
      finalSnapshot = orchestratorStopSnapshot(name, profile, includeUnmanaged);
    } catch (error) {
      const detail = partialStopDetail(error);
      throw stopPartialError(name, includeUnmanaged, `cannot verify the final Orchestrator state: ${detail}`, closed, [], ["final-state"]);
    }
    if (finalSnapshot.targets.length) {
      throw stopPartialError(name, includeUnmanaged, "one or more Orchestrator workspaces remain after close", closed, finalSnapshot.targets.map((target) => target.workspace_id));
    }
    const markerPath = join(control, ".hanchou-orchestrator-init.json");
    const runtimePath = orchestratorRuntimePath(profile);
    let removedState = false;
    try {
      if (finalSnapshot.markerExists) {
        trustedLifecycleArtifact(markerPath, "Orchestrator initialization marker");
        unlinkSync(markerPath);
        removedState = true;
      }
      if (finalSnapshot.runtimeExists) {
        trustedLifecycleArtifact(runtimePath, "Orchestrator runtime binding");
        unlinkSync(runtimePath);
        removedState = true;
      }
      if (removedState) fsyncDirectory(control);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw stopPartialError(name, includeUnmanaged, `workspaces are closed but local lifecycle state cleanup failed: ${detail}`, closed, [], ["local-lifecycle-state"]);
    }
    console.log(`stopped Orchestrator: ${name} (closed ${closed.length} workspace(s))`);
    console.log(`restart with: ${displayedProfileCommand(name, "start-orchestrator")}`);
  }, 180_000);
}

async function openTarget(name: string, profile: JsonObject, target: string): Promise<never | void> {
  if (target === "dashboard") {
    openUrl(dashboardUrl(profile));
    return;
  }
  if (target === "tasks") {
    openUrl(taskUiUrl(profile));
    return;
  }
  if (target === "herdrm") { openHerdrm(name, profile); return; }
  if (target === "herdr" || target === "orchestrator" || target === "automations") {
    const ready = await waitForHerdrReady(name, 8_000);
    if (!ready.ready) {
      const detail = ready.running && !ready.operational ? `: ${ready.error ?? "control plane unavailable"}` : "";
      throw new CommandError(`Herdr session \`${name}\` is not operational${detail}; run \`${displayedProfileCommand(name, "bootstrap")}\`, wait a few seconds, then retry`);
    }
  }
  if (target === "herdr" || target === "orchestrator") {
    if (target === "orchestrator") {
      const agentName = String(profile.orchestrator.agent_name);
      const record = getAgentInfo(name, agentName, true);
      const binding = orchestratorRuntimeBinding(name, profile);
      const workspaces = herdrRecords(name, "workspace", "workspaces");
      if (record) {
        validateNamedOrchestrator(name, profile, record, workspaces, binding);
        const focused = run(herdrArgv(name, "agent", "focus", agentName), { check: false, capture: true });
        if (focused.returncode !== 0) run(herdrArgv(name, "workspace", "focus", String(record.workspace_id)), { capture: true });
      } else {
        if (!binding) throw new CommandError(`agent target ${agentName} not found; run \`${displayedProfileCommand(name, "launch")}\` first`);
        if (!boundOrchestratorPane(name, binding, workspaces)) {
          throw new CommandError(`recorded Orchestrator workspace ${binding.workspace_id} is missing; run \`${displayedProfileCommand(name, "start-orchestrator")}\` to reconcile it`);
        }
        run(herdrArgv(name, "workspace", "focus", binding.workspace_id), { capture: true });
      }
      console.log("Opening the full Herdr client on the Orchestrator. This view is multi-client safe; detach with Ctrl+B then q without stopping the Agent.");
    }
    const result = run(herdrArgv(name), { check: false }); process.exit(result.returncode);
  }
  if (target === "automations") { run(herdrArgv(name, "plugin", "pane", "open", "--plugin", "dnzzl.automations", "--entrypoint", "board", "--placement", "overlay")); return; }
  throw new CommandError(`unknown open target: ${target}`);
}

function projectRegistryView(registry: ProjectRegistry): JsonObject {
  return {
    schema_version: registry.schema_version,
    default_policy: registry.default_policy,
    registry_path: registry.registry_path,
    registry_digest: registry.registry_digest,
    projects: registry.projects.map((item) => ({
      id: item.id,
      path: item.path,
      canonical_path: item.canonical_path,
      allowed_profiles: item.allowed_profiles,
      default_leaf_role: item.default_leaf_role ?? null,
      default_leaf_kind: item.default_leaf_kind ?? null,
      labels: item.labels ?? [],
    })),
    workspace_roots: registry.workspace_roots.map((item) => ({
      id: item.id,
      path: item.path,
      canonical_path: item.canonical_path,
      allowed_profiles: item.allowed_profiles,
      trust: item.trust,
    })),
  };
}

function projectReadiness(repository: string): JsonObject {
  const problems: string[] = [];
  const warnings: string[] = [];
  let head: string | null = null;
  let topLevel: string | null = null;
  let commonDirectory: string | null = null;
  let clean = false;
  try {
    topLevel = realpathSync(inspectGit(repository, ["rev-parse", "--show-toplevel"]).stdout.trim());
    if (topLevel !== repository) problems.push(`not the Git top level (top level is ${topLevel})`);
    head = inspectGit(repository, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim() || null;
    const commonValue = inspectGit(repository, ["rev-parse", "--git-common-dir"]).stdout.trim();
    commonDirectory = realpathSync(isAbsolute(commonValue) ? commonValue : resolve(repository, commonValue));
    if (!pathWithin(repository, commonDirectory, true)) problems.push(`Git common directory escapes the repository: ${commonDirectory}`);
    else validateAuthorityComponent(commonDirectory, "repository Git common directory", false);
    const hooksPath = inspectGit(repository, ["config", "--includes", "--get", "core.hooksPath"], false, false).stdout.trim();
    if (hooksPath) warnings.push(`core.hooksPath is configured: ${hooksPath}`);
    const fsmonitor = inspectGit(repository, ["config", "--includes", "--get", "core.fsmonitor"], false, false).stdout.trim();
    if (fsmonitor) warnings.push(`core.fsmonitor is configured: ${fsmonitor}`);
    const filters = configuredExternalGitFilters(repository);
    if (filters.length) problems.push(`external Git clean/smudge/process filters must be removed before readiness checks: ${filters.join(", ")}`);
    const hooksDirectory = join(commonDirectory, "hooks");
    if (isDirectory(hooksDirectory)) {
      const executableHooks = readdirSync(hooksDirectory).filter((entry) => {
        if (entry.endsWith(".sample")) return false;
        try { const info = statSync(join(hooksDirectory, entry)); return info.isFile() && (info.mode & 0o111) !== 0; }
        catch { return false; }
      });
      if (executableHooks.length) warnings.push(`executable Git hooks are present: ${executableHooks.sort().join(", ")}`);
    }
    if (!filters.length) {
      clean = !inspectGit(repository, ["status", "--porcelain", "--untracked-files=normal", "--no-ahead-behind"]).stdout.trim();
      if (!clean) problems.push("repository is not clean");
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return { repo_path: repository, git_top_level: topLevel, git_common_dir: commonDirectory, head, clean, dispatch_ready: problems.length === 0, problems, warnings };
}

function projectList(args: JsonObject, name: string): void {
  const registry = loadProjectRegistry(name, true);
  const result = projectRegistryView(registry);
  if (args.json) jsonPrint(result, true);
  else {
    console.log(`registry: ${registry.registry_path}`);
    console.log(`policy:   deny by default`);
    console.log(`projects: ${registry.projects.length}`);
    for (const item of registry.projects) console.log(`  ${item.id}: ${item.canonical_path} [${item.allowed_profiles.join(",")}]`);
    console.log(`workspace roots: ${registry.workspace_roots.length}`);
    for (const item of registry.workspace_roots) console.log(`  ${item.id}: ${item.canonical_path} (${item.trust}) [${item.allowed_profiles.join(",")}]`);
    if (!registry.registry_digest) console.log("new dispatch: denied until a human creates the registry");
  }
}

function projectShow(args: JsonObject, name: string): void {
  const registry = loadProjectRegistry(name, false);
  const id = String(args.project_id);
  const project = registry.projects.find((item) => item.id === id);
  const root = registry.workspace_roots.find((item) => item.id === id);
  if (!project && !root) throw new CommandError(`project or workspace root not found: ${id}`);
  const result = project ? { kind: "project", ...project } : { kind: "workspace_root", ...root };
  if (args.json) jsonPrint(result, true); else console.log(JSON.stringify(result, null, 2));
}

function projectResolve(args: JsonObject, name: string): void {
  const authorization = authorizeProjectRepository(name, args.project_id ? String(args.project_id) : null, String(args.path));
  const readiness = projectReadiness(authorization.repo_path);
  const result = { ...authorization, ...readiness };
  if (args.json) jsonPrint(result, true);
  else {
    console.log(`project:        ${authorization.project}`);
    console.log(`repository:     ${authorization.repo_path}`);
    console.log(`authorization:  ${authorization.source_kind} / ${authorization.source_id}`);
    console.log(`HEAD:           ${readiness.head ?? "-"}`);
    console.log(`dispatch ready: ${readiness.dispatch_ready ? "yes" : "no"}`);
    for (const problem of readiness.problems) console.log(`FAIL ${problem}`);
    for (const warning of readiness.warnings) console.log(`WARN ${warning}`);
  }
  if (!readiness.dispatch_ready) process.exitCode = 1;
}

function projectDoctor(args: JsonObject, name: string): void {
  const registry = loadProjectRegistry(name, true);
  const selectedId = args.project_id ? String(args.project_id) : null;
  if (!registry.registry_digest) {
    const result = { ok: true, deny_all: true, registry_path: registry.registry_path, projects: [], workspace_roots: [] };
    if (args.json) jsonPrint(result, true); else console.log(`ok   project registry absent; dispatch is deny-all: ${registry.registry_path}`);
    return;
  }
  const projects = registry.projects.filter((item) => selectedId === null || item.id === selectedId);
  const roots = registry.workspace_roots.filter((item) => selectedId === null || item.id === selectedId);
  if (selectedId !== null && !projects.length && !roots.length) throw new CommandError(`project or workspace root not found: ${selectedId}`);
  const projectResults = projects.map((item) => {
    try {
      const authorization = authorizeProjectRepository(name, item.id, item.canonical_path);
      return { id: item.id, ok: true, authorization, readiness: projectReadiness(item.canonical_path) };
    } catch (error) { return { id: item.id, ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  const rootResults = roots.map((item) => ({ id: item.id, ok: item.allowed_profiles.includes(name), path: item.canonical_path, trust: item.trust }));
  const ok = projectResults.every((item: any) => item.ok && item.readiness.dispatch_ready) && rootResults.every((item) => item.ok);
  const result = { ok, registry_path: registry.registry_path, registry_digest: registry.registry_digest, projects: projectResults, workspace_roots: rootResults };
  if (args.json) jsonPrint(result, true);
  else {
    console.log(`registry: ${registry.registry_path}`);
    for (const item of projectResults as any[]) console.log(`${item.ok && item.readiness?.dispatch_ready ? "ok  " : "FAIL"} project ${item.id}${item.error ? `: ${item.error}` : ""}`);
    for (const item of rootResults) console.log(`${item.ok ? "ok  " : "FAIL"} workspace root ${item.id}: ${item.path}`);
  }
  if (!ok) process.exitCode = 1;
}

function statusCommand(name: string, profile: JsonObject, asJson: boolean): void {
  const paths = profilePaths(profile);
  const projects = loadProjectRegistry(name, true);
  const agent = profile.orchestrator.agent_name;
  const pendingDeliveries = existsSync(paths.relay_dir) ? withDeliveryTransition(paths.relay_dir, () => {
    reconcileDeliveryTransitionsUnlocked(paths.relay_dir);
    return iterDeliveries(paths.relay_dir, "pending").length;
  }) : 0;
  const activeInstance = configuredInstance(name, false);
  const result = {
    profile: name, config_root: CONFIG_ROOT, herdr_session: profile.herdr.session,
    instance: activeInstance ? {
      root: activeInstance.layout.root,
      launcher: activeInstance.layout.launcher,
      core: activeInstance.metadata.current.core,
      skills: activeInstance.metadata.current.skills,
      previous: activeInstance.metadata.previous,
    } : null,
    orchestrator: { name: agent, kind: profile.orchestrator.kind ?? "codex", model: profile.orchestrator.model ?? null, status: getAgentStatus(name, agent, true) },
    beads_dir: paths.beads_dir, relay_dir: paths.relay_dir,
    pending_inbox: existsSync(paths.relay_dir) ? iterEvents(paths.relay_dir, "pending").length : 0,
    pending_deliveries: pendingDeliveries,
    dashboard: dashboardUrl(profile),
    task_ui: taskUiUrl(profile),
    herdrm: herdrmCompatibility(name, profile),
    usage_snapshot: usageSnapshotPath(profile),
    project_registry: { path: projects.registry_path, configured: Boolean(projects.registry_digest), projects: projects.projects.length, workspace_roots: projects.workspace_roots.length, default_policy: "deny" },
    commands: {
      dashboard: displayedProfileCommand(name, "open dashboard"),
      herdr: displayedProfileCommand(name, "open herdr"),
      orchestrator: displayedProfileCommand(name, "open orchestrator"),
      tasks: displayedProfileCommand(name, "open tasks"),
      automations: displayedProfileCommand(name, "open automations"),
      herdrm: displayedProfileCommand(name, "open herdrm"),
      update: activeInstance ? `${shellQuote(activeInstance.layout.launcher)} update` : `hanchou init ${name}`,
    },
  };
  if (asJson) jsonPrint(result, true);
  else {
    console.log(`profile:       ${name}`); console.log(`config root:   ${CONFIG_ROOT}`);
    console.log(`instance:      ${activeInstance ? `${activeInstance.layout.root} / Core ${activeInstance.metadata.current.core.slice(0, 12)} / Skills ${activeInstance.metadata.current.skills.slice(0, 12)}` : "legacy seed checkout"}`);
    console.log(`orchestrator:  ${result.orchestrator.kind} / ${result.orchestrator.model || "provider-default"} / ${agent} / ${result.orchestrator.status || "not-running"}`);
    console.log(`Dashboard:    ${result.dashboard}`); console.log(`Herdr:        herdr --session ${name}`); console.log(`Task UI:      ${result.task_ui}`); console.log(`Beads:        ${paths.beads_dir}`); console.log(`Relay:        ${paths.relay_dir}`);
    console.log(`Inbox pending: ${result.pending_inbox}`); console.log(`Delivery pending: ${result.pending_deliveries}`); console.log(`Usage:        ${result.usage_snapshot}`);
    console.log(`Update:       ${result.commands.update}`);
    console.log(`Projects:     ${projects.registry_path} / ${projects.projects.length} explicit / ${projects.workspace_roots.length} roots${projects.registry_digest ? "" : " / deny-all"}`);
  }
}

type EndpointProbe = { status: number; content_type: string; body: string };

function probeEndpoint(url: string, timeout: number): Promise<EndpointProbe | null> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (value: EndpointProbe | null): void => {
      if (!settled) { settled = true; resolvePromise(value); }
    };
    const request = httpGet(url, { headers: { Accept: "text/html, application/json" } }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 64 * 1024) {
          response.destroy();
          finish(null);
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => finish({
        status: response.statusCode ?? 0,
        content_type: String(response.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("aborted", () => finish(null));
      response.on("error", () => finish(null));
    });
    request.setTimeout(timeout, () => { request.destroy(); finish(null); });
    request.on("error", () => finish(null));
  });
}

function dashboardHealthMatches(probe: EndpointProbe): boolean {
  if (probe.status !== 200 || !probe.content_type.toLowerCase().startsWith("application/json")) return false;
  try {
    const value = JSON.parse(probe.body);
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && value.status === "ok");
  } catch { return false; }
}

function beadsUiMatches(probe: EndpointProbe): boolean {
  return probe.status === 200
    && probe.content_type.toLowerCase().startsWith("text/html")
    && /<title>\s*Beads\s*<\/title>/i.test(probe.body);
}

async function waitForEndpoint(url: string, timeout: number, matches: (probe: EndpointProbe) => boolean): Promise<boolean> {
  const deadline = Date.now() + timeout;
  do {
    const remaining = deadline - Date.now();
    const probe = await probeEndpoint(url, Math.max(250, Math.min(1_000, remaining)));
    if (probe && matches(probe)) return true;
    const afterProbe = deadline - Date.now();
    if (afterProbe <= 0) break;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, Math.min(250, afterProbe)));
  } while (Date.now() < deadline);
  return false;
}

async function endpointOk(url: string, timeout: number): Promise<boolean> {
  const probe = await probeEndpoint(url, timeout);
  return Boolean(probe && probe.status >= 200 && probe.status < 300);
}

async function waitForHerdrReady(name: string, timeout: number): Promise<JsonObject> {
  const expectedVersion = miseTools().herdr;
  const deadline = Date.now() + timeout;
  let snapshot: JsonObject = { running: false, version: null, error: "not checked" };
  do {
    const remaining = deadline - Date.now();
    snapshot = herdrOperationalSnapshot(name, Math.max(500, Math.min(2_000, remaining)));
    if (snapshot.running && snapshot.operational && snapshot.version === expectedVersion) return { ...snapshot, ready: true };
    const afterProbe = deadline - Date.now();
    if (afterProbe <= 0) break;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, Math.min(250, afterProbe)));
  } while (Date.now() < deadline);
  return { ...snapshot, ready: false };
}

async function doctor(name: string, profile: JsonObject): Promise<number> {
  const env = profileEnv(name, profile);
  let failures = 0;
  const activeInstance = configuredInstance(name, false);
  if (activeInstance) {
    console.log(`ok   profile-local instance: ${activeInstance.layout.root}`);
    console.log(`ok   managed Core commit: ${activeInstance.metadata.current.core}`);
    console.log(`ok   managed Skills commit: ${activeInstance.metadata.current.skills}`);
    const transaction = readInstanceTransaction(activeInstance.layout.transaction);
    console.log(`${transaction ? "FAIL" : "ok  "} instance transaction${transaction ? `: incomplete ${transaction.action}/${transaction.status} at ${activeInstance.layout.transaction}` : ": none"}`);
    if (transaction) failures += 1;
  } else {
    const localMetadata = join(defaultInstanceRoot(name), ".hanchou", "instance.json");
    const bypassed = existsSync(localMetadata);
    console.log(`${bypassed ? "FAIL" : "ok  "} profile-local invocation${bypassed ? `: use ${defaultInstanceRoot(name)}/bin/hanchou instead of a seed checkout` : ": seed/development checkout"}`);
    if (bypassed) failures += 1;
  }
  try {
    const registry = loadProjectRegistry(name, true);
    console.log(`ok   project registry: ${registry.projects.length} explicit / ${registry.workspace_roots.length} workspace roots${registry.registry_digest ? "" : " / deny-all"}`);
  } catch (error) {
    console.log(`FAIL project registry: ${error instanceof Error ? error.message : error}`);
    failures += 1;
  }
  const checkCommand = (label: string, binary: string, args: string[]): RunResult | null => {
    try {
      const proc = run([commandPath(binary), ...args], { env, cwd: ROOT, check: false, capture: true, timeout: 15_000 });
      const ok = proc.returncode === 0; console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failures += 1; return ok ? proc : null;
    } catch (error) { console.log(`FAIL ${label}: ${error instanceof Error ? error.message : error}`); failures += 1; return null; }
  };
  checkCommand("mise", "mise", ["--version"]);
  const herdrProc = checkCommand("Herdr", "herdr", ["--version"]);
  const nodeProc = checkCommand("Node.js", "node", ["--version"]);
  checkCommand("Beads / bd", "bd", ["version"]); checkCommand("Codex", "codex", ["--version"]); checkCommand("Claude Code", "claude", ["--version"]); checkCommand("beads-ui", "bdui", ["--help"]);
  const requiredTools = miseTools();
  if (herdrProc) {
    const actual = (herdrProc.stdout || herdrProc.stderr).trim().split(/\s+/).at(-1) ?? ""; const expected = requiredTools.herdr; const ok = actual === expected;
    console.log(`${ok ? "ok  " : "FAIL"} Herdr version: expected ${expected}, got ${actual}`); if (!ok) failures += 1;
  }
  if (nodeProc) {
    const actual = (nodeProc.stdout || nodeProc.stderr).trim().replace(/^v/, ""); const expected = requiredTools.node ?? ""; const ok = actual === expected || actual.startsWith(`${expected}.`);
    console.log(`${ok ? "ok  " : "FAIL"} Node.js version: expected ${expected}, got ${actual}`); if (!ok) failures += 1;
  }
  const server = herdrOperationalSnapshot(name, 15_000);
  const serverOk = server.running && server.operational && server.version === requiredTools.herdr;
  console.log(`${serverOk ? "ok  " : "FAIL"} Herdr server/session${serverOk ? "" : `: ${server.error ?? "control plane unavailable"}`}`); if (!serverOk) failures += 1;
  if (serverOk) {
    try {
      const agents = herdrRecords(name, "agent", "agents");
      const workspaces = herdrRecords(name, "workspace", "workspaces");
      const matching = legacyOrchestratorWorkspaces(profile, workspaces);
      const agentName = String(profile.orchestrator.agent_name);
      const named = agents.find((agent) => agent.name === agentName);
      const binding = orchestratorRuntimeBinding(name, profile);
      let problem: string | null = null;
      if (named) validateNamedOrchestrator(name, profile, named, workspaces, binding);
      if (matching.length > 1) problem = `${matching.length} workspaces labeled ${profile.orchestrator.workspace_label}; open \`${displayedProfileCommand(name, "open herdr")}\` and close only verified empty duplicates`;
      else if (binding && !named) {
        const pane = boundOrchestratorPane(name, binding, workspaces);
        if (!pane) {
          const moved = herdrRecords(name, "pane", "panes").find((item) => item.terminal_id === binding.terminal_id);
          problem = moved
            ? `recorded terminal ${binding.terminal_id} moved to workspace ${String(moved.workspace_id ?? "unknown")}`
            : `recorded workspace ${binding.workspace_id} is missing`;
        }
        else {
          const occupants = agents.filter((agent) => agent.workspace_id === binding.workspace_id && agent.pane_id === binding.pane_id);
          const occupant = occupants[0];
          const expectedKind = String(profile.orchestrator.kind ?? "codex").toLowerCase();
          if (occupants.length > 1) problem = `recorded pane ${binding.pane_id} has multiple Agent records`;
          else if (occupant?.name) problem = `recorded pane ${binding.pane_id} belongs to unexpected Agent ${occupant.name}`;
          else if (occupant && !occupant.launch_pending && String(occupant.agent ?? "").toLowerCase() !== expectedKind) problem = `recorded pane ${binding.pane_id} contains unexpected ${String(occupant.agent ?? "unknown")} Agent`;
          else if (!occupant && (pane.agent !== undefined || pane.agent_session !== undefined)) problem = `recorded pane ${binding.pane_id} is occupied without a matching Agent record`;
        }
      } else if (matching.length && !named) problem = `unbound legacy workspace ${matching[0].workspace_id}; inspect it before starting another Orchestrator`;
      console.log(`${problem ? "FAIL" : "ok  "} Orchestrator workspace topology${problem ? `: ${problem}` : `: ${matching.length} workspace(s) / ${binding ? "bound" : named ? "live Agent" : "not started"}`}`);
      if (problem) failures += 1;
    } catch (error) {
      console.log(`FAIL Orchestrator workspace topology: ${error instanceof Error ? error.message : error}`);
      failures += 1;
    }
  }
  try {
    const proc = run([commandPath("bd"), "ready", "--json"], { env, cwd: profilePaths(profile).control_dir, check: false, capture: true, timeout: 15_000 });
    const ok = proc.returncode === 0; console.log(`${ok ? "ok  " : "FAIL"} Beads ready access`); if (!ok) failures += 1;
  } catch (error) { console.log(`FAIL Beads ready access: ${error instanceof Error ? error.message : error}`); failures += 1; }
  const taskUiEndpoint = `${taskUiUrl(profile)}/`;
  const uiOk = await waitForEndpoint(taskUiEndpoint, 5_000, beadsUiMatches); console.log(`${uiOk ? "ok  " : "FAIL"} beads-ui endpoint: ${taskUiEndpoint}`); if (!uiOk) failures += 1;
  const dashboardEndpoint = `${dashboardUrl(profile)}/health`;
  const dashboardOk = await waitForEndpoint(dashboardEndpoint, 5_000, dashboardHealthMatches); console.log(`${dashboardOk ? "ok  " : "FAIL"} Hanchou dashboard endpoint: ${dashboardEndpoint}`); if (!dashboardOk) failures += 1;
  const herdrm = herdrmCompatibility(name, profile);
  console.log(`ok   Herdrm optional: ${herdrm.installed ? herdrm.compatible ? "installed / compatible" : "installed / named-session incompatible" : "not installed"}`);
  try {
    const proc = run([commandPath("herdr"), "integration", "status"], { env, cwd: ROOT, check: false, capture: true, timeout: 15_000 }); const output = `${proc.stdout}\n${proc.stderr}`;
    for (const [provider, label] of [["codex", "Herdr Codex integration"], ["claude", "Herdr Claude integration"]]) {
      const line = output.split(/\r?\n/).find((item) => item.startsWith(`${provider}:`)) ?? ""; const ok = proc.returncode === 0 && Boolean(line) && !line.includes("not installed");
      console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failures += 1;
    }
  } catch (error) { console.log(`FAIL Herdr integrations: ${error instanceof Error ? error.message : error}`); failures += 2; }
  try {
    const proc = run([commandPath("herdr"), "plugin", "list", "--json"], { env, cwd: ROOT, check: false, capture: true, timeout: 15_000 }); const ok = proc.returncode === 0 && proc.stdout.includes(profile.scheduler.plugin_id);
    console.log(`${ok ? "ok  " : "FAIL"} herdr-automations`); if (!ok) failures += 1;
  } catch (error) { console.log(`FAIL herdr-automations: ${error instanceof Error ? error.message : error}`); failures += 1; }
  try {
    const cliVersion = loadToml(join(ROOT, "config", "versions.toml")).components.skills_cli.version; const entries: JsonObject[] = [];
    for (const scopeArgs of [[], ["--global"]]) {
      const proc = run([commandPath("npx"), "-y", `skills@${cliVersion}`, "list", ...scopeArgs, "--json"], { env, cwd: instanceProjectCwd(name), check: false, capture: true, timeout: 30_000 });
      if (proc.returncode === 0) { const value = JSON.parse(proc.stdout || "[]"); if (Array.isArray(value)) entries.push(...value.filter((item) => item && typeof item === "object")); }
    }
    const expectedSkills = new Set(readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(ROOT, "skills", entry.name, "SKILL.md"))).map((entry) => entry.name));
    const installed = new Set(entries.filter((item) => Array.isArray(item.agents) && item.agents.some((agent: string) => new Set(["Codex", "Claude Code"]).has(agent))).map((item) => item.name));
    const missing = [...expectedSkills].filter((skill) => !installed.has(skill)).sort(); const ok = !missing.length;
    console.log(`${ok ? "ok  " : "FAIL"} Hanchou Skills${ok ? "" : `: missing ${missing.join(", ")}`}`); if (!ok) failures += 1;
  } catch (error) { console.log(`FAIL Hanchou Skills: ${error instanceof Error ? error.message : error}`); failures += 1; }
  try { renderAgents(true); console.log("ok   generated agent definitions"); }
  catch (error) { console.log(`FAIL generated agent definitions: ${error instanceof Error ? error.message : error}`); failures += 1; }
  try {
    const rulesPath = join(instanceProjectCwd(name), ".codex", "rules", "hanchou.rules");
    const info = lstatSync(rulesPath);
    const ok = info.isFile() && !info.isSymbolicLink();
    console.log(`${ok ? "ok  " : "FAIL"} Hanchou Codex control rules: ${rulesPath}`);
    if (!ok) failures += 1;
  } catch (error) {
    console.log(`FAIL Hanchou Codex control rules: ${error instanceof Error ? error.message : error}`);
    failures += 1;
  }
  try {
    const cases: Array<[string[], string | null]> = [
      [["hanchou", "project", "list", "--json"], "allow"],
      [["./bin/hanchou", "project", "list", "--json"], "allow"],
      [["hanchou", "project", "resolve", "--path", instanceProjectCwd(name), "--json"], "allow"],
      [["hanchou", "project", "add", "example", "--path", instanceProjectCwd(name)], null],
      [["hanchou", "inbox", "list", "--json"], "allow"],
      [["./bin/hanchou", "inbox", "list", "--json"], "allow"],
      [["hanchou", "inbox", "claim", "--to", String(profile.orchestrator.agent_name), "--json"], "allow"],
      [["./bin/hanchou", "inbox", "claim", "--to", String(profile.orchestrator.agent_name), "--json"], "allow"],
      [["hanchou", "inbox", "ack", "evt_example", "--by", String(profile.orchestrator.agent_name)], "allow"],
      [["hanchou", "inbox", "retry", "evt_example"], "prompt"],
      [["hanchou", "inbox", "future-command"], null],
    ];
    const activeRules = codexPolicyRulePaths();
    const ruleArgs = activeRules.flatMap((path) => ["--rules", path]);
    const observed = cases.map(([command, expected]) => {
      const proc = run([commandPath("codex"), "execpolicy", "check", ...ruleArgs, "--", ...command], { env, cwd: instanceProjectCwd(name), capture: true, timeout: 15_000 });
      const decision = JSON.parse(proc.stdout).decision ?? null;
      return { command, expected, decision };
    });
    const ok = observed.every((item) => item.expected === item.decision);
    console.log(`${ok ? "ok  " : "FAIL"} Hanchou Codex control rule decisions`);
    if (!ok) failures += 1;
  } catch (error) {
    console.log(`FAIL Hanchou Codex control rule decisions: ${error instanceof Error ? error.message : error}`);
    failures += 1;
  }
  const broadRules = broadUserInboxRulePaths();
  const narrowUserRules = broadRules.length === 0;
  console.log(`${narrowUserRules ? "ok  " : "FAIL"} no broad user-level ["hanchou", "inbox"] allow${broadRules.length ? `: ${broadRules.join(", ")}` : ""}`);
  if (!narrowUserRules) failures += 1;
  const paths = profilePaths(profile);
  for (const [label, path] of [["state root", paths.root], ["relay", paths.relay_dir], ["Beads", paths.beads_dir]]) { const ok = existsSync(path); console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${path}`); if (!ok) failures += 1; }
  return failures;
}

type OptionKind = "boolean" | "string" | "float" | "int" | "repeat";
type OptionDefinition = { key: string; kind: OptionKind };

function optionName(flag: string): string { return flag.replace(/^--/, "").replaceAll("-", "_"); }

function isFloatLexeme(value: string): boolean {
  return /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(value);
}

function parseOptionTokens(tokens: string[], definitions: Record<string, OptionDefinition>): JsonObject {
  const result: JsonObject = { _positionals: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") { result._positionals.push(...tokens.slice(index + 1)); break; }
    if (!token.startsWith("--")) { result._positionals.push(token); continue; }
    const equal = token.indexOf("=");
    const flag = equal >= 0 ? token.slice(0, equal) : token;
    const definition = definitions[flag];
    if (!definition) throw new CommandError(`unrecognized arguments: ${token}`);
    if (definition.kind === "boolean") {
      if (equal >= 0) throw new CommandError(`argument ${flag}: ignored explicit argument '${token.slice(equal + 1)}'`);
      result[definition.key] = true;
      continue;
    }
    const value = equal >= 0 ? token.slice(equal + 1) : tokens[++index];
    if (value === undefined) throw new CommandError(`argument ${flag}: expected one argument`);
    const negativeNumberToken = /^-(?:\d+|\d*\.\d+)$/.test(value);
    if (equal < 0 && value.startsWith("-") && (
      ((definition.kind === "string" || definition.kind === "repeat") && !negativeNumberToken) ||
      (definition.kind === "int" && !/^[-+]?\d+$/.test(value)) ||
      (definition.kind === "float" && !isFloatLexeme(value))
    )) throw new CommandError(`argument ${flag}: expected one argument`);
    if (definition.kind === "float" || definition.kind === "int") {
      const parsed = Number(value);
      const valid = Number.isFinite(parsed) && (definition.kind === "float" ? isFloatLexeme(value) : /^[-+]?\d+$/.test(value));
      if (!valid) throw new CommandError(`argument ${flag}: invalid ${definition.kind} value: '${value}'`);
      result[definition.key] = parsed;
    } else if (definition.kind === "repeat") { result[definition.key] ??= []; result[definition.key].push(value); }
    else result[definition.key] = value;
  }
  return result;
}

function definitions(flags: Array<[string, OptionKind]>): Record<string, OptionDefinition> {
  return Object.fromEntries(flags.map(([flag, kind]) => [`--${flag}`, { key: optionName(flag), kind }]));
}

function positionals(args: JsonObject, minimum: number, maximum = minimum): string[] {
  const rows = args._positionals as string[];
  if (rows.length < minimum) throw new CommandError("the following arguments are required");
  if (rows.length > maximum) throw new CommandError(`unrecognized arguments: ${rows.slice(maximum).join(" ")}`);
  delete args._positionals;
  return rows;
}

function requireOptions(args: JsonObject, names: string[]): void {
  const missing = names.filter((name) => args[optionName(name)] === undefined);
  if (missing.length) throw new CommandError(`the following arguments are required: ${missing.map((name) => `--${name}`).join(", ")}`);
}

function choice(value: any, values: Set<string>, label: string): void {
  if (!values.has(String(value))) throw new CommandError(`argument ${label}: invalid choice: '${value}' (choose from '${[...values].join("', '")}')`);
}

function printHelp(): void {
  console.log(`usage: hanchou [-h] [--config-root CONFIG_ROOT] [--profile {personal,work}]
               {init,update,rollback,onboard,plan,bootstrap,apply,launch,status,doctor,start-orchestrator,stop-orchestrator,dashboard,open,render-agents,handoff,project,usage,route,execution,relay,inbox,delivery} ...

Herdr-first Hanchou control utility

positional arguments:
  {init,update,rollback,onboard,plan,bootstrap,apply,launch,status,doctor,start-orchestrator,stop-orchestrator,dashboard,open,render-agents,handoff,project,usage,route,execution,relay,inbox,delivery}

options:
  -h, --help            show this help message and exit
  --config-root CONFIG_ROOT
                        configuration root; defaults to HANCHOU_CONFIG_ROOT or
                        ./config
  --profile {personal,work}
                        profile; defaults to HANCHOU_PROFILE or work`);
}

function profileHelp(command: string): string {
  return `usage: hanchou ${command} [-h] [{personal,work}]

positional arguments:
  {personal,work}

options:
  -h, --help       show this help message and exit`;
}

function noArgumentHelp(command: string): string {
  return `usage: hanchou ${command} [-h]

options:
  -h, --help  show this help message and exit`;
}

const HELP_SURFACES: Record<string, string> = {
  init: `usage: hanchou init [-h] [--plan PLAN] [--yes] [{personal,work}]

Prepare or install a profile-local Hanchou instance below ~/HanchouWorkspace/<profile>.
The plan downloads and validates exact public Core and Skills commits without changing the deployed instance.

options:
  -h, --help       show this help message and exit
  --plan PLAN      exact validated candidate token printed by the prepare step
  --yes            install the reviewed candidate from an ordinary terminal`,
  update: `usage: hanchou update [-h] [--plan PLAN] [--yes] [{personal,work}]

Prepare or apply an exact validated Core + Skills update for this profile-local instance.

options:
  -h, --help       show this help message and exit
  --plan PLAN      exact validated candidate token printed by the prepare step
  --yes            apply the reviewed candidate from an ordinary terminal`,
  rollback: `usage: hanchou rollback [-h] [--plan PLAN] [--yes] [{personal,work}]

Prepare or apply a rollback to the previous validated Core + Skills commit pair.

options:
  -h, --help       show this help message and exit
  --plan PLAN      exact validated rollback token printed by the prepare step
  --yes            apply the reviewed rollback from an ordinary terminal`,
  onboard: `usage: hanchou onboard [-h] [--yes] [{personal,work}]

Create the fixed dedicated repository shelf and add its human-owned workspace-root authorization.
Without --yes this command only prints the plan. Applying requires an ordinary interactive terminal.

positional arguments:
  {personal,work}

options:
  -h, --help       show this help message and exit
  --yes            apply the reviewed onboarding plan`,
  plan: profileHelp("plan"),
  bootstrap: profileHelp("bootstrap"),
  doctor: profileHelp("doctor"),
  "start-orchestrator": profileHelp("start-orchestrator"),
  "stop-orchestrator": `usage: hanchou stop-orchestrator [-h] --all [--include-unmanaged] [--plan PLAN] [--yes] [{personal,work}]

Plan or close every validated dedicated Orchestrator workspace in the selected profile.
Applying terminates every process in those panes and must run in the human operator's ordinary terminal.

positional arguments:
  {personal,work}

options:
  -h, --help       show this help message and exit
  --all            explicitly select every validated dedicated Orchestrator workspace
  --include-unmanaged
                    include contained unbound legacy panes that are not proven idle
  --plan PLAN      exact plan token printed by the immediately preceding review
  --yes            apply the reviewed stop plan`,
  apply: `usage: hanchou apply [-h] [--yes] [--install-upstream] [{personal,work}]

positional arguments:
  {personal,work}

options:
  -h, --help          show this help message and exit
  --yes
  --install-upstream`,
  launch: `usage: hanchou launch [-h] [--no-browser] [--herdrm] [{personal,work}]

Verify the Hanchou services, start or initialize the Orchestrator, and open the dashboard.

positional arguments:
  {personal,work}

options:
  -h, --help       show this help message and exit
  --no-browser     do not open the dashboard in the default browser
  --herdrm         also try the optional Herdrm app after compatibility checks`,
  status: `usage: hanchou status [-h] [--json] [{personal,work}]

positional arguments:
  {personal,work}

options:
  -h, --help       show this help message and exit
  --json`,
  dashboard: `usage: hanchou dashboard [-h] {serve,snapshot} ...

positional arguments:
  {serve,snapshot}

options:
  -h, --help       show this help message and exit`,
  "dashboard serve": profileHelp("dashboard serve"),
  "dashboard snapshot": profileHelp("dashboard snapshot"),
  open: `usage: hanchou open [-h]
                    {dashboard,tasks,herdr,herdrm,orchestrator,automations} [{personal,work}]

positional arguments:
  {dashboard,tasks,herdr,herdrm,orchestrator,automations}
  {personal,work}

options:
  -h, --help            show this help message and exit`,
  "render-agents": `usage: hanchou render-agents [-h] [--check]

options:
  -h, --help  show this help message and exit
  --check`,
  handoff: noArgumentHelp("handoff"),
  project: `usage: hanchou project [-h] {list,show,resolve,doctor} ...

positional arguments:
  {list,show,resolve,doctor}

options:
  -h, --help            show this help message and exit`,
  "project list": `usage: hanchou project list [-h] [--json]

options:
  -h, --help  show this help message and exit
  --json`,
  "project show": `usage: hanchou project show [-h] [--json] project_id

positional arguments:
  project_id

options:
  -h, --help  show this help message and exit
  --json`,
  "project resolve": `usage: hanchou project resolve [-h] --path PATH
                               [--project PROJECT_ID] [--json]

options:
  -h, --help            show this help message and exit
  --path PATH
  --project PROJECT_ID  require this exact authorized project identity
  --json`,
  "project doctor": `usage: hanchou project doctor [-h] [--json] [project_id]

positional arguments:
  project_id

options:
  -h, --help  show this help message and exit
  --json`,
  usage: `usage: hanchou usage [-h] {set,show,recommend} ...

positional arguments:
  {set,show,recommend}
    recommend           compatibility alias for route resolve

options:
  -h, --help            show this help message and exit`,
  "usage set": `usage: hanchou usage set [-h] --weekly-remaining WEEKLY_REMAINING
                         [--session-remaining SESSION_REMAINING]
                         [--reset-at RESET_AT]
                         [--source {manual,probe,unknown}] [--json]
                         {codex,claude}

positional arguments:
  {codex,claude}

options:
  -h, --help            show this help message and exit
  --weekly-remaining WEEKLY_REMAINING
  --session-remaining SESSION_REMAINING
  --reset-at RESET_AT
  --source {manual,probe,unknown}
  --json`,
  "usage show": `usage: hanchou usage show [-h] [--json]

options:
  -h, --help  show this help message and exit
  --json`,
  "usage recommend": `usage: hanchou usage recommend [-h]
                               --role {orchestrator,mission-lead,researcher,implementer,writer,editor,reviewer}
                               [--task-kind TASK_KIND] [--japanese] [--json]

options:
  -h, --help            show this help message and exit
  --role {orchestrator,mission-lead,researcher,implementer,writer,editor,reviewer}
  --task-kind TASK_KIND
  --japanese
  --json`,
  route: `usage: hanchou route [-h] {resolve} ...

positional arguments:
  {resolve}

options:
  -h, --help  show this help message and exit`,
  "route resolve": `usage: hanchou route resolve [-h]
                             --role {orchestrator,mission-lead,researcher,implementer,writer,editor,reviewer}
                             [--task-kind TASK_KIND] [--japanese] [--json]

options:
  -h, --help            show this help message and exit
  --role {orchestrator,mission-lead,researcher,implementer,writer,editor,reviewer}
  --task-kind TASK_KIND
  --japanese
  --json`,
  execution: `usage: hanchou execution [-h] {dispatch,inspect,reconcile} ...

positional arguments:
  {dispatch,inspect,reconcile}

options:
  -h, --help            show this help message and exit`,
  "execution dispatch": `usage: hanchou execution dispatch [-h] [--json] task_id

positional arguments:
  task_id

options:
  -h, --help  show this help message and exit
  --json`,
  "execution inspect": `usage: hanchou execution inspect [-h] [--json] task_id

positional arguments:
  task_id

options:
  -h, --help  show this help message and exit
  --json`,
  "execution reconcile": `usage: hanchou execution reconcile [-h] [--json] [task_id]

positional arguments:
  task_id

options:
  -h, --help  show this help message and exit
  --json`,
  relay: `usage: hanchou relay [-h] {emit,recover,dispatch,daemon} ...

positional arguments:
  {emit,recover,dispatch,daemon}

options:
  -h, --help            show this help message and exit`,
  "relay emit": `usage: hanchou relay emit [-h] --type TYPE [--task TASK]
                          [--execution EXECUTION] --from-agent FROM_AGENT
                          --from-role FROM_ROLE --to-agent TO_AGENT
                          --to-role TO_ROLE
                          [--delegation-depth DELEGATION_DEPTH]
                          --summary SUMMARY [--detail-ref DETAIL_REF]
                          [--artifact ARTIFACT] [--verification VERIFICATION]
                          [--origin ORIGIN] [--event-id EVENT_ID] [--no-nudge]
                          [--json]

options:
  -h, --help            show this help message and exit
  --type TYPE
  --task TASK
  --execution EXECUTION
  --from-agent FROM_AGENT
  --from-role FROM_ROLE
  --to-agent TO_AGENT
  --to-role TO_ROLE
  --delegation-depth DELEGATION_DEPTH
  --summary SUMMARY
  --detail-ref DETAIL_REF
  --artifact ARTIFACT
  --verification VERIFICATION
  --origin ORIGIN       JSON origin descriptor for local or future Chat
                        delivery
  --event-id EVENT_ID
  --no-nudge
  --json`,
  "relay recover": noArgumentHelp("relay recover"),
  "relay dispatch": noArgumentHelp("relay dispatch"),
  "relay daemon": noArgumentHelp("relay daemon"),
  inbox: `usage: hanchou inbox [-h] {list,claim,show,ack,retry,dead-letter} ...

positional arguments:
  {list,claim,show,ack,retry,dead-letter}

options:
  -h, --help            show this help message and exit`,
  "inbox list": `usage: hanchou inbox list [-h]
                          [--state {pending,processing,acknowledged,dead-letter}]
                          [--to TO] [--json]

options:
  -h, --help            show this help message and exit
  --state {pending,processing,acknowledged,dead-letter}
  --to TO
  --json`,
  "inbox claim": `usage: hanchou inbox claim [-h] [--to TO] [--limit LIMIT] [--json]

options:
  -h, --help     show this help message and exit
  --to TO
  --limit LIMIT
  --json`,
  "inbox show": `usage: hanchou inbox show [-h] event_id

positional arguments:
  event_id

options:
  -h, --help  show this help message and exit`,
  "inbox ack": `usage: hanchou inbox ack [-h] [--by BY] [--note NOTE] [--json] event_id

positional arguments:
  event_id

options:
  -h, --help   show this help message and exit
  --by BY
  --note NOTE
  --json`,
  "inbox retry": `usage: hanchou inbox retry [-h] event_id

positional arguments:
  event_id

options:
  -h, --help  show this help message and exit`,
  "inbox dead-letter": `usage: hanchou inbox dead-letter [-h] --reason REASON event_id

positional arguments:
  event_id

options:
  -h, --help       show this help message and exit
  --reason REASON`,
  delivery: `usage: hanchou delivery [-h]
                        {create,list,show,mark-rendered,mark-delivered,fail,retry} ...

positional arguments:
  {create,list,show,mark-rendered,mark-delivered,fail,retry}

options:
  -h, --help            show this help message and exit`,
  "delivery create": `usage: hanchou delivery create [-h]
                               --kind {alert,daily_digest,decision,manual,schedule_report,task_terminal}
                               [--task TASK] [--source-event SOURCE_EVENT]
                               --policy {always,digest,immediate,on_change,on_failure,on_terminal,parent_only,silent}
                               --renderer {editor,orchestrator,producer}
                               --destination DESTINATION --summary SUMMARY
                               [--body-ref BODY_REF] [--dedupe-key DEDUPE_KEY]
                               [--coalesce-key COALESCE_KEY]
                               [--not-before NOT_BEFORE]
                               [--delivery-id DELIVERY_ID] [--json]

options:
  -h, --help            show this help message and exit
  --kind {alert,daily_digest,decision,manual,schedule_report,task_terminal}
  --task TASK
  --source-event SOURCE_EVENT
  --policy {always,digest,immediate,on_change,on_failure,on_terminal,parent_only,silent}
  --renderer {editor,orchestrator,producer}
  --destination DESTINATION
                        JSON destination descriptor
  --summary SUMMARY
  --body-ref BODY_REF
  --dedupe-key DEDUPE_KEY
  --coalesce-key COALESCE_KEY
  --not-before NOT_BEFORE
  --delivery-id DELIVERY_ID
  --json`,
  "delivery list": `usage: hanchou delivery list [-h]
                             [--state {pending,rendered,delivered,failed}]
                             [--task TASK] [--json]

options:
  -h, --help            show this help message and exit
  --state {pending,rendered,delivered,failed}
  --task TASK
  --json`,
  "delivery show": `usage: hanchou delivery show [-h] delivery_id

positional arguments:
  delivery_id

options:
  -h, --help   show this help message and exit`,
  "delivery mark-rendered": `usage: hanchou delivery mark-rendered [-h] --by BY [--message MESSAGE]
                                      [--message-file MESSAGE_FILE]
                                      delivery_id

positional arguments:
  delivery_id

options:
  -h, --help            show this help message and exit
  --by BY
  --message MESSAGE
  --message-file MESSAGE_FILE`,
  "delivery mark-delivered": `usage: hanchou delivery mark-delivered [-h] --adapter ADAPTER
                                       [--external-id EXTERNAL_ID]
                                       [--note NOTE]
                                       delivery_id

positional arguments:
  delivery_id

options:
  -h, --help            show this help message and exit
  --adapter ADAPTER
  --external-id EXTERNAL_ID
  --note NOTE`,
  "delivery fail": `usage: hanchou delivery fail [-h] --reason REASON delivery_id

positional arguments:
  delivery_id

options:
  -h, --help       show this help message and exit
  --reason REASON`,
  "delivery retry": `usage: hanchou delivery retry [-h] delivery_id

positional arguments:
  delivery_id

options:
  -h, --help   show this help message and exit`,
};

function helpSurfaceKey(argv: string[]): string | null {
  if (!argv.includes("--help") && !argv.includes("-h")) return null;
  const commands: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") break;
    if (token === "--config-root" || token === "--profile") { index += 1; continue; }
    if (token.startsWith("--config-root=") || token.startsWith("--profile=")) continue;
    if (!token.startsWith("-")) commands.push(token);
    if (commands.length === 2) break;
  }
  if (!commands.length) return "";
  const nested = new Set(["dashboard", "project", "usage", "route", "execution", "relay", "inbox", "delivery"]);
  return nested.has(commands[0]) && commands.length > 1 ? `${commands[0]} ${commands[1]}` : commands[0];
}

function printRequestedHelp(argv: string[]): boolean {
  const key = helpSurfaceKey(argv);
  if (key === null) return false;
  if (!key) printHelp(); else console.log(HELP_SURFACES[key] ?? HELP_SURFACES[key.split(" ")[0]] ?? "");
  return true;
}

function parseCliUnchecked(argv: string[]): JsonObject {
  if (printRequestedHelp(argv)) return { command: "__help__" };
  const result: JsonObject = { config_root: null, profile: null };
  let index = 0;
  while (index < argv.length && argv[index].startsWith("--")) {
    const token = argv[index];
    const equal = token.indexOf("=");
    const flag = equal >= 0 ? token.slice(0, equal) : token;
    if (!new Set(["--config-root", "--profile"]).has(flag)) break;
    const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
    if (value === undefined) throw new CommandError(`argument ${flag}: expected one argument`);
    result[optionName(flag)] = value; index += 1;
  }
  if (index >= argv.length) throw new CommandError("the following arguments are required: command");
  if (result.profile !== null) choice(result.profile, new Set(["personal", "work"]), "--profile");
  result.command = argv[index++];
  const rest = argv.slice(index);
  const profileCommand = (flags: Array<[string, OptionKind]> = []): JsonObject => {
    const parsed = parseOptionTokens(rest, definitions(flags));
    const rows = positionals(parsed, 0, 1); parsed.profile_name = rows[0] ?? null;
    if (parsed.profile_name !== null) choice(parsed.profile_name, new Set(["personal", "work"]), "profile_name");
    return { ...result, ...parsed };
  };
  if (result.command === "plan" || result.command === "bootstrap" || result.command === "doctor" || result.command === "start-orchestrator") return profileCommand();
  if (new Set(["init", "update", "rollback"]).has(result.command)) {
    const parsed = profileCommand([["plan", "string"], ["yes", "boolean"]]);
    parsed.plan ??= null;
    if (parsed.yes && !parsed.plan) throw new CommandError("the following arguments are required: --plan");
    if (parsed.plan && !parsed.yes) throw new CommandError("argument --plan: requires --yes");
    if (parsed.plan && !/^[a-f0-9]{64}$/.test(String(parsed.plan))) throw new CommandError(`argument --plan: invalid plan token: '${parsed.plan}'`);
    return parsed;
  }
  if (result.command === "stop-orchestrator") {
    const parsed = profileCommand([["all", "boolean"], ["include-unmanaged", "boolean"], ["plan", "string"], ["yes", "boolean"]]);
    if (!parsed.all) throw new CommandError("the following arguments are required: --all");
    parsed.plan ??= null;
    if (parsed.yes && !parsed.plan) throw new CommandError("the following arguments are required: --plan");
    if (parsed.plan && !parsed.yes) throw new CommandError("argument --plan: requires --yes");
    if (parsed.plan && !/^[a-f0-9]{64}$/.test(String(parsed.plan))) throw new CommandError(`argument --plan: invalid plan token: '${parsed.plan}'`);
    return parsed;
  }
  if (result.command === "onboard") return profileCommand([["yes", "boolean"]]);
  if (result.command === "launch") return profileCommand([["no-browser", "boolean"], ["herdrm", "boolean"]]);
  if (result.command === "apply") return profileCommand([["yes", "boolean"], ["install-upstream", "boolean"]]);
  if (result.command === "status") return profileCommand([["json", "boolean"]]);
  if (result.command === "open") {
    const parsed = parseOptionTokens(rest, {}); const rows = positionals(parsed, 1, 2); parsed.target = rows[0]; parsed.profile_name = rows[1] ?? null;
    choice(parsed.target, new Set(["dashboard", "tasks", "herdr", "herdrm", "orchestrator", "automations"]), "target");
    if (parsed.profile_name !== null) choice(parsed.profile_name, new Set(["personal", "work"]), "profile_name");
    return { ...result, ...parsed };
  }
  if (result.command === "render-agents") { const parsed = parseOptionTokens(rest, definitions([["check", "boolean"]])); positionals(parsed, 0); return { ...result, ...parsed }; }
  if (result.command === "handoff") { const parsed = parseOptionTokens(rest, {}); positionals(parsed, 0); return { ...result, ...parsed }; }
  if (result.command === "dashboard") {
    if (!rest.length) throw new CommandError("the following arguments are required: dashboard_command");
    const subcommand = rest[0];
    choice(subcommand, new Set(["serve", "snapshot"]), "dashboard_command");
    const parsed = parseOptionTokens(rest.slice(1), {});
    const rows = positionals(parsed, 0, 1);
    parsed.profile_name = rows[0] ?? null;
    if (parsed.profile_name !== null) choice(parsed.profile_name, new Set(["personal", "work"]), "profile_name");
    return { ...result, ...parsed, dashboard_command: subcommand };
  }
  if (new Set(["project", "usage", "route", "execution", "relay", "inbox", "delivery"]).has(result.command)) {
    if (!rest.length) throw new CommandError(`the following arguments are required: ${result.command}_command`);
    const subcommand = rest[0]; const tokens = rest.slice(1); result[`${result.command}_command`] = subcommand;
    const routing = (): JsonObject => {
      const parsed = parseOptionTokens(tokens, definitions([["role", "string"], ["task-kind", "string"], ["japanese", "boolean"], ["json", "boolean"]]));
      positionals(parsed, 0); requireOptions(parsed, ["role"]); parsed.task_kind ??= "general"; choice(parsed.role, new Set(["orchestrator", "mission-lead", "researcher", "implementer", "writer", "editor", "reviewer"]), "--role"); return { ...result, ...parsed };
    };
    if (result.command === "project") {
      if (subcommand === "list") { const parsed = parseOptionTokens(tokens, definitions([["json", "boolean"]])); positionals(parsed, 0); return { ...result, ...parsed }; }
      if (subcommand === "show") { const parsed = parseOptionTokens(tokens, definitions([["json", "boolean"]])); const rows = positionals(parsed, 1); parsed.project_id = rows[0]; return { ...result, ...parsed }; }
      if (subcommand === "resolve") {
        const parsed = parseOptionTokens(tokens, definitions([["path", "string"], ["project", "string"], ["json", "boolean"]])); positionals(parsed, 0); requireOptions(parsed, ["path"]); parsed.project_id = parsed.project ?? null; delete parsed.project; return { ...result, ...parsed };
      }
      if (subcommand === "doctor") { const parsed = parseOptionTokens(tokens, definitions([["json", "boolean"]])); const rows = positionals(parsed, 0, 1); parsed.project_id = rows[0] ?? null; return { ...result, ...parsed }; }
      throw new CommandError(`unknown project command: ${subcommand}`);
    }
    if (result.command === "usage") {
      if (subcommand === "set") {
        const parsed = parseOptionTokens(tokens, definitions([["weekly-remaining", "float"], ["session-remaining", "float"], ["reset-at", "string"], ["source", "string"], ["json", "boolean"]]));
        const rows = positionals(parsed, 1); parsed.provider = rows[0]; requireOptions(parsed, ["weekly-remaining"]); parsed.session_remaining ??= null; parsed.reset_at ??= null; parsed.source ??= "manual";
        choice(parsed.provider, new Set(["codex", "claude"]), "provider"); choice(parsed.source, new Set(["manual", "probe", "unknown"]), "--source"); return { ...result, ...parsed };
      }
      if (subcommand === "show") { const parsed = parseOptionTokens(tokens, definitions([["json", "boolean"]])); positionals(parsed, 0); return { ...result, ...parsed }; }
      if (subcommand === "recommend") return routing();
      throw new CommandError(`unknown usage command: ${subcommand}`);
    }
    if (result.command === "route") { if (subcommand !== "resolve") throw new CommandError(`unknown route command: ${subcommand}`); return routing(); }
    if (result.command === "execution") {
      if (subcommand === "dispatch" || subcommand === "inspect") { const parsed = parseOptionTokens(tokens, definitions([["json", "boolean"]])); const rows = positionals(parsed, 1); parsed.task_id = rows[0]; return { ...result, ...parsed }; }
      if (subcommand === "reconcile") { const parsed = parseOptionTokens(tokens, definitions([["json", "boolean"]])); const rows = positionals(parsed, 0, 1); parsed.task_id = rows[0] ?? null; return { ...result, ...parsed }; }
      throw new CommandError(`unknown execution command: ${subcommand}`);
    }
    if (result.command === "relay") {
      if (subcommand === "emit") {
        const parsed = parseOptionTokens(tokens, definitions([
          ["type", "string"], ["task", "string"], ["execution", "string"], ["from-agent", "string"], ["from-role", "string"], ["to-agent", "string"], ["to-role", "string"],
          ["delegation-depth", "int"], ["summary", "string"], ["detail-ref", "string"], ["artifact", "repeat"], ["verification", "repeat"], ["origin", "string"], ["event-id", "string"], ["no-nudge", "boolean"], ["json", "boolean"],
        ]));
        positionals(parsed, 0); requireOptions(parsed, ["type", "from-agent", "from-role", "to-agent", "to-role", "summary"]);
        parsed.task ??= null; parsed.execution ??= null; parsed.delegation_depth ??= 1; parsed.detail_ref ??= null; parsed.artifact ??= []; parsed.verification ??= []; parsed.origin ??= null; parsed.event_id ??= null; return { ...result, ...parsed };
      }
      if (new Set(["recover", "dispatch", "daemon"]).has(subcommand)) { const parsed = parseOptionTokens(tokens, {}); positionals(parsed, 0); return { ...result, ...parsed }; }
      throw new CommandError(`unknown relay command: ${subcommand}`);
    }
    if (result.command === "inbox") {
      if (subcommand === "list") {
        const parsed = parseOptionTokens(tokens, definitions([["state", "string"], ["to", "string"], ["json", "boolean"]])); positionals(parsed, 0); parsed.state ??= null; parsed.to ??= null;
        if (parsed.state) choice(parsed.state, new Set(["pending", "processing", "acknowledged", "dead-letter"]), "--state"); return { ...result, ...parsed };
      }
      if (subcommand === "claim") { const parsed = parseOptionTokens(tokens, definitions([["to", "string"], ["limit", "int"], ["json", "boolean"]])); positionals(parsed, 0); parsed.to ??= null; parsed.limit ??= null; return { ...result, ...parsed }; }
      if (subcommand === "show" || subcommand === "retry") { const parsed = parseOptionTokens(tokens, {}); const rows = positionals(parsed, 1); parsed.event_id = rows[0]; return { ...result, ...parsed }; }
      if (subcommand === "ack") { const parsed = parseOptionTokens(tokens, definitions([["by", "string"], ["note", "string"], ["json", "boolean"]])); const rows = positionals(parsed, 1); parsed.event_id = rows[0]; parsed.by ??= null; parsed.note ??= null; return { ...result, ...parsed }; }
      if (subcommand === "dead-letter") { const parsed = parseOptionTokens(tokens, definitions([["reason", "string"]])); const rows = positionals(parsed, 1); parsed.event_id = rows[0]; requireOptions(parsed, ["reason"]); return { ...result, ...parsed }; }
      throw new CommandError(`unknown inbox command: ${subcommand}`);
    }
    if (result.command === "delivery") {
      if (subcommand === "create") {
        const parsed = parseOptionTokens(tokens, definitions([
          ["kind", "string"], ["task", "string"], ["source-event", "string"], ["policy", "string"], ["renderer", "string"], ["destination", "string"], ["summary", "string"],
          ["body-ref", "string"], ["dedupe-key", "string"], ["coalesce-key", "string"], ["not-before", "string"], ["delivery-id", "string"], ["json", "boolean"],
        ]));
        positionals(parsed, 0); requireOptions(parsed, ["kind", "policy", "renderer", "destination", "summary"]);
        for (const key of ["task", "source_event", "body_ref", "dedupe_key", "coalesce_key", "not_before", "delivery_id"]) parsed[key] ??= null;
        choice(parsed.kind, new Set([...DELIVERY_KINDS].sort()), "--kind"); choice(parsed.policy, new Set([...REPORTING_POLICIES].sort()), "--policy"); choice(parsed.renderer, new Set([...DELIVERY_RENDERERS].sort()), "--renderer"); return { ...result, ...parsed };
      }
      if (subcommand === "list") {
        const parsed = parseOptionTokens(tokens, definitions([["state", "string"], ["task", "string"], ["json", "boolean"]])); positionals(parsed, 0); parsed.state ??= null; parsed.task ??= null;
        if (parsed.state) choice(parsed.state, new Set(["pending", "rendered", "delivered", "failed"]), "--state"); return { ...result, ...parsed };
      }
      if (subcommand === "show" || subcommand === "retry") { const parsed = parseOptionTokens(tokens, {}); const rows = positionals(parsed, 1); parsed.delivery_id = rows[0]; return { ...result, ...parsed }; }
      if (subcommand === "mark-rendered") {
        const parsed = parseOptionTokens(tokens, definitions([["by", "string"], ["message", "string"], ["message-file", "string"]])); const rows = positionals(parsed, 1); parsed.delivery_id = rows[0]; requireOptions(parsed, ["by"]); parsed.message ??= null; parsed.message_file ??= null; return { ...result, ...parsed };
      }
      if (subcommand === "mark-delivered") {
        const parsed = parseOptionTokens(tokens, definitions([["adapter", "string"], ["external-id", "string"], ["note", "string"]])); const rows = positionals(parsed, 1); parsed.delivery_id = rows[0]; requireOptions(parsed, ["adapter"]); parsed.external_id ??= null; parsed.note ??= null; return { ...result, ...parsed };
      }
      if (subcommand === "fail") { const parsed = parseOptionTokens(tokens, definitions([["reason", "string"]])); const rows = positionals(parsed, 1); parsed.delivery_id = rows[0]; requireOptions(parsed, ["reason"]); return { ...result, ...parsed }; }
      throw new CommandError(`unknown delivery command: ${subcommand}`);
    }
  }
  throw new CommandError(`invalid choice: '${result.command}'`);
}

const SUBCOMMAND_CHOICES: Record<string, string[]> = {
  dashboard: ["serve", "snapshot"],
  project: ["list", "show", "resolve", "doctor"], usage: ["set", "show", "recommend"], route: ["resolve"], execution: ["dispatch", "inspect", "reconcile"],
  relay: ["emit", "recover", "dispatch", "daemon"], inbox: ["list", "claim", "show", "ack", "retry", "dead-letter"],
  delivery: ["create", "list", "show", "mark-rendered", "mark-delivered", "fail", "retry"],
};
const TOP_LEVEL_COMMANDS = ["init", "update", "rollback", "onboard", "plan", "bootstrap", "apply", "launch", "status", "doctor", "start-orchestrator", "stop-orchestrator", "dashboard", "open", "render-agents", "handoff", "project", "usage", "route", "execution", "relay", "inbox", "delivery"];
const REQUIRED_FLAGS: Record<string, string[]> = {
  "stop-orchestrator": ["all"],
  "project resolve": ["path"], "usage set": ["weekly-remaining"], "usage recommend": ["role"], "route resolve": ["role"],
  "relay emit": ["type", "from-agent", "from-role", "to-agent", "to-role", "summary"],
  "inbox dead-letter": ["reason"],
  "delivery create": ["kind", "policy", "renderer", "destination", "summary"],
  "delivery mark-rendered": ["by"], "delivery mark-delivered": ["adapter"], "delivery fail": ["reason"],
};
const REQUIRED_POSITIONALS: Record<string, string> = {
  open: "target", "project show": "project_id", "usage set": "provider", "execution dispatch": "task_id", "execution inspect": "task_id",
  "inbox show": "event_id", "inbox ack": "event_id", "inbox retry": "event_id", "inbox dead-letter": "event_id",
  "delivery show": "delivery_id", "delivery mark-rendered": "delivery_id", "delivery mark-delivered": "delivery_id",
  "delivery fail": "delivery_id", "delivery retry": "delivery_id",
};

function argumentContext(argv: string[]): string {
  const profileIndex = argv.findIndex((token) => token === "--profile" || token.startsWith("--profile="));
  if (profileIndex >= 0) {
    const token = argv[profileIndex];
    const selected = token.includes("=") ? token.slice(token.indexOf("=") + 1) : argv[profileIndex + 1];
    if (selected !== undefined && !new Set(["personal", "work"]).has(selected)) return "";
  }
  const words: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--config-root" || token === "--profile") { index += 1; continue; }
    if (token.startsWith("--config-root=") || token.startsWith("--profile=")) continue;
    if (!token.startsWith("-")) words.push(token);
    if (words.length >= 2) break;
  }
  if (!words.length || !TOP_LEVEL_COMMANDS.includes(words[0])) return "";
  if (SUBCOMMAND_CHOICES[words[0]]?.includes(words[1])) return `${words[0]} ${words[1]}`;
  return words[0];
}

function argumentUsage(context: string): string {
  if (!context) return `usage: hanchou [-h] [--config-root CONFIG_ROOT] [--profile {personal,work}]
               {init,update,rollback,onboard,plan,bootstrap,apply,launch,status,doctor,start-orchestrator,stop-orchestrator,dashboard,open,render-agents,handoff,project,usage,route,execution,relay,inbox,delivery} ...`;
  return (HELP_SURFACES[context] ?? HELP_SURFACES[context.split(" ")[0]]).split("\n\n")[0];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.some((token) => token === `--${flag}` || token.startsWith(`--${flag}=`));
}

function normalizeArgumentMessage(argv: string[], context: string, raw: string): string {
  if (!context && raw.startsWith("invalid choice:")) return `argument command: ${raw} (choose from '${TOP_LEVEL_COMMANDS.join("', '")}')`;
  const unknownSubcommand = raw.match(/^unknown (dashboard|project|usage|route|execution|relay|inbox|delivery) command: (.+)$/);
  if (unknownSubcommand) {
    const command = unknownSubcommand[1]; const value = unknownSubcommand[2];
    return `argument ${command}_command: invalid choice: '${value}' (choose from '${SUBCOMMAND_CHOICES[command].join("', '")}')`;
  }
  const missingFlags = (REQUIRED_FLAGS[context] ?? []).filter((flag) => !hasFlag(argv, flag)).map((flag) => `--${flag}`);
  if (raw === "the following arguments are required") {
    const missing = [REQUIRED_POSITIONALS[context], ...missingFlags].filter(Boolean);
    return `the following arguments are required: ${missing.join(", ")}`;
  }
  if (raw.startsWith("unrecognized arguments:") && missingFlags.length) return `the following arguments are required: ${missingFlags.join(", ")}`;
  return raw;
}

function parseCli(argv: string[]): JsonObject {
  try { return parseCliUnchecked(argv); }
  catch (error) {
    if (!(error instanceof CommandError)) throw error;
    let context = argumentContext(argv);
    const message = normalizeArgumentMessage(argv, context, error.message);
    if (message.startsWith("unrecognized arguments:")) context = "";
    throw new ArgumentError(context, message);
  }
}

async function main(): Promise<void> {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.command === "__help__") return;
    CONFIG_ROOT = args.config_root ? expand(args.config_root) : process.env.HANCHOU_CONFIG_ROOT ? expand(process.env.HANCHOU_CONFIG_ROOT) : DEFAULT_CONFIG_ROOT;
    const managedRuntime = new Set(["init", "update", "rollback", "start-orchestrator", "stop-orchestrator", "launch", "execution"]).has(args.command);
    if (managedRuntime) {
      let selectedConfig: string;
      let defaultConfig: string;
      try {
        selectedConfig = realpathSync(CONFIG_ROOT);
        defaultConfig = realpathSync(DEFAULT_CONFIG_ROOT);
      } catch {
        throw new CommandError(`managed Agent runtime requires the checked-in config root: ${DEFAULT_CONFIG_ROOT}`);
      }
      if (selectedConfig !== defaultConfig) {
        throw new CommandError(`managed Agent runtime does not accept a custom --config-root or HANCHOU_CONFIG_ROOT; use ${DEFAULT_CONFIG_ROOT}`);
      }
    }
    if (args.command === "render-agents") { renderAgents(Boolean(args.check)); return; }
    if (args.command === "handoff") { console.log(readText(join(ROOT, "docs", "SESSION_HANDOFF.md"))); return; }
    const [name, profile] = loadProfile(args.profile_name || args.profile);
    for (const [key, value] of Object.entries(profileEnv(name, profile))) if ((key.startsWith("HANCHOU_") || new Set(["BEADS_DIR", "BD_AGENT_PROFILE"]).has(key)) && value !== undefined) process.env[key] = value;
    switch (args.command) {
      case "init": initInstanceCommand(args, name, profile); break;
      case "update": updateInstanceCommand(args, name, profile); break;
      case "rollback": rollbackInstanceCommand(args, name, profile); break;
      case "onboard": onboardProfile(args, name); break;
      case "plan": printPlan(name, profile); break;
      case "bootstrap": bootstrapProfile(name, profile); break;
      case "apply": applyProfile(name, profile, Boolean(args.yes), Boolean(args.install_upstream)); break;
      case "launch": await launchProfile(args, name, profile); break;
      case "status": statusCommand(name, profile, Boolean(args.json)); break;
      case "doctor": process.exitCode = await doctor(name, profile); break;
      case "start-orchestrator": {
        const ready = await waitForHerdrReady(name, 8_000);
        if (!ready.ready) {
          const detail = ready.error ? `: ${ready.error}` : "";
          throw new CommandError(`Herdr session \`${name}\` is not operational${detail}; run \`${displayedProfileCommand(name, "bootstrap")}\`, wait a few seconds, then retry`);
        }
        startOrchestrator(name, profile);
        break;
      }
      case "stop-orchestrator": {
        const ready = await waitForHerdrReady(name, 8_000);
        if (!ready.ready) {
          const detail = ready.error ? `: ${ready.error}` : "";
          throw new CommandError(`Herdr session \`${name}\` is not operational${detail}; run \`${displayedProfileCommand(name, "bootstrap")}\`, wait a few seconds, then retry`);
        }
        stopOrchestrator(name, profile, Boolean(args.yes), args.plan ? String(args.plan) : null, Boolean(args.include_unmanaged));
        break;
      }
      case "dashboard": await dashboardCommand(args, name, profile); break;
      case "open": await openTarget(name, profile, args.target); break;
      case "project": if (args.project_command === "list") projectList(args, name); else if (args.project_command === "show") projectShow(args, name); else if (args.project_command === "resolve") projectResolve(args, name); else projectDoctor(args, name); break;
      case "usage": if (args.usage_command === "set") usageSet(args, name, profile); else if (args.usage_command === "show") usageShow(args, name, profile); else usageRecommend(args, name, profile); break;
      case "route": usageRecommend(args, name, profile); break;
      case "execution": if (args.execution_command === "dispatch") executionDispatch(args, name, profile); else if (args.execution_command === "inspect") executionInspect(args, name, profile); else executionReconcile(args, name, profile); break;
      case "relay": if (args.relay_command === "emit") relayEmit(args, name, profile); else if (args.relay_command === "recover") relayRecover(name, profile); else if (args.relay_command === "dispatch") relayDispatch(name, profile, Boolean(process.env.HERDR_PLUGIN_CONTEXT_JSON || process.env.HERDR_PLUGIN_EVENT_JSON)); else await relayDaemon(name, profile); break;
      case "inbox": if (args.inbox_command === "list") inboxList(args, name, profile); else if (args.inbox_command === "claim") inboxClaim(args, name, profile); else if (args.inbox_command === "show") inboxShow(args, name, profile); else if (args.inbox_command === "ack") inboxAck(args, name, profile); else if (args.inbox_command === "retry") inboxRetry(args, name, profile); else inboxDeadLetter(args, name, profile); break;
      case "delivery": if (args.delivery_command === "create") deliveryCreate(args, name, profile); else if (args.delivery_command === "list") deliveryList(args, name, profile); else if (args.delivery_command === "show") deliveryShow(args, name, profile); else if (args.delivery_command === "mark-rendered") deliveryRendered(args, name, profile); else if (args.delivery_command === "mark-delivered") deliveryDelivered(args, name, profile); else if (args.delivery_command === "fail") deliveryFail(args, name, profile); else deliveryRetry(args, name, profile); break;
    }
  } catch (error) {
    if (error instanceof ArgumentError) {
      const program = error.context ? `hanchou ${error.context}` : "hanchou";
      process.stderr.write(`${argumentUsage(error.context)}\n${program}: error: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`hanchou: ${message}\n`); process.exitCode = 2;
  }
}

function isDirectEntry(): boolean {
  const entry = process.argv[1];
  if (!entry || !existsSync(entry)) return false;
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

if (isDirectEntry()) await main();
