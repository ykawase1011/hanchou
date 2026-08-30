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
the Dashboard. `--herdrm` also attempts the optional native app, but inability
to prove that Herdrm's default socket matches the Hanchou named-session socket
is reported as a warning and never starts a second Herdr session.

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
