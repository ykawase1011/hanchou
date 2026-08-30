#!/usr/bin/env bash
set -euo pipefail

TOOL_NAME="$(basename "$0")"
if [[ "$TOOL_NAME" == "mise" || "$TOOL_NAME" == "bd" || "$TOOL_NAME" == "herdr" ]]; then
    exec node --experimental-strip-types \
        "${HANCHOU_TEST_ROOT:?}/tests/execution-helper.ts" fake-tool "$TOOL_NAME" "$@"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT/tests/execution-helper.ts"
TMP="$(mktemp -d)"
TMP="$(cd "$TMP" && pwd -P)"
NETWORK_SERVER_PID=""
cleanup() {
    if [[ -n "$NETWORK_SERVER_PID" ]]; then
        kill "$NETWORK_SERVER_PID" 2>/dev/null || true
        wait "$NETWORK_SERVER_PID" 2>/dev/null || true
    fi
    rm -rf "$TMP"
}
trap cleanup EXIT

export HANCHOU_TEST_ROOT="$ROOT"
export FAKE_BD_STATE="$TMP/bd.json"
export FAKE_HERDR_STATE="$TMP/herdr.json"
export FAKE_BIN="$TMP/bin"
export HANCHOU_TEST_UNRELATED_VALUE="must-not-be-forwarded"
export HANCHOU_AGENT_ID=orchestrator
export HANCHOU_TEST_OPERATOR_HOME="$TMP/operator"
MOCK_USER_INFO="$TMP/mock-user-info.cjs"
REGISTRY_DIR="$HANCHOU_TEST_OPERATOR_HOME/.config/hanchou/work"
REGISTRY="$REGISTRY_DIR/projects.local.toml"
mkdir -p "$FAKE_BIN" "$TMP/home" "$TMP/repo" "$REGISTRY_DIR"
chmod 700 "$HANCHOU_TEST_OPERATOR_HOME/.config" \
    "$HANCHOU_TEST_OPERATOR_HOME/.config/hanchou" "$REGISTRY_DIR"

printf '%s\n' \
    'const os = require("node:os");' \
    'const original = os.userInfo;' \
    'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
    > "$MOCK_USER_INFO"

hanchou_test() {
    NODE_OPTIONS="--require=$MOCK_USER_INFO" node --experimental-strip-types \
        "$ROOT/libexec/hanchou.ts" "$@"
}

git -C "$TMP/repo" init -q -b main
git -C "$TMP/repo" config user.name "Hanchou Test"
git -C "$TMP/repo" config user.email "hanchou-test@example.invalid"
printf '# isolated execution fixture\n' > "$TMP/repo/README.md"
git -C "$TMP/repo" add README.md
git -C "$TMP/repo" commit -qm "Initial fixture"

printf '%s\n' \
    'schema_version = 1' \
    'default_policy = "deny"' \
    '' \
    '[[projects]]' \
    'id = "execution-fixture"' \
    "path = \"$TMP/repo\"" \
    'allowed_profiles = ["work"]' \
    > "$REGISTRY"
chmod 600 "$REGISTRY"

node --experimental-strip-types "$HELPER" initialize \
    "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$TMP/repo"

cp "$ROOT/tests/test-execution.sh" "$FAKE_BIN/fake-tool"
chmod +x "$FAKE_BIN/fake-tool"
ln -s fake-tool "$FAKE_BIN/mise"
ln -s fake-tool "$FAKE_BIN/bd"
ln -s fake-tool "$FAKE_BIN/herdr"
mkdir -p "$HANCHOU_TEST_OPERATOR_HOME/.local/share/mise/installs/herdr/0.8.2"
cp "$FAKE_BIN/fake-tool" \
    "$HANCHOU_TEST_OPERATOR_HOME/.local/share/mise/installs/herdr/0.8.2/herdr"

export HOME="$TMP/home"
export PATH="$FAKE_BIN:$PATH"

if hanchou_test --profile work execution dispatch hch-blocked --json >"$TMP/blocked.out" 2>"$TMP/blocked.err"; then
    echo "expected dependency-blocked dispatch rejection" >&2
    exit 1
fi
grep -q 'has active blockers: hch-prereq' "$TMP/blocked.err"
hanchou_test --profile work execution inspect hch-blocked --json > "$TMP/inspect-blocked.json"
node --experimental-strip-types "$HELPER" assert-blocked "$TMP/inspect-blocked.json"

if hanchou_test --profile work execution dispatch hch-foreign --json >"$TMP/foreign.out" 2>"$TMP/foreign.err"; then
    echo "expected foreign execution ownership rejection" >&2
    exit 1
fi
grep -q 'already owned by execution exe_foreign' "$TMP/foreign.err"
hanchou_test --profile work execution inspect hch-foreign --json > "$TMP/inspect-foreign.json"
node --experimental-strip-types "$HELPER" assert-foreign \
    "$TMP/inspect-foreign.json" "$FAKE_HERDR_STATE"

if hanchou_test --profile work execution dispatch hch-unauthorized --json >"$TMP/unauthorized.out" 2>"$TMP/unauthorized.err"; then
    echo "expected unauthorized project dispatch rejection" >&2
    exit 1
fi
grep -q 'registered as project "execution-fixture"' "$TMP/unauthorized.err"
hanchou_test --profile work execution inspect hch-unauthorized --json > "$TMP/inspect-unauthorized.json"
node --experimental-strip-types "$HELPER" assert-unauthorized \
    "$TMP/inspect-unauthorized.json" "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$TMP/repo"

SUCCESS="$(hanchou_test --profile work execution dispatch hch-ok --json)"
printf '%s' "$SUCCESS" | node --experimental-strip-types "$HELPER" assert-dispatch-success

hanchou_test --profile work execution inspect hch-ok --json > "$TMP/inspect-ok.json"
node --experimental-strip-types "$HELPER" assert-inspect-ok \
    "$TMP/inspect-ok.json" "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$TMP/repo" "$HANCHOU_TEST_OPERATOR_HOME"

AWAITING="$(FAKE_HERDR_BLOCK_START=1 hanchou_test --profile work execution dispatch hch-trust --json)"
AWAITING_AGENT="$(printf '%s' "$AWAITING" | node --experimental-strip-types "$HELPER" assert-awaiting)"
node --experimental-strip-types "$HELPER" ready-trust \
    "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$AWAITING_AGENT"
hanchou_test --profile work execution reconcile hch-trust --json > "$TMP/reconcile-trust.json"
hanchou_test --profile work execution reconcile hch-trust --json > "$TMP/reconcile-trust-again.json"
node --experimental-strip-types "$HELPER" assert-reconcile-trust \
    "$TMP/reconcile-trust.json" "$TMP/reconcile-trust-again.json" \
    "$FAKE_HERDR_STATE" "$FAKE_BD_STATE"

hanchou_test --profile work execution inspect hch-trust --json > "$TMP/inspect-trust.json"
node --experimental-strip-types "$HELPER" assert-inspect-trust "$TMP/inspect-trust.json"

AWAITING_REVOKED="$(FAKE_HERDR_BLOCK_START=1 hanchou_test --profile work execution dispatch hch-revoked --json)"
AWAITING_REVOKED_AGENT="$(printf '%s' "$AWAITING_REVOKED" | node --experimental-strip-types "$HELPER" assert-awaiting)"
node --experimental-strip-types "$HELPER" ready-agent \
    "$FAKE_HERDR_STATE" "$AWAITING_REVOKED_AGENT"
mv "$REGISTRY" "$REGISTRY.revoked"
hanchou_test --profile work execution reconcile hch-revoked --json > "$TMP/reconcile-revoked.json"
mv "$REGISTRY.revoked" "$REGISTRY"
hanchou_test --profile work execution inspect hch-revoked --json > "$TMP/inspect-revoked.json"
node --experimental-strip-types "$HELPER" assert-reconcile-revoked \
    "$TMP/reconcile-revoked.json" "$TMP/inspect-revoked.json" \
    "$FAKE_BD_STATE" "$FAKE_HERDR_STATE"

AWAITING_FAIL="$(FAKE_HERDR_BLOCK_START=1 hanchou_test --profile work execution dispatch hch-trust-fail --json)"
AWAITING_FAIL_AGENT="$(printf '%s' "$AWAITING_FAIL" | node --experimental-strip-types "$HELPER" stdin-field agent_name)"
node --experimental-strip-types "$HELPER" ready-trust-fail \
    "$FAKE_BD_STATE" "$FAKE_HERDR_STATE" "$AWAITING_FAIL_AGENT"
FAKE_HERDR_FAIL_PROMPT=1 hanchou_test --profile work execution reconcile hch-trust-fail --json > "$TMP/reconcile-trust-fail.json"
node --experimental-strip-types "$HELPER" assert-reconcile-trust-fail \
    "$TMP/reconcile-trust-fail.json" "$FAKE_BD_STATE"
hanchou_test --profile work execution inspect hch-trust-fail --json > "$TMP/inspect-trust-fail.json"
node --experimental-strip-types "$HELPER" assert-inspect-trust-fail \
    "$TMP/inspect-trust-fail.json"

hanchou_test --profile work execution dispatch hch-conflict --json > "$TMP/dispatch-conflict.json"
node --experimental-strip-types "$HELPER" mutate-conflict "$FAKE_BD_STATE"
hanchou_test --profile work execution reconcile hch-conflict --json > "$TMP/reconcile-conflict.json"
node --experimental-strip-types "$HELPER" assert-reconcile-conflict \
    "$TMP/reconcile-conflict.json" "$FAKE_BD_STATE"

SUCCESS_EXECUTION_ID="$(printf '%s' "$SUCCESS" | node --experimental-strip-types "$HELPER" stdin-field execution_id)"
SUCCESS_AGENT="$(printf '%s' "$SUCCESS" | node --experimental-strip-types "$HELPER" stdin-field agent_name)"
SUCCESS_WORKTREE="$(printf '%s' "$SUCCESS" | node --experimental-strip-types "$HELPER" stdin-field worktree_path)"
SUCCESS_REPORT="$(node --experimental-strip-types "$HELPER" file-field "$TMP/inspect-ok.json" execution.report_path)"
printf 'execution-bound artifact\n' > "$SUCCESS_WORKTREE/result.txt"
git -C "$SUCCESS_WORKTREE" add result.txt
git -C "$SUCCESS_WORKTREE" commit -qm "Add execution-bound artifact"
SUCCESS_COMMIT="$(git -C "$SUCCESS_WORKTREE" rev-parse HEAD)"
mkdir -p "$(dirname "$SUCCESS_REPORT")"
printf '# Execution report\n\nVerification passed.\n' > "$SUCCESS_REPORT"

UNRELATED_EVENT="$(HANCHOU_AGENT_ID="$SUCCESS_AGENT" hanchou_test --profile work relay emit \
    --type completed --task hch-ok \
    --execution exe_unrelated \
    --from-agent "$SUCCESS_AGENT" \
    --from-role implementer --to-agent orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary unrelated --detail-ref "$SUCCESS_REPORT" \
    --artifact "commit:$SUCCESS_COMMIT" --verification tests-pass --no-nudge --json)"
UNRELATED_EVENT_ID="$(printf '%s' "$UNRELATED_EVENT" | node --experimental-strip-types "$HELPER" stdin-field event_id)"
hanchou_test --profile work inbox claim --to orchestrator --json >/dev/null
hanchou_test --profile work inbox ack "$UNRELATED_EVENT_ID" --by orchestrator --json >/dev/null
WRONG_ROUTE_EVENT="$(HANCHOU_AGENT_ID="$SUCCESS_AGENT" hanchou_test --profile work relay emit \
    --type completed --task hch-ok \
    --execution "$SUCCESS_EXECUTION_ID" \
    --from-agent "$SUCCESS_AGENT" \
    --from-role implementer --to-agent other-orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary wrong-route --detail-ref "$SUCCESS_REPORT" \
    --artifact "commit:$SUCCESS_COMMIT" --verification tests-pass --no-nudge --json)"
WRONG_ROUTE_EVENT_ID="$(printf '%s' "$WRONG_ROUTE_EVENT" | node --experimental-strip-types "$HELPER" stdin-field event_id)"
HANCHOU_AGENT_ID=other-orchestrator hanchou_test --profile work inbox claim --to other-orchestrator --json >/dev/null
HANCHOU_AGENT_ID=other-orchestrator hanchou_test --profile work inbox ack "$WRONG_ROUTE_EVENT_ID" --by other-orchestrator --json >/dev/null
STALE_DELIVERY="$(hanchou_test --profile work delivery create \
    --kind task_terminal --task hch-ok --source-event "$UNRELATED_EVENT_ID" \
    --policy on_terminal --renderer orchestrator \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary stale --json)"
STALE_DELIVERY_ID="$(printf '%s' "$STALE_DELIVERY" | node --experimental-strip-types "$HELPER" stdin-field delivery_id)"
hanchou_test --profile work delivery mark-delivered "$STALE_DELIVERY_ID" --adapter local-session >/dev/null
bd --actor orchestrator update hch-ok --status closed --json >/dev/null
hanchou_test --profile work execution reconcile hch-ok --json > "$TMP/reconcile-unrelated.json"
node --experimental-strip-types "$HELPER" assert-reconcile-unrelated \
    "$TMP/reconcile-unrelated.json"

EVENT="$(HANCHOU_AGENT_ID="$SUCCESS_AGENT" hanchou_test --profile work relay emit \
    --type completed --task hch-ok \
    --execution "$SUCCESS_EXECUTION_ID" \
    --from-agent "$SUCCESS_AGENT" \
    --from-role implementer --to-agent orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary complete --detail-ref "$SUCCESS_REPORT" \
    --artifact "commit:$SUCCESS_COMMIT" --verification tests-pass --no-nudge --json)"
EVENT_ID="$(printf '%s' "$EVENT" | node --experimental-strip-types "$HELPER" stdin-field event_id)"
hanchou_test --profile work execution reconcile hch-ok --json > "$TMP/reconcile-unacknowledged.json"
node --experimental-strip-types "$HELPER" assert-reconcile-unacknowledged \
    "$TMP/reconcile-unacknowledged.json"
hanchou_test --profile work inbox claim --to orchestrator --json >/dev/null
hanchou_test --profile work inbox ack "$EVENT_ID" --by orchestrator --json >/dev/null
hanchou_test --profile work execution reconcile hch-ok --json > "$TMP/reconcile-before-delivery.json"
node --experimental-strip-types "$HELPER" assert-reconcile-before-delivery \
    "$TMP/reconcile-before-delivery.json"
DELIVERY="$(hanchou_test --profile work delivery create \
    --kind task_terminal --task hch-ok --source-event "$EVENT_ID" \
    --policy on_terminal --renderer orchestrator \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary complete --json)"
DELIVERY_ID="$(printf '%s' "$DELIVERY" | node --experimental-strip-types "$HELPER" stdin-field delivery_id)"
hanchou_test --profile work delivery mark-delivered "$DELIVERY_ID" --adapter local-session >/dev/null
hanchou_test --profile work execution reconcile hch-ok --json > "$TMP/reconcile-ok.json"
node --experimental-strip-types "$HELPER" assert-reconcile-ok \
    "$TMP/reconcile-ok.json" "$FAKE_BD_STATE"

DELIVERY_BAD="$(hanchou_test --profile work execution dispatch hch-delivery-bad --json)"
DELIVERY_BAD_EXECUTION_ID="$(printf '%s' "$DELIVERY_BAD" | node --experimental-strip-types "$HELPER" stdin-field execution_id)"
DELIVERY_BAD_AGENT="$(printf '%s' "$DELIVERY_BAD" | node --experimental-strip-types "$HELPER" stdin-field agent_name)"
DELIVERY_BAD_WORKTREE="$(printf '%s' "$DELIVERY_BAD" | node --experimental-strip-types "$HELPER" stdin-field worktree_path)"
hanchou_test --profile work execution inspect hch-delivery-bad --json > "$TMP/inspect-delivery-bad.json"
DELIVERY_BAD_REPORT="$(node --experimental-strip-types "$HELPER" file-field "$TMP/inspect-delivery-bad.json" execution.report_path)"
printf 'delivery contract artifact\n' > "$DELIVERY_BAD_WORKTREE/result.txt"
git -C "$DELIVERY_BAD_WORKTREE" add result.txt
git -C "$DELIVERY_BAD_WORKTREE" commit -qm "Add Delivery contract artifact"
DELIVERY_BAD_COMMIT="$(git -C "$DELIVERY_BAD_WORKTREE" rev-parse HEAD)"
mkdir -p "$(dirname "$DELIVERY_BAD_REPORT")"
printf '# Delivery contract report\n' > "$DELIVERY_BAD_REPORT"
DELIVERY_BAD_EVENT="$(HANCHOU_AGENT_ID="$DELIVERY_BAD_AGENT" hanchou_test --profile work relay emit \
    --type completed --task hch-delivery-bad \
    --execution "$DELIVERY_BAD_EXECUTION_ID" \
    --from-agent "$DELIVERY_BAD_AGENT" --from-role implementer \
    --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
    --summary complete --detail-ref "$DELIVERY_BAD_REPORT" \
    --artifact "commit:$DELIVERY_BAD_COMMIT" --verification tests-pass --no-nudge --json)"
DELIVERY_BAD_EVENT_ID="$(printf '%s' "$DELIVERY_BAD_EVENT" | node --experimental-strip-types "$HELPER" stdin-field event_id)"
hanchou_test --profile work inbox claim --to orchestrator --json >/dev/null
hanchou_test --profile work inbox ack "$DELIVERY_BAD_EVENT_ID" --by orchestrator --json >/dev/null
bd --actor orchestrator update hch-delivery-bad --status closed --json >/dev/null
BAD_CONTRACT_DELIVERY="$(hanchou_test --profile work delivery create \
    --kind manual --task hch-delivery-bad --source-event "$DELIVERY_BAD_EVENT_ID" \
    --policy on_terminal --renderer editor \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary wrong-contract --json)"
BAD_CONTRACT_DELIVERY_ID="$(printf '%s' "$BAD_CONTRACT_DELIVERY" | node --experimental-strip-types "$HELPER" stdin-field delivery_id)"
hanchou_test --profile work delivery mark-delivered "$BAD_CONTRACT_DELIVERY_ID" --adapter local-session >/dev/null
hanchou_test --profile work execution reconcile hch-delivery-bad --json > "$TMP/reconcile-delivery-contract.json"
node --experimental-strip-types "$HELPER" assert-reconcile-delivery-contract \
    "$TMP/reconcile-delivery-contract.json"
GOOD_DUPLICATE_DELIVERY="$(hanchou_test --profile work delivery create \
    --kind task_terminal --task hch-delivery-bad --source-event "$DELIVERY_BAD_EVENT_ID" \
    --policy on_terminal --renderer orchestrator \
    --destination '{"type":"local_session","agent":"orchestrator"}' \
    --summary duplicate --json)"
GOOD_DUPLICATE_DELIVERY_ID="$(printf '%s' "$GOOD_DUPLICATE_DELIVERY" | node --experimental-strip-types "$HELPER" stdin-field delivery_id)"
hanchou_test --profile work delivery mark-delivered "$GOOD_DUPLICATE_DELIVERY_ID" --adapter local-session >/dev/null
hanchou_test --profile work execution reconcile hch-delivery-bad --json > "$TMP/reconcile-delivery-duplicate.json"
node --experimental-strip-types "$HELPER" assert-reconcile-delivery-duplicate \
    "$TMP/reconcile-delivery-duplicate.json"

EVIDENCE="$(hanchou_test --profile work execution dispatch hch-evidence --json)"
EVIDENCE_EXECUTION_ID="$(printf '%s' "$EVIDENCE" | node --experimental-strip-types "$HELPER" stdin-field execution_id)"
EVIDENCE_AGENT="$(printf '%s' "$EVIDENCE" | node --experimental-strip-types "$HELPER" stdin-field agent_name)"
EVIDENCE_WORKTREE="$(printf '%s' "$EVIDENCE" | node --experimental-strip-types "$HELPER" stdin-field worktree_path)"
printf 'unreported artifact\n' > "$EVIDENCE_WORKTREE/result.txt"
git -C "$EVIDENCE_WORKTREE" add result.txt
git -C "$EVIDENCE_WORKTREE" commit -qm "Add unreported artifact"
EVIDENCE_STALE_COMMIT="$(git -C "$EVIDENCE_WORKTREE" rev-parse HEAD^)"
INVALID_EVENT="$(HANCHOU_AGENT_ID="$EVIDENCE_AGENT" hanchou_test --profile work relay emit \
    --type completed --task hch-evidence \
    --execution "$EVIDENCE_EXECUTION_ID" \
    --from-agent "$EVIDENCE_AGENT" \
    --from-role implementer --to-agent orchestrator --to-role orchestrator \
    --delegation-depth 1 --summary invalid-evidence \
    --detail-ref "$TMP/wrong-report.md" --artifact "commit:$EVIDENCE_STALE_COMMIT" \
    --no-nudge --json)"
INVALID_EVENT_ID="$(printf '%s' "$INVALID_EVENT" | node --experimental-strip-types "$HELPER" stdin-field event_id)"
hanchou_test --profile work inbox claim --to orchestrator --json >/dev/null
hanchou_test --profile work inbox ack "$INVALID_EVENT_ID" --by orchestrator --json >/dev/null
bd --actor orchestrator update hch-evidence --status closed --json >/dev/null
hanchou_test --profile work execution reconcile hch-evidence --json > "$TMP/reconcile-evidence.json"
node --experimental-strip-types "$HELPER" assert-reconcile-evidence \
    "$TMP/reconcile-evidence.json"

hanchou_test --profile work usage set codex --weekly-remaining 5 --source manual --json >/dev/null
hanchou_test --profile work usage set claude --weekly-remaining 90 --source manual --json >/dev/null
hanchou_test --profile work execution dispatch hch-claude --json > "$TMP/dispatch-claude.json"
hanchou_test --profile work execution inspect hch-claude --json > "$TMP/inspect-claude.json"
node --experimental-strip-types "$HELPER" assert-inspect-claude \
    "$TMP/inspect-claude.json" "$FAKE_HERDR_STATE"

hanchou_test --profile work execution dispatch hch-reviewer --json >/dev/null
hanchou_test --profile work execution dispatch hch-researcher --json >/dev/null
hanchou_test --profile work execution inspect hch-reviewer --json > "$TMP/inspect-reviewer.json"
hanchou_test --profile work execution inspect hch-researcher --json > "$TMP/inspect-researcher.json"
node --experimental-strip-types "$HELPER" assert-inspect-readonly \
    "$TMP/inspect-reviewer.json" "$TMP/inspect-researcher.json" "$FAKE_HERDR_STATE"

node --experimental-strip-types "$HELPER" assert-writer-disabled \
    "$HANCHOU_TEST_OPERATOR_HOME/.local/share/hanchou/work/reports/disabled/report.md"

if FAKE_HERDR_FAIL_PROMPT=1 hanchou_test --profile work execution dispatch hch-secret --json >"$TMP/secret.out" 2>"$TMP/secret.err"; then
    echo "expected failed worker prompt" >&2
    exit 1
fi
if grep -q 'SENTINEL-HANCHOU-PROMPT-SECRET-4c221d' "$TMP/secret.err"; then
    echo "worker prompt leaked through dispatch stderr" >&2
    exit 1
fi
grep -q '<redacted-prompt>' "$TMP/secret.err"
grep -q '<command output redacted>' "$TMP/secret.err"
hanchou_test --profile work execution inspect hch-secret --json > "$TMP/inspect-secret.json"
node --experimental-strip-types "$HELPER" assert-inspect-secret \
    "$TMP/inspect-secret.json"

if FAKE_HERDR_FAIL_START=1 hanchou_test --profile work execution dispatch hch-fail --json >"$TMP/fail.out" 2>"$TMP/fail.err"; then
    echo "expected failed agent start" >&2
    exit 1
fi
grep -q 'execution dispatch failed after workspace_created' "$TMP/fail.err"

hanchou_test --profile work execution inspect hch-fail --json > "$TMP/inspect-fail.json"
hanchou_test --profile work execution reconcile hch-fail --json > "$TMP/reconcile-fail.json"
node --experimental-strip-types "$HELPER" assert-failure \
    "$TMP/inspect-fail.json" "$TMP/reconcile-fail.json" "$FAKE_BD_STATE"

hanchou_test --profile work start-orchestrator > "$TMP/start-orchestrator.out"
grep -q 'started codex orchestrator `orchestrator`' "$TMP/start-orchestrator.out"
node --experimental-strip-types "$HELPER" assert-orchestrator-env \
    "$FAKE_HERDR_STATE" "$HANCHOU_TEST_OPERATOR_HOME"

if command -v codex >/dev/null 2>&1; then
    NETWORK_SOCKET="$TMP/herdr.sock"
    NEIGHBOR_SOCKET="$TMP/neighbor.sock"
    NETWORK_PORT_FILE="$TMP/network-port"
    node -e '
const http = require("node:http");
const fs = require("node:fs");
const [firstSocket, secondSocket, portFile] = process.argv.slice(1);
for (const socket of [firstSocket, secondSocket]) {
  http.createServer((_request, response) => response.end("ok\n")).listen(socket);
}
const tcp = http.createServer((_request, response) => response.end("ok\n"));
tcp.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(tcp.address().port)));
setInterval(() => {}, 1000);
' "$NETWORK_SOCKET" "$NEIGHBOR_SOCKET" "$NETWORK_PORT_FILE" &
    NETWORK_SERVER_PID=$!
    for _attempt in {1..100}; do
        [[ -S "$NETWORK_SOCKET" && -S "$NEIGHBOR_SOCKET" && -s "$NETWORK_PORT_FILE" ]] && break
        sleep 0.05
    done
    [[ -S "$NETWORK_SOCKET" && -S "$NEIGHBOR_SOCKET" && -s "$NETWORK_PORT_FILE" ]]
    NETWORK_PORT="$(<"$NETWORK_PORT_FILE")"
    CURL_BIN="$(command -v curl)"
    UNIX_SOCKET_RULE="features.network_proxy.unix_sockets={\"$NETWORK_SOCKET\"=\"allow\"}"
    INHERITED_UNSAFE_NETWORK_ARGS=(
        -c 'features.network_proxy.domains={"example.invalid"="allow"}'
        -c features.network_proxy.allow_local_binding=true
        -c features.network_proxy.dangerously_allow_all_unix_sockets=true
        -c features.network_proxy.dangerously_allow_non_loopback_proxy=true
        -c "features.network_proxy.unix_sockets={\"$NEIGHBOR_SOCKET\"=\"allow\"}"
    )
    CODEX_NETWORK_ARGS=(
        -c 'sandbox_mode="workspace-write"'
        -c sandbox_workspace_write.network_access=true
        -c features.network_proxy.enabled=true
        -c features.network_proxy.allow_local_binding=false
        -c features.network_proxy.allow_upstream_proxy=false
        -c features.network_proxy.dangerously_allow_all_unix_sockets=false
        -c features.network_proxy.dangerously_allow_non_loopback_proxy=false
        -c features.network_proxy.enable_socks5=false
        -c features.network_proxy.enable_socks5_udp=false
        -c "$UNIX_SOCKET_RULE"
    )
    codex sandbox "${INHERITED_UNSAFE_NETWORK_ARGS[@]}" "${CODEX_NETWORK_ARGS[@]}" \
        -c features.network_proxy.domains={} \
        "$CURL_BIN" -fsS --unix-socket "$NETWORK_SOCKET" http://localhost/ \
        | grep -qx ok
    if codex sandbox "${INHERITED_UNSAFE_NETWORK_ARGS[@]}" "${CODEX_NETWORK_ARGS[@]}" \
        -c features.network_proxy.domains={} \
        "$CURL_BIN" -fsS --unix-socket "$NEIGHBOR_SOCKET" http://localhost/ \
        >"$TMP/network-neighbor.out" 2>"$TMP/network-neighbor.err"; then
        echo "managed Codex network policy allowed an unlisted Unix socket" >&2
        exit 1
    fi
    if codex sandbox "${INHERITED_UNSAFE_NETWORK_ARGS[@]}" "${CODEX_NETWORK_ARGS[@]}" \
        -c features.network_proxy.domains={} \
        "$CURL_BIN" -fsS --max-time 5 "http://127.0.0.1:$NETWORK_PORT/" \
        >"$TMP/network-local.out" 2>"$TMP/network-local.err"; then
        echo "managed Codex network policy allowed an unlisted local TCP endpoint" >&2
        exit 1
    fi
    grep -q '403' "$TMP/network-local.err"
    if codex sandbox "${INHERITED_UNSAFE_NETWORK_ARGS[@]}" "${CODEX_NETWORK_ARGS[@]}" \
        -c features.network_proxy.domains={} \
        "$CURL_BIN" -fsS --max-time 5 https://example.invalid/ \
        >"$TMP/network-domain.out" 2>"$TMP/network-domain.err"; then
        echo "managed Codex network policy allowed an external domain" >&2
        exit 1
    fi
    grep -q '403' "$TMP/network-domain.err"
fi

echo "execution bridge fake E2E ok"
