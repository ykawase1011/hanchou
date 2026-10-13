---
name: hanchou-cron
description: >-
  Configure and manage optional Hanchou periodic jobs in Orca Automations when
  explicitly asked to schedule, inspect, change, stop, delete, or manually test
  Hanchou recurring work. Do not invoke for ordinary Automations or merely
  because Hanchou is installed.
---

# Hanchou Cron

This is an instruction-only helper for Codex and Claude Code. Orca owns schedules,
execution, workspace placement, history, and enabled state; a project Markdown
file describes the job. Using this helper for setup does not activate Hanchou or
create a Run. An actual scheduled or explicitly requested manual execution must
activate the installed `hanchou-orchestrator` in its own session.

## Route the request

- **Independent periodic job:** each occurrence starts a Temporary Hanchou for
  this named job. It may use Orca's fresh-session Automation path. Read
  [setup.md](references/setup.md) for registration and management and
  [execution.md](references/execution.md) when composing its recurring prompt.
- **Continuation of an unfinished interactive request:** this must wake the
  *original conversation and Run*, with its authority and sole coordinator.
  Read [continuation.md](references/continuation.md) before offering or changing
  a schedule. Do not substitute an independent job, fresh session, or takeover.

If the mode is unclear, resolve it before creating or changing a schedule. In
either mode, use the selected Hanchou and job, never whichever Hanchou happens
to share the project.

## Common boundaries

Resolve the Orca executable for this session using the official `orca-cli`
discovery rule. Read its live `orca-cli` guide and the Automations reference
before an Automation operation; use current help for flags the guide omits.
Use only public Orca surfaces. Do not build a scheduler, state ledger, parser,
hook, credential store, or agent launcher.

For a project job, default to `.hanchou/cron/<job-name>.md`; a selected existing
path is equally valid. One Markdown file defines one named job, and a project
may have several. Use [job-template.md](assets/job-template.md) only when asked
to author a new definition. Do not overwrite or rewrite an existing definition
just to register it. Validate an existing definition and resolve any material
ambiguity before creation. A definition records purpose, mode, scope, checks
and actions, completion, reporting, and knowledge references. It holds no
credentials, mutable Run/Task/Dispatch/terminal IDs, or run history.
If a qualified original-conversation continuation path becomes available, its
original request and Run policy may supply the job instructions without a new
project definition file.

Orca's registered settings are the source of truth for actual frequency,
timezone, enabled state, and history. A frequency in the document is only a
desired initial value. Capture the user's permission scope at registration;
document edits may change work *within* that scope on the next run, but cannot
grant new authority or silently change the Automation schedule. An expansion
or schedule change needs an explicit configuration update. Honor permission
already granted in the user's request; do not ask for it again merely because
the creation path includes a disabled stage and a manual trial.
An ordinary request to register a scheduled job includes a bounded manual
trial and enablement after a verified result, unless the user asked for a draft
or disabled schedule. Keep the trial within the registered authority and
decision gates; if a representative trial is unavailable or its ownership or
result is uncertain, leave the schedule disabled and explain the limit.

Report what was configured or observed, the exact target and job, whether a
manual run and its result were verified, and any untested path. A successful
configuration check is not proof that a scheduled run executed.
