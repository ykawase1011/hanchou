# Continuation design and qualification

This design reviews unfinished requests after a turn ends, including after Orca
restarts. It creates no schedule and promises no wake. Orca owns periodic/event
wake, delivery, restoration of the original interactive conversation, and
overlap control. Hanchou owns decisions when a supported wake reaches that same
conversation and its original Run.

An explicitly requested post-update fresh-session handoff is a separate workflow
of the optional `hanchou-update` helper. It requires its own authorization,
public lifecycle/ownership support, quiescence, preserved state and fresh-content
acknowledgment before exact old-session closure. It does not qualify wake or
restoration here. Neither ordinary `run-use` nor a supervised replacement worker
establishes current-Run transfer; if unsupported, keep this conversation and Run.

Before configuration, require a qualified public contract that wakes the
original interactive conversation with its existing Run and authority, including
after a restart, without concurrent coordinator turns. Native events and
periodic checks may complement each other only through that contract. The
public Automation `reuse-session` option may fall back to a fresh Automation
session when its prior terminal is gone; it does **not** establish interactive
conversation/Run continuity. Do not bridge an Automation, create another Run,
or use takeover to simulate continuation. If the original conversation cannot
be restored, report that limit and stop this path; replacement and takeover are
outside this design. Without qualified wake, leave periodic continuation
unconfigured and report it as unsupported or unverified.

At a qualified wake, first verify this is the original conversation and Run and
that it is the sole active coordinator. Reconcile **all unfinished requests owned
by this conversation**, their latest [scope and authority](request-scope.md),
public Tasks/Dispatches, workers, external waits such as CI, last observed
evidence/time, and next action/owner. Keep these in existing conversation/Task
context; do not add a registry. Another Run's work in the same project is not
this Hanchou's work. Missing observations alone prove neither idle/dead status
nor ownership transfer. Distinguish:

- **Active:** positive work evidence; continue supervision, without duplicating it.
- **External wait:** inspect the actual CI/job result and its identity; pending
  or missing results are not failure. Plan the next check only through the
  supported authorized Orca wake mechanism.
- **User decision:** preserve the gate and ask about that decision; do not
  proceed with merge/deployment or other withheld authority.
- **Unfinished with no proven owner:** inspect original attempts and residual
  resources before resuming authorized work. Positive worker exit can lead to
  official recovery; `unverifiable` or absent evidence cannot authorize
  duplicate dispatch.
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
