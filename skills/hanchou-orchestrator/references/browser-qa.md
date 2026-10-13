# Browser and API acceptance

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
