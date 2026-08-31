#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
LOCK_TEST_PID=""
cleanup() {
  if [[ -n "$LOCK_TEST_PID" ]]; then
    kill "$LOCK_TEST_PID" 2>/dev/null || true
    wait "$LOCK_TEST_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

TEST_HOME="$TMP/home"
TEST_CONFIG="$TMP/config"
FAKE_BIN="$TMP/bin"
LAUNCHCTL_STATE="$TMP/launchctl.state"
LAUNCHCTL_LOG="$TMP/launchctl.log"
LAUNCHCTL_RETRY_STATE="$TMP/launchctl-retry.state"
mkdir -p "$TEST_HOME" "$FAKE_BIN"
TEST_HOME_REAL="$(cd "$TEST_HOME" && pwd -P)"
cp -R "$ROOT/config" "$TEST_CONFIG"

for command_name in bd bdui; do
  printf '#!/bin/sh\nexit 0\n' > "$FAKE_BIN/$command_name"
  chmod 755 "$FAKE_BIN/$command_name"
done
PINNED_HERDR="$TMP/pinned/herdr/0.8.2/herdr"
mkdir -p "$(dirname "$PINNED_HERDR")"
printf '#!/bin/sh\nexit 0\n' > "$PINNED_HERDR"
chmod 755 "$PINNED_HERDR"
PINNED_HERDR="$(node -p 'require("node:fs").realpathSync(process.argv[1])' "$PINNED_HERDR")"
export HANCHOU_PINNED_HERDR_BIN="$PINNED_HERDR"
export HANCHOU_PINNED_NODE_BIN
HANCHOU_PINNED_NODE_BIN="$(node -p 'require("node:fs").realpathSync(process.execPath)')"

cat > "$FAKE_BIN/launchctl" <<'SH'
#!/bin/sh
set -eu
: "${FAKE_LAUNCHCTL_STATE:?}"
: "${FAKE_LAUNCHCTL_LOG:?}"
printf '%s\n' "$*" >> "$FAKE_LAUNCHCTL_LOG"
case "$1" in
  print)
    case "$2" in
      *.dashboard)
        if [ -n "${FAKE_LAUNCHCTL_GATE:-}" ]; then
          : > "$FAKE_LAUNCHCTL_GATE.started"
          while [ ! -e "$FAKE_LAUNCHCTL_GATE.release" ]; do sleep 0.02; done
        fi
        ;;
    esac
    grep -Fqx "$2" "$FAKE_LAUNCHCTL_STATE" 2>/dev/null
    ;;
  bootstrap)
    label="$(basename "$3" .plist)"
    if [ "${FAKE_REQUIRE_HERDR_SETTLED:-0}" = "1" ] && [ "$label" = "dev.hanchou.work.herdr" ]; then
      for settled_path in "${FAKE_HERDR_SETTLE_PATH:-}" "${FAKE_HERDR_CLIENT_SETTLE_PATH:-}"; do
        [ -z "$settled_path" ] || [ ! -e "$settled_path" ] || { echo "Herdr endpoint still present before bootstrap: $settled_path" >&2; exit 93; }
      done
    fi
    if [ "${FAKE_REQUIRE_ALL_PLISTS:-0}" = "1" ]; then
      for required in \
        "$HOME/Library/LaunchAgents/dev.hanchou.work.herdr.plist" \
        "$HOME/Library/LaunchAgents/dev.hanchou.work.beads-ui.plist" \
        "$HOME/Library/LaunchAgents/dev.hanchou.work.dashboard.plist"; do
        [ -f "$required" ] || { echo "missing prepared plist: $required" >&2; exit 91; }
      done
    fi
    if [ "${FAKE_REQUIRE_ALL_MARKERS:-0}" = "1" ] && [ "$label" = "dev.hanchou.work.dashboard" ]; then
      for required in \
        "$HOME/.config/hanchou/work/generated/.dev.hanchou.work.herdr.reload-pending" \
        "$HOME/.config/hanchou/work/generated/.dev.hanchou.work.beads-ui.reload-pending" \
        "$HOME/.config/hanchou/work/generated/.dev.hanchou.work.dashboard.reload-pending"; do
        [ -f "$required" ] || { echo "missing durable reload marker: $required" >&2; exit 92; }
      done
    fi
    if [ "${FAKE_LAUNCHCTL_BOOTSTRAP_FAILURES:-0}" -gt 0 ]; then
      : "${FAKE_LAUNCHCTL_RETRY_STATE:?}"
      attempts=0
      [ ! -f "$FAKE_LAUNCHCTL_RETRY_STATE" ] || attempts="$(cat "$FAKE_LAUNCHCTL_RETRY_STATE")"
      if [ "$attempts" -lt "$FAKE_LAUNCHCTL_BOOTSTRAP_FAILURES" ]; then
        printf '%s\n' "$((attempts + 1))" > "$FAKE_LAUNCHCTL_RETRY_STATE"
        echo "simulated launchctl bootstrap race" >&2
        exit 5
      fi
    fi
    printf '%s/%s\n' "$2" "$label" >> "$FAKE_LAUNCHCTL_STATE"
    ;;
  bootout)
    grep -Fvx "$2" "$FAKE_LAUNCHCTL_STATE" > "$FAKE_LAUNCHCTL_STATE.next" 2>/dev/null || true
    mv "$FAKE_LAUNCHCTL_STATE.next" "$FAKE_LAUNCHCTL_STATE"
    case "$2" in
      *.herdr)
        for settle_path in "${FAKE_HERDR_SETTLE_PATH:-}" "${FAKE_HERDR_CLIENT_SETTLE_PATH:-}"; do
          [ -z "$settle_path" ] || (sleep 0.3; rm -f "$settle_path") >/dev/null 2>&1 &
        done
        ;;
    esac
    ;;
  kickstart)
    grep -Fqx "$2" "$FAKE_LAUNCHCTL_STATE"
    ;;
  *) exit 2 ;;
esac
SH
chmod 755 "$FAKE_BIN/launchctl"
TEST_PATH="$FAKE_BIN:$(dirname "$(command -v node)"):/usr/bin:/bin"

HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
  node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" work \
  > "$TMP/first.out"

GENERATED="$TEST_HOME/.config/hanchou/work/generated"
HERDR_PLIST="$GENERATED/dev.hanchou.work.herdr.plist"
BEADS_UI_PLIST="$GENERATED/dev.hanchou.work.beads-ui.plist"
DASHBOARD_PLIST="$GENERATED/dev.hanchou.work.dashboard.plist"

for path in "$HERDR_PLIST" "$BEADS_UI_PLIST" "$DASHBOARD_PLIST"; do
  [[ -f "$path" ]]
done
[[ "$(grep -c '^wrote ' "$TMP/first.out")" == "3" ]]

grep -Fq "<string>$PINNED_HERDR</string>" "$HERDR_PLIST"
grep -Fq "<string>$HANCHOU_PINNED_NODE_BIN</string>" "$DASHBOARD_PLIST"
grep -Fq "<key>BDUI_RUNTIME_DIR</key><string>$TEST_HOME_REAL/.local/share/hanchou/work/run/beads-ui</string>" "$BEADS_UI_PLIST"

grep -q '<string>dev.hanchou.work.dashboard</string>' "$DASHBOARD_PLIST"
grep -q '<string>dashboard</string>' "$DASHBOARD_PLIST"
grep -q '<string>serve</string>' "$DASHBOARD_PLIST"
grep -q '<string>work</string>' "$DASHBOARD_PLIST"
grep -q '<key>RunAtLoad</key><true/>' "$DASHBOARD_PLIST"
grep -q '<key>KeepAlive</key><true/>' "$DASHBOARD_PLIST"
grep -q '<key>HANCHOU_SERVICE_FINGERPRINT</key><string>[0-9a-f]\{64\}</string>' "$DASHBOARD_PLIST"
grep -q '<key>HANCHOU_DASHBOARD_PORT</key><string>3747</string>' "$DASHBOARD_PLIST"
grep -q "$TEST_HOME/.local/share/hanchou/work/logs/dashboard.err.log" "$DASHBOARD_PLIST"
if grep -q '{{' "$DASHBOARD_PLIST"; then
  echo "dashboard plist contains an unresolved placeholder" >&2
  exit 1
fi

HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
  node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" work \
  > "$TMP/second.out"
[[ "$(grep -c '^current ' "$TMP/second.out")" == "3" ]]
if find "$GENERATED" -name '*.bak.*' | grep -q .; then
  echo "idempotent rendering unexpectedly created a backup" >&2
  exit 1
fi

node --input-type=module - "$TEST_CONFIG/profiles/work.toml" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const path = process.argv[2];
const current = readFileSync(path, "utf8");
const updated = current.replace('dashboard_port = 3747', 'dashboard_port = 4747');
if (updated === current) throw new Error("dashboard port fixture was not updated");
writeFileSync(path, updated);
JS
HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
  node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" work \
  > "$TMP/changed.out"
[[ "$(grep -c '^wrote ' "$TMP/changed.out")" == "1" ]]
[[ "$(grep -c '^current ' "$TMP/changed.out")" == "2" ]]
grep -q '<key>HANCHOU_DASHBOARD_PORT</key><string>4747</string>' "$DASHBOARD_PLIST"
find "$GENERATED" -name 'dev.hanchou.work.dashboard.plist.bak.*' | grep -q .
if find "$GENERATED" \( -name 'dev.hanchou.work.herdr.plist.bak.*' -o -name 'dev.hanchou.work.beads-ui.plist.bak.*' \) | grep -q .; then
  echo "dashboard-only config change unexpectedly invalidated another service" >&2
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  : > "$LAUNCHCTL_STATE"
  : > "$LAUNCHCTL_LOG"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-first.out"
  [[ "$(grep -c '^bootstrap ' "$LAUNCHCTL_LOG")" == "3" ]]
  if find "$GENERATED" -name '*.reload-pending' | grep -q .; then
    echo "successful initial install left a reload marker" >&2
    exit 1
  fi
  if find "$GENERATED" -name '.launchd-install.*' | grep -q .; then
    echo "successful initial install left a lock artifact" >&2
    exit 1
  fi

  : > "$LAUNCHCTL_LOG"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-current.out"
  grep -q '^kickstart gui/[0-9][0-9]*/dev\.hanchou\.work\.beads-ui$' "$LAUNCHCTL_LOG"
  if grep -q '^kickstart .*\(herdr\|dashboard\)$\|^bootout ' "$LAUNCHCTL_LOG"; then
    echo "current service recovery restarted an unrelated healthy service" >&2
    exit 1
  fi

  # The profile-scoped hard-link lock must reject a concurrent install before
  # either invocation can overwrite or clear the other's reload markers.
  INSTALL_GATE="$TMP/install-lock-gate"
  : > "$LAUNCHCTL_LOG"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    FAKE_LAUNCHCTL_GATE="$INSTALL_GATE" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-locked-first.out" &
  LOCK_TEST_PID=$!
  for _ in $(seq 1 100); do
    [[ ! -e "$INSTALL_GATE.started" ]] || break
    sleep 0.02
  done
  [[ -e "$INSTALL_GATE.started" ]]
  if HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-locked-second.out" 2> "$TMP/install-locked-second.err"; then
    echo "concurrent profile install unexpectedly acquired the lock" >&2
    exit 1
  fi
  grep -q 'another LaunchAgent install is already running for profile work' "$TMP/install-locked-second.err"
  : > "$INSTALL_GATE.release"
  wait "$LOCK_TEST_PID"
  LOCK_TEST_PID=""
  if find "$GENERATED" -name '.launchd-install.*' | grep -q .; then
    echo "concurrent install handling left a lock artifact" >&2
    exit 1
  fi

  # A lock left by a dead process is recovered without manual deletion.
  INSTALL_LOCK="$GENERATED/.launchd-install.lock"
  STALE_LOCK_TOKEN="00000000000000000000000000000000"
  STALE_LOCK_OWNER="$GENERATED/.launchd-install.owner.2147483647.$STALE_LOCK_TOKEN"
  printf '%s\n' '{"schema":"hanchou.launchd-install-lock.v1","profile":"work","pid":2147483647,"token":"00000000000000000000000000000000"}' > "$STALE_LOCK_OWNER"
  chmod 600 "$STALE_LOCK_OWNER"
  ln "$STALE_LOCK_OWNER" "$INSTALL_LOCK"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-stale-lock.out"
  [[ ! -e "$INSTALL_LOCK" && ! -e "$STALE_LOCK_OWNER" ]]

  HERDR_INSTALLED="$TEST_HOME/Library/LaunchAgents/dev.hanchou.work.herdr.plist"
  BEADS_UI_INSTALLED="$TEST_HOME/Library/LaunchAgents/dev.hanchou.work.beads-ui.plist"
  DASHBOARD_INSTALLED="$TEST_HOME/Library/LaunchAgents/dev.hanchou.work.dashboard.plist"
  HERDR_MARKER="$GENERATED/.dev.hanchou.work.herdr.reload-pending"
  BEADS_UI_MARKER="$GENERATED/.dev.hanchou.work.beads-ui.reload-pending"
  DASHBOARD_MARKER="$GENERATED/.dev.hanchou.work.dashboard.reload-pending"
  HERDR_SETTLE_PATH="$TEST_HOME/.config/herdr/sessions/work/herdr.sock"
  HERDR_CLIENT_SETTLE_PATH="$TEST_HOME/.config/herdr/sessions/work/herdr-client.sock"
  mkdir -p "$(dirname "$HERDR_SETTLE_PATH")"
  : > "$HERDR_SETTLE_PATH"
  : > "$HERDR_CLIENT_SETTLE_PATH"
  for path in "$HERDR_INSTALLED" "$BEADS_UI_INSTALLED" "$DASHBOARD_INSTALLED"; do
    printf '\n' >> "$path"
  done
  : > "$LAUNCHCTL_LOG"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    FAKE_HERDR_SETTLE_PATH="$HERDR_SETTLE_PATH" \
    FAKE_HERDR_CLIENT_SETTLE_PATH="$HERDR_CLIENT_SETTLE_PATH" \
    FAKE_REQUIRE_HERDR_SETTLED=1 FAKE_REQUIRE_ALL_MARKERS=1 \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-all-reload.out"
  [[ "$(grep -c '^bootout ' "$LAUNCHCTL_LOG")" == "3" ]]
  grep -q '^bootout gui/[0-9][0-9]*/dev\.hanchou\.work\.herdr$' "$LAUNCHCTL_LOG"
  grep -q '^bootstrap gui/[0-9][0-9]* .*/dev\.hanchou\.work\.herdr\.plist$' "$LAUNCHCTL_LOG"
  [[ ! -e "$HERDR_SETTLE_PATH" && ! -e "$HERDR_CLIENT_SETTLE_PATH" ]]
  grep -q '^loaded gui/[0-9][0-9]*/dev\.hanchou\.work\.herdr$' "$TMP/install-all-reload.out"
  for marker in "$HERDR_MARKER" "$BEADS_UI_MARKER" "$DASHBOARD_MARKER"; do
    [[ ! -e "$marker" ]]
  done

  # Simulate a crash after every destination plist was written and after only
  # Dashboard reload completed. Durable markers must force the remaining
  # already-loaded services through reload on the next invocation.
  printf '{}\n' > "$BEADS_UI_MARKER"
  printf '{}\n' > "$HERDR_MARKER"
  chmod 600 "$BEADS_UI_MARKER" "$HERDR_MARKER"
  : > "$LAUNCHCTL_LOG"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-marker-recovery.out"
  grep -q '^bootout gui/[0-9][0-9]*/dev\.hanchou\.work\.beads-ui$' "$LAUNCHCTL_LOG"
  grep -q '^bootout gui/[0-9][0-9]*/dev\.hanchou\.work\.herdr$' "$LAUNCHCTL_LOG"
  if grep -q '^bootout gui/[0-9][0-9]*/dev\.hanchou\.work\.dashboard$' "$LAUNCHCTL_LOG"; then
    echo "cleared Dashboard marker caused an unnecessary recovery reload" >&2
    exit 1
  fi
  [[ ! -e "$BEADS_UI_MARKER" && ! -e "$HERDR_MARKER" ]]

  # A persistent socket pathname can be stale after a crash. The pinned Herdr
  # owns the final live/stale connect check, so Hanchou must not deadlock every
  # future bootstrap on the pathname alone.
  : > "$HERDR_CLIENT_SETTLE_PATH"
  printf '\n' >> "$HERDR_INSTALLED"
  : > "$LAUNCHCTL_LOG"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-stale-socket.out"
  grep -q "^WARN old service endpoint remains after 10 seconds; deferring live/stale socket handling to the pinned service: $HERDR_CLIENT_SETTLE_PATH" "$TMP/install-stale-socket.out"
  grep -q '^loaded gui/[0-9][0-9]*/dev\.hanchou\.work\.herdr$' "$TMP/install-stale-socket.out"
  [[ -e "$HERDR_CLIENT_SETTLE_PATH" ]]
  rm -f "$HERDR_CLIENT_SETTLE_PATH"

  : > "$LAUNCHCTL_STATE"
  : > "$LAUNCHCTL_LOG"
  rm -f "$LAUNCHCTL_RETRY_STATE"
  HOME="$TEST_HOME" PATH="$TEST_PATH" HANCHOU_CONFIG_ROOT="$TEST_CONFIG" \
    FAKE_LAUNCHCTL_STATE="$LAUNCHCTL_STATE" FAKE_LAUNCHCTL_LOG="$LAUNCHCTL_LOG" \
    FAKE_LAUNCHCTL_RETRY_STATE="$LAUNCHCTL_RETRY_STATE" \
    FAKE_LAUNCHCTL_BOOTSTRAP_FAILURES=3 FAKE_REQUIRE_ALL_PLISTS=1 \
    node --experimental-strip-types "$ROOT/scripts/render-launchd.ts" --install work \
    > "$TMP/install-retry.out"
  [[ "$(cat "$LAUNCHCTL_RETRY_STATE")" == "3" ]]
  [[ "$(grep -c '^bootstrap ' "$LAUNCHCTL_LOG")" == "6" ]]
  grep -q '^loaded gui/[0-9][0-9]*/dev\.hanchou\.work\.dashboard$' "$TMP/install-retry.out"
  grep -q '^loaded gui/[0-9][0-9]*/dev\.hanchou\.work\.herdr$' "$TMP/install-retry.out"
fi

echo "LaunchAgent rendering lifecycle ok"
