---
name: hanchou-relay
description: Use Hanchou Relay for durable typed events, Inbox acknowledgement, retries, and user-facing Delivery records across the orchestrator, mission leads, workers, schedules, and future chat adapters.
---

# Hanchou Relay

These records are Hanchou-owned, so use the Hanchou CLI rather than editing
state files directly. Prefer `--json` and retain returned IDs.

Relay has two different records:

- **Inbox event**: internal producer-to-agent communication.
- **Delivery**: a user-facing message or report that must be rendered and delivered.

A Herdr prompt is only a wake hint. The file-backed record is authoritative.

## Emit an Inbox event

```bash
hanchou relay emit \
  --type completed \
  --task <bead-id> \
  --execution <execution-id> \
  --from-agent <agent> --from-role <role> \
  --to-agent <owner> --to-role <owner-role> \
  --delegation-depth <1-or-2> \
  --summary '<bounded summary>' \
  --detail-ref <report-path> \
  --artifact <typed-ref> \
  --verification '<command/result>' \
  --json
```

For an execution-bridge assignment, copy the exact Task ID, execution ID,
Agent, role, owner, report path, and delegation depth from the worker prompt.
A completed event must reference the assigned durable report, include non-empty
verification evidence, and contain exactly one `commit:<sha>` matching the
assigned worktree's current `HEAD`. Reconciliation rejects events that do not
match that execution binding or its evidence.

Depth-1 leaves report to the Orchestrator. Depth-2 leaves report to their
Mission Lead. Mission Leads report to the Orchestrator. Do not send raw
transcripts or secrets.

## Consume the Inbox

```bash
hanchou inbox claim --to <agent> --json
hanchou inbox show <event-id>
# Apply Beads, Decision, or Delivery changes first.
hanchou inbox ack <event-id> --by <agent>
```

Never acknowledge before the durable resulting action succeeds.

## Create a user-facing Delivery

```bash
hanchou delivery create \
  --kind task_terminal \
  --task <bead-id> \
  --source-event <event-id> \
  --policy on_terminal \
  --renderer orchestrator \
  --destination '{"type":"origin"}' \
  --summary 'Task completed and requires a final report.' \
  --json
```

For local Herdr, the Orchestrator may answer directly in the same session and
record the Delivery as delivered. Future `hanchou-chat` adapters consume
rendered Deliveries and mark them delivered with the external message ID.
