# Optional local status view

Use this reference only when an activated Hanchou session receives an explicit
request to create/update a local status view, or the project has explicitly opted
in to updates at meaningful coordinator checkpoints. Installation, an existing
HTML file, or a policy file alone does not opt in. Keep the ordinary activation
gate unchanged. Use [status-view.html](../assets/status-view.html); add no helper,
server, generator service, runtime adapter, DB/cache, scheduler, or registry.

## Agree on the document, not new authority

Record the opt-in in the existing authorized task/conversation: target project,
real destination (default `<target-root>/.hanchou/index.html`), the sole writing
coordinator and its Run, displayed Runs, allowed original-text scope, retention,
local readers/permissions and backup policy. These are recorded choices, not a
mandatory questionnaire: for a clear one-time request, proceed with conservative
defaults (current coordinator as writer, current authorized Run as coverage,
retrieved minimal text, private directory and mode 0600, disposable retention until
replacement/removal, no separate snapshot backup). Ask only for a real conflict or
missing choice that prevents safe useful output. Partial observations are useful:
show gaps and proceed; perfect coverage is never a prerequisite. Original-source
preservation obligations are separate from disposable snapshot retention.
The destination may be elsewhere.
Keep this selection pinned independently of the coordinator's execution child;
never silently write the coordinator checkout's `.hanchou` instead of the selected
target. The view does not relax a project's main/child placement preference.
A human may request a one-time update without authorizing future updates.

One writer owns one target. Other Runs may be displayed only as attributed
observations, never taken over or merged into the writer's work. Other coordinators
must use distinct explicitly selected targets or send observations to the existing
writer using public Orca coordination. No shared-file ownership election, lock
service, or automatic takeover: if the owner cannot be verified, defer publication.
A file's embedded `writer` is a comparison hint, not proof of ownership.

Once opted in, update on a material request/correction, delegation, decision,
acceptance, verified PR/merge result, or resource disposition. Do not rewrite on
no-op Inbox checks, heartbeats or silence. Updates happen in the existing work;
there is no promise of updates after the turn ends, polling, auto-refresh, or
separate scheduling engine. Preserve any cron stop; opt-in never authorizes
Automation registration, enablement or manual trials.

## Observe and reduce

Use the selected Orca binary's current public guides for read-only Run, Task,
gate, worker and worktree observations, and public GitHub reads for PR facts.
Do not copy command references, inspect private Orca files/APIs, export broad
private transcripts, or consume/ack Inbox merely to populate a view. Read a known
original only from its authorized source. Task specs are summaries, not original
user text. Missing originals stay missing. An empty gate/task response covers
only that source/scope, not every conversational decision or Run.

Keep a minimal reconstructible presentation snapshot. Work ownership, accepted
results, original instructions, corrections and decisions must already exist in
Orca or another explicitly selected durable original source. The HTML must never
be their only copy, an Inbox/ack log, recovery plan, queue or authority store.
Losing it loses only convenience. Before resource cleanup, follow
[cleanup.md](cleanup.md) and verify preservation/content correspondence of unique
results at their authorized destination independently of this view. Retain prior
or deleted worktree relations when supported by preserved authoritative evidence;
an absent worktree must not erase accepted results or authoritative history.

Link worktree observations by exact identity **and host and project**, with
explicit observed lineage and owner, never display name or path similarity.
Distinguish Git branch/base from Orca parentage, past association from current
presence, PTY liveness from agent progress, and `worker_done` from acceptance.
PR created, closed without merge, merged and cleanup are separate facts. Include
head and read-back time for PR evidence; an old successful check is not current
success. Conflicting/failed/missing observations stay visibly uncertain even when
a previously accepted result is displayed. Never infer idle/completion from silence.

## Presentation payload (version 1)

This is a disposable view format, not a canonical task model or migration contract.
Compose a plain JSON object; unknown fields are not rendered. Use ISO 8601 times
with timezone. Missing fields render as unknown, not successful. Keep IDs only in
non-displayed comparison fields, and human-friendly labels in displayed fields.
No private populated data belongs in this repository. A synthetic example lives
in `tests/fixtures/status-view.json` for repository QA, not as a user's history.

- Top level: `version: 1`, `title`, `generatedAt`, `staleAfterHours` (explicitly
  chosen freshness threshold, positive number), `coverage` (scope and limitations),
  `writerLabel`, `writer` (exact Run/host/project identity for conflict comparison),
  `revision` (new presentation revision), `inputs` (source identities and observed
  revisions/digests), `gaps`, `requests`, `worktrees`.
- Every observation, including each gap, original, correction, PR and worktree:
  `observedAt`, `source` (human-readable provenance), `scope`, `quality`
  (`observed`, `stale`, `unknown`, `missing`, `conflict`), optional `note` for failure,
  contradiction, evidence limits or non-contemporaneous reads. Missing/future times
  and missing freshness thresholds remain uncertain. Generation time never replaces
  an individual observation time. Gaps also have `text`.
- Request: `title`, effective `summary`, `runLabel`, `owner` (next responsible person),
  `next`, `decision` (needed decision and actual permission boundary),
  `acceptanceCriteria`, `group` (`decision`, `active`, `waiting`, `result`, `unknown`),
  `original`, chronological `corrections`, `lifecycle`, `pullRequests`, `worktreeRefs`.
  `result` requires explicit `lifecycle.acceptance: accepted`; otherwise the renderer
  puts it in unknown. Selection of a section is presentation, not a state transition.
- Original: `text` only when truly retrieved, with provenance/scope/time. Corrections:
  `label`, `text`, `supersedes` (which original/correction or permission it replaces),
  with provenance identifying the trusted human decision separately from quotations.
  Do not put the current summary into `original`. Original absence is displayed.
- Lifecycle values: `worker` = `working|reported|failed`; `acceptance` =
  `pending|accepted|rejected`; `pr` = `none|created|closed`; `merge` =
  `none|pending|merged`; `cleanup` = `pending|retained|done`. Unknown/missing values
  stay unknown. These are independently observed labels, never derived from each
  other; explain differing evidence/times in `note` and PR records.
  `pr: closed` is neutral about merge status: it can accompany `merge: merged`
  or an unknown merge observation. Use `merge: none|pending` only with explicit
  unmerged evidence; a PR record's `state` may say `closed without merge` only
  when that combined fact was observed, never from closure alone.
- PR: `label`, `state` (explicit observed fact, including created/closed/merged),
  `head`, observation metadata, optional `url`, `project` (`github:owner/repository`).
  Originals/corrections may also have `url` and `project`. First validate the source
  and exact project/target against public observations. The renderer additionally
  allows only HTTPS `github.com/<owner>/<repo>/issues/<positive-number>` or
  `/pull/<positive-number>` with an optional `#issuecomment-<digits>`, no credentials,
  query or nondefault port. Unsupported targets render as unverified text.
- Worktree: `identity`, `host`, `project`, optional `parent` with that exact tuple;
  `label`, `hostLabel`, `projectLabel`, `role` (human checkout / Hanchou child),
  `presence` (observed present/deleted/unknown), `owner`, `retainedReason`,
  `nextReview`, `history` (past relations and their evidence), observation metadata.
  Request `worktreeRefs` use the same tuple. Duplicate/missing matches stay unresolved.
  Only verified same-host/project parents may be linked. Preserve deleted rows when
  their relation is still useful; do not invent a parent because of indentation.

## Compose and publish locally

The coordinator composes the snapshot as part of its ordinary document work. Do
not add a production exporter or runtime collector. Before every write:

1. Verify target and every parent component using actual path/lstat/realpath;
   reject symlinks (including dangling links), unexpected nonregular files,
   path escapes, changed parent identities, shared/untrusted writable parents,
   or a mismatch with the pinned destination. Check existing file permissions
   and local readers. Use a private directory and a mode-0600 output by default.
   A custom destination needs the same checks. Never follow a link to write.
2. In the actual target Git checkout, inspect tracked status (including a previously
   tracked ignored file) and ignore behavior for the exact path. Refuse tracked
   targets. If it is not already ignored, select a private location outside Git
   or obtain explicit scope for a local exclusion. Do not alter shared `.gitignore`
   or silently change the shared worktree exclude file. Ignore is not confidentiality.
3. Read the existing target without executing it; record bytes/digest, revision,
   writer and file/parent identities, or record verified absence. Verify the sole
   writer through the existing conversation/Run, not through the file. Preserve
   all displayed Runs and relevant historical relations or explicitly report any
   reduced coverage. Do not merge arbitrary stale JSON into authoritative facts.
4. Gather source observations and record input revisions or content digests and
   observed times. Re-read the relevant public facts/revisions before publication;
   if they changed, re-observe/recompose. A source with no stable revision requires
   comparison of relevant values; an unavailable re-read is an explicit gap, not a
   claim of currentness. Do not claim a transactional snapshot across Orca/GitHub.
5. Serialize with a standard JSON serializer; UTF-8 encode and base64 encode the
   bytes (ASCII alphabet only). Replace only the payload inside the template's
   `script#snapshot[type="application/octet-stream"]`. **Never interpolate raw
   JSON, HTML, text, URLs, or JavaScript into markup/script/CSS**; `</script>`, quotes,
   Unicode and newlines must remain encoded. Do not change the executable script
   or hash CSP when populating data. The browser uses text nodes, never HTML eval.
6. Write a unique exclusive mode-0600 temporary file in the checked destination
   directory. Validate base64/JSON, expected version, sources, scope and rendered
   state; verify unchanged template script/style CSP hashes. Flush/fsync the file.
   Immediately recheck owner, source versions, existing target bytes/revision,
   file/parent identities, symlinks, tracked/ignore status and permissions. On any
   conflict keep the old target, discard only your temp, and re-observe or ask the
   owner; do not overwrite another writer or retry blindly.
7. Under the established single writer, atomically replace the target using the
   filesystem's same-directory rename/replace and sync the directory where supported.
   Re-read and verify the published digest and private permissions. A crash before
   replacement leaves the previous complete file; after replacement the new complete
   file. Atomic replacement prevents torn reads, **not lost concurrent writes**:
   if exclusive ownership cannot be established, do not publish. There is no custom
   locking service and no claim to defend against arbitrary hostile filesystem races.

Report actual path, observed time, source gaps and next updater. Opening the local
file in a browser is sufficient; no network/server is needed. Browser JavaScript
only renders/searches/filters/details the embedded snapshot. No fetch, telemetry,
external assets, localStorage, service worker, timer/auto-refresh, IPC, approval,
editing, live terminal/editor embed or guessed deep link. External links activate
only on an explicit click. Do not upload to Artifacts or another public host as a
preview fallback. Orca file-open does not guarantee HTML preview; only claim an
Orca browser behavior after verifying that public scoped path on the actual build.
