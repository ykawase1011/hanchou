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

Retain an explicit session placement preference for every new worker, retry,
and independent review. Follow [placement.md](placement.md) to distinguish a
separate workspace from an explicit child and to preserve coordinator boundaries.
A request to keep worker tabs out of the coordinator's
workspace is sufficient reason to use a dedicated workspace through the live
placement guide. Without such a preference, use the official current/existing
workspace default; a fresh agent alone does not require a new checkout.
Workspace separation does not create another Run. Discover and verify the exact
target before launch; if that placement is unsupported, report the constraint
instead of silently placing the worker in the coordinator workspace.

For each launch, compare the effective placement in the Task spec with the
actual `worker-start` worktree selector before invoking it. A dedicated request
requires a new or exact existing workspace whose resolved path differs from
the coordinator's; `--worktree current` does not satisfy it. Read the start
receipt and public workspace identity afterward to verify the chosen path,
host, project, and Run; for an explicit child preference also verify the intended
parent lineage, not just a distinct path. A mismatched or uncertain receipt means
the first Task may already have reached the worker: steer it to a safe checkpoint, preserve its
results, and reconcile ownership before further work, dispatch, or retry. Do not
start a duplicate editor. Apply the same check to implementation, investigation,
review, follow-up, and retry Tasks. An explicit `current` choice and an
unspecified choice remain distinct: honor the former and use the live guide's
default for the latter.

Before moving review or implementation elsewhere, preserve the existing work
and transfer the actual base, diff, and any uncommitted/untracked artifacts needed
for acceptance through an authorized commit or verified patch/artifact. A new
checkout does not contain uncommitted work automatically. Verify the reviewer's
input matches the intended result, without resetting or deleting the original.

Start independent ready Tasks before waiting. Avoid parallel edits to the same
files or branches. If multiple Hanchou Runs can touch one repository, inspect
Orca's active worktree/agent state before dispatch and redesign overlapping work
instead of adding a Hanchou lock service.
