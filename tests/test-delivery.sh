#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MISE_DATA_DIR="${MISE_DATA_DIR:-$HOME/.local/share/mise}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node -e 'const fs=require("fs"); const schema=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const clauses=schema.allOf??[]; for(const status of ["pending","rendered","delivered","failed"]){if(!clauses.some(row=>row.if?.properties?.status?.const===status)) throw new Error(`missing Delivery status/evidence schema correlation for ${status}`)}' \
  "$ROOT/schemas/delivery.schema.json"

OUT="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind task_terminal \
  --task hch-test \
  --policy on_terminal \
  --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary 'Task completed' \
  --json)"
DELIVERY_ID="$(printf '%s' "$OUT" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"

HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$DELIVERY_ID" --by orchestrator --message 'Completed.' >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$DELIVERY_ID" --adapter local-session >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery show "$DELIVERY_ID" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => { if (JSON.parse(text).state !== "delivered") process.exit(1); })'

RELAY_ROOT="$TMP/.local/share/hanchou/work/relay"
RECOVERABLE="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary receipt-recovery --json)"
RECOVERABLE_ID="$(printf '%s' "$RECOVERABLE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$RECOVERABLE_ID" --by orchestrator --message 'Recoverable.' >/dev/null
RECOVERABLE_RECEIPT="$RELAY_ROOT/receipts/delivery-$RECOVERABLE_ID.json"
mkdir "$RECOVERABLE_RECEIPT"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter local-session >"$TMP/delivery-receipt-blocked.out" 2>"$TMP/delivery-receipt-blocked.err"; then
  echo "expected blocked Delivery receipt write" >&2
  exit 1
fi
test -e "$RELAY_ROOT/deliveries/delivered/$RECOVERABLE_ID.json"
rmdir "$RECOVERABLE_RECEIPT"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.delivered.schema="attacker.schema"; row.delivered.delivery_id="dly_forged"; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/delivered/$RECOVERABLE_ID.json"
mv "$RELAY_ROOT/journal.jsonl" "$RELAY_ROOT/journal.real.jsonl"
ln -s "$TMP/journal-sentinel" "$RELAY_ROOT/journal.jsonl"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter ignored-on-replay >"$TMP/delivery-journal-blocked.out" 2>"$TMP/delivery-journal-blocked.err"; then
  echo "expected unsafe Delivery journal rejection" >&2
  exit 1
fi
test -f "$RECOVERABLE_RECEIPT"
rm "$RELAY_ROOT/journal.jsonl"
mv "$RELAY_ROOT/journal.real.jsonl" "$RELAY_ROOT/journal.jsonl"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter ignored-on-replay >/dev/null
RECOVERABLE_RECEIPT_HASH="$(shasum -a 256 "$RECOVERABLE_RECEIPT" | awk '{print $1}')"
RECOVERABLE_RECEIPT_STAT="$(node -e 'const s=require("fs").statSync(process.argv[1],{bigint:true}); process.stdout.write(`${s.ino}:${s.mtimeNs}`)' "$RECOVERABLE_RECEIPT")"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter ignored-again >/dev/null
test "$(shasum -a 256 "$RECOVERABLE_RECEIPT" | awk '{print $1}')" = "$RECOVERABLE_RECEIPT_HASH"
test "$(node -e 'const s=require("fs").statSync(process.argv[1],{bigint:true}); process.stdout.write(`${s.ino}:${s.mtimeNs}`)' "$RECOVERABLE_RECEIPT")" = "$RECOVERABLE_RECEIPT_STAT"
node -e 'const fs=require("fs"),assert=require("assert"); const delivery=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const receiptPath=process.argv[2]; const info=fs.lstatSync(receiptPath); assert.ok(info.isFile()&&!info.isSymbolicLink()); const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8")); assert.deepStrictEqual(receipt,{...delivery.delivered,schema:"hanchou.delivery-receipt.v1",delivery_id:delivery.delivery_id})' \
  "$RELAY_ROOT/deliveries/delivered/$RECOVERABLE_ID.json" "$RECOVERABLE_RECEIPT"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="delivery-delivered"&&row.delivery_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one delivery journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); rows.find(row=>row.action==="delivery-delivered"&&row.delivery_id===id).adapter="tampered"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter ignored >"$TMP/mismatched-journal.out" 2>"$TMP/mismatched-journal.err"; then
  echo "expected mismatched Delivery journal rejection" >&2
  exit 1
fi
grep -q 'Relay journal entry does not match terminal state' "$TMP/mismatched-journal.err"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="delivery-delivered"&&row.delivery_id===id); if(row.adapter!=="tampered") throw new Error("mismatched journal was overwritten"); row.adapter="local-session"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); rows.push({...rows.find(row=>row.action==="delivery-delivered"&&row.delivery_id===id)}); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter ignored >"$TMP/duplicate-journal.out" 2>"$TMP/duplicate-journal.err"; then
  echo "expected duplicate Delivery journal rejection" >&2
  exit 1
fi
grep -q 'Relay journal contains duplicate terminal entries' "$TMP/duplicate-journal.err"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); let kept=false; const cleaned=rows.filter(row=>{ if(row.action!=="delivery-delivered"||row.delivery_id!==id)return true; if(!kept){kept=true;return true} return false }); fs.writeFileSync(path,cleaned.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="delivery-delivered"&&row.delivery_id===id); delete row.schema; row.at="2026-01-01T00:00:00.000Z"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RECOVERABLE_ID"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$RECOVERABLE_ID" --adapter ignored >"$TMP/stripped-journal-schema.out" 2>"$TMP/stripped-journal-schema.err"; then
  echo "expected stripped Delivery journal schema rejection" >&2
  exit 1
fi
grep -q 'Relay journal entry does not match terminal state' "$TMP/stripped-journal-schema.err"
node -e 'const fs=require("fs"); const journalPath=process.argv[1],deliveryPath=process.argv[2],id=process.argv[3]; const delivery=JSON.parse(fs.readFileSync(deliveryPath,"utf8")); const rows=fs.readFileSync(journalPath,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="delivery-delivered"&&row.delivery_id===id); row.schema="hanchou.relay-terminal-journal.v1"; row.at=delivery.delivered.at; fs.writeFileSync(journalPath,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$RELAY_ROOT/deliveries/delivered/$RECOVERABLE_ID.json" "$RECOVERABLE_ID"

LEGACY="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary legacy-journal --json)"
LEGACY_ID="$(printf '%s' "$LEGACY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$LEGACY_ID" --by orchestrator --message 'Legacy.' >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$LEGACY_ID" --adapter local-session >/dev/null
node -e 'const fs=require("fs"); for(const path of process.argv.slice(1,3)){const row=JSON.parse(fs.readFileSync(path,"utf8")); delete (row.delivered??row).journal_schema; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")}' \
  "$RELAY_ROOT/deliveries/delivered/$LEGACY_ID.json" "$RELAY_ROOT/receipts/delivery-$LEGACY_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse); const row=rows.find(row=>row.action==="delivery-delivered"&&row.delivery_id===id); delete row.schema; row.at="2026-01-01T00:00:00.000Z"; fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$LEGACY_ID"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$LEGACY_ID" --adapter ignored >/dev/null

STAGED="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary staged-rename-recovery --json)"
STAGED_ID="$(printf '%s' "$STAGED" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_ID" --by orchestrator --message 'Staged.' >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$STAGED_ID" --adapter local-session >/dev/null
rm "$RELAY_ROOT/receipts/delivery-$STAGED_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.action!=="delivery-delivered"||row.delivery_id!==id); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_ID"
mv "$RELAY_ROOT/deliveries/delivered/$STAGED_ID.json" "$RELAY_ROOT/deliveries/rendered/$STAGED_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$STAGED_ID" --adapter ignored | grep -q "recovered delivered $STAGED_ID"
test -f "$RELAY_ROOT/deliveries/delivered/$STAGED_ID.json"
test -f "$RELAY_ROOT/receipts/delivery-$STAGED_ID.json"

STAGED_RENDER="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary staged-render-invariant --json)"
STAGED_RENDER_ID="$(printf '%s' "$STAGED_RENDER" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_RENDER_ID" --by orchestrator --message 'Staged render invariant.' >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$STAGED_RENDER_ID" --adapter local-session >/dev/null
rm "$RELAY_ROOT/receipts/delivery-$STAGED_RENDER_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.action!=="delivery-delivered"||row.delivery_id!==id); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_RENDER_ID"
mv "$RELAY_ROOT/deliveries/delivered/$STAGED_RENDER_ID.json" "$RELAY_ROOT/deliveries/rendered/$STAGED_RENDER_ID.json"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_RENDER_ID" --by orchestrator --message ignored >"$TMP/staged-render.out" 2>"$TMP/staged-render.err"; then
  echo "expected staged Delivery render rejection" >&2
  exit 1
fi
grep -q 'cannot render delivered record' "$TMP/staged-render.err"
test -f "$RELAY_ROOT/deliveries/delivered/$STAGED_RENDER_ID.json"
test ! -e "$RELAY_ROOT/deliveries/rendered/$STAGED_RENDER_ID.json"
test -f "$RELAY_ROOT/receipts/delivery-$STAGED_RENDER_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="delivery-delivered"&&row.delivery_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one delivery journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_RENDER_ID"

STAGED_FAIL="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary staged-fail-invariant --json)"
STAGED_FAIL_ID="$(printf '%s' "$STAGED_FAIL" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_FAIL_ID" --by orchestrator --message 'Staged fail invariant.' >/dev/null
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$STAGED_FAIL_ID" --adapter local-session >/dev/null
rm "$RELAY_ROOT/receipts/delivery-$STAGED_FAIL_ID.json"
node -e 'const fs=require("fs"); const path=process.argv[1],id=process.argv[2]; const rows=fs.readFileSync(path,"utf8").trim().split("\n").map(JSON.parse).filter(row=>row.action!=="delivery-delivered"||row.delivery_id!==id); fs.writeFileSync(path,rows.map(JSON.stringify).join("\n")+"\n")' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_FAIL_ID"
mv "$RELAY_ROOT/deliveries/delivered/$STAGED_FAIL_ID.json" "$RELAY_ROOT/deliveries/pending/$STAGED_FAIL_ID.json"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery fail "$STAGED_FAIL_ID" --reason test >"$TMP/staged-fail.out" 2>"$TMP/staged-fail.err"; then
  echo "expected staged Delivery failure rejection" >&2
  exit 1
fi
grep -q 'cannot fail delivered record' "$TMP/staged-fail.err"
test -f "$RELAY_ROOT/deliveries/delivered/$STAGED_FAIL_ID.json"
test ! -e "$RELAY_ROOT/deliveries/pending/$STAGED_FAIL_ID.json"
test ! -e "$RELAY_ROOT/deliveries/failed/$STAGED_FAIL_ID.json"
test -f "$RELAY_ROOT/receipts/delivery-$STAGED_FAIL_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="delivery-delivered"&&row.delivery_id===process.argv[2]).length; if(count!==1) throw new Error(`expected one delivery journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_FAIL_ID"

STAGED_RENDER_SOURCE="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary staged-render-source --json)"
STAGED_RENDER_SOURCE_ID="$(printf '%s' "$STAGED_RENDER_SOURCE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.status="rendered"; row.rendered={at:"2026-08-30T00:00:00.000Z",by:"original-renderer",message:"Original message",attempts:0,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/pending/$STAGED_RENDER_SOURCE_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery list --state pending --json >"$TMP/staged-render-list.json"
node -e 'const fs=require("fs"); const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(rows.some(row=>row.delivery_id===process.argv[2])) throw new Error("staged rendered record leaked through pending list")' \
  "$TMP/staged-render-list.json" "$STAGED_RENDER_SOURCE_ID"
test -f "$RELAY_ROOT/deliveries/rendered/$STAGED_RENDER_SOURCE_ID.json"
test ! -e "$RELAY_ROOT/deliveries/pending/$STAGED_RENDER_SOURCE_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_RENDER_SOURCE_ID" --by replacement --message 'Replacement message' | grep -q "already rendered $STAGED_RENDER_SOURCE_ID"
node -e 'const fs=require("fs"),assert=require("assert"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); assert.deepStrictEqual(row.rendered,{at:"2026-08-30T00:00:00.000Z",by:"original-renderer",message:"Original message",attempts:0,journal_schema:"hanchou.relay-terminal-journal.v1"})' \
  "$RELAY_ROOT/deliveries/rendered/$STAGED_RENDER_SOURCE_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const matches=rows.filter(row=>row.action==="delivery-rendered"&&row.delivery_id===process.argv[2]&&row.attempts===0); if(matches.length!==1||matches[0].by!=="original-renderer") throw new Error(`invalid rendered journal evidence: ${JSON.stringify(matches)}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_RENDER_SOURCE_ID"

STAGED_FAILED_PENDING="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary staged-failed-pending --json)"
STAGED_FAILED_PENDING_ID="$(printf '%s' "$STAGED_FAILED_PENDING" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.status="failed"; row.attempts=1; row.failure={at:"2026-08-30T00:01:00.000Z",reason:"pending failure",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/pending/$STAGED_FAILED_PENDING_ID.json"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_FAILED_PENDING_ID" --by orchestrator --message ignored >"$TMP/staged-failed-render.out" 2>"$TMP/staged-failed-render.err"; then
  echo "expected staged failed Delivery render rejection" >&2
  exit 1
fi
grep -q 'cannot render failed record; retry first' "$TMP/staged-failed-render.err"
test -f "$RELAY_ROOT/deliveries/failed/$STAGED_FAILED_PENDING_ID.json"
test ! -e "$RELAY_ROOT/deliveries/pending/$STAGED_FAILED_PENDING_ID.json"
test ! -e "$RELAY_ROOT/receipts/delivery-$STAGED_FAILED_PENDING_ID.json"
node -e 'const fs=require("fs"),assert=require("assert"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); assert.equal(row.status,"failed"); assert.equal(row.attempts,1); assert.deepStrictEqual(row.failure,{at:"2026-08-30T00:01:00.000Z",reason:"pending failure",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}); if(row.delivered) throw new Error("failed record gained delivered evidence")' \
  "$RELAY_ROOT/deliveries/failed/$STAGED_FAILED_PENDING_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery fail "$STAGED_FAILED_PENDING_ID" --reason ignored | grep -q "already failed $STAGED_FAILED_PENDING_ID"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const failed=rows.filter(row=>row.action==="delivery-failed"&&row.delivery_id===process.argv[2]&&row.attempts===1); const delivered=rows.filter(row=>row.action==="delivery-delivered"&&row.delivery_id===process.argv[2]); if(failed.length!==1||delivered.length!==0) throw new Error(`invalid failed journal evidence: failed=${failed.length} delivered=${delivered.length}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_FAILED_PENDING_ID"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.retry={at:"2026-08-30T00:02:00.000Z",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/failed/$STAGED_FAILED_PENDING_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery retry "$STAGED_FAILED_PENDING_ID" | grep -q "recovered retried $STAGED_FAILED_PENDING_ID"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.status!=="pending"||row.attempts!==1||row.failure||row.retry?.attempts!==1) throw new Error("staged retry did not reach pending exactly once")' \
  "$RELAY_ROOT/deliveries/pending/$STAGED_FAILED_PENDING_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery retry "$STAGED_FAILED_PENDING_ID" | grep -q "already retried $STAGED_FAILED_PENDING_ID"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="delivery-retried"&&row.delivery_id===process.argv[2]&&row.attempts===1).length; if(count!==1) throw new Error(`expected one retry journal entry, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$STAGED_FAILED_PENDING_ID"

RETRY_FAIL_RACE="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary retry-fail-race --json)"
RETRY_FAIL_RACE_ID="$(printf '%s' "$RETRY_FAIL_RACE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery fail "$RETRY_FAIL_RACE_ID" --reason 'first failure' >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.retry={at:"2026-08-30T00:02:30.000Z",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/failed/$RETRY_FAIL_RACE_ID.json"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery fail "$RETRY_FAIL_RACE_ID" --reason 'second failure' >"$TMP/retry-fail-race.out" 2>"$TMP/retry-fail-race.err"; then
  echo "expected fail replay to stop after staged retry recovery" >&2
  exit 1
fi
grep -q 'recovered staged retry; run fail again' "$TMP/retry-fail-race.err"
node -e 'const fs=require("fs"); const root=process.argv[1],id=process.argv[2]+".json"; const states=["pending","rendered","delivered","failed"]; const present=states.filter(state=>fs.existsSync(`${root}/deliveries/${state}/${id}`)); if(present.length!==1||present[0]!=="pending") throw new Error(`expected only pending after staged retry recovery, got ${present}`); const row=JSON.parse(fs.readFileSync(`${root}/deliveries/pending/${id}`,"utf8")); if(row.status!=="pending"||row.failure) throw new Error("staged retry recovery was overwritten by fail")' \
  "$RELAY_ROOT" "$RETRY_FAIL_RACE_ID"

STAGED_FAILED_RENDERED="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary staged-failed-rendered --json)"
STAGED_FAILED_RENDERED_ID="$(printf '%s' "$STAGED_FAILED_RENDERED" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$STAGED_FAILED_RENDERED_ID" --by orchestrator --message 'Rendered before failure.' >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.status="failed"; row.attempts=1; row.failure={at:"2026-08-30T00:03:00.000Z",reason:"rendered failure",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/rendered/$STAGED_FAILED_RENDERED_ID.json"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$STAGED_FAILED_RENDERED_ID" --adapter forbidden >"$TMP/staged-failed-deliver.out" 2>"$TMP/staged-failed-deliver.err"; then
  echo "expected staged failed Delivery delivery rejection" >&2
  exit 1
fi
grep -q 'cannot deliver failed record; retry first' "$TMP/staged-failed-deliver.err"
test -f "$RELAY_ROOT/deliveries/failed/$STAGED_FAILED_RENDERED_ID.json"
test ! -e "$RELAY_ROOT/deliveries/rendered/$STAGED_FAILED_RENDERED_ID.json"
test ! -e "$RELAY_ROOT/deliveries/delivered/$STAGED_FAILED_RENDERED_ID.json"
test ! -e "$RELAY_ROOT/receipts/delivery-$STAGED_FAILED_RENDERED_ID.json"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.status!=="failed"||row.attempts!==1||row.failure?.reason!=="rendered failure"||row.delivered) throw new Error("rendered staged failure evidence changed")' \
  "$RELAY_ROOT/deliveries/failed/$STAGED_FAILED_RENDERED_ID.json"

LEGACY_STAGED_RETRY="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary legacy-staged-retry --json)"
LEGACY_STAGED_RETRY_ID="$(printf '%s' "$LEGACY_STAGED_RETRY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery fail "$LEGACY_STAGED_RETRY_ID" --reason 'legacy retry' >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.status="pending"; delete row.failure; delete row.retry; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/failed/$LEGACY_STAGED_RETRY_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery list --state pending --json >"$TMP/legacy-staged-retry-list.json"
node -e 'const fs=require("fs"); const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(!rows.some(row=>row.delivery_id===process.argv[2])) throw new Error("legacy staged retry was not recovered into pending")' \
  "$TMP/legacy-staged-retry-list.json" "$LEGACY_STAGED_RETRY_ID"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.status!=="pending"||row.failure||row.retry?.journal_schema!=="hanchou.relay-terminal-journal.v1"||row.retry?.attempts!==1) throw new Error("legacy staged retry migration failed")' \
  "$RELAY_ROOT/deliveries/pending/$LEGACY_STAGED_RETRY_ID.json"

LEGACY_PENDING_RETRY="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary legacy-pending-retry --json)"
LEGACY_PENDING_RETRY_ID="$(printf '%s' "$LEGACY_PENDING_RETRY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery fail "$LEGACY_PENDING_RETRY_ID" --reason 'legacy pending retry' >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.status="pending"; delete row.failure; delete row.retry; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/failed/$LEGACY_PENDING_RETRY_ID.json"
mv "$RELAY_ROOT/deliveries/failed/$LEGACY_PENDING_RETRY_ID.json" "$RELAY_ROOT/deliveries/pending/$LEGACY_PENDING_RETRY_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery retry "$LEGACY_PENDING_RETRY_ID" | grep -q "already retried $LEGACY_PENDING_RETRY_ID"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(row.status!=="pending"||row.failure||row.retry?.attempts!==1) throw new Error("markerless pending retry replay failed")' \
  "$RELAY_ROOT/deliveries/pending/$LEGACY_PENDING_RETRY_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const count=rows.filter(row=>row.action==="delivery-retried"&&row.delivery_id===process.argv[2]&&row.attempts===1).length; if(count!==1) throw new Error(`expected one migrated pending retry journal, got ${count}`)' \
  "$RELAY_ROOT/journal.jsonl" "$LEGACY_PENDING_RETRY_ID"

DIRECT_RENDERED_RETRY="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary direct-rendered-retry --json)"
DIRECT_RENDERED_RETRY_ID="$(printf '%s' "$DIRECT_RENDERED_RETRY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$DIRECT_RENDERED_RETRY_ID" --by orchestrator --message 'Before staged failure.' >/dev/null
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.status="failed"; row.attempts=1; row.failure={at:"2026-08-30T00:03:30.000Z",reason:"direct retry",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/rendered/$DIRECT_RENDERED_RETRY_ID.json"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery retry "$DIRECT_RENDERED_RETRY_ID" | grep -q "retried $DIRECT_RENDERED_RETRY_ID"
node -e 'const fs=require("fs"); const root=process.argv[1],id=process.argv[2]+".json"; const states=["pending","rendered","delivered","failed"]; const present=states.filter(state=>fs.existsSync(`${root}/deliveries/${state}/${id}`)); if(present.length!==1||present[0]!=="pending") throw new Error(`direct staged failure retry left states ${present}`); const row=JSON.parse(fs.readFileSync(`${root}/deliveries/pending/${id}`,"utf8")); if(row.status!=="pending"||row.failure||row.attempts!==1||row.retry?.attempts!==1) throw new Error("direct staged failure retry evidence is invalid")' \
  "$RELAY_ROOT" "$DIRECT_RENDERED_RETRY_ID"

FRESH_RETRY="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary fresh-retry-rejection --json)"
FRESH_RETRY_ID="$(printf '%s' "$FRESH_RETRY" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery retry "$FRESH_RETRY_ID" >"$TMP/fresh-retry.out" 2>"$TMP/fresh-retry.err"; then
  echo "expected never-failed pending retry rejection" >&2
  exit 1
fi
grep -q 'pending delivery has no retry evidence' "$TMP/fresh-retry.err"
test -f "$RELAY_ROOT/deliveries/pending/$FRESH_RETRY_ID.json"

INCONSISTENT_FAILURE="$(HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary inconsistent-failure-evidence --json)"
INCONSISTENT_FAILURE_ID="$(printf '%s' "$INCONSISTENT_FAILURE" | node -e 'let text=""; process.stdin.on("data", chunk => text += chunk).on("end", () => console.log(JSON.parse(text).delivery_id))')"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); row.attempts=1; row.failure={at:"2026-08-30T00:04:00.000Z",reason:"inconsistent",attempts:1,journal_schema:"hanchou.relay-terminal-journal.v1"}; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/pending/$INCONSISTENT_FAILURE_ID.json"
INCONSISTENT_FAILURE_HASH="$(shasum -a 256 "$RELAY_ROOT/deliveries/pending/$INCONSISTENT_FAILURE_ID.json" | awk '{print $1}')"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery list --json >"$TMP/inconsistent-failure-list.out" 2>"$TMP/inconsistent-failure-list.err"; then
  echo "expected inconsistent failure list rejection" >&2
  exit 1
fi
grep -q 'staged delivery failure evidence is inconsistent' "$TMP/inconsistent-failure-list.err"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-rendered "$INCONSISTENT_FAILURE_ID" --by orchestrator --message ignored >"$TMP/inconsistent-failure-render.out" 2>"$TMP/inconsistent-failure-render.err"; then
  echo "expected inconsistent failure render rejection" >&2
  exit 1
fi
grep -q 'staged delivery failure evidence is inconsistent' "$TMP/inconsistent-failure-render.err"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery mark-delivered "$INCONSISTENT_FAILURE_ID" --adapter forbidden >"$TMP/inconsistent-failure-deliver.out" 2>"$TMP/inconsistent-failure-deliver.err"; then
  echo "expected inconsistent failure delivery rejection" >&2
  exit 1
fi
grep -q 'staged delivery failure evidence is inconsistent' "$TMP/inconsistent-failure-deliver.err"
test "$(shasum -a 256 "$RELAY_ROOT/deliveries/pending/$INCONSISTENT_FAILURE_ID.json" | awk '{print $1}')" = "$INCONSISTENT_FAILURE_HASH"
test ! -e "$RELAY_ROOT/deliveries/rendered/$INCONSISTENT_FAILURE_ID.json"
test ! -e "$RELAY_ROOT/deliveries/delivered/$INCONSISTENT_FAILURE_ID.json"
test ! -e "$RELAY_ROOT/deliveries/failed/$INCONSISTENT_FAILURE_ID.json"
test ! -e "$RELAY_ROOT/receipts/delivery-$INCONSISTENT_FAILURE_ID.json"
node -e 'const fs=require("fs"); const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); if(rows.some(row=>row.delivery_id===process.argv[2]&&["delivery-rendered","delivery-delivered","delivery-failed"].includes(row.action))) throw new Error("inconsistent failure produced transition journal evidence")' \
  "$RELAY_ROOT/journal.jsonl" "$INCONSISTENT_FAILURE_ID"
node -e 'const fs=require("fs"); const path=process.argv[1]; const row=JSON.parse(fs.readFileSync(path,"utf8")); delete row.failure; row.attempts=0; fs.writeFileSync(path,JSON.stringify(row,null,2)+"\n")' \
  "$RELAY_ROOT/deliveries/pending/$INCONSISTENT_FAILURE_ID.json"

SENTINEL="$TMP/outside.json"
printf '{"sentinel":"unchanged"}\n' > "$SENTINEL"
SENTINEL_HASH="$(shasum -a 256 "$SENTINEL" | awk '{print $1}')"
ESCAPE_ID='../../../../../../outside'
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --delivery-id "$ESCAPE_ID" --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary escape --json >"$TMP/escape-create.out" 2>"$TMP/escape-create.err"; then
  echo "expected traversal Delivery ID rejection" >&2
  exit 1
fi
grep -q 'invalid delivery ID' "$TMP/escape-create.err"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery show "$ESCAPE_ID" >"$TMP/escape-show.out" 2>"$TMP/escape-show.err"; then
  echo "expected traversal Delivery lookup rejection" >&2
  exit 1
fi
grep -q 'invalid delivery ID' "$TMP/escape-show.err"
test "$(shasum -a 256 "$SENTINEL" | awk '{print $1}')" = "$SENTINEL_HASH"

if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --kind manual --source-event invalid --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary invalid-source --json >"$TMP/source-create.out" 2>"$TMP/source-create.err"; then
  echo "expected invalid source event ID rejection" >&2
  exit 1
fi
grep -q 'invalid event ID' "$TMP/source-create.err"

RACE_ID="dly_race"
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --delivery-id "$RACE_ID" --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary race-a --json >"$TMP/race-a.out" 2>"$TMP/race-a.err" &
race_a=$!
HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery create \
  --delivery-id "$RACE_ID" --kind manual --policy always --renderer orchestrator \
  --destination '{"type":"local_session","agent":"orchestrator"}' \
  --summary race-b --json >"$TMP/race-b.out" 2>"$TMP/race-b.err" &
race_b=$!
if wait "$race_a"; then race_a_status=0; else race_a_status=$?; fi
if wait "$race_b"; then race_b_status=0; else race_b_status=$?; fi
test $((race_a_status + race_b_status)) -ne 0
test -e "$TMP/.local/share/hanchou/work/relay/deliveries/pending/$RACE_ID.json"

ln -s "$SENTINEL" "$RELAY_ROOT/deliveries/pending/dly_symlink.json"
if HOME="$TMP" "$ROOT/bin/hanchou" --profile work delivery list --json >"$TMP/symlink-list.out" 2>"$TMP/symlink-list.err"; then
  echo "expected symlink Delivery record rejection" >&2
  exit 1
fi
grep -q 'regular non-symlink file' "$TMP/symlink-list.err"

echo "delivery lifecycle ok"
