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

## Scoped model and effort policy

At intake, snapshot the user's model, effort, and cost/quality preferences in the
existing conversation and public Task context, with their source and scope:
one Task, this conversation, or a named project. Distinguish unspecified values,
an explicit fixed choice, and a user-authorized choice among named models.
Record role rules separately for the main coordinator, worker, descendant
worker, independent review, and retry, including allowed alternatives and any
upgrade ceiling. A worker coordinating children is still a descendant for this
policy, not the main coordinator. Do not infer permission to change a running
session from an issue's example or a preference for future launches.

Resolve each role from the latest applicable explicit user correction, then the
applicable project/request snapshot under [request-scope.md](request-scope.md).
Keep unaffected roles and broader scopes intact: a one-Task override neither
rewrites the project default nor changes the coordinator. Pass the resolved
snapshot and its source/scope to every Task, descendant, review, and retry; do
not copy the parent's selected model/effort as the child's policy. No preference
means the live guide's configured agent default, not a Hanchou model default.

For each assignment, assess uncertainty, consequence of error, available
verification, and procedure clarity. Explain briefly why the least demanding
authorized model and supported effort sufficient for that Task are appropriate.
Clear bounded changes or routine checks may need less reasoning than unresolved
investigation or a difficult review; role labels alone do not determine effort.
Do not make all workers high-effort, or assume review/retry requires an upgrade.
Honor an explicit fixed model/effort even when another choice seems preferable;
if it cannot meet acceptance, name the concrete gap rather than silently switch.
Model capability, price, and quality are not guaranteed by these heuristics.

Already authorized role-based choices need no repeated approval. If the named
choice is unsupported, or acceptance requires a model/effort outside the allowed
policy, report the unsupported capability or demonstrated shortfall, a supported
alternative if known, the recommendation and its impact. Ask only for the
missing decision through the current owner. Do not silently upgrade, downgrade,
or drop a fixed request to obtain a successful start.

## Launch evidence and session boundaries

Before choosing reuse, apply the [session-kind qualification gate](worker-evidence.md#reuse-qualification-before-submission).
Check the start receipt and target version's public route before sending the next
Task; handle appearance and common lifecycle support do not establish terminal
compatibility. An unconfirmed structured reuse route is unqualified. Use the
preservation, settlement/ownership, official release, and authorized fresh-worker
path there, retaining the designated implementation workspace and distinguishing
follow-up from retry. A possibly submitted request must first be reconciled under
[refusal versus unknown outcome](worker-evidence.md#refusal-versus-unknown-outcome).

Use the installed orchestration guide's `references/coordinator-loop.md` for
launch-preference support, constraints, and terminal reuse, rather than a copied
model catalog or launch recipe here. The user must have named the model (directly
or in the applicable role policy) before a model override is passed. A general
request to reduce cost does not authorize inventing a model override. Effort
requires an explicit supported model, and launch overrides cannot accompany
reuse of an existing terminal. If an effort-only request cannot be expressed,
report that specific gap; do not silently ignore it or guess the default model.

Before launch, compare the Task's role-specific selection with the actual public
launch request. Afterward compare `launch.requested` with `launch.effective` for
agent, model, and effort separately. Preserve absent or `null` values as unknown;
they prove neither a particular default nor inheritance from the coordinator.
Report only the fields the public receipt confirms. A known mismatch is not
compliance; an unknown effective value is not a match. When an explicit choice
or ceiling cannot be verified, stop accepting it as policy-compliant, reconcile
the original attempt, and report the evidence gap. Do not repeat a start merely
to obtain a better receipt: its Task input may already have arrived.

Coordinator intent, worker launch evidence, and an existing session's actual
configuration are separate facts. A worker receipt cannot prove the coordinator
changed. Do not infer an existing terminal's model from its title, parent,
previous request, or transcript claim. Reuse only when public evidence supports
compatibility with the effective policy; otherwise disclose the limit and use
the live guide's authorized fresh-launch path after resolving the old owner.
Never invent a live session-setting command, edit private provider/Orca state,
or implement a launcher/model gateway. Model catalogs and setting mechanisms
belong to Orca and the provider.

## Mid-task corrections

When a user changes cost/model/effort policy, record the correction's scope and
affected roles without retroactively relabeling old launches. Send it through
[inbox.md](inbox.md), and require application evidence at a safe boundary; enqueue
or acknowledgment alone does not prove application or a model change. Do not
assume that a delivered prompt reconfigures a running session.

At that boundary preserve commits, uncommitted changes, untracked artifacts,
verification, and the status of external operations already attempted. Reconcile
an uncertain push, PR, deployment, or other side effect with public postconditions
before repeating it. Record what is complete, pending, or unknown and the next
owner in public Task/report context, not a new execution ledger. A replacement
must receive the actual results and remaining work, not rerun the original Task
blindly. Preserve the bound Run and placement/cleanup constraints.

If a fresh setting requires a replacement, separate the new requested/effective
settings from evidence that the old attempt has settled or exited and ownership
has transferred. Follow the live recovery contract and [cleanup.md](cleanup.md):
silence, contact loss, or a null receipt cannot authorize stop, abandonment,
retry, or duplicate execution. Do not start overlapping work while the old owner
is live or uncertain. Report unresolved ownership and the next evidence needed;
an approved selection alone is not a completed transition.

## Placement and work preservation

Retain an explicit session placement preference for every new worker, retry,
and independent review. Follow [placement.md](placement.md) to distinguish a
separate workspace from an explicit child and to preserve coordinator boundaries.
A request to keep worker tabs out of the coordinator's
workspace is sufficient reason to use a dedicated workspace through the live
placement guide. Without such a preference, apply the dedicated-worktree default
for change work, including coordinator Git/integration operations, and preserve
the original human checkout throughout. Read-only/Issue-only work may use the
official current/existing default; a verified dedicated target may be reused.
A fresh agent alone does not require a new checkout.
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
unspecified choice remain distinct: honor the former only within its scope;
for the latter apply the change-work default or read-only/Issue-only exception.

Before moving review or implementation elsewhere, preserve the existing work
and transfer the actual base, diff, and any uncommitted/untracked artifacts needed
for acceptance through an authorized commit or verified patch/artifact. A new
checkout does not contain uncommitted work automatically. Verify the reviewer's
input matches the intended result, without resetting or deleting the original.

Start independent ready Tasks before waiting. Avoid parallel edits to the same
files or branches. If multiple Hanchou Runs can touch one repository, inspect
Orca's active worktree/agent state before dispatch and redesign overlapping work
instead of adding a Hanchou lock service.
