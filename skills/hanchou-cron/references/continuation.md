# Original-conversation continuation

This mode periodically checks and advances an existing interactive Hanchou's
unfinished request. Its target is the **same conversation and bound Run**, not
merely the same project, workspace, agent provider, or Automation session.

Before configuring it, verify a public Orca contract that delivers a wake to
that original conversation and Run after a turn ends and after a restart,
preserves its authority, and excludes concurrent coordinator turns. Inspect
the installed guides and public runtime capability. The current Automation
`reuse-session` option alone does not qualify: when its previous terminal is
gone it can start a fresh session. Input acceptance alone also does not prove
delivery to the intended Run. If no qualified contract exists, report this
mode as unavailable or unverified and create no continuation schedule. Do not
fall back to fresh-session, a Temporary Hanchou, another Run, or takeover.
Existing unsupported schedules may still be listed, inspected, disabled, or
removed through Orca's public Automation controls on the user's instruction;
do not enable them or present their runs as successful continuation.

If a contract becomes available, resolve target conversation and Run IDs from
Orca state at setup and wake time, never from a repository job document. At
each wake, confirm the original binding and sole active coordinator. Read the
one pinned definition from the registered host, project, source workspace,
and relative path once at wake start; use that snapshot for this wake. Missing,
unreadable, or ambiguous source means report and stop, without a replacement
file or generic job. Keep actions within the registered permission snapshot;
definition edits cannot grant new authority or change Orca's saved schedule.
Then reconcile the owned unfinished requests, Tasks, Dispatches, workers, external
waits, last evidence, next action, and authority. Positive active work means
supervise without redispatch. For an external wait, inspect its actual result.
For a user decision, preserve the gate. For missing or unknown ownership,
inspect original attempts and residual resources before resuming; do not infer
idle from silence. For completion or a user stop, disable the no-longer-needed
public schedule and verify its state. Do not reassign disappeared conversation
work to a new Hanchou. Use job-specific checks from the one pinned definition
snapshot and report on meaningful changes, blockers, decisions, or completion.
