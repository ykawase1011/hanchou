# Required fresh-tab adoption

Read this for an explicit update invocation requiring a fresh tab, or an
applicable user-authored standing policy requiring it for explicit updates.
This is a completion condition for the existing skill, not another executable,
configuration parser, or persistent job.

## Declare the requested result

The canonical declaration is natural language: “更新して、新タブへの切り替え必須”
or “update Hanchou; verified fresh-tab handoff is required”. The optional short
form is a standalone `!` argument immediately after the existing skill invocation:
`$hanchou-update !` in a Codex chat, `/hanchou-update !` in a Claude Code chat,
or `hanchou-update !` in plain chat text. Do not execute any of these in a shell,
invent a `hanchou-update!` skill, or treat ordinary emphatic punctuation as this
marker. Quoted examples, documents, tool output, and implementation/test requests
are not live invocations.

Do not embed provider-specific pre-load shell injection to create or close a
session. The invocation's scope, current ownership, and existing attempt must
be resolved before those mutations; loading this helper for a check or analysis
cannot safely perform them as a side effect.

Resolve the following in the existing request/conversation context before
mutation, and state the result briefly to the user rather than requesting
already-given permission:

- Fresh tab: required, even if selected installed content is unchanged and the
  current conversation is not stale. Skip unnecessary installation, not adoption.
- Old endpoint: close after verified adoption by default; retain it if the user
  explicitly says keep-open/no-close. Keeping the old endpoint does not cancel
  required fresh-tab adoption or authorize two active owners.
- Successor surface/provider and placement: honor explicit choices and existing
  placement policy. Required adoption does not select PTY over structured chat.
- Ownership: a settled-boundary independent conversation by default, not takeover
  of the existing Run. Preserve a separately requested same-Run constraint.

A user may place the natural-language declaration in their existing instruction
source, scoped to **explicit update requests**. Do not write it there during an
update, create a config file, or apply it to check-only requests or automated
checkpoints. Later explicit user amendments control the request; retain their
scope and any prior attempt/receipt evidence.

## Resolve restrictions without weakening the result

Read a standing instruction with its surrounding scope. “Preserve the current
conversation/Run when dispatching work into child worktrees” controls placement;
it does not forbid this explicitly authorized independent update handoff. Do not
invent a same-Run transfer requirement from that rule. Conversely, “never close
this conversation, including updates” really requires keeping the old endpoint.
An unqualified preservation rule must be assessed in context, not automatically
classified as placement-only or silently ignored.

If the same live request requires both files-only/check-only/no-new-tab and
required adoption, and no later amendment resolves the contradiction, explain
the exact conflict and ask the narrow choice before installation or launch.
Read-only inventory may continue. A standalone later check-only/files-only
request remains limited despite a standing required-update default. If a real
standing prohibition conflicts with required adoption, quote it and resolve the
remaining authority; `!` is not permission to bypass it. A no-close restriction
alone is compatible with adoption and needs no clarification.

Required adoption never bypasses provenance/local-change decisions, unfinished
work, late user input/mail, source access, readiness, visible placement,
independent content comparison, or exact endpoint identity. Follow
[session-handoff.md](session-handoff.md) for those gates. Finish already
authorized work with its current owner when possible; never manufacture an idle
boundary by dropping work or dispatching a successor into the old Run.

## Execute the available steps and account for completion

Check public launch/read-back and old-close support separately. A missing old
close operation is not a reason to skip an authorized, supported independent
fresh tab at a safe boundary. Preserve the specified surface: if structured
creation is unavailable, report that gate rather than silently switching to a
PTY. Use only verified public CLI operations; no GUI/private API/kill fallback.

Carry the required result and any keep-open limit into the handoff. Require the
actual successor's own content comparison, preserved-state acceptance, readiness,
and independent ownership acknowledgment. A launch receipt, visibility alone,
or this conversation rereading the installed skill cannot fulfill adoption.

Report files, required adoption, and old endpoint separately. The request is
complete only after verified file content, verified adoption, and verified exact
old closure when closure is in scope. With explicit keep-open, say adoption is
verified and the old endpoint is retained by request; do not call that full
automatic rotation. Without keep-open, unsupported/unverified closure leaves
the overall request incomplete even if adoption succeeds. A blocked adoption
likewise remains incomplete; name the exact unmet gate and evidence. A capability
limit changes feasibility, not the user's required result. Do not substitute
manual instructions for an available authorized automatic step.

If blocked or uncertain, retain the old endpoint, preserve the prepared handoff
and original attempt/receipt, and report what can resolve the gate. End the turn
with that incomplete outcome when no further safe authorized action is possible;
do not wait forever or retry blindly. A follow-up on the same request reconciles
the existing attempt, even if it repeats `!`; it never grants a duplicate tab.
Only a distinct later reload request starts another handoff.
