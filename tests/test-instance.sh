#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/hanchou-instance.XXXXXX)"
TMP="$(cd "$TMP" && pwd -P)"
trap 'rm -rf "$TMP"' EXIT

export HANCHOU_TEST_OPERATOR_HOME="$TMP/operator"
export HANCHOU_TEST_INSTANCE_ROOT="$HANCHOU_TEST_OPERATOR_HOME/HanchouWorkspace/work"
export HANCHOU_TEST_CORE_SOURCE="$TMP/core.git"
export HANCHOU_TEST_SKILLS_SOURCE="$TMP/skills.git"
export HANCHOU_TEST_INSTANCE_LOG="$TMP/instance-callbacks.log"
export HANCHOU_TEST_LAUNCHER_LOG="$TMP/launcher.log"
export HANCHOU_TEST_FAILURE_MARKER="$TMP/post-activate-failed-once"

MOCK_USER_INFO="$TMP/mock-user-info.cjs"
mkdir -p "$HANCHOU_TEST_OPERATOR_HOME"
chmod 700 "$HANCHOU_TEST_OPERATOR_HOME"
printf '%s\n' \
  'const os = require("node:os");' \
  'const original = os.userInfo;' \
  'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  > "$MOCK_USER_INFO"

git_identity() {
  git -C "$1" config user.name "Hanchou Test"
  git -C "$1" config user.email "hanchou-test@example.invalid"
}

create_core_source() {
  local source="$1"
  mkdir -p "$source/bin" "$source/.codex/rules" "$source/.codex/agents" "$source/.claude/agents"
  printf '%s\n' \
    '#!/bin/bash' \
    'set -euo pipefail' \
    'printf "%s|%s|%s|%s|%s\n" "$*" "${HANCHOU_INSTANCE_ROOT:-}" "${HANCHOU_INSTANCE_PROFILE:-}" "${HANCHOU_PROFILE:-}" "${HANCHOU_INSTANCE_LAUNCHER:-}" > "${HANCHOU_TEST_LAUNCHER_LOG:?}"' \
    > "$source/bin/hanchou"
  chmod 755 "$source/bin/hanchou"
  printf '%s\n' '1.0.0' > "$source/VERSION"
  printf '%s\n' '[tools]' 'node = "22"' > "$source/mise.toml"
  printf '%s\n' '[agents.orchestrator]' 'description = "fixture"' > "$source/.codex/config.toml"
  printf '%s\n' 'prefix_rule(pattern=["hanchou"], decision="prompt")' > "$source/.codex/rules/hanchou.rules"
  printf '%s\n' 'name = "orchestrator"' > "$source/.codex/agents/orchestrator.toml"
  printf '%s\n' '# Orchestrator fixture' > "$source/.claude/agents/orchestrator.md"
  git -C "$source" init -q -b main
  git_identity "$source"
  git -C "$source" add .
  git -C "$source" commit -qm "Core base"
}

create_skills_source() {
  local source="$1"
  mkdir -p "$source/skills/fixture"
  printf '%s\n' '1.0.0' > "$source/VERSION"
  printf '%s\n' '# Fixture skill' > "$source/skills/fixture/SKILL.md"
  git -C "$source" init -q -b main
  git_identity "$source"
  git -C "$source" add .
  git -C "$source" commit -qm "Skills base"
}

CORE_WORK="$TMP/core-work"
SKILLS_WORK="$TMP/skills-work"
create_core_source "$CORE_WORK"
create_skills_source "$SKILLS_WORK"
git clone -q --bare "$CORE_WORK" "$HANCHOU_TEST_CORE_SOURCE"
git clone -q --bare "$SKILLS_WORK" "$HANCHOU_TEST_SKILLS_SOURCE"
git -C "$CORE_WORK" remote add fixture "$HANCHOU_TEST_CORE_SOURCE"
git -C "$SKILLS_WORK" remote add fixture "$HANCHOU_TEST_SKILLS_SOURCE"

BASE_CORE="$(git -C "$CORE_WORK" rev-parse HEAD)"
BASE_SKILLS="$(git -C "$SKILLS_WORK" rev-parse HEAD)"

instance_call() {
  NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
    --input-type=module - "$ROOT/libexec/hanchou.ts" "$@" <<'JS'
import { appendFileSync, chmodSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
const operation = process.argv[3];
const phase = process.argv[4];
const token = process.argv[5] ?? null;
const module = await import(pathToFileURL(modulePath).href);
const [, profile] = module.loadProfile("work");
const head = (path) => execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const overrides = {
  root: process.env.HANCHOU_TEST_INSTANCE_ROOT,
  coreSource: process.env.HANCHOU_TEST_CORE_SOURCE,
  skillsSource: process.env.HANCHOU_TEST_SKILLS_SOURCE,
  ref: "refs/heads/main",
  interactive: process.env.HANCHOU_TEST_INTERACTIVE !== "0",
  validateCandidate(corePath, skillsPath) {
    if (process.env.HANCHOU_TEST_VALIDATE_FAIL === "1") throw new Error("simulated candidate validation failure");
    appendFileSync(
      process.env.HANCHOU_TEST_INSTANCE_LOG,
      `validate|${head(corePath)}|${head(skillsPath)}|${corePath}|${skillsPath}\n`,
    );
    if (process.env.HANCHOU_TEST_VALIDATE_DIRTY === "1") {
      writeFileSync(resolve(corePath, "validator-untracked.txt"), "dirty\n");
    }
    if (process.env.HANCHOU_TEST_VALIDATE_HOOK === "1") {
      const hook = resolve(corePath, ".git", "hooks", "post-checkout");
      writeFileSync(hook, "#!/bin/sh\nexit 0\n");
      chmodSync(hook, 0o700);
    }
    if (process.env.HANCHOU_TEST_VALIDATE_IGNORED === "1") {
      appendFileSync(resolve(corePath, ".git", "info", "exclude"), "\nvalidator-payload.js\n");
      writeFileSync(resolve(corePath, "validator-payload.js"), "throw new Error('unreviewed');\n");
    }
    if (process.env.HANCHOU_TEST_MUTATE_MANAGED === "1") {
      writeFileSync(resolve(process.env.HANCHOU_TEST_INSTANCE_ROOT, "hanchou", "validator-managed.txt"), "dirty\n");
    }
    if (process.env.HANCHOU_TEST_MUTATE_REGISTRY === "1") {
      appendFileSync(resolve(process.env.HANCHOU_TEST_OPERATOR_HOME, ".config", "hanchou", "work", "projects.local.toml"), "\n# validator drift\n");
    }
    if (process.env.HANCHOU_TEST_PLANT_INIT_TARGET === "1") {
      writeFileSync(resolve(process.env.HANCHOU_TEST_INSTANCE_ROOT, "AGENTS.md"), "preserve planted target\n");
    }
  },
  postActivate(launcherPath, selectedProfile) {
    const instanceRoot = dirname(dirname(launcherPath));
    appendFileSync(
      process.env.HANCHOU_TEST_INSTANCE_LOG,
      `activate|${selectedProfile}|${head(resolve(instanceRoot, "hanchou"))}|${head(resolve(instanceRoot, "hanchou-skills"))}\n`,
    );
    if (process.env.HANCHOU_TEST_POST_ACTIVATE_FAIL_ONCE === "1" && !existsSync(process.env.HANCHOU_TEST_FAILURE_MARKER)) {
      writeFileSync(process.env.HANCHOU_TEST_FAILURE_MARKER, "failed\n");
      throw new Error("simulated post-activation failure");
    }
  },
};
const args = phase === "plan" ? { yes: false } : { yes: true, plan: token };
try {
  if (operation === "init") module.initInstanceCommand(args, "work", profile, overrides);
  else if (operation === "update") module.updateInstanceCommand(args, "work", profile, overrides);
  else if (operation === "rollback") module.rollbackInstanceCommand(args, "work", profile, overrides);
  else throw new Error(`unknown fixture operation: ${operation}`);
} catch (error) {
  process.stderr.write(`fixture: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
JS
}

plan_token() {
  sed -n 's/^  plan token: //p' "$1"
}

assert_commit_pair() {
  local expected_core="$1"
  local expected_skills="$2"
  local expected_previous_core="${3:-null}"
  node --input-type=module - \
    "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json" \
    "$expected_core" "$expected_skills" "$expected_previous_core" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const metadata = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(metadata.schema, "hanchou.instance.v1");
assert.equal(metadata.current.core, process.argv[3]);
assert.equal(metadata.current.skills, process.argv[4]);
if (process.argv[5] === "null") assert.equal(metadata.previous, null);
else assert.equal(metadata.previous.core, process.argv[5]);
JS
  [[ "$(git -C "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" rev-parse HEAD)" == "$expected_core" ]]
  [[ "$(git -C "$HANCHOU_TEST_INSTANCE_ROOT/hanchou-skills" rev-parse HEAD)" == "$expected_skills" ]]
}

# Pair compatibility is explicit, and candidate checks do not inherit common
# credential/proxy variables or the operator's normal HOME configuration.
PAIR_ROOT="$HANCHOU_TEST_OPERATOR_HOME/pair-fixture"
mkdir -p "$PAIR_ROOT/core/config/skills" "$PAIR_ROOT/core/skills/hanchou-cli" "$PAIR_ROOT/skills/skills/hanchou-cli"
printf '%s\n' '[components.hanchou_skills]' 'version = "1.0.0"' > "$PAIR_ROOT/core/config/versions.toml"
printf '%s\n' '[[sources]]' 'location = "../hanchou-skills"' 'enabled = true' 'skills = ["hanchou-cli"]' > "$PAIR_ROOT/core/config/skills/sources.example.toml"
printf '%s\n' '# shared CLI' > "$PAIR_ROOT/core/skills/hanchou-cli/SKILL.md"
printf '%s\n' '# shared CLI' > "$PAIR_ROOT/skills/skills/hanchou-cli/SKILL.md"
printf '%s\n' '1.0.0' > "$PAIR_ROOT/skills/VERSION"
GH_TOKEN=sentinel-gh GITHUB_TOKEN=sentinel-github HTTPS_PROXY=https://secret.invalid \
NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types --input-type=module - \
  "$ROOT/libexec/hanchou.ts" "$PAIR_ROOT/core" "$PAIR_ROOT/skills" <<'JS'
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const module = await import(pathToFileURL(process.argv[2]).href);
const core = process.argv[3];
const skills = process.argv[4];
const env = module.candidateValidationEnvironment(core, skills);
for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
  assert.equal(env[key], undefined);
}
assert.notEqual(env.HOME, process.env.HANCHOU_TEST_OPERATOR_HOME);
mkdirSync(`${env.HOME}/.config`, { recursive: true });
writeFileSync(`${env.HOME}/.config/planted`, "must-not-reuse\n");
const freshEnv = module.candidateValidationEnvironment(core, skills);
assert.notEqual(freshEnv.HOME, env.HOME);
assert.equal(existsSync(`${freshEnv.HOME}/.config/planted`), false);
module.validateInstancePair(core, skills);
writeFileSync(`${skills}/VERSION`, "9.0.0\n");
assert.throws(() => module.validateInstancePair(core, skills), /candidate pair mismatch/);
JS

# The fixed profile root is reserved for Hanchou. Init must never overwrite
# unknown regular files or symlinked control paths left there beforehand.
mkdir -p "$HANCHOU_TEST_INSTANCE_ROOT"
chmod 700 "$HANCHOU_TEST_OPERATOR_HOME/HanchouWorkspace" "$HANCHOU_TEST_INSTANCE_ROOT"
printf '%s\n' preserve > "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md"
if instance_call init plan > "$TMP/init-existing-file.out" 2> "$TMP/init-existing-file.err"; then
  echo "expected init to reject an existing root control file" >&2
  exit 1
fi
grep -q 'instance root contains unknown entries' "$TMP/init-existing-file.err"
grep -qx preserve "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md"
mv "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md" "$TMP/preserved-agents.md"
ln -s "$TMP" "$HANCHOU_TEST_INSTANCE_ROOT/.codex"
if instance_call init plan > "$TMP/init-existing-symlink.out" 2> "$TMP/init-existing-symlink.err"; then
  echo "expected init to reject a symlinked root control path" >&2
  exit 1
fi
grep -q 'instance root contains unknown entries' "$TMP/init-existing-symlink.err"
[[ -L "$HANCHOU_TEST_INSTANCE_ROOT/.codex" ]]
unlink "$HANCHOU_TEST_INSTANCE_ROOT/.codex"
rmdir "$HANCHOU_TEST_INSTANCE_ROOT"

# Init is a reviewed two-step operation. Planning downloads and validates into
# the operator cache but does not create or populate the profile root.
if HANCHOU_TEST_INTERACTIVE=0 instance_call init plan > "$TMP/init-plan-nontty.out" 2> "$TMP/init-plan-nontty.err"; then
  echo "expected init prepare to reject a non-interactive caller" >&2
  exit 1
fi
grep -q 'requires an interactive terminal' "$TMP/init-plan-nontty.err"
if HANCHOU_AGENT_ID=orchestrator instance_call init plan > "$TMP/init-plan-agent.out" 2> "$TMP/init-plan-agent.err"; then
  echo "expected init prepare to reject a managed Agent" >&2
  exit 1
fi
grep -q 'must run outside a Herdr-managed Agent' "$TMP/init-plan-agent.err"
instance_call init plan > "$TMP/init-plan.out"
INIT_TOKEN="$(plan_token "$TMP/init-plan.out")"
[[ "${#INIT_TOKEN}" == "64" && "$INIT_TOKEN" != *[!a-f0-9]* ]]
grep -q 'Hanchou instance init plan: work' "$TMP/init-plan.out"
grep -Fq "Core: not installed -> $BASE_CORE" "$TMP/init-plan.out"
grep -Fq "Skills: not installed -> $BASE_SKILLS" "$TMP/init-plan.out"
grep -Fq "$ROOT/bin/hanchou init work --plan $INIT_TOKEN --yes" "$TMP/init-plan.out"
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT" ]]

# candidate_path is non-fingerprinted metadata for locating the cache, so it
# must still be bound to the plan.json directory. A same-user Agent must not be
# able to redirect the later recursive cleanup to another HOME subtree.
INIT_PLAN="$HANCHOU_TEST_OPERATOR_HOME/.cache/hanchou/instance-plans/work/$INIT_TOKEN/plan.json"
cp "$INIT_PLAN" "$TMP/init-plan.original.json"
REDIRECTED_CANDIDATE="$HANCHOU_TEST_OPERATOR_HOME/do-not-delete/$INIT_TOKEN"
mkdir -p "$REDIRECTED_CANDIDATE"
printf '%s\n' preserve > "$REDIRECTED_CANDIDATE/marker"
node --input-type=module - "$INIT_PLAN" "$REDIRECTED_CANDIDATE" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const plan = JSON.parse(readFileSync(process.argv[2], "utf8"));
plan.candidate_path = process.argv[3];
writeFileSync(process.argv[2], `${JSON.stringify(plan)}\n`, { mode: 0o600 });
JS
if instance_call init apply "$INIT_TOKEN" > "$TMP/init-redirect.out" 2> "$TMP/init-redirect.err"; then
  echo "expected init apply to reject a redirected candidate path" >&2
  exit 1
fi
grep -q 'candidate path must exactly match its fixed plan directory' "$TMP/init-redirect.err"
[[ -f "$REDIRECTED_CANDIDATE/marker" ]]
mv "$TMP/init-plan.original.json" "$INIT_PLAN"
chmod 600 "$INIT_PLAN"

# The exact plan token still cannot bypass the human/Agent boundary.
if HANCHOU_TEST_INTERACTIVE=0 instance_call init apply "$INIT_TOKEN" > "$TMP/init-nontty.out" 2> "$TMP/init-nontty.err"; then
  echo "expected init apply to reject a non-interactive caller" >&2
  exit 1
fi
grep -q 'requires an interactive terminal' "$TMP/init-nontty.err"
if HANCHOU_AGENT_ID=orchestrator instance_call init apply "$INIT_TOKEN" > "$TMP/init-agent.out" 2> "$TMP/init-agent.err"; then
  echo "expected init apply to reject a managed Agent" >&2
  exit 1
fi
grep -q 'outside a Herdr-managed Agent' "$TMP/init-agent.err"
if instance_call init apply not-a-token > "$TMP/init-token.out" 2> "$TMP/init-token.err"; then
  echo "expected init apply to reject a malformed token" >&2
  exit 1
fi
grep -q 'exact 64-character --plan token' "$TMP/init-token.err"
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT" ]]

# Candidate validation is executable and therefore untrusted to preserve Git
# state. Recheck exact detached/clean state immediately before installation.
if HANCHOU_TEST_VALIDATE_DIRTY=1 instance_call init apply "$INIT_TOKEN" > "$TMP/init-validator-dirty.out" 2> "$TMP/init-validator-dirty.err"; then
  echo "expected init apply to reject validator-induced checkout drift" >&2
  exit 1
fi
grep -q 'validated disposable Core checkout has local changes' "$TMP/init-validator-dirty.err"
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json" ]]
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" ]]
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/hanchou-skills" ]]

if HANCHOU_TEST_VALIDATE_HOOK=1 instance_call init apply "$INIT_TOKEN" > "$TMP/init-validator-hook.out" 2> "$TMP/init-validator-hook.err"; then
  echo "expected init apply to reject validator-installed Git hooks" >&2
  exit 1
fi
grep -q 'Git hooks directory contains unapproved entries' "$TMP/init-validator-hook.err"
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json" ]]
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" ]]

if HANCHOU_TEST_VALIDATE_IGNORED=1 instance_call init apply "$INIT_TOKEN" > "$TMP/init-validator-ignored.out" 2> "$TMP/init-validator-ignored.err"; then
  echo "expected init apply to reject validator-hidden ignored artifacts" >&2
  exit 1
fi
grep -q 'Git info exclude contains unapproved ignore rules' "$TMP/init-validator-ignored.err"
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json" ]]
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/hanchou/validator-payload.js" ]]

if HANCHOU_TEST_PLANT_INIT_TARGET=1 instance_call init apply "$INIT_TOKEN" > "$TMP/init-target-race.out" 2> "$TMP/init-target-race.err"; then
  echo "expected init apply to reject a target planted during validation" >&2
  exit 1
fi
grep -q 'init deployment target appeared after review' "$TMP/init-target-race.err"
grep -qx 'preserve planted target' "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md"
mv "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md" "$TMP/planted-init-target.md"

instance_call init apply "$INIT_TOKEN" > "$TMP/init-apply.out"
grep -Fq "Hanchou instance ready: $HANCHOU_TEST_INSTANCE_ROOT" "$TMP/init-apply.out"
for path in \
  "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou" \
  "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" \
  "$HANCHOU_TEST_INSTANCE_ROOT/hanchou-skills" \
  "$HANCHOU_TEST_INSTANCE_ROOT/repositories" \
  "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json" \
  "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md" \
  "$HANCHOU_TEST_INSTANCE_ROOT/.codex/rules/hanchou.rules"; do
  [[ -e "$path" ]]
  [[ ! -L "$path" ]]
done
[[ -x "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou" ]]
assert_commit_pair "$BASE_CORE" "$BASE_SKILLS"

case "$(uname -s)" in
  Darwin) [[ "$(stat -f '%Lp' "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json")" == "600" ]] ;;
  Linux) [[ "$(stat -c '%a' "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/instance.json")" == "600" ]] ;;
esac

# The stable launcher ignores caller-selected instance/profile values and
# always executes the managed Core for this profile.
HOME="$TMP/spoof-home" \
HANCHOU_INSTANCE_ROOT="$TMP/evil-root" \
HANCHOU_INSTANCE_PROFILE=personal \
HANCHOU_PROFILE=personal \
  "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou" doctor --json
IFS='|' read -r LAUNCH_ARGS LAUNCH_ROOT LAUNCH_INSTANCE_PROFILE LAUNCH_PROFILE LAUNCHER_PATH < "$HANCHOU_TEST_LAUNCHER_LOG"
[[ "$LAUNCH_ARGS" == "doctor --json" ]]
[[ "$LAUNCH_ROOT" == "$HANCHOU_TEST_INSTANCE_ROOT" ]]
[[ "$LAUNCH_INSTANCE_PROFILE" == "work" && "$LAUNCH_PROFILE" == "work" ]]
[[ "$LAUNCHER_PATH" == "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou" ]]

mv "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md" "$TMP/installed-agents.md"
ln -s "$TMP/preserved-agents.md" "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md"
if instance_call update plan > "$TMP/update-control-symlink.out" 2> "$TMP/update-control-symlink.err"; then
  echo "expected update to reject a symlinked managed control file" >&2
  exit 1
fi
grep -q 'instance managed control file must be a regular non-symlink file' "$TMP/update-control-symlink.err"
[[ -L "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md" ]]
unlink "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md"
mv "$TMP/installed-agents.md" "$HANCHOU_TEST_INSTANCE_ROOT/AGENTS.md"

mv "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou" "$TMP/installed-launcher"
cp "$TMP/installed-launcher" "$TMP/launcher-hardlink-victim"
ln "$TMP/launcher-hardlink-victim" "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou"
if instance_call update plan > "$TMP/update-control-hardlink.out" 2> "$TMP/update-control-hardlink.err"; then
  echo "expected update to reject a hard-linked profile launcher" >&2
  exit 1
fi
grep -q 'profile-local launcher must not be hard-linked' "$TMP/update-control-hardlink.err"
cmp -s "$TMP/installed-launcher" "$TMP/launcher-hardlink-victim"
rm "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou"
mv "$TMP/installed-launcher" "$HANCHOU_TEST_INSTANCE_ROOT/bin/hanchou"

mv "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou" "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou-real"
ln -s "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou-real" "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou"
if instance_call update plan > "$TMP/update-control-root-symlink.out" 2> "$TMP/update-control-root-symlink.err"; then
  echo "expected update to reject a symlinked instance control directory" >&2
  exit 1
fi
grep -q 'instance control directory must be a regular non-symlink directory' "$TMP/update-control-root-symlink.err"
unlink "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou"
mv "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou-real" "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou"

# Managed checkout Git administration is not part of the reviewed public
# commit. Reject planted executable config and hidden index state before any
# human lifecycle command can invoke status/checkout through it.
FSMONITOR_PAYLOAD="$TMP/fsmonitor-payload.sh"
FSMONITOR_MARKER="$TMP/fsmonitor-executed"
printf '%s\n' '#!/bin/sh' "touch '$FSMONITOR_MARKER'" 'exit 1' > "$FSMONITOR_PAYLOAD"
chmod 700 "$FSMONITOR_PAYLOAD"
git -C "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" config core.fsmonitor "$FSMONITOR_PAYLOAD"
if instance_call update plan > "$TMP/update-fsmonitor.out" 2> "$TMP/update-fsmonitor.err"; then
  echo "expected update to reject planted core.fsmonitor config" >&2
  exit 1
fi
grep -q 'Git config contains unapproved core.fsmonitor' "$TMP/update-fsmonitor.err"
[[ ! -e "$FSMONITOR_MARKER" ]]
git -C "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" config --unset core.fsmonitor

git -C "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" update-index --skip-worktree VERSION
if instance_call update plan > "$TMP/update-index-flag.out" 2> "$TMP/update-index-flag.err"; then
  echo "expected update to reject hidden Git index flags" >&2
  exit 1
fi
grep -q 'Git index contains skip-worktree' "$TMP/update-index-flag.err"
git -C "$HANCHOU_TEST_INSTANCE_ROOT/hanchou" update-index --no-skip-worktree VERSION

# Lifecycle Git operations must neither follow nor write FETCH_HEAD. The whole
# managed Git administration tree is link-audited before any human update, and
# mutable administration files may not be hard-linked outside the checkout.
FETCH_HEAD_PATH="$HANCHOU_TEST_INSTANCE_ROOT/hanchou/.git/FETCH_HEAD"
if [[ -e "$FETCH_HEAD_PATH" ]]; then mv "$FETCH_HEAD_PATH" "$TMP/fetch-head.original"; fi
printf '%s\n' 'preserve fetch victim' > "$TMP/fetch-head-victim"
ln -s "$TMP/fetch-head-victim" "$FETCH_HEAD_PATH"
if instance_call update plan > "$TMP/update-fetch-head-symlink.out" 2> "$TMP/update-fetch-head-symlink.err"; then
  echo "expected update to reject a symlinked FETCH_HEAD" >&2
  exit 1
fi
grep -q 'Git administrative state must not contain symbolic links' "$TMP/update-fetch-head-symlink.err"
grep -qx 'preserve fetch victim' "$TMP/fetch-head-victim"
unlink "$FETCH_HEAD_PATH"
if [[ -e "$TMP/fetch-head.original" ]]; then mv "$TMP/fetch-head.original" "$FETCH_HEAD_PATH"; fi

HEAD_LOG_PATH="$HANCHOU_TEST_INSTANCE_ROOT/hanchou/.git/logs/HEAD"
mv "$HEAD_LOG_PATH" "$TMP/head-log.original"
printf '%s\n' 'preserve reflog victim' > "$TMP/head-log-victim"
ln "$TMP/head-log-victim" "$HEAD_LOG_PATH"
if instance_call update plan > "$TMP/update-head-log-hardlink.out" 2> "$TMP/update-head-log-hardlink.err"; then
  echo "expected update to reject a hard-linked reflog" >&2
  exit 1
fi
grep -q 'Git administrative file must not be hard-linked' "$TMP/update-head-log-hardlink.err"
grep -qx 'preserve reflog victim' "$TMP/head-log-victim"
rm "$HEAD_LOG_PATH"
mv "$TMP/head-log.original" "$HEAD_LOG_PATH"

# A regular FETCH_HEAD is deliberately left with sentinel content. Successful
# update and rollback below must preserve it byte-for-byte.
printf '%s\n' 'fetch-head sentinel' > "$FETCH_HEAD_PATH"

# Publish the second pair, prepare it, then advance upstream again before
# apply. Activation must use the exact reviewed second pair rather than latest.
printf '%s\n' '2.0.0' > "$CORE_WORK/VERSION"
git -C "$CORE_WORK" add VERSION
git -C "$CORE_WORK" commit -qm "Core second"
git -C "$CORE_WORK" push -q fixture main
SECOND_CORE="$(git -C "$CORE_WORK" rev-parse HEAD)"
printf '%s\n' '2.0.0' > "$SKILLS_WORK/VERSION"
git -C "$SKILLS_WORK" add VERSION
git -C "$SKILLS_WORK" commit -qm "Skills second"
git -C "$SKILLS_WORK" push -q fixture main
SECOND_SKILLS="$(git -C "$SKILLS_WORK" rev-parse HEAD)"

if HANCHOU_TEST_INTERACTIVE=0 instance_call update plan > "$TMP/update-plan-nontty.out" 2> "$TMP/update-plan-nontty.err"; then
  echo "expected update prepare to reject a non-interactive caller" >&2
  exit 1
fi
grep -q 'requires an interactive terminal' "$TMP/update-plan-nontty.err"
if HERDR_ENV=1 instance_call update plan > "$TMP/update-plan-agent.out" 2> "$TMP/update-plan-agent.err"; then
  echo "expected update prepare to reject a Herdr-managed caller" >&2
  exit 1
fi
grep -q 'must run outside a Herdr-managed Agent' "$TMP/update-plan-agent.err"
instance_call update plan > "$TMP/update-plan.out"
UPDATE_TOKEN="$(plan_token "$TMP/update-plan.out")"
[[ "${#UPDATE_TOKEN}" == "64" ]]
assert_commit_pair "$BASE_CORE" "$BASE_SKILLS"

printf '%s\n' '3.0.0' > "$CORE_WORK/VERSION"
git -C "$CORE_WORK" add VERSION
git -C "$CORE_WORK" commit -qm "Core third"
git -C "$CORE_WORK" push -q fixture main
THIRD_CORE="$(git -C "$CORE_WORK" rev-parse HEAD)"
printf '%s\n' '3.0.0' > "$SKILLS_WORK/VERSION"
git -C "$SKILLS_WORK" add VERSION
git -C "$SKILLS_WORK" commit -qm "Skills third"
git -C "$SKILLS_WORK" push -q fixture main
THIRD_SKILLS="$(git -C "$SKILLS_WORK" rev-parse HEAD)"

if HANCHOU_TEST_INTERACTIVE=0 instance_call update apply "$UPDATE_TOKEN" > "$TMP/update-nontty.out" 2> "$TMP/update-nontty.err"; then
  echo "expected update apply to reject a non-interactive caller" >&2
  exit 1
fi
grep -q 'requires an interactive terminal' "$TMP/update-nontty.err"
if HERDR_ENV=1 instance_call update apply "$UPDATE_TOKEN" > "$TMP/update-agent.out" 2> "$TMP/update-agent.err"; then
  echo "expected update apply to reject a Herdr-managed caller" >&2
  exit 1
fi
grep -q 'outside a Herdr-managed Agent' "$TMP/update-agent.err"

PROJECT_REGISTRY="$HANCHOU_TEST_OPERATOR_HOME/.config/hanchou/work/projects.local.toml"
cp "$PROJECT_REGISTRY" "$TMP/projects.before-validation.toml"
if HANCHOU_TEST_MUTATE_REGISTRY=1 instance_call update apply "$UPDATE_TOKEN" > "$TMP/update-registry-race.out" 2> "$TMP/update-registry-race.err"; then
  echo "expected update to recheck the registry after candidate validation" >&2
  exit 1
fi
grep -q 'project registry changed while the update candidate was being validated' "$TMP/update-registry-race.err"
mv "$TMP/projects.before-validation.toml" "$PROJECT_REGISTRY"
chmod 600 "$PROJECT_REGISTRY"

if HANCHOU_TEST_MUTATE_MANAGED=1 instance_call update apply "$UPDATE_TOKEN" > "$TMP/update-managed-race.out" 2> "$TMP/update-managed-race.err"; then
  echo "expected update to recheck the deployed pair after candidate validation" >&2
  exit 1
fi
grep -q 'managed Core checkout has local changes' "$TMP/update-managed-race.err"
rm "$HANCHOU_TEST_INSTANCE_ROOT/hanchou/validator-managed.txt"
assert_commit_pair "$BASE_CORE" "$BASE_SKILLS"

instance_call update apply "$UPDATE_TOKEN" > "$TMP/update-apply.out"
grep -Fq "Hanchou instance updated: Core $SECOND_CORE, Skills $SECOND_SKILLS" "$TMP/update-apply.out"
assert_commit_pair "$SECOND_CORE" "$SECOND_SKILLS" "$BASE_CORE"
grep -qx 'fetch-head sentinel' "$FETCH_HEAD_PATH"
[[ "$(git -C "$HANCHOU_TEST_CORE_SOURCE" rev-parse refs/heads/main)" == "$THIRD_CORE" ]]
[[ "$(git -C "$HANCHOU_TEST_SKILLS_SOURCE" rev-parse refs/heads/main)" == "$THIRD_SKILLS" ]]
grep -Fq "activate|work|$SECOND_CORE|$SECOND_SKILLS" "$HANCHOU_TEST_INSTANCE_LOG"

# Rollback is itself reviewed and swaps the previous pair back into service.
if HANCHOU_TEST_INTERACTIVE=0 instance_call rollback plan > "$TMP/rollback-plan-nontty.out" 2> "$TMP/rollback-plan-nontty.err"; then
  echo "expected rollback prepare to reject a non-interactive caller" >&2
  exit 1
fi
grep -q 'requires an interactive terminal' "$TMP/rollback-plan-nontty.err"
if HANCHOU_AGENT_ID=orchestrator instance_call rollback plan > "$TMP/rollback-plan-agent.out" 2> "$TMP/rollback-plan-agent.err"; then
  echo "expected rollback prepare to reject a managed Agent" >&2
  exit 1
fi
grep -q 'must run outside a Herdr-managed Agent' "$TMP/rollback-plan-agent.err"
instance_call rollback plan > "$TMP/rollback-plan.out"
ROLLBACK_TOKEN="$(plan_token "$TMP/rollback-plan.out")"
[[ "${#ROLLBACK_TOKEN}" == "64" ]]
instance_call rollback apply "$ROLLBACK_TOKEN" > "$TMP/rollback-apply.out"
grep -Fq "Hanchou instance rolled back: Core $BASE_CORE, Skills $BASE_SKILLS" "$TMP/rollback-apply.out"
assert_commit_pair "$BASE_CORE" "$BASE_SKILLS" "$SECOND_CORE"
grep -qx 'fetch-head sentinel' "$FETCH_HEAD_PATH"

# A dirty managed checkout is rejected before preparing another update.
printf '%s\n' dirty > "$HANCHOU_TEST_INSTANCE_ROOT/hanchou/untracked.txt"
if instance_call update plan > "$TMP/update-dirty.out" 2> "$TMP/update-dirty.err"; then
  echo "expected update to reject a dirty managed Core" >&2
  exit 1
fi
grep -q 'managed Core checkout has local changes' "$TMP/update-dirty.err"
rm "$HANCHOU_TEST_INSTANCE_ROOT/hanchou/untracked.txt"

# Prepare the third pair. A simulated post-activation failure must restore the
# original pair, invoke post-activation again on that pair, and clear the
# transaction only after the rollback succeeds.
instance_call update plan > "$TMP/update-third-plan.out"
THIRD_TOKEN="$(plan_token "$TMP/update-third-plan.out")"
if instance_call update apply ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff > "$TMP/update-wrong-token.out" 2> "$TMP/update-wrong-token.err"; then
  echo "expected update to reject an unknown token" >&2
  exit 1
fi
grep -q 'instance plan' "$TMP/update-wrong-token.err"
rm -f "$HANCHOU_TEST_FAILURE_MARKER"
if HANCHOU_TEST_POST_ACTIVATE_FAIL_ONCE=1 instance_call update apply "$THIRD_TOKEN" > "$TMP/update-failed.out" 2> "$TMP/update-failed.err"; then
  echo "expected simulated post-activation failure" >&2
  exit 1
fi
grep -q 'failed after switch and was rolled back' "$TMP/update-failed.err"
assert_commit_pair "$BASE_CORE" "$BASE_SKILLS" "$SECOND_CORE"
[[ ! -e "$HANCHOU_TEST_INSTANCE_ROOT/.hanchou/transaction.json" ]]
tail -n 2 "$HANCHOU_TEST_INSTANCE_LOG" > "$TMP/activation-tail.out"
grep -Fq "activate|work|$THIRD_CORE|$THIRD_SKILLS" "$TMP/activation-tail.out"
grep -Fq "activate|work|$BASE_CORE|$BASE_SKILLS" "$TMP/activation-tail.out"

echo "profile-local instance lifecycle ok"
