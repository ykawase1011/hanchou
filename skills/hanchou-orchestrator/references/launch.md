# Launch and handoff

The bundled launcher is one-shot Bash 3.2+ with Git and jq. Use Herdr 0.9.5's
public local-session contracts; verify compatibility before adopting a different
version. Install the official `codex` or `claude` CLI in both the caller's PATH
and Herdr's shell environment. The script does not install tools,
change global agent settings, submit a mission, or install integrations.

Use this launch contract directly; inspect the script source only when diagnosing
an actual failure or developing it. Do not load repository design/history or the
companion's references as routine supervisor preparation. The qualified launcher
reads its bundled companion once; manual bootstrap needs its exact content.
Applicable project instructions still govern
placement, authority and preservation.

By default the launcher starts an owned **local named Herdr session** for the
attempt. See [owned lifecycle](lifecycle.md) for its record and delayed cleanup.
Explicit `--session NAME` instead selects an already-running shared server.
Keep the same executable and session for subsequent calls; workspace/pane IDs are scoped to that server.
The launcher checks current connectivity/inventory. Never silently fall back to
the default server or a remote host. Closing a viewer does not terminate the
server's agents. Reuse the caller/init readiness handoff for
tool paths/versions, log-home provenance and session configuration location;
verify changed/mutable facts directly instead of touring the CLI command tree.

Use the selected session's notification configuration to limit routine progress.
Check it at the known source and record its scope; do not inspect unrelated
panes to infer the new agent's environment. After launch, inspect the returned
pane's actual process/environment for unexpected wrappers, hooks or remote control.
An installed hook is not evidence that it sends human alerts. Report unverified
external notification behavior without claiming complete OS/mobile silence;
only a specific conflicting behavior or an explicit all-alerts-off requirement
needs resolution before work. Keep approvals and important results reachable.
Do not rewrite shared/global settings or disable integrations speculatively.

## Human-visible Herdr

Every new sokkin launch includes a visible Herdr tab before real assignment,
unless the user or pinned policy explicitly selects headless operation. The
supervisor opens it through the host's existing terminal UI; the one-shot
launcher remains independent of that UI. In Orca, use the available Orca terminal
skill/tool to create a tab in the supervisor's current workspace without moving
or replacing the conversation. Other hosts may use their existing terminal tabs
or windows. No Orca installation is required on those hosts.

Create and verify tabs/workspaces in the background. Preserve the user's current
focus, including the existing conversation; only an explicit request to switch
the displayed location authorizes activation. In Orca, do not use `--focus`,
`--activate`, `terminal switch`, or the revealing `--run-hooks` for creation or
verification. Use public read/list/visual-layout observations without selecting
the tab. Other hosts follow the same rule using their supported public controls.
If non-activating creation or display verification is unavailable, report that
limitation and connection details; do not bring a window forward or switch back
to the conversation on the user's behalf. The headless exception below still
requires explicit authority.

In Orca, give the viewer an explicit tab title `Herdr | <short mission name>`
using the user's language, for example `Herdr | Issue整理`. Add a short attempt
suffix only when needed to distinguish tabs for the same mission. Use the
installed Orca terminal contract to set the title at creation and, once the
handle is known, explicitly rename that tab with `terminal rename --terminal
HANDLE --title TITLE`. Apply this to a reused viewer shell or a reconnected tab
as well. Do not rely on the Herdr/agent's dynamic terminal title or rename its
workspace, branch, session or agent to change the Orca tab label.

Verify the matching tab ID's title in `terminal list --include-visual-layouts`
(or a non-activating observation of the tab label); the terminal/pane title can
still show Herdr's dynamic
title and is not the custom tab label. Preserve a title explicitly chosen by the
user. If naming cannot be verified, report that limitation alongside the verified
viewer connection; do not open a duplicate tab or restart the agent just to rename
it. Keep the label stable across status changes rather than adding a title-update
poller. Other hosts use their supported naming controls when available.

Use the resolved Herdr executable and the returned `herdr.session` on the
receipt's host. Herdr 0.9.5 provides `session attach NAME`; confirm the installed
contract when missing from readiness. Do not use an unnamed/default session or
create another server, workspace or agent to obtain a display. For a shared
session, use supported controls that preserve the user's focus to select the
returned workspace and verify
its identity; attachment to the right server alone is insufficient.

Verify tab creation and actual Herdr workspace display, including any startup
overlay, before reporting success. Record the tab handle, tab ID, chosen title and session/workspace
alongside the existing launch receipt, not in a new registry. On timeout, inspect
existing tabs before retrying. Reuse the verified tab for follow-ups to the same
live sokkin; if closed, reconnect to that session. New attempts must display their
own target without repurposing another attempt's tab. Do not install optional
integrations or change global terminal/provider settings merely to view it.

If the host cannot display a viewer, report the exact limitation and reconnect
details. Retain the launched attempt and hold real assignment unless headless
operation is already authorized. Viewer failure is not evidence of agent failure
and never justifies relaunching sokkin. A later viewer disconnect does not stop
the running mission. Leave the tab available after completion; report that the
agent exited when applicable. Normal owned-server lifecycle cleanup still applies.
The native TUI accepts input: viewing intent is not technical read-only access.
A browser viewer is an alternative only when already configured and verified;
do not install a web plugin or expose a new listener as part of this step.

## Configuration and call

Use the selected project's `.hanchou/config.json`:

```json
{"version":2,"sokkin":{"agent":"codex","model":"gpt-6-astra","effort":"medium"}}
```

This is the new-project `hanchou-init` template, not a launcher fallback.
Existing values and explicit mission overrides take precedence.
Optional `sokkin.effort` accepts `low`, `medium`, `high` or null. No other keys
are supported. Agent is `codex` or `claude`; model is a native model identifier
or null. Null delegates to the official CLI's configured
default, so verify the observed model/effort before real work. Keep budgets,
allowed model/effort choices, concurrency and retry limits in the pinned policy
or mission, not speculative configuration fields.

Invoke the installed script by its resolved path, using quoted arguments:

```bash
bash "$LAUNCH_SCRIPT" \
  --project "$PROJECT_ROOT" --mission "$MISSION_SLUG"
```

`--agent`, `--model` and `--effort` override only this launch. `--base` is resolved once to a
commit (default: selected checkout HEAD). `--worktree-root` is an absolute
destination outside existing checkouts; default is a sibling
`.hanchou-worktrees/<project-name>`. Use `--help` for the full small interface.
`HERDR_BIN` selects the executable, not a shell command.
For an explicitly authorized update-notice skip (or centrally managed CLI updates),
`--skip-update-check` passes Codex's process-local
`-c check_for_update_on_startup=false`; it does not change global configuration.
It is rejected for Claude. Keep the default check otherwise; see the official
[Codex configuration reference](https://developers.openai.com/codex/config-reference/).

The launcher always creates a new branch and Git worktree, verifies repository,
branch and HEAD, creates a dedicated Herdr workspace using that cwd, then starts
the agent in its first pane. It copies no ignored configuration or human edits.
Codex starts with `--no-daemon` to avoid inheriting another host's shared daemon.
Claude must report first-party subscription authentication both in the caller
and in the actual pane. Authentication evidence does not prove account-wide
extra-usage settings are disabled; do not enable or accept paid fallback.
Herdr starts the canonical agent command through the pane's shell. Existing shell
aliases/functions can add arguments; the pane auth check uses the same command
resolution. Inspect the actual process arguments and observed model/effort during
bootstrap. Unrequested billing, permission or notification behavior is a
configuration discrepancy to resolve before work, not a reason to rewrite the
user's shell files. The launcher does not set bypass-permission flags.
Keep verified executable paths, versions and evidence in the mission report for
reuse. The successful launcher receipt covers its current inventory/readiness
checks. Use the bounded startup qualification below where supported; otherwise
independently bind the new pane's native identity and settled usage.

### Native automatic approval review

An explicit request for automatic permission review does not select an automatic
model or effort. Preserve the configured model/effort and use only the installed
provider's supported mode. Verify the actual native settings and a bounded
disposable probe before adopting it for real work. Help text alone does not prove
availability, review behavior, usage coverage or a route to the Hanchou parent.
Do not change global security settings, reviewer policy or hooks to make a probe pass.

The [Codex CLI contract](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
offers `--approve-for-me` with workspace-write and on-request approvals; it conflicts
with explicit sandbox/approval flags. [Claude Code's `--permission-mode auto`](https://code.claude.com/docs/en/permission-modes)
uses classifier review, while explicit ask rules and user-interaction gates can
still prompt. Its noninteractive behavior differs. These are provider modes,
not additional options accepted by `launch-sokkin.sh`. Do not replace either with
bypass flags, `never`/`dontAsk`, broad future approvals or weaker protections.

Preserve worker → sokkin → supervisor → human decisions wherever a request remains.
Do not assume the native reviewer forwards a refusal to that chain. Inspect the
same attempt and retain the exact action, target and rationale. An
[automatic-review denial](https://learn.chatgpt.com/docs/sandboxing/auto-review)
permits a materially safer alternative or the required human decision, not the
same outcome through a different agent, tool or execution location. A human-only
override remains for the human. A successful harmless approval does not qualify
denials, cancellations, fallback behavior or other providers.

Reviewer usage is part of the mission even when no worker was explicitly started.
The ordinary agent's ready receipt does not include another native reviewer.
Apply the [usage scope checks](usage.md#accounting) to those reviewers before real
assignment. If their identity, model or tool scope is unqualified, retain the
probe evidence and report the missing scope; do not treat it as zero or broaden
the parser to make the mode pass. Continue independent work through an already
qualified mode only when it does not evade a denied action.

### Qualified startup

For **Codex 0.162.1 or 0.163.0 / ccusage 20.0.37**, add `--qualify-startup` and a sufficient
finite `--timeout-ms` (for example 60000). The mode checks dependency versions
before creation, observes the pane's startup log home/version, sends exactly one
fixed tool-free companion-role bootstrap, then corroborates native identity
using fresh cwd/time/bootstrap evidence. It reconciles initial ccusage counters
against native cumulative counters for that fresh, nonforked session.
The bootstrap permits no tools or real work and its tokens count in the budget.
The receipt also contains the actual foreground PID/cwd and observed arguments,
verified against this launch's arguments. Unexpected arguments block qualification
without copying their potentially sensitive values into the receipt. Reuse this
evidence for assignment; do not run a separate process-discovery round unless a
specific discrepancy remains. Process liveness must be checked again at cleanup.
No arbitrary prompt/file argument, retry, cleanup or continued accounting is added.

A `startup_qualified` receipt with `usageReadiness.status: ready` supplies the
baseline needed for immediate assignment. Reuse its observed model/effort, log
path and counters instead of writing another identification/ACK parser or
resending bootstrap. It covers one observation boundary, not subsequent usage,
wrapper permissions, notifications or final mission acceptance. After intervening
activity or delay, refresh usage before assigning. Unsupported versions/provider
are refused before creation; uncertain completion or conflicting evidence after
creation retains the same resources and blocks work. Use the manual procedure
for other already-qualified provider/tool combinations; never silently bypass a
failed qualification. Claude subscription checks and default launch behavior
remain unchanged.

## Receipt and partial failure

Capture stdout and exit status separately. Stdout contains one JSON receipt:

| Field | Meaning |
| --- | --- |
| `version`, `ok`, `stage` | Schema version 2, readiness result, last launch stage |
| `startedAt` | UTC launch start, for bounded native-log attribution |
| `sourceSnapshot` | Pre-launch source HEAD/branch/common Git directory and Git diff/status hashes |
| `missionId`, `attemptId` | Human mission slug and unique launch attempt |
| `config.source`, `config.effective` | Pinned config path and effective values |
| `worktree` | Source repository, new path/branch, fixed base and verified HEAD |
| `herdr` | Local host, named session, returned workspace/tab/pane IDs |
| `lifecycle` | Owned instance key/record and saved startup `status`; status is null for shared launches or before an owned record exists |
| `sokkin` | Provider/name, requested model/effort/update-skip, observed model/native IDs and qualified process evidence |
| `usageReadiness` | Default pending; opt-in qualified startup returns initial native/tool evidence and its boundary |
| `error`, `resources` | Failure category and resources retained for reconciliation |

`ok:true` means the selected startup mode succeeded, not that the mission finished.
Default `agent_ready` does not qualify usage. Opt-in `startup_qualified` includes
the settled bootstrap; a null native ID/model remains unknown.
Reuse the successful receipt's configuration, fresh-worktree, pane-cwd and
agent-readiness checks. Requested settings are not observed process arguments.
The source snapshot hashes staged/unstaged binary diffs and NUL-delimited status
using Git's object hash without writing objects. It is not a backup: untracked
and ignored file contents are not covered. Pin policy/config content separately
and preserve any additional content at risk. Compare at mission end as needed;
the launch-time snapshot alone cannot prove preservation throughout execution.

On failure after creation the script retains resources and returns known IDs.
Inspect the same pane, inventory and process identity without sending real work
or repeating bootstrap. Update notices, project trust, authentication or shell
startup can block readiness. Answer only within existing authority; explicit
denial and human-only decisions remain gates.

An owned launch failure saves `UNKNOWN`; an interrupted launch may leave
`STARTING`. Neither state has a supported promotion to `RUNNING`. Clearing a
popup, observing a ready CLI, or obtaining native identity and settled usage
manually does not repair that record. Do not bootstrap merely to try to recover
it, edit the record, call `finish`/`resume` to bypass the state, or assign real
work. `--skip-update-check` is an explicitly authorized process-local prevention
option for a new launch, not recovery of an existing UNKNOWN instance.

Preserve the failed receipt, record, any native usage and artifacts, including
the failed attempt's cost. Establish which owned processes actually started;
if cleanup is authorized, exit only those CLIs and verify termination. Before
stopping a dedicated server, inspect every pane and server descendant for other
owners, agents, foreground commands and background jobs. Retain it while any
work or uncertain ownership remains; separately authorize and preserve any
remaining owned work before ending it. Proceed only after the full inventory
shows verified idle shells and no other descendant processes. Recheck the saved
host/server PID, birth time and socket identity immediately before the targeted
public stop. Verify disappearance of that server, socket and its pane processes
afterward; a stop receipt alone is insufficient. Missing identity or unverifiable
termination means retain/report, not success. Preserve separate cleanup evidence,
server history and the unchanged failure record; do not report FINISHED,
acceptance or timed reap.
Remove a worktree only after preserving its contents and proving no remaining
owner. If identity, activity or ownership is uncertain, retain resources and
report the missing evidence. A separate, explicit decision within the user's
authority may start a new attempt with a fresh branch/worktree after this
reconciliation. Carry forward the failure and preserved results; do not silently
replace an experiment's failed arm or bypass a denied operation.

A shared launch has no owned lifecycle record. It still requires corroborated
startup identity and usage before work; retain an uncertain or already-started
agent, inspect the same pane, and never restart it blindly. A process proved
never to have started may be started there only under the shared-session manual
procedure. Replacing an actual sokkin requires a fresh launch and preserved results.

If a CLI response or the whole receipt is lost, reconcile the unique attempt
label/name, reported branch/path and current Herdr/Git state. No exactly-once or
automatic rollback guarantee is offered. Never force-delete retained resources.

## Bootstrap and mission

Use the following manual bootstrap after a successful default `agent_ready`
launch (owned record `RUNNING`), or for an explicitly selected shared-session
manual startup after its identity is verified. It is not recovery from a failed
qualification or an owned `STARTING`/`UNKNOWN` launch. Do not repeat it after
`startup_qualified`.

Allow one short bootstrap turn for role/instruction receipt only. Supply the
already-verified launch metadata and the exact pinned sokkin instructions in
that message, and request an acknowledgment without tools, file reads or worker
dispatch. The supervisor resolves native identity and measures the settled
response before real work. This avoids repeated full-context responses and
approval turns just to read instructions or run `pwd`. Estimate bootstrap from
observed context costs and include actual usage in the mission total. Do not
invent a separate hard limit smaller than the known initial context. Respect
explicit user stop limits. A planning-estimate overrun calls for a human alert
and an explicit continuation/reduction/decision state, not an automatic failure
or silent budget increase. Qualify usage
with [usage.md](usage.md).
Match the assistant's acknowledgment/completion and settled counters, not a
terminal substring that can merely echo the bootstrap prompt.

Resolve native identity from Herdr's observed `agent_session`, if available, and
cross-check provider and native log metadata. Without integrations, resolve the
unique native log whose session metadata matches the **exact new physical cwd**,
provider, startup time and bootstrap marker. Do not pick the latest log globally.
Multiple matches, missing logs or mismatched IDs remain pending.

Send a compact mission containing:

- Explicit assignment to act as sokkin and follow the pinned skill's instructions,
  not merely read or review the file.
- Mission/attempt, returned connection IDs, cwd/branch/base and native identity.
- Absolute pinned sokkin skill, policy and usage-reference paths (or their exact
  contents when not readable from the execution environment).
- Purpose, acceptance criteria, allowed actions and artifact destination.
- Token budget, reserved verification/report capacity, finite concurrency/retry
  limits, permitted provider/model/effort choices and measurement freshness.
- Reporting conditions: completion, decision needed, budget or unrecoverable
  problem. Include each independent session once and state native-child scope.

Use installed Herdr help for prompt/read/wait commands. Set explicit wait
timeouts. Read only the relevant subcommand help unless it leaves a concrete
question unanswered. A timeout can follow successful input delivery; inspect the same
attempt's report before resending. Terminal idle is not a mission receipt.

On completion, receive evidence and session totals before stopping owned
agent/worker processes. Workspace closure, server shutdown and preserved unused
worktree removal are separate decisions. Owned servers follow [lifecycle](lifecycle.md): preserve
the completion report, measure final settled usage, exit agents, accept, then reap
on a later check at least a day after FINISHED. Do not stop a shared server or
remove a dirty worktree.
