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
   the notification config at its recorded path. Scan this project once with
   `scripts/launch-sokkin.sh --project PATH --lifecycle reap`; inspect retained
   or failed cleanup results using [lifecycle](references/lifecycle.md). Unverified
   external silence alone does not block work. Read only missing subcommand
   help for assignment/wait/read/exit/close, batched with these checks.
2. **Launch.** Resolve authority, acceptance and capacity from that evidence.
   Refresh self usage and evaluate capacity in the same bounded execution as
   the launch; no model round trip is needed between those two operations.
   Invoke `scripts/launch-sokkin.sh --project PATH --mission SLUG
   --qualify-startup --timeout-ms 60000`. `--project` pins the config source;
   the launcher creates a fresh worktree from that checkout's HEAD and an owned
   named Herdr server. Use `--session NAME` only for an explicitly selected
   existing shared server. Read [lifecycle](references/lifecycle.md) for the
   owned-instance record and completion/cleanup contract. Add `--base`
   only for an explicitly selected different base. An authorized process-local
   update-notice skip uses `--skip-update-check`. Use `--help` only for an
   additional unresolved option. Save and return exit status and receipt in
   this call; do not create a script in one call just to execute it in the next.
3. **Show Herdr.** On every sokkin launch, open a human-visible viewer tab for
   the receipt's exact host/session/workspace before assigning real work. Use
   the host's terminal-tab capability and Herdr's installed attach contract;
   in Orca use its available terminal tooling, not another agent tab. Verify
   the displayed workspace and leave the tab open. Same-session follow-ups
   reuse its verified tab; a replacement sokkin needs its own target. Resolve
   uncertain tab creation before retrying. If display is unavailable, report
   the blocker and connection details; do not silently assign without a viewer
   unless the user or pinned policy explicitly permits headless operation.
   See [viewer details](references/launch.md#human-visible-herdr).
4. **Assign and wait.** A qualified receipt supplies `worktree`, `herdr`,
   `sokkin`, `sourceSnapshot`, and `usageReadiness`. Check `ok`,
   `stage == "startup_qualified"`, usage ready, identity/configuration and
   budget; reuse its process/model/native binding and bootstrap usage. Send
   purpose, acceptance, authority, pinned sources, these receipt facts,
   budgets/reserves, worker/retry limits, lifecycle instance key/record and launcher
   path, and the absolute measurement shell
   path with identity arguments. Include a unique assignment marker. In the
   same bounded tool execution, wait and fetch the report, not only wait status.
   Bootstrap is already done; never resend it. Refresh only for intervening
   activity/delay or a concrete discrepancy. Failed or uncertain launches
   retain the same attempt and block assignment.
5. **Accept and release.** Independently check the result, measure the settled
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
and `headroom = budget - required`. List the concrete remaining model turns
next to these estimates: receipt review plus assignment/wait, acceptance plus
cleanup, and final reply as applicable. Mechanical commands in one tool call
are not separate model turns. Qualified bootstrap is already included; do not
budget another bootstrap/readiness exchange. Include growth and any genuinely
needed approval/result follow-up; do not reduce estimates just to fit the cap.
Finalization includes acceptance, preservation, cleanup and final reply, counted
once. Treat a budget as a planning estimate and alert threshold unless the user
explicitly made it a stop limit. Finishing within a fixed token number is not a
product acceptance criterion. Negative headroom triggers the human alert below;
it does not prove the work is impossible or permit silently raising a hard limit.
Measurement returns evidence; the agent owns estimates and supervision.

An active self cannot measure its own final reply: reserve and report that gap.
At sokkin completion, require the assignment's settled measurement **before**
deleting its cwd; retain that receipt afterwards. A continuation requires the
latest request's marker/start window; matching historical aborts keep cumulative
usage, never add the previous cumulative total again. A currently aborted request
is unavailable, not settled. Unknown scope, compaction/reset or mismatch stops
assignment; never replace it with zero or a weaker manual check.

Use the host's authorized connection route consistently. Readiness may identify
an individual approval route for Herdr/shared Git; it is not permission to bypass
controls. Keep measurement/launch/wait/cleanup foreground waits long at both layers:
`exec_command`/`write_stdin` 30000 ms and outer wrapper/continuation 60000 ms where
supported. Consume an inner pending session inside that same bounded outer call
when possible. Set these waits on the first call, including the initial self
measurement; a 1000 ms yield can create a full-context continuation just to
retrieve the result. Do not spend a new model request on every short poll. A pending
approval or timeout requires inspecting/waiting on the same attempt, not resend.
Follow higher-priority host progress-reporting requirements.

## Supervise

Receive compact reports; inspect raw worker logs only for a concrete problem.
Track each independently launched native session once. Include preparation:
check supervisor usage after discovery, before launch and at assignment, retry,
verification and reporting boundaries. Combine checks with useful work instead
of spending separate LLM turns just polling counters.
Pause further assignments if measurement is pending/unavailable or the requested
model/auth route cannot be verified. Explicit user stop limits, worker limits and
retry limits still apply. A planning estimate is not a provider-enforced cap or a
guarantee of affordable completion. Weekly quota is separate.

### Alert the human at a useful checkpoint

Choose an initial estimate from comparable measured tasks, including preparation,
bootstrap, remaining work and finalization. If evidence is sparse, label the
estimate provisional; do not invent a universal token budget. Revisit it at the
existing discovery, assignment, retry and acceptance boundaries, not via extra
short polling turns. Record the assumptions and next checkpoint.

Alert when projected total exceeds the estimate, reserve is threatened, per-turn
cost grows beyond its assumptions, preparation/retries consume tokens without
useful progress, or measurement becomes missing/stale/inconsistent. Do not wait
for actual exhaustion. A raw JSON receipt or a local report file is not a human
alert: surface it in the current human-facing conversation when detected.
Include mission/stage, observed usage and freshness/scope, estimated remaining
work and uncertainty, what changed, the current execution state, and the proposed
action (continue within existing authority, reduce scope, revise the estimate,
or pause for a decision). Send one alert per material change; a worsened condition
or unresolved decision is material, an unchanged poll is not.

An estimate overrun alone need not abort already-authorized bounded work. State
its next checkpoint when continuing. Do not expand scope, add workers/retries or
switch provider to absorb an overrun without existing authority. If continuation
needs a human decision, pause new assignments and keep that decision pending.
Missing identity/usage and explicit stop limits block new assignments regardless
of the estimate. Preserve results and retain necessary safe-stop/cleanup capacity.

Use a supported host notification route if available and already authorized.
Distinguish an alert written in the conversation from verified OS/mobile delivery;
never claim the person saw it from a tool receipt alone. If this conversation
cannot be woken after returning, keep a bounded foreground wait or pause with
reconnection details. Do not promise unattended detection without a verified route.

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
before stopping owned agent/worker processes. For owned servers, require sokkin's
FINISHED report, save final settled measurements, verify agent exit and record
acceptance through the [lifecycle](references/lifecycle.md) command. Scan once at
this checkpoint; accepted FINISHED instances older than a day are automatically
stopped when encountered and verified quiescent. Do not close their retained
panes manually after acceptance; that changes the recorded inventory. No timer
or scheduler runs between invocations.

For an explicitly selected shared server, close only the owned workspace after
verification; never stop the shared server. Server shutdown and Git worktree
removal are separate decisions. Never force-remove dirty/untracked results.
Cleanup requires verified ownership and actual process termination; missing
status is not proof of exit. No automatic upgrade/old-conversation close or
ordinary-work improvement publishing is enabled by this skill.
