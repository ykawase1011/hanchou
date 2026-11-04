#!/usr/bin/env bash
# Public CLI fixtures; no model calls. Native wake needs the separate live smoke.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hanchou-peer-test.XXXXXX")
trap 'rc=$?; if [[ $rc != 0 ]]; then cat "$fixture/receipt" "$fixture/error" >&2 || true; fi; rm -rf "$fixture"; exit "$rc"' EXIT
mkdir -p "$fixture/bin" "$fixture/project/.hanchou" "$fixture/parent"
export FIXTURE="$fixture" REAL_PS="$(command -v ps)" MOCK_PEER_MODE=success
export PATH="$fixture/bin:$PATH" HERDR_BIN="$fixture/bin/herdr"
git -C "$fixture/project" init -q
git -C "$fixture/project" -c user.name=Fixture -c user.email=test@example.invalid commit --allow-empty -qm base
printf '%s\n' '{"version":2,"sokkin":{"agent":"claude","model":"haiku","effort":"low"}}' > "$fixture/project/.hanchou/config.json"
printf 'Official ListAgents/tool/native settings fixture.\n' > "$fixture/peer-public.txt"
printf '{}\n' > "$fixture/settings.json"
cat > "$fixture/bin/ps" <<'MOCK'
#!/usr/bin/env bash
if [[ $* == '-p 999998 -o lstart=' ]]; then
  [[ $MOCK_PEER_MODE != parent-exit ]] || exit 1
  printf '%s\n' 'Tue Nov  3 01:00:00 2026'; exit
fi
if [[ $* == '-p 999999 -o lstart=' ]]; then
  [[ $MOCK_PEER_MODE != child-exit ]] || exit 1
  printf '%s\n' 'Tue Nov  3 02:00:00 2026'; exit
fi
exec "$REAL_PS" "$@"
MOCK
cat > "$fixture/bin/claude" <<'MOCK'
#!/bin/sh
if [ "$*" = --version ]; then echo '2.1.317 (Claude Code)'; exit; fi
[ "$*" = 'auth status --json' ] || exit 90
printf '%s\n' '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}'
MOCK
cat > "$fixture/bin/herdr" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
jq -nc --args '$ARGS.positional' -- "$@" >> "$FIXTURE/calls"
session=$2; shift 2
if [[ $session == parent ]]; then
 case "$1 $2" in
 'pane get') [[ $# == 3 && $3 == w1:p1 ]]; jq -nc --arg cwd "$FIXTURE/parent" --arg mode "$MOCK_PEER_MODE" '{result:{pane:{pane_id:"w1:p1",agent:(if $mode=="codex-parent" then "codex" else "claude" end),cwd:$cwd,agent_session:{kind:"id",source:"herdr:claude",value:(if $mode=="wrong-native" then "foreign" else "11111111-1111-1111-1111-111111111111" end)}}}}';;
 'pane process-info') jq -nc --arg cwd "$FIXTURE/parent" '{result:{process_info:{foreground_processes:[{pid:999998,cwd:$cwd,name:"claude",argv:["claude","--session-id","11111111-1111-1111-1111-111111111111","--name","parent","--permission-mode","manual"]}]}}}';;
 *) exit 91;; esac
 exit
fi
case "$1 $2" in
 'workspace list') echo '{"result":{"workspaces":[]}}';;
 'workspace create')
  echo "$4" > "$FIXTURE/cwd"
  jq -nc --arg cwd "$4" '{result:{workspace:{workspace_id:"w2"},tab:{tab_id:"w2:t1"},root_pane:{pane_id:"w2:p1",cwd:$cwd}}}';;
 'pane run') bash -c "$4"; echo '{"result":{}}';;
 'agent start')
  until [[ $1 == -- ]]; do shift; done; shift
  jq -nc --args '$ARGS.positional' -- "$@" > "$FIXTURE/args"
  id=$(jq -r 'index("--session-id") as $i | .[$i+1]' "$FIXTURE/args")
  jq -nc --arg cwd "$(cat "$FIXTURE/cwd")" --arg id "$id" --arg mode "$MOCK_PEER_MODE" '{result:{agent:{agent:"claude",agent_status:"idle",pane_id:"w2:p1",cwd:$cwd,agent_session:{kind:"id",source:(if $mode=="no-hook" then null else "herdr:claude" end),value:(if $mode=="child-native" then "wrong" else $id end)}}}}';;
 'pane process-info')
  jq -nc --arg cwd "$(cat "$FIXTURE/cwd")" --slurpfile args "$FIXTURE/args" --arg mode "$MOCK_PEER_MODE" '{result:{process_info:{foreground_processes:[{pid:999997,cwd:$cwd,name:"node",argv:null},{pid:999999,cwd:$cwd,name:"claude",argv:(["claude"]+$args[0]+(if $mode=="child-wrapper" then ["--dangerously-skip-permissions"] else [] end))}]}}}';;
 'agent prompt') echo 'unexpected model ACK' >&2;exit 92;;
 *) exit 93;;
esac
MOCK
chmod +x "$fixture/bin/"*
for mode in success no-hook child-native child-wrapper child-exit codex-parent wrong-native parent-exit old-parent held-parent missing-capability wrong-peer-name settings-hold; do
 export MOCK_PEER_MODE=$mode
 jq -nc --arg cwd "$fixture/parent" --arg evidence "$fixture/peer-public.txt" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg mode "$mode" '{version:1,host:"local",provider:"claude",root:true,cliVersion:"2.1.317",nativeId:"11111111-1111-1111-1111-111111111111",name:"parent",peer:"parent [abcdef]",herdr:{session:"parent",paneId:"w1:p1"},cwd:$cwd,process:{pid:999998,birth:"Tue Nov  3 01:00:00 2026"},sendMessage:($mode!="missing-capability"),notifyWhenIdle:true,inbound:(if $mode=="held-parent" then "hold" else "accept" end),observedAt:(if $mode=="old-parent" then "2000-01-01T00:00:00Z" else $now end),evidenceRef:$evidence}' > "$fixture/parent.json"
 if [[ $mode == wrong-peer-name ]]; then
  jq '.peer="another [abcdef]"' "$fixture/parent.json" > "$fixture/parent-next"
  mv "$fixture/parent-next" "$fixture/parent.json"
 fi
 if [[ $mode == settings-hold ]]; then printf '{"crossSessionInbound":"hold"}\n' > "$fixture/settings.json"; else printf '{}\n' > "$fixture/settings.json"; fi
 : > "$fixture/calls"
 rc=0
 bash "$root/skills/hanchou-orchestrator/scripts/launch-sokkin.sh" --project "$fixture/project" --mission peer --session fixture --worktree-root "$fixture/worktrees" --claude-peer "$fixture/parent.json" --claude-settings "$fixture/settings.json" > "$fixture/receipt" 2> "$fixture/error" || rc=$?
 if [[ $mode == success ]]; then
  [[ $rc == 0 ]]
  jq -e '.ok and .identityReadiness.status=="ready" and .usageReadiness.status=="not_required" and .receive.route=="claude-peer" and .receive.status=="peer_binding_required" and .sokkin.process.pid==999999 and .sokkin.nativeSessionId==.identityReadiness.nativeId and .sokkin.observedModel==null' "$fixture/receipt" >/dev/null
 else
  [[ $rc != 0 ]]
  jq -es 'length==1 and (.[0] | .ok==false and (.error.code|type=="string" and length>0))' "$fixture/receipt" >/dev/null
  if [[ $mode == child-wrapper ]]; then
   jq -e '.error.code=="process_identity_mismatch" and .sokkin.process==null and (.resources|length>0)' "$fixture/receipt" >/dev/null
  fi
 fi
 jq -se 'all(.[]; .[2:4]!=["agent","prompt"])' "$fixture/calls" >/dev/null
 printf 'claude native receive: %s ok\n' "$mode"
done

# The ordinary Herdr route may explicitly narrow Claude permissions locally;
# it neither requires nor claims a peer parent or automatic approval wake.
export MOCK_PEER_MODE=success
printf '%s\n' '{"permissions":{"defaultMode":"manual"},"crossSessionInbound":"hold"}' > "$fixture/settings.json"
bash "$root/skills/hanchou-orchestrator/scripts/launch-sokkin.sh" --project "$fixture/project" --mission local-settings --session fixture --worktree-root "$fixture/worktrees" --claude-settings "$fixture/settings.json" > "$fixture/receipt" 2> "$fixture/error"
jq -e '.ok and .receive.route=="herdr" and .identityReadiness.status=="pending" and .usageReadiness.status=="not_required"' "$fixture/receipt" >/dev/null
jq -e --arg path "$fixture/settings.json" 'index("--settings") as $i | .[$i+1]==$path and (index("--session-id")==null)' "$fixture/args" >/dev/null
printf 'claude explicit non-peer settings: ok\n'
