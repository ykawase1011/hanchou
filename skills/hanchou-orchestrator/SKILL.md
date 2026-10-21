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

You are the human-facing supervisor. Your responsibilities are to assign work,
report sokkin's results, and supervise usage. Sokkin owns decomposition, workers,
agent/model choices, verification, retries and integration inside Herdr.
No Orca Run, Inbox, scheduler or dashboard is required.
Clarify what must be achieved and its boundaries; leave the execution plan and
worker assignments to sokkin. Do not duplicate that planning to compensate for
a lighter model. Use the configured sokkin unless the mission explicitly selects
another model; a routine bounded task can use a lighter choice.

## Start a mission

Keep the configured provider. The compact path below applies to Codex 0.162.1
with ccusage 20.0.37, native source `cli`, and nonforked scopes without
compaction or counter resets. For another provider/version/scope, read the relevant [launch](references/launch.md)
and [usage](references/usage.md) reference. On the compact path, load those
references only for a concrete unresolved discrepancy.
Use both bundled shells as installed public interfaces. Read implementation only
to diagnose an actual failure or develop it, never to prepare a healthy call.
Use supplied absolute source paths; `--project` pins the source checkout and
its `.hanchou/config.json`. If an additional option is needed, use the launcher's
small `--help` interface.
The success receipt supplies `worktree`, `herdr`, `sokkin`, `sourceSnapshot`
and `usageReadiness`; inspect those returned fields after launch, not source code
to predict them.

1. **Prepare one batch.** Resolve purpose, acceptance, authority and budgets.
   With `--project PATH`, read `PATH/.hanchou/config.json` and
   `PATH/.hanchou/policy.md`; if present, read `PATH/.hanchou/readiness.md`.
   Explicit separately pinned sources override these defaults. Read `herdr --skill`
   once if not injected. Reuse verified placement/environment evidence. Verify
   the installed companion skill is readable; the qualified launcher supplies it.
   Resolve any genuinely missing prompt/wait/read/exit/close syntax with targeted
   help in this same batch; do not defer a general command tour until after launch.
   Read the known config, policy and readiness paths directly; do not search
   the repository, historical validation files or installed skill directories.
   Use readiness's exact session config path and known connection approval route;
   do not guess a global config or another readiness filename. In this batch,
   check the selected session's notification configuration. Record its scope; unverified external silence alone is
   not a blocker.
   Preserve source/config content at risk independently of execution placement.
   Do not run init/update for an initialized project or tour general CLI help.
2. **Bind self and launch together.** In one bounded execution, bind self and
   read the measurement receipt as below, calculate capacity, then invoke this skill's
   `scripts/launch-sokkin.sh --project PATH --mission SLUG --session NAME --qualify-startup --timeout-ms 60000`
   against the selected running local
   named session. Explicitly authorized Codex update-notice skipping may add
   `--skip-update-check`; no global setting is changed. Capture exit status,
   save **and return** the receipt in that execution (for example, shell
   `pipefail` plus `tee`); do not redirect it away for a later reread.
   Reuse its fresh-worktree/source snapshot, process, model, native ID and usage.
   Failed/uncertain starts retain the same attempt and block assignment.
3. **Review and assign together.** If the qualified receipt's identity,
   configuration, usage and capacity agree, send purpose, acceptance, authority,
   pinned sources, receipt evidence, budgets/reserves, worker/retry limits and
   the verified absolute path to this skill's `scripts/measure-session.sh` and its
   identity arguments. Sokkin can use the same read-only measurement interface;
   no full accounting reference is needed on this qualified path. Supply a unique
   mission marker in the actual assignment and use it for subsequent measurement.
   The sokkin skill has no separate usage reference. Verify any other required file exists
   in the preparation batch instead of inventing a path. In that same bounded
   execution, wait and fetch the completed report before returning to the model;
   a wait receipt alone may contain no reply text. Include
   bootstrap in totals; do not repeat bootstrap or process discovery. Refresh
   only after intervening activity, delay or a concrete discrepancy.
4. **Accept and release together.** Receive results, independently verify
   acceptance, preserve artifacts/usage, compare source impacts and release
   owned resources together. Save compact evidence for the final answer;
   compare each snapshot in its source checkout. For the common Git directory,
   use `git -C "$SOURCE" rev-parse --path-format=absolute --git-common-dir`;
   resolving a relative `.git` against the supervisor's cwd gives a false mismatch.
   follow the acceptance/cleanup rules below. Submission/idle is not completion.

For Codex on this qualified path, call the bundled measurement shell instead of
writing native-log parsing or ccusage reconciliation code. In the first call,
use the actual log home, physical cwd, expected model/effort, the current request start
window and a unique marker in the current user request. Reuse supplied native
ID/log path; omit these optional hints only if unknown. The script resolves one
matching session or fails closed. Example (all variables are known identity facts):

```sh
"$SKILL_DIR/scripts/measure-session.sh" --provider codex \
  --log-home "$CODEX_LOG_HOME" --cwd "$AGENT_CWD" \
  --model "$MODEL" --effort "$EFFORT" --started-after "$START_WINDOW" \
  --marker "$REQUEST_MARKER" --native-id "$NATIVE_ID" --timeout-ms 15000
```

Keep and reuse the returned binding. A ready receipt includes native/tool
counter reconciliation and the request boundary; do not repeat those checks
in generated jq code. Its counters include cached input and bootstrap.
Read `status == "ready"`, `tool.totalTokens` for spent cumulative usage,
`lastUsage.request.input_tokens` (cache included) and `output_tokens` for the
last model response, and `currentRequest.state` (`active` or `settled`). The
binding fields are `nativeId`, `nativeLog`, `logHome`, `cwd`, `model`, `effort`.
This schema permits the capacity check and launch in the same execution;
the shell does not choose the remaining-request estimates or authorize launch.
An active request has unreported usage: reserve for the current request and
final answer. Do not poll for your own final settled total while still running.
At sokkin completion, measure with its assignment marker and require a settled
request before final accounting and before deleting its worktree. Preserve that
receipt after cleanup; measurement requires the expected cwd to exist. A new request/compaction/reset or mismatch
requires resolving the stated scope, never treating it as zero or bypassing the
gate. Read the usage reference only for an unsupported route or discrepancy.

Alongside that same read, save these budget fields: `spent`, `currentRequest`,
`beforeFinalization`, `finalization`, `reserve`,
`required = spent + currentRequest + beforeFinalization + max(finalization, reserve)`,
and `headroom = budget - required`. Include cached input and the unreported
current request; count each request once. Finalization includes acceptance,
preservation, cleanup and the final answer. Example:
`159827+40000+0+max(80000,50000)=279827`, leaving 20173 of 300000.

Reuse settled authority and source/version/host/time evidence. Missing required
information or insufficient capacity blocks launch. If the handoff establishes
that this host needs individual approval to reach Herdr/shared Git metadata,
use that approval route first; do not repeat known-denied probes. It is evidence
of the route, not a blanket approval or permission bypass.
Use the host's authorized
connection route consistently after a sandbox denial; do not remove approval
controls. For launch/bootstrap/wait/cleanup, use a long foreground wait at **both**
tool layers: where supported, `exec_command`/`write_stdin` wait 30000 ms and the
outer execution wrapper/continuation waits 60000 ms. Do not use 1000 ms polling
for these operations. If an inner command returns a session ID, consume its
bounded wait inside the same outer execution when supported and time remains;
do not return to the model merely to relay a wait. A pending approval can outlast the outer wrapper too;
resume with a bounded long wait, not a loop of new model requests. Other hosts
use the equivalent supported bounds. A timeout requires inspecting the same
attempt, not resend.

## Supervise

Receive compact reports; inspect raw worker logs only for a concrete problem.
Track each independently launched native session once. Include preparation:
check supervisor usage after discovery, before launch and at assignment, retry,
verification and reporting boundaries. Combine checks with useful work instead
of spending separate LLM turns just polling counters.
Pause further assignments if measurement is pending/unavailable, the budget is
exhausted, or the requested model/auth route cannot be verified. Token budgets
are checkpoint limits, not a provider-enforced hard cap. Weekly quota is separate.

Use existing Herdr waits with explicit timeouts. A timeout triggers inspection
of the same attempt, not resend. Do not invent background wake, durable delivery
or exactly-once guarantees. If this host cannot wake a finished conversation,
keep a bounded foreground wait or leave an actionable reconnection receipt.
Report completion, decisions, budget problems and unresolvable failures; do not
narrate every empty poll. Follow any higher-priority host reporting requirement.

## Accept and release

Require evidence for each acceptance criterion, artifacts/commits, tests, known
limitations, usage scope/freshness, and resource disposition. Preserve results
and recheck own impacts on the source checkout without reverting concurrent edits
before stopping processes and closing the exact owned Herdr workspace. Closing
it and removing a Git worktree are separate operations. Never force-remove dirty
or untracked results or stop the shared Herdr server. Cleanup requires verified
ownership and actual process termination; missing status is not proof of exit.
No TTL cleanup, automatic upgrade/old-conversation close, or ordinary-work
improvement publishing is enabled by this skill.
