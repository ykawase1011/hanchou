# Authorized fresh-session handoff

This is an explicit change of conversation after a verified scoped update. It
is separate from restoring/continuing the same conversation and Run. Do not
replace the current session while merely implementing or testing this policy.

## Capability gate

Resolve and reuse the actual Orca executable by its official discovery rule.
Read its live `orca-cli` and `orchestration` guides, relevant command help and
`agent-context` schema before any launch/close. Determine whether both endpoints
are PTYs or structured agent sessions. Runtime capability strings are discovery
signals, not callable CLI/RPC contracts. Do not infer a structured API from a
terminal command, use private state, guess UI controls, or add a launcher.

The inspected 1.4.224 public contract exposes independent PTY creation, bounded
terminal reads and exact terminal close. Supervised `worker-start` may launch
a structured worker; its `worker-read`/settlement/release contract belongs to
that Dispatch, not an independent replacement coordinator. Some worker handles
are not accepted by terminal verbs. No independent structured create/read/close
or current-Run atomic coordinator-transfer operation was found in that bounded
inspection. Recheck the installed contract, but do not claim full support from
this historical finding. Ordinary `run-use` binding and legacy-only takeover
are not qualified current-Run transfer. Never start a second coordinator in the
old Run, dispatch the successor as a worker, or create a replacement Run to
pretend unfinished old-Run work transferred.

## Safe boundary and preserved state

Before launching, preserve the user's requests and latest amendments, scope and
permissions (including withheld decisions and stop instructions), acceptance
evidence, selected policy/definition source paths and snapshots, original
workspace/host/project/parent, update revision and installed paths, committed,
uncommitted, untracked and ignored results, and resource owners/cleanup duties.
Keep the handoff in conversation/private task context using supported delivery;
do not persist runtime IDs in repository/shared files or invent a registry.
Do not copy ignored sources or silently select same-named files in a new checkout.
Confirm the successor can actually access authorized source/artifact locations;
an inaccessible pinned source blocks activation, not a reason to substitute it.

For a bound Run, inspect all requests, Tasks/Dispatches, worker resources, gates,
external waits and Inbox. Process every Delivery before acknowledgment and
drain all batches, not just one page. Unfinished tasks, active/unverifiable
workers, pending questions/user decisions, unread/unprocessed mail, external
waits, or unowned cleanup disallow closure and automatic rotation. Finish or
explicitly resolve them with the current owner; do not drop them to get idle.
An empty Inbox or idle TUI alone is not quiescence. Late mail/new user requests
invalidate the prepared boundary: recheck immediately before commitment/close.
Settle the update's installation result separately from rotation: report rotation
as pending until confirmed, rather than treating installation success as closure.

Only a documented transfer contract that fences old ownership and preserves
mail/tasks/gates can transfer a current Run; quiescence alone cannot supply that
contract. If the request requires preserving that Run, keep the current
coordinator and Run intact when this contract is absent. An explicitly authorized
independent session may instead start normally for future work once all old
requests and resources are settled; it has its own Run if Hanchou is explicitly
activated. This settled-boundary path does not require current-Run transfer.
It is a new entrypoint, not live Run takeover or same-conversation continuation.

## Conditional launch, read-back, and close

If the requested endpoint types, ownership boundary, and public workflow are
supported, perform the already authorized independent launch. Apply the user's
placement preference, verify parent/host/project/path against the launch receipt,
and use a short `hanchou-` name for a new worktree absent an explicit name. A
fresh session alone does not require a checkout. Use the configured agent through
the official workflow, without provider-specific launch machinery or guessed
model flags. Record setup-created resources; no unrelated tab may be closed.
When a fresh visible tab was requested, verify its tab placement through the
public receipt/inventory; terminal creation may return only a background handle.
Do not substitute an unseen background session or browser tab for the requested
agent tab. Unverified visibility keeps the old session open.

The ordinary full-handoff send receipt is insufficient for this update-specific
close request. First require observable readiness and a response from the actual
new conversation that explicitly accepts the preserved handoff and states:

- Its own identity, execution placement and independent ownership boundary;
  it must not bind/take over the previous Run.
- The installed skill paths it actually opened (including local shadowing),
  exact revision plus complete content comparison, and relevant changed
  instructions/references it read. A pasted expected hash, startup title,
  installer exit, input `accepted`, or `turn_started` is not skill-load proof.
- That required request/source/artifact state is accessible and preserved, and
  that it is ready for future authorized work, holding task execution until the
  old owner yields. Keep evidence of this response through a supported read path.

Explicit file reads and that observed response can establish adoption; a
dedicated runtime skill-load API is not required. The successor must perform
the comparison itself, not merely echo values supplied in the handoff prompt.

If startup only advertises cached/prior instructions, the response cannot be
read, or the newly read tree differs from the installed verified revision,
report unverified loading and keep the old session. Do not claim automatic
provider discovery from explicit file-read evidence. After any uncertain launch
or prompt result, reconcile the original receipt; never launch/send again on
silence. If the live contract provides no way to verify readiness, stop here.

Before closing, revalidate quiescence, exact old endpoint identity/type/host,
separate close authority, and the preserved evidence. Address only that verified
old endpoint with its documented close operation, never an active/default
selector, a whole tab containing other panes, or workspace-wide close. Old-self
close can terminate the caller before a receipt is observed: record close intent
and yield ownership before the call; let an authorized successor/user confirm
the exact old endpoint's closure through public evidence. Do not report success
merely because the caller disappeared. A successor performing cleanup is a
different action from self-close and requires that explicit authority; never
silently substitute it. A failed/unknown close leaves closure unverified and
must not restart old task coordination or trigger a blind broad retry.

## Supported recovery when a gate is unavailable

Report installation and session adoption separately: for example, “files updated
and verified; fresh structured-session handoff/old-self close unsupported by
the inspected public contract; current conversation retained.” Preserve the
prepared handoff and continue unrelated authorized work in the current session.
Do not promise that this agent has refreshed its loaded skill.

When the old work is settled, the user can open a fresh Orca agent tab using the
normal app workflow, explicitly invoke Hanchou if desired, and provide the
preserved brief. Ask that new conversation to read the actual installed paths
and verify the revision/content and source access as above. After reviewing its
acknowledgment, the user can close the identified old tab manually. This is a
manual recovery, not automated E2E success; do not guess UI automation. If the
user requires fully automatic structured rotation, leave it blocked on a public
independent-session lifecycle, verifiable fresh-content acknowledgment, safe
settled boundary, and exact closure receipt/recovery contract. Fenced ownership/
mail transfer is additionally required only if the user asks to preserve the
current Run across owners; it is not a prerequisite for a settled-boundary new
conversation/new Run. Never enable cron to bridge this gap.
