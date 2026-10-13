# Hanchou repository instructions

This repository distributes optional Orca skills: the Hanchou orchestrator and
its improvement-issue publishing and scoped update helpers. Do not add a Hanchou CLI,
runtime, daemon, database, scheduler, dashboard, agent launcher, project registry,
or copied Orca command reference.

Use public Orca CLI contracts and the installed binary's live guides. Keep
`hanchou-orchestrator` provider-neutral and narrowly triggered. Repository tests
are allowed; production code is not.

For supervised Hanchou development in this repository, place implementation,
investigation, and independent review workers in dedicated Orca workspaces
separate from the coordinator checkout, including retries and added workers,
unless the user explicitly overrides this preference. Keep them in the same
Orchestration Run. Carry this repository preference into each Task spec, compare
the intended placement with the launch selector, and verify the actual workspace
path in the start receipt before accepting the assignment. Preserve the
coordinator checkout and any existing worker results when moving work.

```bash
make check
```
