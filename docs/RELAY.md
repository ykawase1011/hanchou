# Hanchou Relay

## Naming

`mailbox` is a legitimate Actor-model term, but Hanchou handles more than a
per-process queue. The official component name is **Hanchou Relay**.

```text
Relay
├─ Inbox       internal durable events
├─ Dispatcher  Herdr-aware wake and retry
├─ Delivery    user-facing reports/messages
└─ Receipts    processing and delivery acknowledgements
```

## Inbox lifecycle

```text
pending → processing → acknowledged
                    ↘ dead-letter
```

Producer writes the event atomically before any Herdr nudge. Claim adds a lease.
Expired processing records return to pending. Acknowledgement occurs only after
Beads、Decision、or Delivery state is durably updated.

Event, Delivery, and Agent identifiers are restricted to safe path components;
records must be regular non-symlink JSON files whose filename matches the ID in
the record. Inbox state transitions share one lock. `ack` accepts only a
currently leased `processing` event and requires
`event.to_agent == lease.claimed_by == actor`; an expired lease must first be
recovered and claimed again. Managed Codex sessions also bind claim/ack to their
injected `HANCHOU_AGENT_ID`; claim/ack fail closed when that managed identity is
absent. A manual recovery from an ordinary shell therefore requires an explicit
identity and remains subject to normal command approval.
Relay emission is bound the same way: `--from-agent` must equal the managed
Agent identity, so one Agent cannot forge another Agent's terminal evidence.

```bash
hanchou relay emit --task <bead-id> --execution <execution-id> ...
hanchou inbox claim --to orchestrator --json
hanchou inbox show <event-id>
hanchou inbox ack <event-id> --by orchestrator
hanchou inbox retry <event-id>
```

The project-local Codex policy auto-allows the routine
`list/show/claim/ack` commands. `retry` and `dead-letter` require an operator
prompt. It never allows the whole `hanchou inbox` prefix.

Delivery mutations use a separate shared transition lock so duplicate creates
and competing render/deliver/fail/retry operations cannot commit concurrently.
Acknowledgement, dead-letter, and delivery-completion replays repair missing
terminal journal evidence; acknowledgement and delivery also repair their
receipts. Existing receipts must match the terminal record exactly, terminal
journal entries are appended at most once per transition, and state moves fsync
both directories. Claim/recovery finalizes a dead-letter or other terminal
record left in its source directory by an interrupted move instead of returning
it to normal processing. Versioned terminal journal rows require exact
evidence; legacy v2.3.1 rows retain compatibility when their stable fields match
and only the independently generated timestamp differs.

Inbox retry and expired-lease recovery also store versioned transition evidence
before moving a record. Recovery replays that evidence without incrementing
`retry_count` or `recovery_count` twice, and journals each counted transition
exactly once. Retry evidence takes precedence over the older dead-letter marker
it is intentionally replacing; contradictory acknowledgement/retry evidence
fails closed.

Delivery enumeration reconciles all state directories under that same lock
before returning actionable records. The embedded `status` selects recovery:
an interrupted render, failure, delivery, or retry is completed from its stored
evidence instead of being exposed under the source directory. Render, failure,
and retry journal rows are versioned and keyed by attempt. A never-failed
pending Delivery cannot be retried, and failed work becomes pending only through
an explicit, crash-repairable retry transition.

`--execution` binds an execution-bridge event to one dispatch attempt. Before a
closed Bead can settle, reconciliation requires an acknowledged terminal event
whose Task ID, execution ID, producer Agent/role, owner Agent/role, and
delegation depth match the execution record. It also verifies the assigned
report path, non-empty verification, and for successful completion the reported
commit against worktree `HEAD`. When policy requires Delivery, the delivered
record must be unique and name that same terminal event as `source_event_id`.
Its `task_terminal` kind, policy, renderer, and destination must also match the
Task reporting contract.

## Dispatcher

Herdr plugin hooks run `hanchou relay dispatch` after session restore and on
`pane.agent_status_changed`. It nudges only `idle/done` targets. `working`
remains pending; `blocked` remains pending and may generate a local Herdr
notification. The nudge contains no result payload—only a request to drain the
Inbox. It includes the target explicitly in both claim and acknowledgement
commands, including for non-L0 recipients.

## Routing

- depth-1 Leaf → Orchestrator;
- depth-2 Leaf → Mission Lead;
- Mission Lead → Orchestrator;
- Scheduler / future Gateway / Relay → Orchestrator;
- L2 → L0 is rejected for depth-2 missions.

## Context protection

Raw transcript、large logs、and secrets are forbidden. Send bounded summary plus
`detail_ref` / artifact references. Nearby noncritical events may be coalesced
into one Orchestrator turn; decisions and critical failures are immediate.
