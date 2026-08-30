#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
daemon_pid=""
cleanup() {
  if [[ -n "$daemon_pid" ]] && kill -0 "$daemon_pid" 2>/dev/null; then
    kill -TERM "$daemon_pid" 2>/dev/null || true
    wait "$daemon_pid" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

LOCK_DIR="$TMP/.local/share/hanchou/work/relay/locks"
mkdir -p "$LOCK_DIR"
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({pid: 999999, token: "dead"}) + "\n")' \
  "$LOCK_DIR/journal.lock.held"

OUT="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work relay emit \
  --type completed \
  --task hch-test \
  --execution exe-test \
  --from-agent hch-test-implementer \
  --from-role implementer \
  --to-agent orchestrator \
  --to-role orchestrator \
  --delegation-depth 1 \
  --summary done \
  --artifact commit:abc \
  --verification tests-pass \
  --no-nudge --json)"
EVENT_ID="$(printf '%s' "$OUT" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
test ! -e "$LOCK_DIR/journal.lock.held"
test -e "$LOCK_DIR/journal.lock"

CLAIM="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work inbox claim --to orchestrator --json)"
printf '%s' "$CLAIM" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { const rows=JSON.parse(text); if (rows.length !== 1 || rows[0].event_id !== process.argv[1]) process.exit(1); })' "$EVENT_ID"

HOME="$TMP" "$ROOT/bin/hanchou" --profile work inbox ack "$EVENT_ID" --by orchestrator --json >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work inbox show "$EVENT_ID" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { const row=JSON.parse(text); if (row.state !== "acknowledged" || row.event.execution_id !== "exe-test") process.exit(1); })'

HOME="$TMP" "$ROOT/bin/hanchou" --profile work relay daemon >"$TMP/daemon.out" 2>&1 &
daemon_pid=$!
for _ in $(seq 1 50); do
  grep -q 'hanchou relay daemon started' "$TMP/daemon.out" && break
  sleep 0.1
done
grep -q 'hanchou relay daemon started' "$TMP/daemon.out"
kill -TERM "$daemon_pid"
wait "$daemon_pid"
daemon_pid=""
grep -q 'hanchou relay daemon stopped' "$TMP/daemon.out"

echo "relay inbox lifecycle ok"
