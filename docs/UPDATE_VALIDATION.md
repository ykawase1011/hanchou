# 更新確認・セッション交代の受入 (#44)

この変更はinstruction-onlyの更新確認と条件付き引き継ぎ手順です。公開契約の
調査、使い捨てGit fixtureの比較検証、指示のケース評価を区別します。
独立structured sessionへの自動交代・旧自分のclose・current Run移譲の実機E2Eは
**UNVERIFIED**です。#44を完全自動交代の完了として閉じません。
#39・#40・#41の既存未解決範囲も解決扱いにしません。

## 公開能力の調査範囲

2026-10-14、指定された `/Applications/Orca.app/Contents/Resources/bin/orca`
でruntime 1.4.224を確認しました。live `orca-cli`、`orchestration`、legacy
contract reference、CLI help、`agent-context --json`（schema 1、249 commands）を
読みました。private DB・source runtime・推測RPC・GUI操作は使っていません。
以下はこの版の公開CLI調査の結論であり、Orca全体の能力不存在の断定ではありません。

| 対象 | 公開契約で確認した下限 | 未資格・不足 |
| --- | --- | --- |
| 独立PTY | worktree/terminal作成、send、bounded read、exact terminal close | 本変更では新しいagentやcloseの実機試験なし。可視tabはcreateがbackgroundへfallbackする場合もあり、receipt検証が必要 |
| structured worker | worker-startは利用者設定に従う。worker-readとDispatchのsettlement/releaseを使用し、terminal verbsの互換性を仮定しない | worker成功は独立coordinator交代の証明ではない |
| 独立structured session | runtimeにはsession関連capability名がある | 公開schemaに独立create/read/closeの呼出契約を発見できず。能力名からRPCを生成しない |
| current Run移譲 | run-useはbinding、takeover-legacyはlegacy回復専用 | current Runの旧ownerをfenceしmail/tasks/gatesを移す原子的移譲契約が未資格 |
| fresh skill読み込み | インストール済み実path・全tree・revisionを新会話が読んだ応答を照合する条件 | accepted/turn_started/同じhashの復唱は証明にならない。providerの自動reload契約は未資格 |
| 旧自分のclose | PTYはexact handleを指定できる | 呼出元終了後の観測・structured旧自分のclose・失敗回復は未試験。後任cleanupをself-closeと呼ばない |

今回の実workerでは公開worker-showがstructured mode・new-child受領を示し、
同じworkspaceのterminal listは空でした。公開worktree showのpath・明示parent lineage・
host・projectを配置意図と照合しました。これは監督付きworkerの配置/識別の観測であり、
独立交代の試験ではありません。runtime/Task/Dispatch等の個別IDはここへ保存しません。

installerの参照元は[公式README](https://github.com/vercel-labs/skills)と
[公式CLI docs](https://skills.sh/docs/cli)です。既存の対象限定reinstall・backup・
exact revision照合を維持し、無指定updateや未知のfilterを追加していません。
今回、ホストの導入済みskill・session・cronは変更していません。

## 再現可能な検証と限界

`make check`は既存packaging/link検証に加え`tests/test_update.py`を実行します。
実際の使い捨てGit repositoryで、無関係commit/未導入helper変更と選択tree差分の区別、
reference追加/削除/変更/mode、固定pinと動いたtag、baseline欠落・skill削除、
ローカル編集の非破壊比較、scope別copy・shadowing・symlink target差分を検証します。
これらは比較primitiveの検証であり、更新helperの実行モデルやIPC/closeの模擬実装では
ありません。既存のinstaller隔離試験は`make check-installer`にありますが、今回の
チェックのみの追加で実ホスト更新やinstaller全体の再認定は行いません。

変更skillの`quick_validate.py`も実施します。これはfrontmatter等の検証です。
以下の受入ケースは指示のレビュー/forward-test用であり、通過した自動テストという
意味ではありません。独立reviewは実装者と別のcoordinator管理workerが担当します。

2026-10-14の実装検証: `make check`はstructure検証と32 Python testsを通過し、
変更した`hanchou-update`と`hanchou-orchestrator`は`uv run --with pyyaml python`
によるskill-creatorの`quick_validate.py`を通過しました。`git diff --check`も成功。
専用環境に依存を一時解決し、利用者の導入済みskillは変更していません。

## 指示の受入ケース

独立評価では期待結果列を見せず、選択したskillと生の入力・fixtureだけを渡し、
実際の判断/外部操作/保持状態を記録してください。live install/close/cron操作を禁じた
fixture評価と、別途許可された実機試験は分けます。

| 入力・状態 | 必須の判断/観測 |
| --- | --- |
| 通常Orcaで一般実装を依頼、helperだけの改善依頼 | Hanchou起動・自動check・Run作成なし |
| Hanchou初回activateと最初の依頼 | 同一checkpointでcheck一回。新たな別依頼なら一回 |
| 同じ依頼に追記、worker mail、retry、復元、wake | 成否を含む既存markerを再利用し再checkなし。明示recheckのみ例外 |
| optional helperなし、no-network/no-check指定 | 自動導入なし、制限を簡潔に報告して元の仕事を継続 |
| 通信timeout、unknown baseline、origin不明 | currentと誤認せずunknown。上書き/反復retryなし |
| README/未導入skillだけ変化 | 選択tree不変なら更新ありと通知しない |
| 固定commit/tag、追跡branch、移動tag | 固定pin維持、branchはexact commitへ解決、移動tagは判断保留 |
| local/global両方、異なるagent targets、copy/symlink | 別々に照合しshadowingを報告。subset/scope/target/method維持 |
| baselineから追加/削除/変更、custom fork/source symlink | modified/unknownとして保存し、選択と差分を示す。勝手な上書きなし |
| check-only、update済み権限、rotation済み権限 | 三種を区別。既に明示された範囲を再承認させず、不足する権限だけ確認 |
| update途中失敗、併行編集、unexpected target | broad retryせず停止、実際の変更を報告。安全・許可済みの対象だけ復元 |
| 機能実装依頼中、現在の会話/Run、停止中cron | 現在の交代/skill install/cron enableを実装の前提にしない |
| 未完了task/worker、unverifiable worker、CI待ち、質問/gate | idle扱いせず現ownerを維持し自動rotation/closeを延期 |
| 複数Inbox Delivery、最後に新しいmail/user依頼 | 全batch処理後ack。直前再検査で境界を無効化し保持 |
| child配置希望、同名workspace、固定policy/ignored成果物 | receiptと実path/親/host/project照合。copy/参照元切替なし、実アクセス確認 |
| PTYの独立入口、全旧仕事settle、明示rotation/close許可 | live契約で可能な場合だけlaunch、実応答をread。旧Runは移譲せず将来仕事用入口 |
| 新タブを要求したがcreate結果がbackground handleのみ | 公開receipt/inventoryで可視tabを確認できなければ旧会話を保持 |
| structured独立create/read/closeが非公開 | 能力名をAPIにせず保持＋手動fresh-tab回復。worker-startで代用しない |
| current Runをそのまま後任へ、と依頼 | 公開fenced transfer契約がなければ未対応。ordinary run-use/legacy takeoverを流用しない |
| accepted/turn_startedのみ、cached skill、local shadowing | ready/loadedと断定せず、実path・tree・revision・changed instructionの応答まで保持 |
| 準備応答あり、close権限なし、または別pane混在 | 旧自分のexact限定close権限がない限り保持。tab/allを使わない |
| close timeout、旧呼出元消失、後任が掃除する提案 | closure未検証。消失を成功としない。後任cleanupは別権限、blind retryなし |
| 全自動交代を希望するが公開契約不足 | ファイル更新成功と会話adoption未達を分け、手動回復と不足契約を報告 |

## 続きの公開契約に必要な受入条件

#44の完全自動交代を閉じるには、公開経路による独立structuredセッションの
create/read/identity/限定close、fresh installed skill実内容の受領確認、旧coordinatorを
fenceしてcurrent Runのtask/mail/gate/権限を保持する移譲、late mail競合の扱い、
旧自分close後のreceipt観測・unknown結果の重複防止/回復が必要です。
PTYとstructured、old-selfと後任cleanup、通常新Run開始とcurrent Run移譲を別々に
実機検証します。この一覧は後続Issue用の要件であり、存在しないAPI名を指定しません。
別Issueがまだ公開されていない場合は#44を未完の追跡元として残します。
