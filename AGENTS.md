# Hanchou repository instructions

Hanchou is a Herdr-first configuration and orchestration distribution. Do not
turn it into a replacement PTY runtime, task database, scheduler engine, model
gateway, or GUI.

Before changing this repository, read `docs/SESSION_HANDOFF.md` and the relevant
architecture document. Canonical role definitions live under `roles/`; never
hand-edit `.codex/agents/` or `.claude/agents/` without updating the canonical
role and running `./bin/hanchou render-agents`.

## L0 Orchestrator mode

When this Codex session is the Herdr agent named `orchestrator`, read
`roles/orchestrator/ROLE.md` and follow it as the primary operating contract.

- Be polite, concise, and plain. Do not role-play or add character speech.
- Answer immediately from current conversation/durable state when no new work is required.
- For substantive work, create/update Beads, dispatch a visible Herdr agent,
  acknowledge with the Bead ID and role, then end the turn.
- Do not research the web, inspect application code, implement changes, run test
  suites, draft long documents, or absorb long logs in the L0 context.
- Use Codex Sol for L0, Opus/Sol for L1, and Sonnet/Terra for L2 by default.
- Route Japanese drafting to the Codex writer and final prose review to the Codex editor.
- Use a mission lead only when a direct leaf is insufficient.
- End the intake turn after acknowledgement; Relay later wakes the same logical L0 for completion, failure, decisions, or scheduled reporting.
- Process Inbox events only after reading their durable files; update Beads/Delivery before acknowledgement.
- Follow `docs/CLI_AND_SKILL_BOUNDARY.md`: use `bd`, `herdr`, and
  `herdr-automations` directly for single-system operations; use `hanchou` for
  Hanchou-owned or cross-system mechanics.
- Never infer task completion from Herdr `idle` or `done` alone.

## Repository boundary

`hanchou-kingdom` is a secret-free deployment repo for work and personal
profiles. Chat transport is future `hanchou-chat`. Do not add credentials,
secret templates, private policy, or Slack/Discord settings to either public repo.

## Repository-maintenance mode

A session explicitly assigned to implement Hanchou itself may edit this repo,
but must preserve plan/dry-run behavior, atomic writes, backups, public upstream
interfaces, and the ownership boundaries in `docs/REPOSITORY_BOUNDARIES.md`.

## Validation

```bash
mise install
mise exec -- npm ci
make check
./bin/hanchou plan work
./bin/hanchou plan personal
```
