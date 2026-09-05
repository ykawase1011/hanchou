# Hanchou repository instructions

This repository distributes one optional Orca skill. Do not add a Hanchou CLI,
runtime, daemon, database, scheduler, dashboard, agent launcher, project registry,
or copied Orca command reference.

Use public Orca CLI contracts and the installed binary's live guides. Keep
`hanchou-orchestrator` provider-neutral and narrowly triggered. Repository tests
are allowed; production code is not.

```bash
make check
```
