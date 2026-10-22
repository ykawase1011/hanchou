#!/usr/bin/env bash
# One read-only observation. No dispatch, accounting registry or budget decision.
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: measure-session.sh --provider codex --log-home ABS --cwd ABS
  --model MODEL --effort EFFORT --marker UNIQUE --started-after UTC_ISO
  [--native-id UUID] [--native-log ABS] [--timeout-ms N]

Reads one nonforked Codex 0.162.1 CLI session with installed ccusage 20.0.37.
UTC_ISO is YYYY-MM-DDTHH:MM:SS[.fraction]Z, the current task start lower bound.
Without --native-log, discovery stays in LOG_HOME/sessions and checks at most
256 files modified since that bound. Supply an exact log for older/large homes.
The latest task must contain the marker and match cwd/model/effort. Active tasks
can return ready measured usage with their remaining in-flight usage unknown.
A matched historical turn_aborted may precede a new task; its recorded usage
remains in the session total. An aborted latest task is not settled completion.
During active self-measurement, one native response usage record may precede its
token_count event. After validating identity and the cumulative increment, copy
those recorded counters into a temporary ccusage token_count row. The receipt
discloses lastUsage.counterSource and scope.toolInput; native logs are unchanged.
Settled tasks require the actual matching token_count event, never this adapter.
Forks, children with inherited history, compaction, resets and unknown formats
are unavailable. Exit 0 means the stated observation scope is ready, never that
a mission is complete or that its budget permits work. Failures exit 1 with JSON.
The default timeout is 10000 ms; one deadline covers discovery and retries.
The cwd must still exist; measure before removing an owned worktree and retain
the resulting receipt for later reporting.
HELP
}
[[ ${1:-} != --help || $# != 1 ]] || { usage; exit 0; }
command -v jq >/dev/null 2>&1 || { printf '%s\n' '{"status":"unavailable","error":{"code":"missing_jq","message":"jq 1.6 or later is required."}}'; exit 1; }

provider= log_home= cwd= model= effort= marker= started_after= native_id= native_log= timeout_ms=10000
tmp= helper_pid= deadline=0
stop_helper() {
  if [[ -n $helper_pid ]]; then
    # Background helpers have their own process group, including subprocesses.
    kill -TERM -- "-$helper_pid" 2>/dev/null || true
    sleep 0.05
    kill -KILL -- "-$helper_pid" 2>/dev/null || true
    wait "$helper_pid" 2>/dev/null || true
    helper_pid=
  fi
}
cleanup() { stop_helper; [[ -z $tmp ]] || rm -rf "$tmp"; }
fail() {
  jq -nc --arg code "$1" --arg message "$2" --arg provider "$provider" \
    --arg id "$native_id" --arg log "$native_log" \
    '{status:"unavailable",provider:$provider,nativeId:($id|if .=="" then null else . end),
      nativeLog:($log|if .=="" then null else . end),error:{code:$code,message:$message}}'
  exit 1
}
trap cleanup EXIT
trap 'fail interrupted "Measurement interrupted; no agent resources were changed."' INT TERM HUP
while (($#)); do
  [[ $# -ge 2 && -n $2 ]] || fail invalid_argument 'Every option requires a nonempty value.'
  case $1 in
    --provider) provider=$2;; --log-home) log_home=$2;; --cwd) cwd=$2;;
    --model) model=$2;; --effort) effort=$2;; --marker) marker=$2;;
    --started-after) started_after=$2;; --native-id) native_id=$2;;
    --native-log) native_log=$2;; --timeout-ms) timeout_ms=$2;;
    *) fail invalid_argument 'Unknown measurement option.';;
  esac
  shift 2
done
[[ $provider == codex ]] || fail unsupported_provider 'Only Codex is qualified.'
[[ -n $model && -n $effort && -n $marker && -n $started_after ]] || fail invalid_argument 'Model, effort, marker and current task start bound are required.'
[[ $timeout_ms =~ ^[0-9]{1,6}$ ]] && ((10#$timeout_ms >= 100 && 10#$timeout_ms <= 120000)) || fail invalid_argument 'Timeout must be 100..120000 milliseconds.'
[[ -z $native_id || $native_id =~ ^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$ ]] || fail invalid_argument 'Native ID must be a lowercase UUID.'
[[ $log_home == /* && -d $log_home && $cwd == /* && -d $cwd ]] || fail invalid_path 'Log home and cwd must be existing absolute directories.'
log_home=$(cd "$log_home" && pwd -P)
cwd=$(cd "$cwd" && pwd -P)
[[ -d $log_home/sessions && ! -L $log_home/sessions ]] || fail invalid_path 'The actual log home must contain a nonsymlink sessions directory.'
start_epoch=$(jq -ner --arg at "$started_after" '
  $at | select(test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$")) |
  . as $t | (sub("\\.[0-9]+Z$";"Z") | fromdateiso8601) +
  (if ($t|contains(".")) then ($t|capture("\\.(?<fraction>[0-9]+)Z$").fraction|"0."+.|tonumber) else 0 end)' 2>/dev/null) || fail invalid_argument 'Start bound must be a valid UTC ISO timestamp.'
deadline=$(jq -nr --argjson ms "$((10#$timeout_ms))" 'now*1000+$ms|floor')
remaining() { [[ $(jq -nr 'now*1000|floor') -lt $deadline ]]; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-measure.XXXXXX") || fail temporary_failure 'Cannot create private measurement scratch space.'
chmod 700 "$tmp"
set -m
bounded() {
  remaining || return 124
  "$@" > "$tmp/command.out" 2> "$tmp/command.err" &
  helper_pid=$!
  while kill -0 "$helper_pid" 2>/dev/null; do
    if ! remaining; then stop_helper; return 124; fi
    sleep 0.05
  done
  local result=0
  wait "$helper_pid" 2>/dev/null || result=$?
  # A wrapper can exit before a child. Reap the leader and still stop all owned
  # group members; success must not leave a background measurement subprocess.
  if kill -0 -- "-$helper_pid" 2>/dev/null; then stop_helper; else helper_pid=; fi
  return "$result"
}
for executable in codex ccusage; do
  command -v "$executable" >/dev/null 2>&1 || fail missing_tool 'Installed codex and ccusage are required.'
  bounded "$executable" --version || fail tool_unavailable 'Version inspection failed or exceeded the observation deadline.'
  case $executable in
    codex) [[ $(cat "$tmp/command.out") == 'codex-cli 0.162.1' ]] || fail unsupported_version 'Only Codex 0.162.1 is qualified.';;
    ccusage) [[ $(cat "$tmp/command.out") == 'ccusage 20.0.37' ]] || fail unsupported_version 'Only ccusage 20.0.37 is qualified.';;
  esac
done

# Project only required fields. No prompt, tool output, instructions or auth data
# is copied to scratch or printed, including during malformed-JSON failures.
cat > "$tmp/project.jq" <<'JQ'
if type!="object" then error("nonobject record")
elif .type=="session_meta" then
  {timestamp,type,payload:(.payload|{id,timestamp,cwd,model_provider,cli_version,forked_from_id,
    source:(if (.source|type)=="object" then {subagent:{thread_spawn:{parent_thread_id:.source.subagent.thread_spawn.parent_thread_id}}} else .source end)})}
elif .type=="turn_context" then {timestamp,type,payload:(.payload|{turn_id,cwd,model,effort})}
elif .type=="event_msg" and (.payload.type=="task_started" or .payload.type=="task_complete" or .payload.type=="turn_aborted") then
  {timestamp,type,payload:(.payload|{type,turn_id})}
elif .type=="event_msg" and .payload.type=="token_count" then
  {timestamp,type,payload:(.payload|{type,info:(if .info==null then null else {total_token_usage:.info.total_token_usage,last_token_usage:.info.last_token_usage} end)})}
elif .type=="token_usage_record" then
  {timestamp,type,payload:(.payload|{thread_id,turn_id,response_id,usage,thread_token_usage})}
elif .type=="response_item" and .payload.role=="user" then
  {timestamp,type,payload:{type:"message",role:"user",markerMatch:any(.payload.content[]?; (.text // "" | contains($marker)))}}
elif .type=="response_item" and .payload.role=="assistant" then
  {timestamp,type,payload:(.payload|{type,role,phase})}
elif .type=="compacted" or .type=="compaction" or .payload.type=="context_compacted" or .payload.type=="compaction" then
  {type:"unsupported_compaction"}
else empty end
JQ
cat > "$tmp/check.jq" <<'JQ'
def integer: type=="number" and isfinite and .>=0 and floor==. and .<=9007199254740991;
def counters:
  type=="object" and
  ([.input_tokens,.cached_input_tokens,.output_tokens,.reasoning_output_tokens,.total_tokens]|all(.[];integer)) and
  (.cache_write_input_tokens // 0)==0 and
  .cached_input_tokens<=.input_tokens and .reasoning_output_tokens<=.output_tokens and
  .total_tokens==(.input_tokens+.output_tokens);
def values: [.input_tokens,.cached_input_tokens,.output_tokens,.reasoning_output_tokens,.total_tokens];
def le($a;$b): all(range(0;5); . as $i|$a[$i]<=$b[$i]);
def epoch: . as $t | (sub("\\.[0-9]+Z$";"Z")|fromdateiso8601) +
  (if ($t|contains(".")) then ($t|capture("\\.(?<fraction>[0-9]+)Z$").fraction|"0."+.|tonumber) else 0 end);
def reject($code): {error:$code};
# In CLI 0.162.1 a response usage record precedes tool execution, but token_count
# can be emitted only AFTER that tool returns. Waiting inside self-measurement
# cannot settle it. For one active response only, adapt its actual native fields
# to ccusage input. All identity, counter-chain and boundary checks below still
# apply; settled tasks never use this adapter. Do not modify the native log.
. as $native |
[to_entries[]|select(.value.type=="event_msg" and .value.payload.type=="task_started")][-1] as $active |
[to_entries[]|select(.value.type=="event_msg" and .value.payload.type=="token_count" and .value.payload.info!=null)][-1] as $count |
[to_entries[]|select(.value.type=="token_usage_record" and .key>($count.key // -1))] as $pending |
if $active!=null and ($pending|length)==1 and
  $pending[0].key>$active.key and $pending[0].value.payload.turn_id==$active.value.payload.turn_id and
  all($native[$active.key:][]; .type!="event_msg" or (.payload.type!="task_complete" and .payload.type!="turn_aborted")) and
  ($count==null or ($pending[0].value.timestamp|epoch)>=($count.value.timestamp|epoch)) and
  ([$native[]|select(.type=="token_usage_record" and .payload.response_id==$pending[0].value.payload.response_id)]|length)==1
then . + [{timestamp:$pending[0].value.timestamp,type:"event_msg",adaptedResponse:true,
  payload:{type:"token_count",info:{total_token_usage:$pending[0].value.payload.thread_token_usage,
    last_token_usage:$pending[0].value.payload.usage}}}]
else . end |
. as $rows |
[to_entries[]|select(.value.type=="session_meta")|.value.payload] as $meta |
[to_entries[]|select(.value.type=="event_msg" and .value.payload.type=="task_started")|{i:.key,row:.value}] as $starts |
if ($meta|length)!=1 or ($starts|length)==0 then reject("missing_identity_or_boundary") else
$meta[0] as $m | $starts[-1] as $start |
[$rows[$start.i:][]|select(.type=="response_item" and .payload.role=="user" and .payload.markerMatch)] as $markers |
[$rows[$start.i:][]|select(.type=="turn_context")|.payload] as $ctx |
[$rows[$start.i:][]|select(.type=="event_msg" and .payload.type=="task_complete")] as $done |
[$rows|to_entries[]|select(.key>$start.i and .value.type=="event_msg" and .value.payload.type=="task_complete")|.key] as $doneIndices |
[$rows|to_entries[]|select(.value.type=="event_msg" and .value.payload.type=="token_count" and .value.payload.info!=null)|{i:.key,row:.value}] as $counts |
[$rows|to_entries[]|select(.value.type=="token_usage_record")|{i:.key,row:.value}] as $records |
[$rows[]|select(.type=="event_msg" and .payload.type=="token_count" and .payload.info!=null)|.payload.info.total_token_usage] as $totals |
[$rows[]|if .type=="token_usage_record" then .payload.thread_token_usage
  elif .type=="event_msg" and .payload.type=="token_count" and .payload.info!=null then .payload.info.total_token_usage else empty end] as $accumulated |
(reduce ($rows[]|select(.type=="event_msg" and (.payload.type=="task_started" or .payload.type=="task_complete" or .payload.type=="turn_aborted"))) as $event
  ({active:null,seen:[],lastAt:null,invalid:false};
   ($event.timestamp|epoch) as $at |
   .invalid=(.invalid or (.lastAt!=null and $at<.lastAt)) | .lastAt=$at |
   if $event.payload.type=="task_started" then
     .invalid=(.invalid or .active!=null or (.seen|index($event.payload.turn_id))!=null or
       ($event.payload.turn_id|type)!="string" or $event.payload.turn_id=="") |
     .active=$event.payload.turn_id | .seen+=[$event.payload.turn_id]
   else .invalid=(.invalid or .active==null or .active!=$event.payload.turn_id) | .active=null end)) as $boundaries |
if $m.model_provider!="openai" or $m.cli_version!="0.162.1" or $m.cwd!=$cwd or
  ($m.id|type)!="string" or ($m.id|test("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")|not) or
  ($known!="" and $known!=$m.id) then reject("identity_mismatch")
elif $m.forked_from_id!=null or $m.source!="cli" or any($rows[];.type=="unsupported_compaction") then reject("unsupported_history")
elif $boundaries.invalid then reject("unsupported_boundary")
elif ($start.row.timestamp|epoch)<$since or ($markers|length)!=1 or
  ($start.row.payload.turn_id|type)!="string" or $start.row.payload.turn_id=="" or
  any($rows[$start.i:][]|select(.timestamp!=null);(.timestamp|epoch)<($start.row.timestamp|epoch)) then reject("current_request_mismatch")
elif ($ctx|length)==0 or any($ctx[];.turn_id!=$start.row.payload.turn_id or .cwd!=$cwd or .model!=$model or .effort!=$effort) or
  any($rows[]|select(.type=="turn_context");.payload.model!=$model) then reject("context_mismatch")
elif any($rows[$start.i:][];.type=="event_msg" and .payload.type=="turn_aborted") then reject("current_request_aborted")
elif ($done|length)>1 or any($done[];.payload.turn_id!=$start.row.payload.turn_id) or
  (($done|length)==1 and any($rows[($doneIndices[0]+1):][];.type=="response_item" or .type=="turn_context" or .type=="token_usage_record")) then reject("unsupported_boundary")
elif ($counts|length)==0 or ($records|length)==0 then reject("missing_usage")
elif any($counts[]; (.row.payload.info.total_token_usage|counters|not) or (.row.payload.info.last_token_usage|counters|not) or
  (le((.row.payload.info.last_token_usage|values);(.row.payload.info.total_token_usage|values))|not)) or
  any($records[]; .row.payload.thread_id!=$m.id or (.row.payload.response_id|type)!="string" or .row.payload.response_id=="" or
    (.row.payload.turn_id as $turn|any($starts[];.row.payload.turn_id==$turn)|not) or
    (.row.payload.usage|counters|not) or (.row.payload.thread_token_usage|counters|not) or
    (le((.row.payload.usage|values);(.row.payload.thread_token_usage|values))|not)) then reject("invalid_counters")
elif any(range(1;$accumulated|length); . as $i|le(($accumulated[$i-1]|values);($accumulated[$i]|values))|not) then reject("counter_reset")
elif ($totals[0]|values)!=($counts[0].row.payload.info.last_token_usage|values) or
  any(range(1;$totals|length); . as $i|
    ($totals[$i-1]|values) as $previous | ($totals[$i]|values) as $next |
    ($counts[$i].row.payload.info.last_token_usage|values) as $last |
    if $previous==$next then $last!=($counts[$i-1].row.payload.info.last_token_usage|values)
    else any(range(0;5); . as $j|$next[$j]!=$previous[$j]+$last[$j]) end) then reject("incomplete_usage_history")
else $counts[-1] as $last | $records[-1] as $record |
if $record.i>$last.i or $record.row.payload.thread_token_usage!=$last.row.payload.info.total_token_usage or
  $record.row.payload.usage!=$last.row.payload.info.last_token_usage then reject("unsettled_counters")
elif ($done|length)==1 and ($last.i<=$start.i or $last.i>=$doneIndices[0] or $record.row.payload.turn_id!=$start.row.payload.turn_id or
  ([$rows|to_entries[]|select(.key>$start.i and .value.type=="response_item" and .value.payload.role=="assistant" and .value.payload.phase=="final_answer")|.key] as $answers |
    ($answers|length)==0 or $answers[-1]>$record.i) or
    ($record.row.timestamp|epoch)>($last.row.timestamp|epoch) or
    ($done[0].timestamp|epoch)<($last.row.timestamp|epoch)) then reject("unsettled_completion")
else {nativeId:$m.id,cliVersion:$m.cli_version,model:$model,effort:$effort,
  currentRequest:{state:(if ($done|length)==1 then "settled" else "active" end),turnId:$start.row.payload.turn_id,
    startedAt:$start.row.timestamp,completedAt:($done[0].timestamp // null)},
  lastUsage:{observedThrough:$last.row.timestamp,
    counterSource:(if $last.row.adaptedResponse==true then "token_usage_record" else "token_count" end),
    usageChangedAt:([$counts[] | select(.row.payload.info.total_token_usage==$last.row.payload.info.total_token_usage)][0].row.timestamp),
    responseId:$record.row.payload.response_id,
    turnId:$record.row.payload.turn_id,cumulative:$last.row.payload.info.total_token_usage,
    request:$last.row.payload.info.last_token_usage}}
end end end
JQ

project() { bounded jq -c --arg marker "$marker" -f "$tmp/project.jq" "$1"; }
if [[ -n $native_log ]]; then
  [[ $native_log == /* && -f $native_log && ! -L $native_log ]] || fail invalid_path 'Native log must be an existing nonsymlink absolute file.'
  native_log="$(cd "$(dirname "$native_log")" && pwd -P)/${native_log##*/}"
  [[ $native_log == "$log_home/sessions/"* && $native_log == *.jsonl ]] || fail invalid_path 'Native log must be inside the actual log home sessions directory.'
else
  # mtime only narrows candidates; metadata and the current task prove attribution.
  stamp=$(jq -nr --argjson at "$start_epoch" '$at|floor|strftime("%Y%m%d%H%M.%S")')
  TZ=UTC touch -t "$stamp" "$tmp/since"
  pattern='*.jsonl'; [[ -z $native_id ]] || pattern="*$native_id.jsonl"
  bounded find "$log_home/sessions" -type f -name "$pattern" -newer "$tmp/since" -print0 || fail discovery_unavailable 'Native discovery failed or exceeded the observation deadline.'
  mv "$tmp/command.out" "$tmp/candidates"
  matched=0 examined=0
  while IFS= read -r -d '' candidate; do
    examined=$((examined+1))
    ((examined<=256)) || fail discovery_limit 'More than 256 candidates; provide the exact native log.'
    project "$candidate" || continue
    if jq -es --arg cwd "$cwd" --arg known "$native_id" --argjson since "$start_epoch" '
      [.[]|select(.type=="event_msg" and .payload.type=="task_started")][-1] as $start |
      any(.[];.type=="session_meta" and .payload.cwd==$cwd and .payload.model_provider=="openai" and ($known=="" or .payload.id==$known)) and
      $start!=null and (($start.timestamp|sub("\\.[0-9]+Z$";"Z")|fromdateiso8601)>=($since|floor)) and
      any(.[];.type=="response_item" and .payload.markerMatch and .timestamp>=$start.timestamp)
      ' "$tmp/command.out" >/dev/null 2>/dev/null; then
      matched=$((matched+1)); native_log=$candidate
    fi
  done < "$tmp/candidates"
  [[ $matched == 1 ]] || fail ambiguous_identity 'Expected exactly one current request matching cwd, time, marker and optional native ID.'
fi

relative=${native_log#"$log_home/sessions/"}
mkdir -p "$tmp/tool/sessions/$(dirname "$relative")"
printf '{}\n' > "$tmp/tool/config.json"
while :; do
  project "$native_log" || { remaining || fail observation_timeout 'Observation deadline exceeded.'; sleep 0.05; continue; }
  mv "$tmp/command.out" "$tmp/snapshot.jsonl"
  if ! bounded jq -es --arg cwd "$cwd" --arg known "$native_id" --arg model "$model" --arg effort "$effort" \
    --argjson since "$start_epoch" -f "$tmp/check.jq" "$tmp/snapshot.jsonl"; then
    fail invalid_native_log 'Native evidence is malformed or cannot be interpreted within the deadline.'
  fi
  mv "$tmp/command.out" "$tmp/native.json"
  error=$(jq -r '.error // empty' "$tmp/native.json")
  if [[ -n $error ]]; then
    case $error in missing_usage|unsettled_counters|unsettled_completion) remaining || fail "$error" 'Native usage did not settle within the observation deadline.'; sleep 0.05; continue;;
      *) fail "$error" 'Native identity, current task, context or supported usage scope did not match.';;
    esac
  fi
  native_id=$(jq -r .nativeId "$tmp/native.json")
  [[ ${native_log##*/} == rollout-*"$native_id".jsonl ]] || fail identity_mismatch 'Native metadata and rollout filename differ.'
  cp "$tmp/snapshot.jsonl" "$tmp/tool/sessions/$relative"
  if [[ $(jq -r .lastUsage.counterSource "$tmp/native.json") == token_usage_record ]]; then
    # Copy counters, never infer them. This adapter row exists only in the
    # disposable ccusage input, and is disclosed in the measurement receipt.
    jq -c '{timestamp:.lastUsage.observedThrough,type:"event_msg",payload:{type:"token_count",
      info:{total_token_usage:.lastUsage.cumulative,last_token_usage:.lastUsage.request}}}' \
      "$tmp/native.json" >> "$tmp/tool/sessions/$relative"
  fi
  # A selected, sanitized snapshot prevents unrelated-home scans and transcript
  # copying. ccusage still owns the token calculation; native counters corroborate it.
  if bounded env CODEX_HOME="$tmp/tool" ccusage codex session --json --offline --no-cost --speed standard --id "$native_id"; then
    mv "$tmp/command.out" "$tmp/tool.json"
    if jq -e --slurpfile n "$tmp/native.json" --arg path "${relative%.jsonl}" --arg file "${native_log##*/}" '
      def integer: type=="number" and isfinite and .>=0 and floor==. and .<=9007199254740991;
      $n[0].lastUsage.cumulative as $v |
      .sessionId==$path and .sessionFile==($file|rtrimstr(".jsonl")) and
      .lastActivity==$n[0].lastUsage.usageChangedAt and (.models|keys)==[$n[0].model] and
      .models[$n[0].model].isFallback==false and
      ([.inputTokens,.cacheReadTokens,.outputTokens,.reasoningOutputTokens,.cacheCreationTokens,.totalTokens]|all(.[];integer)) and
      .inputTokens+.cacheReadTokens==$v.input_tokens and .cacheReadTokens==$v.cached_input_tokens and
      .outputTokens==$v.output_tokens and .reasoningOutputTokens==$v.reasoning_output_tokens and
      .cacheCreationTokens==0 and .totalTokens==$v.total_tokens and
      .totalTokens==(.inputTokens+.cacheReadTokens+.outputTokens)
      ' "$tmp/tool.json" >/dev/null 2>/dev/null; then
      # Detect task changes or newly written usage while ccusage was reading.
      project "$native_log" || fail invalid_native_log 'Native log changed to unreadable or malformed evidence.'
      if cmp -s "$tmp/snapshot.jsonl" "$tmp/command.out"; then break; fi
    fi
  fi
  remaining || fail usage_mismatch 'ccusage and native scope/counters did not reconcile within the deadline.'
  sleep 0.05
done
jq -nc --slurpfile n "$tmp/native.json" --slurpfile u "$tmp/tool.json" \
  --arg home "$log_home" --arg log "$native_log" --arg cwd "$cwd" --arg parser "$(jq --version)" '
  $n[0] + {status:"ready",provider:"codex",observedAt:(now|todateiso8601),logHome:$home,nativeLog:$log,cwd:$cwd,
    toolVersion:"20.0.37",parserVersion:$parser,
    tool:($u[0]|{sessionId,sessionFile,lastActivity,inputTokens,cacheReadTokens,cacheCreationTokens,outputTokens,reasoningOutputTokens,totalTokens,models}),
    scope:{kind:"native session cumulative",includedNativeIds:[$n[0].nativeId],includedChildren:[],
      missionDelta:false,otherSessionsIncluded:false,
      toolInput:(if $n[0].lastUsage.counterSource=="token_usage_record"
        then "selected native fields; one active response usage record adapted to token_count in temporary snapshot"
        else "selected native fields in temporary snapshot" end),
      inFlightUsage:(if $n[0].currentRequest.state=="active" then "unknown; current request and final reply can add usage" else "none at observed completion boundary" end)}}'
