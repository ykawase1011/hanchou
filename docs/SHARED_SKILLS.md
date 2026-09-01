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

The profile-local managed source is `<profile-root>/hanchou-skills`, sibling to
`<profile-root>/hanchou`; candidate Core is validated against that candidate
Skills checkout. Pair validation requires the Skills VERSION declared by Core,
byte-identical shared `hanchou-cli`, and every configured public Skill. The
`--global --copy` destinations are same-user integration
state rather than profile-isolated state. A later bootstrap from another
profile may replace them, so the operator must serialize cross-profile
update/bootstrap and check each affected profile with `doctor`.

## Private overlays

Company/personal Skills live in separate private repositories and are referenced
only from `~/.config/hanchou/<profile>/skills.local.toml`. Credentials never
belong in Skill content. Pin reviewed refs and use copy installs for predictable
cross-PC state.

## Command guidance

`hanchou-cli` is the shared routing index. It tells both providers when to use
`bd`, `herdr`, `herdr-automations`, or `hanchou`. Role Skills reference this
boundary instead of duplicating full command documentation.
