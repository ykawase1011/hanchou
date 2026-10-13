# Installation

## Prerequisites

Install Orca and its official `orca-cli` and `orchestration` skills. Use the
installed version's Settings → Orchestration page for coverage/depth policy.
Only if an older build explicitly reports a disabled Experimental feature,
follow that build's manual guidance. Hanchou never changes Orca settings.

```bash
npx skills add https://github.com/stablyai/orca \
  --skill orca-cli orchestration --agent codex claude-code --global
```

## Global install (default)

Install for both Codex and Claude Code on Orca, without relying on provider
auto-detection. All five skills are optional; the four helpers can also be
installed or removed separately by their names.

```bash
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron \
  --agent codex claude-code --global
npx skills list --global --agent codex claude-code
```

Inspect actual target paths and links in the installer output. With the verified
`skills` 1.7.2 defaults, Codex uses `~/.agents/skills` and Claude Code has its
placement at `~/.claude/skills`; environment overrides and versions can alter
paths. Global Universal placement is not a substitute for explicitly selecting
Codex. Installation creates skill files/aliases and installer metadata, not
Hanchou runtime state. It does not activate orchestration or edit existing
`AGENTS.md`, `CLAUDE.md`, Orca settings, sessions, or Automations.

## Project-local install (optional)

To restrict availability to a project or dedicated workspace, run the same
selection there without `--global` (the installer's project default):

```bash
cd /absolute/path/to/project-or-workspace
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron \
  --agent codex claude-code
npx skills list --agent codex claude-code
```

Expected default placements are `.agents/skills` plus `.claude/skills` aliases.
For a core-only installation, select only `hanchou-orchestrator`. If both local
and global copies exist, inspect which one the agent loads; a local copy may
shadow the global update. Never remove a local customized copy automatically.

## Invoke, update and remove

Codex uses `$hanchou-orchestrator`, `$hanchou-kaizen`, `$hanchou-update`,
`$hanchou-publish-issues`, and `$hanchou-cron`; Claude Code uses the same names
prefixed with `/`.
See [Onboarding](ONBOARDING.md), [Improvement workflow](IMPROVEMENTS.md), and
[Scheduled work](CRON.md). Install alone never activates Hanchou; configuration
requests to helpers create no Run. A requested cron manual trial may run a job.

Ask `hanchou-update` to update the installed Hanchou subset. It verifies source,
local modifications, scope, provider targets, and the resulting files, using the
official installer. It does not install absent helpers or update Orca. Avoid
bare `npx skills update`, which can update unrelated skills. Manual updates
should follow the same targeted reinstall procedure after checking local edits;
there is no Hanchou updater executable, managed checkout or rollback database.

Remove through the installer/UI that created the copy, with explicit skill
names, matching agents and scope. For example, for an unmodified global core:

```bash
npx skills remove hanchou-orchestrator --agent codex claude-code --global
```

The contract was checked against `npx skills --help` version 1.7.2 and the
[official CLI docs](https://skills.sh/docs/cli) and
[official installer repository](https://github.com/vercel-labs/skills).
Read the installed version's help before acting; do not assume older `--local`
examples or newer named-update options apply to every installed version.
