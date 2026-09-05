#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

test "$(tr -d '\n' < VERSION)" = "3.0.0"
test -f skills/hanchou-orchestrator/SKILL.md

skill_count=$(find skills -name SKILL.md -type f | wc -l | tr -d ' ')
test "$skill_count" = "1"

for ref in role routing task-design review reporting cross-project automations; do
  test -f "skills/hanchou-orchestrator/references/$ref.md"
done

for path in bin lib libexec roles schemas templates config package.json package-lock.json mise.toml tsconfig.json herdr-plugin.toml MANIFEST.sha256; do
  test ! -e "$path"
done

for forbidden in hanchou-cli hanchou-task hanchou-relay hanchou-schedule; do
  ! find skills -mindepth 1 -maxdepth 1 -type d -name "$forbidden" | grep -q .
done

description=$(sed -n '/^description:/,/^---$/p' skills/hanchou-orchestrator/SKILL.md)
grep -q 'Activate only' <<<"$description"
grep -q 'Do not activate' <<<"$description"

grep -q 'skills get orca-cli' skills/hanchou-orchestrator/SKILL.md
grep -q 'skills get orchestration --full' skills/hanchou-orchestrator/SKILL.md
grep -q 'orchestration.contract.v1' skills/hanchou-orchestrator/SKILL.md
grep -q 'read-only current-Run inspection' skills/hanchou-orchestrator/SKILL.md
grep -q 'nonexistent Experimental toggle' skills/hanchou-orchestrator/SKILL.md
grep -q '`computer-use`' skills/hanchou-orchestrator/SKILL.md
grep -q '`orca-per-workspace-env`' skills/hanchou-orchestrator/SKILL.md
grep -q '`orca-linear`' skills/hanchou-orchestrator/SKILL.md
grep -q '`orca-emulator`' skills/hanchou-orchestrator/SKILL.md
grep -q 'fail closed' skills/hanchou-orchestrator/SKILL.md

echo "structure validation: ok"
