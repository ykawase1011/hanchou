# Owned Herdr lifecycle

Read this when accepting or resuming an owned instance, or handling a lifecycle
discrepancy. Normal startup and young retained instances use the entrypoint's
receipt contract. Use `launch-sokkin.sh` directly; do not generate
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
There is no supported `STARTING`/`UNKNOWN` to `RUNNING` transition. Manual
bootstrap, native identity evidence and clearing an initial CLI popup do
not promote the record. `finish` requires `RUNNING`; `resume` requires an
unaccepted `FINISHED` record. Withhold real work, preserve the failure, and use the [partial-failure procedure](launch.md#receipt-and-partial-failure)
for explicit cleanup and a separate new-attempt decision. Do not edit lifecycle
state or report cleanup of a failed attempt as successful finish/accept/reap.

## Bind delayed native identity

An ordinary successful launch may be RUNNING while optional Herdr
`agent_session` is null. This is distinct from UNKNOWN: withhold assignment until
the same original CLI's identity and effective settings are publicly established.
The launcher captures exact PID/birth/cwd/argv when available even on the ordinary
path. If that original process anchor is missing, retain the attempt; a later
self-report or new process cannot supply it retroactively.

For a resultContract 2 owned RUNNING instance, use `--lifecycle bind --instance KEY
--evidence IDENTITY_JSON` once, before real work. Provide:

```json
{
  "version": 1,
  "missionId": "the-launch-mission",
  "attemptId": "the-launch-attempt",
  "requestId": "HANCHOU_REQUEST_the-launch-token",
  "nativeId": "the-publicly-observed-native-id",
  "source": "herdr",
  "launchHash": "Git blob hash from the saved full launch receipt",
  "observedAt": "2026-11-04T12:00:00Z"
}
```

The shell itself reads current public pane/process evidence, matches the original
server, process incarnation/arguments/cwd, worktree branch and launch commit, and
requires the public native ID to agree. `observedAt` must be within five minutes
and no earlier than launch. A caller's ID alone is never sufficient.

If metadata remains absent, `source: native-status` reads the **current unscrolled
official `/status` UI** in that same pane. Open it through public controls first;
the bounded parser supports Claude 2.1.317 interactive Session ID/cwd and Codex
0.164.0 Session/Directory/Permissions. Other formats, missing/duplicate fields,
another cwd, mismatched public metadata or changed process fail closed. This
does not certify model/effort/permission settings: corroborate them separately.
Close the status UI before sending the task. No history scraping, usage tool,
LLM acknowledgement, hook installation or record editing is needed.

The immutable original launch receipt remains unchanged. A separate `identity/`
directory preserves the binding and public observations with Git blob hashes;
the record stores `nativeId` and `identityBinding`. Finish rechecks the original
live process, and inspect/finish/accept/reap verify the preserved binding evidence.
Do not switch threads in the process or reuse a restarted CLI. Binding cannot
replace a known ID, overwrite earlier evidence, promote UNKNOWN/STARTING or repair
legacy records without a captured launch anchor. Codex keeps `--no-daemon`.

## Read-only observation

Use one explicit instance to replace handwritten record/report hash and owned
pane/process checks:

```sh
"$LAUNCH_SCRIPT" --project "$PROJECT_ROOT" --lifecycle inspect --instance "$INSTANCE_KEY"
```

Save complete stdout, stderr and exit status in the caller's receipt directory.
Require exit 0 and `ok:true`; `observation` contains the pinned launch/native
identity, lifecycle timestamps, same server incarnation, actual `report.path`
and matching Git blob hash for FINISHED, owned pane shell PID/birth/foreground
cwd, agent states, owned process identities and `quiet`. Read the report at that
returned path for independent quality judgment. `quiet:false` is a busy
observation; `quiet:true` describes this observation only. Neither certifies
completion, preservation, acceptance or permission to stop work.

The helper supports bound RUNNING/FINISHED records with a preserved successful
launch receipt. It rejects missing/changed identity, unknown agent/process state,
unsafe evidence, existing locks and record/evidence changes during observation.
It reads one snapshot (up to 32 panes/agents and 256 owned descendants), never
acquires an instance lock or writes lifecycle/config/native data, and removes
private temporary observations on exit. Unrelated process arguments and raw
terminal contents are not returned. Oversized/unsupported observations fail
closed; this is not a live subscription or an atomic snapshot across processes.
Acceptance and reaping always recheck their current gates independently.

Live inspection requires each agent's native metadata. Herdr 0.9.5 may omit
`agent_session` or return null; that observation remains unavailable, not a
matching identity or a quiet pane. Do not inject metadata or retry unchanged
live inspection expecting it to prove completion. Use the completion order
below when its independent evidence is available; a frozen experiment requiring
live inspection keeps its failure and needs a separately declared new attempt.

## Completion and acceptance

New owned launches use `resultContract: 2`. The report submitted to finish is one
JSON object with the actual launch mission/attempt/native and current `requestId`:

```json
{
  "missionId": "the-launch-mission",
  "attemptId": "the-launch-attempt",
  "requestId": "HANCHOU_REQUEST_the-current-token",
  "nativeId": "the-verified-native-id",
  "status": "succeeded",
  "artifactRefs": ["durable artifact or commit reference"],
  "verificationRefs": ["durable actual check result"],
  "authority": {"approved": true, "source": "pinned policy or explicit delegation", "scope": "the concrete task"}
}
```

References must be real and readable by the accepting parent. Add criterion
findings and limitations as useful fields. The booleans/authority are attestations,
not a security boundary or independent proof the referenced work is good. The
parent verifies content. Native-receive reports also include the exact `receive`
binding from [that route](native-receive.md). Usage can be omitted entirely.

Sokkin preserves artifacts and receipts, stops/verifies owned workers, writes the
report and invokes `--lifecycle finish --instance KEY --evidence REPORT_PATH`.
The shell binds environment mission/instance, server incarnation and required
result fields, copies the report to `report.txt`, hashes it with Git blob hashing
and sets FINISHED. Native receive additionally rechecks parent and child process/
native identity. Held/refused/failed/exited/idle-only results fail. FINISHED means
reported, not independently accepted or permission to stop resources. Read the
receipt before the final reply; preserve this tail before deleting working files.

The parent independently verifies the criteria, actual artifact and test evidence,
authority and human-checkout preservation. Match the record/report/native identity
to the successful launch. Verify the current process binding before normally
exiting owned CLIs through public controls. Native peer replies are not native
approvals. Unknown identity, pending requests, changed process birth or ambiguous
ownership requires inspection of the same attempt. Confirm actual termination;
connection loss/TUI disappearance alone is not proof of all server/thread exit.

Only after exit, use one `inspect` if its report/inventory readback is useful;
accept independently rechecks current server and quiet inventory. Prepare idle
shells' durable cwd before acceptance if their worktree will be removed while
the server remains. Stop a batch on failed reads/parses/assertions, and collect
each submitted command's complete receipt before the next dependent action.

Submit one acceptance JSON through `--lifecycle accept --instance KEY --evidence
ACCEPTANCE_JSON`:

```json
{
  "missionId": "the-launch-mission",
  "attemptId": "the-launch-attempt",
  "requestId": "HANCHOU_REQUEST_the-current-token",
  "nativeId": "the-verified-native-id",
  "artifactsPreserved": true,
  "workersStopped": true,
  "independentAcceptance": true,
  "authority": {"approved": true, "source": "pinned delegation", "scope": "accepted task"},
  "result": {
    "status": "succeeded",
    "reportHash": "actual Git blob hash of preserved report.txt",
    "artifactRefs": ["verified artifact reference"],
    "verificationRefs": ["independent check reference"]
  }
}
```

The report hash is `git hash-object`, not SHA-256. The shell requires matching
native/request identity, authority, result references and preservation attestations,
unchanged report, same server incarnation, no agents and only verified idle shells
among all descendants. It preserves acceptance.json, hash, time and exact inventory.
Missing usage never blocks acceptance, while missing result/identity still does.
Optional notification fields are checked as described in native receive; notices
do not replace the result/independentAcceptance. A second acceptance is rejected,
so a duplicate notice cannot replay acceptance. No exactly-once transport claim.

Before another request to the same **still-live** unaccepted CLI, `--lifecycle
resume --instance KEY` clears completion and generates a fresh `requestId` in the
record. Read the returned marker before dispatch; the previous report/notice
cannot finish the continuation. Accepted instances cannot resume. A stopped or
restarted CLI needs a fresh attempt/worktree, not edited lifecycle data.

## Compatibility

Existing version-1 records without `resultContract: 2` are kept, not migrated or
deleted. Their preserved text reports remain usable. Existing accepted evidence
is still checked by its original hashes/inventory before ordinary reaping; it is
not retroactively rewritten. A new acceptance of an unaccepted legacy result must
supply native identity, independent result/authority/preservation evidence as above;
old usage is insufficient. If its native ID was never bound, retain it for explicit
inspection instead of inferring identity from usage. The shell does not promote
UNKNOWN/STARTING or modify legacy records to invent that binding.

Optional `usage`, counters and old `usageReadiness` fields are preserved verbatim
in provided evidence; operational code neither validates nor certifies them as
measurements. External debug continues to apply the strict original
[measurement contract](usage.md). No installed history/settings/data is deleted.

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
