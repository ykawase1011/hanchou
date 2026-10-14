# Read-only update check

Use this at an explicit check request or when an already activated Hanchou
routes its activation/new-task checkpoint here. Ordinary Orca sessions and
helper-only work do not activate Hanchou. Never install a missing helper to
perform a check, schedule future checks, poll, or add an update service.

At activation and each separately assigned new user task, check at most once
for that task; activation plus its first task is one checkpoint. Follow-ups,
worker events, retries, resumed turns, and same-task wakes are not new tasks.
Keep the attempted/result marker in existing conversation/Task context, including
failed or skipped checks, so they do not repeat. An explicit later recheck can
override that marker. This is no promise of checks while the agent is inactive.

1. Respect an explicit no-network/no-check preference. Inspect only the current
   workspace and user Hanchou installation inventory described in the entrypoint:
   installed subset, each scope/agent target, canonical path and aliases/copies,
   origin, install method, recorded baseline revision and pin. Inspect metadata
   with available read-only tools; do not bootstrap/install an installer merely
   for this checkpoint. Do not run an unscoped all-skills check or update.
2. Verify official origin `https://github.com/ykawase1011/hanchou`; names alone
   are not provenance. Use a disposable comparison directory, not a managed
   updater checkout. Fetch only official source data needed for those installed
   skill trees at the baseline and candidate revisions, with bounded network
   timeouts. Resolve the recorded pin first: a fixed commit/tag stays pinned;
   a tracked branch is resolved once to an exact commit for this check. With no
   pin, resolve the official default branch. A moved tag or unknown pin meaning
   is a decision to preserve/report, not permission to float to latest.
3. Compare each complete installed skill tree to its recorded baseline,
   including references/assets, additions, removals, file modes and link targets.
   Inspect link metadata without writing through it; custom source symlinks and
   forks remain protected. An installer lock hash or version string alone is
   insufficient. Compare the selected baseline skill trees with the same trees
   at the candidate revision. A changed repository HEAD, README, or uninstalled
   helper alone is not an applicable update. Keep local/global and shadowed
   copies distinct. Missing upstream skills are removal/compatibility decisions,
   never automatic deletion.
4. Record a bounded result per target: **current** (selected content unchanged),
   **available** (selected upstream content differs and installed baseline is
   verified clean), **pinned** (held at the chosen revision), **modified**,
   **unknown** (missing provenance/baseline, unsupported metadata or network
   failure), or **absent**. Include resolved baseline/candidate and relevant
   content evidence when known. Do not label unknown as current or overwrite a
   modified copy. Report actionable changes or limitations briefly; do not
   repeatedly notify the same unchanged finding during the task.

Remove disposable comparison data when no longer needed; preserve any evidence
needed for a requested update in private task context. Failures and unknown
baselines do not block unrelated requested work. Continue that work after one
bounded attempt; do not retry on every message or ask to install the helper.
Unless the current request is check-only, if an applicable scoped update was
already authorized, the entrypoint may proceed
through its inspection, backup, exact-revision and placement verification gates.
Otherwise report the concrete update scope and request only the missing update
permission. Neither outcome grants rotation or old-self-close authority.
