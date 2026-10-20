# Launch and handoff

The bundled launcher is one-shot Bash 3.2+ with Git and jq. Use Herdr 0.9.5's
public local-session contracts; verify compatibility before adopting a different
version. Install the official `codex` or `claude` CLI in both the caller's PATH
and Herdr's shell environment. The script does not install tools, start a server,
change global agent settings, submit a mission, or install integrations.

Use this launch contract directly; inspect the script source only when diagnosing
an actual failure or developing it. Do not load repository design/history or the
companion's references as routine supervisor preparation. Read companion content
once when supplying the bootstrap. Applicable project instructions still govern
placement, authority and preservation.

Select an already-running **local named Herdr session**. Keep the same executable
and session for subsequent calls; workspace/pane IDs are scoped to that server.
Check its current inventory before creating resources. Never silently fall back
to the default server or a remote host. A viewer is optional and closing it does
not terminate the server's agents.
Check the selected session's effective notification settings before dispatch.
Use an authorized quiet Herdr session and inspect provider hooks/remote-control
settings so routine worker activity does not notify the human separately.
Keep approvals and important results reachable through the supervisor; do not
silently rewrite shared/global settings or claim all OS/mobile alerts are muted.

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
Keep verified executable paths, versions and help in the mission evidence, so a
later stage can reuse them. Check current session inventory/notification state
and actual pane identity; old receipts do not prove those mutable facts.

## Receipt and partial failure

Capture stdout and exit status separately. Stdout contains one JSON receipt:

| Field | Meaning |
| --- | --- |
| `version`, `ok`, `stage` | Schema version 2, readiness result, last launch stage |
| `missionId`, `attemptId` | Human mission slug and unique launch attempt |
| `config.source`, `config.effective` | Pinned config path and effective values |
| `worktree` | Source repository, new path/branch, fixed base and verified HEAD |
| `herdr` | Local host, named session, returned workspace/tab/pane IDs |
| `sokkin` | Provider/name, requested model, observed model and native IDs if available |
| `usageReadiness` | Always pending at launch; not a usage qualification receipt |
| `error`, `resources` | Failure category and resources retained for reconciliation |

`ok:true` means interactive readiness and launch identity were verified, not
that the mission finished. A null native ID/model is unknown. Confirm actual
native identity and observed choice in the bounded bootstrap below.

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

Allow one short bootstrap turn for role/instruction receipt only. Supply the
already-verified launch metadata and the exact pinned sokkin instructions in
that message, and request an acknowledgment without tools, file reads or worker
dispatch. The supervisor resolves native identity and measures the settled
response before real work. This avoids repeated full-context responses and
approval turns just to read instructions or run `pwd`. A bootstrap token
allowance is an estimate, not a hard cap; include its actual usage in the total
and stop assignments when it is exceeded. Qualify usage with [usage.md](usage.md).

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
