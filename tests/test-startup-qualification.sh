#!/usr/bin/env bash
# Offline startup contract: real Git, fixture native records and public CLI mocks.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-startup-test.XXXXXX")
trap 'rc=$?; if [[ $rc != 0 ]]; then cat "$fixture/receipt" "$fixture/error" >&2 || true; fi; rm -rf "$fixture"; exit "$rc"' EXIT
mkdir -p "$fixture/bin" "$fixture/source/.hanchou" "$fixture/native"
export FIXTURE="$fixture" CODEX_HOME="$fixture/native" MOCK_MODE=success
export HANCHOU_TEST_CODEX_VERSION=${HANCHOU_TEST_CODEX_VERSION:-0.162.1}
export MOCK_CODEX_VERSION=$HANCHOU_TEST_CODEX_VERSION
export PATH="$fixture/bin:$PATH" HERDR_BIN="$fixture/bin/herdr"
git -C "$fixture/source" init -q
git -C "$fixture/source" -c user.name=Fixture -c user.email=test@example.invalid commit --allow-empty -qm base
cp "$root/skills/hanchou-init/assets/config-template.json" "$fixture/source/.hanchou/config.json"
cat > "$fixture/bin/codex" <<'MOCK'
#!/usr/bin/env bash
[[ $* == --version ]] || exit 90
printf 'codex-cli %s\n' "${MOCK_CODEX_VERSION:-0.162.1}"
MOCK
cat > "$fixture/bin/ccusage" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ $* == --version ]]; then printf 'ccusage %s\n' "${MOCK_USAGE_VERSION:-20.0.37}"; exit; fi
[[ $* == 'codex session --json --offline --no-cost --speed standard --id 11111111-1111-1111-1111-111111111111' ]] || exit 91
printf '%s' "$$" > "$FIXTURE/usage-pid"
if [[ $MOCK_MODE == timeout ]]; then trap '' TERM; while :; do sleep 0.1; done; fi
extra=0
[[ $MOCK_MODE != counters ]] || extra=1
if [[ $MOCK_MODE == delayed-counts && ! -f $FIXTURE/usage-first ]]; then
  touch "$FIXTURE/usage-first"; extra=1
fi
jq -n --argjson extra "$extra" --arg mode "$MOCK_MODE" '{
 sessionId:"fixture/rollout-11111111-1111-1111-1111-111111111111",
 sessionFile:"rollout-11111111-1111-1111-1111-111111111111",
 inputTokens:80,cacheReadTokens:20,outputTokens:3,reasoningOutputTokens:1,
 cacheCreationTokens:0,totalTokens:(103+$extra),models:{"gpt-6-astra":{totalTokens:103}}} |
 if $mode=="missing-count" then del(.inputTokens) | .cacheReadTokens=100 else . end |
 if $mode=="negative-count" then .inputTokens = -1 | .cacheReadTokens=101 else . end'
MOCK
cat > "$fixture/bin/herdr" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
jq -nc --args '$ARGS.positional' -- "$@" >> "$FIXTURE/calls"
shift 2
case "$1 $2" in
 "workspace list") printf '{"result":{"workspaces":[]}}\n';;
 "workspace create")
   shift 2
   [[ $1 == --cwd ]]
   printf '%s' "$2" > "$FIXTURE/cwd"
   jq -nc --arg cwd "$2" '{result:{workspace:{workspace_id:"w1"},tab:{tab_id:"w1:t1"},root_pane:{pane_id:"w1:p1",cwd:$cwd}}}'
   ;;
 "pane run")
   [[ $3 == w1:p1 ]]
   if [[ $MOCK_MODE == pane-version ]]; then
     # A shell wrapper may resolve a different Codex, even another supported one.
     MOCK_CODEX_VERSION=0.162.1 bash -c "$4"
   else bash -c "$4"; fi
   printf '{"result":{"type":"ok"}}\n'
   ;;
 "agent start")
   until [[ $1 == -- ]]; do shift; done
   shift
   jq -nc --args '$ARGS.positional' -- "$@" > "$FIXTURE/agent-args"
   id=11111111-1111-1111-1111-111111111111
   [[ $MOCK_MODE != id ]] || id=22222222-2222-2222-2222-222222222222
   [[ $MOCK_MODE != no-herdr-id ]] || id=
   jq -nc --arg cwd "$(cat "$FIXTURE/cwd")" --arg id "$id" \
    '{result:{agent:{agent:"codex",agent_status:"idle",pane_id:"w1:p1",cwd:$cwd,agent_session:{kind:"id",value:$id}}}}'
   ;;
 "pane process-info")
   jq -nc --arg cwd "$(cat "$FIXTURE/cwd")" --slurpfile args "$FIXTURE/agent-args" --arg mode "$MOCK_MODE" '
     {result:{process_info:{foreground_processes:[{pid:999999,cwd:$cwd,
       argv:(["codex"]+$args[0]+(if $mode=="process-args" then ["--unexpected","sensitive-value"] else [] end))}]}}}'
   ;;
 "agent prompt")
   prompt=$4
   marker=$(printf '%s\n' "$prompt" | sed -n 's/.*token \(HANCHOU_STARTUP_[a-f0-9]*\).*/\1/p')
   [[ -n $marker ]]
   mkdir -p "$CODEX_HOME/sessions/fixture"
   log="$CODEX_HOME/sessions/fixture/rollout-11111111-1111-1111-1111-111111111111.jsonl"
   jq -nc --arg cwd "$(cat "$FIXTURE/cwd")" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --arg prompt "$prompt" --arg marker "$marker" --arg mode "$MOCK_MODE" --arg version "$MOCK_CODEX_VERSION" '
     {type:"session_meta",payload:{id:"11111111-1111-1111-1111-111111111111",cwd:$cwd,
       timestamp:$at,model_provider:"openai",cli_version:(if $mode=="native-version" then "0.162.1" else $version end),
       forked_from_id:(if $mode=="fork" then "parent" else null end)}},
     {type:"turn_context",payload:({model:(if $mode=="model" then "wrong" else "gpt-6-astra" end),effort:"medium"} +
       (if ($mode|startswith("manual-")) then {
         sandbox_policy:{type:(if $mode=="manual-sandbox" then "danger-full-access" else "workspace-write" end)},
         approval_policy:(if $mode=="manual-policy" then "never" else "on-request" end),
         approvals_reviewer:(if $mode=="manual-reviewer" then "auto_review" else "user" end)} |
         if $mode=="manual-missing" then del(.approvals_reviewer) else . end
       else {} end))},
     {type:"event_msg",payload:{type:"task_started",turn_id:"turn"}},
     {type:"response_item",payload:{type:"message",role:"user",content:[{type:"input_text",text:$prompt}]}},
     (if $mode=="tool" then {type:"response_item",payload:{type:"custom_tool_call"}} else empty end),
     (if $mode=="builtin-tool" then {type:"response_item",payload:{type:"web_search_call"}} else empty end),
     {type:"event_msg",payload:{type:"token_count",info:{total_token_usage:{
       input_tokens:100,cached_input_tokens:(if $mode=="missing-count" then 100 elif $mode=="negative-count" then 101 else 20 end),
       output_tokens:3,reasoning_output_tokens:1,
       cache_write_input_tokens:0,total_tokens:103}}}},
     {type:"response_item",payload:{type:"message",role:"assistant",phase:"final_answer",
       content:[{type:"output_text",text:(if $mode=="echo" then "Not acknowledged." else "Acknowledged `"+$marker+"`." end)}]}},
     (if $mode=="incomplete" or $mode=="delayed-log" then empty else {type:"event_msg",payload:{type:"task_complete",turn_id:"turn"}} end)
     ' > "$log"
   if [[ $MOCK_MODE == delayed-log ]]; then
     (sleep 0.4; printf '%s\n' '{"type":"event_msg","payload":{"type":"task_complete","turn_id":"turn"}}' >> "$log") >/dev/null 2>&1 &
   fi
   [[ $MOCK_MODE != ambiguous ]] || cp "$log" "${log%.jsonl}-copy.jsonl"
   [[ $MOCK_MODE != wrong-home ]] || mv "$CODEX_HOME/sessions" "$FIXTURE/wrapper-home"
   [[ $MOCK_MODE != bootstrap ]] || exit 7
   printf '{"result":{"type":"ok"}}\n'
   ;;
 *) exit 92;;
esac
MOCK
chmod +x "$fixture/bin/"*
launch() {
  bash "$root/skills/hanchou-orchestrator/scripts/launch-sokkin.sh" \
    --project "$fixture/source" --mission startup --session fixture \
    --worktree-root "$fixture/worktrees" --qualify-startup --timeout-ms 3001 "$@"
}
for mode in ${HANCHOU_TEST_STARTUP_CASES:-success no-herdr-id delayed-log delayed-counts echo incomplete tool builtin-tool fork model id counters missing-count negative-count ambiguous wrong-home bootstrap timeout process-args}; do
  export MOCK_MODE=$mode
  rm -rf "$CODEX_HOME/sessions" "$fixture/wrapper-home"
  : > "$fixture/calls"
  rc=0
  if [[ $mode == manual-* ]]; then
    launch --manual-approvals --skip-update-check > "$fixture/receipt" 2> "$fixture/error" || rc=$?
  else
    launch > "$fixture/receipt" 2> "$fixture/error" || rc=$?
  fi
  jq -es 'length==1' "$fixture/receipt" >/dev/null
  if [[ $mode == success || $mode == no-herdr-id || $mode == delayed-log || $mode == delayed-counts || $mode == manual-success ]]; then
    [[ $rc == 0 ]]
    jq -e '.ok and .stage=="startup_qualified" and .usageReadiness.status=="ready" and
      .sokkin.observedModel=="gpt-6-astra" and .sokkin.observedEffort=="medium" and
      .sokkin.process.argumentsMatchLaunch and .sokkin.process.pid==999999 and
      .usageReadiness.tool.totalTokens==103 and .usageReadiness.includedChildren==[]' "$fixture/receipt" >/dev/null
  else
    [[ $rc != 0 ]]
    jq -e '.ok==false and .usageReadiness.status!="ready" and .herdr.paneId=="w1:p1"' "$fixture/receipt" >/dev/null
    [[ -d $(jq -r .worktree.path "$fixture/receipt") ]]
  fi
  if [[ $mode == manual-* ]]; then
    jq -e '.sokkin.requestedManualApprovals and .sokkin.requestedSkipUpdateCheck' "$fixture/receipt" >/dev/null
    jq -e '.==["--model","gpt-6-astra","--no-daemon","--sandbox","workspace-write",
      "--ask-for-approval","on-request","-c","approvals_reviewer=\"user\"",
      "-c","check_for_update_on_startup=false","-c","model_reasoning_effort=\"medium\""]' "$fixture/agent-args" >/dev/null
    if [[ $mode == manual-success ]]; then
      jq -e '.sokkin.observedPermissions=={sandbox:"workspace-write",approvalPolicy:"on-request",approvalsReviewer:"user"}' "$fixture/receipt" >/dev/null
    else
      jq -e '.error.code=="bootstrap_evidence_mismatch" and .sokkin.observedPermissions==null' "$fixture/receipt" >/dev/null
    fi
  else
    jq -e '.sokkin.requestedManualApprovals==false and .sokkin.observedPermissions==null' "$fixture/receipt" >/dev/null
  fi
  prompt_count=1
  [[ $mode != process-args && $mode != pane-version ]] || prompt_count=0
  jq -se --argjson count "$prompt_count" '[.[]|select(.[2]=="agent" and .[3]=="prompt")]|length==$count' "$fixture/calls" >/dev/null
  if [[ $mode == process-args ]]; then
    jq -e '.error.code=="process_identity_mismatch" and (. | tostring | contains("sensitive-value") | not)' "$fixture/receipt" >/dev/null
  fi
  if [[ $mode == timeout ]]; then
    ! kill -0 "$(cat "$fixture/usage-pid")" 2>/dev/null
  fi
  printf 'startup qualification: %s ok\n' "$mode"
done
for version in codex usage; do
  export MOCK_MODE=success MOCK_CODEX_VERSION=$HANCHOU_TEST_CODEX_VERSION MOCK_USAGE_VERSION=20.0.37
  if [[ $version == codex ]]; then export MOCK_CODEX_VERSION=unknown; else export MOCK_USAGE_VERSION=unknown; fi
  : > "$fixture/calls"
  if launch > "$fixture/receipt" 2> "$fixture/error"; then exit 1; fi
  jq -e '.error.code=="unsupported_version" and .resources==[]' "$fixture/receipt" >/dev/null
  [[ ! -s $fixture/calls ]]
done
printf 'startup qualification: unsupported versions ok\n'

# Manual mode cannot silently fall back to unqualified startup or another version.
export MOCK_CODEX_VERSION=0.162.1 MOCK_USAGE_VERSION=20.0.37
: > "$fixture/calls"
if launch --manual-approvals > "$fixture/receipt" 2> "$fixture/error"; then exit 1; fi
jq -e '.error.code=="unsupported_version" and .resources==[]' "$fixture/receipt" >/dev/null
[[ ! -s $fixture/calls ]]
if "$root/skills/hanchou-orchestrator/scripts/launch-sokkin.sh" --project "$fixture/source" \
  --mission manual --manual-approvals > "$fixture/receipt" 2> "$fixture/error"; then exit 1; fi
jq -e '.error.code=="unsupported_option" and .resources==[]' "$fixture/receipt" >/dev/null
[[ ! -s $fixture/calls ]]
if "$root/skills/hanchou-orchestrator/scripts/launch-sokkin.sh" --project "$fixture/source" \
  --lifecycle reap --manual-approvals > "$fixture/receipt" 2> "$fixture/error"; then exit 1; fi
jq -e '.error.code=="invalid_operation" and .resources==[]' "$fixture/receipt" >/dev/null
[[ ! -s $fixture/calls ]]
printf 'startup qualification: manual-mode preflight restrictions ok\n'
