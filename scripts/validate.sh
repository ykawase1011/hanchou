#!/usr/bin/env bash
# Distribution checks only. No user configuration or external services are used.
set -euo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$repo_root"
fail() { printf 'structure validation: %s\n' "$*" >&2; exit 1; }
for dependency in git jq awk; do
  command -v "$dependency" >/dev/null 2>&1 || fail "missing dependency: $dependency"
done
[[ $(tr -d '\r\n' < VERSION) == 2.0.0 ]] || fail 'unexpected distribution version'

expected='hanchou-orchestrator hanchou-sokkin hanchou-init hanchou-update'
for skill in $expected; do
  file="skills/$skill/SKILL.md"
  [[ -s $file ]] || fail "missing $file"
  # Check the standard skill identity, without requiring specific prose.
  awk -v name="$skill" '
    NR==1 { if ($0 != "---") exit 1; next }
    $0=="---" { closed=1; exit }
    $0=="name: " name { named=1 }
    /^description:[[:space:]]*[^[:space:]]/ { described=1 }
    END { if (!closed || !named || !described) exit 1 }
  ' "$file" || fail "invalid skill frontmatter: $file"
done
count=0
while IFS= read -r -d '' file; do
  count=$((count + 1))
done < <(find skills -type f -name SKILL.md -print0)
[[ $count == 4 ]] || fail 'expected exactly four skills'

launcher=skills/hanchou-orchestrator/scripts/launch-sokkin.sh
measurement=skills/hanchou-orchestrator/scripts/measure-session.sh
[[ -x $launcher ]] || fail 'missing executable one-shot launcher'
[[ -x $measurement ]] || fail 'missing executable one-shot measurement'
while IFS= read -r -d '' file; do
  case "$file" in
    *.md) ;;
    "$launcher"|"$measurement") ;;
    skills/hanchou-init/assets/config-template.json) jq -e . "$file" >/dev/null || fail "invalid config template" ;;
    *) fail "unexpected production artifact: $file" ;;
  esac
done < <(find skills -type f -print0)
for path in bin lib libexec roles schemas templates config package.json package-lock.json mise.toml tsconfig.json herdr-plugin.toml MANIFEST.sha256; do
  [[ ! -e $path ]] || fail "unexpected runtime artifact: $path"
done

# Parse every shipped shell file, including test helpers, without executing it.
while IFS= read -r -d '' file; do
  bash -n "$file" || fail "invalid shell syntax: $file"
done < <(find scripts tests skills -type f -name '*.sh' -print0)

# Check ordinary inline local Markdown links. Remote URLs and fragment-only
# references are intentionally not fetched; heading anchors are not validated.
# Fenced examples are skipped. No Markdown renderer/runtime is required.
while IFS= read -r -d '' file; do
  while IFS= read -r target; do
    case "$target" in
      ''|'#'*|/*|*://*|mailto:*|data:*|app:*|skill:*) continue ;;
    esac
    target=${target%%#*}
    target=${target%%\?*}
    [[ -n $target ]] || continue
    target=${target#<}
    target=${target%>}
    [[ -e "$(dirname "$file")/$target" ]] || fail "broken local link in $file: $target"
  done < <(awk '
    /^[[:space:]]*```/ || /^[[:space:]]*~~~/ { fenced=!fenced; next }
    !fenced {
      line=$0
      while (match(line, /\]\([^)]*\)/)) {
        target=substr(line,RSTART+2,RLENGTH-3)
        sub(/[[:space:]]+"[^"]*"$/, "", target)
        print target
        line=substr(line,RSTART+RLENGTH)
      }
    }
  ' "$file")
done < <(find . -type d -name .git -prune -o -type f -name '*.md' -print0)
printf 'structure validation: ok\n'
