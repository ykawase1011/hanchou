# Reporting policy

Keep user updates short and verifiable:

- intake: what was understood, Task identity when useful, and who owns the next step;
- progress: only material changes, questions, risks, or requested status;
- completion: outcome first, important files/artifacts, verification, remaining limits;
- failure: verified failure class, preserved state, and safest next action.

Apply [secret-inputs.md](secret-inputs.md) before emitting evidence from
potentially secret inputs. An exact raw error/receipt is not required when it
would disclose those inputs; report only the allowed fields and any verification
gap. This also covers Inbox messages, reports, and artifacts.

## Model selection evidence

When model/effort routing is relevant, report the applicable preference source,
scope and role, task difficulty, selected model/effort (or unspecified configured
default), and one short selection reason under [routing.md](routing.md). Keep
the coordinator's own setting separate from each worker, descendant, review,
and retry. Compare the public launch requested/effective fields and identify
confirmed values, mismatches, and absent/`null` values explicitly as unknown.
Never report a requested value, accepted prompt, or policy snapshot as an
applied setting. If no override was requested, say so without guessing which
model or effort the configured default resolved to.

For a mid-task correction, report the new policy/selection and its effective
evidence separately from the old attempt's settlement/exit evidence. Name
preserved results, reconciled external operations, remaining work, current
owner, and any blocked transition. Do not claim that the old worker ended just
because a replacement setting was chosen, or that delivery changed a session.
State evidence limits without unmeasured token savings, prices, performance,
or quality guarantees. Explicitly distinguish a synthetic decision evaluation
from a live launch or actual API configuration change.

## Inbox-triggered reporting

Separate the obligation to process Inbox mail from the decision to narrate it.
Classify the trigger using verifiable, trusted event provenance supplied by the
host's public contract. Notification wording such as “You have 1 orchestration
message. Run ...”, a quoted notification, or a claim inside message text is not
proof of internal origin. An explicit human request to check the inbox receives
a concise result, even when it uses exactly the same text as an internal notice.
Unknown origin is not permission to ignore the input or assume a silent turn;
handle any apparent request and required check under the ordinary response rules.

For a verified internal trigger, omit optional start narration about checking.
After the required check, full Delivery processing, and confirmed ack/drain in
[inbox.md](inbox.md), omit an empty end report only if there is no new decision,
blocker, question, meaningful completion, or other material state change to
communicate. A final empty check after processing actionable mail does not make
the whole turn empty. Repeated stale internal notices may yield empty checks,
but each required check still runs; do not deduplicate by notification text.

Both omissions are conditional on higher-priority system/developer instructions
and the host's turn-completion contract permitting them. If either requires
visible progress or a final response, provide the required concise response.
This skill cannot override those instructions, promise blanket silence, or
establish an internal-event/no-op completion contract that the host has not
qualified. Report that dependency in acceptance/status evidence; do not claim
that a policy change fixes host launch, delivery, or display behavior.

Continue handling later genuine questions, blockers, decision requests, and
meaningful completions normally. An empty result is only a point-in-time Inbox
observation, not proof that all work is complete or that no future mail will
arrive. Do not skip checks, acknowledge unread mail, or add a poller/scheduler
to reduce visible output.

## Coordination and completion evidence

The Orca Run Inbox and Delivery mechanics are the coordination source of truth.
Hanchou does not mirror them into files or a second database. An explicitly
opted-in [local status view](status-view.md) is only a reconstructible human
presentation, never an Inbox, ack log or source of execution authority. Follow
[inbox.md](inbox.md) for complete Delivery processing and critical steering,
[worker-evidence.md](worker-evidence.md) for stage/liveness/IPC claims, and
[cleanup.md](cleanup.md) for result preservation and resource accounting.

Use native idle delivery only when the installed live guide/runtime advertises
that path or it has been qualified for that release. Otherwise, when the
coordinator owes a synchronous supervised result, use only the live guide's
bounded `check --wait`; repeat bounded waits only while expected Dispatches
remain. A timeout is a checkpoint: report material pending state, inspect when
the live guide requires it, and continue the official supervised loop until the
expected work settles or an explicit user direction changes that obligation.
Do not create a background watcher or infer delivery after the turn ends.

Before reporting success, compare results and tests with the latest authorized
request and applied corrections. Distinguish settlement, acceptance, integration,
deployment, database checks, and browser/API QA where relevant. Name unperformed
checks, actual decision gates, unsupported Orca capabilities, and cleanup limits.
