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

if "$ROOT/bin/hanchou" >/dev/null 2>"$TMP/no-command.err"; then
  echo "expected a missing-command parser failure" >&2
  exit 1
fi
grep -q 'hanchou: error: the following arguments are required: command' "$TMP/no-command.err"

if "$ROOT/bin/hanchou" usage show --json=true >/dev/null 2>"$TMP/boolean-value.err"; then
  echo "expected an explicit boolean value parser failure" >&2
  exit 1
fi
grep -q "argument --json: ignored explicit argument 'true'" "$TMP/boolean-value.err"

if "$ROOT/bin/hanchou" usage set codex --weekly-remaining= >/dev/null 2>"$TMP/empty-float.err"; then
  echo "expected an empty float parser failure" >&2
  exit 1
fi
grep -q "argument --weekly-remaining: invalid float value: ''" "$TMP/empty-float.err"

if "$ROOT/bin/hanchou" usage set codex --weekly-remaining=0x10 >/dev/null 2>"$TMP/hex-float.err"; then
  echo "expected a non-decimal float parser failure" >&2
  exit 1
fi
grep -q "argument --weekly-remaining: invalid float value: '0x10'" "$TMP/hex-float.err"

if "$ROOT/bin/hanchou" route resolve --role --json >/dev/null 2>"$TMP/missing-option-value.err"; then
  echo "expected a missing option value parser failure" >&2
  exit 1
fi
grep -q 'argument --role: expected one argument' "$TMP/missing-option-value.err"

CUSTOM_CONFIG="$TMP/config"
mkdir -p "$CUSTOM_CONFIG/profiles"
cp "$ROOT/config/profiles/work.toml" "$CUSTOM_CONFIG/profiles/work.toml"
cp "$ROOT/config/model-routing.toml" "$CUSTOM_CONFIG/model-routing.toml"
node - "$CUSTOM_CONFIG/profiles/work.toml" <<'JS'
const fs = require("node:fs");
const path = process.argv[2];
let text = fs.readFileSync(path, "utf8").replaceAll(
  "~/.local/share/hanchou/work",
  "$HANCHOU_UNDEFINED/hanchou/work",
);
text = text.replace(
  'relay_dir = "$HANCHOU_UNDEFINED/hanchou/work/relay"',
  'relay_dir = "${HANCHOU_UNDEFINED}/hanchou/work/relay"',
);
fs.writeFileSync(path, text);
JS
env -u HANCHOU_UNDEFINED HANCHOU_CONFIG_ROOT="$CUSTOM_CONFIG" \
  "$ROOT/bin/hanchou" plan work >"$TMP/unexpanded-vars.out"
grep -Fq '$HANCHOU_UNDEFINED/hanchou/work' "$TMP/unexpanded-vars.out"
grep -Fq '${HANCHOU_UNDEFINED}/hanchou/work/relay' "$TMP/unexpanded-vars.out"
"$ROOT/bin/hanchou" --profile work route resolve \
  --role implementer --task-kind code --json > "$TMP/route.json"
node --input-type=module - "$TMP/route.json" <<'TS'
import { readFileSync } from "node:fs";
const obj = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (obj.role !== "implementer") throw new Error(`unexpected role: ${obj.role}`);
if (!new Set(["codex", "claude"]).has(obj.provider)) {
  throw new Error(`unexpected provider: ${obj.provider}`);
}
if (!obj.model) throw new Error("missing model");
TS

"$ROOT/bin/hanchou" --profile work usage recommend \
  --role implementer --task-kind code --json > "$TMP/alias.json"
node --input-type=module - "$TMP/route.json" "$TMP/alias.json" <<'TS'
import { readFileSync } from "node:fs";
const first = JSON.parse(readFileSync(process.argv[2], "utf8"));
const second = JSON.parse(readFileSync(process.argv[3], "utf8"));
for (const key of ["role", "provider", "model", "reason"]) {
  if (first[key] !== second[key]) {
    throw new Error(`${key}: ${first[key]} !== ${second[key]}`);
  }
}
TS

node --experimental-strip-types --input-type=module - "$ROOT/libexec/hanchou.ts" <<'TS'
import { pathToFileURL } from "node:url";

const { run, CommandError } = await import(pathToFileURL(process.argv[2]).href);
const started = Date.now();
let timedOut = false;
try {
  run([
    process.execPath,
    "-e",
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
  ], { capture: true, timeout: 150 });
} catch (error) {
  if (!(error instanceof CommandError) || !error.message.includes("command timed out")) {
    throw error;
  }
  timedOut = true;
}
if (!timedOut || Date.now() - started > 2_000) {
  throw new Error("hard timeout did not kill a SIGTERM-ignoring child promptly");
}
TS

echo "CLI boundary smoke test passed"
