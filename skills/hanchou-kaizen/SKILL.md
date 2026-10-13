---
name: hanchou-kaizen
description: >-
  Route explicit Hanchou improvement requests, including "hanchou kaizen" and
  "Hanchou 改善", to recording, reading, implementation, requested issue
  publication, or installed-skill update. Do not activate for a quoted phrase,
  generic improvement advice, or ordinary Hanchou orchestration.
---

# Hanchou improvement routing

This optional helper recognizes an improvement request without starting a
Hanchou Run or worker. Decide from the user's requested action and context,
not the phrase alone. A quotation, example, or general discussion does not
authorize a write. If the action remains ambiguous, ask which action the user
wants; do not select publication, update, or orchestration by default.

| Requested action | Route |
| --- | --- |
| Record a Hanchou improvement | Use the installed `hanchou-orchestrator` skill's `references/improvement-notes.md` storage contract directly, without activating orchestration. If it is unavailable, explain the missing recorder. Recording is local only. |
| Read or summarize existing notes | Inspect the selected local memo under its storage/privacy conditions; make no remote write or update. |
| Implement an improvement | Work in the authorized source or task context under its repository instructions. Implementation alone does not authorize publication, installation updates, or a Hanchou coordinator. |
| Publish notes as issues | Only on an explicit publish request, invoke installed `hanchou-publish-issues` and its publication procedure. If absent, explain the missing helper. |
| Update installed Hanchou skills | Only on an explicit update request, invoke installed `hanchou-update` and its scoped procedure. If absent, explain the missing helper. |

Handle combined requests as distinct actions with distinct scopes. In
particular, an installed-skill update plus a proposed new operating policy
means: update only the verified installed subset from the official revision;
record the proposal separately under the local notes contract. It does not
authorize editing a source checkout, `main`, or installed skill content to
implement the proposal. Publish that proposal only if explicitly requested.
Do not silently install a missing helper as part of an update.
