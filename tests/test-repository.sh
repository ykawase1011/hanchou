#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

for obsolete in bin/hanchou package.json herdr-plugin.toml schemas/delivery.schema.json templates/launchd skills/hanchou-worker/SKILL.md; do
  if test -e "$obsolete"; then
    echo "obsolete path: $obsolete" >&2
    exit 1
  fi
done

test -f examples/project/README.md
test -f examples/cross-project/AGENTS.md
test -f examples/cross-project/README.md
test -f docs/ONBOARDING.md
test -f docs/MIGRATION_V2_TO_V3.md

grep -q 'Project Hanchou' README.md
grep -q 'Cross-project Hanchou' README.md
grep -q 'Temporary Hanchou' README.md
grep -q 'without changing ordinary Orca behavior' README.md
grep -q -- '--agent universal claude-code --local' README.md
grep -q -- '--agent universal claude-code --local' docs/INSTALLATION.md
grep -Fq '$hanchou-orchestrator' README.md
grep -Fq '/hanchou-orchestrator' README.md
grep -Fq '$hanchou-orchestrator' docs/ONBOARDING.md
grep -Fq '/hanchou-orchestrator' docs/ONBOARDING.md

if find . -path ./.git -prune -o -type f \( -name '*.ts' -o -name '*.js' -o -name '*.json' -o -name '*.toml' \) -print | grep -q .; then
  echo 'production/runtime code or state-shaped files remain' >&2
  exit 1
fi

echo "repository contract tests: ok"
