#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export HOME="$TMP/home"
mkdir -p "$HOME"

"$ROOT/bin/hanchou" --help | grep -q 'route'
"$ROOT/bin/hanchou" --help | grep -q 'bootstrap'
"$ROOT/bin/hanchou" plan work | grep -q 'mise.toml: Herdr 0.8.2, Node.js 22'
ln -s "$ROOT/bin/hanchou" "$TMP/hanchou"
"$TMP/hanchou" --help | grep -q 'bootstrap'
"$ROOT/bin/hanchou" --profile work route resolve \
  --role implementer --task-kind code --json > "$TMP/route.json"
python3 - "$TMP/route.json" <<'PY'
import json, sys
obj=json.load(open(sys.argv[1]))
assert obj["role"] == "implementer"
assert obj["provider"] in {"codex", "claude"}
assert obj["model"]
PY

"$ROOT/bin/hanchou" --profile work usage recommend \
  --role implementer --task-kind code --json > "$TMP/alias.json"
python3 - "$TMP/route.json" "$TMP/alias.json" <<'PY'
import json, sys
a=json.load(open(sys.argv[1]))
b=json.load(open(sys.argv[2]))
for key in ("role", "provider", "model", "reason"):
    assert a[key] == b[key], (key, a[key], b[key])
PY

echo "CLI boundary smoke test passed"
