#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-work}"
if [[ "${2:-}" == "--apply" ]]; then
  exec "$ROOT/bin/hanchou" bootstrap "$PROFILE"
fi
exec "$ROOT/bin/hanchou" plan "$PROFILE"
