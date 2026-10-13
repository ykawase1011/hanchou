# Multiple Hanchou sessions

Open a separate Orca pane and explicitly invoke `$hanchou-orchestrator` in
Codex or `/hanchou-orchestrator` in Claude Code for each session.
Each new Hanchou conversation creates or explicitly binds its own Run. Usually
keep one familiar entrypoint for a project's requests; start another Hanchou
explicitly when it has an independent purpose, authority, or completion
condition. A normal configuration may contain any mixture of ordinary and
Hanchou sessions, including several Hanchou in one project.

Rules:

- never bind two active Hanchou coordinators to one Run;
- never persist a one-project/one-Run mapping;
- put all requests in a Hanchou conversation into its same Run, with one active
  coordinator per Run;
- never duplicate the same Task across Runs or claim another Run's Task because
  it targets the same project;
- inspect active worktrees and agents before two Runs touch one repository;
- on restoration, reconcile only the original conversation's owned requests,
  Tasks, workers, CI waits, and authority; missing evidence does not prove
  inactivity or permit duplicate work;
- if that original conversation is unrestorable, replacement and takeover are
  outside the current continuation design.

Task ownership stays with the Run that created it even when its worker runs in a
different repository or on a connected server. Initial v3 does not implement
cross-Run dependencies or Task transfer.
