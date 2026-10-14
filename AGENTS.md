# Hanchou repository instructions

This repository distributes optional Orca skills: the Hanchou orchestrator and
its improvement-issue publishing and scoped update helpers. Do not add a Hanchou CLI,
runtime, daemon, database, scheduler, dashboard, agent launcher, project registry,
or copied Orca command reference.

Use public Orca CLI contracts and the installed binary's live guides. Keep
`hanchou-orchestrator` provider-neutral and narrowly triggered. Repository tests
are allowed; production code is not.

This repository's standing preference is to keep main for human work and fixed
reference sources. Place future Hanchou interactive coordinators, independent
cron coordinators, implementation, investigation, independent review, added
workers, and retries in explicit Orca child worktrees of a verified parent in
this project, unless the user explicitly overrides that preference. Supervised
workers use dedicated workspaces separate from their coordinator and other
workers, within the same Orchestration Run. Carry the preference and intended
parent, host, and project into each Task/configuration, compare them with the
public launch selector, and verify receipt plus actual path, parent lineage,
host, and project before accepting placement. A distinct path alone is not
proof of a child relationship.

Preserve the current conversation and its bound Run; do not silently move,
clone, or rebind them. A future independent interactive coordinator follows
normal startup in its verified child, not a worker dispatch into the old Run.
Keep selected policy/definition sources pinned independently of execution
placement; do not copy ignored files or switch sources implicitly. A designated
persistent cron child can host fresh independent occurrences; record retention
reason, owner, and next review. Temporary workers follow existing result
preservation and cleanup safeguards. Do not infer permission to schedule,
enable, or test cron from this placement preference; a stop instruction remains
in force. This repository preference is not a default for other Hanchou users.

```bash
make check
```
