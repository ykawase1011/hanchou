#!/usr/bin/env bash
# One-shot local Herdr launch. No work is submitted; stdout is a single receipt.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: launch-sokkin.sh --project PATH --mission SLUG --session NAME [options]
  --config PATH          Default: selected project's .hanchou/config.json
  --base REF             Default: selected project's HEAD, resolved once
  --agent codex|claude   One-launch override (does not write configuration)
  --model MODEL          One-launch model override
  --effort low|medium|high  One-launch reasoning effort override
  --worktree-root PATH   Absolute directory outside existing checkouts
  --timeout-ms NUMBER    Agent readiness timeout, 3001..300000 (default 30000)
  --help                 Show this help without contacting Herdr

Requires Bash 3.2+, Git, jq, Herdr (tested: 0.9.5) and the official agent CLI.
Select an already-running local named Herdr session. HERDR_BIN may name its CLI.
Success means the agent is ready, not that work or usage qualification completed.
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
herdr_bin=${HERDR_BIN:-herdr}

receipt() {
  local ok=$1
  jq -n --argjson ok "$ok" --arg stage "$stage" --arg mission "$mission" \
    --arg attempt "$attempt" --arg config "$config_path" --argjson effective "$effective" \
    --arg project "$project" --arg path "$wt" --arg branch "$branch" --arg base "$base_commit" --arg head "$actual_head" \
    --arg session "$session" --arg workspace "$workspace" --arg tab "$tab" --arg pane "$pane" \
    --arg agent "$kind" --arg name "$agent_name" --arg native "$native_id" \
    --arg code "$error_code" --arg upstream "$upstream_code" --arg message "$error_message" --argjson resources "$resources" '
    def optional: if . == "" then null else . end;
    {version:2,ok:$ok,stage:$stage,missionId:($mission|optional),attemptId:($attempt|optional),
     config:{source:($config|optional),effective:$effective},
     worktree:{repository:($project|optional),path:($path|optional),branch:($branch|optional),
       baseCommit:($base|optional),head:($head|optional)},
     herdr:{host:"local",session:($session|optional),workspaceId:($workspace|optional),
       tabId:($tab|optional),paneId:($pane|optional)},
     sokkin:{agent:($agent|optional),name:($name|optional),requestedModel:($effective.sokkin.model // null),
       observedModel:null,requestedEffort:($effective.sokkin.effort // null),observedEffort:null,
       nativeThreadId:(if $agent=="codex" then ($native|optional) else null end),
       nativeSessionId:(if $agent=="claude" then ($native|optional) else null end)},
     usageReadiness:{status:"pending",reason:"Verify native identity, settled usage and scope before real work."},
     error:(if $ok then null else {code:$code,upstreamCode:($upstream|optional),message:$message} end),resources:$resources}'
  emitted=true
}
finish() {
  local rc=$?
  trap - EXIT
  if [[ $emitted == false ]]; then receipt false; [[ $rc != 0 ]] || rc=1; fi
  [[ -z $tmp ]] || rm -rf -- "$tmp"
  exit "$rc"
}
trap finish EXIT
trap 'error_code=interrupted; error_message="Launch interrupted; reconcile this attempt before retrying."; exit 130' INT TERM
fail() { error_code=$1; error_message=$2; exit 1; }
need_value() { [[ $# -ge 2 && -n $2 && $2 != --* ]] || fail missing_argument 'An option is missing its value.'; }
while [[ $# -gt 0 ]]; do
  need_value "$@"
  case $1 in
    --project) project=$2;; --mission) mission=$2;; --session) session=$2;;
    --config) config_path=$2;; --base) base=$2;; --agent) agent_override=$2;;
    --model) model_override=$2;; --effort) effort_override=$2;;
    --worktree-root) worktree_root=$2;; --timeout-ms) timeout_ms=$2;;
    *) fail unknown_option 'Unknown launch option.';;
  esac
  shift 2
done
[[ -n $project && -n $mission && -n $session ]] || fail missing_argument 'Project, mission and named Herdr session are required.'
[[ $mission =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]] || fail invalid_mission 'Mission must be a short lowercase slug.'
[[ $session =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || fail invalid_session 'Use an explicit local named Herdr session.'
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
model=$(jq -r '.sokkin.model // empty' <<<"$effective")
effort=$(jq -r '.sokkin.effort // empty' <<<"$effective")
[[ -z $model || $model =~ ^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,99}$ ]] || fail invalid_model 'Model must be a native model identifier.'
command -v "$kind" >/dev/null 2>&1 || fail missing_agent 'The selected official agent CLI is not available.'
herdr() { command "$herdr_bin" --session "$session" "$@"; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-launch.XXXXXX")
herdr workspace list > "$tmp/workspaces.json" 2> "$tmp/error" || fail herdr_unavailable 'Start the selected Herdr session before launching a sokkin.'
jq -e '.result.workspaces|type=="array"' "$tmp/workspaces.json" >/dev/null || fail herdr_contract 'Herdr did not return a workspace inventory.'
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

stage=workspace_create
# No prompts, hooks, credentials or old .hanchou files are copied to the checkout.
herdr workspace create --cwd "$wt" --label "$agent_name" --env "HANCHOU_MISSION_ID=$mission" --env "HANCHOU_ATTEMPT_ID=$attempt" --no-focus > "$tmp/create.json" 2> "$tmp/error" || fail workspace_create_unknown 'Workspace creation failed or is uncertain; reconcile by attempt label before retrying.'
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
stage=agent_start
agent_args=()
[[ -z $model ]] || agent_args+=(--model "$model")
if [[ $kind == codex ]]; then agent_args+=(--no-daemon); fi
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
receipt true
