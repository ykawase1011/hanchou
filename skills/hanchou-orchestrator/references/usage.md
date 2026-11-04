# External debug: native-session usage

This reference is only for explicitly requested external diagnostics/comparisons.
Ordinary Hanchou, sokkin and workers do not load it, self-measure, keep budget
accounts or report usage. A missing measurement is a debug limitation, never a
readiness/acceptance gate. Explicit user stop/budget instructions still apply.
The two-shell boundary and strict measurement guarantees below are unchanged.

Use native logs and a qualified existing tool; do not implement another collector
or treat Herdr's display, context percentage, dollar estimate, or weekly quota as
session tokens. The current bounded qualification is **ccusage 20.0.37** with
Codex CLI 0.162.1 / Claude Code 2.1.299, plus bootstrap and integration on 2.1.304.
Requalify changed log/tool formats.
Install explicitly through the existing package manager, outside the project;
the launcher does not install a usage tool.

This version uses one `ccusage` binary with `codex` and `claude` subcommands.
The old `@ccusage/codex` commands and JSON shapes are different. Verify `--version`;
consult relevant help on a mismatch or unknown option, not the full command tree.
Use offline mode to avoid price downloads; never use price estimates
as a subscription-budget measure.

## Bundled read-only measurement

For Codex 0.162.1 or 0.163.0 native source `cli` / ccusage 20.0.37, prefer
`scripts/measure-session.sh` from this orchestrator skill. It reconciles the
existing tool with native evidence in one bounded call; it does not implement a
new collector or decide the budget. See its `--help` for the narrow interface.
Pass the actual log home, expected physical cwd/model/effort, a current-request start-time
lower bound and a unique marker from the current request. Reuse known native ID
and log path. Without identity hints it searches only that home for one match.
For a new assignment, the sender captures the lower bound before serializing/
submitting it and includes its literal UTC value and marker in the request with
the verified native binding. Referenced receipts use absolute paths readable by
the receiver. Reuse those values at acceptance; the native user-message row can
be later than `task_started`, so its timestamp is not a valid replacement.
Missing/conflicting binding stops dependent work; never widen a failed window.
The start bound accepts explicit UTC timestamps ending in `Z` or `+00:00`,
including fractional seconds. Both identify the same instant; the script keeps
the fractional lower bound and rejects other/unknown offsets or invalid dates.

A ready receipt describes the session cumulative scope, current request boundary,
observed native/tool counters and freshness. Active requests have usage still
unreported, including the final answer: reserve for it, do not repeatedly poll
self for a settled total. At final acceptance measure the sokkin after its report
with that assignment's marker and require a settled boundary. Count one latest
cumulative receipt per native ID; retain earlier checkpoints as evidence, not
additional usage entries.
During an active tool call, CLI 0.162.1 and 0.163.0 can write the response usage record before
the call and its matching `token_count` only after the call returns. The bundled
script validates one such pending native response and copies its recorded counters
into a temporary ccusage input row. `lastUsage.counterSource: token_usage_record`
and `scope.toolInput` identify this path. It is measured usage at that response
boundary, not a settled task total. No native log is rewritten and no counter is
estimated. Final settled measurements still require the actual matching
`token_count`; multiple pending responses or inconsistent increments fail closed.
Unsupported forks, compaction, resets or versions fail closed. Do not bypass a
failure by inventing a less strict parser. The detailed contracts below remain
the explanation and qualified manual route for other supported providers.

## External observer preparation

Bind the supervisor too, before broad discovery. Use a host-supplied native ID
when available and corroborate it with log metadata; otherwise search only the
actual provider log home and relevant start-time window, matching exact physical
cwd, provider and the current request marker. Never scan unrelated temporary
directories or select the globally latest log. If attribution remains ambiguous,
stop expanding the search and report the missing scope.
A caller that already created the conversation can pass its exact native ID,
log path/home, physical cwd, provider, start time and observation source in the
mission handoff. This is optional current-session evidence, not project config.
Corroborate it against this request and live counters; do not rediscover the same
identity or reuse an earlier conversation's ID from a readiness report.

Native metadata can embed the entire instructions/context. Select identity fields,
never print the whole `session_meta` object. For a verified Codex log, for example:

```bash
jq -c 'select(.type=="session_meta") | .payload |
  {id,timestamp,cwd,model_provider,cli_version}' "$NATIVE_LOG"
```

Record a start snapshot if continuing an existing conversation: mission usage is
the verified increase, not all earlier conversation usage. Keep session cumulative
and mission delta distinct. If the start boundary is unavailable, label the
cumulative scope rather than inventing a delta.

Observe attributable native data from outside the participants. Keep debug cost
separate, and include startup, failed attempts, children/reviewers and acceptance
when comparing whole tasks. Full input includes cache; short replies do not make
repeated context free. Do not ask participants to measure themselves or certify
their own final reply. Missing scope means an incomplete comparison, not failed
product acceptance. Explicit stop limits are still honored through their actual
supported enforcement route, without inventing a general budget ledger.

## Binding and read

Record provider, native thread/session ID, physical cwd, mission/attempt, startup
time and parent relationship from launch/bootstrap evidence. Treat each
independently started worker as another entry. The native-log home must come
from the actual agent environment; never assume the supervisor's home matches.
Resolve the matching native log before interpreting a zero or an empty result.
For Codex 0.162.1 and 0.163.0, the current request text is in
`response_item.payload` with `role == "user"` and `content[].text`.
Do not require an `event_msg/user_message` event: it may be absent. A compact
request-marker check on the already-bound log is:

```bash
jq -es --arg marker "$REQUEST_MARKER" \
  'any(.[]; .type=="response_item" and .payload.role=="user" and
    any(.payload.content[]?; (.text // "" | contains($marker))))' "$NATIVE_LOG"
```

Combine this with selected metadata/counters and the existing usage read in the
same execution; a successful marker check is not another reason to reread user
messages or embedded instructions.

Examples below assume quoted, verified paths/IDs and a shell with `pipefail`.
They select output fields, not prove completeness by themselves:

```bash
set -o pipefail
env CODEX_HOME="$CODEX_LOG_HOME" "$USAGE_TOOL" codex session \
  --json --offline --no-cost --speed standard --id "$NATIVE_THREAD_ID" |
  jq -e '{sessionId,lastActivity,inputTokens,cacheReadTokens,
          cacheCreationTokens,outputTokens,reasoningOutputTokens,totalTokens,models}'

env CLAUDE_CONFIG_DIR="$CLAUDE_LOG_HOME" "$USAGE_TOOL" claude session \
  --json --offline |
  jq -e --arg id "$NATIVE_SESSION_ID" \
    '.sessions[] | select(.sessionId == $id) |
     {sessionId,firstActivity,lastActivity,inputTokens,cacheReadTokens,
      cacheCreationTokens,outputTokens,totalTokens}'
```

Codex accepts the native UUID as `--id`, but output `sessionId` is a rollout
relative path. Bind both to native metadata. The Claude command above deliberately
uses the session-list shape: adding `--id` changes its output to `entries`.
Do not mistake an exit-zero tool response or a selected object for valid data:
require the intended identity, numeric nonnegative token fields and all expected
logs. Missing, malformed, stale, unreadable or ambiguous results are unavailable,
never zero.
In 20.0.37, missing native IDs can still produce path-derived entries, and a
missing fork parent can produce an overcount with exit status zero. Independently
check native metadata and required parent logs. A decreasing cumulative counter
without trustworthy per-request usage is unavailable: the tool can undercount
that reset without warning. An empty result for a nonempty native log is not a
zero-usage session, including when its serialization is unsupported.

## Accounting

- Codex `inputTokens` excludes cache. Native input is
  `inputTokens + cacheReadTokens`. Cache read is already in `totalTokens`;
  reasoning output is already in output. Do not add either again.
- Claude total includes input, cache creation, cache read and output. Its native
  subagent logs are included in the parent session total by this tool. Label that
  scope and do not add those children twice. Independent CLI sessions remain
  separate entries.
- Codex child threads are separate IDs. Fork/child copied parent history is not
  new usage; qualification requires the corresponding parent logs. Missing parent
  history cannot be declared complete merely because the tool returns a number.
- Native automatic-review agents/classifiers also belong in the accounting scope.
  Bind their parent, native identity and model; verify whether the existing tool
  includes them in the parent's total before adding anything. Codex 0.163.0 was
  observed using a separate `guardian_review` thread. The bundled measurement
  supports source `cli`, not that reviewer source. A matching numeric total with
  a fallback model label is unqualified. Report such raw observations separately;
  a ready parent receipt neither measures the reviewer nor makes its cost zero.
- Resuming the same native ID updates its existing cumulative entry; never add
  the previous cumulative total again. Preserve failed attempts in the total.
- State whether the total includes the supervisor itself. If its host exposes
  no attributable measurement, report the execution subtotal and missing scope,
  not a complete Hanchou total.

## Checkpoint intervals and cost scope

For cost calibration, name the intended preparation, execution and finalization
boundaries before work. Reuse the existing launch, assignment and acceptance
checks; do not add model turns just to fill a phase table. Retain each receipt's
native identity, provider/tool versions, cumulative components, `observedAt`,
`lastUsage.observedThrough`, current-request state and scope alongside the event
it supports. Keep these evidence checkpoints separate from the single latest
accounting entry for that session.

Subtract cumulative components only between qualified receipts with the same
native session, compatible counter semantics and unchanged inclusion scope.
Require nondecreasing components; a reset, incompatible scope or missing boundary
leaves the interval unavailable. A qualified same-session continuation keeps the
earlier cumulative usage. These differences allocate an already counted total;
they are never added to that total again. Apply the provider's cache/reasoning
rules above to both endpoints.

An active checkpoint is a recorded response boundary, not an exact phase end.
Call its difference an observation interval and state any in-flight or boundary
gap. A filename such as `preaccept` or the receipt's collection time cannot prove
that every token belongs to acceptance. Use an exact phase label only when the
attribution is independently supported; otherwise keep combined intervals or
unknown phases. A later settled total closes that session's reported scope, not
the missing semantic boundaries within it.

List the supervisor, sokkin, independent workers/reviewers, failed starts/retries
and any outer caller/harness separately, with their included-child relationships
and qualification. Report disjoint qualified totals, unqualified observations and
missing scope separately. A completed product trial's subtotal does not cover
the caller's preparation, control, cleanup and handoff. An unsupported caller's
raw counters may expose that cost but cannot qualify it or authorize new work;
retain discrepancies and do not claim a complete campaign total or savings.

## Freshness and debug completeness

Prefer request-complete snapshots at assignment/retry/report boundaries.
Observe completion evidence, settled log writes and native usage counters;
reconcile the tool's latest total with the last native usage. A fresh activity
timestamp alone is insufficient: Codex can record a response before writing the
`token_count` used by ccusage. Re-read a mismatched snapshot without dispatching
new work. Preserve the known subtotal and name the missing scope.

For a normal Codex thread, settled native cumulative input/output/total and tool
values should agree after accounting for cached input. Fork/compaction/reset
require the qualified replay/compaction interpretation, not a naïve cumulative
sum. For Claude, compare unique `requestId` + `message.id` usage across parent and
included native child logs. Read only identity/model/usage fields needed for the
check; don't copy entire transcripts into reports.

Every report records observation time, last activity, native ID, source/tool
version, total/input/output/cache breakdown, included children, freshness and
status (`ready`, `pending`, `unavailable`). Initial bootstrap is part of the total.
A debug report identifies missing scope explicitly. Measurement failure must not
be disguised as zero or weakened parser success; it does not block operational
acceptance supported by identity, authority, result and preservation evidence.

Native session counts do not determine weekly subscription percentage. Report
account quota separately only when the provider actually exposes it. No silent
API/extra-usage fallback is permitted for Claude.

A matching historical `turn_aborted` may close a prior turn before a unique new
`task_started`. Rebind the latest request marker/start window while retaining
the same session cumulative counters. Do not add the prior total again. A latest
aborted task returns `current_request_aborted`; it is not settled completion or
proof that every interrupted request reported usage. Mismatched/duplicate ends,
reused turn IDs and reversed boundary timestamps remain unavailable.
