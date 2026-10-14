# Automations

Orca Automations owns scheduling, targets, fresh/reused sessions, timezone,
missed-run policy, enablement, run history, reruns, and remote execution.
Hanchou owns none of that state.

Before an Automation operation, use the same resolved Orca executable and read
the live `orca-cli` guide. Create new schedules disabled first when practical,
inspect them, and apply the approved verification and enablement decision. For a
Hanchou job, follow `hanchou-cron`'s bounded trial rules: a scheduled
consequential permission does not authorize an immediate effectful trial.
Never create
or enable an Automation during Hanchou installation.

For a new Hanchou Automation, propose `[hanchou] <business name>` only when the
user has not specified a name. Preserve explicit names exactly, never duplicate
an existing prefix, and never infer identity or ownership from names. Existing
renames need an explicit target/scope, including an explicit set for bulk rename.
Read the exact Automation before an authorized name change and read back the
same ID afterward: verify its name and preservation of frequency, timezone,
session mode, prompt/permission scope, and all other settings except separately
authorized changes. Report mismatches or unavailable verification instead of
assuming success or silently repairing unrelated settings.

For simple scheduled work, target Codex or Claude directly without Hanchou. For
work that needs multiple workers or review, target a Hanchou-enabled workspace
and name `hanchou-orchestrator` in the Automation prompt. Use
`$hanchou-orchestrator` for a Codex target and `/hanchou-orchestrator` for a
Claude Code target. Treat that run as a Temporary Hanchou.
For an independent Hanchou job, its self-contained registered prompt must pin
the job definition and record a separate project policy source or an explicit
no-policy decision. At occurrence startup, that decision governs policy lookup;
the interactive default search does not apply.

Default to a fresh session. Use Orca's native reuse-session only when continuity
is required. Do not bridge an Automation into an existing interactive Hanchou
Run, mirror run history, or implement catch-up/overlap logic.

Follow [placement.md](placement.md) for the user's coordinator placement
preference, explicit parent verification, and persistent cron-child retention.
An independent job keeps fresh occurrences even when they reuse the same
verified child workspace. Validate the saved Automation's public target
representations before an authorized trial or enablement; unknown or conflicting
targets are not successful configuration. Keep disabled when instructed, and
never treat placement isolation as launch-failure backpressure.

For a request to periodically resume the same interactive Hanchou, read
[continuation.md](continuation.md) first. Reuse-session availability alone does
not qualify coordinator/Run continuity or authorize schedule creation.
