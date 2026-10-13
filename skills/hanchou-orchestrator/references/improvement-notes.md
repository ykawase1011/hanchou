# Local improvement notes

Use this only within an activated Hanchou session, or when explicitly asked to
record a Hanchou improvement. Recording never authorizes publication or starts
another Run. Capture observations at a task checkpoint; skip or defer a note
when recording safely would disrupt the actual task.

## Choose and verify the destination

Prefer the user's specified path/name; otherwise try `tmp/hanchou_update.md`
relative to the project/workspace. A directory named `tmp` is not evidence of
privacy. Before creating anything, inspect the resolved destination and parent
directories, rejecting unexpected symlinks or paths outside the intended scope.
In a Git worktree, run both checks against the exact repository-relative path:

```bash
git ls-files --error-unmatch -- "$memo_path"
git check-ignore -v -- "$memo_path"
```

These are separate checks: the first must report **untracked**, and the second
must confirm the effective ignore rule. Inspect errors and negated rules; an
ignore-looking pattern, command error, or tracked file is not a safe result.
Do not use `--no-index` to claim that a tracked file is safe. Check auxiliary
draft, receipt, backup, and lock paths too. Recheck before every write.

If unsafe, do not read confidential material into or append to that file.
Use an existing local ignored notes location, or add an exact, narrowly scoped
entry to the repository's local exclude file found with
`git rev-parse --git-path info/exclude`, consistent with local policy. Then
repeat both checks. Never edit shared `.gitignore`, tracked instructions, or
untrack an existing file without the user's instruction. If the requested path
is tracked or cannot be made safe, explain the conflict and choose an allowed
local alternative only when the user's location constraint permits it.
For a non-Git workspace, use an explicitly private, non-shared location allowed
by local policy; otherwise defer and report the missing safe destination.
Ignore prevents accidental Git addition, not access by other users or sync tools.

## Item format and content

Preserve the memo's existing text and headings. Give each new item a stable,
locally unique ID unrelated to runtime or account identifiers. Reuse an existing
item for the same improvement; do not renumber it or overwrite unresolved facts.
Split independently publishable concerns into separately identifiable parts.
This generalized example contains no real project information:

```markdown
## HN-001: Retain a note when remote confirmation fails
Status: recorded
Observed: A successful request was followed by an unavailable read-back.
Desired: Keep the note until the remote content can be verified.
Evidence: Synthetic reproduction with a disconnected read-back step.
Unknowns: Whether the remote write completed.
Local-only context: None needed.
```

Record only the observed problem, desired behavior, minimal evidence or
reproduction conditions, and uncertainties. Separate local-only context from
candidate public requirements; neither is automatically publishable. Generalize
project/customer/account names, paths, internal links, and identifiable context
before writing. Do not persist secrets, personal or confidential information,
raw logs, or Orca Run/Task/Dispatch/terminal identifiers, even in ignored files.
If an existing memo contains such information, do not echo it into reports or
drafts; preserve unrelated content and obtain a safe generalized description.

## Preserve concurrent changes

Use one writer at a time for this memo, including publication receipts and
cleanup. When writers are not already serialized, acquire a short-lived local
lock with exclusive directory creation at `<memo_path>.lock`, in a verified
ignored location. All Hanchou writers must honor that same lock. If occupied,
defer; never remove another writer's lock based on age alone. Release only your
own lock, including after errors. This is an editing guard, not a service or
persistent work registry.

After obtaining the lock, reread the current file and merge only the intended
item/part using a context-checked edit. Keep other sections byte-for-byte.
Check the file again immediately before writing and abort/reload if it changed;
read back afterward. A reread or atomic rename alone is not a concurrency lock.
If an editor cannot honor the lock, a symlink/identity changes, or exclusive
ownership cannot be established, defer the write/cleanup instead of risking a
lost update. Do not replace the file from an earlier snapshot.

`recorded` is different from `published-verified`. Keep source text until the
publisher has verified the exact remote content. Publication attempts and
minimal recovery receipts follow `hanchou-publish-issues`; successful cleanup
removes only covered, unchanged parts and leaves pending/new text intact.
