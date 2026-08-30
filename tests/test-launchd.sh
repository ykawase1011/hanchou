#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TEST_HOME="$TMP/home"
TEST_CONFIG="$TMP/config"
FAKE_BIN="$TMP/bin"
LAUNCHCTL_STATE="$TMP/launchctl.state"
LAUNCHCTL_LOG="$TMP/launchctl.log"
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
    grep -Fqx "$2" "$FAKE_LAUNCHCTL_STATE" 2>/dev/null
    ;;
  bootstrap)
    label="$(basename "$3" .plist)"
    printf '%s/%s\n' "$2" "$label" >> "$FAKE_LAUNCHCTL_STATE"
    ;;
  bootout)
    grep -Fvx "$2" "$FAKE_LAUNCHCTL_STATE" > "$FAKE_LAUNCHCTL_STATE.next" 2>/dev/null || true
    mv "$FAKE_LAUNCHCTL_STATE.next" "$FAKE_LAUNCHCTL_STATE"
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
fi

echo "LaunchAgent rendering lifecycle ok"
