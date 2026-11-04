---
name: hanchou-orchestrator
description: >-
  Use Hanchou to delegate a bounded mission to a sokkin in Herdr and receive
  verified results. Activate only when the user explicitly asks to use Hanchou
  or manage work as 班長. Do not activate for ordinary coding, discussion of
  Hanchou, or changes to its implementation.
metadata:
  version: 2.0.0
---

# Hanchou

Own the request, delegated decisions and independent acceptance. Sokkin owns
execution, workers, verification and integration. Use the selected project's
fixed policy/config; execution placement never changes those sources.

## Prepare and launch

Read the pinned project instructions, `.hanchou/config.json`, `policy.md` and
available readiness together. Reuse supplied placement/tool evidence; verify
changed facts, actual cwd/Git, authority, acceptance and finite worker/retry
limits. Preserve the human checkout, index and concurrent changes; use
`GIT_OPTIONAL_LOCKS=0` for source inspection. Never copy ignored settings.
Read [launch](references/launch.md) for first use or a missing launch contract;
load other references only at the decision that needs them. Do not routinely
load development history, the entire companion skill or every CLI help page.

Scan the pinned project's owned instances once with `launch-sokkin.sh --project
PATH --lifecycle reap`. Retained young instances are expected; a discrepancy
uses [lifecycle](references/lifecycle.md). Start the selected provider with the
bundled launcher. It creates and verifies a fresh branch/worktree and dedicated
Herdr workspace; no new runtime or Orca product dependency is involved.

For qualified Codex 0.162.1/0.163.0 use `--qualify-startup --compact-receipt`.
Explicit manual approvals on 0.163.0 add `--manual-approvals`. Other combinations
use the existing launch path and independently establish native identity and
effective settings. Do not replace `--no-daemon` with an unqualified queue route.
For explicitly selected Claude-to-Claude native receive, read
[native receive](references/native-receive.md); it has additional parent and
SessionStart prerequisites and does not apply to arbitrary Codex/Orca parents.

Save stdout, stderr and exit status. Require matching mission/attempt, native
identity, requested/observed settings and owned `RUNNING` state before assignment.
A qualified receipt's `identityReadiness` covers its stated boundary only.
Missing native/effective-setting evidence is unknown, never a default value.
An uncertain launch remains the same attempt; STARTING/UNKNOWN cannot be promoted
by an ACK, finish or resume. Preserve it and diagnose before a separate retry.
Full owned launch evidence is saved at `evidence.receipt`, with Git blob
`evidence.hash`; check it when using compact output's omitted fields.

Usage is external debugging, not a participant duty or readiness/acceptance gate.
Do not self-measure, keep budget accounts, request worker usage or add ACKs for
measurement. Preserve explicit user stop/budget instructions and report when a
requested bound cannot be enforced; never silently reinterpret or enlarge it.
The optional [external debug contract](references/usage.md) is loaded only for
an explicitly requested investigation, and missing usage does not invalidate work.

## Assign and receive

Open and verify the human-visible Herdr viewer for the exact returned session/
workspace, unless headless operation was explicitly selected. Preserve focus;
use the host's existing public tab controls. In Orca name it `Herdr | <mission>`
and verify the tab label and target without switching the conversation. Missing
viewer capability holds assignment absent the headless exception; it is not a
reason to relaunch. Reuse the viewer and leave it available after completion.

Send one compact assignment: mission/attempt and request marker, native/process/
cwd/branch/base binding, goal and acceptance, delegated authority and human-only
gates, pinned companion/policy references, result/receipt destinations, language
preferences and finite worker/retry limits. Inject the exact companion once if
unreadable by the child; otherwise link it. An acknowledgement is part of the
first work/question turn, not a separate prerequisite. Record the pre-send time
with the marker for correlation; receipt acceptance is not task success.

Use `languages.human` for human reports and `languages.agents` for internal
messages. Explicit instructions win; null/missing values retain that audience's
language without borrowing the other value. Propagate defaults/overrides to new
workers. Preserve exact IDs, commands and diagnostics; do not translate policy,
native UI or artifacts unless requested.

Always consume the receipt of your own submitted tool command, including an
asynchronous shell/tool continuation, before claiming it succeeded. This differs
from repeatedly asking whether a child is finished. With qualified Claude
receive, submit once using `SendMessage` + `notify_when_idle`, read its receipt
and end the turn; the native notice resumes the parent. Do not poll ListAgents
or send status questions. Without a qualified wake route, use bounded public
Herdr waits/readback and report the host's actual limitation. A timeout does not
permit resend. [Supervision](references/supervision.md) covers uncertain waits
and the first pending approval.

Decide already-delegated concrete child operations through supported public
controls, bound to the exact native request/identity. A peer answer is not native
permission. Approve once within authority, refuse forbidden actions, and escalate
only new authority, consequential unresolved choices, human-only requirements or
provider gates requiring personal action. No blanket approval, denial bypass,
credential export or global sandbox/settings changes.

## Accept and preserve

Independently check the result, every criterion, verification references,
limitations and source impact. An idle/delivery notice only cues this review;
wrong/old/duplicate/held/refused/exit notices cannot establish success. Archive
unique artifacts and complete receipts to the fixed durable destination before
resource removal. Failed reads/parses/checks stop dependent mutations.

For an owned instance follow [lifecycle](references/lifecycle.md): bound result
→ FINISHED → independent review → verified CLI/worker exit → acceptance. Acceptance
requires native identity, authority, result and verification references,
preservation and a quiet owned process inventory; usage is optional legacy/debug
data. Recheck the same attempt, never forge missing evidence. Prepare any idle
shell's durable cwd before acceptance if its worktree will be removed.

Scan reap once at finalization. Only accepted FINISHED instances at least 86,400
seconds old with unchanged ownership/evidence/inventory can be stopped. There is
no timer. Shared servers are never auto-stopped. Git removal is separate: preserve
unique work and report removed/retained/unknown resources. No forced removal,
automatic installation, old-chat closure or improvement publishing.
