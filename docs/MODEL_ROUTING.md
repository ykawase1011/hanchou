# Model and usage routing

## Defaults

```text
orchestrator   codex / gpt-5.6-sol
mission-lead   claude / opus      fallback codex / gpt-5.6-sol
researcher     claude / sonnet    fallback codex / gpt-5.6-terra
implementer    codex / gpt-5.6-terra fallback claude / sonnet
reviewer       codex / gpt-5.6-terra fallback claude / sonnet
writer         codex / gpt-5.6-terra
editor         codex / gpt-5.6-terra
```

High-stakes final prose may escalate Editor to Sol. Japanese final output remains
on Codex even under pressure.

## Usage-aware policy

Machine-local snapshots record weekly/session remaining percentages and
freshness. Flexible work moves only when:

1. the primary provider is under configured pressure;
2. the fallback snapshot is fresh and materially healthier;
3. no provider/content lock applies.

Missing or stale data never causes an invented switch. When both providers are
pressured, reduce concurrency before lowering quality further.

```bash
hanchou usage set codex --weekly-remaining 30 --source manual
hanchou usage set claude --weekly-remaining 70 --source manual
hanchou route resolve --role implementer --task-kind code --json
```
