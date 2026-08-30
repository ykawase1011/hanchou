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
hanchou bootstrap [work|personal]
hanchou plan work
hanchou apply work --yes [--install-upstream]
hanchou doctor work
hanchou status work [--json]
hanchou start-orchestrator work
hanchou open tasks work
hanchou open herdr work
hanchou open orchestrator work
hanchou open automations work
hanchou render-agents [--check]
hanchou handoff
```

`bootstrap` runs `mise install` from the Core repository and then performs the
full idempotent apply. Use `plan` first to review user configuration files that
may be backed up and replaced.

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
hanchou execution dispatch <bead-id>
hanchou execution inspect <bead-id>
hanchou execution cancel <bead-id>
hanchou execution reconcile [<bead-id>]

hanchou schedule create/list/show/update/pause/resume/run-now/remove/history/validate
```

`hanchou execution` exists only for atomic Beads↔Herdr operations. It does not
replace ordinary Beads or Herdr commands. `hanchou schedule` exists only for
Hanchou reporting metadata, Task binding, and the `existing-orchestrator`
target; ordinary fresh-agent Cron remains upstream-owned.
