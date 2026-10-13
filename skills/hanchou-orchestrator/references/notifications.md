# Notification aggregation design

This is a policy proposal for requested supervised notification aggregation,
not a claim that suppression is supported or configured. Orca owns delivery and
user-visible settings. Check only public capabilities and explain what is
supported, unverified, and unchanged before offering a configuration action.

Identify supervised workers from actual active ownership in public Orca state,
not workspace names, tab titles, or historical Dispatch counts. Route routine
worker completion/input needs through the Run Inbox and coordinator; present
the user with overall completion, decisions they must make, and unresolved
blockers. Separate routine progress from notifications that require attention.

Any suppression design must preserve Inbox messages, work history, in-app
progress, and unread indicators. Never mark mail read merely to suppress a
notification. A full handoff ends supervision and must restore ordinary worker
notifications; coordinator absence must have an Orca-provided fallback that
delivers critical questions/blockers. Qualify both paths before suppression.

Use a notification setting only if the installed public contract exposes it,
the user can inspect/change it, and the requested scope authorizes that change.
Do not infer a flag from workspace metadata or alter private settings. If no
qualified setting/restoration/fallback is available, explain the missing Orca
prerequisite and leave notifications unchanged. Inbox aggregation policy alone
does not demonstrate reduced mobile notifications or reliable mobile delivery.
