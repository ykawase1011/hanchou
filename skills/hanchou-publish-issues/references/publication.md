# Publication and recovery

## Prepare locally

Select the explicitly requested memo; otherwise the candidate is
`.hanchou/hanchou_update.md` relative to the project/workspace. For an unspecified
source, also check the known legacy path `tmp/hanchou_update.md`. This is limited
existence detection, not migration or a directory search: inspect parent and
file metadata without following symlinks (for example with `lstat`), stopping at
an unsafe or inaccessible parent. Do not read through an external symlink.
Uncertain discovery is unresolved, not evidence that the old memo is absent.
Include already-known legacy receipt/draft/lock locations in this limited check;
an absent memo does not resolve a surviving publication attempt.
If legacy notes or recovery artifacts exist, or discovery is unresolved, identify the ambiguity and
obtain explicit source/item selection before publication or cleanup, whether
only the legacy memo or both paths exist. A request already naming a source is
sufficient; never silently fall back to, combine, or import the other source.
If both are explicitly selected, handle each source and its lock/receipts
separately. An absent/empty new default never marks old items done. Preserve
unselected memos, locks, drafts and receipts in place and report them as outside
scope. Never automatically move, delete, merge, copy or duplicate the old backlog.

1. Inspect the exact resolved destination and all parent directories before
   reading or writing the memo; reject unexpected symlinks and paths outside
   the intended scope. For a Git workspace,
   `git ls-files --error-unmatch -- "$memo_path"` must show it is
   untracked and `git check-ignore -v -- "$memo_path"` must confirm an effective
   ignore rule (not a negation). Reject unexpected symlinks. A tracked/unignored
   memo may be read for requested analysis, but do not add receipts or drafts
   there; use an allowed ignored location or resolve the storage conflict first.
   Do not modify shared ignore rules or untrack files without instruction.
   In a non-Git workspace require an allowed private, non-shared location.
   Apply the same checks to all draft, receipt, backup and lock paths.
   Recheck the exact paths before every write. If the default is unsafe, use
   only an existing authorized safe local location under current storage rules
   (including a narrow local `info/exclude` entry where local policy permits),
   subject to the user's location constraint; otherwise defer. Do not force an
   external location or change the selected source by copying it elsewhere.
2. Read existing item IDs, status and recovery receipts first. Assign stable
   local IDs to legacy headings only under the editing guard below. Snapshot
   the selected item parts for comparison, preserving unknown fields and other
   items. Do not log or copy raw private text into external tools.
3. Determine responsibility from the current README, owner, repository identity,
   issue availability, and archived/deprecated status of candidate repositories.
   Inspect `ykawase1011/hanchou` first for current v3 skills. Names such as
   `hanchou-skills` and `hanchou-kingdom` are candidates, not a fixed routing map;
   they were deprecated at this feature's introduction. Confirm current facts
   via `gh repo view`/`gh api`, including README contents. Do not create issues
   in an archived, deprecated, wrong-owner, or disabled-issues destination.
   Follow a verified successor only if it fits the user's authorized scope;
   ambiguous ownership stays local for a targeted question.
4. Build the minimum generalized title, body, and any necessary attachments
   locally. Separate observed facts, expectations, reproduction, and unknowns;
   never promote a suspected root cause to a fact. Remove/generalize project,
   customer, organization, person/account identifiers, internal hosts/URLs,
   local paths, and private repository/issue references. Exclude tokens,
   passwords, keys, auth headers, cookies, connection strings, `.env` contents,
   and Orca execution identifiers. Apply this to filenames, metadata, screenshots,
   trace/log excerpts, links and their destinations, and every external search
   query as well as the issue itself. Do not upload raw artifacts to a converter,
   paste site or attachment host. Prefer a synthetic reproduction over redaction.
5. Inspect the **exact outgoing payload**, including title, body, labels and
   attachments, semantically as well as with secret-pattern checks. Several
   masked fragments can jointly identify a project or reconstruct a secret.
   If safe generalization loses the necessary meaning or cannot be established,
   keep that item local and explain what non-sensitive clarification is missing.
   Show the prepared safe content when a decision is needed; never include raw
   confidential text in the question. Do not infer consent from silence.

## Reconcile before any write

Search open and closed issues using only sanitized terms; inspect plausible
matches' full bodies and relevant comments. Check saved URLs and outstanding
attempts before deciding to create. Search absence alone is not proof that an
earlier write failed, especially after a timeout or with incomplete pagination.

- An issue already covering the requirement needs no remote mutation. Verify
  its exact coverage and record its URL locally before cleanup.
- A related issue needing new evidence gets one focused comment, retaining
  others' content. Do not rewrite another author's body from a stale snapshot.
- Otherwise create one issue for a coherent requirement, using explicit
  `--repo owner/repository` and a safe local body file (not shell interpolation).
  Read installed `gh` help for available flags; do not guess write/retry flags.

Before the first remote mutation, take the memo editing guard below, reread,
and confirm selected source still matches preparation; otherwise reprepare.
Reserve the exact item/part with a minimal secret-free receipt. Use the same
source-comparison evidence for an existing-issue reuse path before cleanup,
even when no remote mutation is needed. Include:
`pending` status, destination, create/comment action, an opaque random
publication token unrelated to the project or runtime, a digest of the approved
public payload, and any known issue/comment URL. Also persist each selected
source part's local ID/boundary and cryptographic byte fingerprint (for example,
SHA-256 of its exact UTF-8 bytes before publication). Keep receipt metadata
outside the fingerprinted source span. This private comparison evidence must
survive restart; store no raw private snapshot. Never send source fingerprints,
boundaries or local IDs in public payloads, search queries or remote metadata.
Bind the receipt and safe draft to the selected memo's local path/identity as
well as the item/part; identical IDs in different memos are not the same source.
Existing legacy receipts remain associated with their original memo, not the
new default. If a receipt's source is ambiguous, defer cleanup and reconcile;
never reinterpret it against an empty or similarly named item in another memo.
Add the token as a harmless HTML comment to the approved outgoing body,
for example `<!-- hanchou-publication: <random-token> -->`; it is public metadata
and must contain no local item ID, path, account, or runtime ID. Reinspect and
hash that final body. Keep the exact safe draft in the same ignored area so a
retry can compare it. If a receipt cannot be saved, do not publish.

Only the writer that reserved an item may perform that attempt. Release the
editing guard before network calls. A concurrent publisher observing a pending
receipt must reconcile or defer, never send another create/comment. A memo edit
after reservation does not enlarge the approved payload or cleanup scope.

## Verify and recover

A successful API response or printed URL is insufficient. Read the issue back
from GitHub with explicit repository and number. Verify canonical repository,
URL, title, body, and relevant attachment/link contents against the approved
payload and selected requirements. For a comment, read back the exact comment
ID/URL and body as well as its parent issue; never count a comment as verified
just because the issue exists. A mismatched/missing body or unreadable result
means unverified; keep the memo and reconcile without another write.

If create/comment times out, record `unknown` if possible and retain all source.
Do not automatically retry. Look for the token and exact approved content in
the destination's issues/comments, using paginated API reads when search could
be delayed or incomplete. Verify any candidate as above. If one match is
verified, reuse it; if multiple matches exist, report the ambiguity and avoid
deletion or more posts. If none can be proven, leave the attempt unresolved.
Retry only after positive evidence that the original write was rejected before
creation, or the user explicitly resolves the duplicate risk. A restart, lost
response, empty search, or elapsed time is not that evidence.

On verified success, update the local receipt with `published-verified`, URL,
coverage (local item/part IDs), and public-payload digest before cleanup. If
this write fails, the earlier pending token/draft still supports reconciliation.
If remote success is followed by local cleanup failure, the next invocation
must read back and reuse the existing issue/comment, not create again. Never
claim that all items succeeded when only some remote writes were verified.

## Editing guard and selective cleanup

All Hanchou writers share one short-lived lock: exclusive directory creation
at `<memo_path>.lock` in the verified ignored area. An existing lock means
defer, not overwrite or remove based on age. Recover an abandoned lock only
after proving its writer has stopped. Release only a lock you acquired.
If other editors cannot honor it, defer cleanup until exclusive editing is
established. A reread or atomic rename alone does not prevent a lost update.

Under that selected memo's guard, recheck ignore/untracked status, file identity
and symlinks, then reread the current memo. Remove only an exact unchanged source part whose
meaning is covered by the verified remote content. If an item changed in place,
leave it and report cleanup pending. After restart, compare the selected span
against the original persisted fingerprint, never a fingerprint newly taken
from the current file. Missing/ambiguous original comparison evidence defers
cleanup even if the public issue is verified. Re-evaluate any remaining edits
as separate scope; reserve a new attempt only for independently identified,
authorized requirements not already covered by the verified issue. If only
another item was appended, remove
the unchanged covered item and preserve the append. For partial coverage, remove
only independently identifiable unchanged covered parts; retain uncertain or
interleaved material. Do not delete the entire file or restore an old snapshot.
Use a context-checked edit and check again immediately before writing; abort on
a mismatch. Read back to verify all unprocessed and concurrent text survived.

After cleanup, retain at most a compact secret-free receipt (local item/part ID,
verified URL, token, digest and status) in an ignored receipts section/location.
Remove resolved source prose and no-longer-needed safe drafts; do not leave a
second backlog of resolved bodies. Keep the minimal recovery evidence for any
unknown or cleanup-pending attempt, including original source fingerprints.
Report destination/URL, moved parts, retained
parts, uncertainties and cleanup failures without revealing private context.
