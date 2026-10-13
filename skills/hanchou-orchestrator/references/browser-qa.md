# Browser and API acceptance

Define observable postconditions before the action and retain a minimal baseline
of existing objects/relationships and the exact test-created targets. Use the
official browser guide and page identity; re-observe after navigation or state
changes. Accept only when the post-action URL, target identifier, displayed
content, or persisted result proves the intended action. A success receipt or
an evidence filename alone is not a pass; unchanged/wrong-screen state fails the
navigation criterion even when the action call succeeded.

Report deployment verification, database checks, and real browser/API checks
separately, marking each unperformed or inconclusive layer explicitly. Database
agreement alone cannot qualify application behavior. For UI count labels, verify
what relation and filter the label counts against the product specification and
implementation; similar associations are not interchangeable.

On transient `runtime_unavailable` or a browser error, preserve the exact receipt
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
