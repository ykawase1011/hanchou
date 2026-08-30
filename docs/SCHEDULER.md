# Scheduler

## Canonical engine

`herdr-automations` is the only recurring Cron source and run-history store.
Hanchou does not add a second general scheduler.

## Command surface

Use `herdr-automations` directly for ordinary fresh-agent schedule list, run,
history and configuration. The planned typed `hanchou schedule` wrapper is
limited to Hanchou reporting metadata, Beads binding and the
`existing-orchestrator` target. It is not a second scheduler.

## Target modes

### new-agent

```text
cron → fresh worktree/root → fresh Herdr Agent → artifact → Relay event
```

Use for independent maintenance, triage, test, investigation, and scheduled
report production.

### existing-orchestrator

```text
cron → durable schedule_due Inbox event → same logical Orchestrator → action/report
```

Use for ongoing mission review, Task continuation, reminders, and daily digest.
This is a required Hanchou extension because upstream automations normally spawn
a fresh Agent.

## Required fields

- stable name and profile;
- cron and timezone;
- target mode;
- project/repository/workspace;
- role/agent/model or Orchestrator target;
- prompt/workflow;
- timeout and catch-up;
- overlap policy;
- Task-link policy;
- reporting policy、renderer、destination、coalescing;
- enabled state.

## Defaults

- `workspace: worktree` for new agents.
- Explicit Terra/Sonnet model for routine work.
- Routine maintenance: `on_failure`.
- Monitoring: `on_change` with stable change key.
- Daily digest: `existing-orchestrator + always`.
- Different jobs due at the same minute may run together; the same active job
  skips overlapping ticks.

## Agent registration

L0 may create/update/pause/resume/run/remove schedules, but must use the planned
typed Hanchou wrapper rather than replacing the whole YAML. The wrapper performs
atomic write, validation, next-run preview, overlap report, and unrelated-entry
preservation.

## Reliability

- sleep catch-up is bounded by `catch_up_minutes`;
- missed occurrences remain in history;
- invalid entries do not disable valid entries;
- `hanchou doctor` verifies scheduler health and recent history;
- business-critical jobs require alerting for daemon death, misses, and repeated
  failure.

One-shot work remains a Bead with due/defer plus an Orchestrator review until a
reviewed one-shot primitive is selected.
