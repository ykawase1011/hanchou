#!/usr/bin/env bash
# Synthetic native logs and local mocks; never starts an agent or uses a network.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
measure=${HANCHOU_MEASURE:-"$root/skills/hanchou-orchestrator/scripts/measure-session.sh"}
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-measure-test.XXXXXX")
fixture=$(cd "$fixture" && pwd -P)
trap 'rm -rf "$fixture"' EXIT
bin="$fixture/bin"; mkdir -p "$bin" "$fixture/project" "$fixture/home/sessions/2026/10/20"
export MOCK_STATE="$fixture" MOCK_MODE=normal MOCK_VERSION=normal
export HANCHOU_TEST_CODEX_VERSION=${HANCHOU_TEST_CODEX_VERSION:-0.162.1}
export MOCK_REAL_CCUSAGE=
if command -v ccusage >/dev/null && [[ $(ccusage --version) == 'ccusage 20.0.37' ]]; then
  MOCK_REAL_CCUSAGE=$(command -v ccusage)
fi
id=00000000-0000-4000-8000-000000000001
log="$fixture/home/sessions/2026/10/20/rollout-2026-10-20T00-00-00-$id.jsonl"
export MOCK_LOG_PATH="$log"
cat > "$bin/codex" <<'MOCK'
#!/usr/bin/env bash
[[ $# == 1 && $1 == --version ]] || exit 90
[[ $MOCK_VERSION != codex ]] || { echo 'codex-cli 0.999.0'; exit; }
printf 'codex-cli %s\n' "$HANCHOU_TEST_CODEX_VERSION"
MOCK
cat > "$bin/ccusage" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ $# == 1 && $1 == --version ]]; then
  [[ $MOCK_VERSION != ccusage ]] || { echo 'ccusage 21.0.0'; exit; }
  echo 'ccusage 20.0.37'; exit
fi
[[ "$*" == 'codex session --json --offline --no-cost --speed standard --id 00000000-0000-4000-8000-000000000001' ]] || exit 91
[[ $CODEX_HOME != "$MOCK_STATE/home" ]] || exit 92
printf '%s\n' "$CODEX_HOME" > "$MOCK_STATE/tool-home"
if [[ $MOCK_MODE == hang ]]; then
  echo $$ > "$MOCK_STATE/helper.pid"
  sleep 100 &
  echo $! > "$MOCK_STATE/child.pid"
  wait
fi
[[ $MOCK_MODE != slow ]] || sleep 2
path="$CODEX_HOME/sessions/2026/10/20/rollout-2026-10-20T00-00-00-00000000-0000-4000-8000-000000000001.jsonl"
# The tool must receive no prompt/assistant/tool-result text.
if rg -q 'PRIVATE_TRANSCRIPT|"content"|"instructions"' "$path"; then exit 93; fi
[[ $MOCK_MODE != real ]] || exec "$MOCK_REAL_CCUSAGE" "$@"
jq -sc --arg mode "$MOCK_MODE" '
  [.[]|select(.type=="event_msg" and .payload.type=="token_count" and .payload.info!=null)][-1] as $event |
  $event.payload.info.total_token_usage as $u |
  ([.[]|select(.type=="event_msg" and .payload.type=="token_count" and .payload.info.total_token_usage==$u)][0].timestamp) as $changed |
  {sessionId:"2026/10/20/rollout-2026-10-20T00-00-00-00000000-0000-4000-8000-000000000001",
    sessionFile:"rollout-2026-10-20T00-00-00-00000000-0000-4000-8000-000000000001",
    lastActivity:$changed,inputTokens:($u.input_tokens-$u.cached_input_tokens),cacheReadTokens:$u.cached_input_tokens,
    cacheCreationTokens:0,outputTokens:$u.output_tokens,reasoningOutputTokens:$u.reasoning_output_tokens,totalTokens:$u.total_tokens,
    models:{"fixture-model":{isFallback:false}}} |
  if $mode=="scope" then .sessionId="wrong/session"
  elif $mode=="stale" then .totalTokens-=1
  elif $mode=="negative" then .inputTokens=-1
  elif $mode=="missing" then del(.cacheReadTokens)
  elif $mode=="fraction" then .outputTokens=1.5
  elif $mode=="wrong-model" then .models={"other":{isFallback:false}}
  elif $mode=="fallback" then .models["fixture-model"].isFallback=true
  elif $mode=="activity" then .lastActivity="2026-10-19T00:00:00Z"
  else . end' "$path"
if [[ $MOCK_MODE == race && ! -e $MOCK_STATE/raced ]]; then
  touch "$MOCK_STATE/raced"
  cat "$MOCK_STATE/append.jsonl" >> "$MOCK_LOG_PATH"
fi
if [[ $MOCK_MODE == orphan ]]; then
  sleep 100 &
  echo $! > "$MOCK_STATE/orphan.pid"
fi
MOCK
chmod +x "$bin/codex" "$bin/ccusage"
export PATH="$bin:$PATH"
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_json() { jq -e "$2" "$1" >/dev/null || fail "assertion $2"; }
make_log() {
  jq -nc --arg cwd "$fixture/project" --arg id "$id" --arg version "$HANCHOU_TEST_CODEX_VERSION" '
    def row($s;$t;$p): {timestamp:("2026-10-20T00:00:"+$s+".000Z"),type:$t,payload:$p};
    def u($i;$c;$o;$r): {input_tokens:$i,cached_input_tokens:$c,cache_write_input_tokens:0,output_tokens:$o,reasoning_output_tokens:$r,total_tokens:($i+$o)};
    row("00";"session_meta";{id:$id,timestamp:"2026-10-20T00:00:00Z",cwd:$cwd,model_provider:"openai",cli_version:$version,source:"cli",instructions:"PRIVATE_TRANSCRIPT"}),
    row("01";"event_msg";{type:"task_started",turn_id:"turn-1"}),
    row("02";"response_item";{type:"message",role:"user",content:[{type:"input_text",text:"PRIVATE_TRANSCRIPT marker-current"}]}),
    row("03";"turn_context";{turn_id:"turn-1",cwd:$cwd,model:"fixture-model",effort:"medium"}),
    row("04";"response_item";{type:"message",role:"assistant",phase:"final_answer",content:[{type:"output_text",text:"PRIVATE_TRANSCRIPT done"}]}),
    row("05";"token_usage_record";{thread_id:$id,turn_id:"turn-1",response_id:"response-1",usage:u(100;60;10;4),thread_token_usage:u(100;60;10;4)}),
    row("06";"event_msg";{type:"token_count",info:{total_token_usage:u(100;60;10;4),last_token_usage:u(100;60;10;4)}}),
    row("07";"event_msg";{type:"task_complete",turn_id:"turn-1"})' > "$log"
  cp "$log" "$fixture/base.jsonl"
}
restore() { cp "$fixture/base.jsonl" "$log"; export MOCK_MODE=normal MOCK_VERSION=normal; }
run_measure() {
  local result status=0
  # Use the production default deadline for correctness checks. Subsecond
  # margins depend on host load and jq's clock precision, not evidence validity.
  result=$(bash "$measure" --provider codex --log-home "$fixture/home" --cwd "$fixture/project" \
    --model fixture-model --effort medium --marker marker-current --started-after 2026-10-20T00:00:00Z \
    "$@") || status=$?
  printf '%s\n' "$result"
  if ((status)); then
    printf 'measure-session failed (exit=%s, mock=%s, codex=%s): %s\n' \
      "$status" "$MOCK_MODE" "$HANCHOU_TEST_CODEX_VERSION" "$result" >&2
  fi
  return "$status"
}
bad() {
  local name=$1; shift
  if run_measure "$@" > "$fixture/$name.json" 2> "$fixture/$name.err"; then fail "$name accepted invalid evidence"; fi
  assert_json "$fixture/$name.json" '.status=="unavailable" and (.error.code|length)>0'
  ! rg -q PRIVATE_TRANSCRIPT "$fixture/$name.json" "$fixture/$name.err" || fail "$name exposed transcript"
}
mutate() { jq -c "$1" "$log" > "$fixture/changed"; mv "$fixture/changed" "$log"; }
make_log
bash -n "$measure"
bash "$measure" --help > "$fixture/help"
run_measure --native-id "$id" --native-log "$log" > "$fixture/settled.json"
assert_json "$fixture/settled.json" '.status=="ready" and .currentRequest.state=="settled" and .lastUsage.cumulative.total_tokens==110 and .tool.inputTokens==40 and .tool.cacheReadTokens==60 and .tool.reasoningOutputTokens==4 and .scope.includedChildren==[]'
cmp "$log" "$fixture/base.jsonl" || fail 'measurement modified native log'
[[ ! -e $(cat "$fixture/tool-home") ]] || fail 'temporary projection retained'
run_measure > "$fixture/discovery.json"
assert_json "$fixture/discovery.json" '.status=="ready"'
# A correct tool response may take longer than the old 1600 ms test deadline.
export MOCK_MODE=slow
run_measure --native-log "$log" > "$fixture/slow.json"
assert_json "$fixture/slow.json" '.status=="ready" and .tool.totalTokens==110'
export MOCK_MODE=normal
if [[ -n $MOCK_REAL_CCUSAGE ]]; then
  export MOCK_MODE=real
  run_measure --native-log "$log" > "$fixture/real-ccusage.json"
  assert_json "$fixture/real-ccusage.json" '.status=="ready" and .tool.totalTokens==110 and .tool.models["fixture-model"].isFallback==false'
  export MOCK_MODE=normal
fi

# Codex can repeat an unchanged counter after a permission/tool event. ccusage
# retains the first activity timestamp for that increment, not the repeated row.
restore
jq -c 'select(.type=="event_msg" and .payload.type=="token_count") | .timestamp="2026-10-20T00:00:06.900Z"' "$log" > "$fixture/repeated-count"
jq -c 'select(.payload.type!="task_complete")' "$log" > "$fixture/active-count"
cat "$fixture/active-count" "$fixture/repeated-count" > "$log"
run_measure --native-log "$log" > "$fixture/repeated.json"
assert_json "$fixture/repeated.json" '.status=="ready" and .lastUsage.usageChangedAt=="2026-10-20T00:00:06.000Z" and .lastUsage.observedThrough=="2026-10-20T00:00:06.900Z"'
if [[ -n $MOCK_REAL_CCUSAGE ]]; then
  export MOCK_MODE=real
  run_measure --native-log "$log" > "$fixture/repeated-real.json"
  assert_json "$fixture/repeated-real.json" '.status=="ready" and .tool.lastActivity==.lastUsage.usageChangedAt and .tool.totalTokens==110'
  export MOCK_MODE=normal
fi

# Active task may include completed model responses; no task_complete is needed.
restore; mutate 'select(.payload.type!="task_complete")'
run_measure --native-log "$log" > "$fixture/active.json"
assert_json "$fixture/active.json" '.currentRequest.state=="active" and (.scope.inFlightUsage|startswith("unknown")) and .lastUsage.cumulative.total_tokens==110'
# Self-measurement is a tool call between native response usage and token_count.
# The latter cannot arrive until this very call returns. Use the recorded native
# response counters through the disclosed adapter, including on the first call.
restore; mutate 'select(.payload.type!="task_complete" and .payload.type!="token_count")'
cp "$log" "$fixture/first-response.jsonl"
run_measure --native-log "$log" > "$fixture/self-first.json"
assert_json "$fixture/self-first.json" '.currentRequest.state=="active" and .tool.totalTokens==110 and .lastUsage.counterSource=="token_usage_record" and (.scope.toolInput|contains("adapted"))'
cmp "$log" "$fixture/first-response.jsonl" || fail 'adapter modified native log'
if [[ -n $MOCK_REAL_CCUSAGE ]]; then
  export MOCK_MODE=real
  run_measure --native-log "$log" > "$fixture/self-first-real.json"
  assert_json "$fixture/self-first-real.json" '.currentRequest.state=="active" and .tool.totalTokens==110 and .lastUsage.counterSource=="token_usage_record"'
  export MOCK_MODE=normal
fi
restore; mutate 'select(.payload.type!="task_complete")'
jq -nc --arg id "$id" '
  def u($i;$c;$o;$r): {input_tokens:$i,cached_input_tokens:$c,cache_write_input_tokens:0,output_tokens:$o,reasoning_output_tokens:$r,total_tokens:($i+$o)};
  {timestamp:"2026-10-20T00:00:08Z",type:"token_usage_record",payload:{thread_id:$id,turn_id:"turn-1",response_id:"response-2",usage:u(50;30;5;1),thread_token_usage:u(150;90;15;5)}}' >> "$log"
cp "$log" "$fixture/pending-response.jsonl"
run_measure --native-log "$log" > "$fixture/self-later.json"
assert_json "$fixture/self-later.json" '.currentRequest.state=="active" and .tool.totalTokens==165 and .tool.inputTokens==60 and .tool.cacheReadTokens==90 and .lastUsage.counterSource=="token_usage_record"'
if [[ -n $MOCK_REAL_CCUSAGE ]]; then
  export MOCK_MODE=real
  run_measure --native-log "$log" > "$fixture/self-later-real.json"
  assert_json "$fixture/self-later-real.json" '.tool.totalTokens==165 and .tool.lastActivity=="2026-10-20T00:00:08Z"'
  export MOCK_MODE=normal
fi
for change in \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then .payload.usage.input_tokens=51 | .payload.usage.total_tokens=56 else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then .payload.response_id="response-1" else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then .payload.turn_id="foreign" else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then .payload.thread_id="foreign" else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then .timestamp="2026-10-20T00:00:05Z" else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then .payload.usage.cache_write_input_tokens=1 else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then del(.payload.usage.cached_input_tokens) else . end' \
  'if .type=="token_usage_record" and .payload.response_id=="response-2" then ., . else . end'; do
  cp "$fixture/pending-response.jsonl" "$log"; mutate "$change"
  bad invalid-pending-response --native-log "$log"
done
cp "$fixture/pending-response.jsonl" "$log"
printf '%s\n' '{"timestamp":"2026-10-20T00:00:09Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1"}}' >> "$log"
bad completed-pending-response --native-log "$log"
cp "$fixture/pending-response.jsonl" "$log"
jq -c 'select(.type=="token_usage_record" and .payload.response_id=="response-2") |
  {timestamp:"2026-10-20T00:00:09Z",type:"event_msg",payload:{type:"token_count",info:{total_token_usage:.payload.thread_token_usage,last_token_usage:.payload.usage}}}' "$log" > "$fixture/arrived-count"
cat "$fixture/arrived-count" >> "$log"
run_measure --native-log "$log" > "$fixture/self-arrived.json"
assert_json "$fixture/self-arrived.json" '.tool.totalTokens==165 and .lastUsage.counterSource=="token_count"'
# New active task can report the preceding task response while inflight is unknown.
jq -nc --arg cwd "$fixture/project" '
  {timestamp:"2026-10-20T00:00:08Z",type:"event_msg",payload:{type:"task_started",turn_id:"turn-2"}},
  {timestamp:"2026-10-20T00:00:09Z",type:"response_item",payload:{type:"message",role:"user",content:[{text:"marker-second"}]}},
  {timestamp:"2026-10-20T00:00:10Z",type:"turn_context",payload:{turn_id:"turn-2",cwd:$cwd,model:"fixture-model",effort:"medium"}}' > "$fixture/second.jsonl"
restore; cat "$fixture/second.jsonl" >> "$log"
run_measure --native-log "$log" --marker marker-second --started-after 2026-10-20T00:00:08Z > "$fixture/active-second.json"
assert_json "$fixture/active-second.json" '.currentRequest.turnId=="turn-2" and .lastUsage.turnId=="turn-1" and .currentRequest.state=="active"'
bad historical-marker --native-log "$log"
printf '%s\n' '{"timestamp":"2026-10-20T00:00:11Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-2"}}' >> "$log"
bad stale-complete --native-log "$log" --marker marker-second

# Real test2 ordering: matching abort, new task/context/user, unchanged cumulative
# usage, then new responses. Never reset accounting at the continuation boundary.
restore
mutate 'if .payload.type=="task_complete" then .payload.type="turn_aborted" else . end'
cp "$log" "$fixture/aborted.jsonl"
bad current-abort --native-log "$log"
assert_json "$fixture/current-abort.json" '.error.code=="current_request_aborted"'
cat "$fixture/second.jsonl" >> "$log"
run_measure --native-log "$log" --marker marker-second > "$fixture/resumed.json"
assert_json "$fixture/resumed.json" '.currentRequest.state=="active" and .currentRequest.turnId=="turn-2" and .lastUsage.turnId=="turn-1" and .tool.totalTokens==110'
jq -nc --arg id "$id" '
  def u($i;$c;$o;$r): {input_tokens:$i,cached_input_tokens:$c,cache_write_input_tokens:0,output_tokens:$o,reasoning_output_tokens:$r,total_tokens:($i+$o)};
  {timestamp:"2026-10-20T00:00:11Z",type:"response_item",payload:{type:"message",role:"assistant",phase:"final_answer"}},
  {timestamp:"2026-10-20T00:00:12Z",type:"token_usage_record",payload:{thread_id:$id,turn_id:"turn-2",response_id:"response-2",usage:u(50;30;5;1),thread_token_usage:u(150;90;15;5)}},
  {timestamp:"2026-10-20T00:00:13Z",type:"event_msg",payload:{type:"token_count",info:{total_token_usage:u(150;90;15;5),last_token_usage:u(50;30;5;1)}}},
  {timestamp:"2026-10-20T00:00:14Z",type:"event_msg",payload:{type:"task_complete",turn_id:"turn-2"}}' >> "$log"
cp "$log" "$fixture/resumed-settled.jsonl"
run_measure --native-log "$log" --marker marker-second > "$fixture/resumed-settled.json"
assert_json "$fixture/resumed-settled.json" '.currentRequest.state=="settled" and .tool.totalTokens==165 and .tool.cacheReadTokens==90'
if [[ -n $MOCK_REAL_CCUSAGE ]]; then
  export MOCK_MODE=real
  run_measure --native-log "$log" --marker marker-second > "$fixture/resumed-real.json"
  assert_json "$fixture/resumed-real.json" '.currentRequest.state=="settled" and .tool.totalTokens==165'
  export MOCK_MODE=normal
fi
bad resumed-old-marker --native-log "$log"
for change in \
  'if .payload.type=="turn_aborted" then .payload.turn_id="wrong" else . end' \
  'if .payload.type=="turn_aborted" then del(.payload.turn_id) else . end' \
  'select(.payload.type!="turn_aborted")' \
  'if .payload.type=="turn_aborted" then ., . else . end' \
  'if .payload.type=="turn_aborted" then .timestamp="2026-10-20T00:00:09Z" else . end' \
  'if .payload.turn_id=="turn-2" then .payload.turn_id="turn-1" else . end'; do
  cp "$fixture/resumed-settled.jsonl" "$log"
  mutate "$change"
  bad invalid-resume --native-log "$log" --marker marker-second
  assert_json "$fixture/invalid-resume.json" '.error.code=="unsupported_boundary"'
done
# A matching abort after an already completed turn remains invalid.
restore
jq -c 'select(.payload.type=="task_complete")|.payload.type="turn_aborted"' "$log" > "$fixture/extra-abort"
cat "$fixture/extra-abort" "$fixture/second.jsonl" >> "$log"
bad completed-then-abort --native-log "$log" --marker marker-second

# Missing final counters cannot be replaced by a prior response in the same task.
restore
mutate 'if .type=="response_item" and .payload.phase=="final_answer" then .payload.phase="commentary" else . end'
jq -nc --arg id "$id" '
  {timestamp:"2026-10-20T00:00:08Z",type:"response_item",payload:{type:"message",role:"assistant",phase:"final_answer"}},
  {timestamp:"2026-10-20T00:00:09Z",type:"token_usage_record",payload:{thread_id:$id,turn_id:"turn-1",response_id:"response-2",usage:{input_tokens:50,cached_input_tokens:30,cache_write_input_tokens:0,output_tokens:5,reasoning_output_tokens:1,total_tokens:55},thread_token_usage:{input_tokens:150,cached_input_tokens:90,cache_write_input_tokens:0,output_tokens:15,reasoning_output_tokens:5,total_tokens:165}}}' >> "$log"
bad missing-final-counter --native-log "$log"

for kind in scope stale negative missing fraction wrong-model fallback activity; do
  restore; export MOCK_MODE=$kind
  bad "tool-$kind" --native-log "$log"
done
for kind in codex ccusage; do restore; export MOCK_VERSION=$kind; bad "version-$kind" --native-log "$log"; done
restore; bad provider --provider claude
bad absent-home --log-home "$fixture/absent"
bad invalid-time --started-after nonsense
bad wrong-id --native-log "$log" --native-id 00000000-0000-4000-8000-000000000099
bad wrong-model --native-log "$log" --model other
bad wrong-effort --native-log "$log" --effort high
bad wrong-cwd --native-log "$log" --cwd "$fixture"
bad future-task --native-log "$log" --started-after 2026-10-20T00:00:12Z
cp "$log" "$fixture/outside.jsonl"
bad escape --native-log "$fixture/outside.jsonl"
ln -s "$fixture/outside.jsonl" "$fixture/home/sessions/link.jsonl"
bad symlink --native-log "$fixture/home/sessions/link.jsonl"
rm "$fixture/home/sessions/link.jsonl"
mkdir "$fixture/home/sessions/duplicate"
cp "$log" "$fixture/home/sessions/duplicate/${log##*/}"
bad ambiguous --native-id "$id"
rm -rf "$fixture/home/sessions/duplicate"

# Native auto-review uses a separate guardian source, even when session_id names
# the ordinary parent. Its counters must not be accepted as a qualified CLI log.
restore
mutate 'if .type=="session_meta" then
  .payload.source={subagent:{other:"guardian"}} |
  .payload.thread_source="guardian_review" |
  .payload.session_id="00000000-0000-4000-8000-000000000099" |
  .payload.parent_thread_id=.payload.session_id
  else . end'
bad guardian-source --native-id "$id" --native-log "$log"
assert_json "$fixture/guardian-source.json" '.error.code=="unsupported_history"'

for change in \
  'if .type=="session_meta" then del(.payload.id) else . end' \
  'if .type=="session_meta" then del(.payload.model_provider) else . end' \
  'if .type=="session_meta" then del(.payload.source) else . end' \
  'if .type=="session_meta" then .payload.source="unknown" else . end' \
  'if .type=="session_meta" then .payload.cli_version="old" else . end' \
  'if .type=="session_meta" then .payload.forked_from_id="parent" else . end' \
  'if .type=="session_meta" then .payload.source={subagent:{thread_spawn:{parent_thread_id:"parent"}}} else . end' \
  'if .type=="turn_context" then del(.payload.model) else . end' \
  'if .payload.type=="token_count" then .payload.info.total_token_usage.input_tokens=-1 else . end' \
  'if .payload.type=="token_count" then del(.payload.info.total_token_usage.cached_input_tokens) else . end' \
  'if .payload.type=="token_count" then .payload.info.total_token_usage.cached_input_tokens=101 else . end' \
  'if .payload.type=="token_count" then .payload.info.total_token_usage.reasoning_output_tokens=11 else . end' \
  'if .payload.type=="token_count" then .payload.info.total_token_usage.total_tokens=111 else . end' \
  'if .payload.type=="token_count" then .payload.info.last_token_usage.input_tokens=0.5 else . end' \
  'if .payload.type=="task_complete" then .payload.turn_id="wrong" else . end'; do
  restore; mutate "$change"; bad native-invalid --native-log "$log"
done
restore; printf '%s\n' '{"type":"compacted","payload":{}}' >> "$log"; bad compaction --native-log "$log"
restore; mutate 'if .payload.type=="task_complete" then .timestamp="2026-10-20T00:00:01.001Z" else . end'; bad early-completion --native-log "$log"
restore
jq -sc '.[0],(.[1:][]|select(.payload.type=="task_complete")),(.[1:][]|select(.payload.type!="task_complete"))' "$log" > "$fixture/changed"
mv "$fixture/changed" "$log"; bad misordered-completion --native-log "$log"
restore
jq -sc 'map(if .type!="session_meta" then .timestamp="2026-10-20T00:00:01.100Z" else . end) | .[7].timestamp="2026-10-20T00:00:01.010Z" | .[0:4]+[.[7]]+.[4:7] | .[]' "$log" > "$fixture/changed"
mv "$fixture/changed" "$log"; bad fractional-completion --native-log "$log"
restore; bad fractional-start --native-log "$log" --started-after 2026-10-20T00:00:01.001Z
restore; mutate 'select(.type!="token_usage_record" and .payload.type!="token_count")'; bad no-counters --native-log "$log"
restore; printf 'PRIVATE_TRANSCRIPT invalid JSON\n' >> "$log"; bad malformed --native-log "$log"
restore
jq -c 'select(.payload.type=="token_count")|.payload.info.total_token_usage={input_tokens:50,cached_input_tokens:20,cache_write_input_tokens:0,output_tokens:5,reasoning_output_tokens:1,total_tokens:55}|.payload.info.last_token_usage=.payload.info.total_token_usage' "$log" >> "$fixture/reset.jsonl"
cat "$fixture/reset.jsonl" >> "$log"
bad reset --native-log "$log"
assert_json "$fixture/reset.json" '.error.code=="counter_reset"'

# One native update during the tool read is retried, without dispatch or a daemon.
restore; export MOCK_MODE=race
jq -c 'select(.payload.type=="task_complete")' "$log" > "$fixture/append.jsonl"
mutate 'select(.payload.type!="task_complete")'
run_measure --native-log "$log" > "$fixture/race.json"
assert_json "$fixture/race.json" '.status=="ready" and .lastUsage.cumulative.total_tokens==110'
restore; export MOCK_MODE=hang
bad hanging --native-log "$log"
[[ -s $fixture/helper.pid && -s $fixture/child.pid ]] || fail 'hanging helper did not run'
for process in "$(cat "$fixture/helper.pid")" "$(cat "$fixture/child.pid")"; do
  ! kill -0 "$process" 2>/dev/null || fail "helper process $process survived timeout"
done
[[ ! -e $(cat "$fixture/tool-home") ]] || fail 'timeout retained projection'
restore; export MOCK_MODE=orphan
run_measure --native-log "$log" > "$fixture/orphan.json"
assert_json "$fixture/orphan.json" '.status=="ready"'
! kill -0 "$(cat "$fixture/orphan.pid")" 2>/dev/null || fail 'successful helper left a child process'
printf 'Session measurement tests passed.\n'
