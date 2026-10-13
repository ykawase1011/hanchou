# Independent recurring execution policy

Put these decisions in the Automation prompt itself. A future run cannot rely
on the setup conversation or on loading `hanchou-cron`.

At run start, explicitly activate the installed `hanchou-orchestrator` with
the provider's invocation named in the registered prompt. Follow its live Orca
startup contract and use its bound Run for this occurrence. If the skill or
required public Orchestration contract is unavailable, report the failure and
stop; never claim activation from a prompt label alone.

Confirm the actual host, project, and target against the registered values.
Read the *one pinned* definition file from its source once at the start, retain
that content as this occurrence's snapshot, and do not follow mid-run edits.
If the source is missing, unreadable, from a different host/project, or the
definition is ambiguous, stop that job and report configuration failure. Do
not search other worktrees, copy secret material, or fall back to generic work.

If the registered prompt pins a separate project responsibility policy source,
read that exact source once at occurrence start and keep its snapshot for this
run. If it is missing, unreadable, or belongs to a different host/project,
stop and report; never substitute another file or sibling worktree. Apply the
intersection of the current project policy conditions and the approved
registered job scope. A tightening takes effect on this occurrence; a broader
policy cannot add actions beyond the registered scope. A policy edit mid-run
does not expand authority. If the prompt registered no policy source, preserve
the existing snapshot-based job behavior; an initialized policy is adopted only
through an explicit Automation configuration update.

Compare the snapshot to the permission scope embedded in the registered
prompt. Execute only within that scope, preserving user decision gates. If the
definition requests broader edits, publication, merge, deployment, spending,
or different targets, stop the conflicting action and report that an explicit
Automation update is needed. The snapshot can narrow or refine authorized
work, and its revised content takes effect on the next occurrence. Orca's
actual schedule and timezone remain authoritative regardless of document text.

Before creating work, inspect public Automation history and the exact job's
relevant Orca Run/Task/worker state, distinguishing this occurrence from any
earlier or overlapping one. Distinguish positively idle, positively busy,
missing owner, and unknown status. A busy or uncertain other owner is not a
reason to launch duplicate work. A result-unknown retry must reconcile public
receipts, existing tasks, and effects first; resume only when ownership and
remaining work are clear. If that cannot be established, report uncertainty
and stop. The public guides do not establish a general Automation-occurrence-to-
Run mapping or an atomic overlap lock. Do not infer ownership from matching
names alone; report that limit when receipts cannot tie an occurrence to its Run.

Perform the job's specific checks and authorized next actions. Reconcile
unfinished requests, Tasks, workers, and external waits only within this
occurrence's Run. Preserve a genuine user decision wait. Report meaningful
changes, required decisions, failures, and completion according to the job's
reporting rule; avoid a notification for every unchanged check. An occurrence
finishing does not disable an independent schedule. If the original interactive
conversation or Run has disappeared, do not create a replacement or take over
its work; report what public state establishes and leave that work untouched.
