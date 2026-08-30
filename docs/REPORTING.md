# Reporting and Delivery

## Purpose

Task completion and user notification are separate state transitions. A Task may
be complete while its report is still pending. Delivery makes that state visible
and retryable.

```text
pending → rendered → delivered
       ↘ failed → pending
```

## Policies

| Policy | Behavior |
|---|---|
| `silent` | no user output |
| `parent_only` | notify parent owner only |
| `on_failure` | report failure only |
| `on_change` | report meaningful change only |
| `on_terminal` | report completed/failed/cancelled/needs-decision |
| `always` | report every run |
| `digest` | aggregate until a digest window |
| `immediate` | no coalescing; decisions/critical alerts |

## Renderer

- `orchestrator`: contextual report in the same L0 conversation.
- `editor`: Codex final prose review before publishing.
- `producer`: use an already-structured producer artifact.

## Destination

- `local_session`: same Herdr Orchestrator pane.
- `origin`: the route that created the root Task.
- future Slack/Discord channel or thread alias.
- `file`: durable report only.

## Default matrix

| Work | Policy | Renderer | Destination |
|---|---|---|---|
| root user Task | `on_terminal` | orchestrator | origin |
| child Task | `parent_only` | producer | parent |
| Decision | `immediate` | orchestrator | origin |
| routine maintenance | `on_failure` | producer/orchestrator | configured |
| monitor | `on_change` | orchestrator | configured |
| daily digest | `always` | orchestrator | local_session/channel |

## Daily digest

A daily digest reads only bounded control-plane data:

- Beads completed/in-progress/blocked/ready;
- current Herdr agents;
- unresolved Decisions;
- Automation run history and misses;
- provider usage snapshot.

It does not perform new project research. Suggested structure:

```text
完了 / 進行中 / 判断待ち / 定期実行 / usage・注意事項
```

## CLI

```bash
hanchou delivery create ...
hanchou delivery list --json
hanchou delivery mark-rendered <id> --by orchestrator --message-file report.md
hanchou delivery mark-delivered <id> --adapter local-session
hanchou delivery fail <id> --reason ...
hanchou delivery retry <id>
```

Future `hanchou-chat` consumes rendered external Deliveries and records external
message IDs in delivery receipts.
