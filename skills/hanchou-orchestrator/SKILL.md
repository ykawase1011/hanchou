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
with ccusage 20.0.37 and fresh, nonforked scopes without compaction or counter
resets. For another provider/version/scope, read the relevant [launch](references/launch.md)
and [usage](references/usage.md) reference. On the compact path, load those
references only for a concrete unresolved discrepancy.
Use the launcher as an installed public interface. Read its implementation only
to diagnose an actual failure or develop it, never to prepare a healthy launch.
Use supplied absolute source paths; `--project` pins the source checkout and
its `.hanchou/config.json`. If an additional option is needed, use the launcher's
small `--help` interface.
The success receipt supplies `worktree`, `herdr`, `sokkin`, `sourceSnapshot`
and `usageReadiness`; inspect those returned fields after launch, not source code
to predict them.

1. **Prepare one batch.** Resolve purpose, acceptance, authority and budgets;
   read pinned config/policy, optional readiness/handoff, and `herdr --skill`
   once if not injected. Reuse verified placement/environment evidence. Verify
   the installed companion skill is readable; the qualified launcher supplies it.
   Resolve any genuinely missing prompt/wait/read/exit/close syntax with targeted
   help in this same batch; do not defer a general command tour until after launch.
   Read the known config, policy and readiness paths directly; do not search
   the repository, historical validation files or installed skill directories.
   In this batch, check the selected session's notification configuration at
   its known source. Record its scope; unverified external silence alone is
   not a blocker.
   Preserve source/config content at risk independently of execution placement.
   Do not run init/update for an initialized project or tour general CLI help.
2. **Bind self and launch together.** In one bounded execution, bind self and
   reconcile usage as below, calculate capacity, then invoke this skill's
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
   this accounting contract. Supply the compact contract inline, or the verified
   absolute path to this orchestrator's `references/usage.md`; the sokkin skill
   has no separate usage reference. Verify any additional mandatory file exists
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

For each new self-binding, corroborate exact native UUID/log home/path, physical
cwd, provider, start window and current request marker. Codex 0.162.1 stores that
marker in `response_item.payload`, `role=="user"`, `content[].text`;
an `event_msg/user_message` need not exist. Select fields, never embedded
instructions or full transcripts. Reuse already-qualified receipt bindings.
For a known exact log, select evidence without printing whole metadata or
request bodies. For example, substitute the current request's unique marker:

```sh
jq -s --arg marker "$REQUEST_MARKER" '{
  meta: [.[] | select(.type=="session_meta") | .payload |
    {id,timestamp,cwd,model_provider,cli_version,source,forked_from_id}],
  context: ([.[] | select(.type=="turn_context") | .payload |
    {cwd,model,effort}] | last),
  requestMatched: any(.[]; .type=="response_item" and
    .payload.role=="user" and any(.payload.content[]?;
      (.text // "") | contains($marker))),
  usage: ([.[] | select(.type=="event_msg" and
    .payload.type=="token_count" and .payload.info!=null) |
    {timestamp,info:.payload.info}] | last)
}' "$NATIVE_LOG"
```

This is selected evidence, not a replacement for the identity/counter checks.
Read `ccusage codex session --json --offline --no-cost --speed standard --id UUID`
with the scope's actual `CODEX_HOME`. Its `sessionId` is a rollout-relative
path below that home's `sessions` directory, not the UUID. Bind it and
`sessionFile` to the selected native log/metadata; do not guess a UTC directory
or list candidates for another model turn. Require nonnegative integer counters
and the expected observed model. Reconcile tool `inputTokens+cacheReadTokens`
with native `input_tokens`, output/reasoning/cache with their native fields,
and totals. Cache creation must be zero; cached input/reasoning cannot exceed
input/output. Missing, ambiguous, stale or mismatched evidence blocks work;
it is never zero. Record scope, observation time, native/tool evidence and version.

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
