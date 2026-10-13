# Project responsibility policy

The optional default is `.hanchou/policy.md` at the **exact target project
root**. A user or applicable project instruction may explicitly select another
source. Resolve that selection after identifying the target project and before
task actions, at activation and again for each explicit request that changes
the target. Do not search sibling worktrees, other projects, or nearby files for
a substitute. The selected source must be unambiguously tied to the intended
project and be readable; if it is missing, unreadable, or ambiguous, stop affected work and
report the source problem. An absent optional default means the project has not
initialized this policy; ordinary requested work may proceed under the current
user request and other applicable instructions, without forced initialization
or extra authority.

Read the chosen policy and combine it with the current user request and other
applicable instructions. Its responsibilities describe how to handle requested
work; they do not create Tasks, schedules, publication, or unsolicited work.
For edits, PR creation, merge, and publication/deployment, interpret each
user-defined standing setting as **permit** (`allow`), **ask** (`ask each time`),
or **do not do**, subject
to its project-specific conditions and reporting requirements. An unset setting
requires a decision only when that operation becomes relevant. A permit still
requires a task that calls for the operation and satisfaction of its conditions;
it is not a standing assignment. Ask at a real decision gate and never treat
silence as approval. Do not do blocks that action until an applicable explicit
user instruction changes its scope.

A later explicit user instruction can override a standing setting for its
selected task, or explicitly update the default policy. Distinguish those two
intents; do not silently write a one-task override into the policy file. Keep
the effective scope in conversation and public Orca Task/message context, not
in a mutable Hanchou runtime ledger. Include the effective project policy,
its selected source and project identity, applicable conditions, and the
current request in each worker Task brief. A worker in a fresh worktree need
not have the ignored source file. Apply the same snapshot to retries and
independent reviews, updating only on an explicit change of the task's
authorization. Editing the policy text midtask does not expand an existing
Task or Run's permission; reconcile any requested change with the user and
affected workers before changing their scope.

For independently scheduled work, follow the separate source and occurrence
rules in `hanchou-cron`'s setup and execution references. Initializing a policy
does not update an already registered Automation.
