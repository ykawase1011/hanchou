#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

OUT="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind task_terminal \
  --task hch-test \
  --policy on_terminal \
  --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary 'Task completed' \
  --json)"
DELIVERY_ID="$(printf '%s' "$OUT" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"

HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$DELIVERY_ID" --by orchestrator --message 'Completed.' >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$DELIVERY_ID" --adapter local-session >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery show "$DELIVERY_ID" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { if (JSON.parse(text).state !== "delivered") process.exit(1); })'

echo "delivery lifecycle ok"
