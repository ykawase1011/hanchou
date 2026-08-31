# Command surface

## Principle

Hanchou CLI is intentionally thin. Use the source-of-truth CLI directly when an
operation belongs to one system.

| Need | Command surface |
|---|---|
| Task/Epic/Decision/dependency/ready | `bd` |
| Agent/pane/workspace/worktree/state | `herdr` |
| Ordinary fresh-agent recurring job | `herdr-automations` |
| Setup, routing, Relay, Delivery, cross-system operations | `hanchou` |

See `CLI_AND_SKILL_BOUNDARY.md` and the shared `hanchou-cli` Skill.

## Implemented Hanchou commands

### Setup and UI

```bash
hanchou onboard work
hanchou onboard work --yes
hanchou bootstrap [work|personal]
hanchou plan work
hanchou apply work --yes [--install-upstream]
hanchou doctor work
hanchou status work [--json]
hanchou launch work [--no-browser] [--herdrm]
hanchou start-orchestrator work
hanchou stop-orchestrator work --all
hanchou stop-orchestrator work --all --plan <64hex-token> --yes
hanchou open dashboard work
hanchou open tasks work
hanchou open herdr work
hanchou open herdrm work
hanchou open orchestrator work
hanchou open automations work
hanchou dashboard snapshot work
hanchou dashboard serve work
hanchou render-agents [--check]
hanchou handoff
```

`bootstrap` runs `mise install` from the Core repository and then performs the
full idempotent apply. Use `plan` first to review user configuration files that
may be backed up and replaced.

`onboard` is the narrow human-only exception to the otherwise inspection-only
project authorization surface. It takes no arbitrary path. The first invocation
prints a plan for the fixed `~/HanchouWorkspace/<profile>/repositories` shelf;
`--yes` applies it only from an ordinary interactive terminal outside a
Herdr-managed Agent. It creates mode-0700 directories, atomically writes the
mode-0600 registry, backs up changes, and is idempotent.

`launch` does not install or silently replace services. After `bootstrap` has
registered the macOS LaunchAgents, it verifies Herdr, beads-ui, and the
read-only Hanchou Dashboard, starts or initializes the Orchestrator, and opens
the Dashboard. Herdr is ready only after both its pinned-version Ping and a
read-only control-plane probe succeed; shutdown/reload is reported instead of
being mistaken for ready. Missing LaunchAgent plist names are included in the
error so an upgrade that needs another `bootstrap` is explicit. `--herdrm` also
attempts the optional native app, but inability
to prove that Herdrm's default socket matches the Hanchou named-session socket
is reported as a warning and never starts a second Herdr session. If the default
path is absent, an explicit Herdrm open may link it to the verified pinned,
live, same-user named socket; an existing path is never replaced.

Orchestrator creation is serialized per profile. Hanchou atomically records the
exact workspace, tab, pane, and terminal IDs before Agent startup and reuses
that binding after `/exit`, a blocked first run, or a failed start. It never
closes a workspace from `launch` or `start-orchestrator`. If an unbound legacy
workspace with the configured label exists, Hanchou fails closed instead of
creating another one. The only migration exception is a live named Agent whose
kind, label, one-tab/one-pane shape, no-worktree state, Core cwd, and all opaque
IDs match exactly; Hanchou binds and keeps that Agent without creating or
restarting a workspace.

`stop-orchestrator <profile> --all` is a read-only plan. The explicit `--all`
selector is required; there is no implicit current-workspace form. Hanchou first
checks every same-label candidate and prints the plan only when all candidates
pass the dedicated-Orchestrator checks. The plan shows the bound/named/legacy
classification, Agent status, focus state, terminal ID, foreground process
`PID:name` values, `observed_additional`, and foreground cwd for every target.
`observed_additional` is numeric only for an unowned legacy target whose shell
was scanned; it is `n/a` for an Agent-occupied target. A target must have
exactly one tab and one pane, no worktree, a pane cwd
that resolves to the current Hanchou Core checkout, consistent pane identities,
and a matching durable binding when one exists. A named Orchestrator outside
that set, a moved bound terminal, or any unsafe same-label candidate makes the
preflight fail without closing a workspace. An occupied target must contain at
most one matching configured Orchestrator Agent. An unowned legacy pane must
have only an available foreground shell in the Core cwd. Hanchou also scans the
OS process table and accepts the legacy pane only when it observes no additional
process sharing the shell TTY or descending from the shell. Thus
`observed_additional=0` means zero processes detected by this best-effort union,
not proof that the workspace has no other process. In particular, Darwin cannot
fully enumerate processes in the same OS process session when they are outside
both relations.

When targets or lifecycle state remain, the plan also prints a 64-character
lowercase-hex token and the exact
`stop-orchestrator <profile> --all --plan <token> --yes` apply command. Copy
that command without constructing or editing its token. The token is a hash
bound to the reviewed profile/session, profile TOML digest, every resolved
profile state path, Core and config roots, lifecycle state, binding, and
validated workspace/pane/Agent/process identities. It is not a secret or an
authentication credential. If that target snapshot changes before apply, the
token mismatch fails closed before any workspace is closed; rerun the plan and
review its new token.

The apply command is accepted only from an ordinary interactive terminal
controlled by the human operator. It is rejected inside a Herdr-managed or
Hanchou-identified Agent and from non-interactive input. These checks, the
snapshot token, and the lack of an Agent allow rule are defense-in-depth against
mistakes and routine automation, not a complete security boundary against code
running as the same OS user. Applying closes every validated target, including
active or blocked Agents. Herdr workspace close terminates every process in the
target PTY's OS process session, including a process that was not visible in
the plan. The apply command is therefore the human's approval of that complete
termination effect. If it cannot be approved, do not apply; inspect and close
individual workspaces through the full Herdr TUI instead. The command preserves
the Herdr server/session, unrelated workspaces, Beads, Relay, Dashboard,
repositories, and worktrees. The durable Orchestrator binding and initialization
marker are cleared only after every target is verified absent.

Hanchou applies Herdr 0.8.2 workspace close one target at a time, so the apply
is not a bulk transaction. Herdr 0.8.2 also has no close operation conditional
on the revalidated identity/revision. Hanchou revalidates each target immediately
before requesting close, but a process can still change in that TOCTOU window.
If a close fails or topology changes mid-run, the error reports `closed`,
`remaining`, and any `uncertain` workspace IDs. Do not
infer the outcome of an uncertain close. Fix the reported condition, rerun
`stop-orchestrator <profile> --all`, review the current target set, and apply
its new exact token command. The old token must not be reused after any partial
close. After a complete stop, `start-orchestrator <profile>` creates one new
dedicated workspace. Planning an already stopped profile is a no-op and needs
no apply. The full Herdr TUI cleanup flow remains the fallback when Hanchou
cannot validate a candidate safely.

`open orchestrator` focuses the bound Orchestrator and opens the ordinary full
Herdr client. It does not use the single-owner `agent attach` surface. Full
Herdr clients may coexist; a direct `agent attach`/`terminal attach` and a
Herdrm attach to the same pane may not. Detach a direct view with `Ctrl+B`, then
`q` before another direct client takes ownership.

`dashboard serve` is normally owned by the LaunchAgent. It binds only to the
configured literal loopback address and exposes GET-only `/`, `/health`, and
`/api/status`. It has no state-changing action API. `dashboard snapshot` emits
the same status model as JSON for diagnostics.

### Usage snapshot and routing

```bash
hanchou usage set codex --weekly-remaining 40 --source manual
hanchou usage set claude --weekly-remaining 70 --source manual
hanchou usage show --json

hanchou route resolve \
  --role implementer \
  --task-kind code \
  --json
```

`hanchou usage recommend` is retained only as a compatibility alias in the
scaffold. New Skills and documentation use `hanchou route resolve`.

### Project authorization

```bash
hanchou project list --json
hanchou project show <project-or-root-id> --json
hanchou project resolve --path /absolute/git/top-level --json
hanchou project doctor [<project-or-root-id>] --json
```

These commands only inspect the fixed, human-owned machine-local registry at
`~/.config/hanchou/<profile>/projects.local.toml`. There is intentionally no
Agent-callable arbitrary command to add a repository or broaden a workspace
root. Exact repository entries are the least-authority option; a human may use
the interactive, fixed-path `hanchou onboard` flow to opt into one
`descendant-git-repositories` root containing only Agent-safe repositories.
See `PROJECT_WORKSPACES.md`.

### Relay Inbox

```bash
hanchou relay emit --type completed ... --json
hanchou relay dispatch
hanchou relay recover

hanchou inbox list --json
hanchou inbox claim --to orchestrator --json
hanchou inbox show <event-id>
hanchou inbox ack <event-id> --by orchestrator --json
hanchou inbox retry <event-id>
hanchou inbox dead-letter <event-id> --reason ...
```

### Delivery

```bash
hanchou delivery create --kind task_terminal ... --json
hanchou delivery list --json
hanchou delivery show <delivery-id>
hanchou delivery mark-rendered <id> --by orchestrator --message-file report.md
hanchou delivery mark-delivered <id> --adapter local-session
hanchou delivery fail <id> --reason ...
hanchou delivery retry <id>
```

### Execution bridge

```bash
hanchou execution dispatch <bead-id> --json
hanchou execution inspect <bead-id> --json
hanchou execution reconcile [<bead-id>] --json
```

`dispatch` currently accepts a dependency-ready Leaf Bead with valid
`hanchou.task.v1` metadata and a clean Git top-level `repo_path`. Before any WAL,
claim, Git command, or Herdr worktree side effect, it re-resolves the
human-owned registry and requires the Bead project identity, canonical path,
and profile to match. It claims the
Bead, resolves the provider and model, creates a dedicated Herdr worktree,
starts the worker, prompts it when ready, and persists a write-ahead execution
record. First-run trust can return `awaiting_ready` without sending the task;
after trust is accepted, `reconcile` sends that prompt once. `inspect` combines Beads, execution,
Herdr, Relay, and Delivery state. `reconcile` repairs safe binding transitions
but never treats an idle/done Agent as semantic task completion. Settlement
requires an acknowledged Relay event bound by execution ID, Agent, and role,
the recorded owner route and depth, plus the assigned report, verification
evidence, and matching worktree commit. A required delivered Delivery must
reference that same terminal event.
Execution updates merge only Hanchou-owned metadata fields and reject a
different non-empty execution owner or changes to the dispatch identity fields.

## Direct upstream examples

### Beads

```bash
bd ready --json
bd show <bead-id> --json
bd update <bead-id> --claim --json
bd dep add <task> <blocker>
bd close <bead-id> --reason '<verified outcome>' --json
```

### Herdr

```bash
herdr --session work agent list
herdr --session work agent get <agent-name>
herdr --session work agent read <agent-name> --source recent-unwrapped --lines 120
herdr --session work worktree create --workspace <workspace-id> --branch <branch>
```

### herdr-automations

```bash
herdr-automations list
herdr-automations run <name>
herdr-automations history <name>
```

## Planned Hanchou commands

These are architecture contracts and must not be assumed available until they
appear in `hanchou --help`.

```text
hanchou execution cancel <bead-id>

hanchou schedule create/list/show/update/pause/resume/run-now/remove/history/validate
```

Only `hanchou execution cancel` remains planned; dispatch, inspect, and
reconcile are implemented. `hanchou execution` does not replace ordinary Beads
or Herdr commands. `hanchou schedule` exists only for
Hanchou reporting metadata, Task binding, and the `existing-orchestrator`
target; ordinary fresh-agent Cron remains upstream-owned.
