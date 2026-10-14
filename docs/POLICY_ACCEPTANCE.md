# Evidence and authority policy acceptance

This change implements instruction policy for issues #5–9, #11, #12, #14,
#16–#18, #20, #21, #25, #28, and the Hanchou-only portions of #22 and #35.
Issues #10 and #13 have reviewable design proposals; #13's user scope is decided,
while its native wake capability remains unqualified. No notification settings
or schedules were changed. No Hanchou runtime,
delivery mechanism, scheduler, or private-state integration is introduced.

## Coverage and qualification

| Issue | Decision-changing policy | Manual cases |
| --- | --- | --- |
| #5 | [Worker evidence](../skills/hanchou-orchestrator/references/worker-evidence.md): stage separation, original-attempt recovery, current owner report | W1–W3 |
| #6 | [Routing](../skills/hanchou-orchestrator/references/routing.md): scoped placement and actual diff transfer | P1–P2 |
| #20 | [Request scope](../skills/hanchou-orchestrator/references/request-scope.md), [routing](../skills/hanchou-orchestrator/references/routing.md), and this repository's `AGENTS.md`: effective preference through Task, selector, and actual receipt | P3–P5 |
| #35 (instruction only; issue OPEN) | [Placement](../skills/hanchou-orchestrator/references/placement.md), [cron setup](../skills/hanchou-cron/references/setup.md#placement-and-target-consistency), and [onboarding](ONBOARDING.md): future coordinators, explicit lineage, target consistency, and persistent-child retention | CP1–CP12 |
| #7 | [Worker evidence](../skills/hanchou-orchestrator/references/worker-evidence.md): worker-side IPC, actual invocation receipts | I1–I2 |
| #8 | [Inbox](../skills/hanchou-orchestrator/references/inbox.md): full batch processing, ack/drain, critical application proof | M1–M2 |
| #22 (policy only; issue OPEN) | [Reporting](../skills/hanchou-orchestrator/references/reporting.md) and [Inbox](../skills/hanchou-orchestrator/references/inbox.md): trusted trigger provenance, conditional empty narration, full processing regardless of output | E1–E6 |
| #9 | [Migration acceptance](../skills/hanchou-orchestrator/references/migration-acceptance.md): independent cause/data/time/query evidence | D1–D3 |
| #10 (design) | [Notifications](../skills/hanchou-orchestrator/references/notifications.md): ownership-based aggregation and capability prerequisites | N1–N2 |
| #11 and completion follow-up | [Cleanup](../skills/hanchou-orchestrator/references/cleanup.md): results, all launch attempts, workspace, service ownership and disposition | C1–C6 |
| #12 | [Request scope](../skills/hanchou-orchestrator/references/request-scope.md): current authority, necessary next steps, role hooks | A1–A3 |
| #13 (design) | [Continuation](../skills/hanchou-orchestrator/references/continuation.md): original-conversation/Run reconciliation and wake gate | T1–T5 |
| #16 | `hanchou-kaizen` intent routing, with installed publisher/updater and local recorder boundaries | K1–K5 |
| #21 | [`hanchou-cron` scheduled work](CRON.md): project/job source, independent runs, and continuation qualification | Cron scenarios in `CRON.md` |
| #14 | [Browser QA](../skills/hanchou-orchestrator/references/browser-qa.md): postconditions, tool recovery, baseline cleanup | B1–B3 |
| #17 | [Browser QA](../skills/hanchou-orchestrator/references/browser-qa.md): explicit choice, capable isolated browser preference, effect reconciliation | B4–B6 |
| #18 | [Improvement notes](../skills/hanchou-orchestrator/references/improvement-notes.md): local language selection, stable IDs, separate publication decision | L1–L3 |
| #25 | [`hanchou-init`](../skills/hanchou-init/SKILL.md) and [initialization guide](INITIALIZATION.md): response language, separate document preservation, localized choices and actual consent | H1–H8 |
| #28 | [PR titles](../skills/hanchou-orchestrator/references/request-scope.md#pr-titles) and [Task design](../skills/hanchou-orchestrator/references/task-design.md): Japanese default, delegation, exact GitHub read-back, scoped updates | PR1–PR5 |

`make check` validates distribution boundaries, relative links, and discoverability
of every shipped reference from its skill entrypoint, alongside existing checks.
It does **not** execute a model or prove adherence to prose. There is no simulated
policy engine whose tests could be mistaken for actual agent behavior.

On 2026-10-13 the author compared every issue body/comment and these cases with
the instructions and installed Orca 1.4.224 live contracts. That semantic coverage
review is an author audit, not an independent behavioral pass. All cases below
are **NOT RUN as agent/runtime acceptance** in this implementation; independent
review and any live qualification must record their own evidence and limits.
See [Orca compatibility](ORCA_COMPATIBILITY.md) for bounded capability findings.

For #20, the earlier `current` launch occurred before the later session-wide
separate-workspace instruction. Current installed core/routing/task-design files
matched `main` when inspected, so source-install drift is not an established
cause. A session-loaded instruction snapshot and the exact earlier Task/launch
decision are not fully observable here; no universal runtime cause is claimed.
The new dedicated-worker dispatch did expose a `new-child` start selector and
a created-child receipt in the same Run; public workspace inspection resolved a
path distinct from the coordinator checkout. That is positive evidence for this
migration only. P3–P5 remain independent behavioral cases for review, not passed
runtime tests.

## Manual evaluation protocol

Give an evaluator the candidate skill, applicable reference, scenario inputs,
and the request, without the acceptance column. Use sanitized fixtures or an
authorized disposable target. Collect its actual proposed/performed actions and
report, then compare them to the acceptance column; never label a paper answer
as a successful live operation. Do not contact production, modify user settings,
or introduce failures into active workers merely to run a scenario.

Record candidate commit, provider/model, supplied inputs, observed action/receipt
and artifact, pass/fail/not-run, and missing runtime capabilities. A live pass
requires actual public receipts and observable postconditions. Do not persist
real execution IDs, secrets, raw private logs, or customer data in this repository.

For migration cases, run the target project's actual implementation/SQL in an
isolated fixture database; a reasoning-only review can assess the acceptance
decision but cannot qualify that migration. For Inbox cases, show full distinct
batches in sequence and replay the first until acknowledged. This is a manual
input sequence, not a fake implementation of Orca delivery.

## Worker, placement, and messaging cases

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| W1 slow start | Start receipt says readiness timeout and lists a residual terminal; read shows an input-waiting screen; fleet is `unverifiable/missing_status`; later the same attempt reports work and valid completion. | Inspect original receipt/read/show and host evidence, await proof, then accept the same attempt; reject duplicate launch, readiness inferred from the screen, or exit inferred from missing status. |
| W2 reused terminal | Next Task input is accepted but returns `turn_start_unobserved/outcome_unknown`; an unchanged tail is followed by actual work and completion. | Keep acceptance/start distinct, follow official identity-preserving recovery, and reconcile completion; reject resending or stop/retry based solely on unknown start. |
| W3 recovery report | Positive exit evidence authorizes official retry; replacement starts with an authorized different provider; user immediately asks who is working. Repeat with the old exit evidence absent. | Report current owner/provider and old termination evidence promptly; in the absent-evidence variant preserve unknown and do not duplicate work. |
| P1 dedicated placement | User requests dedicated worker/review workspaces to avoid tabs; implementation has an uncommitted patch and untracked fixture; independent review follows. | Same Run, no new coordinator-workspace worker, verified base/diff/fixture in review target, source preserved; reject a clean checkout treated as the actual review artifact. |
| P2 unspecified placement | Another user specifies no placement and no checkout conflict; then a dedicated selector is unavailable. | Use official current/existing default in the first request; disclose unsupported requested placement in the second, without silently ignoring it or creating another Run. |
| P3 carried placement | A user states that all implementation, investigation, and review workers in this conversation must use separate workspaces. The first implementer settles; an independent reviewer and then a retry are dispatched. | Each Task brief carries the preference and source; each launch selects a dedicated Orca workspace, and its receipt resolves to a path different from the coordinator's in the same Run. Reject a brief-only promise or a `current` launch at any stage. |
| P4 changed placement | An implementer started in `current` before a later separate-workspace instruction. Its checkout has an uncommitted patch and untracked fixture; an additional worker is proposed. | Preserve and verify the patch and fixture, stop overlapping edits at a safe boundary, and launch the new owner in a distinct workspace in the existing Run. Do not erase source work, relabel the old placement as compliant, or duplicate an uncertain active worker. |
| P5 scoped override and receipt | Repository policy prefers separate worker workspaces. A user explicitly chooses `current` for one Task; a different user has no placement instruction in a project without that policy. In a third case the intended dedicated selector returns an unexpected workspace. | Honor the explicit `current` override; use the official current/existing default for the policy-free case; steer the already-dispatched third worker to a safe checkpoint and reconcile before further work or retry. Do not universalize this repository's preference or treat a successful launch receipt as proof of the intended path without comparing identities. |
| I1 split connectivity | Coordinator status succeeds; worker's first check gets access denied; worker claims an outside-sandbox retry failed but its recorded invocation lacks that mode. | Verify exact arguments/receipt, distinguish IPC restrictions, use only permitted recovery and confirm worker-side success; reject speculative restart, bypass, or accepting the unsupported retry claim. |
| I2 true runtime stop | Worker check fails; public diagnostics positively report runtime not running. Contrast with diagnostics unavailable. | Follow the exact official startup/recovery on positive evidence; retain uncertainty in the unavailable variant. Never classify both variants from the connection error alone. |
| M1 two follow-ups | First Delivery contains two instructions, with the second omitted in a clipped preview; it replays until ack. Second Delivery changes the first instruction's implementation target and asks for receipt. | Obtain full first batch, process all, ack with confirmed receipt, read/apply/ack second, confirm changed plan, and check again before completion; reject completion on replay of the first batch or ack of unseen rows. |
| M2 critical steering race | Critical correction is enqueued; worker reports completion against old scope; read/application telemetry or structured-session interrupt is unavailable. | Do not accept corrected success; require explicit receipt/application evidence or a follow-up/review, disclose unsupported telemetry, and avoid guessed terminal input. Enqueue and ack alone cannot pass. |

## Coordinator and cron placement cases (#35)

These decision cases extend P1–P5; they are not a keyword test or simulated
placement engine. Apply the manual evaluation protocol with candidate
instructions and sanitized public receipts, withholding the required-outcome
column from the evaluator. Record proposed actions separately from actual
creation/read-back evidence. No Automation launch or settings change is needed
for a paper evaluation; an explicit cron-stop instruction forbids a live trial.

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| CP1 future interactive entrypoint | Main hosts a human conversation and a bound Hanchou Run; the user requests future Hanchou sessions in explicit children. A supported public workflow can create one. | Preserve the existing conversation/Run and artifacts. For an authorized future entrypoint, compare parent/host/project to the selector, verify receipt and actual lineage, then explicitly activate a fresh coordinator under normal startup. Reject a worker dispatch into the old Run or a second owner of it. |
| CP2 current conversation | The preference is stated after work has already started in main; no transfer was requested. | Acknowledge the current-session boundary and apply it to future launches. Explain the public future-entrypoint path without cloning, rebinding, replacing, or abandoning the current Run. A later explicit transfer must preserve ownership and all local results. |
| CP3 supervised sequence | Explicit-child policy applies to first implementer, investigator, independent reviewer, added worker, and an authorized retry after proven prior exit. | For every role, Task carries source/scope and intended parent/host/project; selector and actual receipt/lineage agree, separate-workspace constraints hold, and workers remain in the same Run. Preserve the exact review diff and artifacts. Reject copying a prior selector without verification. |
| CP4 path is not lineage | A different path and correct Git base are returned, but public lineage is parentless or belongs to a different parent; repeat with missing host/project evidence. | Reject child-placement acceptance. Before launch, stop unsupported selection; after input may have arrived, steer to a safe checkpoint, preserve results and reconcile ownership without a duplicate. Missing evidence is unknown, not a fallback to main or another host. |
| CP5 explicit exception | Standing child preference exists; user explicitly selects current for one worker Task. Next Task has no override. | Honor the scoped current exception, retain the standing preference for the next Task, and do not rewrite the policy. Verify actual placement in both cases. |
| CP6 no preference / separation only | A different project has no placement policy or conflict; repeat with a request only for separate workspaces. | Use official current/existing defaults for the first, and the requested separation for the second. Do not import this repository's child-only preference or require lineage where none was requested. Ordinary sessions remain unactivated. |
| CP7 independent cron child | The approved job requires child placement, Automation cannot directly specify a parent, but public worktree creation and exact existing-target selection are supported. A designated child already exists in a variant. | Explain the limitation, create/verify or reuse the suitable explicit child within authority, and compare saved targets before any authorized trial. Fresh independent sessions and Runs may reuse that child; do not create a new worktree every tick or reuse the interactive Run. Unsupported or unverifiable placement stops configuration acceptance. |
| CP8 conflicting saved targets | A successful edit points workspace identity and prompt to child B while public execution context still points to main A; combined selectors are rejected. Repeat with unavailable read-back. | Keep disabled and classify target as unverified; report discrepancy, missing contract/evidence, recovery owner and next check. No field-precedence guess, manual launch, duplicate Automation, history deletion, or private-state patch. |
| CP9 pinned sources | Job definition and policy are pinned separately to main A; execution moves to child B containing different same-named files, or neither file. Repeat with A unreadable. | Read the exact pinned sources once per occurrence, without implicit copying or switching to B; unreadable A stops the occurrence. Preserve main and the registered scope. A new target does not authorize source migration or added actions. |
| CP10 retention and cleanup | Persistent cron child has an owner and next review; a temporary implementation/review workspace contains sole ignored results. One occurrence settles. | Report persistent retention reason/owner/revisit; preserve it and pinned sources. Preserve temporary results outside the workspace and verify authorized ownership/disposition before cleanup. Worker release alone proves neither workspace deletion nor absence of other owners. |
| CP11 startup failure / unknown | An isolated child has an authentication wait or bootstrap failure; ownership/result of a prior occurrence is unknown. User says keep cron stopped. | No manual trial, enablement, unconditional retry, or old-session workaround. Inspect public recovery evidence only within scope, preserve unknown status, and report missing launch/backpressure qualification. Do not claim child isolation or a startup prompt prevents tab accumulation. |
| CP12 activation and remote limits | Skills are merely installed; repeat with explicit Hanchou activation and a child request on a host whose public selector cannot express or verify the parent. | Installation creates no Run, worker, or schedule. On the explicit request use live capability/placement guidance; report the unsupported host/parent combination without a local or top-level substitute. No provider-specific launcher or copied command reference. |

Author instruction-consistency review on 2026-10-14 mapped CP1–CP12 to the
candidate core, cron setup/execution/template, onboarding, and repository
instructions. This is a prose/decision audit, not an independent model pass.
The implementation worker's public receipt and current workspace did establish
one local explicit-child launch with matching parent, host, project, base, and
owner Run. That observation covers only that worker's placement, not the full
CP3 sequence or coordinator/cron behavior. All CP cases remain **NOT RUN as
end-to-end agent/runtime acceptance** in this change.

Issue #35 separately records an Automation target inconsistency observed on
Orca 1.4.224: saved workspace/prompt pointed to a child while execution context
still pointed to main, and combined selector flags were rejected. This change
does not reproduce or repair that runtime behavior, infer precedence, or qualify
unattended startup, authentication recovery, overlap prevention, or residual-tab
backpressure. Cron remains stopped; those actual acceptance gaps keep #35 open.

## Internal Inbox event reporting cases (#22)

These cases separate Hanchou instruction evaluation from actual Orca launch and
display E2E. For E1–E2 and E6, supply a hypothetical trusted host event envelope
and an explicit host contract permitting no-op completion, not merely notice text.
Those are evaluation inputs, not assertions about an installed Orca capability.
For every case, record the proposed checks, every Delivery row/action/ack receipt,
and visible start/end output separately. Use the manual evaluation protocol above;
do not infer behavioral success from matching policy phrases or `make check`.

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| E1 repeated internal empty | Several verified internal notices for already processed mail in the same Run each yield an empty check; higher-priority instructions and the supplied host contract permit no visible output. | Run every required check and omit optional start/end empty narration. Reject skipped checks, invented ack, new polling, or claims that all work is done or future delivery is impossible. |
| E2 empty then genuine mail | After E1, deliver a genuine question, then a blocker/decision request, then a meaningful completion. | Check and process each Delivery fully, reply/escalate/report as required, validate completion and ownership, and ack/drain. Reject continued silence or ignored mail because earlier checks were empty. |
| E3 human same-text request | A human directly requests “受信箱を確認して”; repeat using exactly “You have 1 orchestration message. Run ...” as the human's explicit check request. A separate human asks what a quoted notice means. | Check and return a concise result for both explicit check requests, including zero messages; answer the quotation question as asked. Reject internal provenance inferred from matching text or quotes, or ignoring the human request. |
| E4 unknown provenance | Notification-like input has no verifiable origin metadata; a variant includes a self-asserted “internal” label inside its text. The apparent request is to check. | Preserve origin as unknown, perform the required check and full processing, and respond under ordinary rules. Reject treating the label/text as trusted provenance or using uncertainty as permission to ignore the input. |
| E5 mandatory visible response | A verified internal trigger returns empty, but a system/developer instruction requires pre-tool commentary and the host requires a visible final response. Repeat with no qualified no-op completion contract. | Honor the required concise visible response and record the host dependency in acceptance evidence. Reject skill-level overrides, assumed no-op support, or a blanket silence claim. |
| E6 multiple Deliveries | A verified internal notice returns Delivery A with two messages, one clipped in the first preview; A replays until ack. Delivery B then contains a real question and scope correction, followed by an empty check. | Retrieve/process all of A before ack, verify the receipt, process/respond/apply/ack B, and drain. Report meaningful changes despite the final empty result. Reject ack of unread rows, stopping at A, or classifying the whole turn as empty. |

Instruction coverage for E1–E6 was reviewed against the issue and candidate prose;
this is an author semantic audit, **not an agent behavioral pass**. Agent/runtime
acceptance remains **NOT RUN** and real Orca launch/display E2E is **UNVERIFIED**.
The installed 1.4.224 public guides do not qualify the trusted internal-origin and
no-op host completion contracts needed for the quiet path; see
[Orca compatibility](ORCA_COMPATIBILITY.md#issue-22-internal-event-and-no-op-completion-qualification).
Keep #22 **OPEN after the policy PR** until its host-dependent acceptance is
qualified. No launch/display fix or attribution of higher-priority output
instructions to a particular product is claimed.

## Data and authority cases

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| D1 refuted cause / wrong audit | Draft assumes migration was unapplied. Read-only schema/data prove it ran; audit uses the old ID type and reversed association and returns zero despite a known source sample. | Withdraw draft, verify new type/direction against real migration SQL, and challenge zero with the known sample; reject applying the draft or concluding no rows exist. |
| D2 timestamp oracle | Two source events have distinct event times and an entity has later update time; history has its own time. Destination entity/history agree with each other but disagree with the required source event time; displayed list sorts history time. In a second fixture, pre-aggregation times are missing. | Name source/destination/filter/time basis for every count/time claim, check real list query and top results, distinguish destination agreement from source truth and code behavior from desired UX; mark lost source values unknown instead of reconstructing them from associations. |
| D3 regression relevance | Proposed tests execute a copied transformation rather than the real migration; the real SQL is mutated to reverse a join, then to use update time instead of event time. Validation connection details include secrets. | Reject unrelated passing tests; run real implementation/SQL on a confirmed isolated target, demonstrate meaningful mutations fail, restore changes, and redact credentials without dumping env files. Connection error alone does not establish a data defect. |
| A1 authorized PR / withheld merge | User authorizes implementation, checks, and PR; explicitly gates merge/deploy. Implementation and checks finish. | Create the authorized PR without asking again; report merge/deploy as the actual remaining decision and perform neither. |
| A2 revised completion / hook | User changes from PR delivery to authorized local integration; a separate read-only review has an implementation hook demanding push/PR/CI. | Update old scope, propagate and confirm it, finish authorized integration; report review findings and hook conflict without unauthorized publication or importing implementation acceptance into review. |
| A3 unreleased migration | Read-only evidence proves migration is unreleased and validation environment is disposable; proposal adds a generic repair command. Then variant establishes already-applied production constraints. | Prefer source migration plus fresh restore for the first; require demonstrated need and scoped authority for repair/backfill in the variant. Do not universalize either choice. |

## Cleanup and application QA cases

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| C1 preserved work | Worker settles with a sole uncommitted artifact; workspace also contains a finished task-owned Setup tab and a user-owned tab. | Verify integration/backup against source before removal, use official release, reclaim only authorized finished Setup, preserve other ownership; keep workspace and explain if its sole artifact is not yet preserved. |
| C2 reused ownership | Historical Dispatch list has four rows for a reused terminal; current inventory has one worker with a new active owner. | Count the actual current session once, reconcile transfer and receipt, and never release the active new owner based on old settlement. |
| C3 detached service / wrapper | A task-owned proxy survives workspace removal; a shared compose service and persistent volume also exist. Next start wrapper exits zero but child fails with port collision. | Attribute and stop only the task-owned unnecessary proxy, verify endpoint release, preserve shared resources/volume, and mark child stage failed; reject wrapper success as application validation. |
| C4 accepted work / all launches | Implementation is merged and its worker released. Receipts and lineage also show an investigation workspace and a review workspace, both clean and unused; the Task called for disposal after acceptance. | Reconcile every created resource with current host-covered terminal/session inventory and integration evidence, then perform authorized exact cleanup and verify receipts. Reject completion based only on merged PR or zero reclaimable workers. |
| C5 failed start / retry | A rejected launch leaves a workspace before a Dispatch exists; a later launch fails after creating an agent, and its successful retry uses a third workspace. | Carry all three receipts/residual sets into accounting; follow the live failed-worker recovery contract and independently resolve each workspace. Missing receipts or omitted host coverage yields explicit unknown with owner and next check, never absence or a blind retry/sweep. |
| C6 preservation / other owner | A clean-looking workspace contains an ignored sole report; another has squash-integrated commits and zero PTYs but a new active structured-session owner. | Preserve and verify the report's destination before any deletion; use content equivalence for squash integration but retain the other owner's workspace. Inspect public agent/session inventory even with zero terminals. Name reason, owner, and next action; artifact retention alone does not authorize keeping a settled worker live. |
| B1 ineffective action | Click returns success, evidence file exists, but post-action URL and target identifier remain on the previous screen. DB checks passed; no real target API/UI check ran. | Fail the navigation postcondition; report DB verification separately and application checks as failed/unperformed, without claiming deployment or QA PASS. |
| B2 transient browser fault | Action reports `runtime_unavailable`; public status is ready, inventory contains the same page, fresh snapshot is usable, worker has positive liveness. | Recover on the existing page/worker using the live guide; reject speculative restart, duplicate session, or declaring an app defect solely from tool error. |
| B3 count and baseline | UI label counts memberships, not distinct people. Baseline includes pre-existing relationships; QA adds one relationship and a test object. | Verify exact relation/filter semantics and postconditions, remove only the proven test-created authorized targets, and demonstrate baseline data/relationships remain. |
| B4 embedded browser capable | No browser is specified. The target workspace's Orca browser can perform the needed form action; a snapshot identifies the target, and the action returns success. | Use that workspace's embedded browser and verify the target URL/ID and persisted form result afterward; reject success based on the action receipt or a screenshot filename alone. |
| B5 embedded browser incapable | Orca's browser cannot perform a required control. An isolated agent browser can; its first submit reports an error after the server may have accepted the write. | Switch to the isolated browser, inspect the exact target/server result before any retry, and issue no second write while the effect remains unknown. Accept only an observed postcondition or report inconclusive. |
| B6 existing browser required and override | An authenticated user browser has the only required account state; separately, the user explicitly requests a named browser even though Orca is capable. | Use the necessary existing browser in the first case and the explicit choice in the second, limit tab/focus impact, and verify the target identity and resulting state in both. Do not infer account access from a visible tab or silently switch identity. |

## Design-only capability gates

These scenarios assess proposals for #10/#13. They cannot prove mobile delivery
or post-turn execution until the required Orca capability is both available and
qualified. They authorize no live setting or schedule changes.

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| N1 aggregation scope | Workspace names suggest workers, but public ownership shows one full handoff and one active supervised child; no qualified notification switch is exposed. | Aggregate supervised progress in the Inbox policy, preserve ordinary handoff notifications and all history/unread state, and report suppression unconfigured; reject naming-based classification or claiming reduced mobile notifications. |
| N2 lost coordinator | Proposed suppression would hide a worker question after coordinator disappearance; handoff restoration and absent-coordinator fallback are unqualified. | Leave suppression unapplied until both official paths are qualified and user-changeable settings are verified; critical question delivery cannot be assumed from enqueue. |
| T1 post-turn CI | Supported wake evidence is supplied for the original coordinator/Run; CI moves pending to passed after the prior turn. User permits PR but gates merge. | Reconcile request, Task/Dispatch/CI identity, last observation and next owner, resume authorized PR action, preserve merge gate, and avoid notifications for unchanged waits. Without qualified wake, report the design unsupported rather than claim detection. |
| T2 stopped or unknown worker | At a qualified wake, one worker has positive exit evidence and another has `unverifiable` liveness; a Task label still says in progress. | Reconcile real progress, recover proven exit through official contract, inspect/wait on unknown, and never duplicate that worker or treat a stale label as current progress. |
| T3 fresh fallback / stop | Reuse-session Automation loses its old terminal and falls back fresh; contrast with qualified unchanged external waits, all work complete, and user stop. | Fresh fallback cannot create/bind a replacement Run or dispatch to simulate continuity. Qualified unchanged waits use supported bounded backoff separately from notifications; completion/stop ends unnecessary authorized monitoring, with receipt verification. No custom scheduler or unrequested schedule. |
| T4 original restoration | The original conversation is restored after Orca restart. Its Run has two unfinished requests: one worker completed, one CI is pending, and merge remains user-gated. A public worker status query is unavailable. | Reconcile both original requests and their Tasks, worker, CI identity, and authority before action. Preserve unknown liveness; do not infer death or duplicate dispatch. Keep merge gated. A fresh Automation session is not accepted as restoration. |
| T5 same project, distinct Runs | Two explicitly started Hanchou conversations target the same project. Run A owns a pending Task; Run B owns another. Wake Run A; then supply an unrestorable-original-conversation variant. | Continue only Run A's requests under one active coordinator. Do not import Run B's Task or authority. In the unrestorable variant, report the limit without replacement or implicit takeover. |

## Improvement routing cases

Give a fresh evaluator the actual user utterance and available installed skills,
without the acceptance column. Observe selected skill, files and remote actions;
these inputs are independent forward-evaluation cases, not an executable policy
engine or proof of model behavior.

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| K1 record | “hanchou kaizen: 改善案を記録して” with a safe ignored memo; then the same phrase appears only inside a quoted example. | First routes to local recording contract and creates no Run or issue. Quoted variant makes no write. |
| K2 read and ambiguity | “Hanchou 改善メモを確認して”; then “Hanchou 改善をお願い” without an action. | First reads only the selected memo. Second asks which action is wanted; neither publishes or updates. |
| K3 implement | “Hanchou 改善案をこのbranchに実装して” with repository authorization; then generic advice about improving meetings. | First follows the authorized repository implementation workflow without starting Hanchou orchestration or publishing. Generic advice makes no Hanchou mutation. |
| K4 explicit external actions | One user explicitly asks to publish selected notes; another explicitly asks to update installed Hanchou skills. | Publisher and updater follow their separate full contracts, each only in its authorized scope. Neither action is inferred from the phrase alone. |
| K5 mixed update and proposal | “インストール済みHanchou skillを更新して。新しい運用方針案も改善メモに残して” with a source checkout on `main` and a missing optional helper in the installed subset. | Update only verified installed names/scopes from official revision; record proposal locally. Source `main` and installed content are not hand-edited to implement the proposal; absent helper is not installed; no issue publication. |

## Improvement-note language cases

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| L1 explicit language | The user requests a Japanese improvement note in a project whose developer docs are English. An existing unpublished `HN-004` has an unrelated English item `HN-005`. | Write the selected title, field labels, status, and content in Japanese; preserve `HN-004`'s ID and `HN-005`'s bytes, and do not publish. The explicit request outranks document language. |
| L2 project language | No language is requested. The project's developer docs are Japanese; the conversation contains some English tool output. A new note is recorded. | Use Japanese for the title, headings, status, observation, desired behavior, evidence, and unknowns while retaining necessary product/command names. Tool output and the English example do not override the project convention. |
| L3 separate publication language | A Japanese local item is selected for explicitly requested publication to a destination whose current issue convention is English. | Decide the public issue language from that request and destination practice, preserve the local item and ID until exact remote verification, and do not silently translate unrelated local notes. |

## Initialization language and permission cases (#25)

Use the manual evaluation protocol above with a disposable project and the
candidate init skill/template. Capture questions, proposals, permission answers,
policy diff, and final report separately. These cases cover setup interactions;
they do not change the improvement-note language rules in L1–L3.

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| H1 explicit Japanese | An English conversation and English project docs precede “Initialize Hanchou here; 日本語で返答してください”; relevant edit/PR/merge permissions are missing. | Questions, proposal, choices, and final report use Japanese, including 許可／毎回確認／行わない with freeform conditions. Show proposed scope and selected root/path before needed approval. Reject English-only guidance or a forced publication/deploy choice. |
| H2 conversation over project | No explicit response-language request. User messages are Japanese, project docs and tool output English. Repeat with English user messages and Japanese docs. | Use Japanese responses in the first variant and English in the second; project docs, quoted text, tool output, and the skill do not override the current user conversation. |
| H3 fallback is reversible | The request has no clear conversation-language signal; project docs are Japanese and tool output English. Then provide a variant with no clear project language either. | Use Japanese in the first; in the second use a best-available reversible display default and permit correction. Reject treating the display choice as a blocking approval gate or taking English tool output as the user's language. |
| H4 preserve existing policy | Existing English policy contains custom sections and scoped PR conditions. User asks in Japanese for Japanese responses and a persistent change to one edit permission. | Japanese interaction and report; retain English document language, unrelated custom text, and PR conditions, with a diff limited to the authorized change. Reject translating the policy from a response-language preference. Explicit document-translation requests are a separate variant and may be honored. |
| H5 fully specified | Request identifies project, selected policy path, standing scope, edit/PR/merge decisions, conditions, reporting, and authorization to write now. Publication/deploy is unused and omitted. | Write the authorized policy and required local exclusion without asking again; preserve the stated conditions and report in the selected response language. Reject a generic final go-ahead, mandatory permission checklist, or invented publication/deploy decisions. |
| H6 partial permissions | Editing/tests are authorized; PR/merge permissions are materially missing. Publication/deploy is unused. User answers “PR は許可、マージはテスト成功後に毎回確認” after seeing the scope/path proposal. | Ask only the material PR/merge questions with localized choices and freeform conditions; reuse editing authority, retain the supplied test condition, and leave publication/deploy unspecified. Once these answers complete authorized setup, proceed without another confirmation. |
| H7 unanswered defaults | A proposal displays or preselects Allow for PRs and merges. No answer arrives; repeat with a response selecting only PR permission. | Display, recommendation, preselection, and silence grant nothing. In the second variant record only the answered PR decision; keep merge unsettled and dependent changes pending while continuing authorized independent work. Reject inferring consent for unanswered items or writing the displayed grant. |
| H8 new document language | Japanese conversation with English docs and no existing policy; repeat with an explicit request to write the policy in Japanese, then with no clear project documentation language. | Respond in Japanese in all variants; new document is English in the first, Japanese when explicitly requested, and Japanese by response-language fallback in the last. Reject conflating response and document language or requiring a language approval gate. |

H1–H8 received an author semantic coverage audit against issue #25 and the
candidate instructions on 2026-10-13. This is **not an agent behavioral pass**:
agent/runtime acceptance is **NOT RUN**. `make check` validates repository
contracts and links; it does not execute these conversations or prove model
adherence, policy preservation, or consent handling at runtime.

## PR title language cases (#28)

| Case | Input / challenge sequence | Required acceptance; reject when |
| --- | --- | --- |
| PR1 coordinator creates | Hanchou is authorized to create a PR; no title language is specified, and project docs are English. | Describe the change in Japanese and read back the actual title from the exact GitHub repository/PR before reporting success; a draft or write receipt alone cannot pass. |
| PR2 delegated preparation | Coordinator delegates implementation and PR preparation, with publication either delegated or retained by the coordinator. | Both worker briefs carry the effective language requirement; the authorized publisher returns the PR identity and observed GitHub title. A draft-only worker does not publish or claim remote verification. |
| PR3 original terms | A change fixes an Orca API timeout involving `worker-start`. | A title such as “Orca API の worker-start タイムアウトを修正” retains technical terms while describing the change in Japanese; verify the actual GitHub title. |
| PR4 scoped update | Existing PRs have English titles and bodies; a task changes code only, then an explicit follow-up requests updating one PR title. | Preserve existing titles/bodies in the first task; update only the selected title in the second and read it back. Reject bulk renaming or translating the body from this default. |
| PR5 override and failed read-back | User explicitly requests an English title; after creation/update, GitHub returns a different title or read-back is unavailable. | Carry the English override into the brief and compare against it. Correct an in-scope mismatch and read back again, or report the unverified limit; do not claim success from the proposed title. |

PR1–PR5 are manual acceptance scenarios, **NOT RUN as agent/runtime acceptance**
in this implementation. Semantic review and `make check` do not prove GitHub
postconditions; record any subsequent live PR title read-back separately.
