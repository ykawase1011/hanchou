# Orca compatibility

## Versions verified

- Checked: 2026-09-03
- Migration-request baseline: Orca v1.4.195
- Installed desktop/runtime: Orca v1.4.195
- Latest release: [Orca v1.4.196](https://github.com/stablyai/orca/releases/tag/v1.4.196),
  published 2026-09-03
- Latest release commit: `aad4ae42ea5e555f25fdec679ebbcd18cc1e8911`
- Latest tag object: `bd6dd78b33f7daad1d7afdc0ce062af8d7924813`
- Installed v1.4.195 release commit:
  `bc2f593ebba70a0ee6ff900129e4918f57b143aa`
- Official contracts reviewed: `orca-cli`, `orchestration`, `computer-use`,
  `orca-per-workspace-env`, `orca-linear`, both emulator skills, skills
  registry, Automations, and the v1.4.195 versioned core guides.

Runtime behavior must follow the installed binary, not this baseline. At each
Hanchou activation, load:

```text
ORCA skills get orca-cli
ORCA skills get orchestration --full
```

Substitute the executable selected by the official discovery rule.

## Availability and fail-closed behavior

If the installed binary or either official core skill is missing, report the
exact error and install the official skill through Orca Skills UI or the
standard Agent Skills installer. Do not use a bundled fallback.

The installed v1.4.195 runtime publishes `orchestration.contract.v1` in its
public status capabilities, and its dedicated Settings → Orchestration page has
skill coverage and nested-worker-depth controls but no enable/disable toggle.
The live read-only `run-current` surface is available. Together these are the
positive public availability contract for this installed release; Hanchou must
not require or invent an Experimental toggle that the UI does not expose.

If an older runtime explicitly reports that Experimental Orchestration is
disabled, Hanchou repeats that runtime's exact manual Settings action and does
not create or bind a Run. If the public contract capability is absent, the
runtime reports unavailable, or the read-only binding probe fails with a
feature-state error, Hanchou fails closed. It never changes Orca settings or
reads private profile state.

## Initial verification environment

The migration workspace used for v3 had no pre-installed Orca executable or
running runtime. The official release asset `Orca-1.4.195-arm64-mac.zip` was
downloaded and its SHA-256
`1b93912d153b334559f047df4d62002ff661114e02ce3c52282594f038a0086a`
matched GitHub release metadata. Its packaged CLI reported bundle version
1.4.195 and served both live guides from an isolated temporary HOME (414 and
437 lines respectively). The live status response correctly reported
`runtime.state: not_running`; `orchestration run-current` failed closed with
`runtime_unavailable` and did not create state in the isolated HOME.

The v1.4.195 macOS headless package reproduced
[official issue #16761](https://github.com/stablyai/orca/issues/16761):
`AppEnvironment not initialized`. The issue's
[fix commit](https://github.com/stablyai/orca/commit/18e8fe47705ebd17917a194c33fd10bc7bb5723d)
is not an ancestor of the v1.4.195 release commit, so the released arm64 bundle
does not contain that fix.

Bounded runtime E2E therefore used the checksum-verified official v1.4.188
package, the known-good version identified in that issue. It reached
`orca_server_ready`, restored state across a full restart, and completed native
Run/Task/Dispatch/message/worker/review/local-cross-project/Automation flows.
The final worker proof used v1.4.188 CLI, live guide, and runtime together.

The official v1.4.188 Linux arm64 AppImage was also checksum-verified and run
as a disposable connected server. Pairing, ready status, remote repository and
worktree registration, and host-directed worker-terminal placement passed.
The container intentionally had neither a provider CLI nor host credentials,
so `agent_prompt_stalled` is evidence only through placement, not a successful
remote worker completion.

A later v1.4.188 recovery pass rebound two previously persisted ordinary Runs
to fresh terminal handles through public `run-use`, then proved per-Run Task,
message, Delivery, and acknowledgement isolation. A tracked test Dispatch also
delivered and acknowledged `escalation`. No private database inspection or
takeover-only mutation was used.

A renderer-backed desktop v1.4.188 pass subsequently completed a visible Codex
worker and cleanly released it with terminal closure and captured archive,
removing the headless `tab_not_found` uncertainty from the worker-release
criterion. The version-matched `computer-use` guide was loaded, but the helper
reported Accessibility and screenshot permissions not granted. Two idle Codex
coordinators did not receive native Delivery injection even though public
`check` showed their targeted lifecycle messages unread, so idle wake and the
Experimental UI state remain unqualified rather than inferred.

## Installed v1.4.195 desktop follow-up

After the user installed Orca normally, the public CLI resolved at
`/usr/local/bin/orca`. `status --json` reported a ready v1.4.195 runtime and an
available desktop window. The binary's live `orca-cli`, `orchestration --full`,
and `computer-use` guides were loaded before state operations.

The official Computer Use helper reported both Accessibility and screenshots
permissions `granted`. A fresh Codex coordinator bound Run
`run_e36d686e6f8c`; its supervised read-only worker completed Task
`task_1bc65dddc553` and Dispatch `ctx_f552888c2bbf`. The coordinator then
remained idle for more than 35 seconds, but no native pointer was injected.
Public non-consuming `check --peek` showed unread worker message
`msg_0f885ff19791` with no delivery timestamp. A single bounded `check --wait`
returned Delivery `delivery_797a3ac43961`; clean release closed the exact worker
terminal, and the Delivery was acknowledged afterward.

This qualifies the installed v1.4.195 Run/Task/Dispatch/Inbox/bounded-wait and
renderer-backed cleanup path, and shows that missing Computer Use permission
does not explain the idle-wake result.

A final standard-installer pass used an Orca-created worktree containing the
released Hanchou skill. Temporary Hanchou Run `run_8cb0c22a6743` completed
Task `task_efb1bf4df819` and Dispatch `ctx_86b19029c6a8`, but more than 90
seconds of passive observation produced no new coordinator turn. Read-only
`check --peek` showed unread message `msg_1dbbc74f7b86` with
`delivered_at: null`; bounded fallback, release, and acknowledgement then
passed. Native idle wake is therefore unavailable on installed v1.4.195. Open
upstream issue [#12953](https://github.com/stablyai/orca/issues/12953) describes
the same lightweight-Run coordinator gap and says lifecycle mail currently
reaches it through `check --wait`. Hanchou uses that official bounded fallback,
which satisfies the migration acceptance criterion without adding a daemon or
polling loop.

The same installed-skill workspace passed a disabled Automation manual run.
Its Codex session explicitly activated Temporary Hanchou, and Run
`run_39c3962e5e5e`, Task `task_fb0b5ee6ce68`, Dispatch
`ctx_97d1a21880af`, bounded Delivery, worker release, and acknowledgement all
completed without source changes. The Automation was removed afterward.

On 2026-09-03, Computer Use captured the visible Settings → Orchestration page.
It showed all five detected agents carrying the official skill and nested
worker depth `1`; there was no Experimental enable/disable control. Public
`status --json` simultaneously advertised `orchestration.contract.v1` and the
runtime was ready. No setting was changed. The current profile has no saved
remote environment, so remote completion is conditional and was not rerun.

v1.4.196 was published during this migration. Its release notes include the
startup/app-environment fixes relevant to the earlier v1.4.195 headless failure.
The installed runtime remains v1.4.195, so installed-version E2E continues to
use its live guides rather than substituting v1.4.196 documentation.

This host's selected `/Applications/Xcode.app` developer path has mismatched
private frameworks. Existing Command Line Tools work through
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`; Orca was relaunched with
that process-local value for the final worktree E2E. No system developer-tool
selection was changed.

See [VALIDATION.md](VALIDATION.md) for exact qualification evidence and limits.
Do not interpret the v1.4.188 compatibility proof as permission to skip the
installed-binary live guides or as qualification of the v1.4.195 headless
release.
