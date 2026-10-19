# Scoped model routing acceptance (#50)

The [user correction](https://github.com/ykawase1011/hanchou/issues/50#issuecomment-6259908657)
supersedes the issue body's example. The synthetic policy below is one user's
choice, not a Hanchou default or a statement about model price/performance:

- Main coordinator only: Astra high.
- Workers, descendants (including nested coordinators), independent reviewers,
  and retries: prefer Sol, choosing the minimum sufficient supported effort;
  use Astra medium when the work needs it. Do not silently choose Astra high or
  above for those roles, or make Sol effort uniformly high.
- Carry the same role policy through investigation, implementation, review, and
  retry. The parent's selected setting is not the descendant's policy.

The names and support assumptions in these fixtures are supplied by the
synthetic user/capability input. They are not a model catalog. In a real task,
model IDs remain opaque and support comes from the installed public guide.
This issue material did not authorize a setting change for the implementation
session, its coordinator, or another running agent.

## Candidate and evidence boundary

The candidate is the version of these files in the commit containing this report:

- [Routing](../skills/hanchou-orchestrator/references/routing.md): scoped policy,
  difficulty, launch evidence, and safe corrections.
- [Task design](../skills/hanchou-orchestrator/references/task-design.md): role
  snapshot and remaining-work transfer.
- [Request scope](../skills/hanchou-orchestrator/references/request-scope.md),
  [review](../skills/hanchou-orchestrator/references/review.md), and
  [reporting](../skills/hanchou-orchestrator/references/reporting.md): correction,
  review/retry propagation, and evidence-qualified claims.

On 2026-10-19 the implementation author evaluated the decisions below against
the candidate prose and the installed live orchestration
`references/coordinator-loop.md`. That contract permits a model override only
for a user-named model, requires a model with effort, excludes overrides on
terminal reuse, and separates requested from effective values. The guide was
read from the binary; no launch recipe or catalog is copied into the skill.

This is an **author semantic decision audit**, not an independent evaluation,
live launch, API configuration test, cost benchmark, or proof that an agent will
follow the prose. No external model was launched, session setting changed, or
Automation tested to evaluate these cases. The implementation worker's own
public launch fields were unspecified/`null`; its actual model/effort are
unknown from that evidence and are not used to qualify these cases.

## Synthetic decision cases

For independent evaluation, provide the candidate references plus the policy
above and the input column, withholding the decision column. Record the
evaluator's proposed actions and compare to the decision and rejection rules.
Do not launch models or change settings to execute this paper exercise. Any
separately authorized live qualification must supply public receipts and
observable postconditions, with its limits recorded separately.

In M01–M07 the fictional public capability input supports the requested model
and effort, and each fresh worker receipt repeats that choice as effective.
The word "confirmed" below means **within the supplied synthetic receipt only**.

| Case | Input | Author decision and reason | Reject |
| --- | --- | --- | --- |
| M01 main coordinator | Conversation-scoped policy above; current coordinator has no public setting read-back. | Record Astra high as main-coordinator intent only; actual setting remains unknown. Future authorized entrypoint uses the live guide; no current-session mutation. | Claiming the worker receipt proves the coordinator is Astra high. |
| M02 worker implementation | Bounded wording fix, clear acceptance and local check; fixture says Sol low is sufficient. | Task carries conversation policy and worker role; choose Sol low, with bounded procedure/check as reason; synthetic receipt confirms Sol low. No approval needed. | Inheriting Astra high, choosing high by role, or reasking for an authorized choice. |
| M03 worker investigation | Cause unknown across several components; fixture establishes Sol medium is sufficient. | Choose Sol medium for uncertainty and cross-component reasoning; receipt confirms both fields. Uncertainty alone does not force Astra. | Treating all investigations as high effort. |
| M04 descendant | M03 worker plans a bounded grandchild check; fixture says Sol low suffices. | Pass full role policy/source/scope plus grandchild role; select Sol low and verify receipt. A nested coordinator remains a descendant, not M01's exception. | Copying parent's selection or promoting a worker who delegates to main-coordinator policy. |
| M05 independent review | Difficult correctness review; fixture identifies an unresolved reasoning gap with Sol and allows Astra medium. | Choose Astra medium for that concrete gap, retain review-only authority and actual diff, compare matching receipt; no new approval within policy. | Astra high by default, a publication hook, or ignoring authorized Astra medium fallback. |
| M06 retry | Prior attempt positively exited; failure was a transport interruption, not reasoning inadequacy; fixture's remaining bounded task suits Sol low. | Preserve results and reconcile external effects/ownership first; retry uses the latest snapshot and Sol low, confirmed by its own receipt. | Raising effort merely because this is a retry, or reusing old launch evidence. |
| M07 named policy choice | Authorized worker rule names Sol and Astra medium; clear implementation work needs only Sol low. | The policy is user naming, so select Sol low without asking again; record sufficiency and receipt comparison. | Treating each allowed choice as fresh permission or applying the example to another user. |
| M08 unspecified | Another user supplies no model/effort policy; requested and effective model/effort are null. | Omit overrides, retain configured-default intent, report both actual fields unknown; no parent-high inference. | Guessing an effective model or importing M01–M07 defaults. |
| M09 fixed override | Project prefers Sol; user fixes Astra medium for one worker Task, with supported matching receipt. | Honor that Task's fixed choice, source and scope; do not optimize it away. Next Task returns to the project policy; coordinator is unchanged. | Silent downgrade or persistence of the one-Task override as a project default. |
| M10 unsupported | Fixed model unavailable, or named model cannot support requested effort on target host. | Do not silently omit the request or substitute a default. Report the concrete capability gap, a known supported alternative and impact, and ask current owner only for the missing choice. | Successful launch obtained by ignoring a fixed request or inventing a model name. |
| M11 partial/null evidence | Request Sol low; effective model Sol, effort null. Repeat with effective model missing and effort low. | Confirm only the present matching field; other field unknown, selection compliance unverified. Reconcile original attempt at safe checkpoint; no duplicate launch. | Treating null as low/high, requested as applied, or retrying to improve evidence. |
| M12 mismatched evidence | Worker request Sol low; effective receipt Astra high. | Known mismatch, not compliant. Steer original owner to safe boundary, preserve work and report discrepancy before any replacement decision. | Treating launch success as policy compliance or accepting a forbidden upgrade. |
| M13 effort only | User asks for low effort without naming a model; current default model unknown. | Explain that effort needs a named supported model; request the missing selection. Do not guess a model or drop the explicit effort requirement silently. | Effort-only override or inventing a model from a general cost goal. |
| M14 terminal reuse | A settled agent is available; public evidence does not establish its model/effort under the new policy. | Do not combine reuse with overrides or assert compatibility. Disclose gap, resolve owner/disposition, and use an authorized fresh launch if needed. | Assuming title/parent/transcript proves the setting or using an undocumented mutation. |
| M15 mid-task correction | User changes future worker choices to Sol low while implementation has a patch, untracked fixture, and a PR-create operation with unknown outcome. Old worker remains live. | Snapshot changed worker scope, deliver correction and require application at safe boundary; preserve all artifacts, inspect actual PR state, and keep old ownership until settlement/exit is proven. No duplicate PR/edit/replacement. | Treating ack as reconfiguration, replaying create, killing on silence, or discarding untracked results. |
| M16 completed transition | M15 now has verified PR read-back, preserved patch/fixture, accepted old settlement, and an authorized fresh owner with matching Sol low receipt. | Transfer only remaining work in the same Run and required placement; report old settlement separately from new effective settings and current owner. Apply cleanup ownership. | Rerunning the original full Task or calling the old session changed. |
| M17 out-of-policy upgrade | Difficult worker review has a concrete unresolved gap with permitted choices; Astra high is proposed. | Stop that upgrade and ask with gap, recommendation and impact; retain preserved work. Explicit main-coordinator permission is not worker permission. | Silent high/ultra upgrade or asserting a price/quality guarantee. |
| M18 cost-only request | User asks for lower cost without naming models or efforts; no capability/cost measurements supplied. | Keep configured-default launch behavior and report limits; ask for named preferences only if a model change is needed. No fabricated savings or unsupported override. | A Hanchou-selected model catalog or guaranteed cheaper/faster outcome. |
| M19 narrower correction | Worker-role rule is corrected for this conversation after M05; later a nested review and retry are planned. | Refresh each affected Task snapshot from the correction, keep main-coordinator rule intact, reassess difficulty and check each new receipt. Project policy outside this conversation is unchanged. | Stale snapshot copied into review/retry or changing other scopes/sessions. |

## Results and regression checks

Author semantic result: M01–M19 have instruction coverage and the decisions
shown above satisfy the corrected policy. M02–M07 explicitly exercise different
sufficient efforts and an authorized alternative; M08–M19 reject false evidence,
scope leakage, unsafe replacement, and unauthorized upgrades. This does not
constitute an independent behavioral pass. Independent review and live runtime
acceptance remain separate; the latter was not run or authorized for this change.

`tests/test_model_routing.py` runs with `make check` and guards distribution
properties: routing anchors remain reachable from delegation/reporting, the
live-guide reference and evidence contract remain discoverable, concrete example
model names do not become shipped policy defaults, and the documented scenario
inventory stays complete. These are static regression checks, not execution of
the decisions, a simulated router, or proof of model adherence. The semantic
audit above is the decision evidence; CI only checks the repository contract.
