# Coordinator and worker placement

Resolve placement from the current explicit request and applicable conversation
or project policy, then the change-work default below. Record its source and
scope: explicit override, inherited preference, or Hanchou default; distinguish
separation from an explicit child of a selected parent. An explicit one-task
override does not rewrite the standing preference. Read-only investigation or
Issue-only publication needs no new worktree or branch solely for this policy;
absent a stronger preference, retain the installed Orca guide's defaults for
those tasks. A fresh session alone does not require a new worktree. This policy
does not activate Hanchou or authorize work, installation, or Automation changes.

When the user says “human work stays in main; Hanchou uses explicit children,”
carry that preference into future interactive coordinators, independent
scheduled coordinators, implementation, investigation, independent review,
added workers, and retries. Select the intended parent, host, project, and Git
base separately. A different path, Git branch/base, UI grouping, or common Run
does not establish Orca parent lineage.

## Change work: preserve the original checkout

Before editing or Git operations that can change checkout state, identify the
original human checkout and any other protected coordinator/source checkout by
exact path, host, and project. Read its current branch (or detached HEAD), HEAD,
staged and unstaged changes, and relevant untracked files without refreshing or
writing its index (for example, disable Git optional locks for inspection).
Record only necessary non-secret evidence in the existing conversation/Task.
Protect whichever branch the human is using, including a release branch; never
assume it is main or that a clean checkout is available for Hanchou to mutate.

By default, perform change work in a dedicated worktree and its task branch.
Use the installed public Orca worktree workflow to create it or select an
already verified dedicated workspace. Worktree and branch creation together is
valid; never first switch the original checkout, even temporarily. Select the
Git base separately from Orca parent lineage. Compare intention, public receipt,
and actual path, host, project, required parent lineage, branch, and base/HEAD
before edits. An existing dedicated target (including the current workspace)
needs no gratuitous new worktree: verify identity, task purpose, branch, existing
changes, current owner, and absence of conflicting users/agents first. A name,
clean status, or different path alone proves neither ownership nor safety.
Do not reset/reuse a conflicting branch or move a branch checked out by a human.

Preserve the original checkout's branch, working files, and index throughout.
Do not edit there, switch/checkout a branch there, or stash, reset, restore,
clean, move, stage, or commit its existing changes to prepare another workspace.
Do not copy human uncommitted work into a task by implication; obtain scoped
authority if it is actually required. Returning to the original branch at the
end is not compliance. An explicit user exception can permit named operations
in the original checkout only within its stated scope; it does not grant general
cleanup or authority over unrelated changes. An unspecified placement is not
such an exception.

Apply this to the coordinator's own Git and integration operations as well as
implementation, independent review, added workers, and retries. Before merge,
rebase, cherry-pick, conflict resolution, post-merge synchronization, or branch
cleanup, verify the exact operation target and its effects on shared Git refs
and other checked-out branches. Run authorized mutations only in the verified
dedicated target, with an explicit working directory/target; inspect tool side
effects that can checkout, pull, or delete local branches. Remote PR integration
does not authorize synchronizing the human checkout. If integration needs a
separate target, use a verified dedicated integration workspace within existing
authority; do not use the original checkout for convenience. Separation grants
no merge, push, cleanup, or release permission. Keep review input and task-owned
results intact under [routing.md](routing.md) and [cleanup.md](cleanup.md).

The coordinator's conversation and bound Run stay in place; commands may target
a verified dedicated worktree without migrating the conversation. Carry the
protected checkout evidence, exception scope (or none), actual task branch and
workspace, ownership, and verification duties into each Task and integration
handoff. A stronger child/separate-worker preference still applies. Do not
reinterpret session preservation as permission to edit the human checkout.

If creation fails or placement/ownership/branch is unknown, stop dependent
mutations and report the gap. Never silently fall back to the original/current
checkout or guess another host. Reconcile an uncertain create or launch before
retry; input may already have reached a worker. Preserve results and steer to a
safe checkpoint if a mismatch is discovered after launch.

At creation, edit/review handoffs, before and after integration, and completion,
compare protected checkout evidence with the baseline and inspect the actual
task workspace/branch. Keep operation targets and receipts from the intervening
steps: equal start/end snapshots cannot prove there was no temporary switch.
Human concurrent edits are legitimate; do not roll them back to make snapshots
match or attribute them to Hanchou without evidence. Report observed differences,
Hanchou's actual operations, and any attribution gap separately. Never restore
an old index or files as a verification step. This is instruction policy, not a
runtime lock or a guarantee against concurrent agents.

## Names for newly created worktrees

When Hanchou creates a worktree without an explicit user name, use a short,
purposeful name starting with `hanchou-`, such as `hanchou-fix-login`,
`hanchou-coordinator`, `hanchou-review-login`, or `hanchou-retry-login`.
Apply this to normal work, investigation, interactive coordinators, reviews,
additional workers, and retries. Preserve an explicit user name exactly;
if the chosen name already starts with `hanchou-`, do not add it again.
For a newly created persistent periodic-work workspace, default to
`hanchou-cron`, or `hanchou-cron-<job-name>` when job isolation is needed.

Naming does not require creating a worktree or renaming/moving an existing one.
Keep the placement decision, current conversation/Run, and pinned sources
unchanged. A matching name is not identity, ownership, or permission to reuse:
verify the exact workspace's project, host, required parent lineage, purpose,
and current owner before reuse. On a name collision, choose a short meaningful
suffix for a default name or another verified suitable target; if an explicit
name cannot be honored, report the conflict and resolve the choice with the
user. Never overwrite, rename, or remove another workspace to free the name.
After an uncertain creation result, reconcile the original receipt before
trying another name; a suffix is not permission to duplicate unknown work.

## Future interactive entrypoints

When child placement is required, before opening a new coordinator use the installed public `orca-cli` worktree
and agent/session workflow to discover the intended parent and explicitly
create its child, or select an already verified designated child when reuse is
appropriate. Compare that intention with the actual creation/launch selector;
do not substitute current/main or a parentless worktree for a child request.
Verify the creation receipt and current public workspace identity, including
path, parent lineage, host, and project, before starting task work. Invoke
`hanchou-orchestrator` explicitly in the new session and apply its normal startup
and session invariant. A fresh interactive coordinator is a new conversation,
not a supervised worker forced into the prior coordinator's Run. Never create a
second coordinator owner of that Run to satisfy a placement preference.

An already running conversation stays in its current workspace and bound Run.
If a child preference arrives there, acknowledge this boundary and apply it to
future launches. Do not silently clone, rebind, migrate, or replace this
conversation. Explain the supported future-entrypoint workflow above; perform
any requested transfer separately with explicit ownership and preservation of
committed, uncommitted, untracked, and ignored results. A new checkout does not
inherit local policy or artifacts. Preserve the selected policy source and
snapshot; placement alone never authorizes copying it or switching to a
same-named file in the target.

## Supervised workers and verification

Carry the effective preference and intended parent/host/project into every Task
and compare them with the installed live placement guide's selector before
launch. Keep supervised workers in their coordinator's Run, including reviews
and retries. For a child requirement, verify explicit parent lineage as well as
the actual path, host, and project from the start receipt and public workspace
inspection. A separate-workspace requirement only requires the separation it
names; do not silently strengthen it to child-only. Follow [routing.md](routing.md)
for safe reconciliation if a mismatched receipt may already have delivered work.

If the public contract cannot express or verify the requested parent/host/project,
report unsupported or unknown placement and stop that launch; do not guess a
selector or silently fall back to main, another host, or a top-level workspace.
Use a supported explicit creation plus exact existing target only when the live
guide permits it and ownership is clear. Fresh sessions may reuse an appropriate
designated child; they do not imply a fresh checkout every time.

## Scheduled coordinators and retention

Apply the same placement verification when configuring independent Automations,
using `hanchou-cron`'s setup and execution rules. Keep the pinned definition and
policy sources independent of the execution target. Compare all exposed target
representations in the saved Automation with the intended workspace before any
authorized trial or enablement. Conflicting or missing evidence means the
target is unverified; do not guess which field wins. A startup prompt cannot
prevent the wrong tab from already having been created.

An intentionally persistent cron child may host fresh, independent occurrences.
The fixed name or workspace does not make concurrent edits or overlapping
launches safe; retain the cron execution policy's ownership and overlap checks.
Record its retention reason, owner, and next review; distinguish it from
temporary worker workspaces covered by [cleanup.md](cleanup.md). Releasing one
worker or completing an occurrence does not authorize deleting the persistent
child or its pinned sources. Placement isolation does not provide launch-failure
backpressure, authentication recovery, or atomic overlap prevention. Preserve
unknown ownership/results and any instruction to keep cron disabled.
