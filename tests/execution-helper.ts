import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CommandError, loadProfile, workerAgentArgv } from "../libexec/hanchou.ts";

type JsonObject = Record<string, any>;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing test environment: ${name}`);
  }
  return value;
}

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value), "utf8");
}

function stdinJson(): JsonObject {
  return JSON.parse(readFileSync(0, "utf8")) as JsonObject;
}

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  assert.notEqual(index, -1, `missing option ${name}`);
  const value = args[index + 1];
  assert.notEqual(value, undefined, `missing value for ${name}`);
  return value as string;
}

function assertKnownOptions(
  args: readonly string[],
  start: number,
  valueOptions: readonly string[],
  booleanOptions: readonly string[] = [],
): void {
  const values = new Set(valueOptions);
  const booleans = new Set(booleanOptions);
  for (let index = start; index < args.length; index += 1) {
    const value = args[index] as string;
    if (value === "--") return;
    if (values.has(value)) {
      assert.notEqual(args[index + 1], undefined, `missing value for ${value}`);
      index += 1;
      continue;
    }
    if (booleans.has(value)) continue;
    throw new Error(`unsupported fake Herdr option: ${value}`);
  }
}

function environmentOptions(args: readonly string[]): JsonObject {
  const result: JsonObject = {};
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] !== "--env") continue;
    const assignment = args[index + 1] as string;
    const separator = assignment.indexOf("=");
    assert.ok(separator > 0, `invalid environment assignment: ${assignment}`);
    result[assignment.slice(0, separator)] = assignment.slice(separator + 1);
  }
  return result;
}

function codexConfigRaw(args: readonly string[], key: string): string {
  const prefix = `${key}=`;
  const matches: string[] = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] !== "-c") continue;
    const value = args[index + 1] as string;
    if (value.startsWith(prefix)) matches.push(value.slice(prefix.length));
  }
  assert.equal(matches.length, 1, `expected one Codex config override ${key}`);
  return matches[0] as string;
}

function codexConfig(args: readonly string[], key: string): any {
  return JSON.parse(codexConfigRaw(args, key));
}

function assertManagedNetwork(args: readonly string[], rawHome: string): void {
  const socketPath = join(rawHome, ".config/herdr/sessions/work/herdr.sock");
  assert.equal(codexConfig(args, "sandbox_workspace_write.network_access"), true);
  assert.equal(codexConfig(args, "features.network_proxy.enabled"), true);
  assert.equal(codexConfigRaw(args, "features.network_proxy.domains"), "{}");
  assert.equal(codexConfig(args, "features.network_proxy.allow_local_binding"), false);
  assert.equal(codexConfig(args, "features.network_proxy.allow_upstream_proxy"), false);
  assert.equal(codexConfig(args, "features.network_proxy.dangerously_allow_all_unix_sockets"), false);
  assert.equal(codexConfig(args, "features.network_proxy.dangerously_allow_non_loopback_proxy"), false);
  assert.equal(codexConfig(args, "features.network_proxy.enable_socks5"), false);
  assert.equal(codexConfig(args, "features.network_proxy.enable_socks5_udp"), false);
  assert.equal(
    codexConfigRaw(args, "features.network_proxy.unix_sockets"),
    `{${JSON.stringify(socketPath)}="allow"}`,
  );
  assert.ok(!args.some((value) => value === "network.enabled=true" || value.startsWith("network.unix_sockets=")));
}

function findExecutable(command: string): string | undefined {
  if (command.includes("/")) {
    try {
      accessSync(command, constants.X_OK);
      return command;
    } catch {
      return undefined;
    }
  }
  for (const directory of (process.env.PATH ?? "").split(":")) {
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  return undefined;
}

function fakeMise(input: readonly string[]): number {
  let args = [...input];
  if (args.length >= 2 && args[0] === "-C") {
    args = args.slice(2);
  }
  if (args[0] === "which" && args.length === 2) {
    const executable = findExecutable(args[1] as string);
    if (!executable) {
      return 1;
    }
    console.log(executable);
    return 0;
  }
  if (args[0] === "exec") {
    args = args.slice(1);
    if (args[0] === "--") {
      args = args.slice(1);
    }
    const command = args[0];
    if (!command) {
      throw new Error("fake mise exec requires a command");
    }
    const result = spawnSync(command, args.slice(1), { env: process.env, stdio: "inherit" });
    if (result.error) {
      throw result.error;
    }
    return result.status ?? 1;
  }
  throw new Error(`unsupported fake mise invocation: ${JSON.stringify(args)}`);
}

function fakeBd(input: readonly string[]): number {
  let args = [...input];
  const statePath = requiredEnvironment("FAKE_BD_STATE");
  const state = readJson(statePath);
  let actor: string | null = null;
  if (args.length >= 2 && args[0] === "--actor") {
    actor = args[1] as string;
    args = args.slice(2);
  }
  const command = args[0];
  const taskId = args[1];
  const bead = taskId ? state.beads?.[taskId] : undefined;
  if (!bead) {
    console.error(JSON.stringify({ error: "not_found" }));
    return 1;
  }
  if (command === "show") {
    console.log(JSON.stringify([bead]));
    return 0;
  }
  if (command !== "update") {
    throw new Error(`unsupported fake bd invocation: ${JSON.stringify(args)}`);
  }
  if (args.includes("--claim")) {
    bead.status = "in_progress";
    bead.assignee = actor;
  }
  if (args.includes("--status")) {
    bead.status = option(args, "--status");
  }
  if (args.includes("--metadata")) {
    const metadataPatch = JSON.parse(option(args, "--metadata")) as JsonObject;
    Object.assign(bead.metadata, metadataPatch);
    state.metadata_updates ??= [];
    state.metadata_updates.push({ task_id: taskId, metadata: metadataPatch });
  }
  writeJson(statePath, state);
  console.log(JSON.stringify([bead]));
  return 0;
}

function fakeHerdr(input: readonly string[]): number {
  let args = [...input];
  const statePath = requiredEnvironment("FAKE_HERDR_STATE");
  const state = readJson(statePath);
  if (args.length >= 2 && args[0] === "--session") {
    args = args.slice(2);
  }
  if (args[0] === "status" && args[1] === "server" && args[2] === "--json" && args.length === 3) {
    console.log(JSON.stringify({ status: "running", version: "0.8.2" }));
    return 0;
  }
  if (args[0] === "agent" && args[1] === "list" && args.length === 2) {
    console.log(JSON.stringify({ result: { agents: Object.values(state.agents ?? {}) } }));
    return 0;
  }
  if (args[0] === "workspace" && args[1] === "create") {
    assertKnownOptions(args, 2, ["--cwd", "--label", "--env"], ["--no-focus", "--focus"]);
    state.counter += 1;
    const workspace = `w${String(state.counter)}`;
    const tab = `${workspace}:t1`;
    const pane = `${tab}:p1`;
    state.workspaces ??= [];
    state.workspaces.push(args);
    state.pane_env ??= {};
    state.pane_env[pane] = environmentOptions(args);
    state.tab_counters ??= {};
    state.tab_counters[workspace] = 1;
    state.last_workspace = { workspace_id: workspace, tab_id: tab, pane_id: pane };
    writeJson(statePath, state);
    console.log(
      JSON.stringify({
        result: {
          type: "workspace_created",
          workspace: { workspace_id: workspace },
          tab: { tab_id: tab },
          root_pane: { pane_id: pane },
        },
      }),
    );
    return 0;
  }
  if (args[0] === "worktree" && args[1] === "create") {
    assertKnownOptions(args, 2, ["--workspace", "--cwd", "--branch", "--base", "--path", "--label"], ["--no-focus", "--focus"]);
    const repository = option(args, "--cwd");
    const base = option(args, "--base");
    const branch = option(args, "--branch");
    const target = option(args, "--path");
    const result = spawnSync(
      "git",
      ["-C", repository, "worktree", "add", "-q", "-b", branch, target, base],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      return result.status ?? 1;
    }
    state.worktrees ??= [];
    state.worktrees.push(args);
    state.counter += 1;
    const workspace = `w${String(state.counter)}`;
    const tab = `${workspace}:t1`;
    const pane = `${tab}:p1`;
    state.pane_env ??= {};
    state.pane_env[pane] = {};
    state.tab_counters ??= {};
    state.tab_counters[workspace] = 1;
    state.last_workspace = { workspace_id: workspace, tab_id: tab, pane_id: pane };
    writeJson(statePath, state);
    console.log(
      JSON.stringify({
        result: {
          type: "worktree_created",
          workspace: { workspace_id: workspace },
          tab: { tab_id: tab },
          root_pane: { pane_id: pane },
          worktree: { path: target },
        },
      }),
    );
    return 0;
  }
  if (args[0] === "tab" && args[1] === "create") {
    assertKnownOptions(args, 2, ["--workspace", "--cwd", "--label", "--env"], ["--no-focus", "--focus"]);
    const workspace = option(args, "--workspace");
    state.tab_counters ??= {};
    state.tab_counters[workspace] = Number(state.tab_counters[workspace] ?? 1) + 1;
    const tab = `${workspace}:t${String(state.tab_counters[workspace])}`;
    const pane = `${tab}:p1`;
    state.tabs ??= [];
    state.tabs.push(args);
    state.pane_env ??= {};
    state.pane_env[pane] = environmentOptions(args);
    writeJson(statePath, state);
    console.log(JSON.stringify({ result: { type: "tab_created", tab: { tab_id: tab }, root_pane: { pane_id: pane } } }));
    return 0;
  }
  if (args[0] === "tab" && args[1] === "close") {
    assert.equal(args.length, 3, `unsupported fake Herdr tab close: ${JSON.stringify(args)}`);
    state.tab_closes ??= [];
    state.tab_closes.push(args[2]);
    writeJson(statePath, state);
    console.log(JSON.stringify({ result: { type: "ok" } }));
    return 0;
  }
  if (args[0] === "agent" && args[1] === "start") {
    assertKnownOptions(args, 3, ["--kind", "--pane", "--timeout"]);
    if (process.env.FAKE_HERDR_FAIL_START === "1") {
      console.error(JSON.stringify({ error: { code: "agent_start_failed" } }));
      return 1;
    }
    const name = args[2] as string;
    const pane = option(args, "--pane");
    const workspace = pane.split(":", 1)[0];
    const tab = pane.split(":").slice(0, 2).join(":");
    state.starts ??= [];
    state.starts.push(args);
    state.agents[name] = {
      name,
      agent_status: "idle",
      workspace_id: workspace,
      tab_id: tab,
      pane_id: pane,
      launch_env: { ...(state.pane_env?.[pane] ?? {}) },
      state_change_seq: 1,
      agent_session: {
        source: "fake",
        agent: "codex",
        kind: "id",
        value: `session-${name}`,
      },
    };
    if (process.env.FAKE_HERDR_BLOCK_START === "1") {
      state.agents[name].agent_status = "blocked";
      writeJson(statePath, state);
      console.error(JSON.stringify({ error: { code: "agent_not_ready" } }));
      return 1;
    }
    writeJson(statePath, state);
    console.log(JSON.stringify({ result: { agent: state.agents[name] } }));
    return 0;
  }
  if (args[0] === "agent" && args[1] === "get") {
    const name = args[2] as string;
    const agent = state.agents[name];
    if (!agent) {
      console.error(JSON.stringify({ error: { code: "agent_not_found" } }));
      return 1;
    }
    console.log(JSON.stringify({ result: { agent } }));
    return 0;
  }
  if (args[0] === "agent" && args[1] === "prompt") {
    const name = args[2] as string;
    const prompt = args[3] as string;
    if (!state.agents[name]) {
      console.error(JSON.stringify({ error: { code: "agent_not_found" } }));
      return 1;
    }
    if (process.env.FAKE_HERDR_FAIL_PROMPT === "1") {
      console.error(`prompt rejected: ${prompt}`);
      return 1;
    }
    state.prompts.push({ agent: name, prompt, args: args.slice(4) });
    state.agents[name].agent_status = "working";
    state.agents[name].state_change_seq += 1;
    writeJson(statePath, state);
    console.log(JSON.stringify({ result: { accepted: true } }));
    return 0;
  }
  throw new Error(`unsupported fake herdr invocation: ${JSON.stringify(args)}`);
}

function fakeTool(args: readonly string[]): number {
  const [tool, ...toolArgs] = args;
  if (tool === "mise") {
    return fakeMise(toolArgs);
  }
  if (tool === "bd") {
    return fakeBd(toolArgs);
  }
  if (tool === "herdr") {
    return fakeHerdr(toolArgs);
  }
  throw new Error(`unknown fake tool: ${String(tool)}`);
}

function task(
  taskId: string,
  title: string,
  repository: string,
  role = "implementer",
  description = "Create one bounded fixture artifact.",
): JsonObject {
  return {
    id: taskId,
    title,
    description,
    acceptance_criteria: "The worker receives the task and reports a commit through Relay.",
    status: "open",
    metadata: {
      schema: "hanchou.task.v1",
      profile: "work",
      project: "execution-fixture",
      repo_path: repository,
      execution_mode: "leaf",
      execution_id: null,
      owner_role: "orchestrator",
      owner_agent: "orchestrator",
      role,
      herdr: null,
      automation: null,
      routing: null,
      reporting: {
        policy: "on_terminal",
        renderer: "orchestrator",
        destination: { type: "local_session", agent: "orchestrator" },
        coalesce: "root_task",
        digest_key: null,
        origin: { type: "local_session", agent: "orchestrator" },
      },
    },
  };
}

function initialize(args: readonly string[]): void {
  const [bdPath, herdrPath, repository] = args;
  assert.ok(bdPath && herdrPath && repository);
  const tasks: JsonObject = {
    "hch-ok": task("hch-ok", "Successful Codex dispatch", repository),
    "hch-delivery-bad": task("hch-delivery-bad", "Invalid and duplicate Delivery evidence", repository),
    "hch-evidence": task("hch-evidence", "Invalid completion evidence", repository),
    "hch-claude": task("hch-claude", "Successful Claude fallback dispatch", repository),
    "hch-reviewer": task("hch-reviewer", "Claude reviewer dispatch", repository, "reviewer"),
    "hch-researcher": task("hch-researcher", "Claude researcher dispatch", repository, "researcher"),
    "hch-conflict": task("hch-conflict", "Reconcile ownership conflict", repository),
    "hch-trust": task("hch-trust", "Codex first-run trust recovery", repository),
    "hch-revoked": task("hch-revoked", "Authorization revoked before first prompt", repository),
    "hch-trust-fail": task(
      "hch-trust-fail",
      "Ready reconcile prompt failure",
      repository,
      "implementer",
      "Never expose SENTINEL-HANCHOU-READY-SECRET-8b319e.",
    ),
    "hch-fail": task("hch-fail", "Safe failed dispatch", repository),
    "hch-secret": task(
      "hch-secret",
      "Prompt failure redaction",
      repository,
      "implementer",
      "Never expose SENTINEL-HANCHOU-PROMPT-SECRET-4c221d.",
    ),
  };
  const unauthorized = task("hch-unauthorized", "Unauthorized project metadata", repository);
  unauthorized.metadata.project = "wrong-project";
  tasks["hch-unauthorized"] = unauthorized;
  const blocked = task("hch-blocked", "Dependency-blocked dispatch", repository);
  blocked.dependencies = [
    { id: "hch-prereq", title: "Open prerequisite", status: "open", dependency_type: "blocks" },
  ];
  tasks["hch-blocked"] = blocked;
  const foreign = task("hch-foreign", "Foreign execution ownership", repository);
  foreign.metadata.execution_id = "exe_foreign";
  tasks["hch-foreign"] = foreign;
  writeJson(bdPath, { beads: tasks, metadata_updates: [] });
  writeJson(herdrPath, { counter: 0, agents: {}, prompts: [], starts: [], worktrees: [], workspaces: [], tabs: [], tab_closes: [], pane_env: {}, tab_counters: {} });
}

function jsonField(value: JsonObject, path: string): void {
  let current: any = value;
  for (const component of path.split(".")) {
    assert.ok(current !== null && typeof current === "object" && component in current, `missing JSON field: ${path}`);
    current = current[component];
  }
  if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
    process.stdout.write(String(current));
  } else {
    process.stdout.write(JSON.stringify(current));
  }
}

function assertBlocked(path: string): void {
  const inspect = readJson(path);
  assert.equal(inspect.bead.status, "open");
  assert.equal(inspect.execution, null);
}

function assertForeign(inspectPath: string, herdrPath: string): void {
  const inspect = readJson(inspectPath);
  const herdr = readJson(herdrPath);
  assert.equal(inspect.bead.status, "open");
  assert.equal(inspect.task_metadata.execution_id, "exe_foreign");
  assert.equal(inspect.execution, null);
  assert.equal(herdr.counter, 0);
  assert.deepEqual(herdr.worktrees, []);
  assert.deepEqual(herdr.starts, []);
}

function assertUnauthorized(args: readonly string[]): void {
  const [inspectPath, bdPath, herdrPath, repository] = args;
  assert.ok(inspectPath && bdPath && herdrPath && repository);
  const inspect = readJson(inspectPath);
  const bdState = readJson(bdPath);
  const herdr = readJson(herdrPath);
  assert.equal(inspect.bead.status, "open");
  assert.equal(inspect.task_metadata.project, "wrong-project");
  assert.equal(inspect.task_metadata.execution_id, null);
  assert.equal(inspect.execution, null);
  assert.ok(!bdState.metadata_updates.some((row: JsonObject) => row.task_id === "hch-unauthorized"));
  assert.equal(herdr.counter, 0);
  assert.deepEqual(herdr.worktrees, []);
  assert.deepEqual(herdr.starts, []);
  assert.deepEqual(herdr.prompts, []);
  const branches = execFileSync("git", ["-C", repository, "branch", "--format=%(refname:short)"], {
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  assert.deepEqual(branches, ["main"]);
}

function assertDispatchSuccess(): void {
  const row = stdinJson();
  assert.equal(row.phase, "prompted");
  assert.equal(typeof row.agent_name, "string");
  assert.ok(row.agent_name.startsWith("hch_"));
}

function assertInspectOk(args: readonly string[]): void {
  const [inspectPath, bdPath, herdrPath, repository, rawHome] = args;
  assert.ok(inspectPath && bdPath && herdrPath && repository && rawHome);
  const inspect = readJson(inspectPath);
  const bdState = readJson(bdPath);
  const herdr = readJson(herdrPath);
  assert.equal(inspect.execution.phase, "prompted");
  const baseCommit = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(inspect.execution.base_commit, baseCommit);
  const worktree = herdr.worktrees.find(
    (row: string[]) => option(row, "--path") === String(inspect.execution.worktree_path),
  ) as string[];
  assert.ok(worktree);
  assert.equal(option(worktree, "--base"), baseCommit);
  assert.ok(!worktree.includes("--env"));
  const tab = herdr.tabs.find(
    (row: string[]) => option(row, "--workspace") === String(inspect.execution.workspace_id),
  ) as string[];
  assert.ok(tab);
  assert.equal(option(tab, "--env"), `HANCHOU_AGENT_ID=${String(inspect.execution.agent_name)}`);
  assert.ok(herdr.tab_closes.includes(`${String(inspect.execution.workspace_id)}:t1`));
  assert.equal(inspect.task_metadata.herdr.binding_state, "live");
  assert.ok(inspect.task_metadata.herdr.worktree_path);
  assert.ok(inspect.task_metadata.herdr.branch.startsWith("hanchou/"));
  assert.equal(inspect.task_metadata.routing.provider, "codex");
  assert.equal(inspect.task_metadata.routing.model, "gpt-5.6-terra");
  assert.equal(inspect.agent_status, "working");
  assert.equal(bdState.beads["hch-ok"].status, "in_progress");
  const updates = bdState.metadata_updates
    .filter((row: JsonObject) => row.task_id === "hch-ok")
    .map((row: JsonObject) => row.metadata as JsonObject);
  assert.equal(updates.length, 2);
  const allowed = new Set(["execution_id", "routing", "herdr", "reporting"]);
  assert.ok(updates.every((row: JsonObject) => Object.keys(row).every((key) => allowed.has(key))));
  assert.ok(updates.every((row: JsonObject) => !("schema" in row) && !("project" in row) && !("owner_agent" in row)));
  const prompt = herdr.prompts[0].prompt as string;
  assert.ok(prompt.includes("Task ID: hch-ok"));
  assert.ok(prompt.includes("hanchou-worker") && prompt.includes("hanchou-relay"));
  assert.ok(prompt.includes("Canonical role contract:") && prompt.includes("# Implementer"));
  assert.ok(prompt.includes("--type completed") && prompt.includes("--to-agent orchestrator"));
  assert.ok(prompt.includes(`--execution ${String(inspect.execution.execution_id)}`));
  const promptArgs = herdr.prompts[0].args as string[];
  assert.ok(promptArgs.includes("--wait") && promptArgs.includes("working") && promptArgs.includes("blocked"));
  const start = herdr.starts[0] as string[];
  assert.equal(option(start, "--kind"), "codex");
  assert.ok(!start.includes("--env"));
  assert.equal(herdr.agents[String(inspect.execution.agent_name)].launch_env.HANCHOU_AGENT_ID, inspect.execution.agent_name);
  assert.ok(start.includes("--sandbox") && start.includes("workspace-write"));
  assert.ok(start.includes("--approve-for-me"));
  assertManagedNetwork(start, rawHome);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_ENV"), "1");
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_SESSION"), "work");
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_PANE_ID"), inspect.execution.pane_id);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_WORKSPACE_ID"), inspect.execution.workspace_id);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_TAB_ID"), inspect.execution.tab_id);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_SOCKET_PATH"), join(rawHome, ".config/herdr/sessions/work/herdr.sock"));
  assert.equal(
    codexConfig(start, "shell_environment_policy.set.HERDR_BIN_PATH"),
    join(requiredEnvironment("HANCHOU_TEST_OPERATOR_HOME"), ".local/share/mise/installs/herdr/0.8.2/herdr"),
  );
  assert.equal(codexConfig(start, "shell_environment_policy.set.HANCHOU_AGENT_ID"), inspect.execution.agent_name);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HANCHOU_PROFILE"), "work");
  assert.equal(
    codexConfig(start, "shell_environment_policy.set.BEADS_DIR"),
    resolve(realpathSync(rawHome), ".local/share/hanchou/work/control/.beads"),
  );
  const addDirs = start.flatMap((value, index) => (value === "--add-dir" ? [start[index + 1] as string] : []));
  const expected = [
    dirname(inspect.execution.report_path as string),
    resolve(realpathSync(rawHome), ".local/share/hanchou/work/relay"),
    join(rawHome, ".config/herdr/sessions/work"),
  ].sort();
  assert.deepEqual([...new Set(addDirs)].sort(), expected);
  assert.equal(addDirs.length, 3);
  assert.ok(!JSON.stringify(start).includes("must-not-be-forwarded"));
}

function assertOrchestratorEnvironment(herdrPath: string, rawHome: string): void {
  const herdr = readJson(herdrPath);
  const start = herdr.starts.find((row: string[]) => row[0] === "agent" && row[1] === "start" && row[2] === "orchestrator") as string[];
  assert.ok(start);
  const agent = herdr.agents.orchestrator as JsonObject;
  assertManagedNetwork(start, rawHome);
  assert.ok(!start.includes("--env"));
  assert.equal(agent.launch_env.HANCHOU_AGENT_ID, "orchestrator");
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_ENV"), "1");
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_SESSION"), "work");
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_PANE_ID"), agent.pane_id);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_WORKSPACE_ID"), agent.workspace_id);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_TAB_ID"), agent.tab_id);
  assert.equal(codexConfig(start, "shell_environment_policy.set.HERDR_SOCKET_PATH"), join(rawHome, ".config/herdr/sessions/work/herdr.sock"));
  assert.equal(
    codexConfig(start, "shell_environment_policy.set.HERDR_BIN_PATH"),
    join(requiredEnvironment("HANCHOU_TEST_OPERATOR_HOME"), ".local/share/mise/installs/herdr/0.8.2/herdr"),
  );
  assert.equal(codexConfig(start, "shell_environment_policy.set.HANCHOU_AGENT_ID"), "orchestrator");
  assert.equal(codexConfig(start, "shell_environment_policy.set.HANCHOU_PROFILE"), "work");
  assert.equal(
    codexConfig(start, "shell_environment_policy.set.HANCHOU_RELAY_DIR"),
    resolve(realpathSync(rawHome), ".local/share/hanchou/work/relay"),
  );
  assert.ok(!JSON.stringify(start).includes("must-not-be-forwarded"));
}

function assertAwaiting(): void {
  const row = stdinJson();
  assert.equal(row.phase, "awaiting_ready");
  assert.equal(row.agent_status, "blocked");
  assert.equal(row.requires_ready_reconcile, true);
  process.stdout.write(String(row.agent_name));
}

function readyTrust(bdPath: string, herdrPath: string, agentName: string, failing: boolean): void {
  const bdState = readJson(bdPath);
  const taskId = failing ? "hch-trust-fail" : "hch-trust";
  const bead = bdState.beads[taskId];
  if (!failing) {
    assert.equal(bead.status, "in_progress");
    assert.equal(bead.metadata.herdr.binding_state, "live");
  }
  bead.status = "blocked";
  writeJson(bdPath, bdState);
  const herdr = readJson(herdrPath);
  if (!failing) {
    assert.ok(!herdr.prompts.some((entry: JsonObject) => entry.prompt.includes("Task ID: hch-trust")));
  }
  const agent = herdr.agents[agentName];
  assert.ok(agent);
  if (!failing) {
    assert.equal(agent.agent_status, "blocked");
  }
  agent.agent_status = "idle";
  agent.state_change_seq += 1;
  writeJson(herdrPath, herdr);
}

function readyAgent(herdrPath: string, agentName: string): void {
  const herdr = readJson(herdrPath);
  const agent = herdr.agents[agentName];
  assert.ok(agent);
  assert.equal(agent.agent_status, "blocked");
  agent.agent_status = "idle";
  agent.state_change_seq += 1;
  writeJson(herdrPath, herdr);
}

function assertReconcileRevoked(args: readonly string[]): void {
  const [reconcilePath, inspectPath, bdPath, herdrPath] = args;
  assert.ok(reconcilePath && inspectPath && bdPath && herdrPath);
  const row = readJson(reconcilePath);
  const inspect = readJson(inspectPath);
  const bead = readJson(bdPath).beads["hch-revoked"];
  const herdr = readJson(herdrPath);
  assert.equal(row.phase, "attention_required");
  assert.ok(row.actions.includes("awaiting-ready-prompt-blocked"));
  assert.ok(row.anomalies.some((item: string) => item.includes("project registry not found")));
  assert.equal(inspect.execution.failed_phase, "awaiting_ready_authorization_or_prompt");
  assert.equal(bead.status, "blocked");
  assert.ok(!herdr.prompts.some((entry: JsonObject) => entry.prompt.includes("Task ID: hch-revoked")));
}

function assertReconcileTrust(args: readonly string[]): void {
  const [firstPath, secondPath, herdrPath, bdPath] = args;
  assert.ok(firstPath && secondPath && herdrPath && bdPath);
  const first = readJson(firstPath);
  const second = readJson(secondPath);
  const herdr = readJson(herdrPath);
  const bead = readJson(bdPath).beads["hch-trust"];
  assert.equal(first.phase, "prompted");
  assert.ok(first.actions.includes("awaiting-ready-prompted"));
  assert.equal(second.phase, "prompted");
  assert.equal(bead.status, "in_progress");
  const prompts = herdr.prompts.filter((entry: JsonObject) => entry.prompt.includes("Task ID: hch-trust"));
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].prompt.includes("Codex first-run trust recovery"));
  assert.ok(prompts[0].args.includes("--wait") && prompts[0].args.includes("working"));
}

function assertInspectTrust(path: string): void {
  const execution = readJson(path).execution;
  assert.equal(execution.phase, "prompted");
  assert.ok(execution.prompted_at);
}

function assertReconcileTrustFail(reconcilePath: string, bdPath: string): void {
  const row = readJson(reconcilePath);
  const bead = readJson(bdPath).beads["hch-trust-fail"];
  assert.equal(row.phase, "attention_required");
  assert.ok(row.actions.includes("awaiting-ready-prompt-blocked"));
  assert.ok(row.anomalies.some((item: string) => item.includes("authorization or prompt delivery failed")));
  assert.equal(bead.status, "blocked");
  assert.ok(!JSON.stringify(row).includes("SENTINEL-HANCHOU-READY-SECRET-8b319e"));
}

function assertInspectTrustFail(path: string): void {
  const execution = readJson(path).execution;
  assert.equal(execution.phase, "attention_required");
  assert.equal(execution.failed_phase, "awaiting_ready_authorization_or_prompt");
  assert.ok(execution.error.includes("<redacted-prompt>"));
  assert.ok(execution.error.includes("<command output redacted>"));
  assert.ok(!JSON.stringify(execution).includes("SENTINEL-HANCHOU-READY-SECRET-8b319e"));
}

function mutateConflict(path: string): void {
  const state = readJson(path);
  state.beads["hch-conflict"].metadata.owner_agent = "other-orchestrator";
  state.beads["hch-conflict"].metadata.automation = { external: "preserve" };
  state.updates_before_conflict_reconcile = state.metadata_updates.length;
  writeJson(path, state);
}

function assertReconcileConflict(reconcilePath: string, bdPath: string): void {
  const row = readJson(reconcilePath);
  const state = readJson(bdPath);
  const bead = state.beads["hch-conflict"];
  assert.equal(row.phase, "attention_required");
  assert.deepEqual(row.actions, []);
  assert.ok(row.anomalies.some((item: string) => item.includes("execution identity changed in: owner_agent")));
  assert.equal(bead.metadata.owner_agent, "other-orchestrator");
  assert.deepEqual(bead.metadata.automation, { external: "preserve" });
  assert.equal(state.metadata_updates.length, state.updates_before_conflict_reconcile);
}

function assertLiveWithAnomaly(path: string, text: string): JsonObject {
  const row = readJson(path);
  assert.equal(row.phase, "prompted");
  assert.equal(row.binding_state, "live");
  assert.ok(row.anomalies.some((item: string) => item.includes(text)));
  return row;
}

function assertReconcileUnrelated(path: string): void {
  const row = assertLiveWithAnomaly(path, "none match this execution binding");
  assert.deepEqual(row.actions, []);
  assert.equal(row.terminal_events, 2);
  assert.equal(row.bound_terminal_events, 0);
  assert.ok(row.anomalies.some((item: string) => item.includes("no valid acknowledged terminal")));
}

function assertReconcileUnacknowledged(path: string): void {
  const row = assertLiveWithAnomaly(path, "no valid acknowledged terminal");
  assert.equal(row.bound_terminal_events, 1);
}

function assertReconcileBeforeDelivery(path: string): void {
  const row = assertLiveWithAnomaly(path, "no Delivery for its terminal event");
  assert.deepEqual(row.actions, []);
}

function assertReconcileOk(reconcilePath: string, bdPath: string): void {
  const row = readJson(reconcilePath);
  const bead = readJson(bdPath).beads["hch-ok"];
  assert.equal(row.phase, "settled");
  assert.equal(row.binding_state, "settled");
  assert.deepEqual(row.actions, ["binding-settled"]);
  assert.deepEqual(row.anomalies, []);
  assert.equal(row.terminal_events, 3);
  assert.equal(row.bound_terminal_events, 1);
  assert.equal(bead.status, "closed");
  assert.equal(bead.metadata.herdr.binding_state, "settled");
}

function assertReconcileEvidence(path: string): void {
  const row = assertLiveWithAnomaly(path, "no valid acknowledged terminal");
  assert.deepEqual(row.actions, []);
  assert.equal(row.terminal_events, 1);
  assert.equal(row.bound_terminal_events, 1);
  const joined = row.anomalies.join("\n") as string;
  for (const expected of [
    "detail_ref does not match",
    "execution report does not exist",
    "no valid verification evidence",
    "commit artifact does not match worktree HEAD",
    "no valid acknowledged terminal",
  ]) {
    assert.ok(joined.includes(expected));
  }
}

function assertInspectClaude(inspectPath: string, herdrPath: string): void {
  const inspect = readJson(inspectPath);
  const herdr = readJson(herdrPath);
  assert.equal(inspect.task_metadata.routing.provider, "claude");
  assert.equal(inspect.task_metadata.routing.model, "sonnet");
  const start = herdr.starts.find((row: string[]) => option(row, "--kind") === "claude") as string[];
  assert.ok(start);
  assert.ok(!start.includes("--env"));
  assert.equal(herdr.agents[String(inspect.execution.agent_name)].launch_env.HANCHOU_AGENT_ID, inspect.execution.agent_name);
  assert.equal(option(start, "--permission-mode"), "auto");
  assert.equal(option(start, "--tools"), "Read,Edit,Write,Grep,Glob,Bash,Skill");
  const addDirs = start.flatMap((value, index) => (value === "--add-dir" ? [start[index + 1] as string] : []));
  const expected = [
    dirname(inspect.execution.report_path as string),
    resolve(realpathSync(requiredEnvironment("HANCHOU_TEST_OPERATOR_HOME")), ".local/share/hanchou/work/relay"),
  ].sort();
  assert.deepEqual([...new Set(addDirs)].sort(), expected);
  assert.equal(addDirs.length, 2);
}

function assertInspectReadOnly(reviewerPath: string, researcherPath: string, herdrPath: string): void {
  const herdr = readJson(herdrPath);
  for (const [inspect, expectedTools] of [
    [readJson(reviewerPath), "Read,Write,Grep,Glob,Bash,Skill"],
    [readJson(researcherPath), "Read,Write,Grep,Glob,Bash,WebSearch,WebFetch,Skill"],
  ] as const) {
    assert.equal(inspect.task_metadata.routing.provider, "claude");
    const agentName = inspect.execution.agent_name as string;
    const start = herdr.starts.find((row: string[]) => row[2] === agentName) as string[];
    assert.ok(start);
    assert.equal(option(start, "--permission-mode"), "auto");
    assert.equal(option(start, "--tools"), expectedTools);
    const prompt = herdr.prompts.find((row: JsonObject) => row.agent === agentName)?.prompt as string;
    assert.ok(prompt.includes("Do not modify the project worktree"));
    assert.ok(prompt.includes("current worktree HEAD") && prompt.includes("do not create an empty commit"));
  }
}

function assertWriterDisabled(reportPath: string): void {
  const [, profile] = loadProfile("work");
  assert.throws(
    () =>
      workerAgentArgv(
        "work",
        profile,
        "disabled_writer",
        "w99:p1",
        { provider: "claude", model: "sonnet" },
        "writer",
        reportPath,
      ),
    (error: unknown) =>
      error instanceof CommandError && error.message === "Claude execution is disabled for role: writer",
  );
}

function assertInspectSecret(path: string): void {
  const execution = readJson(path).execution;
  assert.equal(execution.phase, "attention_required");
  assert.ok(!JSON.stringify(execution).includes("SENTINEL-HANCHOU-PROMPT-SECRET-4c221d"));
  assert.ok(execution.error.includes("<redacted-prompt>"));
  assert.ok(execution.error.includes("<command output redacted>"));
}

function assertFailure(inspectPath: string, reconcilePath: string, bdPath: string): void {
  const inspect = readJson(inspectPath);
  const reconciled = readJson(reconcilePath);
  const beads = readJson(bdPath).beads;
  assert.equal(inspect.execution.phase, "attention_required");
  assert.equal(inspect.task_metadata.herdr.binding_state, "lost");
  assert.equal(beads["hch-fail"].status, "blocked");
  assert.equal(reconciled.binding_state, "lost");
  assert.equal(reconciled.phase, "attention_required");
  assert.ok(reconciled.anomalies.length > 0);
}

function main(args: readonly string[]): number {
  const [command, ...rest] = args;
  switch (command) {
    case "fake-tool": return fakeTool(rest);
    case "initialize": initialize(rest); break;
    case "stdin-field": jsonField(stdinJson(), rest[0] as string); break;
    case "file-field": jsonField(readJson(rest[0] as string), rest[1] as string); break;
    case "assert-blocked": assertBlocked(rest[0] as string); break;
    case "assert-foreign": assertForeign(rest[0] as string, rest[1] as string); break;
    case "assert-unauthorized": assertUnauthorized(rest); break;
    case "assert-dispatch-success": assertDispatchSuccess(); break;
    case "assert-inspect-ok": assertInspectOk(rest); break;
    case "assert-awaiting": assertAwaiting(); break;
    case "ready-trust": readyTrust(rest[0] as string, rest[1] as string, rest[2] as string, false); break;
    case "ready-trust-fail": readyTrust(rest[0] as string, rest[1] as string, rest[2] as string, true); break;
    case "ready-agent": readyAgent(rest[0] as string, rest[1] as string); break;
    case "assert-reconcile-trust": assertReconcileTrust(rest); break;
    case "assert-reconcile-revoked": assertReconcileRevoked(rest); break;
    case "assert-inspect-trust": assertInspectTrust(rest[0] as string); break;
    case "assert-reconcile-trust-fail": assertReconcileTrustFail(rest[0] as string, rest[1] as string); break;
    case "assert-inspect-trust-fail": assertInspectTrustFail(rest[0] as string); break;
    case "mutate-conflict": mutateConflict(rest[0] as string); break;
    case "assert-reconcile-conflict": assertReconcileConflict(rest[0] as string, rest[1] as string); break;
    case "assert-reconcile-unrelated": assertReconcileUnrelated(rest[0] as string); break;
    case "assert-reconcile-unacknowledged": assertReconcileUnacknowledged(rest[0] as string); break;
    case "assert-reconcile-before-delivery": assertReconcileBeforeDelivery(rest[0] as string); break;
    case "assert-reconcile-ok": assertReconcileOk(rest[0] as string, rest[1] as string); break;
    case "assert-reconcile-delivery-contract": assertLiveWithAnomaly(rest[0] as string, "no contract-matching delivered Delivery"); break;
    case "assert-reconcile-delivery-duplicate": assertLiveWithAnomaly(rest[0] as string, "multiple Delivery records"); break;
    case "assert-reconcile-evidence": assertReconcileEvidence(rest[0] as string); break;
    case "assert-inspect-claude": assertInspectClaude(rest[0] as string, rest[1] as string); break;
    case "assert-inspect-readonly": assertInspectReadOnly(rest[0] as string, rest[1] as string, rest[2] as string); break;
    case "assert-writer-disabled": assertWriterDisabled(rest[0] as string); break;
    case "assert-inspect-secret": assertInspectSecret(rest[0] as string); break;
    case "assert-orchestrator-env": assertOrchestratorEnvironment(rest[0] as string, rest[1] as string); break;
    case "assert-failure": assertFailure(rest[0] as string, rest[1] as string, rest[2] as string); break;
    default: throw new Error(`unknown execution helper command: ${String(command)}`);
  }
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
