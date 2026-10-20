#!/usr/bin/env bash
# Real Git integration; external agent/Herdr commands are local fixtures only.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd -P)
launcher=${HANCHOU_LAUNCHER:-"$root/skills/hanchou-orchestrator/scripts/launch-sokkin.sh"}
command -v jq >/dev/null || { printf 'jq required\n' >&2; exit 1; }
[[ -f "$launcher" ]] || { printf 'launcher not yet present: %s\n' "$launcher" >&2; exit 1; }
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-launch-test.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
repo="$fixture/human checkout"
bin="$fixture/mock bin"
mkdir -p "$repo" "$bin"
export MOCK_LOG="$fixture/herdr-calls.jsonl"
export MOCK_FAIL_START=0 MOCK_HERDR_DOWN=0 MOCK_FAIL_CREATE=0 MOCK_MISMATCH=none
export MOCK_CWD_FILE="$fixture/herdr-cwd"
: > "$MOCK_LOG"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_json() { jq -e "$2" "$1" >/dev/null || fail "JSON assertion $2 in $1"; }
count_worktrees() { git -C "$repo" worktree list --porcelain | awk '/^worktree / { n++ } END { print n+0 }'; }

# Catch unintended direct agent invocation. Herdr is responsible for agent start.
for agent in codex claude; do
  cat > "$bin/$agent" <<'AGENT'
#!/usr/bin/env bash
printf 'direct agent invocation is forbidden in test\n' >&2
exit 93
AGENT
  chmod +x "$bin/$agent"
done
cat > "$bin/herdr" <<'HERDR'
#!/usr/bin/env bash
set -euo pipefail
jq -cn --args '$ARGS.positional' -- "$@" >> "$MOCK_LOG"
if [[ "${MOCK_HERDR_DOWN:-0}" == 1 ]]; then
  printf 'mock Herdr unavailable\n' >&2
  exit 19
fi
args=" $* "
if [[ "$args" == *' workspace list '* ]]; then
  printf '%s\n' '{"ok":true,"result":{"workspaces":[]}}'
  exit 0
fi
if [[ "$args" == *' workspace create '* ]]; then
  if [[ "${MOCK_FAIL_CREATE:-0}" == 1 ]]; then
    printf 'mock workspace creation failure\n' >&2
    exit 24
  fi
  while [[ $# -gt 0 ]]; do
    if [[ $1 == --cwd ]]; then printf '%s' "$2" > "$MOCK_CWD_FILE"; break; fi
    shift
  done
  cwd=$(cat "$MOCK_CWD_FILE")
  [[ "${MOCK_MISMATCH:-none}" != create-cwd ]] || cwd=/
  jq -cn --arg cwd "$cwd" '{ok:true,result:{workspace:{workspace_id:"fixture-workspace"},tab:{tab_id:"fixture-tab"},root_pane:{pane_id:"fixture-pane",cwd:$cwd,foreground_cwd:$cwd}}}'
  exit 0
fi
if [[ "$args" == *' agent start '* ]]; then
  if [[ "${MOCK_FAIL_START:-0}" == 1 ]]; then
    printf 'mock start failure\n' >&2
    exit 23
  fi
  cwd=$(cat "$MOCK_CWD_FILE")
  kind=codex
  [[ "${MOCK_MISMATCH:-none}" != agent-cwd ]] || cwd=/
  [[ "${MOCK_MISMATCH:-none}" != agent-kind ]] || kind=claude
  jq -cn --arg cwd "$cwd" --arg kind "$kind" '{ok:true,result:{agent:{agent:$kind,agent_status:"idle",cwd:$cwd,foreground_cwd:$cwd,pane_id:"fixture-pane",agent_session:{kind:"id",value:"fixture-native-thread"}}}}'
  exit 0
fi
printf 'unexpected mock Herdr command\n' >&2
exit 94
HERDR
chmod +x "$bin/herdr"
export HERDR_BIN="$bin/herdr"
export PATH="$bin:$PATH"

git -C "$repo" init -q
git -C "$repo" config user.email fixture@example.invalid
git -C "$repo" config user.name Fixture
printf 'base\n' > "$repo/tracked.txt"
git -C "$repo" add tracked.txt
git -C "$repo" commit -qm base
base=$(git -C "$repo" rev-parse HEAD)
original_branch=$(git -C "$repo" symbolic-ref HEAD)
printf 'staged\n' >> "$repo/tracked.txt"
git -C "$repo" add tracked.txt
printf 'human unstaged\n' >> "$repo/tracked.txt"
printf 'human untracked\n' > "$repo/untracked.txt"
mkdir -p "$repo/.hanchou"
printf '%s\n' '{"version":2,"sokkin":{"agent":"codex","model":null}}' > "$repo/.hanchou/config.json"
printf 'Human policy remains here.\n' > "$repo/.hanchou/policy.md"

snapshot() {
  git -C "$repo" diff --binary > "$fixture/$1.unstaged"
  git -C "$repo" diff --cached --binary > "$fixture/$1.staged"
  git -C "$repo" status --porcelain=v1 --untracked-files=all > "$fixture/$1.status"
  cp "$repo/untracked.txt" "$fixture/$1.untracked"
  cp "$repo/.hanchou/config.json" "$fixture/$1.config"
  cp "$repo/.hanchou/policy.md" "$fixture/$1.policy"
}
snapshot before
assert_parent_preserved() {
  snapshot after
  for part in unstaged staged status untracked config policy; do
    cmp "$fixture/before.$part" "$fixture/after.$part" >/dev/null || fail "human checkout changed: $part"
  done
  [[ "$(git -C "$repo" rev-parse HEAD)" == "$base" ]] || fail 'parent HEAD changed'
  [[ "$(git -C "$repo" symbolic-ref HEAD)" == "$original_branch" ]] || fail 'parent branch changed'
}
run_launch() {
  bash "$launcher" --project "$repo" --mission sample --session fixture-session "$@"
}
assert_preflight_failure() {
  local label=$1; shift
  local before_count
  before_count=$(count_worktrees)
  : > "$MOCK_LOG"
  if run_launch "$@" > "$fixture/$label.json" 2> "$fixture/$label.err"; then
    fail "$label unexpectedly succeeded"
  fi
  [[ "$(count_worktrees)" == "$before_count" ]] || fail "$label created worktree"
  # Any transport-level preflight query is fine; resource mutation is not.
  if jq -se 'any(.[]; (join(" ") | test("workspace create|agent start")))' "$MOCK_LOG" >/dev/null; then
    fail "$label created Herdr resources"
  fi
  assert_parent_preserved
}

before_count=$(count_worktrees)
bash "$launcher" --help > "$fixture/help" 2> "$fixture/help.err"
[[ -s "$fixture/help" ]] || fail 'help is empty'
[[ ! -s "$MOCK_LOG" ]] || fail 'help contacted Herdr'
[[ "$(count_worktrees)" == "$before_count" ]] || fail 'help created worktree'
assert_preflight_failure invalid-agent --agent invalid
assert_preflight_failure unknown-flag --unknown-launch-flag
assert_preflight_failure missing-value --model
assert_preflight_failure missing-config --config "$fixture/absent.json"
printf '{broken' > "$fixture/broken.json"
assert_preflight_failure malformed-config --config "$fixture/broken.json"
printf '%s\n' '{"version":1,"sokkin":{"agent":"codex"}}' > "$fixture/old.json"
assert_preflight_failure old-config --config "$fixture/old.json"
printf '%s\n' '{"version":2,"sokkin":{"agent":"other"}}' > "$fixture/unsupported.json"
assert_preflight_failure config-agent --config "$fixture/unsupported.json"
assert_preflight_failure invalid-base --base refs/heads/does-not-exist
assert_preflight_failure nested-destination --worktree-root "$repo/unsafe nested worktrees"
printf '%s\n' '{"version":2,"sokkin":{"agent":"codex","model":"$(touch INJECTED);bad"}}' > "$fixture/injection.json"
assert_preflight_failure injection-model --config "$fixture/injection.json"
[[ ! -e "$repo/INJECTED" && ! -e INJECTED ]] || fail 'model text was executed'
printf '%s\n' '{"version":2,"sokkin":{"agent":"codex","model":null,"command":"evil"}}' > "$fixture/extra.json"
assert_preflight_failure extra-config-field --config "$fixture/extra.json"
printf '%s\n' '{"version":2,"sokkin":{"agent":"codex"}} {"version":2,"sokkin":{"agent":"codex"}}' > "$fixture/multiple.json"
assert_preflight_failure multiple-json-config --config "$fixture/multiple.json"
export MOCK_HERDR_DOWN=1
assert_preflight_failure herdr-down
export MOCK_HERDR_DOWN=0

# The same mission must create separate branches and linked worktrees.
for attempt in first second; do
  : > "$MOCK_LOG"
  run_launch --base "$base" --worktree-root "$fixture/sokkin worktrees" > "$fixture/$attempt.json" 2> "$fixture/$attempt.err"
  [[ "$(jq -s 'length' "$fixture/$attempt.json")" == 1 ]] || fail 'stdout must contain exactly one JSON object'
  assert_json "$fixture/$attempt.json" '.version == 2 and .ok == true and .missionId == "sample" and (.attemptId | type == "string" and length > 0)'
  assert_json "$fixture/$attempt.json" '.herdr.workspaceId == "fixture-workspace" and .herdr.tabId == "fixture-tab" and .herdr.paneId == "fixture-pane"'
  assert_json "$fixture/$attempt.json" '.sokkin.agent == "codex" and .sokkin.nativeThreadId == "fixture-native-thread" and .sokkin.nativeSessionId == null and .usageReadiness.status == "pending"'
  wt=$(jq -r '.worktree.path' "$fixture/$attempt.json")
  branch=$(jq -r '.worktree.branch' "$fixture/$attempt.json")
  [[ "$wt" != "$repo" && -d "$wt" ]] || fail 'missing separate worktree'
  [[ "$branch" == hanchou/sample-* ]] || fail 'unexpected branch namespace'
  [[ "$(git -C "$wt" rev-parse HEAD)" == "$base" ]] || fail 'worktree base differs'
  [[ "$(git -C "$wt" branch --show-current)" == "$branch" ]] || fail 'receipt branch differs'
  [[ "$(jq -r '.worktree.baseCommit' "$fixture/$attempt.json")" == "$base" ]] || fail 'receipt base differs'
  [[ "$(jq -r '.worktree.head' "$fixture/$attempt.json")" == "$base" ]] || fail 'receipt HEAD differs'
  [[ "$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir)" == "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" ]] || fail 'not a linked worktree'
  [[ ! -e "$wt/untracked.txt" && ! -e "$wt/.hanchou" ]] || fail 'copied parent untracked state'
  [[ "$(cat "$wt/tracked.txt")" == base ]] || fail 'copied parent dirty content'
  jq -se 'any(.[]; join(" ") | contains("workspace create")) and any(.[]; join(" ") | contains("agent start"))' "$MOCK_LOG" >/dev/null || fail 'missing Herdr creation/start'
  assert_parent_preserved
done
[[ "$(jq -r '.worktree.path' "$fixture/first.json")" != "$(jq -r '.worktree.path' "$fixture/second.json")" ]] || fail 'reused worktree'
[[ "$(jq -r '.worktree.branch' "$fixture/first.json")" != "$(jq -r '.worktree.branch' "$fixture/second.json")" ]] || fail 'reused branch'
[[ "$(jq -r '.attemptId' "$fixture/first.json")" != "$(jq -r '.attemptId' "$fixture/second.json")" ]] || fail 'reused attempt ID'

# Once a start was attempted, preserve the worktree and identity for diagnosis.
export MOCK_FAIL_START=1
before_count=$(count_worktrees)
if run_launch --worktree-root "$fixture/failure worktrees" > "$fixture/start-failure.json" 2> "$fixture/start-failure.err"; then
  fail 'start failure unexpectedly succeeded'
fi
assert_json "$fixture/start-failure.json" '.version == 2 and .ok == false and (.error != null) and (.worktree.path | type == "string")'
assert_json "$fixture/start-failure.json" '.herdr.workspaceId == "fixture-workspace" and .herdr.paneId == "fixture-pane"'
failed_wt=$(jq -r '.worktree.path' "$fixture/start-failure.json")
[[ -d "$failed_wt" ]] || fail 'start failure deleted potentially used worktree'
[[ "$(count_worktrees)" == "$((before_count + 1))" ]] || fail 'start failure lost worktree registration'
assert_parent_preserved
export MOCK_FAIL_START=0

# Workspace creation can have happened even if transport reports failure.
# The linked worktree remains available for reconciliation in every such case.
for mode in create-failure create-cwd agent-kind agent-cwd; do
  export MOCK_FAIL_CREATE=0 MOCK_MISMATCH=none
  if [[ $mode == create-failure ]]; then export MOCK_FAIL_CREATE=1; else export MOCK_MISMATCH=$mode; fi
  : > "$MOCK_LOG"
  before_count=$(count_worktrees)
  if run_launch --worktree-root "$fixture/refused worktrees" > "$fixture/$mode.json" 2> "$fixture/$mode.err"; then
    fail "$mode unexpectedly succeeded"
  fi
  assert_json "$fixture/$mode.json" '.version == 2 and .ok == false and (.error.code | type == "string")'
  retained_wt=$(jq -r '.worktree.path' "$fixture/$mode.json")
  [[ -d "$retained_wt" ]] || fail "$mode lost worktree"
  [[ "$(count_worktrees)" == "$((before_count + 1))" ]] || fail "$mode lost registration"
  if [[ $mode == create-failure ]]; then
    assert_json "$fixture/$mode.json" '.error.code == "workspace_create_unknown" and .herdr.workspaceId == null'
  elif [[ $mode == agent-kind ]]; then
    assert_json "$fixture/$mode.json" '.error.code == "agent_identity_mismatch"'
  else
    assert_json "$fixture/$mode.json" '.error.code == "cwd_mismatch"'
  fi
  if [[ $mode == create-* ]]; then
    if jq -se 'any(.[]; join(" ") | contains("agent start"))' "$MOCK_LOG" >/dev/null; then fail "$mode started an agent"; fi
  fi
  assert_parent_preserved
done
printf 'launch-sokkin integration: ok\n'
