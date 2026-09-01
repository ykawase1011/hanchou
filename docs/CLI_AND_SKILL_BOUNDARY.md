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

- `hanchou init <profile>` prepare plus exact-token apply for the fixed
  profile-local launcher, managed sibling Core/Public Skills checkouts, and an
  immediately registered repository shelf through bounded onboarding;
- local `hanchou update` and `hanchou rollback` exact-pair plan/apply,
  bootstrap/doctor activation, explicit L0 instruction reload, and
  previous-pair recovery;
- fixed-path human onboarding plus profile plan/apply/doctor/status/launch/open;
- loopback-only read-only cross-system status Dashboard;
- human-owned project authorization inspection and dispatch enforcement;
- Orchestrator startup, explicit human-confirmed plan/token/apply shutdown, and
  generated Agent definitions;
- provider usage snapshots and routing resolution;
- Relay Inbox emit/claim/ack/retry/recovery;
- Delivery create/render/deliver/fail/retry;
- `hanchou execution` dispatch/inspect/reconcile for Beads↔Herdr binding;
- cross-repository setup and Skill installation.

### Planned

- `hanchou execution cancel` and automatic orphan rediscovery;
- `hanchou schedule`: typed Hanchou reporting contract and
  `existing-orchestrator` schedules.

The instance commands are implemented in v2.4.0. Core and Skills use only the fixed official public
HTTPS remotes at `refs/heads/main`, are clean detached independent commits, and
are validated/activated/rolled back as one pair. They are Hanchou-owned
cross-repository mechanics, not a facade over ordinary Git. There is no
automatic latest updater. Bare init leaves no deployed instance; only its
ordinary-TTY exact-token apply creates the topology and authority. `onboard`
remains separately callable for that same fixed shelf.

Prepare for `init`, `update`, and `rollback` can execute candidate mise/npm/make
code, so each surface is restricted to an ordinary interactive human terminal
outside a managed Agent. It is not categorized with Agent-safe read-only
inspection.

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
./bin/hanchou project resolve --path /absolute/git/top-level --json
```

The registry is human-owned and deny-by-default. Agents may inspect it but no
Hanchou command exposed to them can broaden it. A human may separately run the
fixed-path, plan-first `hanchou onboard <profile> --yes` flow from an ordinary
interactive terminal.

Destructive Orchestrator reset uses a separate human-confirmation interlock:

```text
./bin/hanchou stop-orchestrator --all
<exact-profile-local-launcher> stop-orchestrator --all --plan <64hex-token> --yes
./bin/hanchou stop-orchestrator --all --include-unmanaged
<exact-profile-local-launcher> stop-orchestrator --all --include-unmanaged --plan <64hex-token> --yes
```

The first command is a read-only plan. It prints the exact second command with a
64-character lowercase-hex token bound to the reviewed profile TOML digest,
resolved state paths, approved workspace-root list, lifecycle
binding, and workspace/pane/Agent/process
snapshot; do not construct the token, replace the printed absolute local
launcher path, or omit either. A seed/development invocation may use the bare
`hanchou` fallback. The plan shows foreground
process `PID:name`, pane-reported `cwd`, and all foreground process
`process_cwds=PID:name@cwd` evidence for each target. For a legacy shell,
`observed_additional=0` means only that the OS process table scan observed no
extra same-TTY or shell-descendant process. It does not prove that every process
is absent. Agent-occupied targets are not subject to that OS shell scan and report
`observed_additional=n/a`. Darwin cannot fully enumerate same-session processes
outside those two relations. A target-state change or partial close requires a
new plan and token.

`--include-unmanaged` is a human-owned activity override and must never be added
automatically after a default refusal. It overrides only activity checks for an
unbound legacy pane with no authoritative Agent record; label, approved-root
base/current/process cwd,
single-pane/no-worktree shape, IDs, binding, and real-Agent consistency remain
hard containment, so the configured target scope does not expand. The plan
marks overrides `UNMANAGED-ACTIVE`, prints their
process/cwd/reason evidence, treats `observed_additional=n/a` as unknown rather
than zero, and warns that close terminates the whole pane OS session. The
selected mode is token-bound, so its exact apply and retry commands must retain
the flag. Cwd that does not exactly equal one approved root remains a hard
refusal; a descendant path is not sufficient.
Malformed Herdr `pane process-info` is a hard refusal; the overridable
`process_scan_unavailable` reason covers only the later OS process-table scan.
Managed Agents may explain this path but must not apply it.

Herdr 0.8.2 has no identity-conditional workspace close, so the final
revalidation-to-close TOCTOU window remains. Apply is human approval to
terminate every process in the target workspace PTY/OS process session; if that
cannot be approved, use the full Herdr TUI fallback. The apply is intentionally
not Agent-allowlisted. Its TTY, managed-Agent, token, and command-policy checks
are defense-in-depth, not a complete security boundary against other code
running as the same OS user.

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
