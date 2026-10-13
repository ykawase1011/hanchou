#!/usr/bin/env bash
set -euo pipefail

# Opt-in integration test. Network + Docker required; no host HOME, skill paths,
# credentials, or writable source mount are passed into the disposable container.
repo_root=$(cd "$(dirname "$0")/.." && pwd)
docker run --rm -i --mount "type=bind,src=$repo_root,dst=/source,readonly" \
  node:22-bookworm bash -s <<'CONTAINER'
set -euo pipefail
mkdir /fixture /project /sibling
# Empty provider directories model installed agents; no credentials are present.
mkdir -p /root/.codex /root/.claude
cp -R /source/skills /fixture/skills
mkdir -p /fixture/skills/unrelated-fixture
cat > /fixture/skills/unrelated-fixture/SKILL.md <<'SKILL'
---
name: unrelated-fixture
description: A synthetic unrelated skill for installer isolation tests.
---
Keep this unrelated skill unchanged.
SKILL
cd /project
printf 'project instructions\n' > AGENTS.md
printf 'provider instructions\n' > CLAUDE.md
sha256sum AGENTS.md CLAUDE.md > /before-instructions
npm install --prefix /installer skills@1.7.2 --no-audit --no-fund > /dev/null
skills_cli=/installer/node_modules/skills/bin/cli.mjs
node "$skills_cli" --version
for scope in global project; do
  scope_args=()
  if [ "$scope" = global ]; then scope_args=(--global); fi
  node "$skills_cli" add /fixture --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron hanchou-init unrelated-fixture \
    --agent codex claude-code "${scope_args[@]}" -y < /dev/null > "/$scope-install.log"
  node "$skills_cli" list "${scope_args[@]}" --agent codex claude-code --json < /dev/null > "/$scope-list.json"
done
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
for (const root of [os.homedir(), '/project']) {
  for (const name of ['hanchou-orchestrator', 'hanchou-kaizen', 'hanchou-publish-issues', 'hanchou-update', 'hanchou-cron', 'hanchou-init', 'unrelated-fixture']) {
    const canonical = path.join(root, '.agents/skills', name);
    const claude = path.join(root, '.claude/skills', name);
    assert.equal(fs.realpathSync(claude), fs.realpathSync(canonical));
    assert.equal(fs.readFileSync(path.join(canonical, 'SKILL.md'), 'utf8'),
                 fs.readFileSync(path.join('/fixture/skills', name, 'SKILL.md'), 'utf8'));
  }
}
assert(!fs.existsSync('/sibling/.agents'));
for (const scope of ['global', 'project']) {
  const entries = JSON.parse(fs.readFileSync(`/${scope}-list.json`, 'utf8'));
  assert.equal(entries.length, 7);
  for (const entry of entries) {
    assert(entry.agents.includes('Codex'), JSON.stringify(entry));
    assert(entry.agents.includes('Claude Code'), JSON.stringify(entry));
  }
}
JS
cp -R /root/.agents/skills /before-global
cp -R /project/.agents/skills /before-project
printf '\nSynthetic new upstream update-helper content.\n' >> /fixture/skills/hanchou-update/SKILL.md
printf '\nSynthetic unrelated upstream change; must not install.\n' >> /fixture/skills/unrelated-fixture/SKILL.md
node "$skills_cli" add /fixture --skill hanchou-update --agent codex claude-code --global -y < /dev/null > /targeted-update.log
diff -r /root/.agents/skills/hanchou-update /fixture/skills/hanchou-update
for name in hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-cron hanchou-init unrelated-fixture; do
  diff -r "/before-global/$name" "/root/.agents/skills/$name"
done
diff -r /before-project /project/.agents/skills
sha256sum -c /before-instructions
cd /sibling
node "$skills_cli" add /fixture --skill hanchou-orchestrator --agent codex claude-code -y < /dev/null > /subset-install.log
test -f /sibling/.agents/skills/hanchou-orchestrator/SKILL.md
test ! -e /sibling/.agents/skills/hanchou-kaizen
test ! -e /sibling/.agents/skills/hanchou-cron
test ! -e /sibling/.agents/skills/hanchou-init
node "$skills_cli" add /fixture --skill hanchou-orchestrator --agent codex claude-code -y < /dev/null > /subset-update.log
test ! -e /sibling/.agents/skills/hanchou-kaizen
test ! -e /sibling/.agents/skills/hanchou-publish-issues
test ! -e /sibling/.agents/skills/hanchou-update
test ! -e /sibling/.agents/skills/hanchou-cron
test ! -e /sibling/.agents/skills/hanchou-init
printf 'installer integration: global/local placement and targeted reinstall isolation passed\n'
CONTAINER
