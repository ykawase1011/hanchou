# Worker and model routing

Choose the worker from task needs, repository policy, user preference, and the
agents/models currently advertised by Orca. Do not hard-code one orchestrator
provider or build a model gateway.

Consider:

- required tools and repository familiarity;
- whether a fresh or existing worktree is appropriate;
- independence needed for review;
- latency, cost, and requested reasoning effort;
- the target host for remote work.

Use the live orchestration guide's agent, model, effort, worktree, repository,
and remote-host selectors. Treat model identifiers as opaque and versionable.
Never invent a model name or silently downgrade an explicit user choice.

Start independent ready Tasks before waiting. Avoid parallel edits to the same
files or branches. If multiple Hanchou Runs can touch one repository, inspect
Orca's active worktree/agent state before dispatch and redesign overlapping work
instead of adding a Hanchou lock service.
