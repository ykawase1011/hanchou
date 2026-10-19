# Migration investigation and acceptance

Use this for migration diagnosis, repair, and independent audit. Before querying
or changing data, verify the intended isolated validation target using only
necessary non-secret connection metadata, under the shared
[secret-input boundary](secret-inputs.md). Apply it before reading connection
inputs and to diagnostic failures as well as successful queries. A
connection error alone does not establish runtime failure or a data defect.

For feature QA, apply the separate
[health and readiness gates](browser-qa.md#before-feature-qa-health-and-readiness):
HTTP or `SELECT 1` success does not prove the actual application target or its
required tables/views/schema are ready. Require the project-derived read-only
representative business query under the application's effective permissions.
Distinguish wrong target, structure mismatch, and permission failure before
proposing a migration; readiness failure grants no repair, schema/data change,
grant change, or connection-setting change authority. After an authorized
correction, recheck target and query, and report functional QA independently.

Separate code-derived hypotheses, observed data, and user-observed symptoms.
Require read-only evidence supporting the cause and affected population before
accepting a repair. Withdraw a draft based on a disproven premise; do not apply
it because it is already written. First establish release/application and
recreation constraints under [request-scope.md](request-scope.md).

Carry the following into the implementation and independent review brief:

- Source and destination schema versions/types, association direction and
  cardinality, history linkage, and the actual migration transformations.
- The timestamp oracle for each field: source creation/update/event/history
  times, timezone/precision, aggregation rule, and expected user-facing display
  and ordering. Inspect the real displayed fields and queries, not just the
  date name the user initially used. Correct execution of current code and
  correctness of the user-facing specification are separate judgments.
- What original pre-aggregation data still exists. A surviving association or
  mutually matching migrated rows does not prove recovery of lost source times.
  Label unrecoverable/unknown values rather than guessing them.

Compare audit predicates with the migration's real schema and SQL, including
relation direction and history joins. Challenge an unexpected zero count with a
known matching sample, schema/type checks, and progressively scoped predicates;
zero alone is not proof of absence. Audit source-to-destination correctness
separately from consistency among destination rows, since both outputs can share
the same error. Every numeric claim names its comparison source, destination,
population/filter, and units or timestamp basis.

As relevant to the symptom, inspect row counts, entity timestamps, history's own
timestamps, and the actual user-facing list search/sort conditions and top-result
breakdown. Counts alone cannot establish visible correctness. Report incomplete
source evidence and any untested UI/API path explicitly.

Require regression checks against the real migration implementation or actual
SQL predicates on an isolated target. Show that a meaningful wrong change
(reversed join, wrong timestamp source, missing history predicate) makes the
check fail, and restore it afterward. An independent reviewer must challenge the
oracle and samples rather than merely repeat the implementation's assumptions.
A copied algorithm or toy simulation that never calls the migration cannot
qualify its behavior. Hanchou supplies this acceptance policy, not a migration
engine or universal repair tool.
