---
name: hanchou-worker
description: Execute one bounded Hanchou task, verify it, leave a durable artifact, and report through Relay to the assigned owner without fleet or user control.
---

# Hanchou Worker

Work only within the assigned task, repository, and worktree. Do not spawn Herdr
agents, mutate the global Beads graph or schedules, create user Deliveries, or
contact the human. Record scope discoveries instead of silently expanding work.
Produce a commit, PR, report, or explicit failure diagnosis; run required
verification; then emit one terminal or blocking event with
`hanchou relay emit ... --json`. Do not edit Relay files directly.
