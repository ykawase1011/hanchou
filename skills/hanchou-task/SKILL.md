---
name: hanchou-task
description: Manage the canonical Beads graph for Hanchou intake, delegation, dependencies, decisions, reporting policy, Herdr binding, and verified closure.
---

# Hanchou Task control

Use the active profile's `BEADS_DIR` and use `bd` directly. Prefer
`bd ... --json` for Agent/script writes. Hanchou intentionally has no generic
Task facade. The `hanchou execution` command is only for the WAL-backed,
recoverable Beads↔Herdr dispatch/binding sequence.

- Human request → root Task or Epic.
- Visible delegated work → child Task before Herdr spawn.
- Human gate → `decision` issue that blocks dependent work.
- Runtime and reporting policy → `hanchou.task.v1` metadata.
- Newly discovered child work → Relay event; L0 creates the Bead.
- Closure requires durable artifacts and verification, not Herdr state.

Root user Tasks default to `on_terminal`. Child Tasks default to `parent_only`.
A root Task is not operationally complete until its required Delivery is either
sent or explicitly waived by `silent` policy.

For delegated work, create the root and child Beads first, attach valid
`hanchou.task.v1` metadata to the child, then run
`hanchou execution dispatch <child-id> --json`. Do not manually reproduce the
cross-system claim, worktree, Agent binding, and prompt sequence.
The child `project` and `repo_path` must come from
`hanchou project resolve --path <git-root> --json`. Project authorization is
human-owned machine-local state: Agents may list/show/resolve/doctor it but may
not create or broaden it. Dispatch rechecks this authority before any WAL,
Bead claim, Git operation, or Herdr worktree side effect.
Dispatch rejects active blocking dependencies and any pre-existing non-empty
`execution_id`. Hanchou owns only `execution_id`, `routing`, and `herdr`, and
adds default `reporting` only when absent; preserve all other metadata.
While an execution is active, do not change its profile, project, repository,
execution mode, owner, or role; reconciliation treats those changes as an
identity conflict instead of retargeting the worker.
