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

Use the configured provider. The compact path is Codex 0.162.1 / ccusage
20.0.37, native source `cli`, without fork, compaction or counter resets.
For other routes or a concrete failure, read the relevant [launch](references/launch.md)
or [usage](references/usage.md) reference. Healthy calls need neither reference
nor shell implementation. Both bundled shells are public interfaces.

1. **Read and measure.** Read the pinned project's `.hanchou/config.json`,
   `.hanchou/policy.md` and optional `.hanchou/readiness.md` together. Explicit
   source paths override defaults; execution placement does not change them.
   In that same tool call, read `herdr --skill` if not injected, confirm the
   installed companion skill is readable, and measure self using the supplied
   native identity/start window/marker. If a required identity argument is
   missing, resolve only that fact before measuring. Do not postpone self
   measurement until after help exploration or writing a launch wrapper.
   Reuse supplied placement and readiness evidence; check actual cwd/Git and
   the selected session's notification config at its recorded path. Unverified
   external silence alone does not block work. Read only missing subcommand
   help for assignment/wait/read/exit/close, batched with these checks.
2. **Launch.** Resolve authority, acceptance and capacity from that evidence.
   Refresh self usage and evaluate capacity in the same bounded execution as
   the launch; no model round trip is needed between those two operations.
   Invoke `scripts/launch-sokkin.sh --project PATH --mission SLUG --session NAME
   --qualify-startup --timeout-ms 60000`. `--project` pins the config source;
   the launcher creates a fresh worktree from that checkout's HEAD. Add `--base`
   only for an explicitly selected different base. An authorized process-local
   update-notice skip uses `--skip-update-check`. Use `--help` only for an
   additional unresolved option. Save and return exit status and receipt in
   this call; do not create a script in one call just to execute it in the next.
3. **Assign and wait.** A qualified receipt supplies `worktree`, `herdr`,
   `sokkin`, `sourceSnapshot`, and `usageReadiness`. Check `ok`,
   `stage == "startup_qualified"`, usage ready, identity/configuration and
   budget; reuse its process/model/native binding and bootstrap usage. Send
   purpose, acceptance, authority, pinned sources, these receipt facts,
   budgets/reserves, worker/retry limits, and the absolute measurement shell
   path with identity arguments. Include a unique assignment marker. In the
   same bounded tool execution, wait and fetch the report, not only wait status.
   Bootstrap is already done; never resend it. Refresh only for intervening
   activity/delay or a concrete discrepancy. Failed or uncertain launches
   retain the same attempt and block assignment.
4. **Accept and release.** Independently check the result, measure the settled
   assignment, preserve artifacts/receipts, compare source impacts and release
   owned resources as below. Batch dependent mechanical operations with
   assertions. Submission or idle alone is not completion.

Avoid repository/history searches, guessed filenames, init/update for initialized
projects, general CLI tours and speculative hook investigation. Preserve fixed
sources in place: record hashes for comparison, not copies of ignored config.
The launch receipt already checks connectivity, inventory, fresh worktree and
actual process identity; do not repeat those checks before assignment. For source
comparisons use `git -C "$SOURCE" rev-parse --path-format=absolute --git-common-dir`.
Resolve genuinely missing authority or discrepancies before acting.

### Measurement and capacity

Use `scripts/measure-session.sh` instead of generating a native parser or ccusage
reconciler. Example; arguments are identity facts, not values to guess:

```sh
"$SKILL_DIR/scripts/measure-session.sh" --provider codex \
  --log-home "$CODEX_LOG_HOME" --cwd "$AGENT_CWD" \
  --model "$MODEL" --effort "$EFFORT" --started-after "$START_WINDOW" \
  --marker "$REQUEST_MARKER" --native-id "$NATIVE_ID" --timeout-ms 15000
```

Omit optional native ID/log hints only if unknown. A ready receipt has:

- `tool.totalTokens`: cumulative spent, including cached input and bootstrap.
- `lastUsage.request.input_tokens` and `output_tokens`: last response size,
  including cache; use it to estimate remaining model round trips.
- `currentRequest.state`: `active` or `settled`; active has unreported usage.
- `nativeId`, `nativeLog`, `logHome`, `cwd`, `model`, `effort`: reusable binding.

Save `spent`, `currentRequest`, `beforeFinalization`, `finalization`, `reserve`,
`required = spent + currentRequest + beforeFinalization + max(finalization, reserve)`
and `headroom = budget - required`. Count actual model round trips, not shell
commands; finalization includes acceptance, preservation, cleanup and final reply.
Do not count finalization twice. Insufficient capacity blocks launch. Measurement
returns evidence; the agent decides the estimates and budget gate.

An active self cannot measure its own final reply: reserve and report that gap.
At sokkin completion, require the assignment's settled measurement **before**
deleting its cwd; retain that receipt afterwards. A continuation requires the
latest request's marker/start window; matching historical aborts keep cumulative
usage, never add the previous cumulative total again. A currently aborted request
is unavailable, not settled. Unknown scope, compaction/reset or mismatch stops
assignment; never replace it with zero or a weaker manual check.

Use the host's authorized connection route consistently. Readiness may identify
an individual approval route for Herdr/shared Git; it is not permission to bypass
controls. Keep launch/wait/cleanup foreground waits long at both layers:
`exec_command`/`write_stdin` 30000 ms and outer wrapper/continuation 60000 ms where
supported. Consume an inner pending session inside that same bounded outer call
when possible. Do not spend a new model request on every short poll. A pending
approval or timeout requires inspecting/waiting on the same attempt, not resend.
Follow higher-priority host progress-reporting requirements.

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
