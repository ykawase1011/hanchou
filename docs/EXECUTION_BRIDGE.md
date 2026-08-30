# Beads ↔ Herdr execution bridge

## Implemented command surface

```bash
hanchou execution dispatch <bead-id> --json
hanchou execution inspect <bead-id> --json
hanchou execution reconcile [<bead-id>] --json
```

Dispatch uses a per-Bead lock and writes
`<control_dir>/executions/<bead-id>-<digest>.json` before cross-system side
effects. Failures remain visible as `attention_required` plus a blocked/lost
binding; existing worktrees and Agents are not destructively removed.

Each worktree is created from the validated repository `HEAD` recorded as the
execution's base commit. Worker prompts are redacted from command failures and
the write scope is limited to the assigned worktree, durable report directory,
Relay state, and the Herdr session socket. Beads is not worker-writable through
an added directory.

Before validation runs Git or creates the write-ahead record, dispatch resolves
the Bead's `project`, canonical `repo_path`, and profile against the fixed
effective-user registry at
`~/.config/hanchou/<profile>/projects.local.toml`. Missing or invalid authority
is deny-all. The execution record stores the registry path/digest and matched
exact project or workspace root. An Agent cannot supply authority through Bead
metadata, `HOME`, or `--config-root`. An `awaiting_ready` execution is
re-authorized before its first prompt.

The bridge owns only the top-level Bead metadata fields `execution_id`,
`routing`, and `herdr`; it supplies `reporting` only when no policy exists.
Every update reloads the latest metadata and sends a partial top-level merge, so
project, automation, ownership, and other external fields are preserved. A
different non-empty execution ID fails closed as an ownership conflict. While
an execution is active, profile, project, repository, execution mode, owner,
and role are immutable dispatch identity; reconciliation reports changes
instead of silently retargeting the worker.

The current dispatcher is deliberately Leaf-only and rejects Beads with active
blocking dependencies. Mission Lead dispatch requires a separate child-graph
ownership contract and remains future work.

Cancellation, automatic redispatch, and orphan discovery when Herdr loses the
creation response are not yet implemented.

Relay currently keeps its journal at the Relay root. Workers therefore need
that root as an added write directory to emit events, which also makes Delivery
subdirectories reachable to the provider sandbox. The worker contract forbids
Delivery writes, but a narrower filesystem-enforced Relay producer boundary is
still future hardening.

## Goal

Bind one Bead execution to one visible Herdr Agent without making Herdr IDs the
business identity.

```text
Bead ID → execution ID → Herdr session/workspace/pane/agent/provider-session
```

## Dispatch transaction

1. Resolve Bead and verify ready plus human-owned project authority.
2. Resolve provider/model from role and usage snapshot.
3. Atomically claim/start the Bead.
4. Create/open Herdr worktree workspace.
5. Start named Agent with role/environment.
6. Persist binding metadata.
7. If first-run trust leaves the Agent blocked, return `awaiting_ready`; after
   trust is accepted, reconciliation resumes this same execution.
8. Prompt the ready Agent exactly once with task ID, acceptance criteria,
   artifact contract, Relay route, and reporting prohibition.
9. Return control to L0; do not wait in the human-facing turn.

On failure, release or mark the binding and keep the Bead recoverable.

## Completion transaction

1. Worker writes artifact and verification evidence.
2. Worker emits an execution-bound Relay event.
3. Owner claims event and inspects artifact.
4. Owner updates/blocks/closes Bead.
5. Root owner creates or publishes Delivery according to reporting policy.
6. Owner acknowledges Relay event.
7. Binding moves to settled/released.

Reconciliation settles only on an acknowledged event matching the Task ID,
execution ID, producer Agent/role, owner Agent/role, and delegation depth. The
event's report must exist at the assigned path, verification must be non-empty,
and a successful event's single commit artifact must resolve to the assigned
worktree's current `HEAD`. If policy requires Delivery, its delivered record
must be unique and reference that same terminal event as `source_event_id`.
Its task-terminal kind, policy, renderer, and destination must match the Bead's
reporting metadata.

Researcher and reviewer executions do not create project changes or empty
commits; their completed event uses the unchanged worktree `HEAD` as provenance
for the external durable report.

## Current recovery

`hanchou execution reconcile [<bead-id>]` walks persisted execution records and
currently handles:

- a pending/lost binding whose named Agent is live;
- an active bound Bead whose named Agent is missing;
- an `awaiting_ready` Agent after first-run trust;
- terminal Herdr state without Relay event;
- a closed Bead lacking valid execution evidence or its required Delivery;
- expired Inbox leases through Relay recovery.

Fail toward visible `lost/blocked` state; never silently close work.

Automatic startup execution reconciliation, discovery of live Agents without a
WAL record, stale worktree/provider-session repair, explicit reporting of a
corrupt WAL file, and continue-on-error behavior for a multi-record reconcile
remain future work.
