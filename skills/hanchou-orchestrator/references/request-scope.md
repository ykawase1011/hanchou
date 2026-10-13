# Request scope and authority

At intake, keep a concise account per project/request of the desired result,
completion evidence, authorized operations, explicit decision gates, worker
placement preference, and next owner. Use conversation context and Orca's public
Task/message surfaces; do not persist execution IDs or create another state store.

Later user instructions update this account and supersede conflicting older
steps. Send affected workers the changed scope and confirm application using
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
