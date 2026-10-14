# Improvement notes, publication and updates

For explicit “hanchou kaizen” or “Hanchou 改善” requests, the optional
`hanchou-kaizen` skill routes the action by intent. Record and read requests
stay local; implementation follows the authorized source/task scope; publication
and installed updates each need their own explicit request. A quoted phrase or
general discussion does not trigger a write or a Hanchou Run. If the action is
unclear, clarify it. This router can use the recorder reference without
activating the orchestrator.

The core skill records Hanchou improvements at ordinary task checkpoints.
`.hanchou/hanchou_update.md` is the default candidate for new notes, not a
presumed safe path: a user-selected path takes priority and must still pass
real-path, parent/symlink, tracked and effective-ignore checks. These checks also
apply to locks, receipts and drafts before every write. Existing local
ignore conventions or a narrowly scoped `.git/info/exclude` entry can provide a
safe location without modifying shared project files. Ignore does not provide
confidentiality by itself; notes still exclude secrets and runtime identifiers.
If no authorized safe local destination is available, defer recording; do not
force an external location, untrack files, or edit shared `.gitignore`.

The old `tmp/hanchou_update.md` remains in place, including unresolved items and
publication receipts. Check its existence through parent/file metadata without
following external symlinks; uncertain discovery stays unresolved. Do not
automatically move, delete, merge, copy or duplicate the old backlog. An empty
new default never means old work is complete. With legacy-only or both-path
sources, an unspecified read/publication request needs explicit memo/item
selection; a source already named by the user is sufficient. Publication and
cleanup stay bound to that source and its lock/receipts, leaving unselected
sources untouched and reporting them as outside scope.

A minimal generalized item looks like this:

```markdown
## HN-001: Preserve notes until remote verification
Status: recorded
Observed: A remote request completed but read-back was unavailable.
Desired: Keep the note until its remote content is verified.
Evidence: A synthetic disconnected-read-back reproduction.
Unknowns: Whether the write reached the server.
Local-only context: None needed.
```

The recorder preserves existing items, merges duplicate observations, and uses
stable item/part IDs. All writers honor a short-lived local editing lock and
reread current content. Uncooperative concurrent editing defers mutation.

## Publish only on request

For Codex:

```text
$hanchou-publish-issues を使って .hanchou/hanchou_update.md の改善点を公開可能な
GitHub Issueへ移してください。起票先の現状を確認し、秘匿化して内容を検証し、
成功した部分だけを元メモから除去してください。
```

For Claude Code, use `/hanchou-publish-issues` with the same request. A request
only to record, inspect or draft notes does not authorize external publication.
The helper can run without starting the orchestrator or installing the core.

The publisher verifies current ownership, README and archived/deprecated state,
starting with `ykawase1011/hanchou` for v3 skills. It does not route by repository
name alone. It generalizes identifying context locally, checks the exact public
payload and all search queries/attachments, then inspects similar open and closed
issues. An existing issue may already cover the request; otherwise it can add a
focused comment or create a new issue. Unsafe or ambiguous items remain local.

Before writing remotely, it saves a minimal local attempt receipt and a safe
draft, with a random public deduplication token unrelated to the source item or
project and a private fingerprint of each original source part. The fingerprint
stays local and supports unchanged-source comparison after a restart; missing
comparison evidence defers cleanup. This makes a timeout recoverable without
reposting blindly. Only a
verified remote repository, URL and matching content authorize source cleanup.

| Observation | Action |
| --- | --- |
| Verified issue/comment covers unchanged source | Remove only the covered part; retain a compact receipt |
| Timeout, failed read-back, missing content | Keep source; reconcile token and content before any new write |
| Search returns no match after timeout | Remain unresolved; absence is not proof of failed creation |
| Remote success, local cleanup failure | Reuse and verify the existing issue on retry; finish cleanup |
| One part succeeds, another fails or cannot be generalized | Remove only the verified unchanged part; report partial success |
| Another item was appended during publication | Preserve it while cleaning the unchanged covered item |
| Covered item changed during publication | Keep changed text; report cleanup pending |
| Deprecated/archived destination or unclear responsibility | Verify a successor within scope or request a decision |

No raw logs, screenshots, private links, project names or secret-bearing text
are sent to external conversion/search/attachment services. Regex checks alone
do not establish confidentiality: meaning and combinations of fragments matter.
See the [publication contract](../skills/hanchou-publish-issues/references/publication.md)
for reservation and recovery details, and the
[recording contract](../skills/hanchou-orchestrator/references/improvement-notes.md)
for safe storage and concurrent edits.

## Update installed Hanchou skills

```text
$hanchou-update を使って、インストール済みのHanchou skillを更新してください。
local/globalの配置、対象agentとlocal変更を保持してください。
```

Claude Code uses `/hanchou-update`. The helper inventories the existing subset,
checks provenance and modifications, and delegates a targeted reinstall to the
official installer. It preserves local/global scope and targets; the new global
default does not migrate existing installs. Unknown provenance, custom changes,
conflicting edits and unsupported layouts remain untouched for a decision.
It verifies the resulting content against an upstream revision and checks that
unrelated skills remain unchanged. Ordinary explicit updates then adopt a verified
fresh visible tab and close the old self when content changed or the session is
demonstrably stale, subject to overrides and public capability/safe-boundary
gates. See [Installation](INSTALLATION.md) for files-only/keep-open choices and
unsupported-path recovery.

When an update request also contains a new operating-policy proposal, update
only the verified installed subset from the official revision and record the
proposal as a separate local improvement note. The update request does not
authorize editing source `main` or installed files to implement the proposal.
An absent `hanchou-kaizen` helper is not added silently by an update.

## Validation boundaries

`make check` runs repository structure/link checks, real disposable Git storage
checks, and a test-only fixture oracle for publication recovery and cleanup.
Synthetic private-input/public-output fixtures document what must be excluded;
they are not a secret scanner or a production implementation. They test fixture
consistency and forbidden outcomes, not an agent's semantic judgment. See
[maintenance validation](MAINTENANCE_VALIDATION.md) for acceptance evidence and
manual forward-test cases; live issue publication is not part of routine tests.
