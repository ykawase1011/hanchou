# Supervision details

Read the applicable section for a pending approval, or a
long-running/uncertain observation. The normal launch path stays in SKILL.md.

## Bounded observations

Result notification and approval supervision are separate capabilities. Claude's
qualified idle/exit subscription does not notify a pending native approval.
Before assigning work that may require manual permission (including preserving
results and running finish), verify that the direct parent can observe and answer
the exact pending request through supported public controls. Otherwise hold the
assignment with the concrete host limitation. No approval wake/handler is currently
qualified, so do not end the parent's turn solely awaiting an idle notice.

Use the host's authorized connection route consistently. Readiness may identify
an individual approval route for Herdr/shared Git; it is not permission to bypass
controls. For launch/wait/cleanup, explicitly set both wait layers
on the first call and every continuation.
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
  blocking call bounded by the remaining time. Return earlier for the next authority or required progress checkpoint; never renew the deadline inside it.

If any condition is unverified, use one bounded public wait followed by state
and report inspection at each checkpoint. Do not claim a combined observation
meets those conditions merely because each wait has a timeout. Expose results
for progress and approval inspection. Do not detach an observation loop, answer
approvals automatically, or resend work inside it.


### Handle sokkin approvals

You decide sokkin's approval requests within the authority already granted by
the user and pinned policy; sokkin decides its workers' requests within the
mission. Include this routing in the assignment. An approval dialog alone does
not require another user confirmation. Generic tool-skill advice to ask the
user does not cancel explicit user delegation of these decisions.

Native automatic approval review is a permission mode, not model/effort selection
or a route to Hanchou. Use it only when explicitly requested and qualified under
the [launch contract](launch.md#native-automatic-approval-review). Keep the same parent and human decision boundaries.

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

If the dialog clips the operation, use the provider's supported full-command view
and inspect the complete command, targets and effects within the fixed deadline.
More visible lines or history cannot expand provider-clipped text;
`recent-unwrapped` does not bypass a refused alternate-screen history read.

For Codex 0.163.0 with Herdr 0.9.5, the displayed Ctrl+A opens the command pager;
Herdr spells it `ctrl+a`. Confirm the pager actually appears, then inspect
successive visible pages using `ctrl+d`/`ctrl+u` and return with `q`.
Verify each view change and the return to the same pending dialog, retaining its
reason, permission context and native/process/pane binding before one answer.
The command pager alone need not expose that context or an internal request ID.
These are version-scoped bindings, not a delivery guarantee; consult installed
help and official provider bindings for other versions. Herdr 0.9.5 does not map
`pagedown`, Home or End.

Where the public host/Herdr controls permit a delegated answer, use the installed
help to answer only that request. Prefer one-time approval; do not select blanket
future permissions or disable sandboxing. A blocked agent prompt is not an answer
channel: inspect and use the supported dialog controls instead of resending the
mission. Read back the same attempt after answering; verify the operation's
independent observable effect and record the decision and authority basis.
Herdr 0.9.5 key-send `ok` confirms queue admission, not a completed PTY write or
native approval. An immediate wait/read may still return the previous blocked
snapshot. Keep the same attempt and inspect its current public request boundary
within the observation deadline; do not repeat an answer, including with another
key, or the assignment on that stale state.
If cancellation aborted the turn, confirm that boundary before sending a fresh
continuation marker for the continuation. Unverified complete inspection or
post-answer effect stops dependent work without another answer, resend or relaunch.
Raw native records belong to separate diagnostics, not a required runtime approval
inspection path.

For the qualified Herdr 0.9.5 contract, one observation can use `agent wait` with
`--until blocked --until idle --until done --until unknown --timeout 30000` on the
bound pane. Read current public pane/process evidence and the result after it
returns. An initial or old idle state may return immediately; absent a report
for the current request, one bounded wait for working/blocked/done/unknown can establish
new activity before the next checkpoint. Keep one fixed wall deadline; do not
spin on old idle. A blocked state requires inspection, not success or a progress
prompt. Await each submitted wait/key command's real receipt, then read back the
same request. Preserve native tool/request ID when public evidence exposes it;
otherwise retain the exact current dialog, operation and process/pane binding
without inventing an ID. If the exact request cannot be established, do not answer.

For a human decision, state the concrete action, why existing authority cannot
settle it, the choices and your recommendation. For a human-only UI gate, include
the exact viewer tab/session/pane and pending operation so the person can act.
Keep their focus unchanged. Pause dependent work while continuing independent
permitted work. Missing identity or stop limits still block new assignments.

### Results and host boundaries

Report completion, required decisions and unresolvable failures. Explicit user
stop/budget limits remain instructions; ordinary operation adds no self-accounting.
Distinguish a conversation report from verified OS/mobile delivery. If the current
host cannot wake a finished conversation, use bounded public foreground observation
or retain an actionable reconnection receipt. Never invent background wake or
exactly-once delivery. Qualified Claude peers use the native-receive contract.
