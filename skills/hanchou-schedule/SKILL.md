---
name: hanchou-schedule
description: Create, inspect, validate, disable, and run Hanchou recurring jobs through herdr-automations, including reporting policies, scheduled Orchestrator wakeups, and daily digests.
---

# Hanchou schedule control

Read the existing `automations.yaml` first and preserve unrelated entries.
Use `herdr-automations` directly for ordinary `new-agent` schedules. Use the
planned typed Hanchou schedule surface only when Task binding, reporting
metadata, or `existing-orchestrator` wake is required; verify availability with
`hanchou --help`.

Every schedule declares the execution target and reporting policy.

- `new-agent`: fresh Herdr agent/worktree for independent work.
- `existing-orchestrator`: durable `schedule_due` Relay event for the same L0
  session; used for reviews, continuation, and daily digests.

Always define cron, repository/project scope, timeout, catch-up, overlap,
Task-link policy, reporting policy, renderer, destination, and coalescing.
Default routine leaf work to Terra or Sonnet and `workspace: worktree`.

A scheduled producer writes a durable artifact and emits a Relay event. It does
not assume that terminal completion equals report delivery. Verify the schedule,
show the next runs and overlaps, and keep invalid or disabled entries explicit.
