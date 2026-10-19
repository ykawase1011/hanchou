# Worker evidence and recovery

Before start/reuse or recovery, read the applicable live orchestration reference.
Describe only the stages actually observed: worker session created (and terminal
created only when confirmed), agent readiness
confirmed, input accepted, work/turn start confirmed, and valid completion. These
are separate facts; input acceptance does not prove a turn or working IPC.

## Reuse qualification before submission

Before submitting the next Task, reconcile the original start receipt's session
kind with the target version/host's public orchestration guide and command help.
Distinguish terminal-backed workers from structured agent sessions; an absent or
ambiguous kind stays unknown. A handle's spelling, a field named terminal, or a
successful Inbox/lifecycle call does not prove terminal compatibility. Use public
worker read/show for inspection; do not probe terminal verbs to discover support.

The live guide's same-terminal reuse example applies only when its prerequisites
hold for this exact worker. Reconcile it with worker-start help: not every worker
has a terminal, and terminal verbs do not accept every worker handle. Common
orchestration lifecycle support does not by itself qualify the example's reuse
argument for a structured session. Require a documented public reuse route for
the observed session kind and target version, accepted prior settlement, current
ownership, exact workspace/host, and compatibility with the next Task's policy.
For a structured session, use only its explicitly supported route and evidence
requirements; if that route or its prerequisites cannot be confirmed, mark reuse
**unqualified** before submission. This is not proof that every version lacks
structured reuse. Missing support belongs to Orca; add no Hanchou adapter,
launcher, private session operation, or handle translation to bypass it.

For unqualified or unsupported reuse, preserve committed results, uncommitted
diffs, untracked/ignored artifacts needed for acceptance, and external-operation
status. Confirm the old Task/Dispatch's accepted settlement and current ownership
before official release under [cleanup.md](cleanup.md). Verify the release result
and no overlapping owner before starting an already authorized next Task on a
fresh worker. An uncertain release blocks that transition and follows the live
recovery receipt. Keep the issue's existing implementation workspace/branch when
it is designated as the sole implementation location; a fresh worker does not
require another checkout. Carry actual results and remaining work into the next
Task in the same Run, respecting placement and independent-review boundaries.

A follow-up after accepted completion is a next Task, not a retry of that success.
A retry targets the same positively failed/stopped Task and its prior Dispatch
under the live recovery contract. If a rejected start created no attempt, keep
the already-created next Task if present; do not manufacture a failed Dispatch
or duplicate Task to fit a retry path.

## Refusal versus unknown outcome

A preflight refusal is distinct from a submission whose effects are unknown.
Read the original request receipt, error stage, effects, and residual resources;
reconcile public request status, Task state, and worker/Dispatch ownership in the
same Run and host before concluding that no new attempt/input exists. A nonzero
exit or an error such as `terminal_unsupported_for_agent_session` alone is not a
complete side-effect audit. For a proven preflight rejection with no input/new
attempt, stop using the unsupported route and take the preservation/release/fresh
path above; account for any Task or residual resource that was created.

After possible submission, `outcome_unknown`, timeout, a missing request receipt,
or an absent list row does not prove rejection. Do not duplicate the Task, resend
input, start a replacement, or release an owner that may already have transferred.
Use the live recovery guide's public request inspection and operation-identity
replay rules for the original request, plus Task and worker evidence, until its
effects and owner are known. A supported replay observes/recovers the same
operation; it is not a new submission. If evidence remains unavailable, report
unknown and the next evidence needed without inventing a recovery command.

## Start and recovery evidence

For readiness timeout, `turn_start_unobserved`, or `outcome_unknown`, reconcile
the original operation receipt (including failed stage and residual resources),
public worker read/show, fleet liveness **and its reason**, and completion mail.
An input-waiting screen alone proves neither readiness nor exit. Missing status,
unchanged output, timeout, and contact loss are absence of evidence, not failure.
Use the live guide's evidence precedence: a positive execution-host observation
can resolve a fleet client-capability gap; a live PTY alone need not be a live
agent. Preserve `live`, `exited`, and `unverifiable` without upgrading absence.

Inspect the original attempt and residual resources before retrying. Follow the
official recovery receipt and operation-identity replay rules; do not resend an
accepted prompt or launch a duplicate editor just because start was unobserved.
Only positive failure/exit evidence and the live recovery contract justify
stop/abandon/retry; an unknown outcome alone does not. Release follows accepted
settlement and its official receipt, not liveness guesses.

After recovery, promptly report the current owner/attempt, any provider change,
and whether the prior worker's termination is confirmed or still unknown. If the
user speaks immediately after recovery, answer against this current state, not
the superseded owner. Never silently substitute an explicitly requested provider.

## Worker-side communication

Require the worker's first Inbox check or preamble-scheduled heartbeat as evidence
that the worker can reach Orca; coordinator connectivity and prompt acceptance
do not establish that reverse path. Keep lifecycle cadence and identity exactly
as injected. Include a reminder in the brief that local IPC can be constrained
by the worker's sandbox even when the coordinator can connect.

On an IPC error, compare the exact error, official public diagnostics, sandbox
policy, and actual tool invocation/receipt. A claim that an operation ran outside
a sandbox is insufficient when the invocation contains no corresponding allowed
execution mode. Re-run the same official command with an authorized permission
mode only when the environment permits it; otherwise report the blocked path.
Never evade restrictions or alter permission policy. Distinguish access denial
from positive runtime-not-running evidence; follow the live guide's recovery
without restarting Orca or duplicating workers based on connection failure alone.

After recovery, confirm a successful worker-side check/heartbeat. Report what
was attempted, the actual result, and any unresolved reachability. Hanchou can
require this operational evidence; IPC error classification, readiness detection,
and missing fleet status fixes belong to Orca and remain unproven here.
