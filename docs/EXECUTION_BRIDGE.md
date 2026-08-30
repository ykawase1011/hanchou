# Beads ↔ Herdr execution bridge

## Goal

Bind one Bead execution to one visible Herdr Agent without making Herdr IDs the
business identity.

```text
Bead ID → execution ID → Herdr session/workspace/pane/agent/provider-session
```

## Dispatch transaction

1. Resolve Bead and verify ready/authority.
2. Resolve provider/model from role and usage snapshot.
3. Atomically claim/start the Bead.
4. Create/open Herdr worktree workspace.
5. Start named Agent with role/environment.
6. Persist binding metadata.
7. Prompt the Agent with task ID, acceptance criteria, artifact contract, Relay
   route, and reporting prohibition.
8. Return control to L0; do not wait in the human-facing turn.

On failure, release or mark the binding and keep the Bead recoverable.

## Completion transaction

1. Worker writes artifact and verification evidence.
2. Worker emits Relay event.
3. Owner claims event and inspects artifact.
4. Owner updates/blocks/closes Bead.
5. Root owner creates or publishes Delivery according to reporting policy.
6. Owner acknowledges Relay event.
7. Binding moves to settled/released.

## Recovery

At startup, reconcile:

- live Agent without Bead binding;
- active Bead with missing Agent;
- terminal Herdr state without Relay event;
- completed Bead with pending Delivery;
- expired Inbox lease;
- stale worktree and provider session.

Fail toward visible `lost/blocked` state; never silently close work.
