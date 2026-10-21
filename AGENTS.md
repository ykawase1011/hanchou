# Hanchou repository instructions

This repository distributes Hanchou v2 Agent Skills: `hanchou-orchestrator`,
`hanchou-sokkin`, `hanchou-init`, and `hanchou-update`. Keep the orchestrator
provider-neutral, explicitly triggered, and focused on requests, results, and
usage supervision. Sokkin owns execution, workers, verification, and integration.

The only production executables allowed are two narrowly scoped, one-shot shells.
`skills/hanchou-orchestrator/scripts/launch-sokkin.sh` wraps existing Git,
Herdr, and official agent CLIs, always creates and verifies a fresh branch and
worktree before starting a new sokkin, and exits after returning launch identity.
`skills/hanchou-orchestrator/scripts/measure-session.sh` only reads and reconciles
one native session with the qualified existing usage tool. It does not launch
agents, dispatch missions, decide budgets, modify project/provider configuration,
delete resources, or maintain accounting state. Temporary observation files are
removed on exit. Unknown identity, format or scope fails closed.
Do not add a runtime, daemon, database, scheduler, generic launcher, dashboard,
registry, or copied CLI command reference. Repository tests are allowed.
Use public CLI contracts and installed-version help; do not claim untested
capabilities. When developing or investigating Hanchou itself, read the relevant
sections of `docs/HANCHOU_V2_DESIGN.md` for accepted requirements and
`docs/VALIDATION.md` for bounded verification status. Running an installed skill
or a product smoke test does not require loading these development documents.
Use the installed skill and the selected project's policy/config for that path;
read development documents only to resolve a concrete implementation question.
This reading distinction does not waive the placement and preservation rules below.

Preserve the human checkout, index, uncommitted changes, and existing resources.
Pin project policy/config sources independently of execution placement; do not
copy ignored files or silently change sources. Missing native identity or usage
measurement blocks real work. Claude Code uses subscription authentication only.
Do not revive removed cron, improvement publishing, status-view, Orca Run, or
mandatory automatic handoff features. Existing installed data is not deleted
merely because its old feature is removed from this repository.

For work on this repository, keep main for human work and fixed reference sources.
Unless explicitly overridden, use verified Orca child worktrees of the intended
parent for coordinators, implementation, investigation, reviews, workers, and
retries. Verify actual path, parent lineage, host, and project; a distinct path
alone is insufficient. Supervised workers use separate dedicated workspaces.
This contributor placement preference does not make Orca a v2 product dependency.
Preserve the current conversation and any bound Run when changing placement;
do not silently move, clone, or rebind them. It grants no scheduling authority.

```bash
make check
```
