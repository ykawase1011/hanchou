# Owned Herdr lifecycle

Read this when launching or accepting an owned instance, resuming it, or handling
an instance retained by cleanup. Use `launch-sokkin.sh` directly; do not generate
a daemon or poller. The supervisor owns the server lifetime; sokkin owns the work
and completion report. These commands do not send messages to other agents.

## Launch and record

Omitting `--session` starts a fresh local named server for this attempt, after
creating and verifying its fresh Git worktree. The launcher exits after launch;
Herdr stays running. Explicit `--session NAME` instead uses an existing shared
server and grants no ownership or automatic cleanup. Never adopt an old server
by adding a record manually.

The receipt's `lifecycle.instanceKey` and absolute `lifecycle.record` identify
`<pinned-project>/.hanchou/instances/<key>/instance.json`. Pass these and the
absolute launcher path to sokkin with the mission. Environment variables
`HANCHOU_INSTANCE_KEY` and `HANCHOU_INSTANCE_RECORD` corroborate the binding.
A record is local operational data, not project policy, credentials, a global
registry or an agent's native session ID. Keep this directory out of published
artifacts/Git using the project's chosen ignore policy; do not copy it to a new
worktree or infer a different policy source from it.

The launcher records a random instance key, mission/attempt, pinned project and
host, unique session name, server PID/birth time/socket identity, creation time,
worktree and pane identities. The server cwd is the durable instance directory,
not the disposable worktree. `STARTING`/`UNKNOWN` record a partial or uncertain
launch; neither is eligible for timed cleanup. Preserve the receipt and inspect
the same attempt instead of retrying a new launch blindly.

## Completion and acceptance

Sokkin preserves its artifacts and report, stops owned workers and verifies their
exit, then records completion before its final reply:

```sh
"$LAUNCH_SCRIPT" --project "$PROJECT_ROOT" --lifecycle finish \
  --instance "$INSTANCE_KEY" --evidence "$COMPLETION_REPORT"
```

This copies the report into the instance directory, sets `status: FINISHED` and
UTC `finishedAt`. It does not imply that the final reply's usage is settled, that
the supervisor accepted the result, or that the CLI has exited. Do not mark a
paused, blocked, failed or still-running assignment FINISHED merely to reclaim it.
Shared-session missions have no lifecycle record and use ordinary result reporting.

The supervisor checks acceptance criteria, preserves artifacts outside disposable
panes/worktrees, obtains the final settled usage for sokkin and independent
workers, exits their CLIs, and verifies process termination. Only then record
acceptance with a local JSON file containing:

```json
{
  "missionId": "the-launch-mission",
  "attemptId": "the-launch-attempt",
  "artifactsPreserved": true,
  "workersStopped": true,
  "usage": [{
    "status": "ready",
    "nativeId": "the-verified-native-id",
    "currentRequest": {"state": "settled"},
    "cwd": "/verified/sokkin/worktree",
    "observedAt": "2026-10-21T12:00:00Z",
    "tool": {"totalTokens": 12345}
  }]
}
```

The `usage` entries above illustrate the required boundary fields: insert the
**full real measurement receipts**, including counters, scope and freshness, not
these placeholders. The shell checks unique native IDs, counters, freshness and
the sokkin cwd/native binding. For other providers use their qualified settled accounting
contract with the same boundary fields; missing accounting blocks acceptance.
Artifact locations and acceptance findings belong in the report/acceptance file.
The booleans are supervisor attestations backed by those findings, not checks
that the shell can independently perform.

```sh
"$LAUNCH_SCRIPT" --project "$PROJECT_ROOT" --lifecycle accept \
  --instance "$INSTANCE_KEY" --evidence "$ACCEPTANCE_JSON"
```

The shell requires the same server incarnation, no agents, and only the observed
pane shells among its descendants. Unknown shell kinds or shell command/script
arguments are retained for inspection rather than treated as idle. It copies the acceptance receipt, hashes both
evidence files, and records `acceptedAt` and the quiescent pane/process inventory.
Do not manually edit lifecycle fields. An instance lock serializes transitions;
an abandoned lock is a reason to inspect the interrupted operation, not steal it.
Do not add commands/panes to an accepted session outside this protocol.

Before assigning additional work to the **same still-live CLI**, use `--lifecycle
resume --instance KEY` to change FINISHED to RUNNING and clear completion and
acceptance. Acceptance has already verified CLI exit and cannot be resumed. If the CLI has
already exited, launch a fresh attempt/worktree instead
of restarting it in the old checkout. A later completion gets a new timestamp.

## Opportunistic cleanup

At each explicit Hanchou invocation and its acceptance/finalization checkpoint,
scan the pinned project's records once:

```sh
"$LAUNCH_SCRIPT" --project "$PROJECT_ROOT" --lifecycle reap
```

This emits one JSON result per record (none for an empty directory). It stops a
server only when FINISHED is at least **86,400 seconds old**, acceptance is recorded,
evidence is unchanged, the host/server incarnation still matches, the accepted
pane inventory has not changed, and no agent or background work remains. The
reference time is `finishedAt`, not file mtime or last terminal activity. Future,
invalid or missing timestamps do not make a record due. Recheck the process and
socket identity immediately before the public named-session stop operation;
verify both disappearance and each owned shell's exit before writing CLOSED and
`closedAt`. A stop receipt or an inaccessible socket alone is insufficient.

No timer runs between invocations: an instance may remain longer than a day when
the supervisor is not called. A retained/busy/unknown instance is reported with
its reason; never force-stop, reset or relabel it to bypass the check. External
server restarts/replacements are not adopted. The process/socket checks and local
lock protect coordinated use, not hostile concurrent manipulation by another
process with the same filesystem permissions. Do not concurrently restart a
server outside this protocol while it is being reclaimed.

Reaping stops only the owned server. It retains Herdr session history, lifecycle
records, evidence, Git branches and worktrees. Worktree/branch removal remains a
separate preservation/integration decision. Never scan unrelated projects, delete
old shared servers, install a scheduler, or claim that cleanup happens exactly
24 hours after completion.
