#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Herdr config rendering is part of the safe apply path."
exec "$ROOT/bin/hanchou" apply "${1:-work}" --yes
