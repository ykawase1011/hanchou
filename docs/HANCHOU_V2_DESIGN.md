# Hanchou v2 設計書

状態: 採用済み設計。2026-11-04 の明示承認で通常運用と外部 debug を分離し、
Claude native receive を限定 capability として追加した。以前の自己計測・usage 必須
ゲートは本改訂で置き換える。過去の実測は [検証状況](VALIDATION.md) に履歴として保全する。

## 1. 責務と境界

班長は明示された仕事を側近へ依頼し、委任された判断と独立受入、人間への結果報告を担う。
Herdr 内の側近は作業・worker 選択・検証・統合を担う。小さい仕事は側近自身が完了する。
worker は割り当てられた範囲を実行する。全員から自己計測、予算会計、usage 報告を外す。
使用量調査・比較は外部 observer の仕事であり、通常の準備・割当・finish・accept と分離する。

Hanchou は4スキルと単発の2 shell のみ。`launch-sokkin.sh` は Git・Herdr・公式 CLI による
fresh branch/worktree と専用 workspace の作成・検証、起動 receipt、所有 instance の単発
inspect/finish/accept/resume/reap を扱う。mission 実行、常駐受信、再試行ループは実装しない。
`measure-session.sh` は認定済み既存 usage tool と1 native session を厳密に照合する読取り専用
外部 debug helper。観測用一時ファイルは終了時に消し、agent 起動・送信・予算判断・設定変更・
削除・永続集計を持たない。今回その parser・対応版・scope 保証を緩めない。

runtime、daemon、DB、scheduler、汎用 launcher、独自 dashboard、private inbox/DB bridge、
恒久 watcher、copied CLI catalog は追加しない。公式 Herdr と agent 自身の仕組みを再利用する。
Orca はホストの一例で、製品依存ではない。旧 cron・改善公開・status-view・Orca Run・必須
handoff は復活しない。機能撤去を理由に既存の設定・履歴・資源を削除しない。

## 2. 受入要件

| ID | 必須要件 | 判定 |
| --- | --- | --- |
| R01 | 4スキルと単発2 shell | 独自常駐サービスを追加しない |
| R02 | provider-neutral / Orca 非依存 | 依頼・実行・結果回収・保全が特定親ホストを必須としない |
| R03 | 新しい側近ごとに fresh branch/worktree | 実 path、branch、固定 base、共通 Git directory を検証してから起動 |
| R04 | 人間 checkout/index と並行変更の保全 | branch 切替、reset、stash、変更移送・復元をしない |
| R05 | 側近ごとの専用 Herdr workspace | 最初の tab に側近、別依頼と共用しない |
| R06 | 側近以下は Herdr 管理 | viewer と実行を分離し、Orca worker を製品前提にしない |
| R07 | 固定 project 設定と実効設定 | Codex/Claude、model/effort、言語を設定し、要求と観測を区別 |
| R08 | 実行 identity | mission/attempt/request、native ID、process incarnation と親子対応を照合 |
| R09 | debug completeness と task success を分離 | 欠測を0にしない。usage 欠落は有効な結果を拒否する理由にしない |
| R10 | 明示制約を守る | stop/budget・並列・再試行上限を尊重。通常の自己会計は持たず、未実装の厳密上限制御を約束しない |
| R11 | 権限内の worker/model 選択 | 難度、副作用、必要品質、検証結果に応じて側近が選ぶ |
| R12 | Claude subscription only | 公式 CLI と本人の許可済み認証。API/extra-usage fallback や資格情報抽出なし |
| R13 | 完了と独立受入 | identity・権限・成果・検証参照・未解決事項・保全を確認。idle/notice だけで成功にしない |
| R14 | 人間への報告を班長へ集約 | 通常の細かな進捗通知を抑え、完了・判断・継続不能を伝える |
| R15 | 保全して解放 | agent/server/workspace/worktree の停止・削除を区別し所有と実停止を確認 |
| R16 | 人間向け Herdr 表示 | 新側近ごとに対象 viewer を確認して残す。明示 headless 例外以外は表示不能時に割当を保留 |

worktree は filesystem sandbox ではない。厳密なアクセス制限が必要なら既存 sandbox を使う。
明示権限はホスト/provider の本人必須 gate や拒否を回避する根拠ではない。

## 3. 設定・起動・依頼

固定対象 project の `.hanchou/config.json` と `policy.md`、存在する `readiness.md` を使う。
実行 cwd から別設定を探したり ignored 設定をコピーしない。JSON を shell code として読まない。
既存設定を保持し、明示した一時 override は今回だけ。設定なし/不正/未対応は起動前に止め、
provider fallback はしない。新規 template は Codex Astra/medium、既存の値/null/省略を優先する。

```json
{"version":2,"sokkin":{"agent":"codex","model":"gpt-6-astra","effort":"medium"},
 "languages":{"human":"ja","agents":"en"}}
```

`model` の null/省略は CLI 既定、`effort` は low/medium/high/null。
言語は相手別に独立し、null/省略はその相手の従来言語を維持。他方から継承しない。
明示した依頼言語が優先し、policy・成果物・native UI・ID の翻訳を意味しない。
値の検証は [launch contract](../skills/hanchou-orchestrator/references/launch.md#communication-languages)。
通常設定に receive の既定や予算台帳を追加しない。native receive は呼出しごとの明示 capability。

launcher は対象・host・固定 base を確認し、元の HEAD/branch/diff/index/status を観測する。
fresh branch/worktree を作成して共通 Git directory と実 path/HEAD を検証し、専用 named
Herdr server と workspace/初期 pane を作る。Bash 3.2、Git、jq と既存 CLI だけで動作する。
所有 server は durable instance directory を cwd とし、呼出し tool と別 process group を確認する。
`--session NAME` は既存 shared server の互換経路で、所有や自動停止権限を与えない。

version 2 receipt は既存の config/worktree/herdr/sokkin/lifecycle/resources に
`identityReadiness`、`requestId`、`receive` を追加する。`usageReadiness: not_required` は互換欄。
owned launch は完全 receipt と Git blob hash を保存し、`--compact-receipt` はその参照を残す。
欠落・衝突・symlink・保存失敗では成功に昇格させない。STARTING/UNKNOWN の救済昇格はなく、
同じ試行を保全して診断し、必要なら別の新規試行を判断する。

Codex は既存 `--no-daemon` を維持。0.162.1/0.163.0 の `--qualify-startup` は対応 TUI で native
identity/context を得るため固定 tool-free turn を一回送る。ccusage/counter/usage は使わない。
そのためだけに側近 skill 全文を重複投入せず、実 mission で一度渡す。元の cwd/time/marker、
一意 native ID、model/effort、完了、process PID/birth/argv の照合を維持する。
0.163.0 の明示 `--manual-approvals` は workspace-write/on-request/user を native 値でも確認する。
それ以外の版は既存通常 launch と認定済み公開 identity 操作を使い、未検証を合格と呼ばない。

班長は viewer を現在の会話を移動せず background で開き、対象 host/session/workspace と
tab label を確認する。Orca では `Herdr | <短い任務名>`。同じ側近では再利用し、接続不能を
agent failure と混同しない。表示不能時は理由と接続先を示し、明示 headless 例外以外は割当を待つ。

一つの依頼に mission/attempt/request、native/process/cwd/base、目的・基準・権限・人間必須条件、
固定指示、言語、有限 worker/retry 制限と成果の durable 保存先を入れる。受領は最初の作業/質問へ
統合し、自己計測だけの ACK は不要。自分が送った async tool command の receipt 待ちは必須。
子の完了を周期確認することと混同しない。timeout で安易に再送しない。

## 4. Claude native receive

[限定 route](../skills/hanchou-orchestrator/references/native-receive.md) は同一 machine の独立
Claude root 同士に限る。baseline は Claude Code 2.1.317 / Herdr 0.9.5 / subscription / manual。
両端の SendMessage/notify_when_idle と inbound が対応することを公式 tool/native evidence で確認する。
任意の Codex/Orca 親を Claude peer とみなさない。ホスト不対応なら既存の有期限 Herdr wait/read を使い、
model-free wake を約束しない。hold/refuse・user-only 通知・設定不明は適合完了ではない。

`--claude-peer PATH` は既存の親の current native/Herdr/process/peer と公開 capability 証拠を指定する。
launcher は親の fresh evidence と公開 pane/process を起動前後に照合し、子に fresh UUID/name を付ける。
既成の変更しない SessionStart integration が報告した native ID/cwd と実 process を照合するため、
最初の model ACK は要らない。hook の exit 0 や指定 UUID だけでは足りない。
明示 `--claude-settings PATH` は許可された process-local overlay のみ。hook install/trust bypass はしない。

起動 receipt の `peer_binding_required` は意図的な境界であり、両端の native effective settings と
公式 ListAgents の現在 child ref を対応付けてから送信する。SendMessage + notify_when_idle を一回送り、
receipt を確認して親 turn を終える。native notice が親を再開する。常駐 watcher は作らない。
受信は task success ではなく独立受入のきっかけ。古い idle、重複、hold/refuse、exit、期限切れ、
同一 UUID の process/peer 再起動を成功へ流用しない。質問への peer answer は native approval ではない。

## 5. 承認権限

worker→側近→班長→人間の順に未解決判断を上げる。すでに委任された具体的な操作は直属の親が
exact pending native request/tool ID、native/process/対象/効果と権限を照合して、公開 control で一度回答する。
画面が出たことだけでは人間へ再確認しない。人間への escalation は新しい権限、重大な未決選択、
明示した都度確認、本人操作が必要な provider gate。禁止は拒否し、別 agent/location へ回避しない。
一括許可、yolo、sandbox 緩和、資格情報 export はしない。native automatic review は別の明示設定で、
その拒否は親への自動承認委任ではない。reviewer usage 欠測も権限を変えない。

## 6. 完了・互換性・解放

[Lifecycle schema](../skills/hanchou-orchestrator/references/lifecycle.md) を正本とする。
新規 instance は `resultContract:2`。finish は matching mission/attempt/request/native、succeeded、
artifact/verification 参照と権限を要求する。native receive では親子 peer/process も保持・再確認する。
FINISHED は報告保存のみ。親は成果・検証・権限・元 checkout 保全を独立に確認し、所有 CLI/worker の
実停止後に accept。accept は report hash、native/request、独立判断、保全と quiet 所有 inventory を確認する。
usage 欠落だけで正しく識別され承認・検証・保全された成果を拒否しない。notice だけでも受入しない。
重複 accept を拒否。生存中の未受入 FINISHED に限る resume は新 requestId を返し旧結果を無効化する。

古い record/report/usage は破壊的移行しない。旧 accepted evidence は hash と inventory を保ったまま
通常 reap できる。未受入の旧 report は新たな独立 acceptance を添えられるが native ID 未確定を usage
から推測して補わない。任意の旧 usage fields は保全するだけで正しい計測として再認定しない。

reap は明示 invocation/受入 checkpoint で一度だけ。FINISHED から 86,400 秒以上、accepted、証拠 hash・
server PID/birth/socket・idle shell inventory が不変で live work がない場合だけ owned server を停止する。
stop receipt だけでなく process/socket と shell の終了を確認する。未知・busy・変更は保持。自動 timer なし。
履歴・record・branch/worktree は reap で削除しない。削除は別の保全判断。retained server の下で worktree を
消すなら accept 前に verified idle shell を durable cwd へ移し、受入後 inventory を変更しない。

## 7. 外部 debug と残る決定

[外部 debug](../skills/hanchou-orchestrator/references/usage.md) は任意。native identity/format/scope を
strict に照合し、cache・reasoning の内数、親子/再開/重複、未記録範囲を区別する。欠測を0にしない。
比較は同じ model/effort/policy/品質/境界で、準備・失敗・受入・全 context を含め、debug 費用を別欄にする。
応答数の削減だけで 1.2–1.3倍を約束せず、旧算術 probe を通常任務の比率へ一般化しない。

[Codex の別設計](CODEX_NATIVE_RECEIVE_DESIGN.md) は owned app-server での queue 実証と、
`queue --no-daemon` 拒否、TUI exit 後も server/thread が生存した境界を受ける。完全な server/thread/TUI
所有、socket 承認、exact trust、startup identity、stop/cleanup と parent host wake が必要。
新 runtime/control bridge が必要なら明示 scope decision として保留し、本変更へ潜り込ませない。
