#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
TMP="$(cd "$TMP" && pwd -P)"
MOCK_USER_INFO="$TMP/mock-user-info.cjs"
printf '%s\n' \
  'const os = require("node:os");' \
  'const original = os.userInfo;' \
  'os.userInfo = () => ({ ...original(), homedir: process.env.HANCHOU_TEST_OPERATOR_HOME });' \
  > "$MOCK_USER_INFO"
export HANCHOU_TEST_OPERATOR_HOME="$TMP"
HANCHOU_TEST=(node --require="$MOCK_USER_INFO" --experimental-strip-types "$ROOT/libexec/hanchou.ts")
export HANCHOU_AGENT_ID=orchestrator
daemon_pid=""
cleanup() {
  if [[ -n "$daemon_pid" ]] && kill -0 "$daemon_pid" 2>/dev/null; then
    kill -TERM "$daemon_pid" 2>/dev/null || true
    wait "$daemon_pid" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

LOCK_DIR="$TMP/.local/share/hanchou/work/relay/locks"
mkdir -p "$LOCK_DIR"
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({pid: 999999, token: "dead"}) + "\n")' \
  "$LOCK_DIR/journal.lock.held"

if HOME="$TMP" env -u HANCHOU_AGENT_ID "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent unmanaged-worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary unmanaged --no-nudge --json >"$TMP/unmanaged-emit.out" 2>"$TMP/unmanaged-emit.err"; then
  echo "expected unmanaged Relay sender rejection" >&2
  exit 1
fi
grep -q 'requires HANCHOU_AGENT_ID from a Hanchou-managed Agent' "$TMP/unmanaged-emit.err"

if HOME="$TMP" HANCHOU_AGENT_ID=managed-worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent forged-worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary forged --no-nudge --json >"$TMP/forged-emit.out" 2>"$TMP/forged-emit.err"; then
  echo "expected forged Relay sender rejection" >&2
  exit 1
fi
grep -q 'does not match managed Agent identity managed-worker' "$TMP/forged-emit.err"

OUT="$(HOME="$TMP" HANCHOU_AGENT_ID=hch-test-implementer "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type completed \
  --task hch-test \
  --execution exe-test \
  --from-agent hch-test-implementer \
  --from-role implementer \
  --to-agent orchestrator \
  --to-role orchestrator \
  --delegation-depth 1 \
  --summary done \
  --artifact commit:abc \
  --verification tests-pass \
  --no-nudge --json)"
EVENT_ID="$(printf '%s' "$OUT" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
test ! -e "$LOCK_DIR/journal.lock.held"
test -e "$LOCK_DIR/journal.lock"

if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$EVENT_ID" --by orchestrator --json >"$TMP/pending-ack.out" 2>"$TMP/pending-ack.err"; then
  echo "expected unclaimed acknowledgement rejection" >&2
  exit 1
fi
grep -q 'must be claimed before acknowledgement' "$TMP/pending-ack.err"

if HOME="$TMP" env -u HANCHOU_AGENT_ID "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >"$TMP/unmanaged-claim.out" 2>"$TMP/unmanaged-claim.err"; then
  echo "expected unmanaged Inbox claim rejection" >&2
  exit 1
fi
grep -q 'requires HANCHOU_AGENT_ID from a Hanchou-managed Agent' "$TMP/unmanaged-claim.err"

if HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >"$TMP/wrong-claim.out" 2>"$TMP/wrong-claim.err"; then
  echo "expected managed Agent claim rejection" >&2
  exit 1
fi
grep -q 'does not match managed Agent identity worker' "$TMP/wrong-claim.err"

CLAIM="$(HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json)"
printf '%s' "$CLAIM" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { const rows=JSON.parse(text); if (rows.length !== 1 || rows[0].event_id !== process.argv[1]) process.exit(1); })' "$EVENT_ID"

if HOME="$TMP" HANCHOU_AGENT_ID=orchestrator "${HANCHOU_TEST[@]}" --profile work inbox ack "$EVENT_ID" --by another-agent --json >"$TMP/wrong-ack.out" 2>"$TMP/wrong-ack.err"; then
  echo "expected managed Agent acknowledgement rejection" >&2
  exit 1
fi
grep -q 'does not match managed Agent identity orchestrator' "$TMP/wrong-ack.err"

HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$EVENT_ID" --by orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox show "$EVENT_ID" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { const row=JSON.parse(text); if (row.state !== "acknowledged" || row.event.execution_id !== "exe-test") process.exit(1); })'

SENTINEL="$TMP/outside.json"
printf '{"sentinel":"unchanged"}\n' > "$SENTINEL"
SENTINEL_HASH="$(shasum -a 256 "$SENTINEL" | awk '{print $1}')"
ESCAPE_ID='../../../../../../outside'
if HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --event-id "$ESCAPE_ID" --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary escape --no-nudge --json >"$TMP/escape-emit.out" 2>"$TMP/escape-emit.err"; then
  echo "expected traversal event ID rejection" >&2
  exit 1
fi
grep -q 'invalid event ID' "$TMP/escape-emit.err"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox show "$ESCAPE_ID" >"$TMP/escape-show.out" 2>"$TMP/escape-show.err"; then
  echo "expected traversal Inbox lookup rejection" >&2
  exit 1
fi
grep -q 'invalid event ID' "$TMP/escape-show.err"
test "$(shasum -a 256 "$SENTINEL" | awk '{print $1}')" = "$SENTINEL_HASH"

RELAY_ROOT="$TMP/.local/share/hanchou/work/relay"
ln -s "$SENTINEL" "$RELAY_ROOT/inbox/pending/evt_symlink.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox list --json >"$TMP/symlink-list.out" 2>"$TMP/symlink-list.err"; then
  echo "expected symlink Inbox record rejection" >&2
  exit 1
fi
grep -q 'regular non-symlink file' "$TMP/symlink-list.err"
rm "$RELAY_ROOT/inbox/pending/evt_symlink.json"

mv "$RELAY_ROOT/inbox/pending" "$RELAY_ROOT/inbox/pending-real"
mkdir "$TMP/outside-inbox"
ln -s "$TMP/outside-inbox" "$RELAY_ROOT/inbox/pending"
if HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary directory-symlink --no-nudge --json >"$TMP/directory-symlink.out" 2>"$TMP/directory-symlink.err"; then
  echo "expected symlink Inbox directory rejection" >&2
  exit 1
fi
grep -q 'path component must be a regular non-symlink directory' "$TMP/directory-symlink.err"
test -z "$(find "$TMP/outside-inbox" -mindepth 1 -maxdepth 1 -print -quit)"
rm "$RELAY_ROOT/inbox/pending"
mv "$RELAY_ROOT/inbox/pending-real" "$RELAY_ROOT/inbox/pending"

printf '{\n' > "$RELAY_ROOT/inbox/pending/evt_malformed.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox list --json >"$TMP/malformed-list.out" 2>"$TMP/malformed-list.err"; then
  echo "expected malformed Inbox record rejection" >&2
  exit 1
fi
grep -q 'cannot read JSON record' "$TMP/malformed-list.err"
rm "$RELAY_ROOT/inbox/pending/evt_malformed.json"

RECOVERABLE="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary receipt-recovery --no-nudge --json)"
RECOVERABLE_ID="$(printf '%s' "$RECOVERABLE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
RECOVERABLE_RECEIPT="$RELAY_ROOT/receipts/inbox-$RECOVERABLE_ID.json"
mkdir "$RECOVERABLE_RECEIPT"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >"$TMP/receipt-blocked.out" 2>"$TMP/receipt-blocked.err"; then
  echo "expected blocked Inbox receipt write" >&2
  exit 1
fi
test -e "$RELAY_ROOT/inbox/acknowledged/$RECOVERABLE_ID.json"
rmdir "$RECOVERABLE_RECEIPT"
if HOME="$TMP" HANCHOU_AGENT_ID=another-agent "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by another-agent --json >"$TMP/replay-wrong-actor.out" 2>"$TMP/replay-wrong-actor.err"; then
  echo "expected wrong-actor acknowledgement replay rejection" >&2
  exit 1
fi
grep -q 'was not acknowledged by another-agent' "$TMP/replay-wrong-actor.err"
test ! -e "$RECOVERABLE_RECEIPT"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="acknowledged"&&row.event_id===process.argv[2]).length; if(count!==0) throw new Error(`unauthorized replay wrote ${count} journal entries`)' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.ack.schema="attacker.schema"; row.ack.event_id="evt_forged"; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/acknowledged/$RECOVERABLE_ID.json"
mv "$RELAY_ROOT/journal.jsonl" "$RELAY_ROOT/journal.real.jsonl"
ln -s "$SENTINEL" "$RELAY_ROOT/journal.jsonl"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >"$TMP/journal-blocked.out" 2>"$TMP/journal-blocked.err"; then
  echo "expected unsafe Relay journal rejection" >&2
  exit 1
fi
test -f "$RECOVERABLE_RECEIPT"
rm "$RELAY_ROOT/journal.jsonl"
mv "$RELAY_ROOT/journal.real.jsonl" "$RELAY_ROOT/journal.jsonl"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >/dev/null
RECOVERABLE_RECEIPT_HASH="$(shasum -a 256 "$RECOVERABLE_RECEIPT" | awk '{print $1}')"
RECOVERABLE_RECEIPT_STAT="$(node -e 'const s=require("fs").statSync(process.argv[1],{bigint:true}); process.stdout.write(`${s.ino}:${s.mtimeNs}`)' "$RECOVERABLE_RECEIPT")"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >/dev/null
test "$(shasum -a 256 "$RECOVERABLE_RECEIPT" | awk '{print $1}')" = "$RECOVERABLE_RECEIPT_HASH"
test "$(node -e 'const s=require("fs").statSync(process.argv[1],{bigint:true}); process.stdout.write(`${s.ino}:${s.mtimeNs}`)' "$RECOVERABLE_RECEIPT")" = "$RECOVERABLE_RECEIPT_STAT"
node -e 'const fs=require("fs"),assert=require("assert"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const receiptPath=process.argv[2]; const info=fs.lstatSync(receiptPath); assert.ok(info.isFile()&&!info.isSymbolicLink()); const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8")); assert.deepStrictEqual(receipt,{...event.ack,schema:"hanchou.relay-receipt.v1",event_id:event.event_id})' \
  "$RELAY_ROOT/inbox/acknowledged/$RECOVERABLE_ID.json" "$RECOVERABLE_RECEIPT"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="acknowledged"&&row.event_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one acknowledgement journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); rows.find(row=>row.action==="acknowledged"&&row.event_id===id).by="tampered"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >"$TMP/mismatched-journal.out" 2>"$TMP/mismatched-journal.err"; then
  echo "expected mismatched Inbox journal rejection" >&2
  exit 1
fi
grep -q 'Relay journal entry does not match terminal state' "$TMP/mismatched-journal.err"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="acknowledged"&&row.event_id===id); if(row.by!=="tampered") throw new Error("mismatched journal was overwritten"); row.by="orchestrator"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); rows.push({...rows.find(row=>row.action==="acknowledged"&&row.event_id===id)}); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >"$TMP/duplicate-journal.out" 2>"$TMP/duplicate-journal.err"; then
  echo "expected duplicate Inbox journal rejection" >&2
  exit 1
fi
grep -q 'Relay journal contains duplicate terminal entries' "$TMP/duplicate-journal.err"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); let kept=false; const cleaned=rows.filter(row=>{ if(row.action!=="acknowledged"||row.event_id!==id)return true; if(!kept){kept=true;return true} return false }); fs.writeFileSync(path,cleaned.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="acknowledged"&&row.event_id===id); delete row.schema; row.at="2026-01-01T00:00:00.000Z"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >"$TMP/stripped-journal-schema.out" 2>"$TMP/stripped-journal-schema.err"; then
  echo "expected stripped Inbox journal schema rejection" >&2
  exit 1
fi
grep -q 'Relay journal entry does not match terminal state' "$TMP/stripped-journal-schema.err"
node -e 'const fs=require("fs"); const journalPath=process.argv[1],eventPath=process.argv[2],id=process.argv[3]; const event=JSON.parse(fs.readFileSync(eventPath,"utf8")); const rows=fs.readFileSync(journalPath,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="acknowledged"&&row.event_id===id); row.schema="hanchou.relay-terminal-journal.v1"; row.at=event.ack.at; fs.writeFileSync(journalPath,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RELAY_ROOT/inbox/acknowledged/$RECOVERABLE_ID.json" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.by="tampered"; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' "$RECOVERABLE_RECEIPT"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RECOVERABLE_ID" --by orchestrator --json >"$TMP/mismatched-receipt.out" 2>"$TMP/mismatched-receipt.err"; then
  echo "expected mismatched Inbox receipt rejection" >&2
  exit 1
fi
grep -q 'Inbox receipt does not match terminal state' "$TMP/mismatched-receipt.err"

LEGACY="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary legacy-journal --no-nudge --json)"
LEGACY_ID="$(printf '%s' "$LEGACY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$LEGACY_ID" --by orchestrator --json >/dev/null
node -e 'const fs=require("fs"); for(const path of process.argv.slice(1,3)){const row=JSON.parse(fs.readFileSync(path,"utf8")); delete (row.ack??row).journal_schema; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")}' \
  "$RELAY_ROOT/inbox/acknowledged/$LEGACY_ID.json" "$RELAY_ROOT/receipts/inbox-$LEGACY_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="acknowledged"&&row.event_id===id); delete row.schema; row.at="2026-01-01T00:00:00.000Z"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$LEGACY_ID"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$LEGACY_ID" --by orchestrator --json >/dev/null

LEGACY_PENDING_RESIDUE="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary legacy-pending-dead-letter-residue --no-nudge --json)"
LEGACY_PENDING_RESIDUE_ID="$(printf '%s' "$LEGACY_PENDING_RESIDUE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.retry_count=1; row.dead_letter={at:"2026-01-01T00:00:00.000Z",reason:"v2.3.1 retry residue"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/pending/$LEGACY_PENDING_RESIDUE_ID.json"
node -e 'const fs=require("fs"); const row={at:"2026-01-02T00:00:00.000Z",action:"retried",event_id:process.argv[2],from_state:"dead-letter"}; fs.appendFileSync(process.argv[1],JSON.stringify(row)+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$LEGACY_PENDING_RESIDUE_ID"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.dead_letter) throw new Error("legacy pending dead-letter residue was not removed"); if(row.lease?.claimed_by!=="orchestrator") throw new Error("legacy pending residue event was not claimed")' \
  "$RELAY_ROOT/inbox/processing/$LEGACY_PENDING_RESIDUE_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$LEGACY_PENDING_RESIDUE_ID" --by orchestrator --json >/dev/null

LEGACY_PROCESSING_RESIDUE="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary legacy-processing-dead-letter-residue --no-nudge --json)"
LEGACY_PROCESSING_RESIDUE_ID="$(printf '%s' "$LEGACY_PROCESSING_RESIDUE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.retry_count=1; row.dead_letter={at:"2026-01-01T00:00:00.000Z",reason:"v2.3.1 retry residue"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$LEGACY_PROCESSING_RESIDUE_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$LEGACY_PROCESSING_RESIDUE_ID" --by orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.dead_letter||row.ack?.by!=="orchestrator") throw new Error("legacy processing dead-letter residue blocked acknowledgement")' \
  "$RELAY_ROOT/inbox/acknowledged/$LEGACY_PROCESSING_RESIDUE_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.dead_letter={at:"2026-01-01T00:00:00.000Z",reason:"v2.3.1 acknowledged residue"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/acknowledged/$LEGACY_PROCESSING_RESIDUE_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$LEGACY_PROCESSING_RESIDUE_ID" --by orchestrator --json | node -e 'let text=""; process.stdin.on("data", chunk=>text+=chunk).on("end",()=>{const row=JSON.parse(text); if(row.already!==true) process.exit(1)})'
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.dead_letter||row.ack?.by!=="orchestrator") throw new Error("legacy acknowledged dead-letter residue was not normalized")' \
  "$RELAY_ROOT/inbox/acknowledged/$LEGACY_PROCESSING_RESIDUE_ID.json"

LEGACY_DEAD_CYCLES="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary legacy-dead-letter-cycles --no-nudge --json)"
LEGACY_DEAD_CYCLES_ID="$(printf '%s' "$LEGACY_DEAD_CYCLES" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.retry_count=1; row.dead_letter={at:"2026-01-03T00:00:00.000Z",reason:"same reason"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/pending/$LEGACY_DEAD_CYCLES_ID.json"
mv "$RELAY_ROOT/inbox/pending/$LEGACY_DEAD_CYCLES_ID.json" "$RELAY_ROOT/inbox/dead-letter/$LEGACY_DEAD_CYCLES_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=[{at:"2026-01-01T00:00:00.000Z",action:"dead-lettered",event_id:id,reason:"same reason"},{at:"2026-01-03T00:00:00.001Z",action:"dead-lettered",event_id:id,reason:"same reason"}]; fs.appendFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$LEGACY_DEAD_CYCLES_ID"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox dead-letter "$LEGACY_DEAD_CYCLES_ID" --reason ignored | grep -q "already dead-lettered $LEGACY_DEAD_CYCLES_ID"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.dead_letter?.journal_schema!=="hanchou.relay-terminal-journal.v1"||row.dead_letter?.retry_count!==1||row.dead_letter?.reason!=="same reason") throw new Error("legacy dead-letter state was not migrated")' \
  "$RELAY_ROOT/inbox/dead-letter/$LEGACY_DEAD_CYCLES_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const canonical=rows.filter(row=>row.action==="dead-lettered"&&row.event_id===process.argv[2]&&row.schema==="hanchou.relay-terminal-journal.v1"&&row.retry_count===1); if(canonical.length!==1) throw new Error(`expected one migrated dead-letter journal entry, got ${canonical.length}`)' \
  "$RELAY_ROOT/journal.jsonl" "$LEGACY_DEAD_CYCLES_ID"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox retry "$LEGACY_DEAD_CYCLES_ID" >/dev/null
test -f "$RELAY_ROOT/inbox/pending/$LEGACY_DEAD_CYCLES_ID.json"

LEGACY_STAGED_PENDING="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary legacy-staged-dead-letter-pending --no-nudge --json)"
LEGACY_STAGED_PENDING_ID="$(printf '%s' "$LEGACY_STAGED_PENDING" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.dead_letter={at:new Date().toISOString(),reason:"legacy pending crash"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/pending/$LEGACY_STAGED_PENDING_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >"$TMP/legacy-staged-pending-claim.json"
node -e 'const fs=require("fs"); const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(rows.some(row=>row.event_id===process.argv[2])) throw new Error("legacy staged dead-letter was claimed")' \
  "$TMP/legacy-staged-pending-claim.json" "$LEGACY_STAGED_PENDING_ID"
test -f "$RELAY_ROOT/inbox/dead-letter/$LEGACY_STAGED_PENDING_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$LEGACY_STAGED_PENDING_ID.json"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.dead_letter?.journal_schema!=="hanchou.relay-terminal-journal.v1"||row.dead_letter?.reason!=="legacy pending crash") throw new Error("legacy pending staged intent was not preserved")' \
  "$RELAY_ROOT/inbox/dead-letter/$LEGACY_STAGED_PENDING_ID.json"

LEGACY_STAGED_PROCESSING="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary legacy-staged-dead-letter-processing --no-nudge --json)"
LEGACY_STAGED_PROCESSING_ID="$(printf '%s' "$LEGACY_STAGED_PROCESSING" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.lease; row.dead_letter={at:new Date().toISOString(),reason:"legacy processing crash"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$LEGACY_STAGED_PROCESSING_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 1 event(s)'
test -f "$RELAY_ROOT/inbox/dead-letter/$LEGACY_STAGED_PROCESSING_ID.json"
test ! -e "$RELAY_ROOT/inbox/processing/$LEGACY_STAGED_PROCESSING_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$LEGACY_STAGED_PROCESSING_ID.json"

STAGED="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary staged-rename-recovery --no-nudge --json)"
STAGED_ID="$(printf '%s' "$STAGED" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$STAGED_ID" --by orchestrator --json >/dev/null
rm "$RELAY_ROOT/receipts/inbox-$STAGED_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.action!=="acknowledged"||row.event_id!==id); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_ID"
mv "$RELAY_ROOT/inbox/acknowledged/$STAGED_ID.json" "$RELAY_ROOT/inbox/processing/$STAGED_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 1 event(s)'
test -f "$RELAY_ROOT/inbox/acknowledged/$STAGED_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$STAGED_ID.json"
test -f "$RELAY_ROOT/receipts/inbox-$STAGED_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$STAGED_ID" --by orchestrator --json | node -e 'let text=""; process.stdin.on("data", chunk=>text+=chunk).on("end",()=>{const row=JSON.parse(text); if(row.already!==true) process.exit(1)})'

STAGED_RETRY="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary staged-retry-invariant --no-nudge --json)"
STAGED_RETRY_ID="$(printf '%s' "$STAGED_RETRY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$STAGED_RETRY_ID" --by orchestrator --json >/dev/null
rm "$RELAY_ROOT/receipts/inbox-$STAGED_RETRY_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.action!=="acknowledged"||row.event_id!==id); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_RETRY_ID"
mv "$RELAY_ROOT/inbox/acknowledged/$STAGED_RETRY_ID.json" "$RELAY_ROOT/inbox/processing/$STAGED_RETRY_ID.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox retry "$STAGED_RETRY_ID" >"$TMP/staged-retry.out" 2>"$TMP/staged-retry.err"; then
  echo "expected staged acknowledgement retry rejection" >&2
  exit 1
fi
grep -q 'cannot retry acknowledged event' "$TMP/staged-retry.err"
test -f "$RELAY_ROOT/inbox/acknowledged/$STAGED_RETRY_ID.json"
test ! -e "$RELAY_ROOT/inbox/processing/$STAGED_RETRY_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$STAGED_RETRY_ID.json"
test -f "$RELAY_ROOT/receipts/inbox-$STAGED_RETRY_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="acknowledged"&&row.event_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one acknowledgement journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_RETRY_ID"

STAGED_DEAD="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary staged-dead-letter-invariant --no-nudge --json)"
STAGED_DEAD_ID="$(printf '%s' "$STAGED_DEAD" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$STAGED_DEAD_ID" --by orchestrator --json >/dev/null
rm "$RELAY_ROOT/receipts/inbox-$STAGED_DEAD_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.action!=="acknowledged"||row.event_id!==id); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_DEAD_ID"
mv "$RELAY_ROOT/inbox/acknowledged/$STAGED_DEAD_ID.json" "$RELAY_ROOT/inbox/pending/$STAGED_DEAD_ID.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox dead-letter "$STAGED_DEAD_ID" --reason test >"$TMP/staged-dead.out" 2>"$TMP/staged-dead.err"; then
  echo "expected staged acknowledgement dead-letter rejection" >&2
  exit 1
fi
grep -q 'cannot dead-letter acknowledged event' "$TMP/staged-dead.err"
test -f "$RELAY_ROOT/inbox/acknowledged/$STAGED_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$STAGED_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/dead-letter/$STAGED_DEAD_ID.json"
test -f "$RELAY_ROOT/receipts/inbox-$STAGED_DEAD_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="acknowledged"&&row.event_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one acknowledgement journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_DEAD_ID"

PENDING_DEAD="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary pending-dead-letter-recovery --no-nudge --json)"
PENDING_DEAD_ID="$(printf '%s' "$PENDING_DEAD" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.dead_letter={at:new Date().toISOString(),reason:"pending crash",retry_count:Number(row.retry_count??0),journal_schema:"hanchou.relay-terminal-journal.v1"}; delete row.lease; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/pending/$PENDING_DEAD_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >"$TMP/pending-dead-claim.json"
node -e 'const fs=require("fs"); const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(rows.some(row=>row.event_id===process.argv[2])) throw new Error("staged dead-letter was claimed")' \
  "$TMP/pending-dead-claim.json" "$PENDING_DEAD_ID"
test -f "$RELAY_ROOT/inbox/dead-letter/$PENDING_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$PENDING_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/processing/$PENDING_DEAD_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="dead-lettered"&&row.event_id===process.argv[2]); if(matches.length!==1||matches[0].schema!=="hanchou.relay-terminal-journal.v1"||matches[0].reason!=="pending crash") throw new Error(`invalid dead-letter journal evidence: ${JSON.stringify(matches)}`)' \
  "$RELAY_ROOT/journal.jsonl" "$PENDING_DEAD_ID"

PROCESSING_DEAD="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary processing-dead-letter-recovery --no-nudge --json)"
PROCESSING_DEAD_ID="$(printf '%s' "$PROCESSING_DEAD" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.dead_letter={at:new Date().toISOString(),reason:"processing crash",retry_count:Number(row.retry_count??0),journal_schema:"hanchou.relay-terminal-journal.v1"}; delete row.lease; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$PROCESSING_DEAD_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 1 event(s)'
test -f "$RELAY_ROOT/inbox/dead-letter/$PROCESSING_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/processing/$PROCESSING_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/pending/$PROCESSING_DEAD_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="dead-lettered"&&row.event_id===process.argv[2]); if(matches.length!==1||matches[0].schema!=="hanchou.relay-terminal-journal.v1"||matches[0].reason!=="processing crash") throw new Error(`invalid dead-letter journal evidence: ${JSON.stringify(matches)}`)' \
  "$RELAY_ROOT/journal.jsonl" "$PROCESSING_DEAD_ID"

RETRY_STAGED_DEAD="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary retry-staged-dead-letter --no-nudge --json)"
RETRY_STAGED_DEAD_ID="$(printf '%s' "$RETRY_STAGED_DEAD" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.dead_letter={at:new Date().toISOString(),reason:"retry crash",retry_count:Number(row.retry_count??0),journal_schema:"hanchou.relay-terminal-journal.v1"}; delete row.lease; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$RETRY_STAGED_DEAD_ID.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox retry "$RETRY_STAGED_DEAD_ID" >"$TMP/retry-staged-dead.out" 2>"$TMP/retry-staged-dead.err"; then
  echo "expected staged dead-letter retry to require replay" >&2
  exit 1
fi
grep -q 'recovered staged dead-letter; retry again' "$TMP/retry-staged-dead.err"
test -f "$RELAY_ROOT/inbox/dead-letter/$RETRY_STAGED_DEAD_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox retry "$RETRY_STAGED_DEAD_ID" >/dev/null
test -f "$RELAY_ROOT/inbox/pending/$RETRY_STAGED_DEAD_ID.json"
test ! -e "$RELAY_ROOT/inbox/dead-letter/$RETRY_STAGED_DEAD_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="dead-lettered"&&row.event_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one dead-letter journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$RETRY_STAGED_DEAD_ID"

RETRY_ACK_CRASH="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent retry-ack-agent --to-role orchestrator --delegation-depth 1 \
  --summary retry-ack-crash --no-nudge --json)"
RETRY_ACK_CRASH_ID="$(printf '%s' "$RETRY_ACK_CRASH" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=retry-ack-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-ack-agent --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.lease; row.retry_count=1; row.retry={at:new Date().toISOString(),from_state:"processing",retry_count:1,journal_schema:"hanchou.relay-inbox-transition-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$RETRY_ACK_CRASH_ID.json"
if HOME="$TMP" HANCHOU_AGENT_ID=retry-ack-agent "${HANCHOU_TEST[@]}" --profile work inbox ack "$RETRY_ACK_CRASH_ID" --by retry-ack-agent --json >"$TMP/retry-ack-crash.out" 2>"$TMP/retry-ack-crash.err"; then
  echo "expected staged retry to win over acknowledgement" >&2
  exit 1
fi
grep -q 'event retry completed; claim again before acknowledgement' "$TMP/retry-ack-crash.err"
test -f "$RELAY_ROOT/inbox/pending/$RETRY_ACK_CRASH_ID.json"
test ! -e "$RELAY_ROOT/inbox/processing/$RETRY_ACK_CRASH_ID.json"
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.retry_count!==1||event.recovery_count!==undefined||event.dead_letter||event.ack) throw new Error("staged retry was overwritten by acknowledgement or lease recovery"); const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="retried"&&row.event_id===event.event_id&&row.retry_count===1); if(matches.length!==1||matches[0].schema!=="hanchou.relay-inbox-transition-journal.v1"||matches[0].from_state!=="processing") throw new Error(`invalid retry replay journal: ${JSON.stringify(matches)}`)' \
  "$RELAY_ROOT/inbox/pending/$RETRY_ACK_CRASH_ID.json" "$RELAY_ROOT/journal.jsonl"
HOME="$TMP" HANCHOU_AGENT_ID=retry-ack-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-ack-agent --json >/dev/null
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.retry||event.retry_count!==1||event.lease?.claimed_by!=="retry-ack-agent") throw new Error("claim did not retire completed retry evidence")' \
  "$RELAY_ROOT/inbox/processing/$RETRY_ACK_CRASH_ID.json"
HOME="$TMP" HANCHOU_AGENT_ID=retry-ack-agent "${HANCHOU_TEST[@]}" --profile work inbox ack "$RETRY_ACK_CRASH_ID" --by retry-ack-agent --json >/dev/null

RETRY_ACK_CONFLICT="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent retry-conflict-agent --to-role orchestrator --delegation-depth 1 \
  --summary retry-ack-conflict --no-nudge --json)"
RETRY_ACK_CONFLICT_ID="$(printf '%s' "$RETRY_ACK_CONFLICT" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=retry-conflict-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-conflict-agent --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.lease; row.retry_count=1; row.retry={at:new Date().toISOString(),from_state:"processing",retry_count:1,journal_schema:"hanchou.relay-inbox-transition-journal.v1"}; row.ack={at:new Date().toISOString(),by:"retry-conflict-agent",journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$RETRY_ACK_CONFLICT_ID.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover >"$TMP/retry-ack-conflict.out" 2>"$TMP/retry-ack-conflict.err"; then
  echo "expected acknowledgement/retry evidence conflict to fail closed" >&2
  exit 1
fi
grep -q 'conflicting acknowledgement and retry evidence' "$TMP/retry-ack-conflict.err"
test -f "$RELAY_ROOT/inbox/processing/$RETRY_ACK_CONFLICT_ID.json"
rm "$RELAY_ROOT/inbox/processing/$RETRY_ACK_CONFLICT_ID.json"

RETRY_RECOVER_CRASH="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent retry-recover-agent --to-role orchestrator --delegation-depth 1 \
  --summary retry-recover-crash --no-nudge --json)"
RETRY_RECOVER_CRASH_ID="$(printf '%s' "$RETRY_RECOVER_CRASH" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=retry-recover-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-recover-agent --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.lease; row.retry_count=1; row.retry={at:new Date().toISOString(),from_state:"processing",retry_count:1,journal_schema:"hanchou.relay-inbox-transition-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$RETRY_RECOVER_CRASH_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 1 event(s)'
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 0 event(s)'
test -f "$RELAY_ROOT/inbox/pending/$RETRY_RECOVER_CRASH_ID.json"
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.retry_count!==1||event.recovery_count!==undefined) throw new Error("relay recover treated retry evidence as an expired lease"); const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="retried"&&row.event_id===event.event_id&&row.retry_count===1); if(matches.length!==1) throw new Error(`expected one retry journal entry, got ${matches.length}`)' \
  "$RELAY_ROOT/inbox/pending/$RETRY_RECOVER_CRASH_ID.json" "$RELAY_ROOT/journal.jsonl"

RETRY_DEAD_CRASH="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent retry-dead-agent --to-role orchestrator --delegation-depth 1 \
  --summary retry-dead-crash --no-nudge --json)"
RETRY_DEAD_CRASH_ID="$(printf '%s' "$RETRY_DEAD_CRASH" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=retry-dead-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-dead-agent --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox dead-letter "$RETRY_DEAD_CRASH_ID" --reason original >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.retry_count=1; row.retry={at:new Date().toISOString(),from_state:"dead-letter",retry_count:1,journal_schema:"hanchou.relay-inbox-transition-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/dead-letter/$RETRY_DEAD_CRASH_ID.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox dead-letter "$RETRY_DEAD_CRASH_ID" --reason replacement >"$TMP/retry-dead-crash.out" 2>"$TMP/retry-dead-crash.err"; then
  echo "expected staged retry to win over old dead-letter evidence" >&2
  exit 1
fi
grep -q 'recovered staged retry; dead-letter again if still required' "$TMP/retry-dead-crash.err"
test -f "$RELAY_ROOT/inbox/pending/$RETRY_DEAD_CRASH_ID.json"
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.retry_count!==1||event.dead_letter) throw new Error("old dead-letter evidence won over staged retry"); const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="retried"&&row.event_id===event.event_id&&row.retry_count===1); if(matches.length!==1||matches[0].from_state!=="dead-letter") throw new Error(`invalid dead-letter retry journal: ${JSON.stringify(matches)}`)' \
  "$RELAY_ROOT/inbox/pending/$RETRY_DEAD_CRASH_ID.json" "$RELAY_ROOT/journal.jsonl"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox retry "$RETRY_DEAD_CRASH_ID" | grep -q "already retried $RETRY_DEAD_CRASH_ID"

RETRY_PENDING_CRASH="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent retry-pending-agent --to-role orchestrator --delegation-depth 1 \
  --summary retry-pending-crash --no-nudge --json)"
RETRY_PENDING_CRASH_ID="$(printf '%s' "$RETRY_PENDING_CRASH" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=retry-pending-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-pending-agent --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.lease; row.retry_count=1; row.retry={at:new Date().toISOString(),from_state:"processing",retry_count:1,journal_schema:"hanchou.relay-inbox-transition-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$RETRY_PENDING_CRASH_ID.json"
mv "$RELAY_ROOT/inbox/processing/$RETRY_PENDING_CRASH_ID.json" "$RELAY_ROOT/inbox/pending/$RETRY_PENDING_CRASH_ID.json"
HOME="$TMP" HANCHOU_AGENT_ID=retry-pending-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to retry-pending-agent --json >/dev/null
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.retry||event.retry_count!==1||event.lease?.claimed_by!=="retry-pending-agent") throw new Error("pending retry replay was not settled before claim"); const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="retried"&&row.event_id===event.event_id&&row.retry_count===1); if(matches.length!==1) throw new Error(`expected one pending retry journal entry, got ${matches.length}`)' \
  "$RELAY_ROOT/inbox/processing/$RETRY_PENDING_CRASH_ID.json" "$RELAY_ROOT/journal.jsonl"
HOME="$TMP" HANCHOU_AGENT_ID=retry-pending-agent "${HANCHOU_TEST[@]}" --profile work inbox ack "$RETRY_PENDING_CRASH_ID" --by retry-pending-agent --json >/dev/null

RECOVERY_CRASH="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent recovery-crash-agent --to-role orchestrator --delegation-depth 1 \
  --summary recovery-write-rename-crash --no-nudge --json)"
RECOVERY_CRASH_ID="$(printf '%s' "$RECOVERY_CRASH" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=recovery-crash-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to recovery-crash-agent --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.lease; row.recovery_count=1; row.lease_recovery={at:new Date().toISOString(),recovery_count:1,journal_schema:"hanchou.relay-inbox-transition-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$RECOVERY_CRASH_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 1 event(s)'
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 0 event(s)'
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.recovery_count!==1||event.lease) throw new Error("lease recovery was applied more than once"); const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="lease-recovered"&&row.event_id===event.event_id&&row.recovery_count===1); if(matches.length!==1||matches[0].schema!=="hanchou.relay-inbox-transition-journal.v1") throw new Error(`invalid lease recovery journal: ${JSON.stringify(matches)}`)' \
  "$RELAY_ROOT/inbox/pending/$RECOVERY_CRASH_ID.json" "$RELAY_ROOT/journal.jsonl"

NONFINITE="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent nonfinite-agent --to-role orchestrator --delegation-depth 1 \
  --summary nonfinite-lease --no-nudge --json)"
NONFINITE_ID="$(printf '%s' "$NONFINITE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=nonfinite-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to nonfinite-agent --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.lease.expires_at_epoch="Infinity"; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$NONFINITE_ID.json"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover | grep -q 'recovered 1 event(s)'
test -f "$RELAY_ROOT/inbox/pending/$NONFINITE_ID.json"
node -e 'const fs=require("fs"); const event=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(event.recovery_count!==1||event.lease) throw new Error("non-finite lease was treated as future"); const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="lease-recovered"&&row.event_id===event.event_id&&row.recovery_count===1); if(matches.length!==1) throw new Error(`expected one non-finite lease recovery journal entry, got ${matches.length}`)' \
  "$RELAY_ROOT/inbox/pending/$NONFINITE_ID.json" "$RELAY_ROOT/journal.jsonl"

EXPIRED="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary expired --no-nudge --json)"
EXPIRED_ID="$(printf '%s' "$EXPIRED" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.lease.expires_at_epoch=0; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/inbox/processing/$EXPIRED_ID.json"
if HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$EXPIRED_ID" --by orchestrator --json >"$TMP/expired-ack.out" 2>"$TMP/expired-ack.err"; then
  echo "expected expired lease acknowledgement rejection" >&2
  exit 1
fi
grep -q 'event lease expired' "$TMP/expired-ack.err"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay recover >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$EXPIRED_ID" --by orchestrator --json >/dev/null

RETRY="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent orchestrator --to-role orchestrator --delegation-depth 1 \
  --summary retry --no-nudge --json)"
RETRY_ID="$(printf '%s' "$RETRY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox dead-letter "$RETRY_ID" --reason test >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox retry "$RETRY_ID" >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox show "$RETRY_ID" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { const row=JSON.parse(text); if (row.state !== "pending" || "dead_letter" in row.event) process.exit(1); })'
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox claim --to orchestrator --json >/dev/null
HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work inbox ack "$RETRY_ID" --by orchestrator --json >/dev/null

RACE="$(HOME="$TMP" HANCHOU_AGENT_ID=worker "${HANCHOU_TEST[@]}" --profile work relay emit \
  --type checkpoint --from-agent worker --from-role worker \
  --to-agent race-agent --to-role orchestrator --delegation-depth 1 \
  --summary race --no-nudge --json)"
RACE_ID="$(printf '%s' "$RACE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).event_id))')"
HOME="$TMP" HANCHOU_AGENT_ID=race-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to race-agent --limit 1 --json >"$TMP/race-a.json" &
race_a=$!
HOME="$TMP" HANCHOU_AGENT_ID=race-agent "${HANCHOU_TEST[@]}" --profile work inbox claim --to race-agent --limit 1 --json >"$TMP/race-b.json" &
race_b=$!
wait "$race_a"
wait "$race_b"
node -e 'const fs=require("fs"); const root=process.argv[1]; const id=process.argv[2]+".json"; const states=["pending","processing","acknowledged","dead-letter"]; const count=states.filter(s=>fs.existsSync(`${root}/inbox/${s}/${id}`)).length; if(count!==1) throw new Error(`event exists in ${count} states`)' "$RELAY_ROOT" "$RACE_ID"
HOME="$TMP" HANCHOU_AGENT_ID=race-agent "${HANCHOU_TEST[@]}" --profile work inbox ack "$RACE_ID" --by race-agent --json >/dev/null

HOME="$TMP" "${HANCHOU_TEST[@]}" --profile work relay daemon >"$TMP/daemon.out" 2>&1 &
daemon_pid=$!
for _ in $(seq 1 50); do
  grep -q 'hanchou relay daemon started' "$TMP/daemon.out" && break
  sleep 0.1
done
grep -q 'hanchou relay daemon started' "$TMP/daemon.out"
kill -TERM "$daemon_pid"
wait "$daemon_pid"
daemon_pid=""
grep -q 'hanchou relay daemon stopped' "$TMP/daemon.out"

echo "relay inbox lifecycle ok"
