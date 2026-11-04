#!/usr/bin/env bash
# One-shot Herdr launch/lifecycle. No mission dispatch; JSON receipts on stdout.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: launch-sokkin.sh --project PATH --mission SLUG [options]
       launch-sokkin.sh --project PATH --lifecycle bind|inspect|finish|accept|resume|reap
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
  --manual-approvals     Codex 0.163.0 only; qualified workspace-write/on-request/user
  --qualify-startup      Codex 0.162.1/0.163.0: native identity bootstrap
  --claude-peer PATH     Explicit local Claude peer readiness evidence (see native-receive.md)
  --claude-settings PATH Explicit per-launch Claude settings; never installed or trusted here
  --compact-receipt      Owned launch: brief JSON with preserved full receipt reference
  --help                 Show this help without contacting Herdr

Requires Bash 3.2+, Git, jq, Herdr (tested: 0.9.5) and the official agent CLI.
By default create an owned named server and a private .hanchou/instances record.
Owned launches also preserve their full launch receipt in that instance directory.
Compact output needs that evidence; early failures and shared launches stay full.
With --session select an already-running shared server. HERDR_BIN names its CLI.
bind confirms late native identity against the original process and public evidence before work.
finish saves a bound result; accept saves independent verification after agent exit; resume clears
completion; reap closes accepted FINISHED instances >=24h old when called.
inspect observes one explicit RUNNING/FINISHED instance without changing it;
it requires preserved launch identity and does not certify usage or acceptance.
No worktree, branch, session history or record is deleted by reap.
Default success means agent readiness only. Opt-in startup qualification returns
native identity evidence, never mission completion. Usage is external debug only.
Blocked/uncertain starts preserve resources and return their identity. Do not
blindly rerun: inspect the returned workspace/pane and original attempt first.
Owned STARTING/UNKNOWN records cannot be promoted by manual bootstrap or resume;
preserve the failure and withhold real work. A new attempt needs a separate decision.
HELP
}
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"version":2,"ok":false,"stage":"preflight","error":{"code":"missing_jq"},"resources":[],"receiptFormat":"full","evidence":null}'
  exit 1
fi

project= mission= session= config_path= base=HEAD model_override= agent_override= effort_override=
worktree_root= timeout_ms=30000 tmp= wt= branch= base_commit= actual_head= attempt=
workspace= tab= pane= agent_name= native_id= kind= actual_cwd=
stage=preflight error_code=unexpected_failure error_message='Launch did not finish.'
upstream_code=
effective='{}' agent_info='{}' resources='[]' emitted=false
source_snapshot=null skip_update_check=false
compact_receipt=false launch_evidence=null
manual_approvals=false observed_permissions=null
qualify_startup=false identity_readiness='{"status":"pending","reason":"Verify native identity and effective settings before real work."}'
usage_readiness='{"status":"not_required","reason":"External debug only; never an operational gate."}'
observed_model= observed_effort= log_home=
observed_process=null
peer_file= claude_settings= expected_native= peer_binding=null
receive='{"route":"herdr","status":"host_observation"}'
request_id=
started_at=
herdr_bin=${HERDR_BIN:-herdr}
lifecycle= instance= evidence= instance_dir= record= lifecycle_lock= instances=
server_pid= server_birth= server_socket= server_inode= state= inventory=
owned=false

receipt() {
  local ok=$1 lifecycle_status= body
  if [[ $lifecycle == inspect ]]; then
    jq -nc --arg at "$started_at" --arg id "$instance" --arg record "$record" \
      --arg code "$error_code" --arg message "$error_message" \
      '{version:1,operation:"inspect",ok:false,observedAt:$at,instanceKey:$id,
        record:$record,observation:null,error:{code:$code,message:$message}}'
    emitted=true; return
  fi
  if [[ $owned == true && -n $record && -f $record ]]; then
    state=$(jq -c --arg status "$(if [[ $ok == true ]]; then printf RUNNING; else printf UNKNOWN; fi)" \
      --arg workspace "$workspace" --arg pane "$pane" --arg path "$wt" --arg branch "$branch" \
      --arg native "$native_id" --argjson process "$observed_process" --argjson receive "$receive" --argjson resources "$resources" '.nativeId=(if $native=="" then null else $native end) | .status=$status | .workspaceId=$workspace | .paneId=$pane |
        .worktree={path:$path,branch:$branch} | .resources=$resources | .process=$process | .receive=$receive' "$record")
    state_write "$state" || return 1
    lifecycle_status=$(jq -r .status <<<"$state")
  fi
  body=$(jq -n --argjson ok "$ok" --arg stage "$stage" --arg mission "$mission" \
    --arg attempt "$attempt" --arg request "$request_id" --argjson receive "$receive" --arg config "$config_path" --argjson effective "$effective" \
    --arg project "$project" --arg path "$wt" --arg branch "$branch" --arg base "$base_commit" --arg head "$actual_head" \
    --arg session "$session" --arg workspace "$workspace" --arg tab "$tab" --arg pane "$pane" \
    --arg agent "$kind" --arg name "$agent_name" --arg native "$native_id" \
    --arg started "$started_at" --argjson snapshot "$source_snapshot" --argjson skipUpdate "$skip_update_check" \
    --argjson manualApprovals "$manual_approvals" --argjson permissions "$observed_permissions" \
    --arg observedModel "$observed_model" --arg observedEffort "$observed_effort" --argjson usage "$usage_readiness" \
    --argjson identity "$identity_readiness" --argjson process "$observed_process" --arg record "$record" --arg instance "$instance" --argjson owned "$owned" \
    --arg lifecycleStatus "$lifecycle_status" \
    --arg code "$error_code" --arg upstream "$upstream_code" --arg message "$error_message" --argjson resources "$resources" '
    def optional: if . == "" then null else . end;
    {version:2,ok:$ok,stage:$stage,startedAt:($started|optional),sourceSnapshot:$snapshot,
     missionId:($mission|optional),attemptId:($attempt|optional),requestId:($request|optional),receive:$receive,
     config:{source:($config|optional),effective:$effective},
     worktree:{repository:($project|optional),path:($path|optional),branch:($branch|optional),
       baseCommit:($base|optional),head:($head|optional)},
     lifecycle:{owned:$owned,instanceKey:($instance|optional),record:($record|optional),status:($lifecycleStatus|optional)},
     herdr:{host:"local",session:($session|optional),workspaceId:($workspace|optional),
       tabId:($tab|optional),paneId:($pane|optional)},
     sokkin:{agent:($agent|optional),name:($name|optional),requestedModel:($effective.sokkin.model // null),
       observedModel:($observedModel|optional),requestedEffort:($effective.sokkin.effort // null),observedEffort:($observedEffort|optional),
       requestedSkipUpdateCheck:$skipUpdate,
       requestedManualApprovals:$manualApprovals,observedPermissions:$permissions,
       process:$process,
       nativeThreadId:(if $agent=="codex" then ($native|optional) else null end),
       nativeSessionId:(if $agent=="claude" then ($native|optional) else null end)},
     identityReadiness:$identity,usageReadiness:$usage,
     error:(if $ok then null else {code:$code,upstreamCode:($upstream|optional),message:$message} end),resources:$resources}') || return 1
  if [[ $owned == true ]]; then
    if ! preserve_launch_receipt "$body"; then
      # Evidence is part of the launch contract. Never emit a qualified success
      # or replace an existing file when preservation fails. Keep this attempt.
      state=$(jq -c '.status="UNKNOWN"' <<<"$state")
      state_write "$state" || true
      jq --arg path "$instance_dir/launch/receipt.json" '
        .ok=false | .lifecycle.status="UNKNOWN" |
        .identityReadiness.status="unavailable" |
        .error={code:"launch_evidence_failed",message:"Full launch evidence could not be preserved; retain this attempt and withhold real work.",
          path:$path,launchError:.error} | .receiptFormat="full" | .evidence=null' <<<"$body"
      emitted=true
      return 1
    fi
  fi
  if [[ $compact_receipt == true && $launch_evidence != null ]]; then
    jq -c --argjson evidence "$launch_evidence" '
      {version,receiptFormat:"compact",ok,stage,startedAt,missionId,attemptId,requestId,receive,
       config,worktree,herdr,lifecycle,
       sokkin:(.sokkin | {agent,name,requestedModel,observedModel,requestedEffort,observedEffort,
         requestedSkipUpdateCheck,requestedManualApprovals,observedPermissions,nativeThreadId,nativeSessionId,
         process:(if .process==null then null else (.process|{pid,birth,cwd,argumentsMatchLaunch,observedAt}) end)}),
       identityReadiness,usageReadiness,
       error,resources,evidence:$evidence}' <<<"$body"
  else
    jq --argjson evidence "$launch_evidence" '. + {receiptFormat:"full",evidence:$evidence}' <<<"$body"
  fi
  emitted=true
}
preserve_launch_receipt() {
  # This is one immutable launch result, not a log collector or usage ledger.
  # Do not copy tmp wholesale: auth replies, environment and native text stay out.
  local body=$1 digest
  [[ -d $instance_dir && ! -L $instance_dir && -f $record && ! -L $record ]] || return 1
  (LC_ALL=C; [[ ${#body} -le 65536 ]]) || return 1
  mkdir -- "$instance_dir/launch" || return 1
  (set -C; printf '%s\n' "$body" > "$instance_dir/launch/.receipt-next") || return 1
  mv -- "$instance_dir/launch/.receipt-next" "$instance_dir/launch/receipt.json" || return 1
  digest=$(git hash-object "$instance_dir/launch/receipt.json") || return 1
  launch_evidence=$(jq -nc --arg path "$instance_dir/launch/receipt.json" --arg hash "$digest" \
    '{receipt:$path,hashKind:"git-blob",hash:$hash}') || return 1
}
finish() {
  local rc=$?
  trap - EXIT
  if [[ $emitted == false ]]; then receipt false || true; [[ $rc != 0 ]] || rc=1; fi
  [[ -z $lifecycle_lock ]] || rmdir "$lifecycle_lock"
  [[ -z $tmp ]] || rm -rf -- "$tmp"
  exit "$rc"
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
  local input=$record
  if [[ $lifecycle == inspect ]]; then
    [[ ! -e $instance_dir/lock && ! -L $instance_dir/lock ]] || fail instance_busy 'Instance is locked; retain it and inspect the original operation.'
    [[ $(wc -c < "$record") -le 65536 ]] || fail invalid_record 'Instance record exceeds the observation limit.'
    cp -- "$record" "$tmp/record.json"
    input="$tmp/record.json"
  else
    mkdir "$instance_dir/lock" 2>/dev/null || fail instance_busy 'Instance is locked; inspect the original operation, never steal its lock.'
    lifecycle_lock="$instance_dir/lock"
  fi
  state=$(jq -ces 'if length==1 then .[0] else error("multiple records") end' "$input") || fail invalid_record 'Invalid instance JSON.'
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
  if [[ $lifecycle == inspect ]]; then
    inspect_read "$tmp/server.json" status --json || return 1
  else
    herdr status --json > "$tmp/server.json" 2> "$tmp/error" || return 1
  fi
  socket=$(jq -r '.server.socket // empty' <<<"$state")
  jq -e --arg session "$session" --arg socket "$socket" '
    .server.running==true and .server.compatible==true and .server.session==$session and .server.socket==$socket
  ' "$tmp/server.json" >/dev/null || return 1
  [[ -S $socket && $(ls -di "$socket" | awk '{print $1}') == "$(jq -r .server.socketInode <<<"$state")" ]]
}
check_parent_peer() {
  local peer_session peer_pane pid birth
  peer_session=$(jq -r .herdr.session <<<"$peer_binding"); peer_pane=$(jq -r .herdr.paneId <<<"$peer_binding")
  command "$herdr_bin" --session "$peer_session" pane get "$peer_pane" > "$tmp/parent-pane.json" 2> "$tmp/error" ||
    fail invalid_peer 'Cannot read the explicit parent Claude pane.'
  command "$herdr_bin" --session "$peer_session" pane process-info --pane "$peer_pane" > "$tmp/parent-process.json" 2> "$tmp/error" ||
    fail invalid_peer 'Cannot read the explicit parent process.'
  jq -e --argjson p "$peer_binding" '.result.pane | .agent=="claude" and .pane_id==$p.herdr.paneId and
    (.foreground_cwd // .cwd)==$p.cwd and .agent_session.source=="herdr:claude" and
    .agent_session.kind=="id" and .agent_session.value==$p.nativeId' "$tmp/parent-pane.json" >/dev/null ||
    fail invalid_peer 'Parent pane/native identity differs; arbitrary hosts are not Claude peers.'
  jq -e --argjson p "$peer_binding" '
    [.result.process_info.foreground_processes[]? | select(.pid==$p.process.pid and .cwd==$p.cwd)] |
    length==1 and (.[0] | (.argv | index("--session-id")) as $id |
      (.argv | index("--name")) as $name | (.argv | index("--permission-mode")) as $mode |
      $id!=null and $name!=null and $mode!=null and
      ([.argv[]|select(.=="--permission-mode")]|length)==1 and
      all(.argv[]; startswith("--permission-mode=")|not) and .argv[$id+1]==$p.nativeId and
      .argv[$name+1]==$p.name and .argv[$mode+1]=="manual" and
      all(.argv[]; .!="--dangerously-skip-permissions" and .!="--allow-dangerously-skip-permissions"))
  ' "$tmp/parent-process.json" >/dev/null || fail invalid_peer 'Parent process lacks the qualified root identity/manual permission binding.'
  pid=$(jq -r .process.pid <<<"$peer_binding"); birth=$(jq -r .process.birth <<<"$peer_binding")
  [[ $(process_birth "$pid") == "$birth" ]] || fail invalid_peer 'Parent process exited or restarted; refresh its native peer identity.'
}
idle_pane_shell() {
  jq -er '.result.process_info | select(.shell_pid|type=="number" and .>0 and floor==.) |
    select((.foreground_processes|type=="array" and length==1) and .foreground_processes[0].pid==.shell_pid) |
    select(.foreground_processes[0] |
      (.name|IN("sh","bash","zsh","dash","ksh","fish")) and
      (.argv|type=="array" and length>0 and all(.[1:][]; IN("-l","-i","-il","-li","--login","--noprofile","--norc")))) |
    .shell_pid' "$1"
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
    shell=$(idle_pane_shell "$tmp/process-info.json") || return 1
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
inspect_read() {
  # Only the fixed read-only Herdr calls below use this bounded temporary output.
  local output=$1; shift
  (ulimit -f 512 && herdr "$@") > "$output" 2> "$tmp/error" || return 1
  [[ $(wc -c < "$output") -le 262144 ]]
}
inspect_evidence() {
  local name=$1 expected=$2
  [[ -f $instance_dir/$name && ! -L $instance_dir/$name ]] || fail missing_evidence 'Preserved lifecycle evidence is missing or unsafe.'
  [[ $(git hash-object "$instance_dir/$name") == "$expected" ]] || fail changed_evidence 'Preserved lifecycle evidence changed.'
}
verify_identity_binding() {
  [[ $(jq -r '.identityBinding // null' <<<"$state") != null ]] || return 0
  [[ -d $instance_dir/identity && ! -L $instance_dir/identity ]] || fail missing_evidence 'Identity binding directory is missing or unsafe.'
  [[ -d $instance_dir/launch && ! -L $instance_dir/launch && -f $instance_dir/launch/receipt.json && ! -L $instance_dir/launch/receipt.json ]] || fail missing_evidence 'Original launch evidence is missing or unsafe.'
  inspect_evidence identity/binding.json "$(jq -r .identityBinding.hash <<<"$state")"
  inspect_evidence identity/public-pane.json "$(jq -r .proof.paneHash "$instance_dir/identity/binding.json")"
  inspect_evidence identity/public-process.json "$(jq -r .proof.processHash "$instance_dir/identity/binding.json")"
  if [[ $(jq -r .identityBinding.source <<<"$state") == native-status ]]; then
    inspect_evidence identity/public-status.txt "$(jq -r .proof.statusHash "$instance_dir/identity/binding.json")"
  fi
  jq -e --argjson r "$state" --arg hash "$(git hash-object "$instance_dir/launch/receipt.json")" '
    .missionId==$r.missionId and .attemptId==$r.attemptId and .nativeId==$r.nativeId and
    .process==$r.process and .launchHash==$hash and .source==$r.identityBinding.source
  ' "$instance_dir/identity/binding.json" >/dev/null || fail instance_mismatch 'Preserved binding and launch/record disagree.'
}
check_instance_process() {
  local expected=$1 pid birth
  pid=$(jq -r .process.pid <<<"$state"); birth=$(jq -r .process.birth <<<"$state")
  [[ $pid =~ ^[0-9]+$ && -n $birth && $birth != null && $(process_birth "$pid") == "$birth" ]] || fail instance_mismatch 'Original agent exited or restarted; do not bind or finish a replacement.'
  inspect_read "$tmp/bind-process.json" pane process-info --pane "$(jq -r .paneId <<<"$state")" || fail observation_unavailable 'Current agent process is unavailable.'
  jq -e --argjson r "$state" '
    [.result.process_info.foreground_processes[]? | select(.pid==$r.process.pid and
      .cwd==$r.worktree.path and .argv==([$r.process.executable]+$r.process.observedArguments))] | length==1
  ' "$tmp/bind-process.json" >/dev/null || fail instance_mismatch 'Current process/pane/arguments differ from the original launch.'
  inspect_read "$tmp/bind-pane.json" pane get "$(jq -r .paneId <<<"$state")" || fail observation_unavailable 'Current native pane is unavailable.'
  jq -e --argjson r "$state" --arg id "$expected" --arg provider "$(jq -r .sokkin.agent "$instance_dir/launch/receipt.json")" '
    .result.pane | .pane_id==$r.paneId and .workspace_id==$r.workspaceId and .agent==$provider and
    (.foreground_cwd // .cwd)==$r.worktree.path and
    (if .agent_session==null then true else .agent_session.kind=="id" and .agent_session.value==$id end)
  ' "$tmp/bind-pane.json" >/dev/null || fail instance_mismatch 'Current pane/provider/native identity differs from the requested binding.'
}
bind_identity() {
  local launch="$instance_dir/launch/receipt.json" hash candidate source provider status_id binding status_hash=""
  jq -e '.status=="RUNNING" and .resultContract==2 and .identityBinding==null and .process!=null' <<<"$state" >/dev/null ||
    fail invalid_transition 'Bind one RUNNING attempt with its captured launch process, before assignment; never promote UNKNOWN or replace a binding.'
  [[ -d $instance_dir/launch && ! -L $instance_dir/launch && -f $launch && ! -L $launch && $(wc -c < "$launch") -le 65537 ]] || fail missing_evidence 'Binding needs the preserved original successful launch.'
  hash=$(git hash-object "$launch")
  jq -es --argjson r "$state" --arg record "$record" '
    length==1 and (.[0] | .ok==true and .lifecycle.owned==true and .lifecycle.status=="RUNNING" and
      .lifecycle.instanceKey==$r.instanceKey and .lifecycle.record==$record and
      .missionId==$r.missionId and .attemptId==$r.attemptId and .requestId==$r.requestId and
      .worktree.repository==$r.project and .worktree.path==$r.worktree.path and .worktree.branch==$r.worktree.branch and
      .herdr.session==$r.session and .herdr.workspaceId==$r.workspaceId and .herdr.paneId==$r.paneId and
      .sokkin.process==$r.process and (.sokkin.nativeThreadId // .sokkin.nativeSessionId)==$r.nativeId)
  ' "$launch" >/dev/null || fail instance_mismatch 'Launch evidence differs from the instance.'
  [[ -f $evidence && ! -L $evidence && $(wc -c < "$evidence") -le 32768 ]] || fail missing_evidence 'Provide one bounded identity observation JSON.'
  jq -es --argjson r "$state" --arg hash "$hash" --arg now "$started_at" '
    length==1 and (.[0] | .version==1 and .missionId==$r.missionId and .attemptId==$r.attemptId and
      .requestId==$r.requestId and .launchHash==$hash and
      (.nativeId|type=="string" and length>0 and length<=256 and test("^[^[:space:][:cntrl:]]+$")) and
      ($r.nativeId==null or .nativeId==$r.nativeId) and (.source=="herdr" or .source=="native-status") and
      (.observedAt|fromdateiso8601)>=($r.createdAt|fromdateiso8601) and
      (.observedAt|fromdateiso8601)>=($now|fromdateiso8601)-300 and
      (.observedAt|fromdateiso8601)<=($now|fromdateiso8601))
  ' "$evidence" >/dev/null || fail invalid_evidence 'Identity observation must be fresh and match this launch/request; a report self-assertion is not binding.'
  candidate=$(jq -r .nativeId "$evidence"); source=$(jq -r .source "$evidence"); provider=$(jq -r .sokkin.agent "$launch")
  [[ $(git --no-optional-locks -C "$(jq -r .worktree.path <<<"$state")" branch --show-current) == "$(jq -r .worktree.branch <<<"$state")" &&
     $(git --no-optional-locks -C "$(jq -r .worktree.path <<<"$state")" rev-parse HEAD) == "$(jq -r .worktree.head "$launch")" ]] || fail instance_mismatch 'Bind before assignment on the original branch and launch commit.'
  server_matches || fail instance_mismatch 'Original server is unavailable or changed.'
  check_instance_process "$candidate"
  if [[ $source == herdr ]]; then
    jq -e --arg id "$candidate" '.result.pane.agent_session | .kind=="id" and .value==$id' "$tmp/bind-pane.json" >/dev/null || fail native_identity_pending 'Public Herdr native metadata is still missing.'
  else
    # The caller opens the official /status UI before this one-shot read. Never
    # parse arbitrary transcript history, a task report, or a private peer socket.
    jq -e '.result.pane.scroll.offset_from_bottom==0' "$tmp/bind-pane.json" >/dev/null || fail native_identity_pending 'Use the current unscrolled official status UI, not historical output.'
    inspect_read "$tmp/bind-status.txt" pane read "$(jq -r .paneId <<<"$state")" --source visible --format text || fail observation_unavailable 'Cannot read current native status UI.'
    status_id=$(jq -Rser --arg provider "$provider" --arg cwd "$(jq -r .worktree.path <<<"$state")" --arg home "$HOME" '
      def field($key): [split("\n")[] | select(test("^ *"+$key+":")) | sub("^ *"+$key+": *";"") | sub(" *$";"")] | select(length==1) | .[0];
      def codex_status:
        # 0.164.0 FieldFormatter/content_lines: Directory is untruncated and its
        # continuations share the value column. Permissions is the next field.
        # Strip terminal right padding only; never guess whitespace lost at a wrap.
        split("\n") | map(sub(" +$";"")) | . as $rows |
        def row($key): [to_entries[] | select(.value|test("^ *"+$key+":")) | .key] | select(length==1) | .[0];
        row("Directory") as $d | row("Permissions") as $p | row("Session") as $s |
        select($d<$p and $p<$s) |
        select(any($rows[0:$d][]; .=="  >_ OpenAI Codex (v0.164.0)")) |
        ($rows[$d] | capture("^(?<label>  Directory: {2,})(?<value>[^ ].*)$")) as $first |
        ($first.label|length) as $column |
        ($rows[$p] | capture("^(?<label>  Permissions: {2,})(?<value>[^ ].*)$")) as $permissions |
        select(($permissions.label|length)==$column) |
        $rows[$d+1:$p] as $continuations |
        select(all($continuations[]; test("^ {"+($column|tostring)+"}[^ ]"))) |
        ([$first.value] + ($continuations|map(.[$column:])) | join("")) as $directory |
        select($directory|test("…|\\.\\.\\.|[[:cntrl:]]")|not) |
        select($directory==$cwd or
          (($cwd==$home or ($cwd|startswith($home+"/"))) and $directory==("~"+($cwd|ltrimstr($home))))) |
        ($rows[$s] | capture("^(?<label>  Session: {2,})(?<value>[^ ].*)$")) as $session |
        select(($session.label|length)==$column) |
        # A complete UUID must end its field, not prefix a clipped/wrapped value.
        select($rows[$s+1]!=null and ($rows[$s+1]=="" or ($rows[$s+1]|test("^  Forked from: {2,}[^ ]")))) |
        $session.value;
      . as $ui | if $provider=="claude" then
        select(field("Version")=="2.1.317" and field("Session kind")=="interactive" and field("cwd")==$cwd) | field("Session ID")
      elif $provider=="codex" then
        codex_status
      else empty end | select(test("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$"))
    ' "$tmp/bind-status.txt") || fail native_identity_pending 'Native status identity/cwd/qualified format is incomplete or ambiguous.'
    [[ $status_id == "$candidate" ]] || fail instance_mismatch 'Requested native ID differs from the live official status UI.'
  fi
  server_matches || fail instance_mismatch 'Server changed during identity observation.'
  check_instance_process "$candidate"
  [[ ! -e $instance_dir/identity && ! -L $instance_dir/identity ]] || fail changed_evidence 'Retain the previous identity attempt; never overwrite its evidence.'
  mkdir "$instance_dir/identity"
  cp -- "$tmp/bind-pane.json" "$instance_dir/identity/public-pane.json"
  cp -- "$tmp/bind-process.json" "$instance_dir/identity/public-process.json"
  [[ $source != native-status ]] || cp -- "$tmp/bind-status.txt" "$instance_dir/identity/public-status.txt"
  [[ $source != native-status ]] || status_hash=$(git hash-object "$instance_dir/identity/public-status.txt")
  binding=$(jq -nc --argjson r "$state" --arg id "$candidate" --arg source "$source" --arg hash "$hash" --arg at "$started_at" \
    --arg paneHash "$(git hash-object "$instance_dir/identity/public-pane.json")" --arg processHash "$(git hash-object "$instance_dir/identity/public-process.json")" --arg statusHash "$status_hash" '
    {version:1,missionId:$r.missionId,attemptId:$r.attemptId,requestId:$r.requestId,nativeId:$id,
     process:$r.process,source:$source,observedAt:$at,launchHash:$hash,
     proof:{paneHash:$paneHash,processHash:$processHash,statusHash:(if $statusHash=="" then null else $statusHash end)}}')
  printf '%s\n' "$binding" > "$instance_dir/identity/binding.json"
  state=$(jq -c --arg id "$candidate" --arg source "$source" --arg hash "$(git hash-object "$instance_dir/identity/binding.json")" --arg at "$started_at" '
    .nativeId=$id | .identityBinding={source:$source,hash:$hash,observedAt:$at}' <<<"$state")
}
inspect_instance() {
  local launch="$instance_dir/launch/receipt.json" launch_hash record_hash pane shell birth ids quiet=true
  [[ -z $evidence ]] || fail invalid_operation 'inspect has no evidence input; save its stdout in a caller-owned receipt.'
  jq -e --arg now "$started_at" '
    def text: type=="string" and length>0 and length<=4096 and (test("[[:cntrl:]]")|not);
    def epoch: . as $s | fromdateiso8601 as $t | if ($t|todateiso8601)==$s then $t else error("invalid UTC") end;
    (.status=="RUNNING" or .status=="FINISHED") and
    ([.missionId,.attemptId,.nativeId,.workspaceId,.paneId,.worktree.path,.worktree.branch,.server.birth,.server.socket,.server.socketInode]|all(.[];text)) and
    (.worktree.path|startswith("/")) and (.server.socket|startswith("/")) and
    (.server.pid|type=="number" and .>0 and floor==.) and .server.processGroup==.server.pid and
    (.createdAt|epoch)<=($now|epoch) and .closedAt==null and
    (if .status=="RUNNING" then .finishedAt==null and .acceptedAt==null
     else (.finishedAt|epoch)>=(.createdAt|epoch) and (.finishedAt|epoch)<=($now|epoch) and
       (.reportHash|text) and (if .acceptedAt==null then true else
         (.acceptedAt|epoch)>=(.finishedAt|epoch) and (.acceptedAt|epoch)<=($now|epoch) and (.acceptanceHash|text) end) end)
  ' <<<"$state" >/dev/null 2>&1 || fail invalid_record 'Observation requires a bound RUNNING/FINISHED instance and valid lifecycle timestamps.'
  [[ -d $instance_dir/launch && ! -L $instance_dir/launch && -f $launch && ! -L $launch && $(wc -c < "$launch") -le 65537 ]] ||
    fail missing_evidence 'Observation requires a preserved successful launch receipt for this instance.'
  cp -- "$launch" "$tmp/launch.json"
  launch_hash=$(git hash-object "$tmp/launch.json"); record_hash=$(git hash-object "$tmp/record.json")
  jq -es --argjson r "$state" --arg record "$record" '
    length==1 and (.[0] | .ok==true and .missionId==$r.missionId and .attemptId==$r.attemptId and
    .lifecycle.owned==true and .lifecycle.instanceKey==$r.instanceKey and .lifecycle.record==$record and .lifecycle.status=="RUNNING" and
    .worktree.repository==$r.project and .worktree.path==$r.worktree.path and .worktree.branch==$r.worktree.branch and
    .herdr.host=="local" and .herdr.session==$r.session and .herdr.workspaceId==$r.workspaceId and .herdr.paneId==$r.paneId and
    ((.sokkin.nativeThreadId // .sokkin.nativeSessionId)==$r.nativeId or
      ((.sokkin.nativeThreadId // .sokkin.nativeSessionId)==null and $r.identityBinding!=null)))
  ' "$tmp/launch.json" >/dev/null || fail instance_mismatch 'Instance and preserved launch identity disagree.'
  verify_identity_binding
  if [[ $(jq -r .status <<<"$state") == FINISHED ]]; then
    inspect_evidence report.txt "$(jq -r .reportHash <<<"$state")"
  fi
  if [[ $(jq -r .acceptedAt <<<"$state") != null ]]; then
    inspect_evidence acceptance.json "$(jq -r .acceptanceHash <<<"$state")"
  fi
  server_matches || fail instance_mismatch 'Server incarnation changed or cannot be verified.'
  [[ $(LC_ALL=C ps -p "$(jq -r .server.pid <<<"$state")" -o pgid= | tr -d '[:space:]') == "$(jq -r .server.processGroup <<<"$state")" ]] ||
    fail instance_mismatch 'Server process group changed.'
  inspect_read "$tmp/snapshot.json" api snapshot || fail observation_unavailable 'Cannot read a bounded owned server snapshot.'
  jq -e --argjson r "$state" '
    def id: type=="string" and length>0 and length<=256 and test("^[^[:space:][:cntrl:]]+$");
    .result.snapshot as $s | $s |
    (.panes|type=="array" and length>0 and length<=32 and
      all(.[]; (.pane_id|id) and (.workspace_id|id)) and (map(.pane_id)|length==(unique|length)) and
      any(.[]; .pane_id==$r.paneId and .workspace_id==$r.workspaceId)) and
    (.agents|type=="array" and length<=32 and (map(.pane_id)|length==(unique|length)) and
      (map(.agent_session.value)|length==(unique|length)) and
      all(.[]; . as $a | (.agent_status|IN("idle","working","blocked","done")) and
        .agent_session.kind=="id" and (.agent_session.value|id) and
        (if .pane_id==$r.paneId then .agent_session.value==$r.nativeId else true end) and
        any($s.panes[]; .pane_id==$a.pane_id and .workspace_id==$a.workspace_id)))
  ' "$tmp/snapshot.json" >/dev/null || fail observation_unavailable 'Unknown agent state, pane identity or oversized inventory.'
  : > "$tmp/panes.jsonl"
  while IFS= read -r pane; do
    inspect_read "$tmp/process-info.json" pane process-info --pane "$pane" || fail observation_unavailable 'Cannot inspect an owned pane.'
    jq -e --arg pane "$pane" '
      def pid: type=="number" and .>0 and floor==.;
      .result.process_info | .pane_id==$pane and (.shell_pid|pid) and
      (.foreground_processes|type=="array" and length>0 and length<=64 and
        all(.[]; (.pid|pid) and (.name|type=="string" and length>0) and
          (.argv|type=="array" and length>0 and all(.[];type=="string")) and
          (.cwd|type=="string" and startswith("/") and length<=4096 and (test("[[:cntrl:]]")|not))) and
        (map(.pid)|length==(unique|length)))
    ' "$tmp/process-info.json" >/dev/null || fail observation_unavailable 'Owned pane process identity is incomplete.'
    shell=$(jq -r .result.process_info.shell_pid "$tmp/process-info.json")
    birth=$(process_birth "$shell"); [[ -n $birth ]] || fail observation_unavailable 'Owned pane shell disappeared.'
    jq -e '.result.process_info | .shell_pid as $pid |
      all(.foreground_processes[]; .pid!=$pid or (.name|IN("sh","bash","zsh","dash","ksh","fish")))' \
      "$tmp/process-info.json" >/dev/null || fail observation_unavailable 'Unknown owned pane shell kind.'
    if idle_pane_shell "$tmp/process-info.json" >/dev/null; then quiet=true; else quiet=false; fi
    jq -nc --arg pane "$pane" --argjson pid "$shell" --arg birth "$birth" --argjson idle "$quiet" \
      --slurpfile p "$tmp/process-info.json" '{pane:$pane,pid:$pid,birth:$birth,idleShell:$idle,
        foreground:[$p[0].result.process_info.foreground_processes[]|{pid,cwd}]}' >> "$tmp/panes.jsonl"
  done < <(jq -r '.result.snapshot.panes[].pane_id' "$tmp/snapshot.json")
  ps -axo pid=,ppid= > "$tmp/process-tree" || fail observation_unavailable 'Process topology is unavailable.'
  [[ $(wc -c < "$tmp/process-tree") -le 4194304 ]] || fail observation_unavailable 'Process topology exceeds the observation limit.'
  jq -Rn --argjson root "$(jq -r .server.pid <<<"$state")" '
    [inputs | if test("^ *[0-9]+ +[0-9]+ *$") then
      capture("^ *(?<pid>[0-9]+) +(?<ppid>[0-9]+) *$") | {pid:(.pid|tonumber),ppid:(.ppid|tonumber)}
      else error("invalid process row") end] as $all |
    if ($all|map(.pid)|length!=(unique|length)) or (any($all[]; .pid==$root)|not) then error("invalid PID inventory") else
      def descendants($p;$depth): if $depth>64 then error("process depth") else
        $all[] | select(.ppid==$p) | ., descendants(.pid;$depth+1) end;
      [descendants($root;0)] | if length>256 then error("process limit") else sort_by(.pid) end end
  ' < "$tmp/process-tree" > "$tmp/owned.json" || fail observation_unavailable 'Owned process topology is invalid or oversized.'
  ids=$(jq -r 'map(.pid|tostring)|join(",")' "$tmp/owned.json")
  [[ -n $ids ]] || fail observation_unavailable 'Owned pane processes are missing.'
  LC_ALL=C ps -p "$ids" -o pid=,lstart= > "$tmp/births" || fail observation_unavailable 'Owned process identities disappeared.'
  jq -Rn '[inputs | capture("^ *(?<pid>[0-9]+) +(?<birth>[^ ].*[^ ]) *$") | {pid:(.pid|tonumber),birth:.birth}] | sort_by(.pid)' \
    < "$tmp/births" > "$tmp/births.json" || fail observation_unavailable 'Owned process birth times are unavailable.'
  jq -e --slurpfile panes "$tmp/panes.jsonl" --slurpfile births "$tmp/births.json" '
    . as $owned | (map(.pid)==($births[0]|map(.pid))) and
    ($panes|map(.pid)|length==(unique|length)) and
    all($panes[]; . as $p | any($births[0][]; .pid==$p.pid and .birth==$p.birth) and
      all(.foreground[]; .pid as $pid | any($owned[]; .pid==$pid)))
  ' "$tmp/owned.json" >/dev/null || fail observation_unavailable 'Pane and owned process identities disagree.'
  quiet=$(jq -n --slurpfile panes "$tmp/panes.jsonl" --slurpfile owned "$tmp/owned.json" --slurpfile snap "$tmp/snapshot.json" '
    ($snap[0].result.snapshot.agents|length==0) and all($panes[]; .idleShell) and
    (($panes|map(.pid)|sort)==($owned[0]|map(.pid)|sort))')
  # Recheck evidence and incarnation. This observation is never an acceptance ticket.
  server_matches || fail instance_mismatch 'Server incarnation changed during observation.'
  [[ ! -e $instance_dir/lock && ! -L $instance_dir/lock && ! -L $project/.hanchou && ! -L $instances && ! -L $instance_dir && ! -L $record && ! -L $instance_dir/launch && ! -L $launch ]] ||
    fail instance_changed 'Instance was locked or replaced during observation.'
  cmp -s "$record" "$tmp/record.json" && cmp -s "$launch" "$tmp/launch.json" || fail instance_changed 'Instance or launch evidence changed during observation.'
  if [[ $(jq -r .status <<<"$state") == FINISHED ]]; then inspect_evidence report.txt "$(jq -r .reportHash <<<"$state")"; fi
  if [[ $(jq -r .acceptedAt <<<"$state") != null ]]; then inspect_evidence acceptance.json "$(jq -r .acceptanceHash <<<"$state")"; fi
  jq -nc --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg since "$started_at" --arg record "$record" \
    --arg recordHash "$record_hash" --arg launch "$launch" --arg launchHash "$launch_hash" --argjson r "$state" \
    --argjson quiet "$quiet" --arg report "$instance_dir/report.txt" --slurpfile panes "$tmp/panes.jsonl" \
    --slurpfile births "$tmp/births.json" --slurpfile snap "$tmp/snapshot.json" '
    {version:1,operation:"inspect",ok:true,startedAt:$since,observedAt:$at,instanceKey:$r.instanceKey,
     record:$record,recordHash:$recordHash,hashKind:"git-blob",launch:{path:$launch,hash:$launchHash},
     observation:{missionId:$r.missionId,attemptId:$r.attemptId,nativeId:$r.nativeId,project:$r.project,host:$r.host,
       status:$r.status,createdAt:$r.createdAt,finishedAt:$r.finishedAt,acceptedAt:$r.acceptedAt,
       worktree:($r.worktree|{path,branch}),session:$r.session,workspaceId:$r.workspaceId,paneId:$r.paneId,
       server:($r.server|{pid,birth,processGroup,socket,socketInode}),
       report:(if $r.status=="FINISHED" then {path:$report,hash:$r.reportHash,matches:true} else null end),
       quiet:$quiet,panes:$panes,agents:[$snap[0].result.snapshot.agents[]|
         {paneId:.pane_id,nativeId:.agent_session.value,status:.agent_status}],
       processes:$births[0]},error:null}'
  emitted=true; exit 0
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
  if [[ $lifecycle == inspect ]]; then inspect_instance; fi
  case $lifecycle in
    bind) bind_identity;;
    finish)
      [[ $(jq -r .status <<<"$state") == RUNNING ]] || fail invalid_transition 'Only RUNNING can become FINISHED.'
      [[ -f $evidence && -s $evidence && ! -L $evidence ]] || fail missing_evidence 'Provide the preserved completion report.'
      [[ ( -z ${HANCHOU_INSTANCE_KEY:-} || $HANCHOU_INSTANCE_KEY == "$instance" ) &&
         ( -z ${HANCHOU_INSTANCE_RECORD:-} || $HANCHOU_INSTANCE_RECORD == "$record" ) &&
         ( -z ${HANCHOU_MISSION_ID:-} || $HANCHOU_MISSION_ID == "$(jq -r .missionId <<<"$state")" ) &&
         ( -z ${HANCHOU_ATTEMPT_ID:-} || $HANCHOU_ATTEMPT_ID == "$(jq -r .attemptId <<<"$state")" ) ]] ||
        fail instance_mismatch 'Completion instance or mission differs from the calling pane.'
      server_matches || fail instance_mismatch 'Server incarnation changed or cannot be verified.'
      verify_identity_binding
      if [[ $(jq -r '.identityBinding // null' <<<"$state") != null ]]; then check_instance_process "$(jq -r .nativeId <<<"$state")"; fi
      if [[ $(jq -r '.resultContract // 1' <<<"$state") == 2 ]]; then
        jq -es --argjson r "$state" '
          def text: type=="string" and length>0 and length<=4096 and (test("[[:cntrl:]]")|not);
          def refs: type=="array" and length>0 and all(.[];text);
          length==1 and (.[0] | .missionId==$r.missionId and .attemptId==$r.attemptId and
            ($r.nativeId|text) and .nativeId==$r.nativeId and .requestId==$r.requestId and
            .status=="succeeded" and (.artifactRefs|refs) and (.verificationRefs|refs) and
            .authority.approved==true and (.authority.source|text) and (.authority.scope|text) and
            (if $r.receive.route=="claude-peer" then
              .receive.parentPeer==$r.receive.parent.peer and
              (.receive.childPeer|type=="string" and startswith($r.receive.childName+" [") and test(" \\[([0-9a-f]{6})\\]$")) and
              .receive.process==$r.process and .receive.nativeId==$r.nativeId
             else true end))
        ' "$evidence" >/dev/null || fail invalid_evidence 'Completion needs this request/native identity, authority, successful result and verification references; notices alone are not results.'
        if [[ $(jq -r '.receive.route' <<<"$state") == claude-peer ]]; then
          peer_binding=$(jq -c .receive.parent <<<"$state"); check_parent_peer
          [[ $(process_birth "$(jq -r .process.pid <<<"$state")") == "$(jq -r .process.birth <<<"$state")" ]] || fail instance_mismatch 'Child exited or restarted before finish.'
          herdr pane get "$(jq -r .paneId <<<"$state")" > "$tmp/child-pane.json" 2> "$tmp/error" || fail instance_mismatch 'Child native identity unavailable.'
          jq -e --argjson r "$state" '.result.pane | .agent=="claude" and .agent_session.source=="herdr:claude" and
            .agent_session.value==$r.nativeId and .pane_id==$r.paneId' "$tmp/child-pane.json" >/dev/null || fail instance_mismatch 'Child native identity changed.'
          herdr pane process-info --pane "$(jq -r .paneId <<<"$state")" > "$tmp/child-process.json" 2> "$tmp/error" || fail instance_mismatch 'Child process is unavailable.'
          jq -e --argjson p "$(jq -c .process <<<"$state")" '
            [.result.process_info.foreground_processes[]? | select(.pid==$p.pid and .cwd==$p.cwd and
              .argv==([$p.executable]+$p.observedArguments))] | length==1' "$tmp/child-process.json" >/dev/null ||
            fail instance_mismatch 'Current child process/pane differs from launch.'
        fi
      fi
      cp -- "$evidence" "$instance_dir/.report-next"
      mv -- "$instance_dir/.report-next" "$instance_dir/report.txt"
      completion_peer=$(jq -r '.receive.childPeer // empty' "$instance_dir/report.txt" 2>/dev/null || true)
      state=$(jq -c --arg peer "$completion_peer" --arg at "$started_at" --arg hash "$(git hash-object "$instance_dir/report.txt")" '
        .completionPeer=$peer | .status="FINISHED" | .finishedAt=$at | .acceptedAt=null | .acceptedInventory=null | .reportHash=$hash' <<<"$state")
      ;;
    resume)
      jq -e '.status=="FINISHED" and .acceptedAt==null' <<<"$state" >/dev/null || fail invalid_transition 'Resume only before acceptance/CLI exit; otherwise launch a fresh attempt.'
      server_matches || fail instance_mismatch 'Server incarnation changed or cannot be verified.'
      state=$(jq -c --arg request "HANCHOU_REQUEST_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" '.status="RUNNING" | .finishedAt=null | .acceptedAt=null | .acceptedInventory=null | .acceptanceHash=null | .completionPeer=null | .requestId=$request' <<<"$state")
      ;;
    accept)
      jq -e '.status=="FINISHED" and .acceptedAt==null' <<<"$state" >/dev/null || fail invalid_transition 'Accept an unaccepted FINISHED instance only.'
      [[ -f $evidence && ! -L $evidence ]] || fail missing_evidence 'Provide the independent result acceptance receipt.'
      verify_identity_binding
      jq -es --argjson record "$state" '
        def text: type=="string" and length>0 and length<=4096 and (test("[[:cntrl:]]")|not);
        def refs: type=="array" and length>0 and all(.[];text);
        length==1 and (.[0] |
          .missionId==$record.missionId and .attemptId==$record.attemptId and
          ($record.nativeId|text) and .nativeId==$record.nativeId and
          .artifactsPreserved==true and .workersStopped==true and
          .result.status=="succeeded" and .result.reportHash==$record.reportHash and
          (.result.artifactRefs|refs) and (.result.verificationRefs|refs) and
          .authority.approved==true and (.authority.source|text) and (.authority.scope|text) and
          .independentAcceptance==true and
          (if $record.resultContract==2 then .requestId==$record.requestId else true end) and
          (if .notification!=null then $record.receive.route=="claude-peer" and .notification.kind=="idle" and
            ($record.completionPeer|text) and .notification.childPeer==$record.completionPeer and
            .notification.requestId==$record.requestId and .notification.nativeId==$record.nativeId and
            .notification.process==$record.process and (.notification.receiptId|text) and
            .notification.parentPeer==$record.receive.parent.peer
           else true end))
      ' "$evidence" >/dev/null || fail invalid_evidence 'Acceptance requires matching native identity, authority, preserved result and independent verification; usage is optional debug data.'
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
      verify_identity_binding
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
    *) fail invalid_operation 'Lifecycle operation must be bind, inspect, finish, accept, resume or reap.';;
  esac
  state_write "$state"
  jq -nc --arg id "$instance" --arg record "$record" --arg status "$(jq -r .status <<<"$state")" --arg request "$(jq -r ' .requestId // empty' <<<"$state")" --argjson state "$state" '{ok:true,instanceKey:$id,record:$record,status:$status,requestId:$request,nativeId:$state.nativeId,identityBinding:$state.identityBinding}'
  emitted=true; exit 0
}

while [[ $# -gt 0 ]]; do
  if [[ $1 == --skip-update-check ]]; then skip_update_check=true; shift; continue; fi
  if [[ $1 == --manual-approvals ]]; then manual_approvals=true; shift; continue; fi
  if [[ $1 == --qualify-startup ]]; then qualify_startup=true; shift; continue; fi
  if [[ $1 == --compact-receipt ]]; then compact_receipt=true; shift; continue; fi
  need_value "$@"
  case $1 in
    --lifecycle) lifecycle=$2;; --instance) instance=$2;; --evidence) evidence=$2;;
    --project) project=$2;; --mission) mission=$2;; --session) session=$2;;
    --config) config_path=$2;; --base) base=$2;; --agent) agent_override=$2;;
    --claude-peer) peer_file=$2;; --claude-settings) claude_settings=$2;;
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
  [[ -z $mission && -z $session && -z $config_path && -z $agent_override && -z $model_override && -z $effort_override && -z $worktree_root && $base == HEAD && $qualify_startup == false && $skip_update_check == false && $manual_approvals == false && $compact_receipt == false && -z $peer_file && -z $claude_settings ]] || fail invalid_operation 'Do not combine lifecycle and launch options.'
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
jq -e 'def language_tag:
    .==null or (type=="string" and length<=63 and test("^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*\\z"));
  type=="object" and .version==2 and (.sokkin|type=="object") and
  (.sokkin.agent=="codex" or .sokkin.agent=="claude") and
  (.sokkin.model==null or (.sokkin.model|type=="string")) and
  (.sokkin.effort==null or .sokkin.effort=="low" or .sokkin.effort=="medium" or .sokkin.effort=="high") and
  (.languages==null or (.languages|type=="object" and
    ((keys-["human","agents"]|length)==0) and (.human|language_tag) and (.agents|language_tag))) and
  ((keys-["version","sokkin","languages"]|length)==0) and
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
[[ $manual_approvals == false || ( $kind == codex && $qualify_startup == true ) ]] || fail unsupported_option 'Manual approvals require Codex and --qualify-startup.'
model=$(jq -r '.sokkin.model // empty' <<<"$effective")
effort=$(jq -r '.sokkin.effort // empty' <<<"$effective")
[[ -z $model || $model =~ ^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,99}$ ]] || fail invalid_model 'Model must be a native model identifier.'
command -v "$kind" >/dev/null 2>&1 || fail missing_agent 'The selected official agent CLI is not available.'
if [[ $qualify_startup == true ]]; then
  [[ $kind == codex ]] || fail unsupported_option 'Use --claude-peer for qualified Claude startup.'
  qualified_codex_version=$(codex --version)
  [[ $manual_approvals == false || $qualified_codex_version == 'codex-cli 0.163.0' ]] ||
    fail unsupported_version 'Manual approvals currently support Codex 0.163.0 only.'
  case $qualified_codex_version in
    'codex-cli 0.162.1'|'codex-cli 0.163.0') ;;
    *) fail unsupported_version 'Startup qualification requires Codex 0.162.1 or 0.163.0.';;
  esac
fi
herdr() { command "$herdr_bin" --session "$session" "$@"; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-launch.XXXXXX")
if [[ -n $claude_settings ]]; then
  [[ $kind == claude && $claude_settings == /* && -f $claude_settings && ! -L $claude_settings ]] ||
    fail unsupported_option 'Explicit settings require Claude and a readable absolute file.'
  jq -es --arg peer "$peer_file" 'length==1 and (.[0]|type=="object" and ($peer=="" or .crossSessionInbound==null or .crossSessionInbound=="accept"))' "$claude_settings" >/dev/null || fail invalid_config 'Explicit Claude settings must be valid and permit inbound messages when peer receive is selected.'
fi
if [[ -n $peer_file ]]; then
  [[ $kind == claude && $qualify_startup == false ]] || fail unsupported_option 'Claude peer receive requires a Claude child; it is not a Codex/Orca wake route.'
  [[ -f $peer_file && ! -L $peer_file && $(wc -c < "$peer_file") -le 32768 ]] || fail invalid_peer 'Missing or oversized parent peer evidence.'
  peer_binding=$(jq -ces --arg now "$started_at" '
    def text: type=="string" and length>0 and length<=4096 and (test("[[:cntrl:]]")|not);
    select(length==1) | .[0] | select(.version==1 and .host=="local" and .provider=="claude" and
      .cliVersion=="2.1.317" and .root==true and .sendMessage==true and .notifyWhenIdle==true and .inbound=="accept" and
      (.nativeId|test("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")) and
      ([.name,.peer,.herdr.session,.herdr.paneId,.cwd,.process.birth,.evidenceRef]|all(.[];text)) and
      (.process.pid|type=="number" and .>0 and floor==.) and
      (.observedAt|fromdateiso8601)<=($now|fromdateiso8601) and
      (.observedAt|fromdateiso8601)>=($now|fromdateiso8601)-300) |
      {version,host,provider,cliVersion,root,nativeId,name,peer,herdr:(.herdr|{session,paneId}),cwd,process:(.process|{pid,birth}),sendMessage,notifyWhenIdle,inbound,observedAt,evidenceRef}
  ' "$peer_file") || fail invalid_peer 'Parent must be a freshly evidenced local Claude root with SendMessage, notify_when_idle and allowed inbound delivery.'
  jq -e '. as $p | .peer | startswith($p.name+" [") and test(" \\[([0-9a-f]{6})\\]$")' <<<"$peer_binding" >/dev/null || fail invalid_peer 'Use the current exact peer ref from official ListAgents.'
  peer_ref=$(jq -r .evidenceRef <<<"$peer_binding")
  [[ $peer_ref == /* && -f $peer_ref && ! -L $peer_ref && -s $peer_ref ]] || fail invalid_peer 'Preserve official peer/tool readiness evidence at an absolute path.'
  peer_binding=$(jq -c --arg hash "$(git hash-object "$peer_ref")" '. + {evidenceHash:$hash}' <<<"$peer_binding")
  check_parent_peer
  qualified_claude_version=$(claude --version)
  [[ $qualified_claude_version == '2.1.317 (Claude Code)' ]] || fail unsupported_version 'Claude peer startup is qualified only for Claude Code 2.1.317.'
fi
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
request_id="HANCHOU_REQUEST_$attempt"
if [[ -n $peer_file ]]; then
  uuid_hex=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  expected_native="${uuid_hex:0:8}-${uuid_hex:8:4}-4${uuid_hex:13:3}-8${uuid_hex:17:3}-${uuid_hex:20:12}"
fi
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
    --arg mission "$mission" --arg attempt "$attempt" --arg request "$request_id" --arg at "$started_at" \
    '{version:1,instanceKey:$id,project:$project,host:$host,ownership:"dedicated",session:$session,
      missionId:$mission,attemptId:$attempt,resultContract:2,requestId:$request,status:"STARTING",createdAt:$at,finishedAt:null,acceptedAt:null,closedAt:null}')
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
  if [[ -n $peer_file ]]; then
    printf -v auth_command 'claude auth status --json > %q 2> %q; claude --version > %q; printf done > %q' \
      "$tmp/pane-auth.json" "$tmp/pane-auth.err" "$tmp/pane-claude-version" "$tmp/auth-done"
  fi
  herdr pane run "$pane" "$auth_command" > "$tmp/run.json" 2> "$tmp/error" || fail subscription_unknown 'Cannot verify subscription authentication in the actual pane.'
  for ((i=0; i<100; i++)); do [[ -f $tmp/auth-done ]] && break; sleep 0.1; done
  [[ -f $tmp/auth-done ]] || fail subscription_unknown 'Actual-pane authentication check timed out.'
  jq -e '.loggedIn==true and .authMethod=="claude.ai" and .apiProvider=="firstParty" and
    (.subscriptionType=="pro" or .subscriptionType=="max" or .subscriptionType=="team" or .subscriptionType=="enterprise")' "$tmp/pane-auth.json" >/dev/null || fail subscription_required 'Actual pane is not using Claude subscription authentication.'
  if [[ -n $peer_file ]]; then
    [[ -f $tmp/pane-claude-version && $(cat "$tmp/pane-claude-version") == "$qualified_claude_version" ]] ||
      fail unsupported_version 'Actual pane Claude version differs from the qualified caller.'
  fi
fi
if [[ $qualify_startup == true ]]; then
  stage=startup_environment
  # Selected startup facts only; never dump credentials or the full environment.
  printf -v env_command 'printf "%%s" "${CODEX_HOME:-$HOME/.codex}" > %q; codex --version > %q; printf done > %q' \
    "$tmp/pane-home" "$tmp/pane-version" "$tmp/env-done"
  herdr pane run "$pane" "$env_command" > "$tmp/run.json" 2> "$tmp/error" ||
    fail startup_environment_unknown 'Cannot read the pane startup environment.'
  for ((i=0; i<100; i++)); do [[ -f $tmp/env-done ]] && break; sleep 0.1; done
  [[ -f $tmp/env-done && $(cat "$tmp/pane-version") == "$qualified_codex_version" ]] ||
    fail unsupported_version 'Pane Codex version must match the qualified caller version.'
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
if [[ -n $peer_file ]]; then
  agent_args+=(--session-id "$expected_native" --name "$agent_name" --permission-mode manual)
fi
[[ -z $claude_settings ]] || agent_args+=(--settings "$claude_settings")
if [[ $manual_approvals == true ]]; then
  agent_args+=(--sandbox workspace-write --ask-for-approval on-request -c 'approvals_reviewer="user"')
fi
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
if [[ -z $peer_file && $qualify_startup == false ]]; then
  # Optional start metadata may precede native identity. Preserve the actual
  # original process now; a later bind must never adopt a replacement process.
  expected_args=$(jq -nc --args '$ARGS.positional' -- ${agent_args[@]+"${agent_args[@]}"})
  if herdr pane process-info --pane "$pane" > "$tmp/process.json" 2> "$tmp/error"; then
    process_candidate=$(jq -ec --arg cwd "$wt" --arg kind "$kind" --argjson args "$expected_args" '
      [.result.process_info.foreground_processes[]? | select(.cwd==$cwd and
        (((.argv[0] // "")|split("/")[-1])==$kind or .name==$kind))] | select(length==1) | .[0] |
      select(.argv[1:]==$args and (.pid|type=="number" and .>0 and floor==.)) |
      {pid,cwd,executable:.argv[0],observedArguments:$args,argumentsMatchLaunch:true}' "$tmp/process.json") || process_candidate=
    if [[ -n $process_candidate ]]; then
      process_started=$(process_birth "$(jq -r .pid <<<"$process_candidate")")
      if [[ -n $process_started ]]; then
        observed_process=$(jq -c --arg birth "$process_started" --arg at "$started_at" '. + {birth:$birth,observedAt:$at}' <<<"$process_candidate")
      fi
    fi
  fi
fi
if [[ -n $peer_file ]]; then
  stage=startup_qualification
  # The unchanged official SessionStart integration supplies this metadata.
  # A supplied UUID or a successful hook exit alone is not an observed identity.
  jq -e --arg id "$expected_native" '.agent_session.kind=="id" and
    .agent_session.source=="herdr:claude" and .agent_session.value==$id' <<<"$agent_info" >/dev/null ||
    fail native_identity_pending 'Official Herdr Claude SessionStart identity is missing or mismatched; no ACK or hook installation fallback.'
  expected_args=$(jq -nc --args '$ARGS.positional' -- "${agent_args[@]}")
  herdr pane process-info --pane "$pane" > "$tmp/process.json" 2> "$tmp/error" || fail process_identity_pending 'Cannot observe Claude process.'
  process_candidate=$(jq -ec --arg cwd "$wt" --argjson args "$expected_args" '
    [.result.process_info.foreground_processes[]? | select(.cwd==$cwd and
      (((.argv[0] // "")|split("/")[-1])=="claude" or .name=="claude"))] |
    select(length==1) | .[0] | select(.argv[1:]==$args and (.pid|type=="number" and .>0 and floor==.)) |
    {pid,cwd,executable:.argv[0],observedArguments:$args,argumentsMatchLaunch:true}' "$tmp/process.json") ||
    fail process_identity_mismatch 'Claude process arguments differ from this launch.'
  observed_process=$process_candidate
  process_pid=$(jq -r .pid <<<"$observed_process")
  process_started=$(process_birth "$process_pid"); [[ -n $process_started ]] || fail process_identity_pending 'Claude process birth is unavailable.'
  observed_process=$(jq -c --arg birth "$process_started" --arg at "$started_at" '. + {birth:$birth,observedAt:$at}' <<<"$observed_process")
  check_parent_peer
  identity_readiness=$(jq -nc --arg id "$native_id" --arg at "$started_at" '
    {status:"ready",nativeId:$id,source:"official Herdr SessionStart and exact process",observedAt:$at,
      boundary:"Pre-conversation identity; effective model/effort and inbound settings still require native evidence."}')
  observed_permissions='{"permissionMode":"manual","evidence":"exact process arguments; effective native gate must be checked"}'
  receive=$(jq -nc --argjson parent "$peer_binding" --arg name "$agent_name" '
    {route:"claude-peer",status:"peer_binding_required",parent:$parent,childName:$name,
      reason:"Use official ListAgents to bind the new child peer; confirm both effective settings before dispatch."}')
  stage=startup_qualified
fi
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
  process_pid=$(jq -r .pid <<<"$process_candidate")
  process_started=$(process_birth "$process_pid") && [[ -n $process_started ]] ||
    fail process_identity_pending 'The launched process birth time is unavailable; retain this attempt.'
  observed_process=$(jq -c --arg birth "$process_started" '. + {birth:$birth}' <<<"$process_candidate")
  marker="HANCHOU_STARTUP_$attempt"
  language_defaults=$(jq -c '.languages // {} | {human:.human,agents:.agents}' <<<"$effective")
  # No arbitrary prompt/mission interface: this single turn may acknowledge only.
  bootstrap="This is the official CLI native identity check; the actual mission follows separately.
This is startup qualification ONLY for mission $mission, attempt $attempt.
Your verified fresh cwd is $wt; pane $pane in local Herdr session $session.
Do not use tools, read files, start workers or perform real work. Native identity
is pending. Reply once with only the token $marker, without prose
or commentary, and wait for the mission assignment. Do not perform real work.
Communication language defaults (JSON data): $language_defaults
This protocol token is language-independent; the mission supplies instructions and any overrides."
  deadline=$((SECONDS + (10#$timeout_ms + 999) / 1000))
  # A prompt write is not completion. Herdr's --wait has a separate five-second
  # activity gate that can expire before a cold CLI starts the delivered request.
  # Submit once without wait-only options, then prove this exact bootstrap below.
  if ! herdr agent prompt "$pane" "$bootstrap" > "$tmp/bootstrap.json" 2> "$tmp/error"; then
    upstream_code=$(jq -ers 'select(length==1) | .[0].error.code |
      select(type=="string" and test("^[a-z_]{1,80}$"))' "$tmp/error" 2>/dev/null) || upstream_code=
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
  # Select only identity and context; never return embedded
  # session instructions or transcripts. This is not a token aggregator.
  until jq -es --arg marker "$marker" --arg known "$native_id" --arg model "$model" --arg effort "$effort" \
    --argjson manual "$manual_approvals" \
    --arg cli_version "${qualified_codex_version#codex-cli }" '
    [.[]|select(.type=="session_meta")|.payload] as $meta |
    [.[]|select(.type=="turn_context")|.payload] as $ctx |
    [.[]|select(.type=="event_msg" and .payload.type=="task_started")|.payload] as $start |
    [.[]|select(.type=="event_msg" and .payload.type=="task_complete")|.payload] as $completed |
    [.[]|select(.type=="response_item" and .payload.role=="assistant" and .payload.phase=="final_answer")|.payload] as $answers |
    select(($meta|length)==1 and $meta[0].cli_version==$cli_version and $meta[0].forked_from_id==null and
      ($meta[0].id|test("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")) and
      ($known=="" or $known==$meta[0].id) and ($ctx|length)==1 and
      ($model=="" or $model==$ctx[0].model) and ($effort=="" or $effort==$ctx[0].effort) and
      ($manual==false or ($ctx[0].sandbox_policy.type=="workspace-write" and
        $ctx[0].approval_policy=="on-request" and $ctx[0].approvals_reviewer=="user")) and
      ($start|length)==1 and ($completed|length)==1 and $start[0].turn_id==$completed[0].turn_id and
      ($answers|length)==1 and
      ([.[]|select(.type=="response_item" and .payload.type=="message" and .payload.role=="assistant")]|length)==1 and
      ([$answers[0].content[]? | .text // ""] | join("") | gsub("^\\s+|\\s+$";""))==$marker and
      (all(.[]; .type!="response_item" or .payload.type=="message" or .payload.type=="reasoning"))) |
    {nativeId:$meta[0].id,model:$ctx[0].model,effort:$ctx[0].effort,
      permissions:(if $manual then {sandbox:$ctx[0].sandbox_policy.type,
        approvalPolicy:$ctx[0].approval_policy,approvalsReviewer:$ctx[0].approvals_reviewer} else null end),
      cliVersion:$meta[0].cli_version,bootstrapToken:$marker}
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
  observed_permissions=$(jq -c .permissions "$tmp/native.json")
  [[ -n $observed_model ]] || fail observed_model_unknown 'Native model is missing.'
  # A PID alone does not establish the same process through qualification. This
  # corroborates process continuity; native identity still comes from the log.
  [[ $(process_birth "$process_pid") == "$process_started" ]] ||
    fail process_identity_mismatch 'The launched process changed during bootstrap qualification.'
  herdr pane process-info --pane "$pane" > "$tmp/process-final.json" 2> "$tmp/error" ||
    fail process_identity_pending 'Cannot recheck the launched process after bootstrap qualification.'
  jq -e --argjson p "$observed_process" '
    [.result.process_info.foreground_processes[]? |
      select(.cwd==$p.cwd and (.argv[0]|split("/")[-1])=="codex")] |
    length==1 and (.[0] | .pid==$p.pid and .argv==([$p.executable]+$p.observedArguments))
    ' "$tmp/process-final.json" >/dev/null ||
    fail process_identity_mismatch 'The qualified process is no longer in the original pane with its launch arguments.'
  [[ $(process_birth "$process_pid") == "$process_started" ]] ||
    fail process_identity_mismatch 'The launched process changed during its final observation.'
  identity_readiness=$(jq -nc --slurpfile n "$tmp/native.json" \
    --arg home "$log_home" --arg log "$native_log" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{status:"ready",source:"native bootstrap",observedAt:$at,nativeId:$n[0].nativeId,
      nativeLog:$log,logHome:$home,cliVersion:$n[0].cliVersion,
      boundary:"Identity and observed startup settings only; no usage qualification."}')
  stage=startup_qualified
fi
receipt true
