---
name: hanchou-task
description: Manage the canonical Beads graph for Hanchou intake, delegation, dependencies, decisions, reporting policy, Herdr binding, and verified closure.
---

# Hanchou Task control

Use the active profile's `BEADS_DIR` and use `bd` directly. Prefer
`bd ... --json` for Agent/script writes. Hanchou intentionally has no generic
Task facade. The planned `hanchou execution` command is only for the atomic
Beads↔Herdr dispatch/binding sequence.

- Human request → root Task or Epic.
- Visible delegated work → child Task before Herdr spawn.
- Human gate → `decision` issue that blocks dependent work.
- Runtime and reporting policy → `hanchou.task.v1` metadata.
- Newly discovered child work → Relay event; L0 creates the Bead.
- Closure requires durable artifacts and verification, not Herdr state.

Root user Tasks default to `on_terminal`. Child Tasks default to `parent_only`.
A root Task is not operationally complete until its required Delivery is either
sent or explicitly waived by `silent` policy.
