# Register and manage a job

Use the current Orca `orca-cli` Automations guide and command help for mechanics,
including list, show, create, edit, run, runs, and remove. Keep the chosen
provider explicit. Work from Orca's public target, schedule, and run receipts;
do not maintain a parallel registry.

## Before creation or edit

1. Identify the exact project, host, Automation workspace mode and target,
   selected Hanchou, job name, provider, desired frequency and timezone, allowed
   actions, report triggers, and ending condition. Distinguish inspection
   frequency from notification frequency. For continuation, use
   [continuation.md](continuation.md) first.
2. Pin a **definition source**: host, project identity, stable source workspace
   or checkout path, and relative Markdown path. Read that exact file now and
   validate its named job, mode, scope, specific checks/actions, completion,
   reporting, and references against the user's request. Resolve contradictions
   before registration. If the file is missing, unreadable, or unclear, report
   the defect; do not choose another project's file or a generic job. Author a
   new file only if requested.
3. Decide whether every future run can reach that source on the pinned host.
   `.hanchou` may be ignored and will not appear in new worktrees by itself.
   For a new-per-run target, retain a separately pinned readable source or
   choose an existing workspace when appropriate. A remote host must have its
   own verified source; never copy credentials or silently switch to a local
   file. If stable access is unverified, leave the job unconfigured.
4. Inspect Orca's public Automation list, exact target/job candidates, their
   details, and relevant run history. If an intended mutation's receipt is
   missing or ambiguous, inspect again before retrying. Match the exact target,
   job, mode, and schedule; names alone are insufficient. Edit an existing
   match instead of creating a duplicate. If multiple plausible matches remain,
   stop and ask which one owns the work. Public inspection cannot guarantee
   atomic deduplication against a concurrent creator; disclose that limit.

## Independent periodic job

Compose a self-contained recurring prompt using [execution.md](execution.md)
and [recurring-prompt-template.md](../assets/recurring-prompt-template.md).
Replace every template field and use only the selected provider's activation
marker; the template is an output asset, not an instruction loaded at runtime.
It must explicitly invoke the correct provider's `hanchou-orchestrator`, name
the exact target and pinned definition source, embed the registered permission
snapshot, and contain the run policy. Do not depend on this setup helper being
loaded in the future session or on setup chat memory. Verify that the
orchestrator skill is available to the chosen provider in the run environment;
installation alone does not activate it.

Create the Automation disabled. Inspect the resulting public settings and
prompt, then perform a manual run when the user requested or authorized a
trial. Review the run receipt, history, and actual result, including the source
read and target identity. Enable when that is part of the user's authorized
request and the trial supports it. If testing is unavailable, report that
limit and leave it disabled unless the user explicitly directed otherwise.
Manual execution may activate a Temporary Hanchou; setup and inspection alone
must not create its Run.

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
- The registered permission snapshot: allowed checks, edits or external
  actions, decision gates, report triggers, and termination rule. Keep it in
  the Automation prompt, which is the registered request, rather than in a
  mutable project document alone.
- The run instructions in [execution.md](execution.md), expressed directly in
  the prompt. Include what to do on missing source, policy drift, ambiguous
  ownership, busy or unknown work state, and duplicate or uncertain runs.
