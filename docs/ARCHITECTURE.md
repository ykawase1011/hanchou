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
- Hanchou records one exact Orchestrator workspace/tab/pane/terminal binding per
  profile before Agent startup and serializes create/reuse against that record.
- A missing Agent name never authorizes a second Orchestrator workspace when a
  recorded or legacy candidate remains; ambiguous legacy state fails closed.
- Destructive reset is a separate, human-confirmed, plan-first command. The
  read-only plan emits an exact apply command with a 64-character lowercase-hex
  token bound to the reviewed target snapshot. A state change or partial close
  requires a new plan/token. Apply closes only the fully validated dedicated
  Orchestrator workspace set, preserves all other control-plane/project state,
  and clears the binding only after every selected workspace is confirmed
  absent. Legacy-shell process screening is a best-effort union of same-TTY and
  shell-descendant records; on Darwin it cannot enumerate every process in the
  same OS process session. Herdr 0.8.2 has no conditional workspace close, so
  final revalidation narrows but cannot eliminate the revalidate-to-close
  TOCTOU window. Apply is the human's approval to terminate the complete target
  PTY/process session; otherwise the full Herdr TUI is the fallback. TTY,
  managed-Agent, token, and command-policy checks are
  defense-in-depth rather than a complete same-user security boundary.
- Beads restores Task truth.
- Relay recovers expired Inbox leases and pending Deliveries.
- Plugin startup runs one idempotent Relay dispatch.
- If the provider context cannot resume, the replacement L0 reconstructs from
  Beads, Relay, Automation history, and artifacts.
