# v2 セッション使用量ツールの検証

検証日: 2026-10-20。対象: 設計書 §7、Codex CLI 0.162.1、Claude Code 2.1.299。

## 判定

**`ccusage@20.0.37`を、独立起動したCodex thread／Claude sessionの確定済み使用量を読むツールとして限定受入する。** 下記試料ではnative usageと一致した。Claudeのnative子は親session合計に含むと明示し、独立起動したworker sessionとは区別する。進行中ログの鮮度・欠測の検出・missionとの対応はこのツールだけでは保証できず、下記の運用ゲートと組み合わせる。v2全体の自律本運用が検証済みになったことは意味しない。

`@ccusage/codex@19.0.0`はnpmで非推奨になっている。今回確認した現行の単一`ccusage`バイナリには`codex`と`claude`の名前空間がある。旧版のコマンド・出力形式を混ぜない。

## 固定版と再現コマンド

グローバルやrepositoryへ導入せず、一時ディレクトリにインストールした。macOS arm64、Node 26.5.0で確認。npmパッケージはNodeのwrapperと同版のplatform別native binaryで構成されるため、optional dependencyを省略しない。

```bash
usage_tool_dir=$(mktemp -d)
npm install --prefix "$usage_tool_dir" --ignore-scripts --no-audit --no-fund ccusage@20.0.37
usage_tool="$usage_tool_dir/node_modules/.bin/ccusage"
"$usage_tool" --version
"$usage_tool" codex session --help
"$usage_tool" claude session --help
```

npmの`ccusage@20.0.37`のintegrity:

```text
sha512-tuLaEs+ea66+Z9p+XCjNHu8ANhhJLuyvAkOIMjilPStP8pHjRZcPOEmIFqisfnu10nGX7NXVBjmQVa95N8wyng==
```

公開ソースの固定tagは[v20.0.37](https://github.com/ccusage/ccusage/tree/v20.0.37)、commitは`867c9f38ef98f81df3d8b46a941ccfdf41ab2c2d`。公式ガイドは[Codex](https://ccusage.com/guide/codex/)と[Claude](https://ccusage.com/guide/claude/)。ガイドの最新版と固定版のhelpに差があれば、固定版の実測を優先して再検証する。

既存のローカルログを読む例。各IDとhomeは起動受領で照合した値を渡す。環境変数は集計コマンドの子プロセスだけに設定する。`--offline`で価格のネットワーク取得を避け、金額は判断に使わない。

```bash
# CODEX_LOG_HOMEとNATIVE_THREAD_IDは利用者側の照合済み値。
env CODEX_HOME="$CODEX_LOG_HOME" "$usage_tool" codex session \
  --json --offline --no-cost --speed standard --id "$NATIVE_THREAD_ID" |
  jq -e '{sessionId,lastActivity,inputTokens,cacheReadTokens,
          cacheCreationTokens,outputTokens,reasoningOutputTokens,totalTokens,models}'

# session一覧の集計形式を使う。--idを付けたClaude出力は別形式になる。
env CLAUDE_CONFIG_DIR="$CLAUDE_LOG_HOME" "$usage_tool" claude session \
  --json --offline |
  jq -e --arg id "$NATIVE_SESSION_ID" \
    '.sessions[] | select(.sessionId == $id) |
     {sessionId,firstActivity,lastActivity,inputTokens,cacheReadTokens,
      cacheCreationTokens,outputTokens,totalTokens}'
```

実装時はpipelineの失敗も検出する。該当なし、型違い、読取り失敗、未確定のnative IDを0に置換しない。上記の`jq`は出力項目の選択であり、完全性や予算の判定そのものではない。

Codex一覧の`sessionId`はnative thread UUIDそのものではなく、ログrootからの相対rollout path（拡張子なし）。`--id`にはnative UUIDでも該当することを実測した。保存する対応はnative thread IDとrollout pathの両方を照合する。Claudeの`session --id ... --json`は`entries`, `sessionId`, `totalTokens`, `totalCost`の詳細形式で、entryはtimestamp/model/token内訳を持つがworker IDやrequest/message IDを公開しない。

## ローカル試料との照合結果

既存ログから本文・instructions・認証情報を除いた一時試料を作り、識別metadata、model、usage、累計、圧縮markerだけを用いた。試料も比較用コードもrepositoryへ追加していない。既存ログは変更せず、新規推論・worker起動・認証や設定の変更は行っていない。以下のA/B等は文書内の匿名ラベルで、native IDではない。

| 試料 | 独立したusage照合 | ccusage 20.0.37 | 結果 |
| --- | --- | --- | --- |
| Codex A、完了済みCLI thread、7 response | 一意responseの合計と最終thread累計: 288,972 | 288,972 | 一致 |
| Codex B、完了済みCLI thread、15 response | 同上: 1,124,863 | 1,124,863 | 一致 |
| Codex C、親履歴を含むfork、自己threadの10 response | 自己thread IDに属する一意responseのみ: 424,112 | 424,112 | コピー履歴を加算せず一致 |
| Codex D、子thread、8 response | 自己thread IDに属する一意responseのみ: 330,558 | 330,558 | 親と別に一致 |
| Claude A、234 assistant行 | requestId + message.idで95件: 15,670,639 | 15,670,639 | 重複を除いて一致 |
| Claude B、206 assistant行 + 5子ログ66行 | 親84件 + 子33件: 15,065,915 | 15,065,915 | 子を含む親session合計として一致 |

Claude Bの内訳は通常input 201、cache creation 479,872、cache read 14,514,729、output 71,113。各子の記録は同じnative `sessionId`を持ち、集計結果は親sessionへ統合された。**この親合計に子合計を再加算してはいけない。** 独立起動したworkerは別のnative sessionとして対応付ける。native子ごとの使用量はこの出力から分離できないため、親sessionの計測範囲に「native子を含む」と明記する。

Codexの書込み途中の圧縮済みthreadでは、一意response合計／最終`thread_token_usage`が8,984,289、ccusageが8,812,125だった。差の172,164は末尾に保存された通常responseの全使用量に一致し、その後の`event_msg/token_count`がまだ試料に存在しなかった。圧縮までの確定済みprefixでは一意response合計8,812,125と一致した。これは読取り時点の非原子性と集計の遅延を示す実例である。次のsnapshotとの照合前は`pending`／一部欠測として扱い、新規割当を止める。最後のactivity時刻が新しいだけで完全とは判定しない。

## 重複・履歴の検証マトリクス

| 論点 | 今回実行した確認／固定版ソース | 範囲 |
| --- | --- | --- |
| 通常の重複 | Claudeの同一request/message複数行を実ログで照合 | 上記A/Bで一致 |
| active/archiveの同一rollout | 一時試料を同じ相対pathで`archived_sessions`へ複製し再集計 | token全項目が不変 |
| 累計・圧縮の重複 | 同じ`token_count`、圧縮response IDのusageとmarkerを一時試料へ再挿入 | token全項目が不変 |
| fork・子の親履歴 | 既存Codex fork/childと親ログを同じ試料rootで集計 | 上記C/Dの自己thread分と一致 |
| compaction | 圧縮markerを含む既存Codex threadの確定prefixを照合 | 一致。末尾書込み途中は欠測を検出 |
| resume・reset・親欠損 | 初回はsourceと公開の回帰testを読取り確認。追加offline試験は後掲 | native操作の全経路保証ではない |

固定版の[Codex回帰test](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/codex/src/loader.rs)には`skips_replayed_parent_token_history_in_forked_session_files`、`keeps_cumulative_baseline_when_skipping_subagent_replay`等がある。[圧縮test](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/codex/src/compaction_tests.rs)はコピーID、date範囲外の親、累計に既に含まれた圧縮を扱う。今回upstream test suite全体を実行したとの主張ではなく、上記一時試料のCLI試験とsource確認を区別する。

## フィールドと重複除去の意味

- Codex JSONの`inputTokens`は**cacheを除くinput**。nativeの`input_tokens`との比較には`inputTokens + cacheReadTokens`を使う。`totalTokens`にはcache readが既に入り、`reasoningOutputTokens`はoutputの内数。cacheとreasoningをもう一度足さない。
- Claudeは通常input・cache creation・cache read・outputが別項目。検証試料では4項目の和が`totalTokens`と一致した。Codexのnative inputと同じ式で扱わない。
- Codexの[parser](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/codex/src/parser.rs)は通常の`token_count`累計の差分を集計し、`token_usage_record`を単純に全件足す方式ではない。圧縮はresponse IDと`compacted`の対応を確認し、既に累計へ含まれた分を二重加算しない。model欠落時のfallbackは推定であり、実modelの確認にはならない。
- Codexの[replay処理](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/codex/src/replay.rs)は`forked_from_id`または`source.subagent.thread_spawn.parent_thread_id`と親ログを用いる。親不在時はheuristicにfallbackするため、親ログ欠損を完全な計測として受け入れない。
- Claudeの[loader](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/claude/src/lib.rs)はrequest/messageの同一性で重複除去し、重複候補のうちより完全なusageを選ぶ。sidechainのコピーにも専用処理がある。本文の一致による除去ではない。
- resumeで同じnative IDを使う場合、前回報告したsession全量と今回の全量を加算しない。fork/child/compactionのsource上の対応は全形式の実機保証ではない。今回native操作を伴う新規resume・fork・compaction試験は実行していない。

## 最小の安全な運用ゲート

R08–R10を満たすには、mission／試行／側近／workerとnative IDの対応、全子ログの存在、計測元の版、観測時刻・対象期間・完全性を別途受領・報告で確認する。ccusageはmission、計測完了、欠測、親子関係を保証する会計台帳ではない。

1. 起動受領にproviderとnative IDを記録し、Herdrの`agent_session`等の実際の起動情報、または専用worktreeのcwdとCodex `session_meta`を照合する。名前や最新ログだけで推測しない。Herdrとの実照合はこの検証の対象外。
2. 独立起動した全session/threadを一覧にし、Claude native子を親に含む範囲、Codex子threadを別に数える範囲を明記する。親子の同じ使用量を二重に足さない。
3. 最も単純な運用は、request完了・ログ書込み終了後のsnapshotで予算を確認し、次の割当を行うこと。snapshotの観測時刻、最終activity、対象期間を報告する。並行読取りの原子性を仮定せず、上記の未反映responseのような差があれば次のsnapshotでもう一度照合する。
4. 許容鮮度を依頼で定め、ID未確定・該当行なし・親ログ欠損・書込み途中・照合不一致・鮮度超過は`pending`／`unavailable`として新規worker・追加依頼・自動retryを止める。0にしない。予算を使い切るまでの実行中requestを厳密に停止できるとはしない。
5. resume時は同じsessionの新しい全量で前回値を置き換え、加算しない。新たなfork、counter reset、未検証形式はその都度照合し、保証できない範囲を完全と報告しない。

この限定受入は新規resume・fork・圧縮を起こした全経路の実機認定ではない。独自parser、collector、常駐runtimeを追加せず、既存の報告・受領と固定ツールを使う。

トークン数はコンテキスト占有率、週次サブスク残量、支払額のいずれでもない。価格換算値を予算ゲートへ流用しない。この検証はログ集計の適合性確認であり、認証経路がサブスク限定であることの検証とは別である。

## R09の追加offline受入（2026-10-20）

固定済み`ccusage@20.0.37`を使い、本文・認証情報のない合成JSONLだけで確認した。新規の推論、native session、providerのresume操作は実行していない。「resume」は同じnative ID・同じファイルへusageを追加して再集計する形式試験である。任意の実ログ形式・全reset経路の保証ではない。

| ケース | 既知の期待値 | 実際のCLI結果 | Hanchou側の処置 |
| --- | --- | --- | --- |
| Codex同一IDの再読取り | 最初110、重複snapshotと新request追加後155 | 各回exit 0、1 entry、110→155 | 同じentryを155へ更新。110+155=265としない |
| Claude同一IDの再読取り | 最初110、同じrequestの重複と新request追加後150 | 各回exit 0、1 entry、110→150 | 同じentryを150へ更新。110+150=260としない |
| Codex累計reset、request差分なし | 完全な消費は110+44+33=187 | exit 0、143。累計110→44の減少を0差分にし、次の33だけ加算 | 欠測のため`unavailable`。143を完全な合計と認定しない |
| 同reset、確かな`last_token_usage`あり | request使用量110、44、33の合計187 | exit 0、187 | この既知の形式では一致。ただしreset後の最終累計77だけとは比較せず、requestと範囲の裏付けが必要 |
| Codex親ログ欠損 | forkコピー110は過去分、子の新規消費44 | exit 0、154（継承110を含む） | 親不足を別途検出して`unavailable`。heuristicの結果を完全としない |
| Codex native ID欠損 | 起動受領との対応不能 | exit 0、path由来の1 entry、110 | ID未確定なら`pending`、欠損が確定なら`unavailable`。値を0にしない |
| Claude native ID欠損 | 同上 | exit 0、path由来の1 entry、110 | 同上。path上のsession名だけでnative IDと断定しない |
| 存在しないCodex `--id` | 対応するsessionなし | exit 1、stdout JSONなし、stderrに`No Codex session found with ID` | `unavailable`。失敗を空の0集計に変換しない |

resetでは[固定版parser](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/codex/src/parser.rs)の`last_token_usage`優先と`subtract_codex_raw_usage`の`saturating_sub`に一致した。親欠損試料はコピーsnapshotが1個だけで、続く新規requestまで4秒空けたため、[replay処理](https://github.com/ccusage/ccusage/blob/v20.0.37/rust/adapters/codex/src/replay.rs)が親streamを参照できず、密なコピーburstにも依存できないケースである。どちらもccusageが欠測を自動検出したとの主張ではない。

fixtureは既存providerログと同じcompact JSONLで生成した。再現文書の確認中、Claude試料を通常の空白付き`json.dumps`で書くとexit 0・0 entryになったため、その再整形形式は受入範囲に含めない。期待するログがあるのに0 entryならunavailableにする条件はここにも必要である。

以下は再現用の最小fixture生成と、実行したCLIと同じ引数。UUID風の値・request IDはすべて人工の固定値である。`USAGE_TOOL`は上記手順で入れた20.0.37の実行ファイルを指定する。生成用Pythonは試験データを書くためだけに使い、ログparserやHanchouの実行時依存にはしない。

```bash
R09_DIR=$(mktemp -d)
export R09_DIR
python3 - <<'PY'
import json, os
from pathlib import Path
root = Path(os.environ['R09_DIR'])
(root/'config.json').write_text('{}')
sid = '00000000-0000-4000-8000-000000000001'
def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(json.dumps(x,separators=(',',':'))+'\n' for x in rows))
def u(i, o):
    return dict(input_tokens=i, output_tokens=o, total_tokens=i+o)
def event(second, total, last=None):
    info = {'total_token_usage':total}
    if last is not None: info['last_token_usage'] = last
    return dict(timestamp=f'2026-10-20T00:00:{second:02}.000Z',
                type='event_msg', payload=dict(type='token_count',info=info))
meta = dict(type='session_meta', timestamp='2026-10-20T00:00:00.000Z',
            payload=dict(id=sid,cli_version='0.162.1'))
model = dict(type='turn_context',timestamp='2026-10-20T00:00:00.001Z',
             payload=dict(model='gpt-6.1-sol'))
first = event(1,u(100,10),u(100,10))
write(root/'codex-resume/sessions/same.jsonl',[meta,model,first])
write(root/'codex-append.jsonl',[first,event(5,u(140,15),u(40,5))])
for name, with_last in [('reset-cumulative',False),('reset-last',True)]:
    pairs = [(1,u(100,10),u(100,10)),(5,u(40,4),u(40,4)),
             (9,u(70,7),u(30,3))]
    write(root/name/'sessions/reset.jsonl',[meta,model]+
          [event(t,total,last if with_last else None) for t,total,last in pairs])
parent_meta = {**meta,'payload':{**meta['payload'],'forked_from_id':
               '00000000-0000-4000-8000-000000000099'}}
write(root/'missing-parent/sessions/child.jsonl',
      [parent_meta,model,first,event(5,u(140,14),u(40,4))])
write(root/'codex-no-id/sessions/unbound.jsonl',
      [{**meta,'payload':{'cli_version':'0.162.1'}},model,first])
def claude(n, known=True):
    usage = dict(input_tokens=10 if n==1 else 5,
                 cache_creation_input_tokens=20 if n==1 else 10,
                 cache_read_input_tokens=70 if n==1 else 20,
                 output_tokens=10 if n==1 else 5)
    x = dict(type='assistant',version='2.1.299',
             timestamp=f'2026-10-20T00:00:0{n}.000Z',requestId=f'request-fixture-{n}',
             message=dict(id=f'msg-fixture-{n}',model='claude-haiku-5-5',usage=usage))
    if known: x['sessionId'] = sid
    return x
write(root/'claude-resume/projects/fixture/same.jsonl',[claude(1)])
write(root/'claude-append.jsonl',[claude(1),claude(2)])
write(root/'claude-no-id/projects/fixture/unbound.jsonl',[claude(1,False)])
PY

set -o pipefail
read_codex() {
  env CODEX_HOME="$R09_DIR/$1" "$USAGE_TOOL" codex session \
    --json --offline --no-cost --speed standard --config "$R09_DIR/config.json" |
    jq -c '{entries:(.sessions|length),total:.totals.totalTokens}'
}
read_claude() {
  env CLAUDE_CONFIG_DIR="$R09_DIR/$1" "$USAGE_TOOL" claude session \
    --json --offline --config "$R09_DIR/config.json" |
    jq -c '{entries:(.sessions|length),total:.totals.totalTokens}'
}
read_codex codex-resume                 # {"entries":1,"total":110}
cat "$R09_DIR/codex-append.jsonl" >> "$R09_DIR/codex-resume/sessions/same.jsonl"
read_codex codex-resume                 # {"entries":1,"total":155}
read_codex reset-cumulative             # {"entries":1,"total":143}, unavailable
read_codex reset-last                   # {"entries":1,"total":187}
read_codex missing-parent               # {"entries":1,"total":154}, unavailable
read_codex codex-no-id                  # {"entries":1,"total":110}, unbound
read_claude claude-resume               # {"entries":1,"total":110}
cat "$R09_DIR/claude-append.jsonl" >> "$R09_DIR/claude-resume/projects/fixture/same.jsonl"
read_claude claude-resume               # {"entries":1,"total":150}
read_claude claude-no-id                # {"entries":1,"total":110}, unbound

env CODEX_HOME="$R09_DIR/codex-no-id" "$USAGE_TOOL" codex session \
  --json --offline --no-cost --speed standard --config "$R09_DIR/config.json" \
  --id 00000000-0000-4000-8000-000000000099
# exit 1; no stdout JSON. Capture failure explicitly if running under set -e.
```

R09の処置は、同一IDの通常再読取りを置換更新として受入れ、未知のreset・親欠損・ID欠損を完全な数値にしないことである。上記`pending`／`unavailable`は必要な運用判定であり、このfixture試験で自律エージェントが実際に割当停止したことまで実証したものではない。
