# Local improvement notes

Use this only within an activated Hanchou session, or when explicitly asked to
record a Hanchou improvement. Recording never authorizes publication or starts
another Run. Capture observations at a task checkpoint; skip or defer a note
when recording safely would disrupt the actual task.

## Choose and verify the destination

Prefer the user's specified path/name; otherwise try `.hanchou/hanchou_update.md`
relative to the project/workspace for new notes. A directory named `.hanchou`
is not evidence of privacy. Before creating anything, inspect the resolved
destination and parent directories, rejecting unexpected symlinks or paths
outside the intended scope.
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
An unsafe default does not authorize a new external storage location. Use only
local storage allowed by the rules above and the user's location constraint;
if none can be verified, defer recording.

## Preserve legacy notes without migration

When using the new default, also check whether `tmp/hanchou_update.md` exists.
Limit discovery to these known paths and their parent metadata: inspect parents
before the final entry with non-following metadata checks (such as `lstat`). Do
not traverse an external symlink, scan other directories, or read an unsafe
target just to discover old notes. A symlink, inaccessible parent, or other
uncertain result means unresolved discovery, not an absent or empty legacy memo.
Include already-known legacy receipt/draft/lock locations in this limited check;
an absent memo does not resolve a surviving publication attempt.

If the legacy memo exists, report that it remains a separate source; retain its
items, locks, drafts and recovery receipts in place. Never automatically move,
delete, merge or copy it, or duplicate its backlog into the new default. If the
same observation may already be recorded there, safely inspect the relevant
item or defer that observation rather than create a duplicate. An explicit
destination still wins, subject to the same safety checks. Updating a legacy
item uses that source and its editing guard; it does not migrate the item.

An empty or absent new default says nothing about legacy completion. When a
read/publication request leaves the source ambiguous (including legacy-only or
both-path cases), identify the sources and obtain an explicit selection of the
memo and item scope before acting. A request already naming the source needs no
extra confirmation. Keep unselected sources and their receipts untouched and
report them as outside scope, never as processed.

## Item format and content

Use the user's explicit language for the note's title, headings, status,
observations, desired behavior, evidence, and unknowns. Without a language
request, follow the target project's developer documentation language; if that
does not establish one, follow the working conversation. Product and command
names may retain their original spelling. When editing an existing unpublished
item, preserve its stable ID and unrelated text, and translate only the fields
in scope under the editing guard below. The language of a later public issue
is decided separately from that publication request and destination practice.

Preserve the memo's unrelated text and headings. Give each new item a stable,
locally unique ID unrelated to runtime or account identifiers. Reuse an existing
item for the same improvement; do not renumber it or overwrite unresolved facts.
Split independently publishable concerns into separately identifiable parts.
This English example is illustrative; localize its field labels and values under
the rule above. It contains no real project information:

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
