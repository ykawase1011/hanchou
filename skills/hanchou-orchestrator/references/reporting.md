# Reporting policy

Keep user updates short and verifiable:

- intake: what was understood, Task identity when useful, and who owns the next step;
- progress: only material changes, questions, risks, or requested status;
- completion: outcome first, important files/artifacts, verification, remaining limits;
- failure: exact failure, preserved state, and safest next action.

The Orca Run Inbox and Delivery mechanics are the coordination source of truth.
Hanchou does not mirror them into files or a second database. Follow
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
