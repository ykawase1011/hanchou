#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/hanchou-herdrm.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

OPERATOR_HOME="$TMP/operator"
MOCK_USER_INFO="$TMP/mock-user-info.cjs"
mkdir -p "$OPERATOR_HOME"
printf '%s\n' \
  'const os = require("node:os");' \
  'const original = os.userInfo;' \
  'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  > "$MOCK_USER_INFO"

HANCHOU_TEST_OPERATOR_HOME="$OPERATOR_HOME" NODE_OPTIONS="--require=$MOCK_USER_INFO" \
  node --experimental-strip-types "$ROOT/tests/test-herdrm.ts"
