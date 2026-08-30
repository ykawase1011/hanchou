#!/usr/bin/env node

import { spawnSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { get as httpGet } from "node:http";
import { homedir, platform, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readToml } from "../lib/toml.ts";

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
const NUDGE_TEXT = "[HANCHOU_RELAY] Durable Inbox events are pending. Run `hanchou inbox claim --json`, read each full event, apply the durable action, then `hanchou inbox ack <event-id>`. Do not infer completion from this nudge alone.";

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
  let rendered = value.replace(/^~(?=$|\/)/, homedir());
  rendered = rendered.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, plain) => {
    return process.env[braced || plain] ?? match;
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
  if (new Set(["herdr", "node", "npm", "npx"]).has(name) && existsSync(MISE_CONFIG)) {
    const mise = which("mise");
    if (mise) {
      const proc = run([mise, "-C", ROOT, "which", name], { capture: true, check: false });
      if (proc.returncode === 0 && proc.stdout.trim()) return proc.stdout.trim();
    }
  }
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
  return [selected, loadToml(path)];
}

function profilePaths(profile: JsonObject): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile.state ?? {})) result[key] = expand(String(value));
  return result;
}

function miseTools(): Record<string, string> {
  if (!existsSync(MISE_CONFIG)) throw new CommandError(`mise config not found: ${MISE_CONFIG}`);
  const tools = loadToml(MISE_CONFIG).tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) throw new CommandError(`invalid [tools] table: ${MISE_CONFIG}`);
  return Object.fromEntries(Object.entries(tools).map(([key, value]) => [String(key), String(value)]));
}

function profileEnv(name: string, profile: JsonObject): NodeJS.ProcessEnv {
  const paths = profilePaths(profile);
  return {
    ...process.env,
    HANCHOU_PROFILE: name,
    HANCHOU_HOME: paths.root,
    HANCHOU_CONFIG_HOME: join(homedir(), ".config", "hanchou", name),
    HANCHOU_CONFIG_ROOT: CONFIG_ROOT,
    HANCHOU_REPO_ROOT: ROOT,
    HANCHOU_BEADS_DIR: paths.beads_dir,
    HANCHOU_RELAY_DIR: paths.relay_dir,
    BEADS_DIR: paths.beads_dir,
    BD_AGENT_PROFILE: profile.beads?.agent_profile ?? "conservative",
  };
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
  renameSync(temporary, path);
  try {
    const directoryFd = openSync(dirname(path), "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch { /* directory fsync is unavailable on some platforms */ }
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
  ]) mkdirSync(join(paths.relay_dir, part), { recursive: true });
  const configHome = join(homedir(), ".config", "hanchou", name);
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

function listJsonFiles(directory: string): Array<[string, JsonObject]> {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(directory, name))
    .sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs)
    .flatMap((path) => {
      try { return [[path, JSON.parse(readText(path))] as [string, JsonObject]]; }
      catch { return []; }
    });
}

function withLock<T>(lockPath: string, operation: () => T): T {
  mkdirSync(dirname(lockPath), { recursive: true });
  const marker = openSync(lockPath, "a", 0o600);
  closeSync(marker);
  const heldPath = `${lockPath}.held`;
  const token = `${process.pid}:${randomBytes(16).toString("hex")}`;
  let fd: number | null = null;
  const deadline = Date.now() + 120_000;
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
        const held = statSync(heldPath);
        let owner: JsonObject | null = null;
        try { owner = JSON.parse(readText(heldPath)); } catch { /* incomplete owner record */ }
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
      const owner = JSON.parse(readText(heldPath));
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
  run(argv, { env: profileEnv(name, profile) });
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
  console.log(`Hanchou apply plan: ${name}`);
  console.log(`  config root: ${CONFIG_ROOT}`);
  console.log(`  orchestrator: ${profile.orchestrator.kind} / ${profile.orchestrator.model || "provider-default"} / logical agent ${profile.orchestrator.agent_name}`);
  console.log(`  Herdr session: ${profile.herdr.session}`);
  console.log(`  state: ${paths.root}`);
  console.log(`  Beads: ${paths.beads_dir} (${profile.beads.mode})`);
  console.log(`  task UI: http://${profile.ui.beads_ui_host}:${profile.ui.beads_ui_port}`);
  console.log(`  install mise tools from ${MISE_CONFIG}: Herdr ${tools.herdr}, Node.js ${tools.node}`);
  console.log("  render canonical roles to .codex/agents and .claude/agents");
  console.log("  backup + replace generated user Agent definitions and ~/.config/herdr/config.toml");
  console.log("  install/update explicit public Skills plus optional machine-local overlays");
  console.log("  install Herdr Claude/Codex integrations");
  console.log(`  install pinned herdr-automations; herdr-beads enabled: ${profile.ui.herdr_beads_enabled ? "True" : "False"}`);
  console.log("  link this checkout as the Hanchou Herdr plugin");
  console.log(`  Relay state: ${paths.relay_dir} (Inbox + Delivery)`);
  console.log("  reporting defaults: root on_terminal, child parent_only, automation on_failure, daily digest always");
  console.log("  initialize central Beads store and provider integrations");
  console.log("  backup + render/install ~/Library/LaunchAgents entries for Herdr and beads-ui");
  console.log(`  model routing: ${routingPolicyPath(profile)}`);
  console.log(`  usage snapshot: ${usageSnapshotPath(profile)}`);
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
  const configHome = join(homedir(), ".config", "hanchou", name);
  const sourceConfigs: Array<[JsonObject, boolean]> = [[loadToml(join(configHome, "skills.toml")), false]];
  const localOverlay = profile.skills?.local_overlay_file;
  if (localOverlay) {
    const localPath = expand(localOverlay);
    if (existsSync(localPath)) sourceConfigs.push([loadToml(localPath), true]);
  }
  const cliVersion = loadToml(join(ROOT, "config", "versions.toml")).components.skills_cli.version;
  const cacheRoot = join(homedir(), ".cache", "hanchou", "skills");
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
    run(argv, { env, cwd: ROOT });
  }
}

function bootstrapProfile(name: string, profile: JsonObject): void {
  const mise = which("mise");
  if (!mise) throw new CommandError("required command not found: mise (install it with `brew install mise`)");
  for (const prerequisite of ["git", "gh", "bd", "codex", "claude"]) if (!which(prerequisite)) throw new CommandError(`required bootstrap prerequisite not found: ${prerequisite}`);
  run([mise, "-C", ROOT, "install"], { cwd: ROOT });
  applyProfile(name, profile, true, true);
}

function applyProfile(name: string, profile: JsonObject, yes: boolean, installUpstream: boolean): void {
  if (!yes) { printPlan(name, profile); throw new CommandError("apply requires --yes; use `hanchou plan <profile>` for preview"); }
  if (installUpstream) for (const prerequisite of ["mise", "git", "bd", "codex", "claude", "herdr", "node", "npm", "npx"]) commandPath(prerequisite);
  ensureState(name, profile);
  const env = profileEnv(name, profile);
  renderAgents();
  installAgentDefinitions();
  const herdrConfig = join(homedir(), ".config", "herdr", "config.toml");
  const changed = backupAndWrite(herdrConfig, renderHerdrConfig(name, profile));
  console.log(`Herdr config: ${changed ? "updated" : "current"} (${herdrConfig})`);
  const localBin = join(homedir(), ".local", "bin", "hanchou");
  mkdirSync(dirname(localBin), { recursive: true });
  if (lexists(localBin)) unlinkSync(localBin);
  symlinkSync(join(ROOT, "bin", "hanchou"), localBin);
  console.log(`linked ${localBin} -> ${join(ROOT, "bin", "hanchou")}`);
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
  } else console.log("upstream install skipped; run `hanchou bootstrap` or add --install-upstream to install integrations, plugins, Beads UI, skills, and LaunchAgents");
  if (changed && which("herdr")) run(herdrArgv(name, "server", "reload-config"), { env, check: false, capture: true });
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

function nudgeAgent(profileName: string, agent: string): [boolean, string | null] {
  const status = getAgentStatus(profileName, agent);
  if (!new Set(["idle", "done"]).has(status ?? "")) return [false, status];
  try { run(herdrArgv(profileName, "agent", "prompt", agent, NUDGE_TEXT), { capture: true }); return [true, status]; }
  catch { return [false, status]; }
}

function relayRoot(profile: JsonObject): string { return profilePaths(profile).relay_dir; }
function inboxRoot(profile: JsonObject): string { return join(relayRoot(profile), "inbox"); }
function deliveriesRoot(profile: JsonObject): string { return join(relayRoot(profile), "deliveries"); }
function eventPath(root: string, state: string, eventId: string): string { return join(root, "inbox", state, `${eventId}.json`); }
function deliveryPath(root: string, state: string, deliveryId: string): string { return join(root, "deliveries", state, `${deliveryId}.json`); }

function journal(root: string, record: JsonObject): void {
  const lock = join(root, "locks", "journal.lock");
  withLock(lock, () => {
    const path = join(root, "journal.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${pyCompact(sortedJson(record))}\n`, { encoding: "utf8", mode: 0o600 });
    const fd = openSync(path, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  });
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
  const eventId = args.event_id || `evt_${randomUUID().replaceAll("-", "")}`;
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
  const path = eventPath(root, "pending", eventId);
  if (["pending", "processing", "acknowledged", "dead-letter"].some((state) => existsSync(eventPath(root, state, eventId)))) throw new CommandError(`event already exists: ${eventId}`);
  atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
  journal(root, { at: utcnow(), action: "enqueued", event_id: eventId, to_agent: args.to_agent });
  let nudged = false;
  let status: string | null = null;
  if (!args.no_nudge) {
    [nudged, status] = nudgeAgent(name, args.to_agent);
    if (nudged) journal(root, { at: utcnow(), action: "nudged", event_id: eventId, to_agent: args.to_agent });
  }
  const result = { ok: true, event_id: eventId, path, nudged, target_status: status };
  if (args.json) jsonPrint(result); else console.log(`queued ${eventId} (nudged=${String(nudged).replace(/^./, (char) => char.toUpperCase())}, status=${status === null ? "None" : status})`);
}

function iterEvents(root: string, state: string): Array<[string, JsonObject]> { return listJsonFiles(join(root, "inbox", state)); }
function iterDeliveries(root: string, state: string): Array<[string, JsonObject]> { return listJsonFiles(join(root, "deliveries", state)); }

function inboxList(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
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
  const target = args.to || profile.orchestrator.agent_name;
  const limit = args.limit || profile.relay?.max_batch || 20;
  const claimed: JsonObject[] = withLock(join(root, "locks", `claim-${target}.lock`), () => {
    const records: JsonObject[] = [];
    for (const [path, event] of iterEvents(root, "pending")) {
      if (records.length >= limit) break;
      if (event.to_agent !== target) continue;
      event.lease = { claimed_by: target, claimed_at: utcnow(), expires_at_epoch: Math.floor(Date.now() / 1000) + Number(profile.relay?.lease_seconds ?? 900) };
      const destination = eventPath(root, "processing", event.event_id);
      atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
      renameSync(path, destination);
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
  for (const state of states) {
    const path = eventPath(root, state, eventId);
    if (existsSync(path)) return [state, path, JSON.parse(readText(path))];
  }
  throw new CommandError(`event not found: ${eventId}`);
}

function inboxAck(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [state, path, event] = locateEvent(root, args.event_id, ["processing", "pending", "acknowledged"]);
  let result: JsonObject;
  if (state === "acknowledged") result = { ok: true, event_id: args.event_id, already: true };
  else {
    event.ack = { at: utcnow(), by: args.by || event.to_agent, note: args.note };
    delete event.lease;
    const destination = eventPath(root, "acknowledged", args.event_id);
    atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
    renameSync(path, destination);
    atomicWrite(join(root, "receipts", `inbox-${args.event_id}.json`), `${JSON.stringify({ schema: "hanchou.relay-receipt.v1", event_id: args.event_id, ...event.ack }, null, 2)}\n`);
    journal(root, { at: utcnow(), action: "acknowledged", event_id: args.event_id, by: event.ack.by });
    result = { ok: true, event_id: args.event_id, already: false, path: destination };
  }
  if (args.json) jsonPrint(result); else console.log(`acknowledged ${args.event_id}`);
}

function inboxRetry(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [state, path, event] = locateEvent(root, args.event_id, ["processing", "dead-letter"]);
  delete event.lease; event.retry_count = Number(event.retry_count ?? 0) + 1;
  const destination = eventPath(root, "pending", args.event_id);
  atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`); renameSync(path, destination);
  journal(root, { at: utcnow(), action: "retried", event_id: args.event_id, from_state: state });
  console.log(`retried ${args.event_id}`);
}

function inboxDeadLetter(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [, path, event] = locateEvent(root, args.event_id, ["processing", "pending"]);
  delete event.lease; event.dead_letter = { at: utcnow(), reason: args.reason };
  const destination = eventPath(root, "dead-letter", args.event_id);
  atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`); renameSync(path, destination);
  journal(root, { at: utcnow(), action: "dead-lettered", event_id: args.event_id, reason: args.reason });
  console.log(`dead-lettered ${args.event_id}`);
}

function inboxShow(args: JsonObject, _name: string, profile: JsonObject): void {
  const [state, path, event] = locateEvent(relayRoot(profile), args.event_id, ["pending", "processing", "acknowledged", "dead-letter"]);
  jsonPrint({ state, path, event }, true);
}

function relayRecover(name: string, profile: JsonObject, quiet = false): number {
  const root = relayRoot(profile);
  let recovered = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const [path, event] of iterEvents(root, "processing")) {
    const expires = Number(event.lease?.expires_at_epoch ?? 0);
    if (expires && expires > now) continue;
    delete event.lease; event.recovery_count = Number(event.recovery_count ?? 0) + 1;
    const destination = eventPath(root, "pending", event.event_id);
    atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`); renameSync(path, destination);
    journal(root, { at: utcnow(), action: "lease-recovered", event_id: event.event_id }); recovered += 1;
  }
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
  for (const state of states) {
    const path = deliveryPath(root, state, deliveryId);
    if (existsSync(path)) return [state, path, JSON.parse(readText(path))];
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
  const deliveryId = args.delivery_id || `dly_${randomUUID().replaceAll("-", "")}`;
  const record = {
    schema: "hanchou.delivery.v1", delivery_id: deliveryId, kind: args.kind, task_id: args.task,
    source_event_id: args.source_event, created_at: utcnow(), policy: args.policy, renderer: args.renderer,
    destination, summary: args.summary, body_ref: args.body_ref, dedupe_key: args.dedupe_key,
    coalesce_key: args.coalesce_key, not_before: args.not_before, status: "pending", attempts: 0,
  };
  const path = deliveryPath(root, "pending", deliveryId);
  if (["pending", "rendered", "delivered", "failed"].some((state) => existsSync(deliveryPath(root, state, deliveryId)))) throw new CommandError(`delivery already exists: ${deliveryId}`);
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`);
  journal(root, { at: utcnow(), action: "delivery-created", delivery_id: deliveryId, task_id: args.task });
  const result = { ok: true, delivery_id: deliveryId, path };
  if (args.json) jsonPrint(result); else console.log(`created ${deliveryId}`);
}

function deliveryList(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const states = args.state ? [args.state] : ["pending", "rendered", "delivered", "failed"];
  const rows: JsonObject[] = [];
  for (const state of states) for (const [path, record] of iterDeliveries(root, state)) {
    if (args.task && record.task_id !== args.task) continue;
    rows.push({ state, delivery_id: record.delivery_id, kind: record.kind, task_id: record.task_id, policy: record.policy, renderer: record.renderer, destination: record.destination, summary: record.summary, created_at: record.created_at, path });
  }
  if (args.json) jsonPrint(rows, true);
  else {
    if (!rows.length) console.log("delivery queue empty");
    for (const row of rows) console.log(`${String(row.state).padEnd(10)} ${row.delivery_id} ${String(row.kind).padEnd(16)} ${row.task_id || "-"} -> ${row.destination?.type ?? "?"}  ${row.summary}`);
  }
}

function deliveryShow(args: JsonObject, _name: string, profile: JsonObject): void {
  const [state, path, delivery] = locateDelivery(relayRoot(profile), args.delivery_id, ["pending", "rendered", "delivered", "failed"]);
  jsonPrint({ state, path, delivery }, true);
}

function deliveryRendered(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [state, path, record] = locateDelivery(root, args.delivery_id, ["pending", "rendered"]);
  if (state === "rendered") { console.log(`already rendered ${args.delivery_id}`); return; }
  if (args.message && args.message_file) throw new CommandError("use only one of --message or --message-file");
  const message = args.message_file ? readText(args.message_file) : args.message;
  record.rendered = { at: utcnow(), by: args.by, message };
  record.status = "rendered";
  const destination = deliveryPath(root, "rendered", args.delivery_id);
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); renameSync(path, destination);
  journal(root, { at: utcnow(), action: "delivery-rendered", delivery_id: args.delivery_id, by: args.by });
  console.log(`rendered ${args.delivery_id}`);
}

function deliveryDelivered(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [state, path, record] = locateDelivery(root, args.delivery_id, ["pending", "rendered", "delivered"]);
  if (state === "delivered") { console.log(`already delivered ${args.delivery_id}`); return; }
  record.delivered = { at: utcnow(), adapter: args.adapter, external_id: args.external_id, note: args.note };
  record.status = "delivered";
  const destination = deliveryPath(root, "delivered", args.delivery_id);
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); renameSync(path, destination);
  atomicWrite(join(root, "receipts", `delivery-${args.delivery_id}.json`), `${JSON.stringify({ schema: "hanchou.delivery-receipt.v1", delivery_id: args.delivery_id, ...record.delivered }, null, 2)}\n`);
  journal(root, { at: utcnow(), action: "delivery-delivered", delivery_id: args.delivery_id, adapter: args.adapter });
  console.log(`delivered ${args.delivery_id}`);
}

function deliveryFail(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [, path, record] = locateDelivery(root, args.delivery_id, ["pending", "rendered"]);
  record.failure = { at: utcnow(), reason: args.reason }; record.attempts = Number(record.attempts ?? 0) + 1; record.status = "failed";
  const destination = deliveryPath(root, "failed", args.delivery_id);
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); renameSync(path, destination);
  journal(root, { at: utcnow(), action: "delivery-failed", delivery_id: args.delivery_id, reason: args.reason });
  console.log(`failed ${args.delivery_id}`);
}

function deliveryRetry(args: JsonObject, _name: string, profile: JsonObject): void {
  const root = relayRoot(profile);
  const [, path, record] = locateDelivery(root, args.delivery_id, ["failed"]);
  delete record.failure; record.status = "pending";
  const destination = deliveryPath(root, "pending", args.delivery_id);
  atomicWrite(path, `${JSON.stringify(record, null, 2)}\n`); renameSync(path, destination);
  journal(root, { at: utcnow(), action: "delivery-retried", delivery_id: args.delivery_id });
  console.log(`retried ${args.delivery_id}`);
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

function validateRepo(repoValue: string): string {
  const repo = expand(repoValue);
  if (!isDirectory(repo)) throw new CommandError(`repository directory not found: ${repo}`);
  const top = realpathSync(run([commandPath("git"), "-C", repo, "rev-parse", "--show-toplevel"], { capture: true }).stdout.trim());
  if (top !== realpathSync(repo)) throw new CommandError(`repo_path must be the Git top level: ${repo} (top level is ${top})`);
  run([commandPath("git"), "-C", repo, "rev-parse", "--verify", "HEAD"], { capture: true });
  if (run([commandPath("git"), "-C", repo, "status", "--porcelain"], { capture: true }).stdout.trim()) throw new CommandError(`repository must be clean before dispatch: ${repo}`);
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
    paneId?: string | null; providerSessionId?: string | null;
  },
): JsonObject {
  const result = clone(metadata);
  result.execution_id = parameters.executionId;
  result.routing = taskRoutingMetadata(parameters.route, profile);
  result.herdr = {
    session: parameters.session, agent_name: parameters.agentName, kind: parameters.kind,
    workspace_id: parameters.workspaceId ?? null, pane_id: parameters.paneId ?? null,
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

function createExecutionWorktree(name: string, profile: JsonObject, repo: string, baseCommit: string, branch: string, worktreePath: string, label: string): [string, string] {
  const proc = run(herdrArgv(name, "worktree", "create", "--cwd", repo, "--base", baseCommit, "--branch", branch, "--path", worktreePath, "--label", label, "--no-focus"), { env: profileEnv(name, profile), capture: true, timeout: 120_000 });
  const value = parseJsonOutput(proc);
  const workspaceId = nestedValue(value, "workspace_id");
  const paneId = nestedValue(value, "pane_id");
  if (typeof workspaceId !== "string" || typeof paneId !== "string") throw new CommandError(`cannot read workspace/pane IDs from Herdr worktree response: ${pyCompact(value)}`);
  return [workspaceId, paneId];
}

function safeAgentName(taskId: string, executionId: string, role: string): string {
  const digest = createHash("sha256").update(`${taskId}:${executionId}`).digest("hex").slice(0, 10);
  const rolePart = role.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 15).replace(/^[-_]+|[-_]+$/g, "") || "worker";
  return `hch_${digest}_${rolePart}`.slice(0, 32);
}

export function workerAgentArgv(name: string, profile: JsonObject, agentName: string, paneId: string, route: JsonObject, role: string, reportPath: string): string[] {
  const kind = route.provider;
  const argv = herdrArgv(name, "agent", "start", agentName, "--kind", kind, "--pane", paneId, "--timeout", "120000", "--");
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
  const sessionDirectory = join(homedir(), ".config", "herdr", "sessions", name);
  const unixSocketRule = `network.unix_sockets={${JSON.stringify(sessionDirectory)}="allow"}`;
  return [...argv, "-m", route.model, "--sandbox", "workspace-write", "--approve-for-me", "--add-dir", dirname(reportPath), "--add-dir", paths.relay_dir, "--add-dir", sessionDirectory, "-c", "network.enabled=true", "-c", unixSocketRule];
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
    const head = run([commandPath("git"), "-C", worktreePath, "rev-parse", "--verify", "HEAD^{commit}"], { capture: true }).stdout.trim();
    const reported = run([commandPath("git"), "-C", worktreePath, "rev-parse", "--verify", `${commitRef}^{commit}`], { capture: true }).stdout.trim();
    if (reported !== head) anomalies.push(`${prefix} commit artifact does not match worktree HEAD`);
  } catch (error) { anomalies.push(`${prefix} commit artifact cannot be verified: ${error instanceof Error ? error.message : error}`); }
  return anomalies;
}

function executionDeliveries(profile: JsonObject, taskId: string): JsonObject[] {
  const root = relayRoot(profile); const rows: JsonObject[] = [];
  for (const state of ["pending", "rendered", "delivered", "failed"]) for (const [path, delivery] of iterDeliveries(root, state)) if (delivery.task_id === taskId) rows.push({ state, path, delivery });
  return rows;
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
    const repo = validateRepo(String(metadata.repo_path));
    const baseCommit = run([commandPath("git"), "-C", repo, "rev-parse", "--verify", "HEAD^{commit}"], { capture: true }).stdout.trim();
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
      role, owner_role: metadata.owner_role, owner_agent: metadata.owner_agent, task_identity: taskIdentity,
      route: taskRoutingMetadata(route, profile), herdr_session: name, agent_name: agentName, kind,
      workspace_id: null, pane_id: null, provider_session_id: null,
    };
    saveExecution(profile, record);
    let claimed = false;
    let taskMetadata = executionTaskMetadata(metadata, profile, { executionId, route, session: name, agentName, kind, bindingState: "pending", branch, worktreePath });
    let agent: JsonObject = {};
    let path = executionPath(profile, taskId);
    try {
      taskMetadata = patchExecutionMetadata(name, profile, taskId, executionId, taskMetadata, taskIdentity, true);
      claimed = true; record.phase = "claimed"; saveExecution(profile, record);
      const [workspaceId, paneId] = createExecutionWorktree(name, profile, repo, baseCommit, branch, worktreePath, `${taskId} ${role}`);
      Object.assign(record, { phase: "workspace_created", workspace_id: workspaceId, pane_id: paneId }); saveExecution(profile, record);
      const started = run(workerAgentArgv(name, profile, agentName, paneId, route, role, reportPath), { env: profileEnv(name, profile), check: false, capture: true, timeout: 140_000 });
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
        workspaceId, paneId, providerSessionId: record.provider_session_id,
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
          workspaceId: record.workspace_id, paneId: record.pane_id, providerSessionId: record.provider_session_id,
        });
        try { patchExecutionMetadata(name, profile, taskId, executionId, failedMetadata, taskIdentity, false, "blocked"); }
        catch (updateError) { record.bead_update_error = updateError instanceof Error ? updateError.message : String(updateError); saveExecution(profile, record); }
      }
      throw new CommandError(`execution dispatch failed after ${failedPhase}: ${message}`);
    }
    const result = {
      ok: true, task_id: taskId, execution_id: executionId, phase: record.phase, agent_name: agentName,
      workspace_id: record.workspace_id, pane_id: record.pane_id, worktree_path: worktreePath, branch,
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
        herdr.binding_state = "live";
        herdr.workspace_id = record.workspace_id || herdr.workspace_id;
        herdr.pane_id = record.pane_id || herdr.pane_id;
        herdr.provider_session_id = providerSessionId(agent) || record.provider_session_id;
        metadata.herdr = herdr;
        metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity, false, bead.status !== "in_progress" ? "in_progress" : null);
        herdr = metadata.herdr; record.phase = "agent_started"; delete record.start_error; saveExecution(profile, record);
        try {
          promptWorkerAgent(name, profile, bead, metadata, record, agent);
          actions.push("awaiting-ready-prompted"); binding = "live";
          agent = getAgentInfo(name, agentName, true); status = agent ? findAgentStatus(agent) : null;
        } catch (error) {
          record.phase = "attention_required"; record.failed_phase = "prompting"; record.error = error instanceof Error ? error.message : String(error); saveExecution(profile, record);
          metadata = patchExecutionMetadata(name, profile, taskId, expectedExecutionId, metadata, expectedIdentity, false, "blocked");
          herdr = metadata.herdr; actions.push("awaiting-ready-prompt-failed"); anomalies.push("worker became ready but the redacted task prompt failed");
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

function startOrchestrator(name: string, profile: JsonObject): void {
  ensureState(name, profile);
  const agentName = profile.orchestrator.agent_name;
  const beadsDirectory = profilePaths(profile).beads_dir;
  const initial = `Initialize as the Hanchou L0 Orchestrator for profile \`${name}\`. Read AGENTS.md, roles/orchestrator/ROLE.md, docs/SESSION_HANDOFF.md, docs/RELAY.md, and docs/REPORTING.md. The authoritative Beads store is \`BEADS_DIR=${beadsDirectory}\`. Use that absolute path for every \`bd\` command if BEADS_DIR is not already inherited; never fall back to a project-local Beads store. Run \`hanchou status ${name}\` and inspect only the control-plane state. If the Codex workspace sandbox denies that bounded command, retry the exact command through normal approval/escalation without using a bypass. Do not research or modify project repositories in this session. Reply with readiness and any blocking setup issue.`;
  const initialize = (record: JsonObject): void => {
    const identity = String(record.terminal_id || record.pane_id || "unknown");
    const marker = join(profilePaths(profile).control_dir, ".hanchou-orchestrator-init.json");
    if (existsSync(marker)) {
      try { if (JSON.parse(readText(marker)).identity === identity) { console.log(`orchestrator already exists: ${agentName}`); return; } }
      catch { /* initialize again */ }
    }
    const statusValue = record.agent_status;
    if (!new Set(["idle", "done"]).has(statusValue)) { console.log(`orchestrator \`${agentName}\` exists with status ${statusValue}; initialization remains pending`); return; }
    const promptArgv = herdrArgv(name, "agent", "prompt", agentName, initial);
    run(promptArgv, { capture: true, displayArgv: promptArgv.map((value) => value === initial ? "<redacted-prompt>" : value), redactOutput: true });
    atomicWrite(marker, `${JSON.stringify({ identity, initialized_at: utcnow() })}\n`);
    console.log(`initialized orchestrator \`${agentName}\``);
  };
  const existing = getAgentInfo(name, agentName);
  if (existing) { initialize(existing); return; }
  const created = run(herdrArgv(name, "workspace", "create", "--cwd", ROOT, "--label", profile.orchestrator.workspace_label, "--no-focus"), { capture: true });
  const data = parseJsonOutput(created);
  const paneId = data?.result?.root_pane?.pane_id;
  if (typeof paneId !== "string") throw new CommandError(`cannot read root pane ID from Herdr response: ${pyCompact(data)}`);
  const kind = profile.orchestrator.kind ?? "codex";
  const argv = herdrArgv(name, "agent", "start", agentName, "--kind", kind, "--pane", paneId, "--timeout", "120000");
  const model = profile.orchestrator.model;
  if (model) argv.push("--", kind === "claude" ? "--model" : "-m", model);
  if (kind === "codex") {
    if (!argv.includes("--")) argv.push("--");
    const paths = profilePaths(profile);
    const sessionDirectory = join(homedir(), ".config", "herdr", "sessions", name);
    const unixSocketRule = `network.unix_sockets={${JSON.stringify(sessionDirectory)}="allow"}`;
    argv.push("--approve-for-me", "--add-dir", paths.root, "--add-dir", sessionDirectory, "--add-dir", join(homedir(), ".config", "herdr", "plugins", "config"), "-c", "network.enabled=true", "-c", unixSocketRule);
  }
  const started = run(argv, { check: false, capture: true });
  if (started.returncode !== 0) {
    if (getAgentStatus(name, agentName) === "blocked") { console.log(`orchestrator \`${agentName}\` is awaiting first-run trust/hook review; attach with \`herdr --session ${name} agent attach ${agentName}\``); return; }
    throw new CommandError(`cannot start orchestrator: ${(started.stderr || started.stdout).trim()}`);
  }
  const record = getAgentInfo(name, agentName);
  if (!record) throw new CommandError(`orchestrator started but Herdr did not register \`${agentName}\``);
  initialize(record);
  console.log(`started ${kind} orchestrator \`${agentName}\` in pane ${paneId}`);
}

function openTarget(name: string, profile: JsonObject, target: string): never | void {
  if (target === "tasks") {
    const url = `http://${profile.ui.beads_ui_host}:${profile.ui.beads_ui_port}`;
    console.log(url);
    const opener = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
    const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
    try { const child = spawn(opener, args, { detached: true, stdio: "ignore" }); child.unref(); } catch { /* URL was printed */ }
    return;
  }
  if (target === "herdr" || target === "orchestrator") {
    const argv = target === "herdr" ? herdrArgv(name) : herdrArgv(name, "agent", "attach", profile.orchestrator.agent_name);
    const result = run(argv, { check: false }); process.exit(result.returncode);
  }
  if (target === "automations") { run(herdrArgv(name, "plugin", "pane", "open", "--plugin", "dnzzl.automations", "--entrypoint", "board", "--placement", "overlay")); return; }
  throw new CommandError(`unknown open target: ${target}`);
}

function statusCommand(name: string, profile: JsonObject, asJson: boolean): void {
  const paths = profilePaths(profile);
  const agent = profile.orchestrator.agent_name;
  const result = {
    profile: name, config_root: CONFIG_ROOT, herdr_session: profile.herdr.session,
    orchestrator: { name: agent, kind: profile.orchestrator.kind ?? "codex", model: profile.orchestrator.model ?? null, status: getAgentStatus(name, agent, true) },
    beads_dir: paths.beads_dir, relay_dir: paths.relay_dir,
    pending_inbox: existsSync(paths.relay_dir) ? iterEvents(paths.relay_dir, "pending").length : 0,
    pending_deliveries: existsSync(paths.relay_dir) ? iterDeliveries(paths.relay_dir, "pending").length : 0,
    task_ui: `http://${profile.ui.beads_ui_host}:${profile.ui.beads_ui_port}`,
    usage_snapshot: usageSnapshotPath(profile),
    commands: { herdr: `herdr --session ${name}`, orchestrator: `herdr --session ${name} agent attach ${agent}`, tasks: `hanchou open tasks ${name}`, automations: `hanchou open automations ${name}` },
  };
  if (asJson) jsonPrint(result, true);
  else {
    console.log(`profile:       ${name}`); console.log(`config root:   ${CONFIG_ROOT}`);
    console.log(`orchestrator:  ${result.orchestrator.kind} / ${result.orchestrator.model || "provider-default"} / ${agent} / ${result.orchestrator.status || "not-running"}`);
    console.log(`Herdr:        herdr --session ${name}`); console.log(`Task UI:      ${result.task_ui}`); console.log(`Beads:        ${paths.beads_dir}`); console.log(`Relay:        ${paths.relay_dir}`);
    console.log(`Inbox pending: ${result.pending_inbox}`); console.log(`Delivery pending: ${result.pending_deliveries}`); console.log(`Usage:        ${result.usage_snapshot}`);
  }
}

function endpointOk(url: string, timeout: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (value: boolean): void => { if (!settled) { settled = true; resolvePromise(value); } };
    const request = httpGet(url, (response) => { response.resume(); finish(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 400)); });
    request.setTimeout(timeout, () => { request.destroy(); finish(false); });
    request.on("error", () => finish(false));
  });
}

async function doctor(name: string, profile: JsonObject): Promise<number> {
  const env = profileEnv(name, profile);
  let failures = 0;
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
  try {
    const proc = run(herdrArgv(name, "status"), { env, cwd: ROOT, check: false, capture: true, timeout: 15_000 });
    const output = `${proc.stdout}\n${proc.stderr}`; const ok = proc.returncode === 0 && output.includes("status: running") && output.includes(`version: ${requiredTools.herdr}`);
    console.log(`${ok ? "ok  " : "FAIL"} Herdr server/session`); if (!ok) failures += 1;
  } catch (error) { console.log(`FAIL Herdr server/session: ${error instanceof Error ? error.message : error}`); failures += 1; }
  try {
    const proc = run([commandPath("bd"), "ready", "--json"], { env, cwd: profilePaths(profile).control_dir, check: false, capture: true, timeout: 15_000 });
    const ok = proc.returncode === 0; console.log(`${ok ? "ok  " : "FAIL"} Beads ready access`); if (!ok) failures += 1;
  } catch (error) { console.log(`FAIL Beads ready access: ${error instanceof Error ? error.message : error}`); failures += 1; }
  const taskUiUrl = `http://${profile.ui.beads_ui_host}:${profile.ui.beads_ui_port}/`;
  const uiOk = await endpointOk(taskUiUrl, 5_000); console.log(`${uiOk ? "ok  " : "FAIL"} beads-ui endpoint: ${taskUiUrl}`); if (!uiOk) failures += 1;
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
      const proc = run([commandPath("npx"), "-y", `skills@${cliVersion}`, "list", ...scopeArgs, "--json"], { env, cwd: ROOT, check: false, capture: true, timeout: 30_000 });
      if (proc.returncode === 0) { const value = JSON.parse(proc.stdout || "[]"); if (Array.isArray(value)) entries.push(...value.filter((item) => item && typeof item === "object")); }
    }
    const expectedSkills = new Set(readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(ROOT, "skills", entry.name, "SKILL.md"))).map((entry) => entry.name));
    const installed = new Set(entries.filter((item) => Array.isArray(item.agents) && item.agents.some((agent: string) => new Set(["Codex", "Claude Code"]).has(agent))).map((item) => item.name));
    const missing = [...expectedSkills].filter((skill) => !installed.has(skill)).sort(); const ok = !missing.length;
    console.log(`${ok ? "ok  " : "FAIL"} Hanchou Skills${ok ? "" : `: missing ${missing.join(", ")}`}`); if (!ok) failures += 1;
  } catch (error) { console.log(`FAIL Hanchou Skills: ${error instanceof Error ? error.message : error}`); failures += 1; }
  try { renderAgents(true); console.log("ok   generated agent definitions"); }
  catch (error) { console.log(`FAIL generated agent definitions: ${error instanceof Error ? error.message : error}`); failures += 1; }
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
               {plan,bootstrap,apply,status,doctor,start-orchestrator,open,render-agents,handoff,usage,route,execution,relay,inbox,delivery} ...

Herdr-first Hanchou control utility

positional arguments:
  {plan,bootstrap,apply,status,doctor,start-orchestrator,open,render-agents,handoff,usage,route,execution,relay,inbox,delivery}

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
  plan: profileHelp("plan"),
  bootstrap: profileHelp("bootstrap"),
  doctor: profileHelp("doctor"),
  "start-orchestrator": profileHelp("start-orchestrator"),
  apply: `usage: hanchou apply [-h] [--yes] [--install-upstream] [{personal,work}]

positional arguments:
  {personal,work}

options:
  -h, --help          show this help message and exit
  --yes
  --install-upstream`,
  status: `usage: hanchou status [-h] [--json] [{personal,work}]

positional arguments:
  {personal,work}

options:
  -h, --help       show this help message and exit
  --json`,
  open: `usage: hanchou open [-h]
                    {tasks,herdr,orchestrator,automations} [{personal,work}]

positional arguments:
  {tasks,herdr,orchestrator,automations}
  {personal,work}

options:
  -h, --help            show this help message and exit`,
  "render-agents": `usage: hanchou render-agents [-h] [--check]

options:
  -h, --help  show this help message and exit
  --check`,
  handoff: noArgumentHelp("handoff"),
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
  const nested = new Set(["usage", "route", "execution", "relay", "inbox", "delivery"]);
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
  if (result.command === "apply") return profileCommand([["yes", "boolean"], ["install-upstream", "boolean"]]);
  if (result.command === "status") return profileCommand([["json", "boolean"]]);
  if (result.command === "open") {
    const parsed = parseOptionTokens(rest, {}); const rows = positionals(parsed, 1, 2); parsed.target = rows[0]; parsed.profile_name = rows[1] ?? null;
    choice(parsed.target, new Set(["tasks", "herdr", "orchestrator", "automations"]), "target");
    if (parsed.profile_name !== null) choice(parsed.profile_name, new Set(["personal", "work"]), "profile_name");
    return { ...result, ...parsed };
  }
  if (result.command === "render-agents") { const parsed = parseOptionTokens(rest, definitions([["check", "boolean"]])); positionals(parsed, 0); return { ...result, ...parsed }; }
  if (result.command === "handoff") { const parsed = parseOptionTokens(rest, {}); positionals(parsed, 0); return { ...result, ...parsed }; }
  if (new Set(["usage", "route", "execution", "relay", "inbox", "delivery"]).has(result.command)) {
    if (!rest.length) throw new CommandError(`the following arguments are required: ${result.command}_command`);
    const subcommand = rest[0]; const tokens = rest.slice(1); result[`${result.command}_command`] = subcommand;
    const routing = (): JsonObject => {
      const parsed = parseOptionTokens(tokens, definitions([["role", "string"], ["task-kind", "string"], ["japanese", "boolean"], ["json", "boolean"]]));
      positionals(parsed, 0); requireOptions(parsed, ["role"]); parsed.task_kind ??= "general"; choice(parsed.role, new Set(["orchestrator", "mission-lead", "researcher", "implementer", "writer", "editor", "reviewer"]), "--role"); return { ...result, ...parsed };
    };
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
  usage: ["set", "show", "recommend"], route: ["resolve"], execution: ["dispatch", "inspect", "reconcile"],
  relay: ["emit", "recover", "dispatch", "daemon"], inbox: ["list", "claim", "show", "ack", "retry", "dead-letter"],
  delivery: ["create", "list", "show", "mark-rendered", "mark-delivered", "fail", "retry"],
};
const TOP_LEVEL_COMMANDS = ["plan", "bootstrap", "apply", "status", "doctor", "start-orchestrator", "open", "render-agents", "handoff", "usage", "route", "execution", "relay", "inbox", "delivery"];
const REQUIRED_FLAGS: Record<string, string[]> = {
  "usage set": ["weekly-remaining"], "usage recommend": ["role"], "route resolve": ["role"],
  "relay emit": ["type", "from-agent", "from-role", "to-agent", "to-role", "summary"],
  "inbox dead-letter": ["reason"],
  "delivery create": ["kind", "policy", "renderer", "destination", "summary"],
  "delivery mark-rendered": ["by"], "delivery mark-delivered": ["adapter"], "delivery fail": ["reason"],
};
const REQUIRED_POSITIONALS: Record<string, string> = {
  open: "target", "usage set": "provider", "execution dispatch": "task_id", "execution inspect": "task_id",
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
               {plan,bootstrap,apply,status,doctor,start-orchestrator,open,render-agents,handoff,usage,route,execution,relay,inbox,delivery} ...`;
  return (HELP_SURFACES[context] ?? HELP_SURFACES[context.split(" ")[0]]).split("\n\n")[0];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.some((token) => token === `--${flag}` || token.startsWith(`--${flag}=`));
}

function normalizeArgumentMessage(argv: string[], context: string, raw: string): string {
  if (!context && raw.startsWith("invalid choice:")) return `argument command: ${raw} (choose from '${TOP_LEVEL_COMMANDS.join("', '")}')`;
  const unknownSubcommand = raw.match(/^unknown (usage|route|execution|relay|inbox|delivery) command: (.+)$/);
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
    if (args.command === "render-agents") { renderAgents(Boolean(args.check)); return; }
    if (args.command === "handoff") { console.log(readText(join(ROOT, "docs", "SESSION_HANDOFF.md"))); return; }
    const [name, profile] = loadProfile(args.profile_name || args.profile);
    for (const [key, value] of Object.entries(profileEnv(name, profile))) if ((key.startsWith("HANCHOU_") || new Set(["BEADS_DIR", "BD_AGENT_PROFILE"]).has(key)) && value !== undefined) process.env[key] = value;
    switch (args.command) {
      case "plan": printPlan(name, profile); break;
      case "bootstrap": bootstrapProfile(name, profile); break;
      case "apply": applyProfile(name, profile, Boolean(args.yes), Boolean(args.install_upstream)); break;
      case "status": statusCommand(name, profile, Boolean(args.json)); break;
      case "doctor": process.exitCode = await doctor(name, profile); break;
      case "start-orchestrator": startOrchestrator(name, profile); break;
      case "open": openTarget(name, profile, args.target); break;
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
