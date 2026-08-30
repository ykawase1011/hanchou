#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
TMP="$(cd "$TMP" && pwd -P)"
trap 'rm -rf "$TMP"' EXIT

OPERATOR_HOME="$TMP/operator"
REGISTRY_DIR="$OPERATOR_HOME/.config/hanchou/work"
REGISTRY="$REGISTRY_DIR/projects.local.toml"
MOCK_USER_INFO="$TMP/mock-user-info.cjs"
mkdir -p "$REGISTRY_DIR" "$TMP/fake-home" "$TMP/exact" "$TMP/personal" \
  "$TMP/allowed/child" "$TMP/allowed/nested" "$TMP/allowed-evil" "$TMP/outside" "$TMP/linked-source"
chmod 700 "$OPERATOR_HOME/.config" "$OPERATOR_HOME/.config/hanchou" "$REGISTRY_DIR"

printf '%s\n' \
  'const os = require("node:os");' \
  'const original = os.userInfo;' \
  'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  > "$MOCK_USER_INFO"
export HANCHOU_TEST_OPERATOR_HOME="$OPERATOR_HOME"
export HOME="$TMP/fake-home"

hanchou_test() {
  NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
    "$ROOT/libexec/hanchou.ts" "$@"
}

initialize_repo() {
  local repository="$1"
  git -C "$repository" init -q -b main
  git -C "$repository" config user.name "Hanchou Test"
  git -C "$repository" config user.email "hanchou-test@example.invalid"
  printf '# fixture\n' > "$repository/README.md"
  git -C "$repository" add README.md
  git -C "$repository" commit -qm "Initial fixture"
}

initialize_repo "$TMP/exact"
initialize_repo "$TMP/personal"
initialize_repo "$TMP/allowed/child"
initialize_repo "$TMP/allowed-evil"
initialize_repo "$TMP/outside"
initialize_repo "$TMP/linked-source"
git -C "$TMP/linked-source" worktree add -q -b linked-fixture "$TMP/allowed/linked"

write_base_registry() {
  printf '%s\n' \
    'schema_version = 1' \
    'default_policy = "deny"' \
    '' \
    '[[projects]]' \
    'id = "exact"' \
    "path = \"$TMP/exact\"" \
    'allowed_profiles = ["work"]' \
    '' \
    '[[projects]]' \
    'id = "personal-only"' \
    "path = \"$TMP/personal\"" \
    'allowed_profiles = ["personal"]' \
    '' \
    '[[workspace_roots]]' \
    'id = "allowed"' \
    "path = \"$TMP/allowed\"" \
    'allowed_profiles = ["work"]' \
    'trust = "descendant-git-repositories"' \
    > "$REGISTRY"
  chmod 600 "$REGISTRY"
}

write_base_registry

# A permissive file under the process HOME must not replace the authority file
# resolved from the effective OS user's home directory.
mkdir -p "$HOME/.config/hanchou/work"
chmod 700 "$HOME/.config" "$HOME/.config/hanchou" "$HOME/.config/hanchou/work"
printf '%s\n' \
  'schema_version = 1' \
  'default_policy = "deny"' \
  '[[projects]]' \
  'id = "spoofed"' \
  "path = \"$TMP/outside\"" \
  'allowed_profiles = ["work"]' \
  > "$HOME/.config/hanchou/work/projects.local.toml"
chmod 600 "$HOME/.config/hanchou/work/projects.local.toml"

hanchou_test project list --json > "$TMP/list.json"
node --input-type=module - "$TMP/list.json" "$REGISTRY" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.registry_path, process.argv[3]);
assert.equal(value.default_policy, "deny");
assert.deepEqual(value.projects.map((item) => item.id), ["exact", "personal-only"]);
assert.deepEqual(value.workspace_roots.map((item) => item.id), ["allowed"]);
JS

hanchou_test project resolve --path "$TMP/exact" --json > "$TMP/exact.json"
hanchou_test project resolve --path "$TMP/allowed/child" \
  --project root:allowed/child --json > "$TMP/root.json"
node --input-type=module - "$TMP/exact.json" "$TMP/root.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const exact = JSON.parse(readFileSync(process.argv[2], "utf8"));
const root = JSON.parse(readFileSync(process.argv[3], "utf8"));
assert.equal(exact.project, "exact");
assert.equal(exact.source_kind, "project");
assert.equal(exact.dispatch_ready, true);
assert.equal(root.project, "root:allowed/child");
assert.equal(root.source_kind, "workspace_root");
assert.equal(root.dispatch_ready, true);
JS

if hanchou_test project resolve --path "$TMP/exact" --project wrong >/dev/null 2>"$TMP/mismatch.err"; then
  echo "expected project identity mismatch" >&2
  exit 1
fi
grep -q 'registered as project "exact"' "$TMP/mismatch.err"

if hanchou_test project resolve --path "$TMP/personal" >/dev/null 2>"$TMP/profile.err"; then
  echo "expected profile authorization denial" >&2
  exit 1
fi
grep -q 'not allowed for profile "work"' "$TMP/profile.err"

if hanchou_test project resolve --path "$TMP/outside" >/dev/null 2>"$TMP/outside.err"; then
  echo "expected outside repository denial" >&2
  exit 1
fi
grep -q 'repository is not authorized' "$TMP/outside.err"

if hanchou_test project resolve --path "$TMP/allowed-evil" >/dev/null 2>"$TMP/prefix.err"; then
  echo "expected sibling-prefix repository denial" >&2
  exit 1
fi
grep -q 'repository is not authorized' "$TMP/prefix.err"

if hanchou_test project resolve --path "$TMP/allowed" >/dev/null 2>"$TMP/root-equal.err"; then
  echo "expected workspace root itself to be denied" >&2
  exit 1
fi
grep -q 'repository is not authorized' "$TMP/root-equal.err"

chmod 777 "$TMP/allowed/child"
if hanchou_test project resolve --path "$TMP/allowed/child" >/dev/null 2>"$TMP/repository-mode.err"; then
  echo "expected writable descendant repository rejection" >&2
  exit 1
fi
grep -q 'repository must not be group/world writable' "$TMP/repository-mode.err"
chmod 755 "$TMP/allowed/child"

if hanchou_test project resolve --path relative/repository >/dev/null 2>"$TMP/relative.err"; then
  echo "expected relative repository path denial" >&2
  exit 1
fi
grep -q 'must be an absolute path' "$TMP/relative.err"

if hanchou_test project resolve --path '$UNTRUSTED_ROOT/repository' >/dev/null 2>"$TMP/expanded.err"; then
  echo "expected environment-expanded repository path denial" >&2
  exit 1
fi
grep -q 'without environment-variable expansion' "$TMP/expanded.err"

ln -s "$TMP/outside" "$TMP/allowed/escape"
if hanchou_test project resolve --path "$TMP/allowed/escape" >/dev/null 2>"$TMP/symlink.err"; then
  echo "expected symlink escape denial" >&2
  exit 1
fi
grep -q 'must not contain symlink components' "$TMP/symlink.err"

if hanchou_test project resolve --path "$TMP/allowed/linked" --json > "$TMP/linked.json"; then
  echo "expected linked worktree common-directory denial" >&2
  exit 1
fi
node --input-type=module - "$TMP/linked.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.dispatch_ready, false);
assert.ok(value.problems.some((problem) => problem.includes("Git common directory escapes")));
JS

FSMONITOR="$TMP/fsmonitor.sh"
FSMONITOR_MARKER="$TMP/fsmonitor-executed"
printf '#!/bin/sh\n/usr/bin/touch "%s"\nexit 0\n' "$FSMONITOR_MARKER" > "$FSMONITOR"
chmod +x "$FSMONITOR"
git -C "$TMP/exact" config core.fsmonitor "$FSMONITOR"
hanchou_test project resolve --path "$TMP/exact" --json > "$TMP/fsmonitor.json"
node --input-type=module - "$TMP/fsmonitor.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.dispatch_ready, true);
assert.ok(value.warnings.some((warning) => warning.includes("core.fsmonitor is configured")));
JS
if [[ -e "$FSMONITOR_MARKER" ]]; then
  echo "project readiness executed configured core.fsmonitor" >&2
  exit 1
fi
git -C "$TMP/exact" config --unset core.fsmonitor

FILTER_DRIVER="$TMP/clean-filter.sh"
FILTER_MARKER="$TMP/clean-filter-executed"
FILTER_INCLUDE="$TMP/filter-include.conf"
printf '#!/bin/sh\n/usr/bin/touch "%s"\n/bin/cat\n' "$FILTER_MARKER" > "$FILTER_DRIVER"
chmod +x "$FILTER_DRIVER"
printf '*.filtered filter=hanchou-test\n' > "$TMP/exact/.gitattributes"
printf 'filter fixture\n' > "$TMP/exact/tracked.filtered"
git -C "$TMP/exact" config filter.hanchou-test.clean "$FILTER_DRIVER"
git -C "$TMP/exact" add .gitattributes tracked.filtered
git -C "$TMP/exact" commit -qm "Add filter fixture"
git -C "$TMP/exact" config --unset filter.hanchou-test.clean
printf '[filter "hanchou-test"]\n\tclean = %s\n' "$FILTER_DRIVER" > "$FILTER_INCLUDE"
git -C "$TMP/exact" config include.path "$FILTER_INCLUDE"
rm -f "$FILTER_MARKER"
if hanchou_test project resolve --path "$TMP/exact" --json > "$TMP/filter.json"; then
  echo "expected configured Git filter readiness rejection" >&2
  exit 1
fi
node --input-type=module - "$TMP/filter.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.dispatch_ready, false);
assert.ok(value.problems.some((problem) => problem.includes("external Git clean/smudge/process filters")));
JS
if [[ -e "$FILTER_MARKER" ]]; then
  echo "project readiness executed a configured clean filter" >&2
  exit 1
fi
git -C "$TMP/exact" config --unset-all include.path

git -C "$TMP/exact" config extensions.worktreeConfig true
git -C "$TMP/exact" config --worktree filter.hanchou-test.clean "$FILTER_DRIVER"
rm -f "$FILTER_MARKER"
if hanchou_test project resolve --path "$TMP/exact" --json > "$TMP/worktree-filter.json"; then
  echo "expected worktree Git filter readiness rejection" >&2
  exit 1
fi
node --input-type=module - "$TMP/worktree-filter.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.dispatch_ready, false);
assert.ok(value.problems.some((problem) => problem.includes("external Git clean/smudge/process filters")));
JS
if [[ -e "$FILTER_MARKER" ]]; then
  echo "project readiness executed a worktree-configured clean filter" >&2
  exit 1
fi
git -C "$TMP/exact" config --worktree --unset filter.hanchou-test.clean
git -C "$TMP/exact" config --unset extensions.worktreeConfig

printf 'dirty\n' > "$TMP/exact/untracked.txt"
if hanchou_test project resolve --path "$TMP/exact" --json > "$TMP/dirty.json"; then
  echo "expected dirty repository readiness failure" >&2
  exit 1
fi
node --input-type=module - "$TMP/dirty.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.dispatch_ready, false);
assert.ok(value.problems.includes("repository is not clean"));
JS
rm "$TMP/exact/untracked.txt"

printf '%s\n' \
  'schema_version = 1' \
  'default_policy = "deny"' \
  '[[projects]]' \
  'id = "operator-home"' \
  "path = \"$OPERATOR_HOME\"" \
  'allowed_profiles = ["work"]' \
  > "$REGISTRY"
chmod 600 "$REGISTRY"
if hanchou_test project list >/dev/null 2>"$TMP/home-project.err"; then
  echo "expected exact HOME authorization rejection" >&2
  exit 1
fi
grep -q 'must not be filesystem root, HOME, or an ancestor of HOME' "$TMP/home-project.err"
write_base_registry

chmod 777 "$TMP/allowed"
if hanchou_test project list >/dev/null 2>"$TMP/root-mode.err"; then
  echo "expected writable workspace-root rejection" >&2
  exit 1
fi
grep -q 'workspace_roots\[0\].path must not be group/world writable' "$TMP/root-mode.err"
chmod 755 "$TMP/allowed"

printf '%s\n' \
  'schema_version = 1' \
  'default_policy = "deny"' \
  '[[projects]]' \
  'id = "collision"' \
  "path = \"$TMP/exact\"" \
  'allowed_profiles = ["work"]' \
  '[[workspace_roots]]' \
  'id = "collision"' \
  "path = \"$TMP/allowed\"" \
  'allowed_profiles = ["work"]' \
  'trust = "descendant-git-repositories"' \
  > "$REGISTRY"
chmod 600 "$REGISTRY"
if hanchou_test project list >/dev/null 2>"$TMP/collision.err"; then
  echo "expected cross-kind registry ID collision rejection" >&2
  exit 1
fi
grep -q 'duplicate project/workspace-root id: collision' "$TMP/collision.err"
write_base_registry

printf '%s\n' \
  'schema_version = 1' \
  'default_policy = "deny"' \
  '[[workspace_roots]]' \
  'id = "outer"' \
  "path = \"$TMP/allowed\"" \
  'allowed_profiles = ["work"]' \
  'trust = "descendant-git-repositories"' \
  '[[workspace_roots]]' \
  'id = "inner"' \
  "path = \"$TMP/allowed/nested\"" \
  'allowed_profiles = ["work"]' \
  'trust = "descendant-git-repositories"' \
  > "$REGISTRY"
chmod 600 "$REGISTRY"
if hanchou_test project list >/dev/null 2>"$TMP/overlap.err"; then
  echo "expected overlapping workspace-root rejection" >&2
  exit 1
fi
grep -q 'workspace roots must not overlap' "$TMP/overlap.err"
write_base_registry

chmod 622 "$REGISTRY"
if hanchou_test project list >/dev/null 2>"$TMP/mode.err"; then
  echo "expected writable registry rejection" >&2
  exit 1
fi
grep -q 'must not be group/world writable' "$TMP/mode.err"
chmod 600 "$REGISTRY"

chmod 722 "$REGISTRY_DIR"
if hanchou_test project list >/dev/null 2>"$TMP/directory-mode.err"; then
  echo "expected writable registry-directory rejection" >&2
  exit 1
fi
grep -q 'profile config directory must not be group/world writable' "$TMP/directory-mode.err"
chmod 700 "$REGISTRY_DIR"

mv "$REGISTRY" "$REGISTRY.real"
ln -s "$REGISTRY.real" "$REGISTRY"
if hanchou_test project list >/dev/null 2>"$TMP/registry-symlink.err"; then
  echo "expected registry symlink rejection" >&2
  exit 1
fi
grep -q 'regular non-symlink file' "$TMP/registry-symlink.err"
rm "$REGISTRY"
mv "$REGISTRY.real" "$REGISTRY"

hanchou_test project doctor exact --json > "$TMP/doctor.json"
node --input-type=module - "$TMP/doctor.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.ok, true);
assert.equal(value.projects[0].id, "exact");
JS

mv "$REGISTRY" "$REGISTRY.saved"
hanchou_test project list --json > "$TMP/missing-list.json"
node --input-type=module - "$TMP/missing-list.json" "$REGISTRY" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(value.registry_path, process.argv[3]);
assert.equal(value.registry_digest, null);
assert.deepEqual(value.projects, []);
assert.deepEqual(value.workspace_roots, []);
JS
if hanchou_test project resolve --path "$TMP/exact" >/dev/null 2>"$TMP/missing-resolve.err"; then
  echo "expected missing registry dispatch denial" >&2
  exit 1
fi
grep -q 'new dispatch is denied until a human creates this file' "$TMP/missing-resolve.err"
mv "$REGISTRY.saved" "$REGISTRY"

echo "project authorization lifecycle ok"
