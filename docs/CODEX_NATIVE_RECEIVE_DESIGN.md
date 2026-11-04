# Codex native receive: separate lifecycle/approval decision

Status: follow-up design, not an implemented mode. Ordinary Codex launch remains
`--no-daemon`; debug separation works independently of native receive. No shared
daemon, queue fallback, runtime or private-state bridge is added by this patch.

## Evidence boundary

The bounded 2026-11-04 experiment used Codex 0.164.0 and an explicitly owned
**official app-server**. Queue delivered to two fresh local root threads and
caused a new parent turn. `queue --no-daemon` was explicitly rejected. Other
routes into an existing no-daemon thread remain unverified, not proven impossible.
Exiting a TUI did not stop that server/thread: a later queue started another turn.
The initial queue callers also failed to await their own asynchronous receipts
because their prompt prohibited waiting too broadly. This is a protocol failure,
not a native transport failure. Future instructions must distinguish tool receipt
collection from periodic child-status polling.

Official [app-server](https://learn.chatgpt.com/docs/app-server) contracts separate
thread/start, turn/start and approval requests. Installed-version help and the
observed endpoint behavior must qualify any adoption; source-level capability is
not a live host guarantee. Existing [validation history](VALIDATION.md) remains
scoped to the versions/variants actually exercised.

## Proposed ownership contract

| Resource | Required owner and binding | Stop/cleanup evidence |
| --- | --- | --- |
| Server | Per-attempt explicitly owned official process, PID/birth, absolute Unix endpoint and socket identity; never an automatically adopted shared daemon | Supported stop plus same process/socket disappearance and child-process inventory |
| Thread | Exact native thread ID from that server, project/cwd, model, effort and effective approval/sandbox policy; parent capability separately proven | No active turns/queued work, retained results and supported thread close/archive semantics; TUI absence is insufficient |
| TUI | A client of that endpoint/thread, own PID/birth/cwd | Client exit only; no inference about server/thread lifetime |
| Parent | Host must support receiving the event and waking the correct parent conversation | Endpoint/thread/host binding and actual new parent turn; an Orca session ID is not a native thread ID |
| Socket access | Scoped host permission for the exact owned endpoint and operation | No global sandbox weakening, credential export or alternate unauthorized endpoint |

Trust is the exact verified task-owned project path, through official controls.
CLI overlay alone failed to satisfy the folder gate in the prior experiment.
Do not use Trust all, global policy widening or a deferred hook-trust experiment.
Only restore proven owned changes, preserving concurrent configuration edits.

Startup should obtain native identity/effective settings from the official
thread/init response before mission dispatch when supported. Do not require an
LLM ACK merely to materialize usage. Authentication stays the official existing
subscription route. Required startup hooks/tools must actually be available;
missing evidence cannot be substituted with a requested flag or private log edit.

## Delivery and approval design

Bind mission/attempt/request, parent/child thread IDs and server incarnation before
one public dispatch. Await the sender's actual receipt. Queue acceptance alone
is not completion; read the matching result and independently accept it. A
completion/question sender still has to submit a bounded notification: queue by
itself does not watch a child. No background completion watcher is authorized.

The public control owner must map native pending request ID, thread ID, turn/tool
ID and exact operation to the direct parent's delegated authority, and send only
the matching supported approval response. A peer text saying “approved” is not
that response. New authority, unresolved consequential choices and human-only
provider gates go to the human. Denials cannot be retried elsewhere to evade them.

Before a mode ships, qualify idle/active/interrupted/exited delivery, old/duplicate
results, refusal/unknown outcomes, restart and full stop. Preserve all receipts,
results and unresolved threads without automatic resend. Cancellation must prove
which turn stopped; the next assignment gets a fresh request marker.

## Decision required before implementation

Prefer an already available host that owns this public app-server/control/wake
contract. If Hanchou must own a long-lived JSON-RPC receiver, approval adapter,
queue consumer or reconnect loop, it adds a runtime and changes the current
product boundary. That requires an explicit scope decision, not another shell
option concealed in this patch. Herdr placement/viewer and full server/thread
ownership must be addressed together. Do not silently trade away either.

Acceptance for that follow-up is a single bounded complete task plus scoped
approval, native identity/settings, receipt/readback, externally attributable
observations and verified complete cleanup. Current no-daemon operation remains
supported while this decision is open. No efficiency ratio is inferred from the
old arithmetic probe or from response count alone.
