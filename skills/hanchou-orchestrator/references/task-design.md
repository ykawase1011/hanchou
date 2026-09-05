# Task design

Use the smallest useful Orca DAG:

- one worker job: one Task;
- independent work: sibling Tasks;
- ordered work: only the dependencies that enforce the order;
- aggregation: a parent Task only when it represents real acceptance across children;
- review: a separate dependent Task when independent review is justified.

Every Task spec should state:

- objective and scope;
- target repository/worktree when relevant;
- acceptance evidence;
- required verification;
- constraints and explicit non-goals;
- expected result or artifact.

Create Tasks in the currently bound Hanchou Run. One Task has one owner Run even
when its worker executes in another repository or on a connected Orca server.
Do not duplicate a Task into another Run.

Prefer the live guide's supervised `worker-start`. Use lower-level
terminal/dispatch composition only when the receipt contract says
`worker-start` cannot express the required topology. Process questions,
escalations, heartbeats, and worker completion through the Orca Run Inbox.

Do not manually mark a Task completed after a valid worker completion event if
the live guide says Orca settles it automatically. A timeout, idle terminal, or
heartbeat is not completion.
