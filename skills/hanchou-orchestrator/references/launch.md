# Launch and handoff

The bundled launcher is one-shot Bash 3.2+ with Git and jq. Use Herdr 0.9.5's
public local-session contracts; verify compatibility before adopting a different
version. Install the official `codex` or `claude` CLI in both the caller's PATH
and Herdr's shell environment. The script does not install tools, start a server,
change global agent settings, submit a mission, or install integrations.

Use this launch contract directly; inspect the script source only when diagnosing
an actual failure or developing it. Do not load repository design/history or the
companion's references as routine supervisor preparation. The qualified launcher
reads its bundled companion once; manual bootstrap needs its exact content.
Applicable project instructions still govern
placement, authority and preservation.

Select an already-running **local named Herdr session**. Keep the same executable
and session for subsequent calls; workspace/pane IDs are scoped to that server.
The launcher checks current connectivity/inventory. Never silently fall back to
the default server or a remote host. A viewer is optional and closing it does
not terminate the server's agents. Reuse the caller/init readiness handoff for
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
  --project "$PROJECT_ROOT" --mission "$MISSION_SLUG" --session "$HERDR_SESSION"
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

### Qualified startup

For **Codex 0.162.1 / ccusage 20.0.37**, add `--qualify-startup` and a sufficient
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
Read the same pane and inventory; inspect process identity before any start or
resend. Update notices, project trust, authentication or shell startup can block
readiness. Answer only within existing authority, then recheck the same agent.
A stopped/not-yet-started process may be started in the **same attempt's** pane
after proving no agent began; an unknown or started attempt must not be restarted
blindly. Replacing an actual sokkin requires a fresh launch and preserved results.

If a CLI response or the whole receipt is lost, reconcile the unique attempt
label/name, reported branch/path and current Herdr/Git state. No exactly-once or
automatic rollback guarantee is offered. Never force-delete retained resources.

## Bootstrap and mission

The following manual bootstrap is needed only when the launcher did not already
return qualified evidence. Do not repeat it after `startup_qualified`.

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

On completion, receive evidence and session totals before stopping the owned
processes, closing the exact workspace, and removing preserved, unused worktrees.
These are separate steps. Do not stop a shared server or remove a dirty worktree.
