---
name: hanchou-reporting
description: Apply Hanchou reporting policies to task completion, scheduled reports, alerts, and daily digests; choose renderer, destination, coalescing, and Delivery lifecycle.
---

# Hanchou reporting

Use Hanchou Delivery commands for durable user-facing output. Do not treat an
Agent terminal response as a delivered report unless the local-session contract
explicitly records it.

Use the policy stored on the Bead or schedule.

- `silent`: no user output.
- `parent_only`: report only to the parent owner.
- `on_failure`: user output only on failure.
- `on_change`: output only when the declared change key differs.
- `on_terminal`: output on completed, failed, cancelled, or needs-decision.
- `always`: output every run.
- `digest`: accumulate into the declared digest window.
- `immediate`: do not coalesce; use for decisions and critical alerts.

Renderer:

- `orchestrator`: contextual user-facing summary.
- `editor`: Codex final prose review before delivery.
- `producer`: already-structured machine output.

Destinations are `local_session`, `origin`, future Slack/Discord channel or
thread aliases, or a file. Create a durable Delivery whenever output must
survive the current turn or leave the local Herdr session.

Daily digests are control-plane work. Summarize Beads terminal changes, current
Herdr agents, unresolved decisions, Automation history, and usage snapshots.
Do not start new project research merely to enrich a digest.
