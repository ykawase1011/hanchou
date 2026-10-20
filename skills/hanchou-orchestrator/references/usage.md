# Native-session usage

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

## Supervisor preparation

Bind the supervisor too, before broad discovery. Use a host-supplied native ID
when available and corroborate it with log metadata; otherwise search only the
actual provider log home and relevant start-time window, matching exact physical
cwd, provider and the current request marker. Never scan unrelated temporary
directories or select the globally latest log. If attribution remains ambiguous,
stop expanding the search and report the missing scope.

Record a start snapshot if continuing an existing conversation: mission usage is
the verified increase, not all earlier conversation usage. Keep session cumulative
and mission delta distinct. If the start boundary is unavailable, label the
cumulative scope rather than inventing a delta.

Before launch or another discovery round, compare remaining allowance with the
remaining supervisor work. Estimate the required request count for launch,
bootstrap qualification, result acceptance and release, using the latest full
request input (including cache) plus expected output and context growth. Keep the
final verification/report reserve as a floor, not the entire estimate. A small
output or low effort does not make repeated cached input free.
If the remaining work does not fit, stop new assignments and report what is
missing; do not launch optimistically or raise the budget silently.

A running supervisor can observe only its last completed request's counters;
the current tool-using request and final reply can add usage afterwards.
Report this boundary and reserve for it. Do not repeatedly query for a settled
total of the still-running conversation. When host usage is unavailable, report
the missing supervisor scope; if a supervisor/total budget requires measurement,
do not launch under an uncheckable budget. Sokkin qualification remains mandatory.

## Binding and read

Record provider, native thread/session ID, physical cwd, mission/attempt, startup
time and parent relationship from launch/bootstrap evidence. Treat each
independently started worker as another entry. The native-log home must come
from the actual agent environment; never assume the supervisor's home matches.
Resolve the matching native log before interpreting a zero or an empty result.

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
- Resuming the same native ID updates its existing cumulative entry; never add
  the previous cumulative total again. Preserve failed attempts in the total.
- State whether the total includes the supervisor itself. If its host exposes
  no attributable measurement, report the execution subtotal and missing scope,
  not a complete Hanchou total.

## Freshness and budget gate

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
New assignments, workers and retries require ready usage within the mission's
allowed freshness and remaining budget. Reserve capacity for verification and
final reporting. On missing measurement or exhausted budget, stop assigning and
report the condition. Active requests can overshoot; this is a checkpoint policy,
not provider-enforced hard capping.

Native session counts do not determine weekly subscription percentage. Report
account quota separately only when the provider actually exposes it. No silent
API/extra-usage fallback is permitted for Claude.
