#!/usr/bin/env bash
# One-shot Herdr launch/lifecycle. No mission dispatch; JSON receipts on stdout.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: launch-sokkin.sh --project PATH --mission SLUG [options]
       launch-sokkin.sh --project PATH --lifecycle finish|accept|resume|reap
         [--instance KEY] [--evidence PATH]
  --session NAME         Opt into an existing shared session (never auto-stopped)
  --config PATH          Default: selected project's .hanchou/config.json
  --base REF             Default: selected project's HEAD, resolved once
  --agent codex|claude   One-launch override (does not write configuration)
  --model MODEL          One-launch model override
  --effort low|medium|high  One-launch reasoning effort override
  --worktree-root PATH   Absolute directory outside existing checkouts
  --timeout-ms NUMBER    Agent readiness timeout, 3001..300000 (default 30000)
  --skip-update-check    Codex only; explicit per-launch update-check opt-out
  --qualify-startup      Codex 0.162.1 + ccusage 20.0.37: fixed tool-free bootstrap
  --help                 Show this help without contacting Herdr

Requires Bash 3.2+, Git, jq, Herdr (tested: 0.9.5) and the official agent CLI.
By default create an owned named server and a private .hanchou/instances record.
With --session select an already-running shared server. HERDR_BIN names its CLI.
finish saves a report; accept saves settled usage after agent exit; resume clears
completion; reap closes accepted FINISHED instances >=24h old when called.
No worktree, branch, session history or record is deleted by reap.
Default success means agent readiness only. Opt-in startup qualification returns
initial identity/usage evidence, never mission completion or final usage.
Blocked/uncertain starts preserve resources and return their identity. Do not
blindly rerun: inspect the returned workspace/pane and original attempt first.
HELP
}
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"version":2,"ok":false,"stage":"preflight","error":{"code":"missing_jq"},"resources":[]}'
  exit 1
fi

project= mission= session= config_path= base=HEAD model_override= agent_override= effort_override=
worktree_root= timeout_ms=30000 tmp= wt= branch= base_commit= actual_head= attempt=
workspace= tab= pane= agent_name= native_id= kind= actual_cwd=
stage=preflight error_code=unexpected_failure error_message='Launch did not finish.'
upstream_code=
effective='{}' agent_info='{}' resources='[]' emitted=false
source_snapshot=null skip_update_check=false
qualify_startup=false usage_readiness='{"status":"pending","reason":"Verify native identity, settled usage and scope before real work."}'
observed_model= observed_effort= companion= log_home=
usage_pid=
observed_process=null
started_at=
herdr_bin=${HERDR_BIN:-herdr}
lifecycle= instance= evidence= instance_dir= record= lifecycle_lock= instances=
server_pid= server_birth= server_socket= server_inode= state= inventory=
owned=false

receipt() {
  local ok=$1
  if [[ $owned == true && -n $record && -f $record ]]; then
    state=$(jq -c --arg status "$(if [[ $ok == true ]]; then printf RUNNING; else printf UNKNOWN; fi)" \
      --arg workspace "$workspace" --arg pane "$pane" --arg path "$wt" --arg branch "$branch" \
      --arg native "$native_id" --argjson resources "$resources" '.nativeId=(if $native=="" then null else $native end) | .status=$status | .workspaceId=$workspace | .paneId=$pane |
        .worktree={path:$path,branch:$branch} | .resources=$resources' "$record")
    state_write "$state" || return 1
  fi
  jq -n --argjson ok "$ok" --arg stage "$stage" --arg mission "$mission" \
    --arg attempt "$attempt" --arg config "$config_path" --argjson effective "$effective" \
    --arg project "$project" --arg path "$wt" --arg branch "$branch" --arg base "$base_commit" --arg head "$actual_head" \
    --arg session "$session" --arg workspace "$workspace" --arg tab "$tab" --arg pane "$pane" \
    --arg agent "$kind" --arg name "$agent_name" --arg native "$native_id" \
    --arg started "$started_at" --argjson snapshot "$source_snapshot" --argjson skipUpdate "$skip_update_check" \
    --arg observedModel "$observed_model" --arg observedEffort "$observed_effort" --argjson usage "$usage_readiness" \
    --argjson process "$observed_process" --arg record "$record" --arg instance "$instance" --argjson owned "$owned" \
    --arg code "$error_code" --arg upstream "$upstream_code" --arg message "$error_message" --argjson resources "$resources" '
    def optional: if . == "" then null else . end;
    {version:2,ok:$ok,stage:$stage,startedAt:($started|optional),sourceSnapshot:$snapshot,
     missionId:($mission|optional),attemptId:($attempt|optional),
     config:{source:($config|optional),effective:$effective},
     worktree:{repository:($project|optional),path:($path|optional),branch:($branch|optional),
       baseCommit:($base|optional),head:($head|optional)},
     lifecycle:{owned:$owned,instanceKey:($instance|optional),record:($record|optional)},
     herdr:{host:"local",session:($session|optional),workspaceId:($workspace|optional),
       tabId:($tab|optional),paneId:($pane|optional)},
     sokkin:{agent:($agent|optional),name:($name|optional),requestedModel:($effective.sokkin.model // null),
       observedModel:($observedModel|optional),requestedEffort:($effective.sokkin.effort // null),observedEffort:($observedEffort|optional),
       requestedSkipUpdateCheck:$skipUpdate,
       process:$process,
       nativeThreadId:(if $agent=="codex" then ($native|optional) else null end),
       nativeSessionId:(if $agent=="claude" then ($native|optional) else null end)},
     usageReadiness:$usage,
     error:(if $ok then null else {code:$code,upstreamCode:($upstream|optional),message:$message} end),resources:$resources}'
  emitted=true
}
finish() {
  local rc=$?
  trap - EXIT
  stop_usage_helper
  if [[ $emitted == false ]]; then receipt false || true; [[ $rc != 0 ]] || rc=1; fi
  [[ -z $lifecycle_lock ]] || rmdir "$lifecycle_lock"
  [[ -z $tmp ]] || rm -rf -- "$tmp"
  exit "$rc"
}
stop_usage_helper() {
  if [[ -n $usage_pid ]]; then
    if kill -0 "$usage_pid" 2>/dev/null; then
      kill "$usage_pid" 2>/dev/null || true
      for ((j=0; j<10; j++)); do kill -0 "$usage_pid" 2>/dev/null || break; sleep 0.1; done
      if kill -0 "$usage_pid" 2>/dev/null; then kill -KILL "$usage_pid" 2>/dev/null || true; fi
    fi
    wait "$usage_pid" 2>/dev/null || true
    usage_pid=
  fi
}
trap finish EXIT
trap 'error_code=interrupted; error_message="Launch interrupted; reconcile this attempt before retrying."; exit 130' INT TERM
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
fail() { error_code=$1; error_message=$2; exit 1; }
need_value() { [[ $# -ge 2 && -n $2 && $2 != --* ]] || fail missing_argument 'An option is missing its value.'; }
# Owned-session lifecycle; all operations are one-shot and local to pinned project.
# Records are coordination evidence, not an authentication or sandbox boundary.
process_birth() { LC_ALL=C ps -p "$1" -o lstart= 2>/dev/null | sed 's/^ *//;s/ *$//'; }
require_process_inspection() {
  local birth
  birth=$(process_birth "$$") && [[ -n $birth ]] ||
    fail process_inspection_unavailable 'Process inspection (ps) is blocked. Use the host approval flow for this exact operation; do not disable the sandbox globally. No lifecycle resource has been created or changed.'
}
state_write() {
  local data=$1
  printf '%s\n' "$data" > "$instance_dir/.instance-next"
  mv -f -- "$instance_dir/.instance-next" "$record"
}
state_root() {
  [[ ! -L $project/.hanchou && ! -L $project/.hanchou/instances ]] || fail unsafe_record 'Instance directories must not be symlinks.'
  instances="$project/.hanchou/instances"
}
load_instance() {
  [[ $instance =~ ^[a-f0-9]{32}$ ]] || fail invalid_instance 'Use the returned instance key.'
  instance_dir="$instances/$instance"; record="$instance_dir/instance.json"
  [[ -d $instance_dir && ! -L $instance_dir && -f $record && ! -L $record ]] || fail invalid_record 'Missing or unsafe instance record.'
  mkdir "$instance_dir/lock" 2>/dev/null || fail instance_busy 'Instance is locked; inspect the original operation, never steal its lock.'
  lifecycle_lock="$instance_dir/lock"
  state=$(jq -ces 'if length==1 then .[0] else error("multiple records") end' "$record") || fail invalid_record 'Invalid instance JSON.'
  jq -e --arg project "$project" --arg id "$instance" --arg host "$(hostname)" '
    .version==1 and .instanceKey==$id and .project==$project and .host==$host and
    .ownership=="dedicated" and .session==("hanchou-"+$id) and
    (.status=="RUNNING" or .status=="FINISHED" or .status=="CLOSED" or .status=="STARTING" or .status=="UNKNOWN")
  ' <<<"$state" >/dev/null || fail invalid_record 'Instance ownership, host or schema mismatch.'
  session=$(jq -r .session <<<"$state")
}
server_matches() {
  local pid birth socket
  pid=$(jq -r '.server.pid // empty' <<<"$state"); birth=$(jq -r '.server.birth // empty' <<<"$state")
  [[ $pid =~ ^[0-9]+$ && -n $birth && $(process_birth "$pid") == "$birth" ]] || return 1
  herdr status --json > "$tmp/server.json" 2> "$tmp/error" || return 1
  socket=$(jq -r '.server.socket // empty' <<<"$state")
  jq -e --arg session "$session" --arg socket "$socket" '
    .server.running==true and .server.compatible==true and .server.session==$session and .server.socket==$socket
  ' "$tmp/server.json" >/dev/null || return 1
  [[ -S $socket && $(ls -di "$socket" | awk '{print $1}') == "$(jq -r .server.socketInode <<<"$state")" ]]
}
quiet_inventory() {
  # Agent absence alone is insufficient: include every pane and server descendant.
  herdr api snapshot > "$tmp/snapshot.json" 2> "$tmp/error" || return 1
  jq -e '.result.snapshot | (.agents|type=="array" and length==0) and
    (.panes|type=="array" and
      all(.[]; .pane_id|type=="string" and test("^[^[:space:][:cntrl:]]+$")) and
      (map(.pane_id)|length==(unique|length)))' "$tmp/snapshot.json" >/dev/null || return 1
  : > "$tmp/shells.jsonl"
  local pane shell birth
  while IFS= read -r pane; do
    herdr pane process-info --pane "$pane" > "$tmp/process-info.json" 2> "$tmp/error" || return 1
    shell=$(jq -er '.result.process_info | select(.shell_pid|type=="number" and .>0 and floor==.) |
      select((.foreground_processes|type=="array" and length==1) and .foreground_processes[0].pid==.shell_pid) |
      select(.foreground_processes[0] |
        (.name|IN("sh","bash","zsh","dash","ksh","fish")) and
        (.argv|type=="array" and length>0 and all(.[1:][]; IN("-l","-i","-il","-li","--login","--noprofile","--norc")))) |
      .shell_pid' "$tmp/process-info.json") || return 1
    birth=$(process_birth "$shell"); [[ -n $birth ]] || return 1
    jq -nc --arg pane "$pane" --argjson pid "$shell" --arg birth "$birth" '{pane:$pane,pid:$pid,birth:$birth}' >> "$tmp/shells.jsonl"
  done < <(jq -r '.result.snapshot.panes[].pane_id' "$tmp/snapshot.json")
  ps -axo pid=,ppid= > "$tmp/process-tree" || return 1
  # ps output contains numbers only; walk descendants without assuming an agent name.
  jq -Rn '[inputs | capture("^ *(?<pid>[0-9]+) +(?<ppid>[0-9]+) *$") | {pid:(.pid|tonumber),ppid:(.ppid|tonumber)}]' < "$tmp/process-tree" > "$tmp/process-tree.json" || return 1
  jq -e --argjson root "$(jq -r .server.pid <<<"$state")" --slurpfile shells "$tmp/shells.jsonl" '
    . as $all | def descendants($p): $all[] | select(.ppid==$p) | .pid as $id | $id, descendants($id);
    [descendants($root)] | sort == ($shells|map(.pid)|sort)
  ' "$tmp/process-tree.json" >/dev/null || return 1
  inventory=$(jq -sc 'sort_by(.pane)' "$tmp/shells.jsonl")
}
lifecycle_operation() {
  state_root
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-lifecycle.XXXXXX")
  if [[ $lifecycle == reap && -z $instance ]]; then
    # One scan per explicit supervisor invocation. No timer, watcher or daemon.
    local f key rc=0
    for f in "$instances"/*/instance.json; do
      [[ -e $f ]] || continue
      key=$(basename "$(dirname "$f")")
      bash "${BASH_SOURCE[0]}" --project "$project" --lifecycle reap --instance "$key" || rc=1
    done
    emitted=true; exit "$rc"
  fi
  load_instance
  stage="lifecycle_$lifecycle"
  case $lifecycle in
    finish)
      [[ $(jq -r .status <<<"$state") == RUNNING ]] || fail invalid_transition 'Only RUNNING can become FINISHED.'
      [[ -f $evidence && -s $evidence && ! -L $evidence ]] || fail missing_evidence 'Provide the preserved completion report.'
      [[ ( -z ${HANCHOU_INSTANCE_KEY:-} || $HANCHOU_INSTANCE_KEY == "$instance" ) &&
         ( -z ${HANCHOU_INSTANCE_RECORD:-} || $HANCHOU_INSTANCE_RECORD == "$record" ) &&
         ( -z ${HANCHOU_MISSION_ID:-} || $HANCHOU_MISSION_ID == "$(jq -r .missionId <<<"$state")" ) &&
         ( -z ${HANCHOU_ATTEMPT_ID:-} || $HANCHOU_ATTEMPT_ID == "$(jq -r .attemptId <<<"$state")" ) ]] ||
        fail instance_mismatch 'Completion instance or mission differs from the calling pane.'
      server_matches || fail instance_mismatch 'Server incarnation changed or cannot be verified.'
      cp -- "$evidence" "$instance_dir/.report-next"
      mv -- "$instance_dir/.report-next" "$instance_dir/report.txt"
      state=$(jq -c --arg at "$started_at" --arg hash "$(git hash-object "$instance_dir/report.txt")" '
        .status="FINISHED" | .finishedAt=$at | .acceptedAt=null | .acceptedInventory=null | .reportHash=$hash' <<<"$state")
      ;;
    resume)
      jq -e '.status=="FINISHED" and .acceptedAt==null' <<<"$state" >/dev/null || fail invalid_transition 'Resume only before acceptance/CLI exit; otherwise launch a fresh attempt.'
      server_matches || fail instance_mismatch 'Server incarnation changed or cannot be verified.'
      state=$(jq -c '.status="RUNNING" | .finishedAt=null | .acceptedAt=null | .acceptedInventory=null | .acceptanceHash=null' <<<"$state")
      ;;
    accept)
      [[ $(jq -r .status <<<"$state") == FINISHED ]] || fail invalid_transition 'Accept a FINISHED instance only.'
      [[ -f $evidence && ! -L $evidence ]] || fail missing_evidence 'Provide the final acceptance and settled usage receipt.'
      jq -es --argjson record "$state" --arg now "$started_at" '
        def integer: type=="number" and isfinite and .>=0 and floor==. and .<=9007199254740991;
        # Native completion stamps may include fractional UTC seconds. The lifecycle
        # clock has second precision; do not substitute receipt observation for completion.
        def epoch:
          if type=="string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$")
          then sub("\\.[0-9]+Z$";"Z") as $stamp | ($stamp|fromdateiso8601) as $time |
            if ($time|todateiso8601)==$stamp then $time else error("invalid UTC date") end
          else error("missing UTC completion boundary") end;
        length==1 and (.[0] |
        .missionId==$record.missionId and .attemptId==$record.attemptId and
        .artifactsPreserved==true and .workersStopped==true and
        (.usage|type=="array" and length>0 and
          (map(.nativeId)|length==(unique|length)) and
          all(.[]; .status=="ready" and .currentRequest.state=="settled" and
            (.nativeId|type=="string" and length>0) and (.cwd|type=="string" and startswith("/")) and
            (.tool | [.inputTokens,.cacheReadTokens,.cacheCreationTokens,.outputTokens,.reasoningOutputTokens,.totalTokens] | all(.[];integer)) and
            .tool.totalTokens==(.tool.inputTokens+.tool.cacheReadTokens+.tool.cacheCreationTokens+.tool.outputTokens) and
            .tool.reasoningOutputTokens<=.tool.outputTokens and
            (. as $usage | .scope.kind=="native session cumulative" and .scope.includedNativeIds==[$usage.nativeId] and
              .scope.includedChildren==[] and .scope.missionDelta==false and .scope.otherSessionsIncluded==false) and
            (.currentRequest.completedAt|epoch)>=($record.createdAt|epoch) and
            (.currentRequest.completedAt|epoch)<=(.observedAt|epoch) and
            (.observedAt|epoch)<=($now|epoch)) and
          any(.[]; .cwd==$record.worktree.path and
            ($record.nativeId==null or .nativeId==$record.nativeId) and
            (.currentRequest.completedAt|epoch)>=($record.finishedAt|epoch))))
      ' "$evidence" >/dev/null || fail invalid_evidence 'Acceptance requires preserved artifacts, stopped workers and scoped final settled usage including this sokkin.'
      [[ -f $instance_dir/report.txt && ! -L $instance_dir/report.txt ]] || fail missing_evidence 'Completion report is missing or unsafe.'
      [[ $(git hash-object "$instance_dir/report.txt") == "$(jq -r .reportHash <<<"$state")" ]] || fail changed_evidence 'Completion report changed.'
      server_matches && quiet_inventory || fail instance_busy 'Verify the owned server; exit every agent/worker before accepting cleanup.'
      cp -- "$evidence" "$instance_dir/.acceptance-next"
      mv -- "$instance_dir/.acceptance-next" "$instance_dir/acceptance.json"
      state=$(jq -c --arg at "$started_at" --argjson inventory "$inventory" --arg hash "$(git hash-object "$instance_dir/acceptance.json")" '
        .acceptedAt=$at | .acceptedInventory=$inventory | .acceptanceHash=$hash' <<<"$state")
      ;;
    reap)
      if ! jq -e --arg now "$started_at" '
        .status=="FINISHED" and (.acceptedAt|type=="string") and
        (.finishedAt|type=="string") and
        (.finishedAt|fromdateiso8601) <= ($now|fromdateiso8601)-86400 and
        (.acceptedAt|fromdateiso8601) >= (.finishedAt|fromdateiso8601) and
        (.acceptedAt|fromdateiso8601) <= ($now|fromdateiso8601)
      ' <<<"$state" >/dev/null 2>&1; then
        jq -nc --arg id "$instance" '{ok:true,instanceKey:$id,action:"retained",reason:"not_due_or_not_accepted"}'
        emitted=true; exit 0
      fi
      [[ -f $instance_dir/report.txt && ! -L $instance_dir/report.txt && -f $instance_dir/acceptance.json && ! -L $instance_dir/acceptance.json ]] || fail missing_evidence 'Retain instance: preserved evidence is missing.'
      [[ $(git hash-object "$instance_dir/report.txt") == "$(jq -r .reportHash <<<"$state")" && $(git hash-object "$instance_dir/acceptance.json") == "$(jq -r .acceptanceHash <<<"$state")" ]] || fail changed_evidence 'Retain instance: evidence changed.'
      server_matches && quiet_inventory || fail instance_busy 'Retain instance: changed server, live work or unknown process state.'
      [[ $inventory == "$(jq -c .acceptedInventory <<<"$state")" ]] || fail inventory_changed 'Retain instance: pane/process inventory changed after acceptance.'
      # Recheck the incarnation immediately before the public stop call.
      server_matches || fail instance_mismatch 'Retain instance: server changed before stop.'
      herdr session stop "$session" --json > "$instance_dir/stop-receipt.json" 2> "$tmp/error" || fail stop_unconfirmed 'Stop failed or is uncertain; retain evidence and inspect this instance.'
      local pid birth socket
      pid=$(jq -r .server.pid <<<"$state"); birth=$(jq -r .server.birth <<<"$state"); socket=$(jq -r .server.socket <<<"$state")
      for ((i=0;i<50;i++)); do
        [[ $(process_birth "$pid") != "$birth" && ! -e $socket ]] && break
        sleep 0.1
      done
      [[ $(process_birth "$pid") != "$birth" && ! -e $socket ]] || fail stop_unconfirmed 'Stop receipt is not proof of process/socket disappearance.'
      while IFS= read -r shell; do
        pid=$(jq -r .pid <<<"$shell"); birth=$(jq -r .birth <<<"$shell")
        [[ $(process_birth "$pid") != "$birth" ]] || fail stop_unconfirmed 'An owned pane process remains.'
      done < <(jq -c '.acceptedInventory[]' <<<"$state")
      state=$(jq -c --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.status="CLOSED" | .closedAt=$at' <<<"$state")
      ;;
    *) fail invalid_operation 'Lifecycle operation must be finish, accept, resume or reap.';;
  esac
  state_write "$state"
  jq -nc --arg id "$instance" --arg record "$record" --arg status "$(jq -r .status <<<"$state")" '{ok:true,instanceKey:$id,record:$record,status:$status}'
  emitted=true; exit 0
}

while [[ $# -gt 0 ]]; do
  if [[ $1 == --skip-update-check ]]; then skip_update_check=true; shift; continue; fi
  if [[ $1 == --qualify-startup ]]; then qualify_startup=true; shift; continue; fi
  need_value "$@"
  case $1 in
    --lifecycle) lifecycle=$2;; --instance) instance=$2;; --evidence) evidence=$2;;
    --project) project=$2;; --mission) mission=$2;; --session) session=$2;;
    --config) config_path=$2;; --base) base=$2;; --agent) agent_override=$2;;
    --model) model_override=$2;; --effort) effort_override=$2;;
    --worktree-root) worktree_root=$2;; --timeout-ms) timeout_ms=$2;;
    *) fail unknown_option 'Unknown launch option.';;
  esac
  shift 2
done
[[ -n $project ]] || fail missing_argument 'Project is required.'
[[ -d $project ]] || fail invalid_project 'Project directory does not exist.'
project=$(cd "$project" && pwd -P)
herdr() { command "$herdr_bin" --session "$session" "$@"; }
if [[ -n $lifecycle ]]; then
  [[ -z $mission && -z $session && -z $config_path && -z $agent_override && -z $model_override && -z $effort_override && -z $worktree_root && $base == HEAD && $qualify_startup == false && $skip_update_check == false ]] || fail invalid_operation 'Do not combine lifecycle and launch options.'
  [[ $(git -C "$project" rev-parse --show-toplevel 2>/dev/null) == "$project" ]] || fail invalid_project 'Select the pinned Git checkout root.'
  require_process_inspection
  lifecycle_operation
fi
[[ -z $instance && -z $evidence ]] || fail invalid_operation 'Instance and evidence options require --lifecycle.'
[[ -n $mission ]] || fail missing_argument 'Mission is required.'
[[ $mission =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]] || fail invalid_mission 'Mission must be a short lowercase slug.'
[[ -z $session || $session =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || fail invalid_session 'Use an explicit local named Herdr session.'
[[ $timeout_ms =~ ^[0-9]{4,6}$ ]] && ((10#$timeout_ms > 3000 && 10#$timeout_ms <= 300000)) || fail invalid_timeout 'Timeout must be 3001..300000 milliseconds.'
for dependency in git "$herdr_bin"; do
  command -v "$dependency" >/dev/null 2>&1 || fail missing_dependency 'Git or Herdr is not available.'
done
[[ -d $project ]] || fail invalid_project 'Project directory does not exist.'
project=$(cd "$project" && pwd -P)
[[ $(git -C "$project" rev-parse --show-toplevel 2>/dev/null) == "$project" ]] || fail invalid_project 'Select the Git checkout root.'
base_commit=$(git -C "$project" rev-parse --verify --end-of-options "$base^{commit}" 2>/dev/null) || fail invalid_base 'The base must resolve to an existing commit.'
common=$(git -C "$project" rev-parse --path-format=absolute --git-common-dir)
common=$(cd "$common" && pwd -P)
config_path=${config_path:-"$project/.hanchou/config.json"}
[[ -f $config_path ]] || fail missing_config 'Initialize the selected project configuration first.'
config_path=$(cd "$(dirname "$config_path")" && printf '%s/%s' "$(pwd -P)" "$(basename "$config_path")")
parsed_config=$(jq -ces 'if length == 1 then .[0] else error("multiple documents") end' "$config_path" 2>/dev/null) || fail invalid_config 'Configuration must contain one valid JSON object.'
jq -e 'type=="object" and .version==2 and (.sokkin|type=="object") and
  (.sokkin.agent=="codex" or .sokkin.agent=="claude") and
  (.sokkin.model==null or (.sokkin.model|type=="string")) and
  (.sokkin.effort==null or .sokkin.effort=="low" or .sokkin.effort=="medium" or .sokkin.effort=="high") and
  ((keys-["version","sokkin"]|length)==0) and
  ((.sokkin|keys-["agent","model","effort"]|length)==0)' <<<"$parsed_config" >/dev/null 2>&1 || fail invalid_config 'Unsupported configuration version, agent or field.'
effective=$parsed_config
[[ -z $agent_override || $agent_override == codex || $agent_override == claude ]] || fail invalid_agent 'Agent must be codex or claude.'
[[ -z $effort_override || $effort_override == low || $effort_override == medium || $effort_override == high ]] || fail invalid_effort 'Effort must be low, medium or high.'
effective=$(jq -c --arg agent "$agent_override" --arg model "$model_override" --arg effort "$effort_override" '
  if $agent!="" then .sokkin.agent=$agent else . end |
  if $model!="" then .sokkin.model=$model else . end |
  if $effort!="" then .sokkin.effort=$effort else . end' <<<"$effective")
kind=$(jq -r .sokkin.agent <<<"$effective")
[[ $skip_update_check == false || $kind == codex ]] || fail unsupported_option 'Update-check opt-out is supported only for Codex.'
model=$(jq -r '.sokkin.model // empty' <<<"$effective")
effort=$(jq -r '.sokkin.effort // empty' <<<"$effective")
[[ -z $model || $model =~ ^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,99}$ ]] || fail invalid_model 'Model must be a native model identifier.'
command -v "$kind" >/dev/null 2>&1 || fail missing_agent 'The selected official agent CLI is not available.'
if [[ $qualify_startup == true ]]; then
  [[ $kind == codex ]] || fail unsupported_option 'Startup qualification currently supports Codex only.'
  command -v ccusage >/dev/null 2>&1 || fail missing_usage_tool 'Startup qualification requires ccusage.'
  [[ $(ccusage --version) == 'ccusage 20.0.37' && $(codex --version) == 'codex-cli 0.162.1' ]] ||
    fail unsupported_version 'Startup qualification is tested only with Codex 0.162.1 and ccusage 20.0.37.'
  companion="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../hanchou-sokkin" && pwd -P)/SKILL.md"
  [[ -s $companion ]] || fail missing_companion 'The installed companion skill is required.'
fi
herdr() { command "$herdr_bin" --session "$session" "$@"; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-launch.XXXXXX")
if [[ -n $session ]]; then
herdr workspace list > "$tmp/workspaces.json" 2> "$tmp/error" || fail herdr_unavailable 'Start the selected Herdr session before launching a sokkin.'
jq -e '.result.workspaces|type=="array"' "$tmp/workspaces.json" >/dev/null || fail herdr_contract 'Herdr did not return a workspace inventory.'
fi
if [[ $kind == claude ]]; then
  claude auth status --json > "$tmp/auth.json" 2> "$tmp/error" || fail subscription_required 'Claude subscription authentication must be available.'
  jq -e '.loggedIn==true and .authMethod=="claude.ai" and .apiProvider=="firstParty" and
    (.subscriptionType=="pro" or .subscriptionType=="max" or .subscriptionType=="team" or .subscriptionType=="enterprise")' "$tmp/auth.json" >/dev/null || fail subscription_required 'Claude must use a subscription, not API billing.'
fi

# Resolve a not-yet-existing destination through its existing physical ancestor.
worktree_root=${worktree_root:-"$(dirname "$project")/.hanchou-worktrees/$(basename "$project")"}
[[ $worktree_root == /* && $worktree_root != *$'\n'* ]] || fail invalid_destination 'Worktree root must be an absolute path without newlines.'
ancestor=$worktree_root suffix=
while [[ ! -d $ancestor ]]; do
  component=$(basename "$ancestor")
  [[ $component != .. && $component != . ]] || fail invalid_destination 'Use a canonical worktree root.'
  suffix="/$component$suffix"
  ancestor=$(dirname "$ancestor")
done
worktree_root="$(cd "$ancestor" && pwd -P)$suffix"
while IFS= read -r -d '' field; do
  if [[ $field == 'worktree '* ]]; then
    checkout=${field#worktree }
    [[ $worktree_root != "$checkout" && $worktree_root != "$checkout/"* ]] || fail unsafe_destination 'Worktrees must be outside every existing checkout.'
  fi
done < <(git -C "$project" worktree list --porcelain -z)
# Compact pre-launch evidence, not a backup or proof of mission-final preservation.
if [[ -z $session ]]; then
  state_root
  for dependency in nohup ps hostname sed ls awk od; do
    command -v "$dependency" >/dev/null 2>&1 || fail missing_dependency 'Owned server startup requires standard POSIX process tools.'
  done
  require_process_inspection
fi
source_head=$(git -C "$project" rev-parse HEAD)
source_branch=$(git -C "$project" symbolic-ref --quiet --short HEAD || true)
source_staged=$(git --no-optional-locks -C "$project" diff --cached --binary --no-ext-diff --no-textconv | git -C "$project" hash-object --stdin)
source_unstaged=$(git --no-optional-locks -C "$project" diff --binary --no-ext-diff --no-textconv | git -C "$project" hash-object --stdin)
source_status=$(git --no-optional-locks -C "$project" status --porcelain=v1 -z --untracked-files=all | git -C "$project" hash-object --stdin)
source_snapshot=$(jq -nc --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg head "$source_head" --arg branch "$source_branch" --arg common "$common" \
  --arg staged "$source_staged" --arg unstaged "$source_unstaged" --arg status "$source_status" \
  '{observedAt:$at,head:$head,branch:(if $branch=="" then null else $branch end),commonGitDir:$common,
    stagedDiffHash:$staged,unstagedDiffHash:$unstaged,statusHash:$status,
    untrackedContentVerified:false}')
attempt=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
agent_name="sokkin-$attempt"
branch="hanchou/$mission-$attempt"
wt="$worktree_root/$mission-$attempt"
[[ ! -e $wt ]] || fail destination_exists 'Destination already exists.'
stage=worktree_create
mkdir -p -- "$worktree_root"
git -C "$project" worktree add -b "$branch" "$wt" "$base_commit" > "$tmp/git-output" 2> "$tmp/error" || fail worktree_create_failed 'Git worktree creation failed; inspect the reported branch/path before retrying.'
wt=$(cd "$wt" && pwd -P)
resources=$(jq -nc --arg path "$wt" --arg branch "$branch" '[{kind:"worktree",path:$path,branch:$branch,state:"retained"}]')
stage=worktree_verify
wt_common=$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir)
wt_common=$(cd "$wt_common" && pwd -P)
actual_head=$(git -C "$wt" rev-parse HEAD)
[[ $wt != "$project" && $wt_common == "$common" && $actual_head == "$base_commit" && $(git -C "$wt" symbolic-ref --short HEAD) == "$branch" ]] || fail worktree_mismatch 'Created worktree identity did not match the request.'

if [[ -z $session ]]; then
  state_root
  instance=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  session="hanchou-$instance"; instance_dir="$instances/$instance"; record="$instance_dir/instance.json"
  command "$herdr_bin" session list --json > "$tmp/sessions.json" 2> "$tmp/error" || fail session_inventory_unknown 'Cannot check existing named sessions.'
  jq -e --arg name "$session" '.sessions | type=="array" and all(.[]; (.name|ascii_downcase)!=($name|ascii_downcase))' "$tmp/sessions.json" >/dev/null || fail session_collision 'Never adopt or replace an existing session.'
  mkdir -p -- "$instances"
  mkdir -- "$instance_dir" || fail instance_collision 'Instance directory already exists.'
  mkdir "$instance_dir/lock"; lifecycle_lock="$instance_dir/lock"; owned=true
  state=$(jq -nc --arg id "$instance" --arg project "$project" --arg host "$(hostname)" --arg session "$session" \
    --arg mission "$mission" --arg attempt "$attempt" --arg at "$started_at" \
    '{version:1,instanceKey:$id,project:$project,host:$host,ownership:"dedicated",session:$session,
      missionId:$mission,attemptId:$attempt,status:"STARTING",createdAt:$at,finishedAt:null,acceptedAt:null,closedAt:null}')
  state_write "$state"
  stage=server_start
  # Start in durable evidence storage, never in an ephemeral execution checkout.
  # Agent tool runners may terminate the launch process group after returning
  # its receipt. nohup alone only ignores SIGHUP. Bash job control assigns this
  # persistent server its own group without another runtime or launcher.
  set -m
  (cd "$instance_dir" && exec nohup "$herdr_bin" --session "$session" server) > "$instance_dir/server.log" 2>&1 < /dev/null &
  server_pid=$!
  set +m
  server_birth=$(process_birth "$server_pid")
  state=$(jq -c --argjson pid "$server_pid" --arg birth "$server_birth" '.server={pid:$pid,birth:$birth,processGroup:$pid}' <<<"$state"); state_write "$state"
  resources=$(jq -c --arg session "$session" --arg record "$record" '. + [{kind:"server",session:$session,record:$record,state:"retained"}]' <<<"$resources")
  [[ $(LC_ALL=C ps -p "$server_pid" -o pgid= | tr -d '[:space:]') == "$server_pid" ]] ||
    fail server_group_unconfirmed 'Cannot verify a server process group independent of the launch tool.'
  for ((i=0;i<100;i++)); do
    herdr status --json > "$tmp/server.json" 2> "$tmp/error" && jq -e '.server.running==true and .server.compatible==true' "$tmp/server.json" >/dev/null && break
    kill -0 "$server_pid" 2>/dev/null || break
    sleep 0.1
  done
  server_socket=$(jq -er '.server.socket|select(type=="string")' "$tmp/server.json") || fail server_start_unknown 'Server startup did not return a socket.'
  [[ -S $server_socket ]] || fail server_start_unknown 'Server socket was not created.'
  server_inode=$(ls -di "$server_socket" | awk '{print $1}')
  state=$(jq -c --arg socket "$server_socket" --arg inode "$server_inode" '.server.socket=$socket | .server.socketInode=$inode' <<<"$state"); state_write "$state"
  server_matches || fail server_start_unknown 'Cannot bind the new server process and socket.'
fi
stage=workspace_create
# No prompts, hooks, credentials or old .hanchou files are copied to the checkout.
herdr workspace create --cwd "$wt" --label "$agent_name" --env "HANCHOU_MISSION_ID=$mission" --env "HANCHOU_ATTEMPT_ID=$attempt" --env "HANCHOU_INSTANCE_KEY=$instance" --env "HANCHOU_INSTANCE_RECORD=$record" --no-focus > "$tmp/create.json" 2> "$tmp/error" || fail workspace_create_unknown 'Workspace creation failed or is uncertain; reconcile by attempt label before retrying.'
workspace=$(jq -er '.result.workspace.workspace_id|select(type=="string" and length>0)' "$tmp/create.json")
tab=$(jq -er '.result.tab.tab_id|select(type=="string" and length>0)' "$tmp/create.json")
pane=$(jq -er '.result.root_pane.pane_id|select(type=="string" and length>0)' "$tmp/create.json")
resources=$(jq -c --arg id "$workspace" '. + [{kind:"workspace",id:$id,state:"retained"}]' <<<"$resources")
actual_cwd=$(jq -er '.result.root_pane.foreground_cwd // .result.root_pane.cwd' "$tmp/create.json")
[[ -d $actual_cwd && $(cd "$actual_cwd" && pwd -P) == "$wt" ]] || fail cwd_mismatch 'Herdr pane cwd did not match the new worktree.'

# Validate Claude auth in the actual pane, since its shell environment may differ.
if [[ $kind == claude ]]; then
  stage=subscription_check
  printf -v auth_command 'claude auth status --json > %q 2> %q; printf done > %q' "$tmp/pane-auth.json" "$tmp/pane-auth.err" "$tmp/auth-done"
  herdr pane run "$pane" "$auth_command" > "$tmp/run.json" 2> "$tmp/error" || fail subscription_unknown 'Cannot verify subscription authentication in the actual pane.'
  for ((i=0; i<100; i++)); do [[ -f $tmp/auth-done ]] && break; sleep 0.1; done
  [[ -f $tmp/auth-done ]] || fail subscription_unknown 'Actual-pane authentication check timed out.'
  jq -e '.loggedIn==true and .authMethod=="claude.ai" and .apiProvider=="firstParty" and
    (.subscriptionType=="pro" or .subscriptionType=="max" or .subscriptionType=="team" or .subscriptionType=="enterprise")' "$tmp/pane-auth.json" >/dev/null || fail subscription_required 'Actual pane is not using Claude subscription authentication.'
fi
if [[ $qualify_startup == true ]]; then
  stage=startup_environment
  # Selected startup facts only; never dump credentials or the full environment.
  printf -v env_command 'printf "%%s" "${CODEX_HOME:-$HOME/.codex}" > %q; codex --version > %q; printf done > %q' \
    "$tmp/pane-home" "$tmp/pane-version" "$tmp/env-done"
  herdr pane run "$pane" "$env_command" > "$tmp/run.json" 2> "$tmp/error" ||
    fail startup_environment_unknown 'Cannot read the pane startup environment.'
  for ((i=0; i<100; i++)); do [[ -f $tmp/env-done ]] && break; sleep 0.1; done
  [[ -f $tmp/env-done && $(cat "$tmp/pane-version") == 'codex-cli 0.162.1' ]] ||
    fail unsupported_version 'Pane Codex version is unknown or unsupported.'
  log_home=$(cat "$tmp/pane-home")
  [[ $log_home == /* && $log_home != *$'\n'* && -d $log_home ]] ||
    fail log_home_unknown 'Pane startup log home is not an existing absolute directory.'
  log_home=$(cd "$log_home" && pwd -P)
  touch "$tmp/before-agent"
fi
stage=agent_start
agent_args=()
[[ -z $model ]] || agent_args+=(--model "$model")
if [[ $kind == codex ]]; then agent_args+=(--no-daemon); fi
if [[ $skip_update_check == true ]]; then agent_args+=(-c check_for_update_on_startup=false); fi
if [[ -n $effort ]]; then
  if [[ $kind == codex ]]; then agent_args+=(-c "model_reasoning_effort=\"$effort\"")
  else agent_args+=(--effort "$effort"); fi
fi
if ! herdr agent start "$agent_name" --kind "$kind" --pane "$pane" --timeout "$timeout_ms" -- ${agent_args[@]+"${agent_args[@]}"} > "$tmp/start.json" 2> "$tmp/error"; then
  upstream_code=$(jq -r '.error.code | select(type=="string" and test("^[a-z_]{1,80}$"))' "$tmp/error" 2>/dev/null) || upstream_code=
  fail agent_start_unconfirmed 'Agent is blocked, failed, or startup is uncertain. Inspect this same pane; do not launch a replacement blindly.'
fi
agent_info=$(jq -ec '.result.agent|select(type=="object")' "$tmp/start.json")
jq -e --arg pane "$pane" --arg kind "$kind" '.pane_id==$pane and .agent==$kind and (.agent_status=="idle" or .agent_status=="done")' <<<"$agent_info" >/dev/null || fail agent_identity_mismatch 'Agent readiness or identity was not confirmed.'
actual_cwd=$(jq -er '.foreground_cwd // .cwd' <<<"$agent_info")
[[ -d $actual_cwd && $(cd "$actual_cwd" && pwd -P) == "$wt" ]] || fail cwd_mismatch 'Running agent cwd differs from the new worktree.'
native_id=$(jq -r '.agent_session | select(.kind=="id") | .value // empty' <<<"$agent_info")
stage=agent_ready
if [[ $qualify_startup == true ]]; then
  stage=startup_qualification
  herdr pane process-info --pane "$pane" > "$tmp/process.json" 2> "$tmp/error" ||
    fail process_identity_pending 'Cannot observe the launched process in the returned pane.'
  expected_args=$(jq -nc --args '$ARGS.positional' -- ${agent_args[@]+"${agent_args[@]}"})
  process_candidate=$(jq -ec --arg cwd "$wt" --argjson args "$expected_args" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    [.result.process_info.foreground_processes[]? |
      select(.cwd==$cwd and (.argv[0]|split("/")[-1])=="codex")] |
    select(length==1) | .[0] |
    select((.pid|type=="number" and .>0 and floor==.) and .argv[1:]==$args) |
    {pid:.pid,cwd:.cwd,executable:.argv[0],observedArguments:$args,
      argumentsMatchLaunch:true,observedAt:$at}
    ' "$tmp/process.json") ||
    fail process_identity_mismatch 'Foreground process/cwd or arguments differ from this launch; inspect the same pane. Unexpected arguments are not copied into the receipt.'
  observed_process=$process_candidate
  marker="HANCHOU_STARTUP_$attempt"
  # No arbitrary prompt/mission interface: this single turn may acknowledge only.
  bootstrap="Act as this mission's sokkin under the exact companion instructions below.
This is startup qualification ONLY for mission $mission, attempt $attempt.
Your verified fresh cwd is $wt; pane $pane in local Herdr session $session.
Do not use tools, read files, start workers or perform real work. Native identity
and usage are pending. Reply once with the token $marker and wait for a qualified
mission assignment. These restrictions apply to this bootstrap despite the
ordinary execution workflow in the following instructions.

$(cat "$companion")"
  deadline=$((SECONDS + (10#$timeout_ms + 999) / 1000))
  if ! herdr agent prompt "$pane" "$bootstrap" --wait --timeout "$timeout_ms" > "$tmp/bootstrap.json" 2> "$tmp/error"; then
    fail bootstrap_unconfirmed 'Bootstrap submission/completion is uncertain; inspect the same attempt, never resend blindly.'
  fi
  # Fresh files only, then exact cwd/time/nonce/native metadata. Never choose the
  # latest global log or search a different home if a wrapper changed location.
  while [[ ! -d $log_home/sessions ]] && ((SECONDS < deadline)); do sleep 0.2; done
  [[ -d $log_home/sessions ]] || fail native_identity_pending 'No native sessions in the pane startup log home.'
  while :; do
  matched=0 native_log=
  while IFS= read -r -d '' candidate; do
    if jq -es --arg cwd "$wt" --arg at "$started_at" --arg marker "$marker" '
      any(.[]; .type=="session_meta" and .payload.cwd==$cwd and
        .payload.model_provider=="openai" and (.payload.timestamp[0:19] >= $at[0:19])) and
      any(.[]; .type=="response_item" and .payload.role=="user" and
        any(.payload.content[]?; (.text // "" | contains($marker))))
      ' "$candidate" >/dev/null 2> "$tmp/candidate-error"; then
      matched=$((matched + 1)); native_log=$candidate
    elif [[ $? == 3 ]]; then
      cat "$tmp/candidate-error" >&2
      fail startup_parser_error 'Native candidate parser did not compile; inspect stderr.'
    fi
  done < <(find "$log_home/sessions" -type f -name '*.jsonl' -newer "$tmp/before-agent" -print0)
  [[ $matched == 0 ]] && ((SECONDS < deadline)) || break
  sleep 0.2
  done
  [[ $matched == 1 ]] || fail native_identity_pending 'Expected one fresh native log matching cwd, startup time and bootstrap token.'
  # Select only identity, context and cumulative counters; never return embedded
  # session instructions or transcripts. This is not a token aggregator.
  until jq -es --arg marker "$marker" --arg known "$native_id" --arg model "$model" --arg effort "$effort" '
    [.[]|select(.type=="session_meta")|.payload] as $meta |
    [.[]|select(.type=="turn_context")|.payload] as $ctx |
    [.[]|select(.type=="event_msg" and .payload.type=="task_started")|.payload] as $start |
    [.[]|select(.type=="event_msg" and .payload.type=="task_complete")|.payload] as $completed |
    [.[]|select(.type=="event_msg" and .payload.type=="token_count" and .payload.info!=null)|.payload.info.total_token_usage] as $counts |
    [.[]|select(.type=="response_item" and .payload.role=="assistant" and .payload.phase=="final_answer")|.payload] as $answers |
    select(($meta|length)==1 and $meta[0].cli_version=="0.162.1" and $meta[0].forked_from_id==null and
      ($meta[0].id|test("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")) and
      ($known=="" or $known==$meta[0].id) and ($ctx|length)==1 and
      ($model=="" or $model==$ctx[0].model) and ($effort=="" or $effort==$ctx[0].effort) and
      ($start|length)==1 and ($completed|length)==1 and $start[0].turn_id==$completed[0].turn_id and
      ($answers|length)==1 and any($answers[0].content[]?; (.text // "" | contains($marker))) and
      (all(.[]; .type!="response_item" or .payload.type=="message" or .payload.type=="reasoning")) and
      ($counts|length)>0 and all($counts[]; .==$counts[-1]) and
      ($counts[-1] | [.input_tokens,.cached_input_tokens,.output_tokens,.reasoning_output_tokens,.total_tokens] |
        all(.[]; type=="number" and isfinite and .>=0 and floor==.)) and
      ($counts[-1] | .cached_input_tokens<=.input_tokens and .reasoning_output_tokens<=.output_tokens and
        .total_tokens==(.input_tokens+.output_tokens))) |
    {nativeId:$meta[0].id,model:$ctx[0].model,effort:$ctx[0].effort,
      nativeUsage:$counts[-1],cliVersion:$meta[0].cli_version,bootstrapToken:$marker}
    ' "$native_log" > "$tmp/native.json" 2> "$tmp/native-error"; do
    if [[ $? == 3 ]]; then
      cat "$tmp/native-error" >&2
      fail startup_parser_error 'Native evidence parser did not compile; inspect stderr, not the agent or bootstrap.'
    fi
    ((SECONDS < deadline)) ||
      fail bootstrap_evidence_mismatch 'Native bootstrap identity, completion, tool-free scope or observed configuration is unsupported.'
    sleep 0.2
  done
  native_id=$(jq -r .nativeId "$tmp/native.json")
  observed_model=$(jq -r '.model // empty' "$tmp/native.json")
  observed_effort=$(jq -r '.effort // empty' "$tmp/native.json")
  [[ -n $observed_model ]] || fail observed_model_unknown 'Native model is missing.'
  # Settle this one initial observation within the same startup deadline.
  while :; do
  ((SECONDS < deadline)) || fail usage_timeout 'Initial usage measurement exceeded the startup deadline.'
  env CODEX_HOME="$log_home" ccusage codex session --json --offline --no-cost --speed standard --id "$native_id" \
    > "$tmp/usage.json" 2> "$tmp/error" &
  usage_pid=$!
  while kill -0 "$usage_pid" 2>/dev/null && ((SECONDS < deadline)); do sleep 0.1; done
  if kill -0 "$usage_pid" 2>/dev/null; then
    stop_usage_helper
    fail usage_timeout 'Initial usage measurement did not settle within the startup deadline.'
  fi
  usage_rc=0
  wait "$usage_pid" || usage_rc=$?
  usage_pid=
  if [[ $usage_rc == 0 ]] && jq -e --slurpfile n "$tmp/native.json" --arg id "$native_id" --arg file "${native_log##*/}" '
    . as $u | $n[0].nativeUsage as $v |
    ([.inputTokens,.cacheReadTokens,.outputTokens,.reasoningOutputTokens,.cacheCreationTokens,.totalTokens] |
      all(.[]; type=="number" and isfinite and .>=0 and floor==.)) and
    (.sessionId|endswith("/"+($file|rtrimstr(".jsonl")))) and
    (.sessionFile==($file|rtrimstr(".jsonl"))) and
    (.sessionFile|endswith($id)) and
    (.models|keys)==[$n[0].model] and
    .totalTokens==$v.total_tokens and .inputTokens+.cacheReadTokens==$v.input_tokens and
    .cacheReadTokens==$v.cached_input_tokens and .outputTokens==$v.output_tokens and
    .reasoningOutputTokens==$v.reasoning_output_tokens and .cacheCreationTokens==0 and
    ($v.cache_write_input_tokens // 0)==0 and .totalTokens==(.inputTokens+.cacheReadTokens+.outputTokens)
    ' "$tmp/usage.json" >/dev/null 2> "$tmp/usage-error"; then
    break
  elif [[ $? == 3 ]]; then
    cat "$tmp/usage-error" >&2
    fail startup_parser_error 'Usage reconciliation parser did not compile; inspect stderr.'
  fi
  ((SECONDS < deadline)) || fail usage_mismatch 'Initial ccusage/native counters or session scope do not reconcile.'
  sleep 0.2
  done
  usage_readiness=$(jq -nc --slurpfile n "$tmp/native.json" --slurpfile u "$tmp/usage.json" \
    --arg home "$log_home" --arg log "$native_log" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg jqPath "$(command -v jq)" --arg jqVersion "$(jq --version)" \
    '{status:"ready",boundary:"settled tool-free startup only; recheck before later work",
      observedAt:$at,nativeId:$n[0].nativeId,nativeLog:$log,logHome:$home,
      logHomeEvidence:"pane startup environment corroborated by fresh cwd/time/bootstrap native log",
      cliVersion:$n[0].cliVersion,toolVersion:"20.0.37",parser:{path:$jqPath,version:$jqVersion},nativeUsage:$n[0].nativeUsage,
      tool:$u[0],includedChildren:[],scope:"fresh nonforked session cumulative including bootstrap"}')
  stage=startup_qualified
fi
receipt true
