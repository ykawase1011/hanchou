# Continuation design and qualification

This is a requested design for reviewing unfinished work after a conversation
turn ends. It creates no schedule and promises no wake. Orca owns periodic/event
wake, delivery, session reuse, and overlap control; Hanchou owns the decisions
made when a supported wake actually reaches the same coordinator.

Before configuration, require a qualified public contract for resuming that
coordinator and its existing Run with preserved authority and no duplicate
invocation. Native events and periodic checks may complement each other only
through that contract. The public Automation `reuse-session` option can fall
back to a fresh session when the prior terminal is gone; it does **not** prove
interactive coordinator/Run continuity. Never bridge a new Automation into an
interactive Run, take over implicitly, or create a fresh Run/worker swarm to
simulate continuation. An unexpected fresh fallback reports missing continuity
and stops before dispatch; use explicit recovery under the live guide instead.
If the required wake/continuity contract is unavailable, report this as
unsupported/unverified and leave periodic continuation unconfigured.

At a qualified wake, reconcile the latest [request scope](request-scope.md) with
public Task/Dispatch progress, worker liveness, external waits such as CI, the
last observed evidence/time, and the next action/owner. Keep these in existing
conversation/Task context; do not add a registry. Distinguish:

- **Active:** positive work evidence; continue supervision, without duplicating it.
- **External wait:** inspect the actual CI/job result and its identity; pending
  or missing results are not failure. Plan the next check only through the
  supported authorized Orca wake mechanism.
- **User decision:** preserve the gate and ask about that decision; do not
  proceed with merge/deployment or other withheld authority.
- **Unfinished with no proven owner:** inspect original attempts and residual
  resources before resuming authorized work. Positive worker exit can lead to
  official recovery; `unverifiable` cannot authorize duplicate dispatch.
- **Complete:** verify request-specific evidence and cleanup, then stop the
  task's unnecessary wake/monitoring through the authorized public mechanism.

Resume/delegate necessary authorized next steps without inventing universal CI,
PR, or deployment requirements. Separate inspection frequency from notification
frequency: for unchanged external waits, lengthen the next interval within the
user's agreed bounds using supported scheduling controls, and notify only on
meaningful change, required decisions, unresolved blockers, or completion. If
backoff is unavailable, disclose that limit instead of building a timer.

End unnecessary monitoring when all scoped work completes or the user says to
stop; verify the corresponding official configuration change when authorized.
On lost continuity/authority or an unsupported wake route, stop automatic action
and report the limitation. During an active supervised conversation, retain the
live guide's bounded wait loop; it is not proof of post-turn continuation.
