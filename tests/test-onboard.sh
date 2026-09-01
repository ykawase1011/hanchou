#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
TMP="$(cd "$TMP" && pwd -P)"
trap 'rm -rf "$TMP"' EXIT

OPERATOR_HOME="$TMP/operator"
MOCK_USER_INFO="$TMP/mock-user-info.cjs"
mkdir -p "$OPERATOR_HOME"
printf '%s\n' \
  'const os = require("node:os");' \
  'const original = os.userInfo;' \
  'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  > "$MOCK_USER_INFO"
export HANCHOU_TEST_OPERATOR_HOME="$OPERATOR_HOME"

hanchou_test() {
  NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
    "$ROOT/libexec/hanchou.ts" "$@"
}

onboard_apply() {
  NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
    --input-type=module - "$ROOT/libexec/hanchou.ts" "$1" <<'JS'
import { pathToFileURL } from "node:url";
const modulePath = process.argv[2];
const profile = process.argv[3];
const { onboardProfile } = await import(pathToFileURL(modulePath).href);
onboardProfile({ yes: true }, profile, true);
JS
}

WORKSPACE="$OPERATOR_HOME/HanchouWorkspace/work/repositories"
REGISTRY="$OPERATOR_HOME/.config/hanchou/work/projects.local.toml"

hanchou_test onboard work > "$TMP/plan.out"
grep -q 'Hanchou onboarding plan: work' "$TMP/plan.out"
grep -q 'No changes made' "$TMP/plan.out"
[[ ! -e "$WORKSPACE" ]]
[[ ! -e "$REGISTRY" ]]

# Keep this case non-interactive even when the full validation suite is started
# from the human operator's TTY (for example during `hanchou init`).
if hanchou_test onboard work --yes </dev/null >/dev/null 2> "$TMP/noninteractive.err"; then
  echo "expected non-interactive onboarding rejection" >&2
  exit 1
fi
grep -q 'requires an interactive terminal' "$TMP/noninteractive.err"
[[ ! -e "$WORKSPACE" ]]
[[ ! -e "$REGISTRY" ]]

HERDR_ENV=1 NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
  --input-type=module - "$ROOT/libexec/hanchou.ts" <<'JS' > /dev/null 2> "$TMP/herdr.err" && {
import { pathToFileURL } from "node:url";
const { onboardProfile } = await import(pathToFileURL(process.argv[2]).href);
onboardProfile({ yes: true }, "work", true);
JS
  echo "expected Herdr-managed onboarding rejection" >&2
  exit 1
}
grep -q 'outside a Herdr-managed pane' "$TMP/herdr.err"

HANCHOU_AGENT_ID=orchestrator NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
  --input-type=module - "$ROOT/libexec/hanchou.ts" <<'JS' > /dev/null 2> "$TMP/agent.err" && {
import { pathToFileURL } from "node:url";
const { onboardProfile } = await import(pathToFileURL(process.argv[2]).href);
onboardProfile({ yes: true }, "work", true);
JS
  echo "expected managed-Agent onboarding rejection" >&2
  exit 1
}
grep -q 'outside a Herdr-managed pane' "$TMP/agent.err"

COLLISION_HOME="$TMP/collision-operator"
COLLISION_REPO="$COLLISION_HOME/exact"
COLLISION_REGISTRY="$COLLISION_HOME/.config/hanchou/work/projects.local.toml"
mkdir -p "$COLLISION_REPO" "$(dirname "$COLLISION_REGISTRY")"
chmod 700 "$COLLISION_HOME/.config" "$COLLISION_HOME/.config/hanchou" "$(dirname "$COLLISION_REGISTRY")"
git -C "$COLLISION_REPO" init -q -b main
git -C "$COLLISION_REPO" config user.name "Hanchou Test"
git -C "$COLLISION_REPO" config user.email "hanchou-test@example.invalid"
printf '# collision\n' > "$COLLISION_REPO/README.md"
git -C "$COLLISION_REPO" add README.md
git -C "$COLLISION_REPO" commit -qm "Initial fixture"
printf '%s\n' \
  'schema_version = 1' \
  'default_policy = "deny"' \
  '' \
  '[[projects]]' \
  'id = "work-repositories"' \
  "path = \"$COLLISION_REPO\"" \
  'allowed_profiles = ["work"]' \
  > "$COLLISION_REGISTRY"
chmod 600 "$COLLISION_REGISTRY"
cp "$COLLISION_REGISTRY" "$TMP/collision-registry.before"
if HANCHOU_TEST_OPERATOR_HOME="$COLLISION_HOME" onboard_apply work >/dev/null 2> "$TMP/collision.err"; then
  echo "expected project/workspace-root ID collision rejection" >&2
  exit 1
fi
grep -q 'conflicts with existing project authority' "$TMP/collision.err"
cmp "$TMP/collision-registry.before" "$COLLISION_REGISTRY"
[[ ! -e "$COLLISION_HOME/HanchouWorkspace" ]]

mkdir -p "$OPERATOR_HOME/.config/hanchou/work" "$OPERATOR_HOME/exact"
chmod 700 "$OPERATOR_HOME/.config" "$OPERATOR_HOME/.config/hanchou" "$OPERATOR_HOME/.config/hanchou/work"
git -C "$OPERATOR_HOME/exact" init -q -b main
git -C "$OPERATOR_HOME/exact" config user.name "Hanchou Test"
git -C "$OPERATOR_HOME/exact" config user.email "hanchou-test@example.invalid"
printf '# exact\n' > "$OPERATOR_HOME/exact/README.md"
git -C "$OPERATOR_HOME/exact" add README.md
git -C "$OPERATOR_HOME/exact" commit -qm "Initial fixture"
printf '%s\n' \
  'schema_version = 1' \
  'default_policy = "deny"' \
  '' \
  '# Existing comments and entries must survive the append.' \
  '[[projects]]' \
  'id = "exact"' \
  "path = \"$OPERATOR_HOME/exact\"" \
  'allowed_profiles = ["work"]' \
  > "$REGISTRY"
chmod 600 "$REGISTRY"

onboard_apply work > "$TMP/apply.out"
grep -q 'onboarding workspace ready' "$TMP/apply.out"
grep -q 'authorization ready: work-repositories' "$TMP/apply.out"
[[ -d "$WORKSPACE" ]]
[[ -f "$REGISTRY" ]]
grep -q '# Existing comments and entries must survive the append.' "$REGISTRY"
grep -q 'id = "work-repositories"' "$REGISTRY"
find "$(dirname "$REGISTRY")" -maxdepth 1 -name 'projects.local.toml.bak.*' | grep -q .

case "$(uname -s)" in
  Darwin)
    [[ "$(stat -f '%Lp' "$WORKSPACE")" == "700" ]]
    [[ "$(stat -f '%Lp' "$REGISTRY")" == "600" ]]
    ;;
  Linux)
    [[ "$(stat -c '%a' "$WORKSPACE")" == "700" ]]
    [[ "$(stat -c '%a' "$REGISTRY")" == "600" ]]
    ;;
esac

REPOSITORY="$WORKSPACE/example-app"
mkdir -p "$REPOSITORY"
git -C "$REPOSITORY" init -q -b main
git -C "$REPOSITORY" config user.name "Hanchou Test"
git -C "$REPOSITORY" config user.email "hanchou-test@example.invalid"
printf '# fixture\n' > "$REPOSITORY/README.md"
git -C "$REPOSITORY" add README.md
git -C "$REPOSITORY" commit -qm "Initial fixture"
hanchou_test project resolve --path "$REPOSITORY" --json > "$TMP/resolve.json"
node --input-type=module - "$TMP/resolve.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.project, "root:work-repositories/example-app");
assert.equal(value.dispatch_ready, true);
JS

BACKUP_COUNT="$(find "$(dirname "$REGISTRY")" -maxdepth 1 -name 'projects.local.toml.bak.*' | wc -l | tr -d ' ')"
onboard_apply work > "$TMP/idempotent.out"
[[ "$(find "$(dirname "$REGISTRY")" -maxdepth 1 -name 'projects.local.toml.bak.*' | wc -l | tr -d ' ')" == "$BACKUP_COUNT" ]]
[[ "$(grep -c 'id = "work-repositories"' "$REGISTRY")" == "1" ]]

chmod 0777 "$OPERATOR_HOME/HanchouWorkspace"
if onboard_apply personal >/dev/null 2> "$TMP/writable-parent.err"; then
  echo "expected writable workspace-parent rejection" >&2
  exit 1
fi
grep -q 'must not be group/world writable' "$TMP/writable-parent.err"
[[ ! -e "$OPERATOR_HOME/HanchouWorkspace/personal" ]]
[[ ! -e "$OPERATOR_HOME/.config/hanchou/personal/projects.local.toml" ]]
chmod 0700 "$OPERATOR_HOME/HanchouWorkspace"

echo "human onboarding workspace lifecycle ok"
