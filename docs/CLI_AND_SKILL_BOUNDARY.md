# CLI and Skill boundary

## Decision

Hanchou keeps a **thin CLI** and a matching shared Skill. The CLI is necessary,
but it is not a replacement command surface for Beads, Herdr, or
herdr-automations.

```text
Skill
  = when and why to use each operation

CLI
  = deterministic mechanics and validation

Upstream tools
  = their own source-of-truth operations
```

## Why a CLI is necessary

A Skill can tell an Agent what policy to follow, but it cannot itself guarantee:

- atomic file replacement;
- JSON Schema validation;
- stable exit codes and machine-readable output;
- lease, retry, dedupe and dead-letter behavior;
- one implementation shared by Codex, Claude Code, humans and Herdr plugins;
- cross-system ordering such as `Bead → Herdr binding → Relay receipt`;
- idempotent setup, backup and recovery.

These guarantees belong in executable code. Therefore the CLI remains a Core
component.

## What Hanchou CLI owns

### Implemented

- fixed-path human onboarding plus profile plan/apply/doctor/status/launch/open;
- loopback-only read-only cross-system status Dashboard;
- human-owned project authorization inspection and dispatch enforcement;
- Orchestrator startup and generated Agent definitions;
- provider usage snapshots and routing resolution;
- Relay Inbox emit/claim/ack/retry/recovery;
- Delivery create/render/deliver/fail/retry;
- `hanchou execution` dispatch/inspect/reconcile for Beads↔Herdr binding;
- cross-repository setup and Skill installation.

### Planned

- `hanchou execution cancel` and automatic orphan rediscovery;
- `hanchou schedule`: typed Hanchou reporting contract and
  `existing-orchestrator` schedules.

## What Hanchou CLI does not own

| State or action | Use directly |
|---|---|
| Task/Epic/Decision CRUD, dependencies, ready queue | `bd` |
| Agent/pane/workspace/worktree/status | `herdr` |
| Ordinary fresh-agent cron, run-now and history | `herdr-automations` |
| Task GUI | `beads-ui` / optional `herdr-beads` |

A generic `hanchou task list` or `hanchou agent read` facade is intentionally not
created. Duplicating upstream commands would increase ambiguity and version
coupling without adding guarantees.

## Command selection algorithm

1. Identify the source of truth being changed.
2. If one upstream system owns the operation, use its CLI directly.
3. If the operation changes Hanchou-owned state or spans two systems, use the
   Hanchou CLI.
4. Prefer `--json` for Agent/script use.
5. Parse returned IDs; never infer IDs from labels, pane order or prose.
6. Check `hanchou --help` before using a planned command.

## Skill layout

`hanchou-cli` is installed for both Codex and Claude Code. Role-specific Skills
add policy but do not redefine commands.

```text
hanchou-cli          command ownership and implemented/planned surfaces
hanchou-orchestrator L0 response/delegation contract
hanchou-task         Beads model and closure policy
hanchou-schedule     schedule/reporting policy
hanchou-relay        internal durable event handling
hanchou-reporting    user-facing Delivery policy
hanchou-worker       bounded execution and terminal event contract
```

The Orchestrator Role includes `hanchou-cli` explicitly. Worker Roles receive
only the Skills needed for their bounded operation.

## Examples

### List ready work

```bash
bd ready --json
```

Not:

```text
hanchou task ready
```

### Inspect a worker

```bash
herdr agent get hch-abc-implementer
herdr agent read hch-abc-implementer --source recent-unwrapped --lines 120
```

### Resolve a provider/model

```bash
hanchou route resolve \
  --role implementer \
  --task-kind code \
  --json
```

### Resolve a target repository

```bash
hanchou project resolve --path /absolute/git/top-level --json
```

The registry is human-owned and deny-by-default. Agents may inspect it but no
Hanchou command exposed to them can broaden it. A human may separately run the
fixed-path, plan-first `hanchou onboard <profile> --yes` flow from an ordinary
interactive terminal.

### Record a worker completion

```bash
hanchou relay emit ... --json
```

### Dispatch a delegated Bead

```bash
hanchou execution dispatch <child-bead-id> --json
hanchou execution inspect <child-bead-id> --json
```

Create and populate the Bead first. The execution command owns only the claim,
route, worktree, Agent binding, worker prompt, and reconciliation transaction.

### Create an ordinary recurring fresh-agent task

Use `herdr-automations` directly. The future `hanchou schedule` wrapper is used
only when Hanchou reporting metadata, Task binding, or the same-Orchestrator
wake is required.
