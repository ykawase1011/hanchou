# Worker evidence and recovery

Before start/reuse or recovery, read the applicable live orchestration reference.
Describe only the stages actually observed: terminal created, agent readiness
confirmed, input accepted, work/turn start confirmed, and valid completion. These
are separate facts; input acceptance does not prove a turn or working IPC.

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
