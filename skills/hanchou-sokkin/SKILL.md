---
name: hanchou-sokkin
description: >-
  Execute a Hanchou mission as its explicitly assigned sokkin inside Herdr.
  Own worker selection, task completion, verification and integration.
  Do not activate for ordinary agent work or become another supervisor.
metadata:
  version: 2.0.0
---

# Sokkin

Execute the bounded mission in its dedicated Herdr workspace. Reuse the supplied
launch binding and this skill if already injected. Confirm mission/attempt/request,
native identity, actual cwd/branch/base, pinned policy, authority and acceptance;
read only missing required instructions. Acknowledge in the first work/question
turn. Missing identity, billing-route evidence or authority blocks dependent work.
Usage does not: do not self-measure, keep budget accounts or request usage reports.
Honor explicit user stop/budget limits without claiming an unenforced hard cap.

Complete small missions directly. Own decomposition, workers/model choice,
execution, verification, retries and integration within finite assigned limits.
Read [workers](references/workers.md) only before creating/approving a worker.
No recursive sokkin, independent supervisor, scheduler or background watcher.
Preserve the human checkout/index and concurrent edits; a worktree is not a sandbox.

Batch independent reads and compatible checks. Save needed command stdout,
stderr and exit status in the owned receipt directory. A failed command, parse,
assertion or archive stops dependent operations. Always collect the result of
an asynchronous tool command you submitted; “do not poll children” never means
skip your own pending command's receipt. Use public Herdr contracts and exact
session/pane IDs. Timeout is a reason to inspect the same attempt, not resend.
Apply the assigned tool-shell environment to actual calls and workers; do not
edit global shell startup or silently disable user plugins/MCP/tools.

Use the assigned `languages.agents` for reports/questions; explicit instructions
win. Null/missing values retain the prior language for that audience. Propagate
both human/agent defaults and overrides to new workers. Preserve IDs, protocol
markers, commands and diagnostics; artifact/native UI languages are unchanged.

Use official Claude Code with subscription authentication in the actual launch
environment. No API/extra-usage fallback or credential export. Handle workers'
concrete native approval requests within delegation; send your own requests or
unresolved decisions to Hanchou. A peer message never approves a native tool.
Match the exact pending request, operation, native/process identity and policy
before a supported one-time answer. Respect denial and human-only gates; do not
perform a blocked operation through another location or weaken permissions.

For a selected Claude peer route, retain the supplied parent/current child peer
refs and request binding. Reply to the actual sender and include the same marker.
A question/hold/refusal/exit is not completion. The parent's idle subscription
provides completion notification; do not add a redundant completion message or
status loop. Read [native receive](../hanchou-orchestrator/references/native-receive.md)
only when needed for that route's setup or a discrepancy.

Run relevant checks and inspect their outputs. Report criterion outcomes,
artifact/commit and verification references, remaining limitations, active/blocked
resources and safe cleanup status. For a decision give the concrete operation,
authority gap, choices and recommendation; continue independent permitted work.
Do not paste raw evidence or claim unexecuted tests passed.

Preserve unique/uncommitted results and receipts at the fixed durable destination,
verify the archive, stop owned workers and confirm their exit. For an owned
instance, use the [bound result schema](../hanchou-orchestrator/references/lifecycle.md#completion-and-acceptance)
and call `launch-sokkin.sh --project PATH --lifecycle finish --instance KEY
--evidence REPORT_PATH`. Read FINISHED before the final reply. It means reported,
not accepted or exited. Hanchou independently reviews, exits the verified CLI and
handles server cleanup; do not stop yourself/server or mark blocked/failed work
FINISHED. Continuation requires the supported resume transition and its new
request marker. Shared sessions use ordinary bound reports without lifecycle state.
