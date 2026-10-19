# Review policy

Add an independent review Task when changes are high-risk, cross-cutting,
security-sensitive, difficult to test, or explicitly require a second opinion.
Do not add ceremonial review to every request.

The review Task depends on the implementation Task and receives the actual diff,
artifact, acceptance criteria, and verification evidence. Ask the reviewer to
check correctness, regressions, security, scope, and missing tests without
assuming the implementer's reasoning is correct.

Carry the latest scope/authority and verify the review input includes uncommitted
results when relevant. For data work, use
[migration-acceptance.md](migration-acceptance.md); for browser/API acceptance,
use [browser-qa.md](browser-qa.md). Require evidence independent of the claim being
reviewed. A read-only review does not inherit implementation publication hooks.

Resolve the reviewer's model/effort from the latest scoped role policy in
[routing.md](routing.md), and include its difficulty and selection reason in the
Task. Review independence is not permission to inherit the main coordinator's
setting or exceed the user's ceiling. A review retry or nested reviewer receives
the same role rules and fresh requested/effective verification, not an automatic
effort upgrade.

Worker completion means the assigned Task attempt settled; it is not
automatically user acceptance. Express separate acceptance with the review Task
or a real parent Task. Route fixes to a worker unless the user explicitly
authorized the coordinator to implement them.

After an accepted completion, apply [cleanup.md](cleanup.md) and the live guide
for reuse/release and remaining resources. Never substitute a raw terminal close.
