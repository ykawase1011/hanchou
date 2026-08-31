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
Hanchou loopback read-only status Dashboard
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
2. Run `mise install`, review `hanchou onboard work` and `hanchou plan work`,
   then bootstrap a clean work profile on a test HOME or target Mac.
3. Verify the Herdr, beads-ui, and Dashboard LaunchAgents, then start the Codex
   Orchestrator with `hanchou launch work`.
4. Implement/verify Beads↔Herdr dispatch command.
5. Complete one Leaf task and prove later-turn Relay response.
6. Prove Relay lease recovery and pending Delivery visibility.
7. Implement daily digest schedule only after the completion loop passes.

## Current target-Mac handoff

Orchestrator duplicate prevention and multi-client-safe opening are implemented
and fake-E2E tested. After updating the target checkout, run
`hanchou start-orchestrator work` once. A rigorously matched live legacy Agent
is bound in place; ambiguous empty legacy spaces do not cause another create.
Open `hanchou open herdr work`, keep the row containing the live named
`orchestrator`, and let the human close only verified empty duplicate rows with
`Ctrl+B` then `Shift+D`. `hanchou open orchestrator work` now focuses the target
and opens the full Herdr client instead of exclusive direct attach.

If the human confirms that every same-label Orchestrator workspace may be
terminated, use `hanchou stop-orchestrator work --all` to review the exact IDs,
then copy the exact `--all --plan <64hex-token> --yes` command printed by that
plan into the ordinary interactive terminal. The token is bound to the reviewed
target snapshot. Any relevant state change, including a partial close, requires
a fresh plan and token; never retry the old token. The command validates every
target before the first close and revalidates each target, but Herdr 0.8.2 has
no conditional close, so a short revalidate-to-close TOCTOU window remains.
On Darwin, the legacy check's same-TTY/shell-descendant scan does not enumerate
every same-session process. Apply is human approval to terminate the target
PTY/process session; use manual TUI cleanup if that cannot be approved. Start
one clean L0 with `hanchou start-orchestrator work` afterward. TTY/Agent checks
and the token are defense-in-depth, not a complete same-user security boundary.

The Core goal remains open until that live Agent answers the initial status
query using both Beads and Herdr and explicitly reports zero for empty active,
blocked, and delegated-task results.

## Do not change without explicit decision

- no second Task/Cron/runtime;
- no permanent three-layer workflow;
- no direct L2→L0 in mission mode;
- no secrets in hanchou-kingdom;
- no Chat library selection before Core E2E.
