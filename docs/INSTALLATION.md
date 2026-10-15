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
auto-detection. All six skills are optional; the five helpers can also be
installed or removed separately by their names.

```bash
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron hanchou-init \
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
Adding `hanchou-cron` does not choose scheduled work or authorize writing a
job definition, creating even a disabled Automation, running a trial, or
enabling a schedule. If the user wants to configure a job later, installation
is complete without cron onboarding; the job stays unconfigured until they
select concrete work and approve its scope. See [Scheduled work](CRON.md).

## Project-local install (optional)

To restrict availability to a project or dedicated workspace, run the same
selection there without `--global` (the installer's project default):

```bash
cd /absolute/path/to/project-or-workspace
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron hanchou-init \
  --agent codex claude-code
npx skills list --agent codex claude-code
```

Expected default placements are `.agents/skills` plus `.claude/skills` aliases.
For a core-only installation, select only `hanchou-orchestrator`. If both local
and global copies exist, inspect which one the agent loads; a local copy may
shadow the global update. Never remove a local customized copy automatically.

## Invoke, update and remove

Codex uses `$hanchou-orchestrator`, `$hanchou-kaizen`, `$hanchou-update`,
`$hanchou-publish-issues`, `$hanchou-cron`, and `$hanchou-init`; Claude Code uses the same names
prefixed with `/`.
See [Onboarding](ONBOARDING.md), [Improvement workflow](IMPROVEMENTS.md), and
[Scheduled work](CRON.md), and [Initialization](INITIALIZATION.md). Install alone never activates Hanchou; configuration
requests to helpers create no Run. A manual cron trial of an approved concrete
job may run that job.

Ask `hanchou-update` to update the installed Hanchou subset. It verifies source,
local modifications, scope, provider targets, and the resulting files, using the
official installer. It does not install absent helpers or update Orca. Avoid
bare `npx skills update`, which can update unrelated skills. Manual updates
should follow the same targeted reinstall procedure after checking local edits;
there is no Hanchou updater executable, managed checkout or rollback database.

Activated Hanchou checks for applicable updates at activation and each new user
task, once per task, through the installed optional helper. Missing helper,
unknown baseline, local edits or network failure are reported without blocking
unrelated work; no helper is installed automatically. Only the installed skill
trees and their pins matter, not unrelated repository commits. A check grants
no update or rotation authority; standing installation-only permission stays
installation-only.

An ordinary explicit Hanchou update request includes scoped installation,
verified adoption in a fresh visible agent tab, then old-self close without
another permission question. Check-only, files-only, keep-open/no-close, scope
limits and applicable contrary standing instructions override this default.
Unchanged selected content without demonstrated stale session content needs
neither reinstall nor a fresh tab; an explicit reload is a separate request.
Repeated task wakes reuse prior attempt/receipt evidence instead of opening tabs.
The workflow follows the helper's public-capability and quiescence gates and verifies the new
conversation's actual installed paths/content/revision and handoff acknowledgment
before exact closure. Orca 1.4.224's inspected public CLI does not qualify
independent structured-session rotation or current-Run ownership transfer.
Settled old business permits an independent new conversation/Run; same-Run
transfer is an additional requirement only when requested. The rotation operation
can remain pending without requiring its own close result before launch.
On an unsupported path, retain the current conversation and provide a manual
fresh-tab recovery after work settles. See [update acceptance and capability
limits](UPDATE_VALIDATION.md); installing files does not itself refresh a running
agent, close its session or enable cron.

The final update report separates verified file installation, fresh-tab adoption,
and old-session closure. For example, files may be current while adoption is
blocked and the old session is retained. A missing structured operation in the
inspected public CLI is a bounded finding, not proof that Orca has no such
internal feature. Full automation is not established until the requested
endpoint path has been exercised and verified. A helper that updates its own
instructions also distinguishes the initially loaded workflow from the installed
one; new text alone cannot broaden installation-only authority. Capability
findings do not authorize external Issue/PR/comment publication.

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
