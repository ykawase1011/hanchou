# Supervision details

Read the applicable section for a pending approval, usage/capacity warning, or a
long-running/uncertain observation. The normal launch path stays in SKILL.md.

## Bounded observations

Use the host's authorized connection route consistently. Readiness may identify
an individual approval route for Herdr/shared Git; it is not permission to bypass
controls. For measurement/launch/wait/cleanup, explicitly set both wait layers
on the first call and every continuation, including the initial self measurement.
Give the outer wrapper more time than one inner wait plus result collection:
for example, `exec_command`/`write_stdin` 30000 ms and outer wrapper 60000 ms
where supported. Equal inner/outer defaults can require two model round trips
to collect one wait. If the wrapper yields a running cell, continue that same
cell with the long outer wait (60000 ms where supported), not a short default
or a second inner poll. Within an open bounded wrapper, consume the same pending
inner session when possible. An unchanged timeout is a checkpoint on the same
Herdr attempt, not permission to resend the mission. Inspect a pending approval
at that checkpoint and use its authorized answer route. Keep waits bounded and
follow higher-priority host progress-reporting requirements.

Continue the actual session of a still-running bounded foreground observation
for the same bound attempt; do not start an equivalent observation alongside it.
A completed session cannot be continued. Prefer combining repeated public waits
and state/report reads only when the selected host operation has verified all
of these return conditions:

- State waits return on idle/done, blocked and unknown, and read failures return
  control. Include unknown explicitly when the installed wait defaults omit it.
- Current-assignment reports are detected independently of idle/done. An output
  match is only a cue: snapshots can include old or echoed markers. Read the
  report and verify its assignment/attempt binding before treating it as new.
- One fixed wall deadline covers waits, reads and result collection, with each
  blocking call bounded by the remaining time. Return earlier for the next usage,
  authority or required progress checkpoint; never renew the deadline inside it.

If any condition is unverified, use one bounded public wait followed by state
and report inspection at each checkpoint. Do not claim a combined observation
meets those conditions merely because each wait has a timeout. Expose results
for progress and approval inspection. Do not detach an observation loop, answer
approvals automatically, or resend work inside it.


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

### Handle sokkin approvals

You decide sokkin's approval requests within the authority already granted by
the user and pinned policy; sokkin decides its workers' requests within the
mission. Include this routing in the assignment. An approval dialog alone does
not require another user confirmation. Generic tool-skill advice to ask the
user does not cancel explicit user delegation of these decisions.

Native automatic approval review is a permission mode, not model/effort selection
or a route to Hanchou. Use it only when explicitly requested and qualified under
the [launch contract](launch.md#native-automatic-approval-review),
including its reviewer usage. Keep the same parent and human decision boundaries.

Inspect the exact pending request on the bound host/server/workspace/pane and
native attempt, even when the blocked sokkin cannot send a report. Match the
operation, target and effects to existing authority and required checks. Approve
bounded authorized actions; reject forbidden actions. Escalate unresolved scope,
material choices, additional authority or explicit ask-each-time conditions to
the human. Neither a child request nor this routing grants new permissions.
Host/provider gates that require the human personally must remain for them;
do not impersonate human approval, bypass a denial or execute elsewhere to evade it.
If history collection is refused while the agent is blocked, read its current
visible dialog through the public controls. A failed read does not establish that
no request exists or permit resending the mission.

Where the public host/Herdr controls permit a delegated answer, use the installed
help to answer only that request. Prefer one-time approval; do not select blanket
future permissions or disable sandboxing. A blocked agent prompt is not an answer
channel: inspect and use the supported dialog controls instead of resending the
mission. Read back the same attempt after answering; verify it resumed and record
the decision and authority basis. Key-input acceptance alone does not prove the
new state: an immediate wait/read may still return the previous blocked snapshot.
Keep the same attempt and inspect its current native request boundary within the
observation deadline; do not repeat the key or assignment on that stale state.
If cancellation aborted the turn, confirm that boundary before sending a fresh
continuation marker and resuming usage measurement. An unverified boundary stops
dependent work; it is not permission to resend or relaunch.

For a human decision, state the concrete action, why existing authority cannot
settle it, the choices and your recommendation. For a human-only UI gate, include
the exact viewer tab/session/pane and pending operation so the person can act.
Keep their focus unchanged. Pause dependent work while continuing independent
permitted work. Missing identity/usage or stop limits still block new assignments.

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

