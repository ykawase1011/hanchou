# Authorized fresh-session handoff

This changes conversation under the entrypoint's ordinary explicit update
workflow or a separately authorized fresh-session/reload request. It is separate
from restoring/continuing the same conversation and Run. Honor files-only,
keep-open/no-close, scope limits and contrary standing instructions. Default
rotation needs actual selected content change or evidence that the current
session loaded older content than the verified installed tree; current content
alone does not trigger it. Explicit reload is distinct. Reuse prior attempt and
receipt evidence so repeated task wakes cannot open fresh tabs. Do not replace
the current session while merely implementing or testing this policy.

## Select the successor and control path

A fresh agent tab does not inherently mean a structured chat. When the user
accepts an ordinary Codex/Claude terminal, use the configured agent's public
Orca terminal/worktree workflow; do not require independent structured-session
creation. Preserve an explicitly requested surface or provider. Select the
successor separately from identifying the old endpoint: a PTY successor does
not turn an old structured chat into a terminal that `terminal close` accepts.

Use the public Orca CLI for this automatic handoff. Do not switch to Computer
Use, accessibility actions, GUI shortcuts, private RPC, or process killing when
an operation is missing. A user choosing an ordinary terminal permits that
successor type, not a different control method. If the old endpoint cannot be
closed through a verified CLI contract, retain it and report that exact gap.
An explicitly requested new terminal and its adoption check may still complete;
disclose the retained old endpoint and do not call this full automatic rotation.

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

Describe a missing operation as not found in the inspected public contract,
naming the version, endpoint type and missing step. This does not prove that
Orca lacks the feature internally or needs a new implementation; exposing or
documenting an existing operation may suffice. An empty terminal inventory
does not identify the current session as a PTY or prove no structured session
exists. If identity/type cannot be verified, report that uncertainty and keep
the current endpoint. Do not silently switch a structured-chat request to a
PTY successor to bypass the missing contract.

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
The handoff/close operation itself may remain pending at this boundary; it must
not require its own future close result before launching. This exception covers
only rotation bookkeeping, never unfinished business Tasks/Dispatches, active
worker ownership, mail, gates or unresolved cleanup from the old work.

Only a documented transfer contract that fences old ownership and preserves
mail/tasks/gates can transfer a current Run; quiescence alone cannot supply that
contract. If the request requires preserving that Run, keep the current
coordinator and Run intact when this contract is absent. An explicitly authorized
independent session may instead start normally for future work once all old
business requests and resources are settled; it has its own Run if Hanchou is
explicitly activated. This settled-boundary path does not require current-Run transfer.
It is a new entrypoint, not live Run takeover or same-conversation continuation.

## Conditional launch, read-back, and close

Check launch/read-back and old-close support separately. If the requested new
endpoint and ownership boundary have a public workflow, perform the already
authorized independent launch, subject to the retained-old-endpoint rule above.
Apply the user's
placement preference, verify parent/host/project/path against the launch receipt,
and use a short `hanchou-` name for a new worktree absent an explicit name. A
fresh session alone does not require a checkout. Use the configured agent through
the official workflow, without provider-specific launch machinery or guessed
model flags. Record setup-created resources; no unrelated tab may be closed.
For the default fresh visible tab workflow, or an explicit tab request, verify
placement through the public receipt/inventory; terminal creation may return
only a background handle.
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
close authority from the default explicit update workflow or separate permission,
and the preserved evidence. A keep-open/no-close override ends with adoption and
the old endpoint retained. Address only that verified old endpoint with its
documented close operation, never an active/default
selector, a whole tab containing other panes, or workspace-wide close. Old-self
close can terminate the caller before a receipt is observed: record close intent
and yield ownership before the call; let an authorized successor/user confirm
the exact old endpoint's closure through public evidence. Do not report success
merely because the caller disappeared. A successor performing cleanup is a
different action from self-close and requires that explicit authority; never
silently substitute it. A failed/unknown close leaves closure unverified and
must not restart old task coordination or trigger a blind broad retry.

## Supported recovery when a gate is unavailable

Use the outcome report below. Preserve the prepared handoff and continue
unrelated authorized work in the current session. Do not promise that this
agent has refreshed its loaded skill.

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

## Report the observed outcome

At the end of an update request, including an interrupted or blocked handoff,
state three independent results in the user's language. A short sentence is
enough when the result is simple:

| Result | Evidence and limits |
| --- | --- |
| Files | Updated/current/partial/failed, with the verified revision and placement. Installer success alone is insufficient. |
| Fresh tab | Not requested/not needed/not attempted/blocked/unverified/verified. Name the unmet gate when blocked; only the actual successor's content comparison and handoff response establish verified adoption. |
| Old session | Retained/closure unverified/closure verified, with the reason or exact-endpoint public evidence. Caller disappearance is not confirmation. |

For example: “Files updated and verified at <revision>; fresh-tab adoption
not attempted because independent structured create/read was not found in the
inspected Orca <version> CLI; current session retained.” Give manual recovery
only as a fallback with this reason, not as a substitute for an available,
already authorized automatic path. Report pending results without claiming
the entire workflow is complete or that full automation has been validated.

If the update replaces this helper's own instructions, distinguish the workflow
loaded at the start from the newly installed one. Read the verified changes
before reporting; explain any remaining adoption step. New skill text does not
retroactively expand a files-only/installation-only request or override a
keep-open instruction. Honor any separately supplied adoption authority, using
the same request's receipt evidence to avoid duplicate launches. Reading the
new instructions in the old conversation is not fresh-tab adoption.

A capability gap does not authorize an upstream Issue, PR, comment, Orca
update, or private API workaround. When improvement work is requested, record
the bounded evidence and required observable behavior locally under the
improvement-notes contract; retain an existing relevant issue as the tracking
reference rather than creating a duplicate. Publishing remains a separate,
explicitly requested action. Distinguish instruction changes, documented public
support, and successful end-to-end execution when reporting an improvement.
When the user has already requested both implementation and issue tracking for
blocked work, finish the feasible authorized work and publish/reuse the in-scope
tracking issue before ending the turn; do not repeatedly defer this to another
user reminder. Preserve destination exclusions: if Orca-side publication is
forbidden, track the Hanchou acceptance gap in Hanchou when authorized, without
posting to Orca or claiming its internal implementation is absent.
