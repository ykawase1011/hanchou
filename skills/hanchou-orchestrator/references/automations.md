# Automations

Orca Automations owns scheduling, targets, fresh/reused sessions, timezone,
missed-run policy, enablement, run history, reruns, and remote execution.
Hanchou owns none of that state.

Before an Automation operation, use the same resolved Orca executable and read
the live `orca-cli` guide. Create new schedules disabled first when practical,
inspect them, run them manually, then enable only with user intent. Never create
or enable an Automation during Hanchou installation.

For simple scheduled work, target Codex or Claude directly without Hanchou. For
work that needs multiple workers or review, target a Hanchou-enabled workspace
and name `hanchou-orchestrator` in the Automation prompt. Use
`$hanchou-orchestrator` for a Codex target and `/hanchou-orchestrator` for a
Claude Code target. Treat that run as a Temporary Hanchou.

Default to a fresh session. Use Orca's native reuse-session only when continuity
is required. Do not bridge an Automation into an existing interactive Hanchou
Run, mirror run history, or implement catch-up/overlap logic.
