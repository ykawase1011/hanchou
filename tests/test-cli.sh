#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export HOME="$TMP/home"
export HANCHOU_TEST_OPERATOR_HOME="$TMP/operator"
MOCK_USER_INFO="$TMP/mock-user-info.cjs"
mkdir -p "$HOME" "$HANCHOU_TEST_OPERATOR_HOME"
printf '%s\n' \
  'const os = require("node:os");' \
  'const original = os.userInfo;' \
  'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  > "$MOCK_USER_INFO"

hanchou_test() {
  NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
    "$ROOT/libexec/hanchou.ts" "$@"
}

PRELOAD_PROBE="$TMP/preload-probe.cjs"
PRELOAD_MARKER="$TMP/preload-loaded"
printf '%s\n' \
  'require("node:fs").writeFileSync(process.env.HANCHOU_PRELOAD_MARKER, "loaded");' \
  > "$PRELOAD_PROBE"
NODE_OPTIONS="--require=$PRELOAD_PROBE" HANCHOU_PRELOAD_MARKER="$PRELOAD_MARKER" \
  "$ROOT/bin/hanchou" --help > "$TMP/wrapper-help.out"
grep -q 'route' "$TMP/wrapper-help.out"
grep -q 'bootstrap' "$TMP/wrapper-help.out"
if [[ -e "$PRELOAD_MARKER" ]]; then
  echo "production wrapper executed caller-controlled NODE_OPTIONS" >&2
  exit 1
fi

BASH_ENV_PROBE="$TMP/bash-env.sh"
BASH_ENV_MARKER="$TMP/bash-env-preload-loaded"
printf 'unset() { :; }\n' > "$BASH_ENV_PROBE"
BASH_ENV="$BASH_ENV_PROBE" NODE_OPTIONS="--require=$PRELOAD_PROBE" \
  HANCHOU_PRELOAD_MARKER="$BASH_ENV_MARKER" \
  "$ROOT/bin/hanchou" --help > "$TMP/bash-env-help.out"
grep -q 'bootstrap' "$TMP/bash-env-help.out"
if [[ -e "$BASH_ENV_MARKER" ]]; then
  echo "production wrapper allowed BASH_ENV to override preload sanitization" >&2
  exit 1
fi

FAKE_MISE_DATA="$TMP/fake-mise-data"
FAKE_MISE_INSTALLS="$TMP/fake-mise-installs"
FAKE_MISE_DATA_MARKER="$TMP/fake-mise-data-node-executed"
FAKE_MISE_INSTALLS_MARKER="$TMP/fake-mise-installs-node-executed"
mkdir -p "$FAKE_MISE_DATA/installs/node/22/bin" "$FAKE_MISE_INSTALLS/node/22/bin"
printf '#!/bin/sh\n/usr/bin/touch "%s"\nexit 97\n' "$FAKE_MISE_DATA_MARKER" \
  > "$FAKE_MISE_DATA/installs/node/22/bin/node"
printf '#!/bin/sh\n/usr/bin/touch "%s"\nexit 98\n' "$FAKE_MISE_INSTALLS_MARKER" \
  > "$FAKE_MISE_INSTALLS/node/22/bin/node"
chmod +x "$FAKE_MISE_DATA/installs/node/22/bin/node" \
  "$FAKE_MISE_INSTALLS/node/22/bin/node"
MISE_DATA_DIR="$FAKE_MISE_DATA" "$ROOT/bin/hanchou" --help > "$TMP/mise-data-help.out"
MISE_INSTALLS_DIR="$FAKE_MISE_INSTALLS" "$ROOT/bin/hanchou" --help > "$TMP/mise-installs-help.out"
grep -q 'bootstrap' "$TMP/mise-data-help.out"
grep -q 'bootstrap' "$TMP/mise-installs-help.out"
if [[ -e "$FAKE_MISE_DATA_MARKER" || -e "$FAKE_MISE_INSTALLS_MARKER" ]]; then
  echo "production wrapper executed a caller-selected mise install" >&2
  exit 1
fi
MISE_DATA_DIR="$FAKE_MISE_DATA" MISE_INSTALLS_DIR="$FAKE_MISE_INSTALLS" \
  node --experimental-strip-types --input-type=module - "$ROOT/libexec/hanchou.ts" <<'JS'
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
const { codexManagedEnvironmentArgs, loadProfile, trustedMiseExecutable } = await import(pathToFileURL(process.argv[2]).href);
assert.equal(basename(trustedMiseExecutable()), "mise");
const [, profile] = loadProfile("work");
const args = codexManagedEnvironmentArgs("work", profile, "test-agent", "p1", "w1", "t1");
const assignment = args.find((value) => value.startsWith("shell_environment_policy.set.HERDR_BIN_PATH="));
assert.ok(assignment);
const herdr = JSON.parse(assignment.slice(assignment.indexOf("=") + 1));
const root = realpathSync(join(userInfo().homedir, ".local/share/mise/installs/herdr"));
assert.ok(herdr.startsWith(`${root}${sep}`));
assert.ok(herdr.endsWith(`${sep}0.8.2${sep}herdr`));
JS
/bin/bash -px "$ROOT/bin/hanchou" --help > "$TMP/traced-wrapper-help.out" 2> "$TMP/traced-wrapper.err"
grep -q 'bootstrap' "$TMP/traced-wrapper-help.out"
grep -E -q 'PATH=.*/installs/node/.*/bin:.*\.local/bin:.*\.local/share/mise/bin:' "$TMP/traced-wrapper.err"
grep -E -q 'hanchou_validate_runtime_path .*/installs/node/.*/bin/node' "$TMP/traced-wrapper.err"
hanchou_test plan work | grep -q 'mise.toml: Herdr 0.8.2, Node.js 22'
hanchou_test plan work | grep -q '.codex/rules/hanchou.rules'
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
  '[["hanchou", "./bin/hanchou", "bin/hanchou"], "stop-orchestrator"]',
  '["hanchou", "project", ["list", "show", "resolve", "doctor"]]',
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
  [["hanchou", "project", "list", "--json"], "allow"],
  [["hanchou", "project", "show", "example-app", "--json"], "allow"],
  [["hanchou", "project", "resolve", "--path", "/workspace/example-app", "--json"], "allow"],
  [["hanchou", "project", "doctor"], "allow"],
  [["hanchou", "project", "add", "example-app", "--path", "/workspace/example-app"], null],
  [["hanchou", "onboard", "work", "--yes"], null],
  [["hanchou", "stop-orchestrator", "work", "--all", "--yes"], "prompt"],
  [["./bin/hanchou", "stop-orchestrator", "work", "--all", "--plan", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "--yes"], "prompt"],
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
CODEX_HOME="$TMP/codex-home" hanchou_test plan work | grep -q 'nested/legacy.rules'

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

if hanchou_test >/dev/null 2>"$TMP/no-command.err"; then
  echo "expected a missing-command parser failure" >&2
  exit 1
fi
grep -q 'hanchou: error: the following arguments are required: command' "$TMP/no-command.err"

hanchou_test project --help | grep -q '{list,show,resolve,doctor}'
hanchou_test onboard --help | grep -q -- '--yes'
hanchou_test launch --help | grep -q -- '--no-browser'
hanchou_test stop-orchestrator --help | grep -q -- '--all'
hanchou_test stop-orchestrator --help | grep -q -- '--plan PLAN'
hanchou_test dashboard --help | grep -q '{serve,snapshot}'
hanchou_test dashboard serve --help | grep -q '{personal,work}'
hanchou_test open --help | grep -q 'dashboard,tasks,herdr,herdrm,orchestrator,automations'
if hanchou_test dashboard future >/dev/null 2>"$TMP/dashboard-command.err"; then
  echo "expected an unsupported dashboard command" >&2
  exit 1
fi
grep -q "argument dashboard_command: invalid choice: 'future'" "$TMP/dashboard-command.err"
if hanchou_test stop-orchestrator work >/dev/null 2>"$TMP/stop-all.err"; then
  echo "expected stop-orchestrator to require --all" >&2
  exit 1
fi
grep -q 'the following arguments are required: --all' "$TMP/stop-all.err"
if hanchou_test stop-orchestrator work --all --yes >/dev/null 2>"$TMP/stop-plan-required.err"; then
  echo "expected stop-orchestrator --yes to require --plan" >&2
  exit 1
fi
grep -q 'the following arguments are required: --plan' "$TMP/stop-plan-required.err"
VALID_STOP_PLAN=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
if hanchou_test stop-orchestrator work --all --plan "$VALID_STOP_PLAN" >/dev/null 2>"$TMP/stop-yes-required.err"; then
  echo "expected stop-orchestrator --plan to require --yes" >&2
  exit 1
fi
grep -q 'argument --plan: requires --yes' "$TMP/stop-yes-required.err"
if hanchou_test stop-orchestrator work --all --plan not-a-token --yes >/dev/null 2>"$TMP/stop-plan-invalid.err"; then
  echo "expected stop-orchestrator to reject a malformed plan token" >&2
  exit 1
fi
grep -q 'argument --plan: invalid plan token' "$TMP/stop-plan-invalid.err"
if hanchou_test project resolve >/dev/null 2>"$TMP/project-path.err"; then
  echo "expected a missing project path parser failure" >&2
  exit 1
fi
grep -q 'the following arguments are required: --path' "$TMP/project-path.err"

if hanchou_test project add example --path /tmp/example >/dev/null 2>"$TMP/project-add.err"; then
  echo "expected an unsupported project mutation command" >&2
  exit 1
fi
grep -q "argument project_command: invalid choice: 'add'" "$TMP/project-add.err"

if hanchou_test usage show --json=true >/dev/null 2>"$TMP/boolean-value.err"; then
  echo "expected an explicit boolean value parser failure" >&2
  exit 1
fi
grep -q "argument --json: ignored explicit argument 'true'" "$TMP/boolean-value.err"

if hanchou_test usage set codex --weekly-remaining= >/dev/null 2>"$TMP/empty-float.err"; then
  echo "expected an empty float parser failure" >&2
  exit 1
fi
grep -q "argument --weekly-remaining: invalid float value: ''" "$TMP/empty-float.err"

if hanchou_test usage set codex --weekly-remaining=0x10 >/dev/null 2>"$TMP/hex-float.err"; then
  echo "expected a non-decimal float parser failure" >&2
  exit 1
fi
grep -q "argument --weekly-remaining: invalid float value: '0x10'" "$TMP/hex-float.err"

if hanchou_test route resolve --role --json >/dev/null 2>"$TMP/missing-option-value.err"; then
  echo "expected a missing option value parser failure" >&2
  exit 1
fi
grep -q 'argument --role: expected one argument' "$TMP/missing-option-value.err"

CUSTOM_CONFIG="$TMP/config"
mkdir -p "$CUSTOM_CONFIG/profiles"
cp "$ROOT/config/profiles/work.toml" "$CUSTOM_CONFIG/profiles/work.toml"
cp "$ROOT/config/model-routing.toml" "$CUSTOM_CONFIG/model-routing.toml"
if HANCHOU_CONFIG_ROOT="$CUSTOM_CONFIG" hanchou_test execution inspect hch-example >/dev/null 2>"$TMP/custom-runtime-config.err"; then
  echo "expected managed runtime custom-config rejection" >&2
  exit 1
fi
grep -q 'managed Agent runtime does not accept a custom --config-root or HANCHOU_CONFIG_ROOT' \
  "$TMP/custom-runtime-config.err"
if HANCHOU_CONFIG_ROOT="$CUSTOM_CONFIG" hanchou_test launch work --no-browser >/dev/null 2>"$TMP/custom-launch-config.err"; then
  echo "expected launch custom-config rejection" >&2
  exit 1
fi
grep -q 'managed Agent runtime does not accept a custom --config-root or HANCHOU_CONFIG_ROOT' \
  "$TMP/custom-launch-config.err"
if HANCHOU_CONFIG_ROOT="$CUSTOM_CONFIG" hanchou_test stop-orchestrator work --all >/dev/null 2>"$TMP/custom-stop-config.err"; then
  echo "expected stop-orchestrator custom-config rejection" >&2
  exit 1
fi
grep -q 'managed Agent runtime does not accept a custom --config-root or HANCHOU_CONFIG_ROOT' \
  "$TMP/custom-stop-config.err"
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
(
  unset HANCHOU_UNDEFINED
  HANCHOU_CONFIG_ROOT="$CUSTOM_CONFIG" hanchou_test plan work
) >"$TMP/unexpanded-vars.out"
grep -Fq '$HANCHOU_UNDEFINED/hanchou/work' "$TMP/unexpanded-vars.out"
grep -Fq '${HANCHOU_UNDEFINED}/hanchou/work/relay' "$TMP/unexpanded-vars.out"
hanchou_test --profile work route resolve \
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

hanchou_test --profile work usage recommend \
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
