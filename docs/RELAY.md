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

```bash
hanchou relay emit ...
hanchou inbox claim --to orchestrator --json
hanchou inbox show <event-id>
hanchou inbox ack <event-id> --by orchestrator
hanchou inbox retry <event-id>
```

## Dispatcher

Herdr plugin hooks run `hanchou relay dispatch` after session restore and on
`pane.agent_status_changed`. It nudges only `idle/done` targets. `working`
remains pending; `blocked` remains pending and may generate a local Herdr
notification. The nudge contains no result payload—only a request to drain the
Inbox.

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
