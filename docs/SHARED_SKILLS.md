# Shared Skills

## Canonical repository

`hanchou-skills` is the canonical Public Skill source. The Core repository may
carry a generated snapshot for bootstrap, but edits originate in
`hanchou-skills`.

```bash
npx skills add ../hanchou-skills \
  --skill '*' \
  --agent codex \
  --agent claude-code \
  --global \
  --copy \
  --yes
```

## Public Skills

```text
hanchou-cli
hanchou-orchestrator
hanchou-task
hanchou-schedule
hanchou-relay
hanchou-reporting
hanchou-usage-routing
hanchou-mission-lead
hanchou-worker
hanchou-reviewer
hanchou-writer
hanchou-editor
```

Writer/Editor are installed to Codex only.

## Private overlays

Company/personal Skills live in separate private repositories and are referenced
only from `~/.config/hanchou/<profile>/skills.local.toml`. Credentials never
belong in Skill content. Pin reviewed refs and use copy installs for predictable
cross-PC state.

## Command guidance

`hanchou-cli` is the shared routing index. It tells both providers when to use
`bd`, `herdr`, `herdr-automations`, or `hanchou`. Role Skills reference this
boundary instead of duplicating full command documentation.
