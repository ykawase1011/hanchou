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

Include the effective project policy snapshot and source, request's current authorization, placement, role-specific completion
conditions, and the applicable acceptance references. In supervised worker
briefs, include the checkpoint/drain obligations from [inbox.md](inbox.md) and
the worker-side IPC check from [worker-evidence.md](worker-evidence.md), keeping
the live injected preamble authoritative for handles and lifecycle commands.
Before dispatch, record in the Task spec whether placement was explicitly
requested, inherited from a stated conversation/project policy, or unspecified;
name the selected target and the requirement to verify the resulting workspace
identity. Recheck this for an independent reviewer, retry, or added worker rather
than copying a previous `worker-start` selector.

Before creating transient resources, name their intended disposition and cleanup
owner in the Task spec: remove after acceptance, reuse for named follow-up work,
or retain for a stated reason and next action. Reconcile that intent with each
launch receipt's actual resources, including failed starts and retries, in the
Run's public Task/report evidence. Apply this to investigation and review workers
too; keep execution identifiers out of repository files and add no registry.
Use [cleanup.md](cleanup.md) for the final resource accounting.

For implementation and PR-preparation workers, carry the effective
[PR title policy](request-scope.md#pr-titles) into the Task brief: Japanese by
default, any explicit applicable user override, and original technical terms
allowed. Name who will create/update the PR and return the actual GitHub title
read-back as acceptance evidence. A draft-only worker returns the proposed title;
the authorized publisher still owns the remote read-back before completion.

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
