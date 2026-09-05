# Multiple Hanchou sessions

Open a separate Orca pane and explicitly invoke `$hanchou-orchestrator` in
Codex or `/hanchou-orchestrator` in Claude Code for each session.
Every pane creates or binds its own Run. A normal configuration may contain any
mixture of ordinary sessions and Hanchou sessions.

Rules:

- never bind two active Hanchou coordinators to one Run;
- never persist a one-project/one-Run mapping;
- never duplicate the same Task across Runs;
- inspect active worktrees and agents before two Runs touch one repository;
- use explicit takeover only for recovery when the prior coordinator is gone.

Task ownership stays with the Run that created it even when its worker runs in a
different repository or on a connected server. Initial v3 does not implement
cross-Run dependencies or Task transfer.
