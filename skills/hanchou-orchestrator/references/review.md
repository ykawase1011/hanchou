# Review policy

Add an independent review Task when changes are high-risk, cross-cutting,
security-sensitive, difficult to test, or explicitly require a second opinion.
Do not add ceremonial review to every request.

The review Task depends on the implementation Task and receives the actual diff,
artifact, acceptance criteria, and verification evidence. Ask the reviewer to
check correctness, regressions, security, scope, and missing tests without
assuming the implementer's reasoning is correct.

Worker completion means the assigned Task attempt settled; it is not
automatically user acceptance. Express separate acceptance with the review Task
or a real parent Task. Route fixes to a worker unless the user explicitly
authorized the coordinator to implement them.

After an accepted completion, follow the live guide exactly for worker reuse,
retain, or release. Never substitute a raw terminal close.
