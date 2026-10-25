# Owned Herdr lifecycle

Read this when launching or accepting an owned instance, resuming it, or handling
an instance retained by cleanup. Use `launch-sokkin.sh` directly; do not generate
a daemon or poller. The supervisor owns the server lifetime; sokkin owns the work
and completion report. These commands do not send messages to other agents.

## Launch and record

Owned lifecycle operations require process inspection and Herdr's local socket.
`process_inspection_unavailable` fails before creating or changing lifecycle
resources. Use the host approval flow for the exact authorized operation when
needed; never disable sandboxing globally or treat a permission denial as proof
that the server stopped. Reconcile any partial-start receipt before a retry.

Omitting `--session` starts a fresh local named server for this attempt, after
creating and verifying its fresh Git worktree. The launcher exits after launch;
Herdr stays running in its own verified process group, so cleanup of the calling
tool's process group does not terminate it. Explicit `--session NAME` instead uses an existing shared
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
UTC `finishedAt`. The same server incarnation must still be verifiable; any supplied
pane environment binding (instance key/record, mission and attempt) must match.
It does not imply that the final reply's usage is settled, that
the supervisor accepted the result, or that the CLI has exited. Do not mark a
paused, blocked, failed or still-running assignment FINISHED merely to reclaim it.
Shared-session missions have no lifecycle record and use ordinary result reporting.

A successful transition receipt reads back the saved record before returning
`recordReadback: "matched"`. It includes `operation`, mission/attempt, native ID,
worktree, and the current `completion` and `acceptance` boundaries. `completion`
contains `finishedAt` and `report.path`/`report.gitBlobId`; `acceptance` contains
`acceptedAt`, `path` and `gitBlobId`. An absent boundary is `null`, including both
after resume. Reuse these fields for the next mechanical check and preserve the
full receipt; a second read solely to obtain the same transition fields is
unnecessary. Read the referenced evidence to judge the work and verify its hash.
This receipt does not replace settled usage, independent acceptance or process
exit checks. On `record_readback_failed`, the write may already have occurred:
inspect the same record before any retry. A retained reap result is not a new
transition and keeps its existing `action`/`reason` receipt.

For FINISHED-to-accept, keep dependent mechanical checks in one bounded tool
execution where supported, with assertions before each next operation:
match the instance/report and `finishedAt`; obtain the final reply's settled
measurement using the current assignment marker and native binding; after
independent acceptance and artifact preservation, exit the owned CLI and verify
termination; then submit acceptance. Preserve each full receipt and exit status.
Batching does not replace the supervisor's judgment or the checks below. Missing
evidence, active usage, a failed assertion or a pending approval stops dependent
operations; inspect the same attempt instead of repeating completion or exit.
Use installed help for unresolved command syntax, including pane selectors;
do not guess positional arguments. Verify the matched acceptance receipt before the ordinary
reap checkpoint; a retained server is not a failed acceptance or permission to
force cleanup.

The lifecycle record's `reportHash` and `acceptanceHash` are Git blob object IDs
from `git hash-object`, not file SHA-256 checksums. Use that contract when checking
the preserved report and acceptance; archive checksums are separate evidence.

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
    "currentRequest": {"state": "settled", "completedAt": "2026-10-21T12:00:00Z"},
    "cwd": "/verified/sokkin/worktree",
    "observedAt": "2026-10-21T12:00:00Z",
    "tool": {
      "inputTokens": 1000, "cacheReadTokens": 10000, "cacheCreationTokens": 0,
      "outputTokens": 1345, "reasoningOutputTokens": 345, "totalTokens": 12345
    },
    "scope": {
      "kind": "native session cumulative", "includedNativeIds": ["the-verified-native-id"],
      "includedChildren": [], "missionDelta": false, "otherSessionsIncluded": false
    }
  }]
}
```

The `usage` entries above illustrate the required boundary fields: insert the
**full real measurement receipts**, including counters, scope and freshness, not
these placeholders. The shell checks unique native IDs, nonnegative integral counters,
their sum, and a single-session cumulative scope without included children or other
sessions. Supply separate, nonoverlapping receipts for independent workers. Counter
fields use disjoint input/cache-read/cache-creation/output categories; reasoning is a
subset of output, not an additional summand. Do not invent zeros for missing counters.
The sokkin cwd/native binding must match. Each request completion must fall between
instance creation and observation; sokkin completion must also be at or after
`finishedAt`. A freshly observed pre-final receipt does not satisfy that boundary.
UTC fractional seconds from native logs are accepted at the lifecycle clock's
one-second precision. For other providers use their qualified settled accounting
contract normalized to these fields; missing accounting blocks acceptance.
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
