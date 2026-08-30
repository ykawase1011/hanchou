# Architecture

## Component ownership

| Component | Owns | Does not own |
|---|---|---|
| Herdr | PTY、Workspace、Worktree、Agent lifecycle、API | Task semantics、Cron、user report |
| Beads | Task graph、Decision、dependency、ready、closure | live process、Chat |
| herdr-automations | cron entry、run history、fresh Agent execution | Task graph、same-session completion report |
| Hanchou Relay | Inbox event、wake、Delivery lifecycle、receipt | PTY、Task DB、Chat SDK |
| Hanchou | Role、routing、bridge、configuration、operations | replacement runtime/DB/scheduler |
| hanchou-chat | future Slack/Discord ingress/egress | Task、Cron、Orchestrator ownership |

## Runtime topology

```text
Herdr session: work/personal
├─ 00-orchestrator
│  └─ Codex Sol `orchestrator`
├─ project source workspaces
│  └─ Herdr-managed worktree workers
├─ optional Mission Lead workspaces
├─ herdr-beads board
└─ herdr-automations board
```

## Turn lifecycle

```text
Human request
→ L0 immediate answer or Bead/delegation acknowledgement
→ L0 turn ends
→ Worker emits Relay event
→ Dispatcher waits for safe L0 state
→ same Orchestrator session receives a new internal turn
→ Beads verification + Delivery
→ user-facing response
```

A long-running L0 wait loop is prohibited.

## Restart model

- Herdr restores session shape and supported provider sessions.
- Beads restores Task truth.
- Relay recovers expired Inbox leases and pending Deliveries.
- Plugin startup runs one idempotent Relay dispatch.
- If the provider context cannot resume, the replacement L0 reconstructs from
  Beads, Relay, Automation history, and artifacts.
