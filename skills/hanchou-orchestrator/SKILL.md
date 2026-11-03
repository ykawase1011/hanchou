---
name: hanchou-orchestrator
description: >-
  Use Hanchou to delegate a bounded mission to a sokkin in Herdr, receive results,
  and supervise usage. Activate only when the user explicitly asks to use Hanchou
  or manage work as 班長. Do not activate for ordinary coding, discussion of
  Hanchou, or changes to its implementation.
metadata:
  version: 2.0.0
---

# Hanchou

Assign the bounded mission, handle sokkin's approval requests, supervise usage
and report to the human. Sokkin owns decomposition, workers, model choices,
execution, verification, retries and integration in Herdr. Use the configured
sokkin; do not duplicate its investigation or plan to compensate for its model.
No Orca Run, Inbox, scheduler, dashboard or mandatory conversation rotation.

The normal qualified path is Codex 0.162.1/0.163.0 + ccusage 20.0.37, source
`cli`, without fork, compaction or counter resets. Use the bundled shells as
interfaces. For another provider or a concrete startup/measurement failure, read
the relevant [launch](references/launch.md) or [usage](references/usage.md)
section. Claude requires official Claude Code with subscription authentication;
no API billing, extra usage or fallback to bypass limits.

## Prepare and launch

1. Read the pinned `.hanchou/config.json`, `policy.md` and optional `readiness.md`
   together. Explicit source paths remain fixed regardless of execution cwd.
   Reuse supplied host/placement/readiness evidence and verify actual cwd/Git,
   companion readability and notification configuration at their known paths.
   The launcher reads the companion for bootstrap; the supervisor only needs to
   check that file exists, not load its instructions. In the same call, measure
   self with the supplied native binding below; resolve only missing identity
   facts first. Missing identity/usage blocks launch and assignment.
2. Resolve authority, acceptance, capacity and finite worker/retry limits.
   Scan this pinned project once with `launch-sokkin.sh --project PATH
   --lifecycle reap`. Retained young accepted instances are expected. Read
   [lifecycle](references/lifecycle.md) for a discrepancy or retained failure.
   Use installed public Herdr help only for unresolved operations needed now;
   do not tour its command tree or load a full guide when those contracts are
   already supplied. Do not read repository development history for routine use.
3. Refresh self usage and evaluate remaining capacity in the same bounded tool
   execution as launch. Invoke `launch-sokkin.sh --project PATH --mission SLUG
   --qualify-startup --compact-receipt --timeout-ms 60000`. This creates a fresh
   worktree/branch from the selected project's HEAD and a new named Herdr server.
   Explicit `--base` selects another fixed base; `--config` pins another supplied
   config path. An explicitly authorized process-local update skip uses
   `--skip-update-check`. For explicitly selected manual approvals on Codex
   0.163.0, add `--manual-approvals`; require observed workspace-write/on-request/user.
   Other unresolved options use `--help`. Never change global permissions.
4. Preserve stdout, stderr and exit status. A successful qualified receipt must
   have `ok:true`, `stage:"startup_qualified"`, ready usage, matching requested/
   observed identity and configuration, and owned lifecycle `RUNNING`. Reuse its
   verified process/model/native binding and bootstrap usage. An uncertain or
   failed start stays the same attempt and blocks real work; STARTING/UNKNOWN
   cannot be promoted by manual bootstrap, finish or resume. Use the
   [partial-failure procedure](references/launch.md#receipt-and-partial-failure).

Owned launches automatically preserve a complete receipt at `evidence.receipt`;
`evidence.hash` is its Git blob ID (`git hash-object`), not SHA-256. Verify the
file/hash when using its omitted fields. Compact stdout keeps decision fields;
the full file retains source snapshots and detailed process/native/tool evidence.
It is one launch observation, not final usage or a backup. Early failures and
shared launches return full stdout. Missing required fields, nonzero exit or
`launch_evidence_failed` stops dependent work; never fill nulls with defaults.
Read selected fields from the full receipt for a concrete decision, rather than
printing it all.

Choose an owned working receipt directory in the verified execution worktree
and pin the final durable destination before saving later command results.
An explicit immediate artifact destination remains authoritative; staging is
allowed only when compatible with that requirement. Save complete bounded
stdout, stderr and exit status before selecting fields. Return only the next
decision's identity, state, counters, errors and evidence paths; select the owned
rows from terminal/layout results and use PID/parent topology with owned process
details, not unrelated arguments. Use ordinary sandbox execution where permitted;
request exact host approval when required. Receipt staging neither grants access
nor permits moving an operation to evade a denial. Before acceptance or ending
the session, archive accumulated receipts to the pinned destination and verify
file completeness/hashes. Preserve later final receipts before deleting their
working directory. Failed reads, parses, checks or archive operations must stop
dependent mutations through effective shell guards; retain evidence on failure.

Preserve the human checkout/index and concurrent changes. Use
`GIT_OPTIONAL_LOCKS=0` for source inspection, including approved tool calls;
`git status` otherwise can refresh the index. Compare the source with the saved
snapshot at acceptance, without reverting concurrent edits. Pin policy/config
hashes in place; do not copy ignored settings into execution worktrees.

## Display, assign, observe

Open and verify a human-visible viewer for the receipt's exact host/session/
workspace before real assignment. Use the host's terminal-tab tools; in Orca,
use its installed skill in the existing supervisor workspace, with explicit title
`Herdr | <short mission name>`. Verify the matching tab ID/label in public visual
layout and the displayed Herdr workspace, without changing the user's focus.
Herdr 0.9.5 attach is `herdr session attach NAME`, without global `--session`.
Read [viewer details](references/launch.md#human-visible-herdr) for missing host
contracts or display uncertainty. Retain the same attempt and hold assignment
if display is unavailable unless headless operation is explicitly authorized.
Do not relaunch sokkin or duplicate an uncertain tab. Reuse its verified viewer
for follow-ups and leave it available. Viewing is not technically read-only.

Before serializing/submitting each assignment, capture its UTC start lower bound
and unique marker. Put both literal values in that request alongside the verified
native ID/log home/path, cwd, model and effort; keep referenced receipt paths
absolute and readable by the receiver. Use this same binding for measurement and
final acceptance. A later native user-message timestamp can follow `task_started`
and is not a substitute lower bound. Missing/conflicting binding blocks work;
never widen a failed window. Capture and send in the existing call, without an
extra model turn.

Send one assignment: purpose/acceptance, authority and
approval owner/human-only decisions, pinned sources, exact receipt binding and
evidence path, working/final artifact destinations and preservation checkpoint,
budgets/reserves and worker/retry limits.
Include absolute launcher/measurement paths, owned
instance key/record, languages and any required tool-shell environment. Pass the
needed facts once and link their evidence; do not paste the supervisor workflow
or a second copy of the companion. Bootstrap is already complete. Refresh usage
only for intervening activity/delay or a discrepancy before assignment.

Use pinned `languages.human` for human updates and `languages.agents` for the
assignment/reports; explicit instructions win. Missing/null values retain the
existing language for that audience, never borrow from the other. Propagate
both defaults and overrides to sokkin and its new workers. Preserve exact IDs,
commands, diagnostics and protocol markers; artifact/native UI languages and
authority do not change. Translate internal reports for the human.

In the assignment call, wait and fetch the report, not just wait status. Keep
both tool wait layers long and bounded (for example inner 30000 ms, outer
60000 ms where supported), including continuations. Consume the same pending
inner session within that bounded call when possible; avoid 1000 ms empty polls.
Return for required progress/usage/authority checkpoints. A timeout or echoed
marker is not completion or permission to resend. Inspect the same attempt,
its current report binding and pending approval. If blocked, uncertain or using
a combined long observation, read [supervision](references/supervision.md).
Never detach a poller, automatically answer approvals or claim unverified wakeup.

You decide sokkin requests within delegated authority; sokkin decides workers'.
Inspect the exact bound operation/target/effects, approve authorized actions once,
reject forbidden ones and escalate missing authority or human-only decisions.
Use supported dialog controls and verify resumption on the same native attempt.
No blanket permission, denial bypass, substitute execution elsewhere or mission
resend to a blocked prompt. Read the detailed approval procedure on the first
pending request. Native automatic review additionally requires explicit selection
and qualified reviewer usage under the [launch contract](references/launch.md#native-automatic-approval-review).

## Measure and supervise capacity

Use the absolute bundled `measure-session.sh`, not a new parser/reconciler:

```sh
"$MEASURE_SCRIPT" --provider codex --log-home "$LOG_HOME" --cwd "$AGENT_CWD" \
  --model "$MODEL" --effort "$EFFORT" --started-after "$START_WINDOW" \
  --marker "$REQUEST_MARKER" --native-id "$NATIVE_ID" --timeout-ms 15000
```

Arguments are verified facts; omit optional ID/log hints only if unknown.
Require `status:"ready"`, matching native/log/cwd/model/effort, correct current
request boundary, scope and freshness. `tool.totalTokens` includes cache and
bootstrap; count each independent native session once, including failures and
retries. Never sum cumulative checkpoints or double-count included children.
Use the latest assignment marker/start window for a continuation; a currently
aborted request is unavailable. Unknown scope/reset/compaction or mismatch blocks
assignments; do not substitute zero or weaker manual checks.

At discovery, launch, assignment/retry, verification and reporting boundaries,
combine measurement with useful work. Estimate remaining model turns from
`lastUsage.request.input_tokens` plus output, including repeated cached input
and growth. Record spent, active unreported cost, before-finalization work,
finalization and reserve: `required = spent + active + beforeFinalization +
max(finalization,reserve)`, `headroom = budget - required`. List the remaining
turns; finalization includes independent acceptance, preservation, cleanup and
final reply once. Self cannot settle its final reply: reserve and disclose it.
Planning estimates are not provider-enforced caps; explicit stop limits remain.

Alert the human at the next useful checkpoint for projected overrun, threatened
reserve, growing per-turn cost, unproductive preparation/retries or missing usage.
Give observed scope/freshness, remaining estimate/uncertainty, progress/state and
next action. A local JSON file is not an alert. Continue bounded authorized work
with a stated next checkpoint when no decision or hard limit blocks it; do not
widen scope/models/workers/retries to hide overruns. For capacity/notification
details read [supervision](references/supervision.md). Keep independent permitted
work moving while dependent work waits for a human decision.

## Accept and release

Independently check each criterion, artifact, test, limitation and source impact.
For owned instances, now read [lifecycle](references/lifecycle.md): verify the
bound FINISHED record/report and settled final native usage, preserve results
outside disposable resources, then normally exit the verified owned CLIs.
After actual termination, use `--lifecycle inspect --instance KEY` to recheck
FINISHED, report/hash and quiet inventory before acceptance. Live inspection
requires Herdr native metadata that some integrations omit; it is not a required
precondition for this completion order. Missing metadata never proves a match.
Inspection returns the owned pane/process observations; it never settles usage
or replaces independent acceptance and the acceptance command's current checks.
Keep dependent mechanical checks in one bounded execution with assertions that
stop on any failed read/parse/check. Submission or idle alone is not completion.
If worktrees will be removed while the server is retained, move verified idle
shells to durable cwd and verify them before acceptance; do not change its saved
inventory later. Scan reap once at this checkpoint. Accepted FINISHED servers
are eligible only after 86400 seconds from finishedAt and all lifecycle checks;
retain younger/busy/unknown instances. There is no background timer.

An explicit shared `--session` has no owned lifecycle: verify and close only the
owned workspace, never the shared server. Server shutdown, workspace closure and
Git removal are separate decisions. Preserve unique/uncommitted work, verify
ownership and process exit, and report removed/retained/unknown resources. No
force removal, automatic install/update, old-chat closure or improvement publishing.
