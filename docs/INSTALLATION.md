# Installation

## Prerequisites

Install Orca and its official `orca-cli` and `orchestration` skills. Current
Orca releases expose a dedicated Settings → Orchestration page; use it to
confirm the skill coverage and worker-depth policy. If an older installed build
explicitly reports that Experimental Orchestration is disabled, enable it
manually at the Settings location named by that build. Hanchou never changes
Orca settings.

```bash
npx skills add https://github.com/stablyai/orca \
  --skill orca-cli orchestration --agent universal claude-code --global
```

## Project-local install (default)

```bash
cd /absolute/path/to/project-or-workspace
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator --agent universal claude-code --local
```

Review the installer's reported target. A local install should place the skill
under the current workspace's supported local skill directory. It must not edit
existing project instructions. Keep both `universal` and `claude-code` targets:
the first creates the standard `.agents/skills` copy used by Codex and other
Agent Skills consumers, while the second creates Claude Code's provider alias.
Relying only on auto-detected agents can omit the other provider.

初めて使う場合は、install後の起動までをまとめた[Onboarding](ONBOARDING.md)へ
進んでください。

## Global install (optional)

Global install is permitted for users who want Hanchou available everywhere,
but it is not the default:

```bash
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator --agent universal claude-code --global
```

The skill description is intentionally narrow and excludes ordinary work and
generic requests for another agent. The recommended entrypoint names the skill:
Codex uses `$hanchou-orchestrator`, while Claude Code uses
`/hanchou-orchestrator`. Natural-language selection remains supported, but it is
not the standard prompt in user-facing examples. A dedicated workspace can put
the corresponding explicit invocation in its local instruction.

## Update and removal

Use `npx skills update`, the standard skills installer, or Orca Skills UI.
Delete with the installer/UI mechanism that created the copy. There is no
Hanchou updater, managed checkout, profile launcher, or rollback database.
