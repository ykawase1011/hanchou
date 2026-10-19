# Task design

Use the smallest useful Orca DAG:

- one worker job: one Task;
- independent work: sibling Tasks;
- ordered work: only the dependencies that enforce the order;
- aggregation: a parent Task only when it represents real acceptance across children;
- review: a separate dependent Task when independent review is justified.

Every Task spec should state:

- objective and scope;
- target repository/worktree when relevant;
- acceptance evidence;
- required verification;
- constraints and explicit non-goals;
- expected result or artifact.

Include the effective project policy snapshot and source, request's current authorization, placement, role-specific completion
conditions, and the applicable acceptance references. In supervised worker
briefs, include the checkpoint/drain obligations from [inbox.md](inbox.md) and
the worker-side IPC check from [worker-evidence.md](worker-evidence.md), keeping
the live injected preamble authoritative for handles and lifecycle commands.
Before dispatch, record in the Task spec whether placement was explicitly
requested, inherited from a stated conversation/project policy, or unspecified;
name the selected target, intended parent when child lineage is required, host,
project, and the requirement to compare selector, receipt, and actual workspace
identity under [placement.md](placement.md). Recheck this for an independent
reviewer, retry, or added worker rather than copying a previous `worker-start`
selector.

Include the [routing policy snapshot](routing.md#scoped-model-and-effort-policy):
source and scope of model/effort and cost/quality preferences, the assignment's
role, fixed versus selectable versus unspecified values, allowed alternatives
and ceilings, and the latest applicable correction. Preserve the role rules for
descendants as well as the current selection; a nested coordinator does not
inherit the main coordinator's exception. State task difficulty, the selected
model/effort or configured-default intent, and a short sufficiency reason. Name
the required requested/effective receipt comparison, unknown-value handling,
and any unresolved capability or policy decision. Apply this to investigation,
implementation, independent review, added workers, follow-ups, and retries.
On a policy change, also carry preserved results, reconciled external-operation
status, old-owner settlement/exit evidence, and remaining-work ownership under
[mid-task corrections](routing.md#mid-task-corrections). The Task snapshot is
selection intent, not proof that any session's settings changed.

For investigation or authentication, apply [secret-inputs.md](secret-inputs.md)
before reading inputs. Include in the worker brief the exact input scope,
authorized authentication route (or none), forbidden full/line/env output,
the allowed non-secret metadata/boolean schema, and safe failure outputs.
Name stdout/stderr, exceptions, child-process failures, and browser evaluation
returns as boundaries to check; specify how a broken procedure is distinguished
from success. Carry these constraints into steering and independent review,
without embedding credentials, source excerpts, or raw failure receipts in the
Task. A generic “do not output secrets” instruction is insufficient.

For browser/API or DB-backed feature QA, carry the
[health/readiness/functional-QA contract](browser-qa.md#before-feature-qa-health-and-readiness)
into the Task before checks start: intended-target source, evidence of the
application's effective connection and identity, authorized metadata comparisons,
project-derived read-only representative query source and required tables/views/schema,
expected predicate (including empty-result semantics), bounded execution limits,
and separate acceptance/report fields for all three layers. Name the safe output
schema and failure classes, the stop/escalation path for unknown or failed
readiness, and who may authorize a correction. Neither health success nor query
success substitutes for functional QA; do not embed secrets, row data, or a
project-specific universal query in the distributed skill. Carry the same
contract into independent review and any retry after an authorized correction.

Before creating transient resources, name their intended disposition and cleanup
owner in the Task spec: remove after acceptance, reuse for named follow-up work,
or retain for a stated reason and next action. Reconcile that intent with each
launch receipt's actual resources, including failed starts and retries, in the
Run's public Task/report evidence. Apply this to investigation and review workers
too; keep execution identifiers out of repository files and add no registry.
The sole exception under [status-view.md](status-view.md) is an explicitly opted-in,
private, non-shared, reconstructible snapshot at a verified ignored or
outside-repository destination, retaining minimal non-displayed identity tuples
for presentation comparison only. IDs remain prohibited in distributed files and
other configuration; the exception permits no authority, recovery, execution
ledger or other state store.
Use [cleanup.md](cleanup.md) for the final resource accounting.

For implementation and PR-preparation workers, carry the effective
[PR title policy](request-scope.md#pr-titles) into the Task brief: Japanese by
default, any explicit applicable user override, and original technical terms
allowed. Name who will create/update the PR and return the actual GitHub title
read-back as acceptance evidence. A draft-only worker returns the proposed title;
the authorized publisher still owns the remote read-back before completion.

Create Tasks in the currently bound Hanchou Run. One Task has one owner Run even
when its worker executes in another repository or on a connected Orca server.
Do not duplicate a Task into another Run.

Prefer the live guide's supervised `worker-start`. Use lower-level
terminal/dispatch composition only when the receipt contract says
`worker-start` cannot express the required topology. Process questions,
escalations, heartbeats, and worker completion through the Orca Run Inbox.

Do not manually mark a Task completed after a valid worker completion event if
the live guide says Orca settles it automatically. A timeout, idle terminal, or
heartbeat is not completion.
