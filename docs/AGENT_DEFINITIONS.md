# Agent definitions

## Canonical source

```text
roles/<role>/role.toml
roles/<role>/ROLE.md
```

`render-agents.ts` generates:

```text
.codex/agents/<role>.toml
.claude/agents/<role>.md
```

There is no common industry format for complete Claude/Codex agent definitions;
Hanchou keeps a small provider-neutral source and generates native forms.

## Roles

| Role | Layer | Default | Responsibility |
|---|---:|---|---|
| orchestrator | L0 | Codex Sol | Human conversation、Task、Cron、Relay、final response |
| mission-lead | L1 | Claude Opus / Codex Sol | Complex mission planning、delegation、integration |
| researcher | L2 | Sonnet / Terra | Bounded research report |
| implementer | L2 | Terra / Sonnet | Bounded implementation and verification |
| reviewer | L2 | Terra / Sonnet | Code/artifact review |
| writer | L2 | Codex Terra | Japanese/business/user-facing draft |
| editor | L2 | Codex Terra | Final prose approval |

Writer and Editor have no Claude definition.

## Spawn policy

- Default: L0 → one Leaf.
- Use Mission Lead only for independent parallel workstreams, repeated provider
  handoff, long-lived integration, or mission-level quality ownership.
- Maximum Herdr depth: L0 → L1 → L2.
- L2 cannot spawn Herdr agents.
- Provider-native subagents are allowed only for short ephemeral assistance that
  needs no Bead, visible session, or durable ownership.

## Communication

- Leaf → owner: Relay event with summary and artifact reference.
- L2 never sends raw transcript to L0.
- Mission Lead reports only accepted、needs_decision、completed、failed.
- User-facing prose is produced by L0 or Codex Editor, not by arbitrary worker.

## Command Skills

The Orchestrator includes `hanchou-cli` in addition to the role-specific Skills.
It uses `bd`, `herdr`, and `herdr-automations` directly for their own state, and
uses Hanchou CLI only for Hanchou-owned or cross-system mechanics. Leaf roles do
not receive profile/setup authority; they receive only the bounded Skills needed
for their work and Relay reporting.
