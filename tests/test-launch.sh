#!/usr/bin/env bash
set -euo pipefail

TOOL_NAME="$(basename "$0")"

if [[ "$TOOL_NAME" == "herdr" ]]; then
  if [[ "${1:-}" == "--session" ]]; then
    [[ "${2:-}" == "work" ]] || { echo "unexpected fake session: ${2:-}" >&2; exit 98; }
    shift 2
  fi
  if [[ "$#" == "0" ]]; then
    printf '%s\n' '<tui>' >> "${FAKE_HERDR_LOG:?}"
    exit 0
  fi
  printf '%s\n' "$*" >> "${FAKE_HERDR_LOG:?}"

  fake_agent_name() {
    if [[ -e "${FAKE_HERDR_AGENT_NAME:?}" ]]; then
      tr -d '\r\n' < "$FAKE_HERDR_AGENT_NAME"
    else
      printf '%s' orchestrator
    fi
  }

  fake_agent_location() {
    if [[ -s "${FAKE_HERDR_AGENT_LOCATION:?}" ]]; then
      cat "$FAKE_HERDR_AGENT_LOCATION"
    else
      printf '%s\n' 'w1|w1:t1|w1:t1:p1|term-w1'
    fi
  }

  fake_print_agent() {
    local name status workspace_id tab_id pane_id terminal_id
    name="$(fake_agent_name)"
    status="$(tr -d '\r\n' < "${FAKE_HERDR_AGENT_STATE:?}")"
    IFS='|' read -r workspace_id tab_id pane_id terminal_id <<< "$(fake_agent_location)"
    printf '{'
    if [[ -n "$name" ]]; then printf '"name":"%s",' "$name"; fi
    if [[ "${HANCHOU_TEST_AGENT_LAUNCH_PENDING:-0}" == "1" ]]; then
      printf '"launch_pending":true,'
    else
      printf '"agent":"%s",' "${HANCHOU_TEST_AGENT_KIND:-codex}"
    fi
    printf '"agent_status":"%s","workspace_id":"%s","tab_id":"%s","pane_id":"%s","terminal_id":"%s","agent_session":{"source":"herdr","agent":"%s","kind":"session_id","value":"session-%s"},"focused":false,"interactive_ready":true,"state_change_seq":1,"revision":1}' \
      "$status" "$workspace_id" "$tab_id" "$pane_id" "$terminal_id" "${HANCHOU_TEST_AGENT_KIND:-codex}" "$workspace_id"
  }

  fake_find_workspace() {
    local wanted="$1"
    [[ -f "${FAKE_HERDR_WORKSPACES:?}" ]] || return 1
    while IFS='|' read -r workspace_id label tab_id pane_id terminal_id cwd; do
      if [[ "$workspace_id" == "$wanted" ]]; then
        printf '%s|%s|%s|%s|%s|%s\n' "$workspace_id" "$label" "$tab_id" "$pane_id" "$terminal_id" "$cwd"
        return 0
      fi
    done < "$FAKE_HERDR_WORKSPACES"
    return 1
  }

  fake_print_pane() {
    local record="$1"
    local workspace_id workspace_label tab_id pane_id terminal_id workspace_cwd
    local pane_status pane_agent pane_focused agent_workspace agent_pane
    IFS='|' read -r workspace_id workspace_label tab_id pane_id terminal_id workspace_cwd <<< "$record"
    pane_status=unknown
    pane_agent=""
    pane_focused=false
    if [[ -s "${FAKE_HERDR_FOCUSED_WORKSPACE_FILE:?}" && "$(tr -d '\r\n' < "$FAKE_HERDR_FOCUSED_WORKSPACE_FILE")" == "$workspace_id" ]]; then
      pane_focused=true
    fi
    if [[ -f "${FAKE_HERDR_AGENT_STATE:?}" ]]; then
      IFS='|' read -r agent_workspace _ agent_pane _ <<< "$(fake_agent_location)"
      if [[ "$agent_workspace" == "$workspace_id" && "$agent_pane" == "$pane_id" ]]; then
        pane_status="$(tr -d '\r\n' < "$FAKE_HERDR_AGENT_STATE")"
        pane_agent="$(fake_agent_name)"
      fi
    fi
    local foreground_cwd="$workspace_cwd"
    if [[ "${HANCHOU_TEST_FOREGROUND_CWD_ID:-}" == "$workspace_id" ]]; then
      foreground_cwd="${HANCHOU_TEST_FOREGROUND_CWD_VALUE:-}"
    fi
    printf '{"pane_id":"%s","terminal_id":"%s","workspace_id":"%s","tab_id":"%s","focused":%s,"cwd":"%s","foreground_cwd":"%s",' \
      "$pane_id" "$terminal_id" "$workspace_id" "$tab_id" "$pane_focused" "$workspace_cwd" "$foreground_cwd"
    if [[ -n "$pane_agent" ]]; then
      printf '"agent":"%s","agent_session":{"source":"herdr","agent":"%s","kind":"session_id","value":"session-%s"},' \
        "${HANCHOU_TEST_AGENT_KIND:-codex}" "${HANCHOU_TEST_AGENT_KIND:-codex}" "$workspace_id"
    fi
    printf '"agent_status":"%s","revision":1}' "$pane_status"
  }

  fake_lock_state() {
    while ! mkdir "${FAKE_HERDR_STATE_LOCK:?}" 2>/dev/null; do sleep 0.01; done
  }

  fake_unlock_state() {
    rmdir "${FAKE_HERDR_STATE_LOCK:?}" 2>/dev/null || true
  }

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
      AGENT_NAME="$(fake_agent_name)"
      IFS='|' read -r AGENT_WORKSPACE AGENT_TAB AGENT_PANE AGENT_TERMINAL <<< "$(fake_agent_location)"
      AGENT_TARGET="${3:-}"
      if [[ "$AGENT_TARGET" != "$AGENT_NAME" && "$AGENT_TARGET" != "$AGENT_PANE" && "$AGENT_TARGET" != "$AGENT_TERMINAL" ]]; then
        printf '%s\n' '{"error":{"code":"agent_not_found"}}' >&2
        exit 1
      fi
      printf '{"result":{"agent":'
      fake_print_agent
      printf '}}\n'
      exit 0
      ;;
    "agent list")
      if [[ -e "${FAKE_HERDR_AGENT_LIST_FAILURE:?}" ]]; then
        printf '%s\n' '{"error":{"code":"server_unavailable","message":"simulated agent list failure"}}' >&2
        exit 1
      fi
      if [[ "${HANCHOU_TEST_HERDR_CONTROL_READY:-1}" != "1" ]]; then
        printf '%s\n' '{"error":{"code":"server_unavailable","message":"server is shutting down"}}' >&2
        exit 1
      fi
      printf '{"result":{"type":"agent_list","agents":['
      if [[ -f "${FAKE_HERDR_AGENT_STATE:?}" ]]; then
        fake_print_agent
        if [[ "${HANCHOU_TEST_DUPLICATE_AGENT:-0}" == "1" ]]; then printf ','; fake_print_agent; fi
      fi
      printf ']}}\n'
      exit 0
      ;;
    "workspace list")
      if [[ -e "${FAKE_HERDR_WORKSPACE_LIST_FAILURE:?}" ]]; then
        printf '%s\n' '{"error":{"code":"server_unavailable","message":"simulated workspace list failure"}}' >&2
        exit 1
      fi
      printf '{"result":{"type":"workspace_list","workspaces":['
      FIRST=1
      if [[ -f "${FAKE_HERDR_WORKSPACES:?}" ]]; then
        while IFS='|' read -r WORKSPACE_ID WORKSPACE_LABEL TAB_ID PANE_ID TERMINAL_ID WORKSPACE_CWD; do
          [[ -n "$WORKSPACE_ID" ]] || continue
          if [[ "$FIRST" != "1" ]]; then printf ','; fi
          FIRST=0
          WORKSPACE_STATUS=unknown
          if [[ -f "${FAKE_HERDR_AGENT_STATE:?}" ]]; then
            IFS='|' read -r AGENT_WORKSPACE _ _ _ <<< "$(fake_agent_location)"
            if [[ "$AGENT_WORKSPACE" == "$WORKSPACE_ID" ]]; then
              WORKSPACE_STATUS="$(tr -d '\r\n' < "$FAKE_HERDR_AGENT_STATE")"
            fi
          fi
          WORKSPACE_PANE_COUNT=1
          WORKSPACE_TAB_COUNT=1
          WORKSPACE_FOCUSED=false
          if [[ -s "${FAKE_HERDR_FOCUSED_WORKSPACE_FILE:?}" && "$(tr -d '\r\n' < "$FAKE_HERDR_FOCUSED_WORKSPACE_FILE")" == "$WORKSPACE_ID" ]]; then
            WORKSPACE_FOCUSED=true
          fi
          if [[ "${HANCHOU_TEST_WORKSPACE_BAD_SHAPE_ID:-}" == "$WORKSPACE_ID" ]]; then WORKSPACE_PANE_COUNT=2; fi
          printf '{"workspace_id":"%s","number":1,"label":"%s","focused":%s,"pane_count":%s,"tab_count":%s,"active_tab_id":"%s","agent_status":"%s"' \
            "$WORKSPACE_ID" "$WORKSPACE_LABEL" "$WORKSPACE_FOCUSED" "$WORKSPACE_PANE_COUNT" "$WORKSPACE_TAB_COUNT" "$TAB_ID" "$WORKSPACE_STATUS"
          if [[ "${HANCHOU_TEST_WORKSPACE_WORKTREE_ID:-}" == "$WORKSPACE_ID" ]]; then
            printf ',"worktree":{"repo_key":"repo","repo_name":"repo","repo_root":"/repo","checkout_path":"/checkout","is_linked_worktree":true}'
          fi
          printf '}'
        done < "$FAKE_HERDR_WORKSPACES"
      fi
      printf ']}}\n'
      exit 0
      ;;
    "workspace focus")
      [[ -n "${3:-}" ]] || { echo "unexpected fake workspace focus argv: $*" >&2; exit 98; }
      fake_find_workspace "$3" >/dev/null || { printf '%s\n' '{"error":{"code":"workspace_not_found"}}' >&2; exit 1; }
      printf '%s\n' '{"result":{"type":"ok"}}'
      exit 0
      ;;
    "workspace close")
      [[ "$#" == "3" && -n "${3:-}" ]] || { echo "unexpected fake workspace close argv: $*" >&2; exit 98; }
      WORKSPACE_ID="$3"
      if ! fake_find_workspace "$WORKSPACE_ID" >/dev/null; then
        printf '%s\n' '{"error":{"code":"workspace_not_found"}}' >&2
        exit 1
      fi
      printf '%s|runtime=%s|marker=%s\n' "$WORKSPACE_ID" \
        "$([[ -e "${ORCHESTRATOR_RUNTIME:?}" ]] && printf 1 || printf 0)" \
        "$([[ -e "${ORCHESTRATOR_MARKER:?}" ]] && printf 1 || printf 0)" \
        >> "${FAKE_HERDR_CLOSE_STATE_LOG:?}"
      if [[ ",${HANCHOU_TEST_WORKSPACE_CLOSE_FAIL_IDS:-}," == *",${WORKSPACE_ID},"* ]]; then
        printf '%s\n' '{"error":{"code":"workspace_close_failed","message":"simulated close failure"}}' >&2
        exit 1
      fi
      if [[ "${HANCHOU_TEST_KEEP_WORKSPACE_AFTER_CLOSE_ID:-}" != "$WORKSPACE_ID" ]]; then
        fake_lock_state
        trap fake_unlock_state EXIT
        WORKSPACES_NEXT="${FAKE_HERDR_WORKSPACES}.next"
        : > "$WORKSPACES_NEXT"
        while IFS= read -r WORKSPACE_RECORD; do
          [[ "${WORKSPACE_RECORD%%|*}" == "$WORKSPACE_ID" ]] || printf '%s\n' "$WORKSPACE_RECORD" >> "$WORKSPACES_NEXT"
        done < "$FAKE_HERDR_WORKSPACES"
        mv "$WORKSPACES_NEXT" "$FAKE_HERDR_WORKSPACES"
        if [[ -f "${FAKE_HERDR_AGENT_STATE:?}" ]]; then
          IFS='|' read -r AGENT_WORKSPACE _ _ _ <<< "$(fake_agent_location)"
          if [[ "$AGENT_WORKSPACE" == "$WORKSPACE_ID" && "${HANCHOU_TEST_KEEP_AGENT_AFTER_CLOSE_ID:-}" != "$WORKSPACE_ID" ]]; then
            rm -f "$FAKE_HERDR_AGENT_STATE" "${FAKE_HERDR_AGENT_NAME:?}" "${FAKE_HERDR_AGENT_LOCATION:?}"
          fi
        fi
        fake_unlock_state
        trap - EXIT
      fi
      if [[ "${HANCHOU_TEST_FOREGROUND_AFTER_CLOSE_ID:-}" == "$WORKSPACE_ID" && -n "${HANCHOU_TEST_FOREGROUND_TARGET_PANE:-}" ]]; then
        printf '%s\n' "$HANCHOU_TEST_FOREGROUND_TARGET_PANE" > "${FAKE_HERDR_FOREGROUND_PANE_FILE:?}"
      fi
      if [[ "${HANCHOU_TEST_AGENT_LIST_FAIL_AFTER_CLOSE_ID:-}" == "$WORKSPACE_ID" ]]; then
        : > "${FAKE_HERDR_AGENT_LIST_FAILURE:?}"
      fi
      if [[ "${HANCHOU_TEST_WORKSPACE_LIST_FAIL_AFTER_CLOSE_ID:-}" == "$WORKSPACE_ID" ]]; then
        : > "${FAKE_HERDR_WORKSPACE_LIST_FAILURE:?}"
      fi
      if [[ "${HANCHOU_TEST_FOCUS_AFTER_CLOSE_ID:-}" == "$WORKSPACE_ID" && -n "${HANCHOU_TEST_FOCUS_TARGET_WORKSPACE:-}" ]]; then
        printf '%s\n' "$HANCHOU_TEST_FOCUS_TARGET_WORKSPACE" > "${FAKE_HERDR_FOCUSED_WORKSPACE_FILE:?}"
      fi
      printf '%s\n' '{"result":{"type":"ok"}}'
      exit 0
      ;;
    "pane list")
      printf '{"result":{"type":"pane_list","panes":['
      if [[ "$#" == "2" ]]; then
        FIRST=1
        if [[ -f "${FAKE_HERDR_WORKSPACES:?}" ]]; then
          while IFS= read -r WORKSPACE_RECORD; do
            [[ -n "$WORKSPACE_RECORD" ]] || continue
            if [[ "$FIRST" != "1" ]]; then printf ','; fi
            FIRST=0
            fake_print_pane "$WORKSPACE_RECORD"
          done < "$FAKE_HERDR_WORKSPACES"
        fi
      elif [[ "${3:-}" == "--workspace" && -n "${4:-}" && "$#" == "4" ]]; then
        if WORKSPACE_RECORD="$(fake_find_workspace "$4")"; then fake_print_pane "$WORKSPACE_RECORD"; fi
      else
        echo "unexpected fake pane list argv: $*" >&2
        exit 98
      fi
      printf ']}}\n'
      exit 0
      ;;
    "pane process-info")
      [[ "${3:-}" == "--pane" && -n "${4:-}" && "$#" == "4" ]] || { echo "unexpected fake pane process-info argv: $*" >&2; exit 98; }
      PROCESS_PANE="$4"
      PROCESS_WORKSPACE="${PROCESS_PANE%%:t*}"
      WORKSPACE_RECORD="$(fake_find_workspace "$PROCESS_WORKSPACE")" || { printf '%s\n' '{"error":{"code":"pane_not_found"}}' >&2; exit 1; }
      IFS='|' read -r _ _ _ EXPECTED_PANE _ PROCESS_CWD <<< "$WORKSPACE_RECORD"
      [[ "$EXPECTED_PANE" == "$PROCESS_PANE" ]] || { printf '%s\n' '{"error":{"code":"pane_not_found"}}' >&2; exit 1; }
      if [[ "${HANCHOU_TEST_FOREGROUND_CWD_ID:-}" == "$PROCESS_WORKSPACE" ]]; then
        PROCESS_CWD="${HANCHOU_TEST_FOREGROUND_CWD_VALUE:-}"
      fi
      if [[ "${HANCHOU_TEST_PROCESS_INFO_OMIT_ID:-}" == "$PROCESS_PANE" ]]; then
        printf '{"result":{"type":"pane_process_info","process_info":{"pane_id":"%s","shell_pid":1000,"foreground_process_group_id":1000}}}\n' "$PROCESS_PANE"
        exit 0
      fi
      PROCESS_ROWS='{"pid":1000,"name":"zsh","argv0":"-zsh","argv":["-zsh"],"cwd":"'"$PROCESS_CWD"'"}'
      PROCESS_GROUP=1000
      if [[ -f "${FAKE_HERDR_AGENT_STATE:?}" ]]; then
        IFS='|' read -r AGENT_WORKSPACE _ AGENT_PANE _ <<< "$(fake_agent_location)"
        if [[ "$AGENT_WORKSPACE" == "$PROCESS_WORKSPACE" && "$AGENT_PANE" == "$PROCESS_PANE" ]]; then
          PROCESS_ROWS='{"pid":2000,"name":"agent","argv0":"agent","argv":["agent"],"cwd":"'"$PROCESS_CWD"'"}'
          PROCESS_GROUP=2000
        fi
      fi
      if [[ -s "${FAKE_HERDR_FOREGROUND_PANE_FILE:?}" && "$(tr -d '\r\n' < "$FAKE_HERDR_FOREGROUND_PANE_FILE")" == "$PROCESS_PANE" ]]; then
        PROCESS_ROWS='{"pid":3000,"name":"foreground-command","argv0":"foreground-command","argv":["foreground-command"],"cwd":"'"$PROCESS_CWD"'"}'
        PROCESS_GROUP=3000
      fi
      printf '{"result":{"type":"pane_process_info","process_info":{"pane_id":"%s","shell_pid":1000,"foreground_process_group_id":%s,"foreground_processes":[%s]}}}\n' \
        "$PROCESS_PANE" "$PROCESS_GROUP" "$PROCESS_ROWS"
      exit 0
      ;;
    "workspace create")
      WORKSPACE_CWD=""
      WORKSPACE_LABEL=""
      PREVIOUS=""
      for ARG in "$@"; do
        if [[ "$PREVIOUS" == "--cwd" ]]; then WORKSPACE_CWD="$ARG"; fi
        if [[ "$PREVIOUS" == "--label" ]]; then WORKSPACE_LABEL="$ARG"; fi
        PREVIOUS="$ARG"
      done
      fake_lock_state
      trap fake_unlock_state EXIT
      WORKSPACE_NUMBER=0
      if [[ -s "${FAKE_HERDR_WORKSPACE_COUNTER:?}" ]]; then
        WORKSPACE_NUMBER="$(tr -d '\r\n' < "$FAKE_HERDR_WORKSPACE_COUNTER")"
      fi
      WORKSPACE_NUMBER=$((WORKSPACE_NUMBER + 1))
      printf '%s\n' "$WORKSPACE_NUMBER" > "$FAKE_HERDR_WORKSPACE_COUNTER"
      WORKSPACE_ID="w${WORKSPACE_NUMBER}"
      TAB_ID="${WORKSPACE_ID}:t1"
      PANE_ID="${TAB_ID}:p1"
      TERMINAL_ID="term-${WORKSPACE_ID}"
      printf '%s|%s|%s|%s|%s|%s\n' "$WORKSPACE_ID" "$WORKSPACE_LABEL" "$TAB_ID" "$PANE_ID" "$TERMINAL_ID" "$WORKSPACE_CWD" >> "${FAKE_HERDR_WORKSPACES:?}"
      fake_unlock_state
      trap - EXIT
      printf '{"result":{"type":"workspace_created","workspace":{"workspace_id":"%s","number":%s,"label":"%s","focused":false,"pane_count":1,"tab_count":1,"active_tab_id":"%s","agent_status":"unknown"},"tab":{"tab_id":"%s"},"root_pane":{"pane_id":"%s","terminal_id":"%s","workspace_id":"%s","tab_id":"%s"}}}\n' \
        "$WORKSPACE_ID" "$WORKSPACE_NUMBER" "$WORKSPACE_LABEL" "$TAB_ID" "$TAB_ID" "$PANE_ID" "$TERMINAL_ID" "$WORKSPACE_ID" "$TAB_ID"
      exit 0
      ;;
    "agent start")
      AGENT_NAME="${3:-}"
      AGENT_PANE=""
      PREVIOUS=""
      for ARG in "$@"; do
        if [[ "$PREVIOUS" == "--pane" ]]; then AGENT_PANE="$ARG"; fi
        PREVIOUS="$ARG"
      done
      AGENT_WORKSPACE="${AGENT_PANE%%:t*}"
      WORKSPACE_RECORD="$(fake_find_workspace "$AGENT_WORKSPACE")"
      IFS='|' read -r AGENT_WORKSPACE WORKSPACE_LABEL AGENT_TAB AGENT_PANE AGENT_TERMINAL WORKSPACE_CWD <<< "$WORKSPACE_RECORD"
      if [[ -n "${HANCHOU_TEST_AGENT_START_DELAY:-}" ]]; then sleep "$HANCHOU_TEST_AGENT_START_DELAY"; fi
      if [[ "${FAKE_ORCHESTRATOR_MODE:-ready}" == "failed" ]]; then
        printf '%s\n' '{"error":{"code":"agent_start_failed","message":"simulated start failure"}}' >&2
        exit 1
      fi
      printf '%s\n' "$AGENT_WORKSPACE|$AGENT_TAB|$AGENT_PANE|$AGENT_TERMINAL" > "${FAKE_HERDR_AGENT_LOCATION:?}"
      if [[ "${FAKE_ORCHESTRATOR_MODE:-ready}" == "unnamed" ]]; then
        : > "${FAKE_HERDR_AGENT_NAME:?}"
        printf '%s\n' idle > "${FAKE_HERDR_AGENT_STATE:?}"
        printf '%s\n' '{"error":{"code":"agent_name_lost","message":"simulated unnamed Agent"}}' >&2
        exit 1
      fi
      printf '%s\n' "$AGENT_NAME" > "${FAKE_HERDR_AGENT_NAME:?}"
      if [[ "${FAKE_ORCHESTRATOR_MODE:-ready}" == "blocked" ]]; then
        printf '%s\n' blocked > "${FAKE_HERDR_AGENT_STATE:?}"
        printf '%s\n' '{"error":{"code":"agent_not_ready"}}' >&2
        exit 1
      fi
      printf '%s\n' idle > "${FAKE_HERDR_AGENT_STATE:?}"
      printf '{"result":{"agent":'
      fake_print_agent
      printf '}}\n'
      exit 0
      ;;
    "agent rename")
      [[ -f "${FAKE_HERDR_AGENT_STATE:?}" ]] || { printf '%s\n' '{"error":{"code":"agent_not_found"}}' >&2; exit 1; }
      printf '%s\n' "${4:-}" > "${FAKE_HERDR_AGENT_NAME:?}"
      printf '{"result":{"agent":'
      fake_print_agent
      printf '}}\n'
      exit 0
      ;;
    "agent focus")
      [[ -f "${FAKE_HERDR_AGENT_STATE:?}" && "$(fake_agent_name)" == "${3:-}" ]] || { printf '%s\n' '{"error":{"code":"agent_not_found"}}' >&2; exit 1; }
      printf '%s\n' '{"result":{"type":"ok"}}'
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
export FAKE_HERDR_AGENT_NAME="$TMP/orchestrator.name"
export FAKE_HERDR_AGENT_LOCATION="$TMP/orchestrator.location"
export FAKE_HERDR_WORKSPACES="$TMP/workspaces.state"
export FAKE_HERDR_WORKSPACE_COUNTER="$TMP/workspace-counter.state"
export FAKE_HERDR_STATE_LOCK="$TMP/herdr-state.lock"
export FAKE_HERDR_CLOSE_STATE_LOG="$TMP/herdr-close-state.log"
export FAKE_HERDR_FOREGROUND_PANE_FILE="$TMP/herdr-foreground-pane.state"
export FAKE_HERDR_AGENT_LIST_FAILURE="$TMP/herdr-agent-list.failure"
export FAKE_HERDR_WORKSPACE_LIST_FAILURE="$TMP/herdr-workspace-list.failure"
export FAKE_HERDR_FOCUSED_WORKSPACE_FILE="$TMP/herdr-focused-workspace.state"
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
STATE_ROOT="$HANCHOU_TEST_OPERATOR_HOME/.local/share/hanchou/work"
PROFILE_CONFIG_DIR="$HANCHOU_TEST_OPERATOR_HOME/.config/hanchou/work"
ORCHESTRATOR_MARKER="$CONTROL_DIR/.hanchou-orchestrator-init.json"
ORCHESTRATOR_RUNTIME="$CONTROL_DIR/.hanchou-orchestrator-runtime.json"
export ORCHESTRATOR_MARKER ORCHESTRATOR_RUNTIME
mkdir -p "$HOME" "$HANCHOU_TEST_OPERATOR_HOME" "$FAKE_BIN" "$(dirname "$PINNED_HERDR")"

cp "$0" "$PINNED_HERDR"
cp "$0" "$FAKE_BIN/fake-tool"
chmod 755 "$PINNED_HERDR" "$FAKE_BIN/fake-tool"
ln -s fake-tool "$FAKE_BIN/open"
ln -s fake-tool "$FAKE_BIN/launchctl"
export PATH="$FAKE_BIN:/usr/bin:/bin:/usr/sbin:/sbin"

printf '%s\n' \
  'const { EventEmitter } = require("node:events");' \
  'const childProcess = require("node:child_process");' \
  'const fs = require("node:fs");' \
  'const http = require("node:http");' \
  'const os = require("node:os");' \
  'const { syncBuiltinESMExports } = require("node:module");' \
  'const originalUserInfo = os.userInfo;' \
  'const originalSpawnSync = childProcess.spawnSync;' \
  'const originalStatSync = fs.statSync;' \
  'os.userInfo = () => ({ ...originalUserInfo(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  'os.platform = () => "darwin";' \
  'childProcess.spawnSync = (command, args, options) => {' \
  '  if (command === "/bin/ps" && JSON.stringify(args) === JSON.stringify(["-axo", "pid=,ppid=,pgid=,tty=,comm="])) {' \
  '    if (process.env.HANCHOU_TEST_PS_FAIL === "1") return { status: 1, signal: null, stdout: "", stderr: "simulated ps failure", error: undefined };' \
  '    const extra = process.env.HANCHOU_TEST_PS_BACKGROUND === "1" ? "4000 1000 4000 ttys999 sleep\n" : "";' \
  '    return { status: 0, signal: null, stdout: `1000 1 1000 ttys999 zsh\n${extra}`, stderr: "", error: undefined };' \
  '  }' \
  '  return originalSpawnSync(command, args, options);' \
  '};' \
  'if (process.env.HANCHOU_TEST_FORCE_TTY === "1") Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });' \
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

stop_orchestrator_apply() {
  local token="${1:-}"
  if [[ -z "$token" ]]; then
    hanchou_test stop-orchestrator work --all > "$TMP/stop-helper-plan.out"
    token="$(sed -n 's/^  plan token: //p' "$TMP/stop-helper-plan.out")"
  fi
  [[ "${#token}" == "64" && "$token" != *[!a-f0-9]* ]] || { echo "missing fake stop plan token" >&2; return 99; }
  HANCHOU_TEST_FORCE_TTY=1 NODE_OPTIONS="--require=$PRELOAD" "$NODE_BIN" --experimental-strip-types \
    "$ROOT/libexec/hanchou.ts" stop-orchestrator work --all --plan "$token" --yes
}

reset_fixture() {
  rm -f "$FAKE_HERDR_AGENT_STATE" "$FAKE_HERDR_AGENT_NAME" \
    "$FAKE_HERDR_AGENT_LOCATION" "$FAKE_HERDR_WORKSPACES" \
    "$FAKE_HERDR_WORKSPACE_COUNTER" "$ORCHESTRATOR_MARKER" \
    "$ORCHESTRATOR_RUNTIME" "$FAKE_OPEN_LOG" "$FAKE_LAUNCHCTL_LOG" \
    "$FAKE_HERDR_CLOSE_STATE_LOG" "$FAKE_HERDR_FOREGROUND_PANE_FILE" \
    "$FAKE_HERDR_AGENT_LIST_FAILURE" "$FAKE_HERDR_WORKSPACE_LIST_FAILURE" \
    "$FAKE_HERDR_FOCUSED_WORKSPACE_FILE"
  rm -rf "$FAKE_HERDR_STATE_LOCK"
  : > "$FAKE_HERDR_LOG"
  : > "$FAKE_HTTP_LOG"
  unset FAKE_ORCHESTRATOR_MODE
  unset HANCHOU_TEST_AGENT_START_DELAY
  unset HANCHOU_TEST_AGENT_LAUNCH_PENDING
  unset HANCHOU_TEST_AGENT_GET_ERROR
  unset HANCHOU_TEST_AGENT_KIND
  unset HANCHOU_TEST_DUPLICATE_AGENT
  unset HANCHOU_TEST_WORKSPACE_CLOSE_FAIL_IDS
  unset HANCHOU_TEST_WORKSPACE_BAD_SHAPE_ID
  unset HANCHOU_TEST_WORKSPACE_WORKTREE_ID
  unset HANCHOU_TEST_PROCESS_INFO_OMIT_ID
  unset HANCHOU_TEST_FOREGROUND_AFTER_CLOSE_ID
  unset HANCHOU_TEST_FOREGROUND_TARGET_PANE
  unset HANCHOU_TEST_FOREGROUND_CWD_ID
  unset HANCHOU_TEST_FOREGROUND_CWD_VALUE
  unset HANCHOU_TEST_AGENT_LIST_FAIL_AFTER_CLOSE_ID
  unset HANCHOU_TEST_WORKSPACE_LIST_FAIL_AFTER_CLOSE_ID
  unset HANCHOU_TEST_KEEP_AGENT_AFTER_CLOSE_ID
  unset HANCHOU_TEST_KEEP_WORKSPACE_AFTER_CLOSE_ID
  unset HANCHOU_TEST_FOCUS_AFTER_CLOSE_ID
  unset HANCHOU_TEST_FOCUS_TARGET_WORKSPACE
  unset HANCHOU_TEST_PS_BACKGROUND
  unset HANCHOU_TEST_PS_FAIL
  export HANCHOU_TEST_HERDR_CONTROL_READY=1
}

orchestrator_action_count() {
  grep -Ec '^(workspace create|agent start|agent rename|agent prompt)' "$FAKE_HERDR_LOG" || true
}

workspace_create_count() {
  grep -Ec '^workspace create ' "$FAKE_HERDR_LOG" || true
}

agent_start_count() {
  grep -Ec '^agent start ' "$FAKE_HERDR_LOG" || true
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

wait_for_log_pattern() {
  local pattern="$1"
  for _attempt in {1..100}; do
    grep -Eq "$pattern" "$FAKE_HERDR_LOG" && return 0
    sleep 0.02
  done
  echo "timed out waiting for Herdr log pattern: $pattern" >&2
  cat "$FAKE_HERDR_LOG" >&2
  return 1
}

write_ready_marker() {
  local identity="${1:-term-w1}"
  mkdir -p "$CONTROL_DIR"
  printf '%s\n' "{\"identity\":\"$identity\",\"initialized_at\":\"2026-08-31T00:00:00.000Z\"}" \
    > "$ORCHESTRATOR_MARKER"
  chmod 600 "$ORCHESTRATOR_MARKER"
}

append_workspace() {
  local workspace_id="$1"
  local label="${2:-00-orchestrator}"
  local workspace_cwd="${3:-$ROOT}"
  local tab_id="${workspace_id}:t1"
  local pane_id="${tab_id}:p1"
  local terminal_id="${4:-term-${workspace_id}}"
  printf '%s|%s|%s|%s|%s|%s\n' \
    "$workspace_id" "$label" "$tab_id" "$pane_id" "$terminal_id" "$workspace_cwd" \
    >> "$FAKE_HERDR_WORKSPACES"
}

write_runtime_binding() {
  local workspace_id="${1:-w1}"
  local terminal_id="${2:-term-${workspace_id}}"
  local tab_id="${workspace_id}:t1"
  local pane_id="${tab_id}:p1"
  mkdir -p "$CONTROL_DIR"
  printf '%s\n' "{\"schema\":\"hanchou.orchestrator-runtime.v1\",\"profile\":\"work\",\"session\":\"work\",\"agent_name\":\"orchestrator\",\"workspace_label\":\"00-orchestrator\",\"cwd\":\"$ROOT\",\"workspace_id\":\"$workspace_id\",\"tab_id\":\"$tab_id\",\"pane_id\":\"$pane_id\",\"terminal_id\":\"$terminal_id\",\"created_at\":\"2026-08-31T00:00:00.000Z\",\"updated_at\":\"2026-08-31T00:00:00.000Z\"}" \
    > "$ORCHESTRATOR_RUNTIME"
  chmod 600 "$ORCHESTRATOR_RUNTIME"
}

seed_bound_agent() {
  local status="$1"
  append_workspace w1
  printf '%s\n' 1 > "$FAKE_HERDR_WORKSPACE_COUNTER"
  printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
  printf '%s\n' 'w1|w1:t1|w1:t1:p1|term-w1' > "$FAKE_HERDR_AGENT_LOCATION"
  printf '%s\n' "$status" > "$FAKE_HERDR_AGENT_STATE"
  write_runtime_binding w1
}

assert_no_workspace_close() {
  if grep -q '^workspace close ' "$FAKE_HERDR_LOG"; then
    echo "start-orchestrator must not destructively close a workspace" >&2
    cat "$FAKE_HERDR_LOG" >&2
    exit 1
  fi
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
grep -Fq 'list any in-progress or blocked Beads tasks' "$FAKE_HERDR_LOG"
grep -Fq 'state the number of currently running delegated tasks; explicitly report zero for each empty result' "$FAKE_HERDR_LOG"
grep -q '^http://127\.0\.0\.1:3747/health$' "$FAKE_HTTP_LOG"
grep -q '^http://127\.0\.0\.1:3737/$' "$FAKE_HTTP_LOG"
[[ ! -e "$FAKE_OPEN_LOG" ]]
[[ ! -e "$FAKE_LAUNCHCTL_LOG" ]]
[[ -s "$ORCHESTRATOR_RUNTIME" ]]
grep -Fq '"schema":"hanchou.orchestrator-runtime.v1"' "$ORCHESTRATOR_RUNTIME"
grep -Fq '"workspace_id":"w1"' "$ORCHESTRATOR_RUNTIME"
grep -Fq '"pane_id":"w1:t1:p1"' "$ORCHESTRATOR_RUNTIME"
grep -Fq '"terminal_id":"term-w1"' "$ORCHESTRATOR_RUNTIME"
assert_no_workspace_close
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
assert_no_workspace_close

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

# Legacy duplicate workspaces without a durable binding are ambiguous. Fail
# closed instead of guessing which one to reuse or creating a third copy.
reset_fixture
append_workspace w1
append_workspace w2
printf '%s\n' 2 > "$FAKE_HERDR_WORKSPACE_COUNTER"
if hanchou_test start-orchestrator work > "$TMP/legacy-duplicates.out" 2> "$TMP/legacy-duplicates.err"; then
  echo "expected start-orchestrator to reject ambiguous legacy workspaces" >&2
  exit 1
fi
grep -q '00-orchestrator' "$TMP/legacy-duplicates.err"
[[ "$(workspace_create_count)" == "0" ]]
[[ "$(agent_start_count)" == "0" ]]
[[ ! -e "$ORCHESTRATOR_RUNTIME" ]]
assert_no_workspace_close

# A live named Orchestrator is authoritative even when four stale workspaces
# share its label. Keep and bind the live Agent, warn with the stale IDs, and
# never create, restart, prompt, rename, or close anything automatically.
reset_fixture
append_workspace w1
append_workspace w2
append_workspace w3
append_workspace w4
append_workspace w5
printf '%s\n' 5 > "$FAKE_HERDR_WORKSPACE_COUNTER"
printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w1|w1:t1|w1:t1:p1|term-w1' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
write_ready_marker term-w1
hanchou_test start-orchestrator work > "$TMP/named-with-duplicates.out"
grep -q 'orchestrator already exists: orchestrator' "$TMP/named-with-duplicates.out"
grep -q '^WARN ' "$TMP/named-with-duplicates.out"
grep -q 'w2' "$TMP/named-with-duplicates.out"
grep -q 'w5' "$TMP/named-with-duplicates.out"
grep -q '^workspace list$' "$FAKE_HERDR_LOG"
[[ "$(orchestrator_action_count)" == "0" ]]
[[ -s "$ORCHESTRATOR_RUNTIME" ]]
grep -Fq '"workspace_id":"w1"' "$ORCHESTRATOR_RUNTIME"
[[ "$(grep -c '|00-orchestrator|' "$FAKE_HERDR_WORKSPACES" || true)" == "5" ]]
assert_no_workspace_close

# A managed name alone must not override a durable binding. If `orchestrator`
# appears in another same-label workspace, fail closed and leave the recorded
# w1 binding byte-for-byte unchanged.
reset_fixture
append_workspace w1
append_workspace w2
printf '%s\n' 2 > "$FAKE_HERDR_WORKSPACE_COUNTER"
write_runtime_binding w1
RUNTIME_BEFORE="$(cksum "$ORCHESTRATOR_RUNTIME")"
printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w2|w2:t1|w2:t1:p1|term-w2' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
if hanchou_test start-orchestrator work > "$TMP/named-outside-binding.out" 2> "$TMP/named-outside-binding.err"; then
  echo "expected start-orchestrator to reject a named Agent outside its binding" >&2
  exit 1
fi
grep -q 'does not match recorded workspace_id' "$TMP/named-outside-binding.err"
[[ "$(cksum "$ORCHESTRATOR_RUNTIME")" == "$RUNTIME_BEFORE" ]]
[[ "$(orchestrator_action_count)" == "0" ]]
grep -Fq '"workspace_id":"w1"' "$ORCHESTRATOR_RUNTIME"
assert_no_workspace_close

# Herdr may expose the exact bound named Agent before kind detection settles.
# `launch_pending:true` plus matching durable IDs is genuine pending state, not
# an invitation to create or start a replacement. Repeated retries stay inert.
reset_fixture
append_workspace w1
printf '%s\n' 1 > "$FAKE_HERDR_WORKSPACE_COUNTER"
write_runtime_binding w1
printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w1|w1:t1|w1:t1:p1|term-w1' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' unknown > "$FAKE_HERDR_AGENT_STATE"
export HANCHOU_TEST_AGENT_LAUNCH_PENDING=1
hanchou_test start-orchestrator work > "$TMP/bound-launch-pending.out"
grep -q 'exists with status unknown; initialization remains pending' "$TMP/bound-launch-pending.out"
hanchou_test start-orchestrator work > "$TMP/bound-launch-pending-again.out"
grep -q 'exists with status unknown; initialization remains pending' "$TMP/bound-launch-pending-again.out"
[[ "$(orchestrator_action_count)" == "0" ]]
grep -Fq '"workspace_id":"w1"' "$ORCHESTRATOR_RUNTIME"
assert_no_workspace_close
unset HANCHOU_TEST_AGENT_LAUNCH_PENDING

# Without a binding, a correctly named Agent is adoptable only from the exact
# dedicated Hanchou cwd. Do not create a binding or send the initialization
# prompt when its same-label pane belongs to another directory.
reset_fixture
UNBOUND_WRONG_CWD="$TMP/unbound-wrong-cwd"
mkdir -p "$UNBOUND_WRONG_CWD"
append_workspace w1 00-orchestrator "$UNBOUND_WRONG_CWD"
printf '%s\n' 1 > "$FAKE_HERDR_WORKSPACE_COUNTER"
printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w1|w1:t1|w1:t1:p1|term-w1' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
if hanchou_test start-orchestrator work > "$TMP/unbound-wrong-cwd.out" 2> "$TMP/unbound-wrong-cwd.err"; then
  echo "expected start-orchestrator to reject an unbound named Agent in another cwd" >&2
  exit 1
fi
grep -q 'does not match the dedicated Hanchou pane identity' "$TMP/unbound-wrong-cwd.err"
[[ ! -e "$ORCHESTRATOR_RUNTIME" ]]
[[ "$(orchestrator_action_count)" == "0" ]]
assert_no_workspace_close

# If the recorded workspace disappeared but its terminal moved into another
# workspace, preserve the binding and fail closed instead of treating w1 as a
# safely deleted workspace and creating a replacement.
reset_fixture
write_runtime_binding w1
MOVED_RUNTIME_BEFORE="$(cksum "$ORCHESTRATOR_RUNTIME")"
append_workspace w2 00-orchestrator "$ROOT" term-w1
printf '%s\n' 2 > "$FAKE_HERDR_WORKSPACE_COUNTER"
if hanchou_test start-orchestrator work > "$TMP/binding-moved.out" 2> "$TMP/binding-moved.err"; then
  echo "expected start-orchestrator to reject a bound terminal moved to w2" >&2
  exit 1
fi
grep -q 'moved to workspace w2' "$TMP/binding-moved.err"
[[ "$(cksum "$ORCHESTRATOR_RUNTIME")" == "$MOVED_RUNTIME_BEFORE" ]]
grep -q '^pane list$' "$FAKE_HERDR_LOG"
[[ "$(orchestrator_action_count)" == "0" ]]
assert_no_workspace_close

# A trusted binding is still only reusable when the live pane identity matches
# every recorded ID. A changed terminal fails closed without lifecycle writes.
reset_fixture
append_workspace w1
printf '%s\n' 1 > "$FAKE_HERDR_WORKSPACE_COUNTER"
write_runtime_binding w1 term-stale
if hanchou_test start-orchestrator work > "$TMP/binding-terminal.out" 2> "$TMP/binding-terminal.err"; then
  echo "expected start-orchestrator to reject a changed bound terminal" >&2
  exit 1
fi
grep -q 'recorded Orchestrator pane identity changed' "$TMP/binding-terminal.err"
[[ "$(orchestrator_action_count)" == "0" ]]
assert_no_workspace_close

# The same fail-closed rule applies when the bound pane moved to another cwd.
reset_fixture
MISMATCH_CWD="$TMP/not-hanchou"
mkdir -p "$MISMATCH_CWD"
append_workspace w1 00-orchestrator "$MISMATCH_CWD"
printf '%s\n' 1 > "$FAKE_HERDR_WORKSPACE_COUNTER"
write_runtime_binding w1
if hanchou_test start-orchestrator work > "$TMP/binding-cwd.out" 2> "$TMP/binding-cwd.err"; then
  echo "expected start-orchestrator to reject a changed bound cwd" >&2
  exit 1
fi
grep -q 'recorded Orchestrator pane identity changed' "$TMP/binding-cwd.err"
[[ "$(orchestrator_action_count)" == "0" ]]
assert_no_workspace_close

# A failed provider start leaves the newly-created workspace and its durable
# binding intact. Retrying reuses the exact same pane and never creates or
# closes a replacement workspace.
reset_fixture
export FAKE_ORCHESTRATOR_MODE=failed
if hanchou_test start-orchestrator work > "$TMP/start-failed.out" 2> "$TMP/start-failed.err"; then
  echo "expected the simulated provider start failure" >&2
  exit 1
fi
grep -q 'simulated start failure' "$TMP/start-failed.err"
[[ -s "$ORCHESTRATOR_RUNTIME" ]]
grep -Fq '"pane_id":"w1:t1:p1"' "$ORCHESTRATOR_RUNTIME"
[[ "$(workspace_create_count)" == "1" ]]
[[ "$(agent_start_count)" == "1" ]]
assert_no_workspace_close
unset FAKE_ORCHESTRATOR_MODE
hanchou_test start-orchestrator work > "$TMP/start-retry.out"
grep -q 'started codex orchestrator `orchestrator` in pane w1:t1:p1' "$TMP/start-retry.out"
[[ "$(workspace_create_count)" == "1" ]]
[[ "$(agent_start_count)" == "2" ]]
[[ "$(grep -Ec '^agent start orchestrator .*--pane w1:t1:p1' "$FAKE_HERDR_LOG" || true)" == "2" ]]
assert_no_workspace_close

# A blocked first-run Agent is also retained on its bound pane. A second start
# observes the named Agent and does not mutate the lifecycle again.
reset_fixture
export FAKE_ORCHESTRATOR_MODE=blocked
hanchou_test start-orchestrator work > "$TMP/start-blocked.out"
grep -q 'exists with status blocked; initialization remains pending' "$TMP/start-blocked.out"
[[ -s "$ORCHESTRATOR_RUNTIME" ]]
[[ "$(workspace_create_count)" == "1" ]]
[[ "$(agent_start_count)" == "1" ]]
unset FAKE_ORCHESTRATOR_MODE
hanchou_test start-orchestrator work > "$TMP/start-blocked-again.out"
grep -q 'exists with status blocked; initialization remains pending' "$TMP/start-blocked-again.out"
[[ "$(workspace_create_count)" == "1" ]]
[[ "$(agent_start_count)" == "1" ]]
assert_no_workspace_close

# Herdr can report a provider Agent on the bound pane before its managed name
# settles. Recover it by pane identity, rename it, and initialize it in place.
reset_fixture
export FAKE_ORCHESTRATOR_MODE=unnamed
hanchou_test start-orchestrator work > "$TMP/start-unnamed.out"
grep -q 'initialized orchestrator `orchestrator`' "$TMP/start-unnamed.out"
grep -Eq '^agent rename (w1:t1:p1|term-w1) orchestrator$' "$FAKE_HERDR_LOG"
grep -q '^agent prompt orchestrator ' "$FAKE_HERDR_LOG"
[[ "$(workspace_create_count)" == "1" ]]
[[ "$(agent_start_count)" == "1" ]]
assert_no_workspace_close

# Concurrent callers serialize the lookup/create/start transition. Hold the
# first fake start briefly so the second caller overlaps the critical section.
reset_fixture
export HANCHOU_TEST_AGENT_START_DELAY=0.4
hanchou_test start-orchestrator work > "$TMP/concurrent-first.out" 2> "$TMP/concurrent-first.err" &
FIRST_START_PID=$!
wait_for_log_pattern '^agent start orchestrator '
hanchou_test start-orchestrator work > "$TMP/concurrent-second.out" 2> "$TMP/concurrent-second.err" &
SECOND_START_PID=$!
wait "$FIRST_START_PID"
wait "$SECOND_START_PID"
unset HANCHOU_TEST_AGENT_START_DELAY
[[ "$(workspace_create_count)" == "1" ]]
[[ "$(agent_start_count)" == "1" ]]
[[ "$(grep -c '^w1|00-orchestrator|' "$FAKE_HERDR_WORKSPACES" || true)" == "1" ]]
assert_no_workspace_close

# An existing working Agent remains pending and is not duplicated or prompted.
reset_fixture
seed_bound_agent working
hanchou_test launch work --no-browser > "$TMP/pending.out"
grep -q 'exists with status working; initialization remains pending' "$TMP/pending.out"
assert_no_orchestrator_action

# Browser opening is opt-out and is routed only to the configured dashboard.
reset_fixture
seed_bound_agent idle
write_ready_marker
hanchou_test launch work > "$TMP/browser.out"
wait_for_file "$FAKE_OPEN_LOG"
grep -Fxq 'http://127.0.0.1:3747' "$FAKE_OPEN_LOG"
rm -f "$FAKE_OPEN_LOG"
hanchou_test launch work --no-browser > "$TMP/no-browser.out"
sleep 0.1
[[ ! -e "$FAKE_OPEN_LOG" ]]

# Orchestrator opening focuses the Agent and enters the normal multi-client
# Herdr TUI. It must not use the exclusive direct agent-attach transport.
reset_fixture
seed_bound_agent idle
write_ready_marker
hanchou_test open orchestrator work > "$TMP/open-orchestrator.out"
grep -Fxq 'agent focus orchestrator' "$FAKE_HERDR_LOG"
grep -Fxq '<tui>' "$FAKE_HERDR_LOG"
if grep -q '^agent attach ' "$FAKE_HERDR_LOG"; then
  echo "open orchestrator used exclusive direct attach" >&2
  exit 1
fi

# When the durable pane is empty and the managed Agent name is absent, focus
# its owning workspace with Herdr 0.8.2's supported command before opening the
# same full TUI. `pane focus` is not a valid 0.8.2 CLI fallback.
reset_fixture
append_workspace w1
printf '%s\n' 1 > "$FAKE_HERDR_WORKSPACE_COUNTER"
write_runtime_binding w1
hanchou_test open orchestrator work > "$TMP/open-orchestrator-binding.out"
grep -Fxq 'workspace focus w1' "$FAKE_HERDR_LOG"
grep -Fxq '<tui>' "$FAKE_HERDR_LOG"
if grep -Eq '^(agent attach|pane focus) ' "$FAKE_HERDR_LOG"; then
  echo "open orchestrator used an unsupported or exclusive binding fallback" >&2
  cat "$FAKE_HERDR_LOG" >&2
  exit 1
fi

# Stopping is an explicit human-owned destructive command. Without --yes it
# lists all five validated targets and performs no Herdr or local-state write.
reset_fixture
seed_bound_agent idle
write_ready_marker
append_workspace w2
append_workspace w3
append_workspace w4
append_workspace w5
append_workspace w8 other-workspace
printf '%s\n' 8 > "$FAKE_HERDR_WORKSPACE_COUNTER"
hanchou_test stop-orchestrator work --all > "$TMP/stop-plan.out"
STOP_PLAN_TOKEN="$(sed -n 's/^  plan token: //p' "$TMP/stop-plan.out")"
[[ "${#STOP_PLAN_TOKEN}" == "64" && "$STOP_PLAN_TOKEN" != *[!a-f0-9]* ]]
for workspace_id in w1 w2 w3 w4 w5; do grep -q "CLOSE ${workspace_id} /" "$TMP/stop-plan.out"; done
grep -q 'effect: close 5 Herdr workspace(s)' "$TMP/stop-plan.out"
grep -q 'legacy scan: best-effort same-TTY plus shell descendants' "$TMP/stop-plan.out"
grep -Eq 'CLOSE w1 .*processes=2000:agent / observed_additional=n/a / cwd=' "$TMP/stop-plan.out"
grep -Eq 'CLOSE w2 .*processes=1000:zsh / observed_additional=0 / cwd=' "$TMP/stop-plan.out"
grep -q "hanchou stop-orchestrator work --all --plan ${STOP_PLAN_TOKEN} --yes" "$TMP/stop-plan.out"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]
[[ -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" && -e "$FAKE_HERDR_AGENT_STATE" ]]
grep -q '^w8|other-workspace|' "$FAKE_HERDR_WORKSPACES"

# Even with --yes, the production CLI refuses a non-interactive or
# Herdr-managed caller before it can close a workspace.
if hanchou_test stop-orchestrator work --all --plan "$STOP_PLAN_TOKEN" --yes > "$TMP/stop-nontty.out" 2> "$TMP/stop-nontty.err"; then
  echo "expected stop-orchestrator --yes to reject a non-interactive caller" >&2
  exit 1
fi
grep -q 'requires an interactive terminal controlled by the human operator' "$TMP/stop-nontty.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]
if HERDR_ENV=1 stop_orchestrator_apply "$STOP_PLAN_TOKEN" > "$TMP/stop-managed.out" 2> "$TMP/stop-managed.err"; then
  echo "expected stop-orchestrator --yes to reject a Herdr-managed caller" >&2
  exit 1
fi
grep -q 'must be run from an ordinary terminal outside a Herdr-managed Agent' "$TMP/stop-managed.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]
if HANCHOU_AGENT_ID=orchestrator stop_orchestrator_apply "$STOP_PLAN_TOKEN" > "$TMP/stop-agent-caller.out" 2> "$TMP/stop-agent-caller.err"; then
  echo "expected stop-orchestrator --yes to reject a managed Agent identity" >&2
  exit 1
fi
grep -q 'must be run from an ordinary terminal outside a Herdr-managed Agent' "$TMP/stop-agent-caller.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

# The reviewed apply closes empty legacy spaces first and the bound live Agent
# last. It preserves unrelated workspaces and removes lifecycle files only
# after all five closes have succeeded.
export HANCHOU_TEST_FOCUS_AFTER_CLOSE_ID=w2
export HANCHOU_TEST_FOCUS_TARGET_WORKSPACE=w3
stop_orchestrator_apply > "$TMP/stop-apply.out"
STOP_ORDER="$(grep '^workspace close ' "$FAKE_HERDR_LOG" | awk '{print $3}' | paste -sd ' ' -)"
[[ "$STOP_ORDER" == "w2 w3 w4 w5 w1" ]]
for workspace_id in w1 w2 w3 w4 w5; do grep -Fxq "${workspace_id}|runtime=1|marker=1" "$FAKE_HERDR_CLOSE_STATE_LOG"; done
[[ "$(grep -c '^w8|other-workspace|' "$FAKE_HERDR_WORKSPACES" || true)" == "1" ]]
[[ "$(wc -l < "$FAKE_HERDR_WORKSPACES" | tr -d ' ')" == "1" ]]
[[ ! -e "$FAKE_HERDR_AGENT_STATE" && ! -e "$ORCHESTRATOR_RUNTIME" && ! -e "$ORCHESTRATOR_MARKER" ]]
grep -q 'stopped Orchestrator: work (closed 5 workspace(s))' "$TMP/stop-apply.out"

# A newly planned second run is an idempotent no-op. Starting afterward creates
# and binds exactly one new Orchestrator workspace while the unrelated row remains.
CLOSE_COUNT_BEFORE="$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)"
stop_orchestrator_apply > "$TMP/stop-again.out"
grep -q 'orchestrator already stopped: work' "$TMP/stop-again.out"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "$CLOSE_COUNT_BEFORE" ]]
hanchou_test start-orchestrator work > "$TMP/start-after-stop.out"
grep -q 'started codex orchestrator `orchestrator`' "$TMP/start-after-stop.out"
[[ "$(grep -Ec '^workspace create ' "$FAKE_HERDR_LOG" || true)" == "1" ]]
[[ "$(grep -c '|00-orchestrator|' "$FAKE_HERDR_WORKSPACES" || true)" == "1" ]]
[[ -e "$ORCHESTRATOR_RUNTIME" ]]

# The apply token is bound to the exact reviewed target set. A new workspace
# appearing after review invalidates the token before the first close.
reset_fixture
rm -rf "$STATE_ROOT" "$PROFILE_CONFIG_DIR"
append_workspace w1
hanchou_test stop-orchestrator work --all > "$TMP/stop-stale-plan.out"
STALE_STOP_PLAN_TOKEN="$(sed -n 's/^  plan token: //p' "$TMP/stop-stale-plan.out")"
append_workspace w2
if stop_orchestrator_apply "$STALE_STOP_PLAN_TOKEN" > "$TMP/stop-stale-token.out" 2> "$TMP/stop-stale-token.err"; then
  echo "expected a stale stop plan token to fail closed" >&2
  exit 1
fi
grep -q 'reviewed stop plan does not match the current Herdr state; no workspace was closed' "$TMP/stop-stale-token.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]
[[ ! -e "$STATE_ROOT" && ! -e "$PROFILE_CONFIG_DIR" ]]

# A reviewed already-stopped apply is also a no-op and does not bootstrap the
# broader Hanchou state tree merely to acquire a lifecycle lock.
reset_fixture
rm -rf "$STATE_ROOT" "$PROFILE_CONFIG_DIR"
hanchou_test stop-orchestrator work --all > "$TMP/stop-empty-plan.out"
EMPTY_STOP_PLAN_TOKEN="$(sed -n 's/^  plan token: //p' "$TMP/stop-empty-plan.out")"
stop_orchestrator_apply "$EMPTY_STOP_PLAN_TOKEN" > "$TMP/stop-empty-apply.out"
grep -q 'orchestrator already stopped: work' "$TMP/stop-empty-apply.out"
[[ ! -e "$STATE_ROOT" && ! -e "$PROFILE_CONFIG_DIR" ]]

# An unbound legacy workspace is eligible only when its shell is in the Core
# cwd and the foreground/process-table checks find no other work.
reset_fixture
append_workspace w1
printf '%s\n' 'w1:t1:p1' > "$FAKE_HERDR_FOREGROUND_PANE_FILE"
if hanchou_test stop-orchestrator work --all > "$TMP/stop-busy-plan.out" 2> "$TMP/stop-busy-plan.err"; then
  echo "expected a foreground command in a legacy pane to fail closed" >&2
  exit 1
fi
grep -q 'unowned legacy pane is not an available interactive shell' "$TMP/stop-busy-plan.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

reset_fixture
append_workspace w1
export HANCHOU_TEST_PS_BACKGROUND=1
if hanchou_test stop-orchestrator work --all > "$TMP/stop-background-plan.out" 2> "$TMP/stop-background-plan.err"; then
  echo "expected a background job in a legacy pane to fail closed" >&2
  exit 1
fi
grep -q 'available shell has 1 background or descendant process' "$TMP/stop-background-plan.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

reset_fixture
append_workspace w1
export HANCHOU_TEST_PROCESS_INFO_OMIT_ID=w1:t1:p1
if hanchou_test stop-orchestrator work --all > "$TMP/stop-omitted-process-plan.out" 2> "$TMP/stop-omitted-process-plan.err"; then
  echo "expected an omitted empty foreground-process vector to fail closed" >&2
  exit 1
fi
grep -q 'unowned legacy pane is not an available interactive shell' "$TMP/stop-omitted-process-plan.err"
if grep -q 'unexpected Herdr process-info response' "$TMP/stop-omitted-process-plan.err"; then
  echo "official omitted foreground_processes shape was rejected as malformed" >&2
  exit 1
fi

reset_fixture
append_workspace w1
MOVED_SHELL_CWD="$TMP/moved-shell-cwd"
mkdir -p "$MOVED_SHELL_CWD"
export HANCHOU_TEST_FOREGROUND_CWD_ID=w1
export HANCHOU_TEST_FOREGROUND_CWD_VALUE="$MOVED_SHELL_CWD"
if hanchou_test stop-orchestrator work --all > "$TMP/stop-current-cwd-plan.out" 2> "$TMP/stop-current-cwd-plan.err"; then
  echo "expected a legacy shell in another current cwd to fail closed" >&2
  exit 1
fi
grep -q 'available shell is not currently in the Hanchou Core cwd' "$TMP/stop-current-cwd-plan.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

# Same-label panes with an Agent must carry the exact configured name and kind;
# a stale binding alone never authorizes an unrelated or unnamed Agent.
reset_fixture
append_workspace w1
printf '%s\n' reviewer > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w1|w1:t1|w1:t1:p1|term-w1' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
if hanchou_test stop-orchestrator work --all > "$TMP/stop-wrong-name-plan.out" 2> "$TMP/stop-wrong-name-plan.err"; then
  echo "expected an unbound differently named Agent to fail closed" >&2
  exit 1
fi
grep -q 'Agent is not the configured named codex Orchestrator' "$TMP/stop-wrong-name-plan.err"

reset_fixture
seed_bound_agent idle
: > "$FAKE_HERDR_AGENT_NAME"
if hanchou_test stop-orchestrator work --all > "$TMP/stop-missing-name-plan.out" 2> "$TMP/stop-missing-name-plan.err"; then
  echo "expected a bound unnamed Agent to fail closed" >&2
  exit 1
fi
grep -q 'Agent is not the configured codex Orchestrator' "$TMP/stop-missing-name-plan.err"

reset_fixture
seed_bound_agent idle
export HANCHOU_TEST_AGENT_KIND=claude
if hanchou_test stop-orchestrator work --all > "$TMP/stop-wrong-kind-plan.out" 2> "$TMP/stop-wrong-kind-plan.err"; then
  echo "expected a bound wrong-kind Agent to fail closed" >&2
  exit 1
fi
grep -q 'Agent is not the configured codex Orchestrator' "$TMP/stop-wrong-kind-plan.err"

reset_fixture
seed_bound_agent idle
export HANCHOU_TEST_DUPLICATE_AGENT=1
if hanchou_test stop-orchestrator work --all > "$TMP/stop-multiple-agent-plan.out" 2> "$TMP/stop-multiple-agent-plan.err"; then
  echo "expected multiple Agent records in one pane to fail closed" >&2
  exit 1
fi
grep -q 'multiple Agent records occupy its only pane' "$TMP/stop-multiple-agent-plan.err"

# A process identity change after an earlier close stops before the affected
# workspace. Lifecycle state remains durable for a newly reviewed retry.
reset_fixture
seed_bound_agent working
write_ready_marker
append_workspace w2
export HANCHOU_TEST_FOREGROUND_AFTER_CLOSE_ID=w2
export HANCHOU_TEST_FOREGROUND_TARGET_PANE=w1:t1:p1
if stop_orchestrator_apply > "$TMP/stop-identity-change.out" 2> "$TMP/stop-identity-change.err"; then
  echo "expected an apply-time process identity change to fail closed" >&2
  exit 1
fi
grep -q 'workspace w1 changed Agent or process identity during stop' "$TMP/stop-identity-change.err"
grep -q 'closed=\[w2\], remaining=\[w1\], uncertain=\[\]' "$TMP/stop-identity-change.err"
[[ "$(grep -c '^w1|00-orchestrator|' "$FAKE_HERDR_WORKSPACES" || true)" == "1" ]]
[[ -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]

# Every same-label target must pass topology and Core-cwd preflight before the
# first close. One unsafe row therefore leaves every row untouched.
reset_fixture
append_workspace w1
UNSAFE_STOP_CWD="$TMP/unsafe-stop-cwd"
mkdir -p "$UNSAFE_STOP_CWD"
append_workspace w2 00-orchestrator "$UNSAFE_STOP_CWD"
if stop_orchestrator_apply > "$TMP/stop-unsafe.out" 2> "$TMP/stop-unsafe.err"; then
  echo "expected stop-orchestrator to reject a same-label workspace in another cwd" >&2
  exit 1
fi
grep -q 'pane identity or cwd does not match the Hanchou Core' "$TMP/stop-unsafe.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]
[[ "$(wc -l < "$FAKE_HERDR_WORKSPACES" | tr -d ' ')" == "2" ]]

reset_fixture
append_workspace w1
export HANCHOU_TEST_WORKSPACE_BAD_SHAPE_ID=w1
if stop_orchestrator_apply > "$TMP/stop-shape.out" 2> "$TMP/stop-shape.err"; then
  echo "expected stop-orchestrator to reject a multi-pane same-label workspace" >&2
  exit 1
fi
grep -q 'expected one tab, one pane, and no worktree' "$TMP/stop-shape.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

reset_fixture
append_workspace w1
export HANCHOU_TEST_WORKSPACE_WORKTREE_ID=w1
if stop_orchestrator_apply > "$TMP/stop-worktree.out" 2> "$TMP/stop-worktree.err"; then
  echo "expected stop-orchestrator to reject a worktree-backed same-label workspace" >&2
  exit 1
fi
grep -q 'expected one tab, one pane, and no worktree' "$TMP/stop-worktree.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

# The configured Agent name outside the dedicated label set is never included
# by --all and therefore makes the whole stop fail closed.
reset_fixture
append_workspace w8 other-workspace
printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w8|w8:t1|w8:t1:p1|term-w8' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' idle > "$FAKE_HERDR_AGENT_STATE"
if stop_orchestrator_apply > "$TMP/stop-agent-outside.out" 2> "$TMP/stop-agent-outside.err"; then
  echo "expected stop-orchestrator to reject the configured Agent outside its label set" >&2
  exit 1
fi
grep -q 'named Agent `orchestrator` is outside the dedicated' "$TMP/stop-agent-outside.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

# A close failure is fail-fast. Empty legacy rows already closed stay closed,
# but the bound workspace, Agent, binding, and marker survive for a safe retry.
reset_fixture
seed_bound_agent working
write_ready_marker
append_workspace w2
append_workspace w3
export HANCHOU_TEST_WORKSPACE_CLOSE_FAIL_IDS=w1
if stop_orchestrator_apply > "$TMP/stop-partial.out" 2> "$TMP/stop-partial.err"; then
  echo "expected simulated bound workspace close failure" >&2
  exit 1
fi
grep -q 'closed=\[w2, w3\], remaining=\[w1\]' "$TMP/stop-partial.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "3" ]]
[[ "$(grep -c '^w1|00-orchestrator|' "$FAKE_HERDR_WORKSPACES" || true)" == "1" ]]
[[ -e "$FAKE_HERDR_AGENT_STATE" && -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]
unset HANCHOU_TEST_WORKSPACE_CLOSE_FAIL_IDS
stop_orchestrator_apply > "$TMP/stop-partial-retry.out"
[[ ! -s "$FAKE_HERDR_WORKSPACES" ]]
[[ ! -e "$FAKE_HERDR_AGENT_STATE" && ! -e "$ORCHESTRATOR_RUNTIME" && ! -e "$ORCHESTRATOR_MARKER" ]]

# A failed first close is fail-fast with no target loss.
reset_fixture
append_workspace w1
append_workspace w2
export HANCHOU_TEST_WORKSPACE_CLOSE_FAIL_IDS=w1
if stop_orchestrator_apply > "$TMP/stop-first-failure.out" 2> "$TMP/stop-first-failure.err"; then
  echo "expected the first legacy workspace close to fail" >&2
  exit 1
fi
grep -q 'closed=\[\], remaining=\[w1, w2\], uncertain=\[\]' "$TMP/stop-first-failure.err"
[[ "$(wc -l < "$FAKE_HERDR_WORKSPACES" | tr -d ' ')" == "2" ]]

# A success response without disappearance is not accepted as a close.
reset_fixture
seed_bound_agent working
write_ready_marker
export HANCHOU_TEST_KEEP_WORKSPACE_AFTER_CLOSE_ID=w1
if stop_orchestrator_apply > "$TMP/stop-success-still-live.out" 2> "$TMP/stop-success-still-live.err"; then
  echo "expected a success response with a live workspace to fail verification" >&2
  exit 1
fi
grep -q 'Herdr returned success but workspace w1 is still present' "$TMP/stop-success-still-live.err"
grep -q 'closed=\[\], remaining=\[w1\], uncertain=\[\]' "$TMP/stop-success-still-live.err"
[[ -e "$FAKE_HERDR_AGENT_STATE" && -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]

# Losing the control plane immediately after a close reports the current ID as
# uncertain and never clears local lifecycle state.
reset_fixture
seed_bound_agent working
write_ready_marker
export HANCHOU_TEST_WORKSPACE_LIST_FAIL_AFTER_CLOSE_ID=w1
if stop_orchestrator_apply > "$TMP/stop-post-close-list.out" 2> "$TMP/stop-post-close-list.err"; then
  echo "expected a post-close workspace-list failure" >&2
  exit 1
fi
grep -q 'cannot verify workspace w1 after its close request' "$TMP/stop-post-close-list.err"
grep -q 'closed=\[\], remaining=\[w1\], uncertain=\[w1\]' "$TMP/stop-post-close-list.err"
[[ ! -s "$FAKE_HERDR_WORKSPACES" ]]
[[ -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]

# A stale named Agent record after workspace disappearance prevents final state
# cleanup and is reported as an uncertain final verification.
reset_fixture
seed_bound_agent working
write_ready_marker
export HANCHOU_TEST_KEEP_AGENT_AFTER_CLOSE_ID=w1
if stop_orchestrator_apply > "$TMP/stop-agent-remains.out" 2> "$TMP/stop-agent-remains.err"; then
  echo "expected a stale Agent record after close to fail final verification" >&2
  exit 1
fi
grep -q 'named Agent `orchestrator` is outside the dedicated' "$TMP/stop-agent-remains.err"
grep -q 'closed=\[w1\], remaining=\[\], uncertain=\[final-state\]' "$TMP/stop-agent-remains.err"
[[ -e "$FAKE_HERDR_AGENT_STATE" && -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]

# If a later revalidation probe fails after an earlier close, the result still
# reports the known closed and remaining IDs and preserves bound lifecycle state.
reset_fixture
append_workspace w1
append_workspace w2
printf '%s\n' orchestrator > "$FAKE_HERDR_AGENT_NAME"
printf '%s\n' 'w2|w2:t1|w2:t1:p1|term-w2' > "$FAKE_HERDR_AGENT_LOCATION"
printf '%s\n' working > "$FAKE_HERDR_AGENT_STATE"
write_runtime_binding w2 term-w2
write_ready_marker term-w2
export HANCHOU_TEST_AGENT_LIST_FAIL_AFTER_CLOSE_ID=w1
if stop_orchestrator_apply > "$TMP/stop-next-snapshot.out" 2> "$TMP/stop-next-snapshot.err"; then
  echo "expected a later snapshot failure after one close" >&2
  exit 1
fi
grep -q 'cannot revalidate before closing workspace w2' "$TMP/stop-next-snapshot.err"
grep -q 'closed=\[w1\], remaining=\[w2\], uncertain=\[\]' "$TMP/stop-next-snapshot.err"
[[ "$(grep -c '^w2|00-orchestrator|' "$FAKE_HERDR_WORKSPACES" || true)" == "1" ]]
[[ -e "$FAKE_HERDR_AGENT_STATE" && -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]

# A missing bound workspace is stale only when its terminal disappeared too.
# A moved terminal remains outside the command's destructive scope.
reset_fixture
write_runtime_binding w1 term-w1
write_ready_marker term-w1
append_workspace w8 other-workspace "$ROOT" term-w1
if stop_orchestrator_apply > "$TMP/stop-moved.out" 2> "$TMP/stop-moved.err"; then
  echo "expected stop-orchestrator to reject a moved bound terminal" >&2
  exit 1
fi
grep -q 'bound terminal term-w1 moved to workspace w8' "$TMP/stop-moved.err"
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]
[[ -e "$ORCHESTRATOR_RUNTIME" && -e "$ORCHESTRATOR_MARKER" ]]

# With no live workspace or moved terminal, a reviewed apply can clean only stale
# lifecycle files and remains a no-op for every other Hanchou subsystem.
reset_fixture
write_runtime_binding w1 term-w1
write_ready_marker term-w1
stop_orchestrator_apply > "$TMP/stop-stale-state.out"
grep -q 'stopped Orchestrator: work (closed 0 workspace(s))' "$TMP/stop-stale-state.out"
[[ ! -e "$ORCHESTRATOR_RUNTIME" && ! -e "$ORCHESTRATOR_MARKER" ]]
[[ "$(grep -Ec '^workspace close ' "$FAKE_HERDR_LOG" || true)" == "0" ]]

# HerdrM is optional: absence and socket mismatch warn without opening it.
HERDRM_APP="$HANCHOU_TEST_OPERATOR_HOME/Applications/HerdrM.app"
NAMED_SOCKET="$HANCHOU_TEST_OPERATOR_HOME/.config/herdr/sessions/work/herdr.sock"
DEFAULT_SOCKET="$HANCHOU_TEST_OPERATOR_HOME/.config/herdr/herdr.sock"
SOCKET_READY="$TMP/socket-ready"
rm -rf "$(dirname "$DEFAULT_SOCKET")" "$HANCHOU_TEST_OPERATOR_HOME/Applications"
reset_fixture
seed_bound_agent idle
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
grep -q 'hanchou open orchestrator' "$TMP/herdrm-match.out"
grep -Eiq 'ctrl\+b( then)? q' "$TMP/herdrm-match.out"
wait_for_file "$FAKE_OPEN_LOG"
grep -Fxq -- '-a herdrm' "$FAKE_OPEN_LOG"

echo "launch fake E2E passed"
