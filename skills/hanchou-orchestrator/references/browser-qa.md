# Browser and API acceptance

## Before feature QA: health and readiness

Plan three separate judgments before starting QA:

| Layer | Required evidence | What it cannot establish |
| --- | --- | --- |
| Health | The scoped service responds and the DB connection works, where applicable. HTTP success and `SELECT 1` are health evidence only. | Intended target, required tables/views/schema, or feature behavior. |
| Readiness | Intended and actual target match, and a representative read-only business query uses the structures required by the feature and meets its expected postcondition. | Real screen/API feature QA completion. |
| Functional QA | Actual target screen/API actions satisfy their own observable postconditions below. | Untested paths or deployment verification. |

For a DB-backed feature, establish the following before declaring readiness:

1. Name the intended environment and the project-approved source for that intent.
   Compare it with the actual connection used by the application under test,
   using only authorized non-secret metadata. A separate diagnostic connection
   or a matching configuration file alone does not prove the application's
   effective target. Include relevant database/schema/tenant identity only when
   needed and authorized; keep the comparison private if only its boolean may
   be disclosed. Missing, ambiguous, mismatched, or unverifiable identity cannot
   pass readiness. Stop feature QA on that target and report the gap.
2. Derive the representative query from the target project's actual feature
   query/schema or approved verification procedure. Name its source, required
   tables/views/schema, read-only scope, expected predicate, and bounded execution
   limits in the Task. Use the application's effective DB identity/permissions
   and relevant schema resolution, not an elevated diagnostic account. Verify
   that the query and any functions it calls are read-only; a `SELECT` prefix is
   not proof. Do not hard-code project-specific SQL in the distributed skill.
3. Once the target is verified, execute that query through an authorized safe
   route and check the expected predicate inside the processing context. HTTP,
   `SELECT 1`, a catalog listing, or a connection exit code cannot substitute
   for using the feature's required structures. Define whether an empty result
   is valid beforehand; do not infer a data defect from emptiness alone. If the
   query, authorization, or safe route is unavailable, mark readiness unverified
   and request the missing decision rather than inventing a universal probe.

Apply [secret-inputs.md](secret-inputs.md) before reading connection inputs or
running checks. Predeclare allowed fields and values, for example a fixed check
identifier, `target_matches: true/false/unknown`, and bounded health, readiness,
representative-query, and functional-QA results. Project inside the process
before stdout/stderr or tool return, including exceptions and child failures.
Do not emit credentials, full connection strings, raw query results, row data,
raw errors, or unapproved identifiers; even metadata needs disclosure approval.

On failure, distinguish evidence of target mismatch, missing/incompatible
table/view/schema, and insufficient permissions. Separate these from connection
failure, tool failure, and unknown cause; classify only what safe evidence
supports. A missing relation on a wrong target is not proof that the intended
database needs a migration. Stop at diagnosis within existing authority: failure
does not authorize switching targets/accounts, repairing data, applying migrations,
creating structures, or changing grants/configuration. After an authorized
correction, repeat target comparison and the representative query; preserve the
earlier failure in the acceptance report. Use
[migration-acceptance.md](migration-acceptance.md) for any separately authorized
migration investigation or repair.

Report each layer as passed, failed, unperformed, or inconclusive with only its
minimal approved evidence. Readiness passes only with positive target and query
evidence; a passed representative query with functional QA unperformed remains
**readiness passed / functional QA unperformed**. Do not collapse this into QA
PASS. Recheck readiness when the effective target, identity, schema, or deployed
feature changes. For a feature with no DB dependency, document that scope and
its applicable readiness checks; do not invent a DB requirement or count an
omitted required check as passed.

## Browser selection and feature postconditions

Choose the browser for each QA task before opening or changing a tab. Honor the
user's explicit browser choice first. Otherwise use the target workspace's Orca
embedded browser when its live guide, connection, and current capabilities can
perform the required action. If it cannot, use an isolated agent browser
session. Use the user's existing desktop browser when its login state or a
specific feature is necessary, or when the isolated choices cannot perform the
task; minimize changes to the user's tabs, focus, and settings. Check actual
capability and page identity rather than assuming a browser is usable because
its tab exists. A browser choice does not authorize logging in, changing an
account, or using a different identity.

Before authenticated inspection, apply [secret-inputs.md](secret-inputs.md).
Define safe postcondition fields before evaluation; project them inside the
browser evaluation before its return crosses the tool boundary. Do not return
raw DOM, storage, cookies, headers, response bodies, or exception text and then
redact them in chat. Keep the same boundary for snapshots and error receipts;
when the tool cannot constrain them, report that verification unavailable.

Define observable postconditions before the action and retain a minimal baseline
of existing objects/relationships and the exact test-created targets. Use the
official browser guide and page identity; re-observe after navigation or state
changes. Accept only when the post-action URL, target identifier, displayed
content, or persisted result proves the intended action. A success receipt or
an evidence filename alone is not a pass; unchanged/wrong-screen state fails the
navigation criterion even when the action call succeeded.

If an action appears ineffective, read the page and relevant persisted state
before retrying or changing browsers. Reconcile whether it created or changed
the target despite an unchanged screen or failed receipt. Switch only when the
required operation cannot be completed in the current browser, and repeat a
mutating action only after its intended effect is shown absent. If the effect
is unknown, stop and report that uncertainty instead of duplicating it.

Report deployment verification, database checks, and real browser/API checks
separately, marking each unperformed or inconclusive layer explicitly. Database
agreement alone cannot qualify application behavior. For UI count labels, verify
what relation and filter the label counts against the product specification and
implementation; similar associations are not interchangeable.

On transient `runtime_unavailable` or a browser error, preserve only the receipt's
pre-authorized non-secret fields under [secret-inputs.md](secret-inputs.md)
and inspect official status, tab inventory, and a fresh snapshot of the same
page where reachable. Follow the live browser recovery contract. Browser failure
does not by itself prove Orca, the worker, or the application stopped. If current
observations show the page/worker can continue, resume there without duplicate
sessions or a speculative restart; otherwise report which observation remains
unavailable. Separate tool failure from reproduced application failure. Do not
claim to fix Orca's successful-but-ineffective action behavior through this policy.

For QA cleanup, compare the baseline with the exact objects and relationships
created by this test. Delete only authorized test-created targets whose identity
and ownership are proven, and verify pre-existing data and relations survive.
Do not use a broad date, name, or count match as deletion authority. Apply
[cleanup.md](cleanup.md) for test workers, workspaces, and services.
