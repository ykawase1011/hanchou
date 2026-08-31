#!/usr/bin/env bash
set -euo pipefail

TOOL_NAME="$(basename "$0")"

if [[ "$TOOL_NAME" == "herdr" ]]; then
  if [[ "${1:-}" == "--session" ]]; then
    [[ "${2:-}" == "work" ]] || { echo "unexpected fake session: ${2:-}" >&2; exit 98; }
    shift 2
  fi
  printf '%s\n' "$*" >> "${FAKE_HERDR_LOG:?}"
  case "${1:-} ${2:-}" in
    "status server")
      [[ "${3:-}" == "--json" ]] || { echo "unexpected fake status argv: $*" >&2; exit 98; }
      if [[ "${HANCHOU_TEST_HERDR_READY:-0}" == "1" ]]; then
        printf '{"status":"running","version":"%s"}\n' "${HANCHOU_TEST_HERDR_VERSION:-0.8.2}"
      else
        printf '%s\n' '{"status":"not_running","version":"0.8.2"}'
      fi
      exit 0
      ;;
    "agent get")
      if [[ "${HANCHOU_TEST_AGENT_GET_ERROR:-0}" == "1" ]]; then
        printf '%s\n' '{"error":{"code":"server_unavailable","message":"server is shutting down"}}' >&2
        exit 1
      fi
      if [[ ! -f "${FAKE_HERDR_AGENT_STATE:?}" ]]; then
        printf '%s\n' '{"error":{"code":"agent_not_found"}}' >&2
        exit 1
      fi
      AGENT_STATUS="$(tr -d '\r\n' < "$FAKE_HERDR_AGENT_STATE")"
      printf '{"result":{"agent":{"name":"orchestrator","agent_status":"%s","workspace_id":"w1","tab_id":"w1:t1","pane_id":"w1:t1:p1","terminal_id":"term-orchestrator"}}}\n' "$AGENT_STATUS"
      exit 0
      ;;
    "agent list")
      if [[ "${HANCHOU_TEST_HERDR_CONTROL_READY:-1}" != "1" ]]; then
        printf '%s\n' '{"error":{"code":"server_unavailable","message":"server is shutting down"}}' >&2
        exit 1
      fi
      printf '%s\n' '{"result":{"agents":[]}}'
      exit 0
      ;;
    "workspace create")
      printf '%s\n' '{"result":{"type":"workspace_created","workspace":{"workspace_id":"w1"},"tab":{"tab_id":"w1:t1"},"root_pane":{"pane_id":"w1:t1:p1"}}}'
      exit 0
      ;;
    "agent start")
      if [[ "${FAKE_ORCHESTRATOR_MODE:-ready}" == "blocked" ]]; then
        printf '%s\n' blocked > "${FAKE_HERDR_AGENT_STATE:?}"
        printf '%s\n' '{"error":{"code":"agent_not_ready"}}' >&2
        exit 1
      fi
      printf '%s\n' idle > "${FAKE_HERDR_AGENT_STATE:?}"
      printf '%s\n' '{"result":{"agent":{"name":"orchestrator","agent_status":"idle","workspace_id":"w1","tab_id":"w1:t1","pane_id":"w1:t1:p1","terminal_id":"term-orchestrator"}}}'
      exit 0
      ;;
    "agent prompt")
      printf '%s\n' working > "${FAKE_HERDR_AGENT_STATE:?}"
      printf '%s\n' '{"result":{"accepted":true}}'
      exit 0
      ;;
  esac
  echo "unsupported fake Herdr invocation: $*" >&2
  exit 97
fi

if [[ "$TOOL_NAME" == "open" ]]; then
  printf '%s\n' "$*" >> "${FAKE_OPEN_LOG:?}"
  exit 0
fi

if [[ "$TOOL_NAME" == "launchctl" ]]; then
  printf '%s\n' "$*" >> "${FAKE_LAUNCHCTL_LOG:?}"
  exit 99
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/hanchou-launch.XXXXXX)"
TMP="$(cd "$TMP" && pwd -P)"
SOCKET_FIXTURE_PID=""

stop_socket_fixture() {
  if [[ -n "$SOCKET_FIXTURE_PID" ]]; then
    kill "$SOCKET_FIXTURE_PID" 2>/dev/null || true
    wait "$SOCKET_FIXTURE_PID" 2>/dev/null || true
    SOCKET_FIXTURE_PID=""
  fi
}

cleanup() {
  stop_socket_fixture
  rm -rf "$TMP"
}
trap cleanup EXIT

export HOME="$TMP/home"
export HANCHOU_TEST_OPERATOR_HOME="$TMP/operator"
export HANCHOU_TEST_HIDE_SYSTEM_HERDRM=1
export FAKE_HERDR_LOG="$TMP/herdr.log"
export FAKE_HERDR_AGENT_STATE="$TMP/orchestrator.state"
export FAKE_OPEN_LOG="$TMP/open.log"
export FAKE_LAUNCHCTL_LOG="$TMP/launchctl.log"
export FAKE_HTTP_LOG="$TMP/http.log"
export HANCHOU_TEST_HERDR_READY=1
export HANCHOU_TEST_DASHBOARD_READY=1
export HANCHOU_TEST_TASKS_READY=1

FAKE_BIN="$TMP/bin"
PRELOAD="$TMP/launch-preload.cjs"
NODE_BIN="$(command -v node)"
PINNED_HERDR="$HANCHOU_TEST_OPERATOR_HOME/.local/share/mise/installs/herdr/0.8.2/herdr"
CONTROL_DIR="$HANCHOU_TEST_OPERATOR_HOME/.local/share/hanchou/work/control"
ORCHESTRATOR_MARKER="$CONTROL_DIR/.hanchou-orchestrator-init.json"
mkdir -p "$HOME" "$HANCHOU_TEST_OPERATOR_HOME" "$FAKE_BIN" "$(dirname "$PINNED_HERDR")"

cp "$0" "$PINNED_HERDR"
cp "$0" "$FAKE_BIN/fake-tool"
chmod 755 "$PINNED_HERDR" "$FAKE_BIN/fake-tool"
ln -s fake-tool "$FAKE_BIN/open"
ln -s fake-tool "$FAKE_BIN/launchctl"
export PATH="$FAKE_BIN:/usr/bin:/bin:/usr/sbin:/sbin"

printf '%s\n' \
  'const { EventEmitter } = require("node:events");' \
  'const fs = require("node:fs");' \
  'const http = require("node:http");' \
  'const os = require("node:os");' \
  'const { syncBuiltinESMExports } = require("node:module");' \
  'const originalUserInfo = os.userInfo;' \
  'const originalStatSync = fs.statSync;' \
  'os.userInfo = () => ({ ...originalUserInfo(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  'os.platform = () => "darwin";' \
  'fs.statSync = (path, ...args) => {' \
  '  if (process.env.HANCHOU_TEST_HIDE_SYSTEM_HERDRM === "1" && (String(path) === "/Applications/herdrm.app" || String(path) === "/Applications/HerdrM.app")) {' \
  '    const error = new Error(`ENOENT: no such file or directory, stat ${path}`);' \
  '    error.code = "ENOENT";' \
  '    throw error;' \
  '  }' \
  '  return originalStatSync(path, ...args);' \
  '};' \
  'http.get = (input, options, callback) => {' \
  '  if (typeof options === "function") callback = options;' \
  '  const target = new URL(typeof input === "string" ? input : input.href);' \
  '  fs.appendFileSync(process.env.FAKE_HTTP_LOG, `${target.href}\n`);' \
  '  const dashboard = target.port === "3747";' \
  '  const tasks = target.port === "3737";' \
  '  const ready = dashboard ? process.env.HANCHOU_TEST_DASHBOARD_READY === "1" : tasks ? process.env.HANCHOU_TEST_TASKS_READY === "1" : false;' \
  '  const request = new EventEmitter();' \
  '  request.setTimeout = () => request;' \
  '  request.destroy = () => { request.destroyed = true; };' \
  '  const response = new EventEmitter();' \
  '  response.statusCode = ready ? 200 : 503;' \
  '  response.headers = { "content-type": dashboard ? "application/json" : "text/html; charset=utf-8" };' \
  '  response.destroy = () => { response.destroyed = true; };' \
  '  const body = dashboard ? "{\"status\":\"ok\"}" : "<!doctype html><title>Beads</title>";' \
  '  process.nextTick(() => { callback(response); response.emit("data", Buffer.from(body)); response.emit("end"); });' \
  '  return request;' \
  '};' \
  'syncBuiltinESMExports();' \
  > "$PRELOAD"

hanchou_test() {
  NODE_OPTIONS="--require=$PRELOAD" "$NODE_BIN" --experimental-strip-types \
    "$ROOT/libexec/hanchou.ts" "$@"
}

reset_fixture() {
  rm -f "$FAKE_HERDR_AGENT_STATE" "$ORCHESTRATOR_MARKER" \
    "$FAKE_OPEN_LOG" "$FAKE_LAUNCHCTL_LOG"
  : > "$FAKE_HERDR_LOG"
  : > "$FAKE_HTTP_LOG"
  unset FAKE_ORCHESTRATOR_MODE
  unset HANCHOU_TEST_AGENT_GET_ERROR
  export HANCHOU_TEST_HERDR_CONTROL_READY=1
}

orchestrator_action_count() {
  grep -Ec '^(workspace create|agent start|agent prompt)' "$FAKE_HERDR_LOG" || true
}

assert_no_orchestrator_action() {
  if [[ "$(orchestrator_action_count)" != "0" ]]; then
    echo "launch changed the Orchestrator after a failed readiness gate" >&2
    cat "$FAKE_HERDR_LOG" >&2
    exit 1
  fi
}

wait_for_file() {
  local path="$1"
  for _attempt in {1..100}; do
    [[ -s "$path" ]] && return 0
    sleep 0.02
  done
  echo "timed out waiting for $path" >&2
  return 1
}

write_ready_marker() {
  mkdir -p "$CONTROL_DIR"
  printf '%s\n' '{"identity":"term-orchestrator","initialized_at":"2026-08-31T00:00:00.000Z"}' \
    > "$ORCHESTRATOR_MARKER"
}

# All three services ready: create and initialize the Orchestrator exactly once.
reset_fixture
hanchou_test launch work --no-browser > "$TMP/ready.out"
grep -q 'initialized orchestrator `orchestrator`' "$TMP/ready.out"
grep -q 'started codex orchestrator `orchestrator`' "$TMP/ready.out"
grep -q 'Hanchou ready: work' "$TMP/ready.out"
grep -q '^status server --json$' "$FAKE_HERDR_LOG"
grep -q '^workspace create ' "$FAKE_HERDR_LOG"
grep -q '^agent start orchestrator ' "$FAKE_HERDR_LOG"
grep -q '^agent prompt orchestrator ' "$FAKE_HERDR_LOG"
grep -q '^http://127\.0\.0\.1:3747/health$' "$FAKE_HTTP_LOG"
grep -q '^http://127\.0\.0\.1:3737/$' "$FAKE_HTTP_LOG"
[[ ! -e "$FAKE_OPEN_LOG" ]]
[[ ! -e "$FAKE_LAUNCHCTL_LOG" ]]
if grep -Eq '^server (start|stop|reload-config)' "$FAKE_HERDR_LOG"; then
  echo "launch restarted or reconfigured healthy Herdr" >&2
  exit 1
fi

# A second launch recognizes the initialized Agent and performs no lifecycle mutation.
ACTIONS_BEFORE="$(orchestrator_action_count)"
hanchou_test launch work --no-browser > "$TMP/ready-again.out"
grep -q 'orchestrator already exists: orchestrator' "$TMP/ready-again.out"
[[ "$(orchestrator_action_count)" == "$ACTIONS_BEFORE" ]]
[[ ! -e "$FAKE_LAUNCHCTL_LOG" ]]

expect_readiness_failure() {
  local label="$1"
  local herdr_ready="$2"
  local dashboard_ready="$3"
  local tasks_ready="$4"
  reset_fixture
  export HANCHOU_TEST_HERDR_READY="$herdr_ready"
  export HANCHOU_TEST_DASHBOARD_READY="$dashboard_ready"
  export HANCHOU_TEST_TASKS_READY="$tasks_ready"
  if hanchou_test launch work --no-browser > "$TMP/${label}.out" 2> "$TMP/${label}.err"; then
    echo "expected launch readiness failure: $label" >&2
    exit 1
  fi
  grep -q "Hanchou services are not ready ($label)" "$TMP/${label}.err"
  assert_no_orchestrator_action
  [[ ! -e "$FAKE_OPEN_LOG" ]]
  [[ ! -e "$FAKE_LAUNCHCTL_LOG" ]]
}

expect_readiness_failure Herdr 0 1 1
expect_readiness_failure dashboard 1 0 1
expect_readiness_failure beads-ui 1 1 0
export HANCHOU_TEST_HERDR_READY=1
export HANCHOU_TEST_DASHBOARD_READY=1
export HANCHOU_TEST_TASKS_READY=1

# A shutdown server still answers Herdr's version Ping. Launch must also require
# a successful read-only control-plane request and must not mutate the Agent.
reset_fixture
export HANCHOU_TEST_HERDR_CONTROL_READY=0
if hanchou_test launch work --no-browser > "$TMP/herdr-control.out" 2> "$TMP/herdr-control.err"; then
  echo "expected launch to reject a Ping-only shutting-down Herdr server" >&2
  exit 1
fi
grep -q 'Hanchou services are not ready (Herdr)' "$TMP/herdr-control.err"
grep -q 'rejected a control-plane probe' "$TMP/herdr-control.err"
assert_no_orchestrator_action
export HANCHOU_TEST_HERDR_CONTROL_READY=1

# A transient control-plane failure must not be mistaken for an absent
# Orchestrator and must not create a replacement workspace.
reset_fixture
export HANCHOU_TEST_AGENT_GET_ERROR=1
if hanchou_test start-orchestrator work > "$TMP/herdr-get.out" 2> "$TMP/herdr-get.err"; then
  echo "expected start-orchestrator to preserve a transient Herdr control error" >&2
  exit 1
fi
grep -q 'server is shutting down' "$TMP/herdr-get.err"
assert_no_orchestrator_action
unset HANCHOU_TEST_AGENT_GET_ERROR

# An existing working Agent remains pending and is not duplicated or prompted.
reset_fixture
printf '%s\n' working > "$FAKE_HERDR_AGENT_STATE"
hanchou_test launch work --no-browser > "$TMP/pending.out"
grep -q 'exists with status working; initialization remains pending' "$TMP/pending.out"
assert_no_orchestrator_action

# Browser opening is opt-out and is routed only to the configured dashboard.
reset_fixture
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
write_ready_marker
hanchou_test launch work > "$TMP/browser.out"
wait_for_file "$FAKE_OPEN_LOG"
grep -Fxq 'http://127.0.0.1:3747' "$FAKE_OPEN_LOG"
rm -f "$FAKE_OPEN_LOG"
hanchou_test launch work --no-browser > "$TMP/no-browser.out"
sleep 0.1
[[ ! -e "$FAKE_OPEN_LOG" ]]

# HerdrM is optional: absence and socket mismatch warn without opening it.
HERDRM_APP="$HANCHOU_TEST_OPERATOR_HOME/Applications/HerdrM.app"
NAMED_SOCKET="$HANCHOU_TEST_OPERATOR_HOME/.config/herdr/sessions/work/herdr.sock"
DEFAULT_SOCKET="$HANCHOU_TEST_OPERATOR_HOME/.config/herdr/herdr.sock"
SOCKET_READY="$TMP/socket-ready"
rm -rf "$(dirname "$DEFAULT_SOCKET")" "$HANCHOU_TEST_OPERATOR_HOME/Applications"
reset_fixture
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
write_ready_marker
hanchou_test launch work --no-browser --herdrm > "$TMP/herdrm-missing.out"
grep -q 'WARN Herdrm not opened: Herdrm is optional and not installed' "$TMP/herdrm-missing.out"
[[ ! -e "$FAKE_OPEN_LOG" ]]

start_socket_fixture() {
  local mode="$1"
  stop_socket_fixture
  rm -f "$NAMED_SOCKET" "$DEFAULT_SOCKET" "$SOCKET_READY"
  mkdir -p "$(dirname "$NAMED_SOCKET")" "$(dirname "$DEFAULT_SOCKET")"
  "$NODE_BIN" -e '
const fs = require("node:fs");
const net = require("node:net");
const [mode, named, fallback, ready] = process.argv.slice(1);
const paths = mode === "mismatch" ? [named, fallback] : [named];
let listening = 0;
const servers = paths.map((path) => net.createServer().listen(path, () => {
  listening += 1;
  if (listening !== paths.length) return;
  if (mode === "match") fs.symlinkSync(named, fallback);
  fs.writeFileSync(ready, "ready");
}));
const close = () => {
  for (const server of servers) server.close();
  setTimeout(() => process.exit(0), 20).unref();
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
setInterval(() => {}, 1000);
' "$mode" "$NAMED_SOCKET" "$DEFAULT_SOCKET" "$SOCKET_READY" &
  SOCKET_FIXTURE_PID=$!
  wait_for_file "$SOCKET_READY"
}

mkdir -p "$HERDRM_APP"
start_socket_fixture named-only
export HANCHOU_TEST_HERDR_VERSION=0.8.1
rm -f "$FAKE_OPEN_LOG"
if hanchou_test open herdrm work > "$TMP/herdrm-version.out" 2> "$TMP/herdrm-version.err"; then
  echo "expected Herdrm open to reject an unpinned live Herdr version" >&2
  exit 1
fi
grep -q 'cannot verify the pinned live Herdr 0.8.2 session' "$TMP/herdrm-version.err"
[[ ! -e "$DEFAULT_SOCKET" ]]
[[ ! -e "$FAKE_OPEN_LOG" ]]
export HANCHOU_TEST_HERDR_VERSION=0.8.2

rm -f "$FAKE_OPEN_LOG"
hanchou_test launch work --no-browser --herdrm > "$TMP/herdrm-bridge.out"
grep -q 'created Herdrm compatibility link:' "$TMP/herdrm-bridge.out"
wait_for_file "$FAKE_OPEN_LOG"
grep -Fxq -- '-a herdrm' "$FAKE_OPEN_LOG"
[[ -L "$DEFAULT_SOCKET" ]]

stop_socket_fixture
rm -f "$DEFAULT_SOCKET"
start_socket_fixture mismatch
rm -f "$FAKE_OPEN_LOG"
hanchou_test launch work --no-browser --herdrm > "$TMP/herdrm-mismatch.out"
grep -q 'WARN Herdrm not opened:' "$TMP/herdrm-mismatch.out"
grep -q '安全に接続できません' "$TMP/herdrm-mismatch.out"
[[ ! -e "$FAKE_OPEN_LOG" ]]

stop_socket_fixture
start_socket_fixture match
rm -f "$FAKE_OPEN_LOG"
hanchou_test launch work --no-browser --herdrm > "$TMP/herdrm-match.out"
grep -q 'WARNING: use Herdrm only to monitor or attach' "$TMP/herdrm-match.out"
wait_for_file "$FAKE_OPEN_LOG"
grep -Fxq -- '-a herdrm' "$FAKE_OPEN_LOG"

echo "launch fake E2E passed"
