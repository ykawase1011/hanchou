# Reporting policy

Keep user updates short and verifiable:

- intake: what was understood, Task identity when useful, and who owns the next step;
- progress: only material changes, questions, risks, or requested status;
- completion: outcome first, important files/artifacts, verification, remaining limits;
- failure: exact failure, preserved state, and safest next action.

The Orca Run Inbox and Delivery mechanics are the coordination source of truth.
Hanchou does not mirror them into files or a second database. Process the entire
oldest delivery batch, answer questions, make worker cleanup decisions, and
acknowledge only as required by the live guide.

Use native idle delivery only when the installed live guide/runtime advertises
that path or it has been qualified for that release. Otherwise, when the
coordinator owes a synchronous supervised result, use only the live guide's
bounded `check --wait`; repeat bounded waits only while expected Dispatches
remain. On timeout, report the still-pending state and end the turn. Never start
an infinite polling loop or background watcher.

Before reporting success, compare results and tests with the original user
request. Surface experimental Orca limitations and unverified claims explicitly.
