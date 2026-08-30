# Session handoff — Hanchou Core implementation

## Goal

Implement and live-test the Core only. Do not select or build Slack/Discord yet.

## Read in order

1. `HANCHOU_SPEC.md`
2. `docs/DECISIONS.md`
3. `docs/PLANNING.md`
4. `docs/CORE_E2E_TEST_PLAN.md`
5. `docs/RELAY.md`
6. `docs/REPORTING.md`
7. `docs/EXECUTION_BRIDGE.md`
8. `docs/CLI_AND_SKILL_BOUNDARY.md`

## Fixed architecture

```text
Herdr runtime
mise-managed Herdr 0.8.2 / Node.js 22
Beads Task source
beads-ui standard GUI
herdr-beads optional Herdr board
herdr-automations Cron source
Codex Sol L0
Relay Inbox + Delivery
```

## Critical behavior

- L0 replies immediately and never waits for long worker execution.
- Worker completion starts a later turn in the same logical Orchestrator session.
- Beads is updated before Inbox ack.
- Root Task reporting policy decides whether a Delivery is required.
- Daily digest is bounded control-plane work.
- L2 defaults to Terra/Sonnet; Japanese draft/final review stays Codex.
- Use upstream CLIs directly for single-system operations; use `hanchou` only for
  Hanchou-owned or cross-system mechanics.

## First implementation tasks

1. Run `make check`.
2. Run `mise install`, inspect `hanchou plan work`, then bootstrap a clean work
   profile on a test HOME or target Mac.
3. Start Herdr, beads-ui, and Codex Orchestrator.
4. Implement/verify Beads↔Herdr dispatch command.
5. Complete one Leaf task and prove later-turn Relay response.
6. Prove Relay lease recovery and pending Delivery visibility.
7. Implement daily digest schedule only after the completion loop passes.

## Do not change without explicit decision

- no second Task/Cron/runtime;
- no permanent three-layer workflow;
- no direct L2→L0 in mission mode;
- no secrets in hanchou-kingdom;
- no Chat library selection before Core E2E.
