# Local status view validation

The optional view is one static asset and a coordinator document workflow. It has
no production exporter, filesystem writer, service or API adapter. `make check`
checks the exact allowed asset, CSP hashes, serializer containment, JavaScript
syntax, synthetic fixture invariants and the existing repository contracts.

`make check-status-view-browser` runs the test-only Playwright script. Supply
Playwright through `NODE_PATH` pointing at a disposable dependency directory;
set `PLAYWRIGHT_BROWSERS_PATH` to a dedicated test cache. Always use
`PLAYWRIGHT_SKIP_BROWSER_GC=1` when installing test browsers to avoid collecting
someone else's browser cache. The CI workflow pins the test dependency. Neither
Playwright nor its browser is a distributed skill/runtime dependency.

The runner opens a temporary `file:` HTML directly, never starts a server, closes
its context/browser in `finally`, and prints the synthetic preview/screenshots.
It verifies Japanese rendering, separated completion/acceptance/PR/merge states,
stale/conflicting/missing evidence, unaccepted-result fallback, same-name/deleted
worktrees, tuple mismatch/duplicate handling, original/correction search, empty and
malformed data, keyboard details, and 375px overflow. Hostile strings stay text;
unsafe/cross-project URLs stay unlinked. Load/filter/search/details send zero HTTP
requests; the one explicit external click is intercepted by the test and checks
`noopener`. Test artifacts contain only the synthetic fixture.

## Publication policy exercises (not a shipped writer implementation)

An independent coordinator/reviewer should apply the reference to these scenarios.
Automated renderer tests do not prove an agent followed the filesystem or authority
workflow, and atomic rename alone does not provide compare-and-swap semantics.

| Scenario | Required outcome |
| --- | --- |
| Clear one-time request, partial public facts | Create a useful private snapshot with gaps and conservative recorded defaults; no questionnaire or perfect-coverage requirement |
| Symlink parent/target, tracked target, ignore negation | Do not overwrite; retain previous file, explain actual conflict and select authorized private destination |
| Target digest/input revision changes while composing | Defer replacement, re-observe/recompose; never lose another Run's work |
| Second Run claims same output with no handoff | Keep verified single writer; choose a distinct target or send attributed observations to that writer |
| Crash before same-directory replace | Prior complete snapshot survives; remove only the writer's unfinished temp when ownership is verified |
| Crash after replace | New complete snapshot can be verified by digest; no unique result depends on this file |
| Deleted worktree with accepted result elsewhere | Preserve its historical relation and source evidence; do not erase original history |
| Cron is stopped; idle/no-op mail arrives | No schedule enablement/manual trial and no noise-driven rewrite |

No claim is made for Orca HTML preview, local-file embeds, Safari/Firefox,
screen-reader qualification, live state synchronization or arbitrary-hostile-user
filesystem race protection. Use the public scoped browser guide before testing
Orca tabs; file-open is not proof of rendering. Static snapshots may be discarded
and regenerated; original instructions and accepted results must remain elsewhere.
