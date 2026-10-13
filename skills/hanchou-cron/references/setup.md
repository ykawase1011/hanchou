# Register and manage a job

Use the current Orca `orca-cli` Automations guide and command help for mechanics,
including list, show, create, edit, run, runs, and remove. Keep the chosen
provider explicit. Work from Orca's public target, schedule, and run receipts;
do not maintain a parallel registry.

## Establish the user's job and authority

An installation or bare request to "add cron" does not identify a job or
authorize a runnable configuration. Before drafting a job definition or
Automation, ask what concrete work to schedule and what actions it may take.
Do not present an assumed job as a ready-to-run proposal while waiting.
For example:

> 定期実行したい具体的な作業は何ですか？候補の中から選ぶ場合も指定してください。
> 許可する範囲は調査・報告のみ、編集・PR作成まで、または明示的に許可する
> マージ・公開までのどれですか？

Existing `.hanchou` definitions and project documents are context or
suggestions, not authority to choose, author, register, trial, or enable a job.
Require the user's selection even when there is only one candidate, unless a
prior instruction already selected that exact job and granted its scope.
Use an answer already explicit in the current request or selected project
policy rather than asking it again; policy permission still does not select a
job or create a schedule.
After the user clarifies, present the concrete target and work, display name, frequency and
timezone, allowed actions and excluded or gated actions, reporting conditions,
and stop condition. Obtain a go-ahead for that summary unless the user's
existing request already explicitly covers it. No reply is no approval; do
not register defaults. A fully specified, approved request can proceed without
asking for the same approval again. A pure install or "later" request leaves
the job unconfigured and may offer onboarding; full onboarding is not a
condition of installing this helper.

## Automation display name

When the user has not specified a display name, propose `[hanchou] <business name>`
using the selected job's business name. If that name already starts with
`[hanchou]`, keep it without adding a second prefix. Preserve an explicit user
name exactly, including one without the prefix. This is a display convention,
never evidence of identity, ownership, activation, or permission; continue to
identify the exact Automation through Orca's public receipts and target/job.

The default applies to new proposals, not automatic migration of existing
Automations. Rename an existing Automation only within an explicitly requested
target and scope; bulk renaming requires an explicitly selected set. Never
infer rename scope from a prefix, project membership, or an inspection request.
Before an authorized rename, read the exact Automation and retain its current
settings for comparison. Change only the name unless other changes were also
authorized. After any authorized name change, read back that same Automation
by its exact ID and verify the saved name, frequency, timezone, session mode,
prompt and permission scope, target, provider, enabled state, and all other
settings against the pre-change values and authorized changes. Report any
mismatch or unavailable read-back as unverified; do not assume success or
silently repair unrelated settings.

## Before creation or edit

1. Identify the exact project, host, Automation workspace mode and target,
   selected Hanchou, job name, provider, desired frequency and timezone, allowed
   actions, report triggers, and ending condition. Distinguish inspection
   frequency from notification frequency. For continuation, use
   [continuation.md](continuation.md) first. Select and read the project's
   responsibility policy if present before resolving its standing permission
   conditions; source selection follows item 4 below.
2. For an independent job, pin a **definition source**: host, project identity,
   stable source workspace or checkout path, and relative Markdown path. For a
   selected existing file, read it now. For a concrete new job, author the
   necessary static definition at the selected source, then read it back.
   Validate its named job, mode, scope, specific
   checks/actions, completion, reporting, and references against the user's
   request. Resolve contradictions before registration. If a **selected existing**
   file is missing, unreadable, or unclear, report the defect; do not choose
   another project's file or a generic job. A concrete new-job request
   authorizes that definition; an install-only or vague request does not. A future
   qualified continuation may instead use the original conversation and Run's
   recorded request and policy; a selected project definition supplements it.
3. For a selected project definition, decide whether every future run can reach
   that source on the pinned host.
   `.hanchou` may be ignored and will not appear in new worktrees by itself.
   For a new-per-run target, retain a separately pinned readable source or
   choose an existing workspace when appropriate. A remote host must have its
   own verified source; never copy credentials or silently switch to a local
   file. If stable access is unverified, leave the job unconfigured.
4. Select the target project's optional responsibility policy: an explicitly
   selected source from the user or applicable project instructions, otherwise
   `.hanchou/policy.md` at that exact project's root. Read it at configuration
   if present. A missing explicitly selected source is an error; an absent
   optional default means no policy is configured. Never discover a substitute
   in sibling worktrees or another project. For a configured policy, verify a
   stable, readable host/project/source workspace or checkout and relative path
   for future occurrences. Pin this **separately** from the job definition in
   the Automation prompt. If access cannot be verified, do not register. An
   existing Automation does not adopt a newly initialized policy automatically;
   it needs an explicit configuration update.
5. Inspect Orca's public Automation list, exact target/job candidates, their
   details (including disabled entries), and relevant run history. If an intended
   mutation's receipt is missing or ambiguous, inspect again before retrying. Match the exact target,
   job, mode, and schedule; names alone are insufficient. Edit an existing
   match instead of creating a duplicate. If multiple plausible matches remain,
   stop and ask which one owns the work. Public inspection cannot guarantee
   atomic deduplication against a concurrent creator; disclose that limit.
   Repeated display names, past occurrences, and historical Hanchou Runs do not
   establish duplicate registrations or live workers. Classify the exact IDs
   and current ownership before proposing cleanup.

## Independent periodic job

Compose a self-contained recurring prompt using [execution.md](execution.md)
and [recurring-prompt-template.md](../assets/recurring-prompt-template.md).
Replace every template field and use only the selected provider's activation
marker; the template is an output asset, not an instruction loaded at runtime.
It must explicitly invoke the correct provider's `hanchou-orchestrator`, name
the exact target and pinned definition source, embed the registered permission
snapshot, the optional separately pinned project policy source, and the run
policy. Current policy conditions intersect the approved job scope; broadening
the policy alone cannot broaden the registered job. Do not depend on this setup
helper being
loaded in the future session or on setup chat memory. Verify that the
orchestrator skill is available to the chosen provider in the run environment;
installation alone does not activate it.

An approved, concrete request to register the scheduled job authorizes a bounded
manual trial and enablement after verified limited checks, unless the user asks
for a draft or disabled schedule. Create the Automation disabled and inspect
its saved settings and prompt. A scheduled merge, deployment, publication, or
other consequential permission is bound to its authorized timing and effects;
it does not authorize performing that effect immediately as a trial. Honor a
separate explicit authorization for immediate trial effects without asking
again. Otherwise prefer a non-effectful representative check of source reads,
target, prompt, permission gates, and reporting. Do not claim that a different
prompt or reduced check proves the full job. Review the receipt, history, and
actual limited result. If a useful safe check or its ownership/result cannot be
verified, leave disabled and ask the user to decide how to proceed. An explicit
user authorization may permit enablement after verified limited checks while
some scheduled effects remain untested; enable only within that decision and
report the untested effects clearly.
Manual execution may activate a Temporary Hanchou; setup and inspection alone
must not create its Run.

Before a trial, distinguish the continuing Automation from any separate,
temporary trial Automation and record the latter's intended disposition and
cleanup owner in the setup evidence. Prefer testing the intended disabled
Automation when the approved trial can use it. If a separate trial is needed,
identify its exact ID from the creation receipt and account for it even if
disabled or the trial fails. Remove it only when the authorized trial scope
includes disposal of that Automation and its history; otherwise keep it disabled
and report the missing deletion decision, owner, and next action. Preserve
required trial evidence before authorized removal and verify absence afterward.
Use the installed `hanchou-orchestrator` resource cleanup policy
for trial workers, workspaces, Setup, and services independently of Automation
deletion. Completing those resources must not disable or remove the continuing
schedule or its pinned definition/policy source. Verify the continuing
Automation's intended enabled state and report any retained trial resources.

For list/show, return Orca's actual schedule, timezone, enabled state, target,
and recent result. For edits, compare the new registered permission snapshot
and target with the old one; expand authority or change frequency only on an
explicit instruction, update the recurring prompt as needed, then inspect the
saved Automation. For disable, change Orca's enabled state and verify it. For
delete, use Orca's public remove operation only for the exact requested ID and
verify its absence. Deletion also removes run history in current Orca; make
that effect clear when presenting a deletion for review. Do not treat a
definition-file edit as an Automation edit. Stop or disable an independent job
only when instructed or its registered ending condition applies; completion of
one occurrence does not end the schedule.

## Prompt fields to embed

Build the prompt with concrete values, not placeholders:

- Provider-specific invocation: `$hanchou-orchestrator` for Codex or
  `/hanchou-orchestrator` for Claude Code. Name the Temporary Hanchou kind and
  the exact job.
- Exact Orca target, host, project identity, and source workspace or checkout
  plus relative path. State that the source is fixed even when execution uses a
  fresh worktree.
- If configured, the separately pinned responsibility policy source: host,
  project identity, stable source workspace or checkout, and relative path.
  State that a missing/unreadable selected source stops the occurrence and that
  policy tightening applies on the next occurrence without widening the
  registered scope. If no policy was configured, say so; the registered job
  snapshot remains the authority until an explicit configuration update.
- The registered permission snapshot: allowed checks, edits or external
  actions, decision gates, report triggers, and termination rule. Keep it in
  the Automation prompt, which is the registered request, rather than in a
  mutable project document alone.
- The run instructions in [execution.md](execution.md), expressed directly in
  the prompt. Include what to do on missing source, policy drift, ambiguous
  ownership, busy or unknown work state, and duplicate or uncertain runs.
