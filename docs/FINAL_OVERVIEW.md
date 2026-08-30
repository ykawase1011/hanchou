# Hanchou final overview

## Product shape

```text
hanchou
  Core policy, Role definitions, thin CLI, Relay, Delivery, bridge contracts

hanchou-skills
  Public cross-PC Skills for Codex and Claude Code

hanchou-kingdom
  Secret-free work/personal deployment and reproducible environment config

hanchou-chat（future）
  Optional Slack/Discord ingress and Delivery adapters
```

## Runtime architecture

```text
Human / future Chat
        │
        ▼
Codex Sol Orchestrator in Herdr
        │
        ├─ Beads: Task / Decision / dependency
        ├─ Herdr: Agent / PTY / workspace / worktree
        ├─ herdr-automations: recurring schedule
        └─ Hanchou Relay
             ├─ Inbox: internal durable events
             └─ Delivery: user-facing reports
```

## Response lifecycle

1. Orchestrator replies immediately with an answer, Task acknowledgement, or one
   blocking question.
2. Delegated work runs in visible Herdr Agents; L0 does not remain busy waiting.
3. Completion/failure/decision is saved to Relay Inbox.
4. Dispatcher starts a later turn in the same logical Orchestrator session.
5. L0 verifies Beads and artifacts, then creates/publishes a Delivery.
6. Local users receive the response in the Orchestrator pane; future Chat
   adapters publish the same rendered Delivery to the configured channel/thread.

## Model defaults

```text
L0  Codex Sol
L1  Claude Opus / Codex Sol, usage-aware
L2  Claude Sonnet / Codex Terra
Japanese draft/final prose  Codex Writer / Editor
```

## CLI decision

The Hanchou CLI remains because Skills cannot enforce mechanical guarantees.
It stays thin:

```text
bd                  Task graph
herdr               runtime
herdr-automations   ordinary fresh-agent Cron
hanchou             setup, routing, Relay, Delivery, cross-system operations
```

`hanchou-cli` is the shared Skill that teaches this boundary to both providers.

## Current implementation boundary

Implemented in the scaffold:

- configuration/apply/doctor/status/open;
- provider-neutral Role generation;
- usage snapshot/routing;
- Relay Inbox and Delivery state machines;
- Skills and secret-free deployment configuration;
- schemas, examples and static tests.

Required before operational replacement:

- live Beads↔Herdr `hanchou execution` bridge;
- restart reconciliation;
- typed Hanchou schedule wrapper and same-Orchestrator wake;
- full Core E2E on the target Mac;
- only then `hanchou-chat` selection and implementation.
