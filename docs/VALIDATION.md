# Validation

Run repository checks with:

```bash
make check
```

On the final host pass, the selected Xcode developer path was broken, so the
same command was executed as
`DEVELOPER_DIR=/Library/Developer/CommandLineTools make check`. This selects
the already-installed Command Line Tools for that process only.

## Evidence matrix

| Area | Automated evidence | Runtime E2E |
| --- | --- | --- |
| one core skill and narrow activation | repository tests | Codex + Claude activation passed |
| no legacy runtime/CLI/dependencies | repository tests and tracked-file scan | not applicable |
| local installer layout/isolation | passed with `skills` in clean and current workspaces; explicit Universal + Claude Code placements verified | `skills list` confirmed both Codex and Claude Code visibility |
| live official guide loading | skill contract assertions | passed for v1.4.195 and v1.4.188 packaged CLIs |
| Run/Task/Dispatch/inbox lifecycle | policy assertions | worker_done/question/escalation, acknowledgement, retain, and desktop release passed |
| two isolated Hanchou Runs | no registry/state in repository | distinct same-project Runs plus separate Tasks, messages, and Deliveries passed |
| cross-repository/remote worker | policy assertions | three local repositories and connected Linux placement passed; authenticated remote completion is conditional on an available server |
| restart/native idle delivery | no custom watcher present | native wake was unavailable on tested releases; required bounded `check --wait` fallback and restart preservation passed |
| Automations lifecycle | no scheduler state present | simple lifecycle and installed-skill Temporary Hanchou manual run passed |

Runtime rows must be executed against the installed Orca version before a
release is called fully E2E-qualified. A missing runtime is not a passing result.

The official v1.4.195 packaged CLI was also exercised from an isolated temporary
HOME. It served complete version-matched `orca-cli` and `orchestration --full`
guides with SHA-256 values
`68aa7bf3ef3deaa19c90c47990ec712b3c8e8dd927aa35cfa98993da82bc1e18` and
`f20a752dd471f23984d71cc6fac69d8860c5ea32b52939d9c7280bbe6fe94bbd`.
`status --json` reported a non-running runtime, and `run-current --json`
returned `runtime_unavailable` without creating files in the isolated HOME.

A v1.4.195 runtime attempt was not accepted as E2E evidence. Packaged
`orca serve` exited its startup path with `AppEnvironment not initialized`, the
same regression recorded in official issue #16761. Commit
`18e8fe47705ebd17917a194c33fd10bc7bb5723d` fixes that issue but is not an
ancestor of release commit `bc2f593ebba70a0ee6ff900129e4918f57b143aa`.
The desktop launch remained in `runtime.state: starting` and never became
reachable.

The official v1.4.188 arm64 zip was then downloaded. Its SHA-256
`b991ea213a6ef594c8f7f41a37d6b98fa8d8e7a494c8af38c9d3fc88384be347`
matched release metadata, and `orca serve` reached `orca_server_ready`. Its
packaged live guides were 412 and 408 lines with SHA-256 values
`bc171edfb40862e1b646f0c6b50af4813c7eea15ed00225408c7e2c3b94eb766`
and `b342388d8fd7c2aaee28ebece5d5f2512064e455ed69de990aaa22ae08eba974`.

## Live Orca E2E result

The bounded v1.4.188 runtime test produced these public-Orca results:

- two coordinator terminals in one repository created distinct Run IDs;
- one Project Run created a read-only Task and a supervised Codex worker;
- the worker asked `Confirm expected version is 3.0.0?`, received the
  coordinator reply, and sent one successful `worker_done`;
- Orca marked the Task and Dispatch completed/succeeded;
- a dependent independent review worker also completed successfully;
- `worker-retain` settled one worker as retained;
- `worker-release` stopped the exact review terminal and archived output, but
  returned `release_unknown: tab_not_found` because the headless runtime had no
  renderer tab;
- the same Run dispatched a successful worker in `hanchou-skills`;
- after a full runtime and daemon stop/restart, `run-list` and `task-list`
  recovered all Runs and three completed Tasks through public v1.4.188 CLI;
- a new v1.4.188 version-matched Run dispatched another successful worker in
  `hanchou-kingdom`;
- a disabled Automation ran manually and history reported `completed`, manual
  trigger, and no error; it was edited while disabled and then removed, leaving
  the Automation list empty.

A second restart/recovery pass exercised two-way isolation directly:

- fresh terminal handles rebound `run_ca9ddf40d502` and `run_a3116f917aa5`
  through public `run-use`, advancing each consumer generation from 1 to 2;
- unique Task markers `task_f10f79b1fa9d` and `task_4f0660603749` were created
  and listed only under their respective Runs, then settled as test evidence;
- unique messages `msg_516b2cec019b` and `msg_e8194cbf74c2` produced separate
  one-message Deliveries, with no opposite marker in either result, and were
  acknowledged independently;
- tracked Dispatch `ctx_ddd6e48e04eb` emitted escalation
  `msg_9fb5415270a9`; the owner Run received and acknowledged it before the test
  Dispatch was stopped.

A fresh desktop v1.4.188 profile then provided renderer-backed evidence:

- its version-matched `computer-use` guide was 167 lines with SHA-256
  `0fec3df85f7f4cbb6ee250f1a3da78f31991b07fca663f30ab9da8ab95568826`;
- Computer Use capabilities loaded, but both Accessibility and screenshot
  permissions reported `not-granted`; no Settings UI or permission was changed;
- a visible Codex worker completed Task `task_3c79b8593d2c` and Dispatch
  `ctx_c6144b5ab379` with `worker_done` and no file changes;
- `worker-release` returned `state: released`,
  `processAction: closed_agent_terminal`, archive `captured`, and no error;
- two idle Codex coordinator terminals were bound to ordinary Runs. A targeted
  status message and two tracked escalations remained unread in those Runs and
  were visible through public `check`, but no native delivery pointer was
  injected during bounded observations exceeding 30 seconds. The messages were
  then checked and acknowledged explicitly, and all test Dispatches/terminals
  were settled.

A later user-installed Orca v1.4.195 desktop provided a second
renderer-backed pass on the normal profile:

- `status --json` reported runtime `ready`, desktop window `available`, and app
  version 1.4.195;
- the installed binary served both version-matched core guides before state
  operations;
- the official Computer Use helper reported Accessibility and screenshots
  permissions both `granted`;
- a fresh Codex coordinator created Run `run_e36d686e6f8c`, Task
  `task_1bc65dddc553`, and supervised Dispatch `ctx_f552888c2bbf`;
- the read-only worker reported `worker_done` successfully and Orca settled the
  Task and Dispatch;
- after more than 35 seconds idle, the coordinator had received no native
  pointer. Non-consuming `check --peek` proved message `msg_0f885ff19791` was
  still unread and had no delivery timestamp;
- one official bounded `check --wait` returned Delivery
  `delivery_797a3ac43961`; `worker-release` returned `state: released` and
  `processAction: closed_agent_terminal`, and the coordinator acknowledged the
  Delivery afterward;
- the test coordinator terminal and temporary top-level worktree were removed.

A final v1.4.195 installed-skill pass created a disposable Orca worktree whose
local Universal and Claude Code placements came from the standard installer.
Temporary Hanchou Run `run_8cb0c22a6743` dispatched read-only Task
`task_efb1bf4df819` as `ctx_86b19029c6a8`, then ended the coordinator turn with
no Inbox command. The worker succeeded at 02:33:27 UTC. More than 90 seconds of
passive coordinator-terminal observation produced no new output. External
`check --peek` found unread message `msg_1dbbc74f7b86`, marker
`HANCHOU_NATIVE_WAKE_20260903`, and `delivered_at: null`. The bounded fallback,
worker release, and Delivery `delivery_a102b19bc2fe` acknowledgement all passed.

The same installed-skill workspace then ran a disabled Automation manually.
After avoiding a host login-shell `ssh-add` prompt with `SHELL=/bin/bash`, the
Automation's Codex session explicitly activated Temporary Hanchou, created Run
`run_39c3962e5e5e`, Task `task_fb0b5ee6ce68`, and Dispatch
`ctx_97d1a21880af`, received marker `HANCHOU_AUTOMATION_20260903` through
bounded Delivery `delivery_246dd5bea8ae`, released the worker, acknowledged the
Delivery, and reported `filesModified: []`. Automation history recorded a
manual completed run with no error. It marked dispatch completion before the
terminal workflow settled, so terminal and Orchestration state were
independently inspected. The Automation, terminals, Orca worktree, and
temporary project setups were removed.

This removes missing Computer Use permission as an explanation for the prior
idle-wake result. A later semantic Computer Use inspection reached the dedicated
Settings → Orchestration page. The page exposed skill coverage and nested-worker
depth, but no enable/disable toggle; public status supplied the positive
`orchestration.contract.v1` availability signal.

The first worker attempt is retained as failure evidence: a login-shell
`ssh-add` prompt stalled Codex input, so Orca returned
`agent_prompt_stalled`. Restarting the disposable runtime with a noninteractive
shell configuration removed that host-specific obstacle. Because a temporary
bundle cannot install its CLI globally, worker specs used the exact packaged
CLI path; the final `hanchou-kingdom` proof used v1.4.188 CLI and runtime
end-to-end.

A second local macOS server using a separate requested user-data path was
rejected by Electron's single-instance lock. The official v1.4.188 Linux arm64
AppImage was therefore run in a disposable Ubuntu 24.04 arm64 container. Its
SHA-256
`edb96cf68e4c5d9442b913e82cad5b6c23a6399f8398e8f4798955bbb9c94918`
matched release metadata. Pairing produced a ready connected environment named
`hanchou-docker-remote`; Orca registered `/workspace`, reused its remote
worktree, and created the requested worker terminal on that server. The
container intentionally received no host credentials and had no Codex CLI, so
input dispatch ended with `agent_prompt_stalled`. Connected-server discovery,
repository/worktree routing, and placement are qualified; remote agent
completion is not. The container and all test-created Docker image tags were
removed afterward.

A fresh default profile allowed orchestration inspection. The installed
v1.4.195 Settings → Orchestration page was later captured through official
Computer Use: it exposes skill coverage and nested-worker depth, with no
enable/disable toggle. Public status advertises `orchestration.contract.v1`.

All exact Orca processes from the earlier disposable passes were stopped.
Test-created macOS profiles were moved intact to
`/tmp/orca-e2e-recovery-20260902T1928`,
`/tmp/orca-v3-e2e-evidence-20260902T2012`, and
`/tmp/orca-v3-fresh-profile-20260902T2013`. The renderer-backed pass is archived
at `/tmp/orca-v3-desktop-evidence-20260902T2105`. Those passes left the normal
Orca paths absent. The later v1.4.195 normal installation and its retained Run
belong to the user's current Orca profile; only the test terminals and temporary
worktree were removed.

## Installer test result

On 2026-09-02, the standard installer was run from Node 22.20 against this local
repository with `--skill hanchou-orchestrator --local -y`. It found exactly one
skill and copied only that skill tree plus its standard `skills-lock.json` into
the temporary target. Pre-existing `README.md`, `AGENTS.md`, `CLAUDE.md`, and
local policy hashes were unchanged. No Orca installation or userData existed in
this environment to mutate.

A second test used sibling `project-a` and `project-b` directories. Installation
into A left all pre-existing files in both projects byte-identical, added the
skill only below A, left B without an `.agents` directory, and left the normal
Orca userData path absent before and after.

On 2026-09-03, installer 1.5.23 was repeated in the current repository. Agent
auto-detection created the Universal `.agents/skills/hanchou-orchestrator`
placement but omitted Claude Code. Re-running with
`--agent universal claude-code` created that canonical tree plus
`.claude/skills/hanchou-orchestrator` as the provider alias. `skills list` then
reported the skill for both Codex and Claude Code. Pre-existing README,
AGENTS, CLAUDE, and policy hashes remained unchanged, and Orca's Automation
inventory remained empty. This is why the documented commands name both
targets explicitly. The test placements were removed with the same standard
installer after validation.

## Activation tests

Codex CLI 0.152.1 and Claude Code 2.1.234 were run in read-only/non-persistent
mode from a project with the locally installed skill and no Hanchou-specific
project instruction. An ordinary arithmetic request returned its answer without
Hanchou startup in both providers. The natural-language request「Hanchouとして
開始してください」selected the skill in both providers, read its startup policy,
resolved the official executable search to unavailable, reported the exact
blocker, and created no Run. This proves activation routing and fail-closed
behavior through the missing-executable boundary; it does not prove behavior
after a live Orca runtime is reached.

The explicit exclusion for a generic「launch another agent」request was also
forward-tested in both providers. Each returned the requested ordinary
acknowledgement without Hanchou startup or tool execution.

With `ORCA_CLI_COMMAND` set to the verified v1.4.195 packaged CLI, both Codex
and Claude activation sessions retrieved `orca-cli` and `orchestration --full`
before checking status. Both observed `runtime.state: not_running`, stopped at
that boundary, did not inspect Run binding, and created no Run. This proves the
mandatory live-guide order in both providers through the runtime-status gate.

A previous conservative forward test stopped when a fixture exposed no feature
signal. Current Hanchou instead requires the public Orchestration contract and a
read-only current-Run probe. It fails closed on an explicit disabled/unavailable
result, while allowing formally shipped releases such as installed v1.4.195
that expose the contract and no UI toggle.

The current policy was also forward-tested against a deterministic CLI fixture
that advertised `orchestration.contract.v1` but returned
`orchestration_feature_disabled` from the read-only current-Run probe. Codex
loaded both official live-guide surfaces, checked status, stopped without
calling Run creation, repeated the fixture's manual Settings guidance, and made
no setting change. This qualifies the explicit-disabled compatibility branch;
the installed v1.4.195 UI itself has no such toggle.

## Runtime checklist

1. Start ordinary Codex and Claude sessions; confirm no Hanchou activation/Run.
2. Explicitly activate one of each; verify both load live guides.
3. **Not applicable to installed v1.4.195:** its dedicated Orchestration page
   has no enable/disable toggle. The skill retains fail-closed handling for an
   older runtime that explicitly reports disabled/unavailable.
4. **Passed:** two coordinator panes had different Run IDs; independent Tasks,
   messages, Deliveries, and acknowledgements did not cross Runs.
5. **Passed:** question/reply, completion, review, retain, and renderer-backed
   clean release all passed.
6. **Passed for available environments:** three local repositories and
   connected Linux worker placement passed. Authenticated remote completion is
   outside the criterion and remains conditional on a connected server with an
   installed/authenticated provider; the current profile has none.
7. **Passed via unavailable-native fallback:** Inbox persistence and
   `check --wait` passed, while two v1.4.188
   coordinators and two installed-v1.4.195 coordinators did not receive native
   injection. The final pass used the candidate Hanchou distribution skill in
   an Orca-created workspace and observed no coordinator output for more than
   90 seconds after worker completion. Open upstream Orca issue
   [#12953](https://github.com/stablyai/orca/issues/12953) documents that
   lightweight-Run lifecycle mail currently reaches coordinators through
   `check --wait`. Hanchou uses that official bounded path as criterion 20.7
   requires and adds no daemon or polling loop.
8. **Passed:** restart preservation and public `run-use` recovery binding both
   passed without private state access; takeover was unnecessary.
9. **Passed:** disabled Automation creation/manual run/history/edit/removal for
   the simple path, plus an installed-skill Temporary Hanchou manual run through
   Run/Task/Dispatch/worker release/Delivery ack.
