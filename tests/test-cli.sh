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
"$ROOT/bin/hanchou" plan work | grep -q '.codex/rules/hanchou.rules'
ln -s "$ROOT/bin/hanchou" "$TMP/hanchou"
export PATH="$TMP:$PATH"
"$TMP/hanchou" --help | grep -q 'bootstrap'

node --input-type=module - "$ROOT/.codex/rules/hanchou.rules" <<'JS'
import { readFileSync } from "node:fs";
const source = readFileSync(process.argv[2], "utf8");
if (/pattern\s*=\s*\[\s*["']hanchou["']\s*,\s*["']inbox["']\s*\]/.test(source)) {
  throw new Error("Inbox rules must not allow the whole command family");
}
for (const expected of [
  '["hanchou", "inbox", ["list", "show"]]',
  '["hanchou", "inbox", ["claim", "ack"]]',
  '["hanchou", "inbox", ["retry", "dead-letter"]]',
  'decision = "prompt"',
]) {
  if (!source.includes(expected)) throw new Error(`missing rule fragment: ${expected}`);
}
JS

if command -v codex >/dev/null 2>&1; then
  node --input-type=module - "$ROOT/.codex/rules/hanchou.rules" <<'JS'
import { spawnSync } from "node:child_process";
const rules = process.argv[2];
const cases = [
  [["hanchou", "inbox", "list", "--json"], "allow"],
  [["hanchou", "inbox", "show", "evt_example"], "allow"],
  [["hanchou", "inbox", "claim", "--to", "orchestrator", "--json"], "allow"],
  [["hanchou", "inbox", "ack", "evt_example", "--by", "orchestrator"], "allow"],
  [["hanchou", "inbox", "retry", "evt_example"], "prompt"],
  [["hanchou", "inbox", "dead-letter", "evt_example", "--reason", "invalid"], "prompt"],
  [["hanchou", "inbox", "future-command"], null],
];
for (const [command, expected] of cases) {
  const result = spawnSync("codex", ["execpolicy", "check", "--rules", rules, "--", ...command], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const decision = JSON.parse(result.stdout).decision ?? null;
  if (decision !== expected) throw new Error(`${command.join(" ")}: ${decision} !== ${expected}`);
}
JS
fi

mkdir -p "$TMP/codex-home/rules/nested"
printf 'prefix_rule(pattern=["safe", "command"], decision="allow")\n' > "$TMP/codex-home/rules/default.rules"
printf '%s\n' \
  'prefix_rule(' \
  '  pattern=["hanchou", "inbox",],' \
  "  justification='decision=\"prompt\" is only text'," \
  '  # decision="prompt" is only a comment; the real default is allow' \
  ')' > "$TMP/codex-home/rules/nested/legacy.rules"
CODEX_HOME="$TMP/codex-home" "$ROOT/bin/hanchou" plan work | grep -q 'nested/legacy.rules'

mkdir -p "$TMP/policy-user/nested" "$TMP/policy-project/nested"
printf 'prefix_rule(pattern=["user", "one"])\n' > "$TMP/policy-user/default.rules"
printf 'prefix_rule(pattern=["project", "one"])\n' > "$TMP/policy-project/hanchou.rules"
printf 'prefix_rule(pattern=["project", "two"])\n' > "$TMP/policy-project/nested/extra.rules"
ln -s "$TMP/policy-user/default.rules" "$TMP/policy-project/nested/ignored.rules"
node --experimental-strip-types --input-type=module - \
  "$ROOT/libexec/hanchou.ts" "$TMP/policy-user" "$TMP/policy-project" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const modulePath = process.argv[2];
const userRoot = process.argv[3];
const projectRoot = process.argv[4];
const { codexPolicyRulePaths } = await import(pathToFileURL(modulePath).href);
const paths = codexPolicyRulePaths(userRoot, projectRoot);
assert.equal(paths.length, 3);
assert.ok(paths.some((path) => path.endsWith("default.rules")));
assert.ok(paths.some((path) => path.endsWith("hanchou.rules")));
assert.ok(paths.some((path) => path.endsWith("extra.rules")));
assert.ok(paths.every((path) => !path.endsWith("ignored.rules")));
JS

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
