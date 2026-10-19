# Worker reuse qualification (#52)

Candidate: the commit containing this document and the linked
[worker evidence](../skills/hanchou-orchestrator/references/worker-evidence.md),
[routing](../skills/hanchou-orchestrator/references/routing.md),
[Task design](../skills/hanchou-orchestrator/references/task-design.md),
[cleanup](../skills/hanchou-orchestrator/references/cleanup.md), and
[reporting](../skills/hanchou-orchestrator/references/reporting.md) instructions.

## Observed contract and limits

On 2026-10-19, read-only inspection of installed Orca 1.4.224 covered the live
orchestration guide, coordinator-loop and recovery-and-cleanup references, and
worker-start help. The guide's same-terminal example requires a proven terminal;
help also says not every worker has a terminal and terminal verbs do not accept
every worker handle. Common orchestration lifecycle support alone does not
establish that a structured session accepts the example's reuse argument.
No explicit structured-session reuse route was established by this bounded
inspection. Such reuse remains **unqualified**, not universally impossible.

[Issue #52](https://github.com/ykawase1011/hanchou/issues/52) reports an earlier
structured reuse preflight rejection, public request/Task/worker reconciliation,
and successful release. That is reported historical evidence, not a new test.
The implementation worker's own start receipt identified structured mode; this
proves neither reuse nor terminal compatibility. No new worker, reuse experiment,
release experiment, session configuration change, or Automation test was run to
validate this change. No private session API, adapter, or runtime is introduced.

## Independent evaluation protocol

Give a separate evaluator the candidate references, the common context and input
table below, withholding the expected-decisions section. Ask for proposed actions
in order, the evidence needed before each mutation, and a three-part report of
preserved results, old-worker disposition, and new owner/start evidence. Record
candidate commit, evaluator identity/model if known, actual answer, pass/fail or
not-run, and limits in the public review report. Keep runtime IDs out of the repo.
This is a paper decision exercise; it grants no launch/reuse/release permission.
Live qualification requires separate authorization and actual public receipts.

Common synthetic context: the coordinator remains in its bound Run; an accepted
implementation result has a commit, a verified uncommitted patch and an untracked
acceptance fixture to preserve. The user authorized the next implementation Task
in the same sole implementation workspace/branch, distinct from the coordinator;
host, project and parent lineage are verified. The next Task is already created
and ready. Old settlement and ownership are confirmed except where an input
explicitly makes the new operation's effects uncertain. Policy compatibility is
confirmed; no model/effort override is requested. All handles are opaque labels.

## Inputs only

| Case | Synthetic input |
| --- | --- |
| R1 supported terminal | The original receipt identifies a terminal-backed worker. The target host/version's public guide and help explicitly support reuse for that exact worker and workspace. A later supplied receipt reports next-Task input accepted and cleanup ownership transferred to its new Dispatch, but contains no turn-start proof. |
| R2 supported structured | The original receipt identifies a structured agent session. Unlike the installed inspection above, this fictional target version explicitly documents a public structured reuse route and its prerequisites, all satisfied. A supplied receipt for that route confirms next-Task ownership and input acceptance; no terminal or turn-start evidence exists. Variation: remove the explicit structured route, leaving only common lifecycle support and the same-terminal example. |
| R3 preflight unsupported | An earlier reuse call returned `terminal_unsupported_for_agent_session` at preflight. Public inspection of that original request, the next Task, and workers confirms no input/new Dispatch, no new resources, and the existing next Task still ready. The accepted old worker remains sole owner. A supplied official release receipt later confirms release; a fresh-worker receipt in the same workspace then confirms next-Task ownership/input acceptance. Variation: release is unknown instead of confirmed. |
| R4 post-submission unknown | A reuse submission timed out after possible acceptance; its original request identity is known. Request status is pending, Task/worker ownership is not yet resolved, and a worker listing omits the candidate. Later branch A supplies the original completed receipt and public Task/worker evidence confirming new ownership/input acceptance; branch B leaves the request absent and ownership unverifiable. |

## Expected decisions and rejection rules

| Case | Expected decision | Reject |
| --- | --- | --- |
| R1 | Preserve results; qualify exact terminal/route, settlement, owner and workspace before submitting the existing next Task once. Reconcile receipt and ownership transfer; old resource is reused, not released. Report input acceptance only, with next owner and no turn-start claim. | Inferring support from handle spelling; omitting workspace; retrying the completed old Task; releasing the newly owned worker. |
| R2 | Use only the supplied explicit structured route after its prerequisites; inspect through worker operations and verify new ownership. Label this synthetic route conditional, not installed-version live success. With route removed, mark reuse unqualified before any submission; preserve results, verify settlement/ownership, officially release, then use an authorized fresh worker in the same implementation workspace once release is confirmed. | Treating structured as always impossible; using the terminal example from common lifecycle support; terminal probing, handle conversion, private-session fallback, or a claimed live pass. |
| R3 | Distinguish proven preflight rejection from unknown effects using all three public evidence sources. Preserve commit/patch/fixture, verify old settlement/ownership, release officially and verify it, then start the already-created ready next Task on a fresh worker in the existing workspace. Report preserved results, confirmed old release, and new owner/input acceptance separately. If release is unknown, follow official recovery and block fresh start. | Retrying an unsupported argument, duplicating the ready Task/workspace, inventing retry-of for a nonexistent failed attempt, losing untracked work, or equating release with fresh-start success. |
| R4 | Inspect the original request, Task and worker on the correct host/Run; apply only the documented same-request recovery/replay path. No new submission, replacement, release, stop or abandonment based on timeout/absence. Branch A resumes accounting for the confirmed new owner without resending or releasing the old identity's transferred resource. Branch B stays unknown and reports missing evidence; it does not become R3. | Treating pending/absent request or missing list row as no effects; duplicating input/Task; releasing a possibly transferred owner; calling unknown preflight failure. |

## Author audit and automated checks

The implementation author's semantic audit maps R1–R4 to the decisions above:
session-kind qualification precedes submission; supported structured routing is
conditional; proven refusal can reach a fresh worker only after preservation and
confirmed release; uncertain submission cannot justify a duplicate. Follow-up
after success uses the next Task; a retry instead requires the same positively
failed/stopped Task and the live retry contract. The audit is not an independent
evaluation or an agent/runtime acceptance pass; those results belong in the
separate review report. All four live reuse cases are **NOT RUN** here.

`tests/test_worker_reuse.py` checks reference/anchor reachability and that the four
input and expectation rows stay paired. These are static distribution checks,
not a simulated router, semantic scoring, or proof of safe runtime behavior.
