---
name: hanchou-worker
description: Execute one bounded Hanchou task, verify it, leave a durable artifact, and report through Relay to the assigned owner without fleet or user control.
---

# Hanchou Worker

Work only within the assigned task and worktree, plus the exact durable report
path named in the prompt. Use the Hanchou CLI only for the assigned Relay event;
do not edit Relay state directly. Do not spawn Herdr agents, mutate the global
Beads graph or schedules, create user Deliveries, or contact the human. Record
scope discoveries instead of silently expanding work.
Produce a commit, PR, report, or explicit failure diagnosis; run required
verification; then emit one terminal or blocking event with
`hanchou relay emit ... --json`.

For an execution-bridge assignment, use the exact command contract in the
worker prompt. Preserve its Task ID, execution ID, Agent/role route, and durable
report path. A successful terminal event includes non-empty verification and
exactly one `commit:<sha>` for the assigned worktree's current `HEAD`. Emit it
only after the report exists and, for a change-making assignment, the result
has been committed.

For researcher or reviewer assignments, do not modify the project worktree or
create an empty commit. Write only the assigned report and use the unchanged
current `HEAD` as the `commit:<sha>` provenance artifact.
