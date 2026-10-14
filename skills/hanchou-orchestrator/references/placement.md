# Coordinator and worker placement

Resolve placement from the current explicit request and applicable conversation
or project policy. Record its source and scope: unspecified, separate workspace,
or explicit child of a selected parent. These are different requirements. An
explicit one-task override does not rewrite the standing preference. Without a
preference, preserve the installed Orca guide's defaults; a fresh session alone
does not require a new worktree. This policy does not activate Hanchou.

When the user says “human work stays in main; Hanchou uses explicit children,”
carry that preference into future interactive coordinators, independent
scheduled coordinators, implementation, investigation, independent review,
added workers, and retries. Select the intended parent, host, project, and Git
base separately. A different path, Git branch/base, UI grouping, or common Run
does not establish Orca parent lineage.

## Future interactive entrypoints

Before opening a new coordinator, use the installed public `orca-cli` worktree
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
Record its retention reason, owner, and next review; distinguish it from
temporary worker workspaces covered by [cleanup.md](cleanup.md). Releasing one
worker or completing an occurrence does not authorize deleting the persistent
child or its pinned sources. Placement isolation does not provide launch-failure
backpressure, authentication recovery, or atomic overlap prevention. Preserve
unknown ownership/results and any instruction to keep cron disabled.
