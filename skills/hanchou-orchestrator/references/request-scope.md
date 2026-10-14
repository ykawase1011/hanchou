# Request scope and authority

At intake, select the target project's optional responsibility policy under
[project-policy.md](project-policy.md), then keep a concise account per project/request of the desired result,
completion evidence, authorized operations, explicit decision gates, worker
placement preference, and next owner. Use conversation context and Orca's public
Task/message surfaces; do not persist execution IDs or create another state store.
The sole exception is the explicitly opted-in, private, non-shared, reconstructible
snapshot at a verified ignored or outside-repository destination under
[status-view.md](status-view.md): minimal non-displayed identity tuples serve
presentation comparison only. This permits no IDs in distributed files or other
configuration, and no authority, recovery, execution ledger or other state store.

Later explicit user instructions may override the selected task's standing
conditions or update the project default when requested. Do not persist a
task-only override as standing policy or configuration. The opted-in snapshot may
display an attributed, reconstructible correction already preserved in an
authorized original source; that display neither changes policy nor grants authority.
Send affected workers the changed scope and confirm application using
[inbox.md](inbox.md). Carry the current account into a retry or review brief;
do not turn one user's preference into a global default.

At each dispatch, resolve placement from the latest explicit request, then any
applicable project instructions, then the earlier request scope. Distinguish a
preference limited to one Task from one stated for this conversation or project.
Carry its scope and effective value into the Task spec. If the user changes
placement after a worker has started, first preserve its committed and
uncommitted results, account for untracked artifacts, and stop overlapping edits
at a verified boundary. Then start any replacement under the same Run with the
new placement; do not treat the new preference as evidence that the old worker
was already placed correctly.

Proceed through authorized necessary steps, including saving/integrating results
when requested. Do not present an unfinished authorized step as a user decision
or repeatedly request the same permission. Ask only about a real missing
decision, naming what is blocked and why. For example, authorization through PR
creation permits implementation, verification, and the PR, while an explicit
merge/deployment gate remains pending. PRs, local integration, CI, review fixes,
and environment application follow this request's conditions, not a fixed flow.

Match completion hooks to the role and Task acceptance. A read-only review ends
with its findings and lifecycle report; an implementation hook demanding a push,
PR, or CI cannot silently expand that review's authority. Report a blocking hook
through the coordinator and seek its scoped correction, without bypassing it or
performing unauthorized publication.

For migration work, establish whether the migration has been released/applied
and whether the target can be recreated. Prefer correcting an unreleased source
migration and verifying a fresh restore when feasible. Add a repair command or
generic backfill only when actual deployment constraints establish its need;
follow [migration-acceptance.md](migration-acceptance.md) before accepting it.

## PR titles

By default, PR titles Hanchou creates or updates describe the change in Japanese.
Product names, code identifiers, and necessary technical terms may retain their
original spelling. An explicit applicable user instruction takes precedence;
do not infer a different title language from the PR body or project docs.
This applies whether the coordinator or a delegated worker prepares the PR.
Carry the effective title-language requirement into implementation and
PR-preparation Task briefs under [task-design.md](task-design.md).

After creating or updating a PR, read back its actual title from GitHub for the
exact repository and PR, and compare it with the effective requirement before
reporting success. A local draft or successful write receipt is not read-back
evidence; record the PR identity and observed title. If read-back is unavailable
or the title differs, report that limit and correct it only within the authorized
scope, then read back again.

This default does not authorize bulk renaming preexisting PRs or translating PR
bodies. Leave existing titles and bodies untouched unless their update is in
scope; an authorized update to one title does not authorize changes to other PRs
or to its body's language.
