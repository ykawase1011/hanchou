#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

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
EVENT_ID="$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["event_id"])')"

CLAIM="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work inbox claim --to orchestrator --json)"
printf '%s' "$CLAIM" | python3 -c 'import json,sys; rows=json.load(sys.stdin); assert len(rows)==1 and rows[0]["event_id"]==sys.argv[1]' "$EVENT_ID"

HOME="$TMP" "$ROOT/bin/hanchou" --profile work inbox ack "$EVENT_ID" --by orchestrator --json >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work inbox show "$EVENT_ID" | python3 -c 'import json,sys; row=json.load(sys.stdin); assert row["state"]=="acknowledged" and row["event"]["execution_id"]=="exe-test"'

echo "relay inbox lifecycle ok"
