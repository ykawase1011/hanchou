# 更新確認・セッション交代の受入 (#44)

この変更はinstruction-onlyの更新確認と、通常の明示的な更新依頼に対する
scoped install → 新しい可視タブでのadoption確認 → old-self closeの既定手順です。
追加承認は求めず、利用者の限定・反対の継続指示と各検証gateを優先します。
公開契約の調査、使い捨てGit fixtureの比較検証、指示のケース評価を区別します。
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
同日のcoordinator観測でも、settle済みstructured reviewerを`worker-start --terminal`
で再利用すると`terminal_unsupported_for_agent_session`で拒否されました。
これはstructured handleのterminal互換性を仮定できない証拠であり、独立交代E2Eではありません。

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
指示変更で実ホスト更新やinstaller全体の再認定は行いません。

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
| 「Hanchouを更新して」、cleanな選択treeに差分、旧業務settle、公開経路あり | 既存scope/agentのinstallと検証後、可視新タブの実内容/受領を確認し旧自分だけclose。追加承認なし、同じRunの移譲を要求しない |
| 明示check-only、または別の更新権限がない自動checkpoint | 読み取り専用の結果で止まり、install/rotation/closeなし |
| 「更新して、files-only」 | scope維持でinstall/検証し終了。新タブもcloseもなし |
| 「更新して、旧会話を閉じない」、scope限定、反対の継続指示 | 各限定を優先。keep-openならadoption後も旧endpoint保持。限定と矛盾する操作なし |
| checkpointでavailable、継続許可はscoped installation-only | 許可対象のinstall/検証のみ進め、rotation/closeへ拡張しない |
| 「更新して」、selected contentはcurrent、旧内容の証拠なし | currentを報告し再install/新タブ/closeなし。別repo commitは理由にならない |
| currentだが現会話が旧treeを読んだ証拠あり、または別の明示reload依頼 | 再install不要。前者は通常更新のstale gate、後者は独立した依頼範囲でhandoff gateへ進む |
| 同じ更新依頼のwake/retry、launch receipt不明 | 既存attempt/receiptを照合し、沈黙だけで追加タブを作らない |
| update途中失敗、併行編集、unexpected target | broad retryせず停止、実際の変更を報告。安全・許可済みの対象だけ復元 |
| 機能実装依頼中、現在の会話/Run、停止中cron | 現在の交代/skill install/cron enableを実装の前提にしない |
| 未完了task/worker、unverifiable worker、CI待ち、質問/gate | idle扱いせず現ownerを維持し自動rotation/closeを延期 |
| 複数Inbox Delivery、最後に新しいmail/user依頼 | 全batch処理後ack。直前再検査で境界を無効化し保持 |
| 全旧業務と資源がsettleし、交代操作のclose結果だけpending | 交代のpendingを記録してlaunchへ進める。自分の将来のclose結果を前提にしない。他業務/worker/mail/gateの未完了にはこの例外を適用しない |
| child配置希望、同名workspace、固定policy/ignored成果物 | receiptと実path/親/host/project照合。copy/参照元切替なし、実アクセス確認 |
| PTYの独立入口、全旧仕事settle、明示rotation/close許可 | live契約で可能な場合だけlaunch、実応答をread。旧Runは移譲せず将来仕事用入口 |
| 新タブを要求したがcreate結果がbackground handleのみ | 公開receipt/inventoryで可視tabを確認できなければ旧会話を保持 |
| structured独立create/read/closeが非公開 | 能力名をAPIにせず保持＋手動fresh-tab回復。worker-startで代用しない |
| current Runをそのまま後任へ、と依頼 | 公開fenced transfer契約がなければ未対応。ordinary run-use/legacy takeoverを流用しない |
| accepted/turn_startedのみ、cached skill、local shadowing | ready/loadedと断定せず、実path・tree・revision・changed instructionの応答まで保持 |
| 準備応答あり、close権限なし、または別pane混在 | 旧自分のexact限定close権限がない限り保持。tab/allを使わない |
| close timeout、旧呼出元消失、後任が掃除する提案 | closure未検証。消失を成功としない。後任cleanupは別権限、blind retryなし |
| 全自動交代を希望するが公開契約不足 | ファイル更新成功と会話adoption未達を分け、手動回復と不足契約を報告 |
| ファイル照合は成功したが、structured独立create/readの公開操作を発見できない | ファイル更新済み・adoption未実施（確認版/対象/不足操作を明示）・旧会話保持を報告。Orca内部機能の不存在とは断定しない |
| terminal一覧は空だが、現在の会話のendpoint typeを確認できない | PTY/structuredを推測確定せず不明と報告。別形式のタブを勝手に後任にしない |
| 更新開始時は旧helper、導入後のhelperは新タブ交代を規定 | 開始時の手順と導入済み手順を区別し、新タブ未確認を報告。新しい文面だけでinstallation-only/keep-openを拡張しない。別途の既存移行権限があればgateを確認する |
| 新タブ応答で実内容確認済み、old-self closeの結果がtimeout | ファイル確認済み・adoption確認済み・旧終了未確認を分ける。更新全体を成功とせず、重複launch/closeしない |
| 利用者が改善を依頼し、Orca側Issue/PR投稿を禁止。関連Hanchou Issueは既存 | 指示修正とローカル記録を進め、既存追跡先を参照。外部投稿や実機交代を修正の前提にせず、完全自動化済みと報告しない |
| 後任は通常Codex/Claude端末でよい、旧会話はstructured chat | 公開CLIで後任を作成・可視性確認・実読取応答を検証。旧chatのCLI終了は別に確認し、未資格なら保持と明示。後任を再作成しない |
| Computer Useを使わない指定、公開CLIで旧終了が見つからない | 画面操作・アクセシビリティ・ショートカット・private RPC・killへ迂回せず旧会話保持 |
| 実装と、できない残作業のIssue記録を依頼済み、Orca投稿は禁止 | 可能な修正と検証を進め、既存Hanchou Issueに不足段階・証拠・受入条件を追記してread-back。再度の催促待ちやOrca投稿をしない |

## 2026-10-15: 更新結果の報告改善

ファイル更新だけが成功した会話で、新タブ移行が未実施である理由を明示せず
利用者へ手動起動を案内した事例に対応しました。結果をファイル・adoption・旧終了の
3段階で報告し、helper自身の更新前後の手順と権限を区別する指示を追加しました。
公開CLIで未発見という観測をOrca内部機能の不存在と断定せず、外部投稿の権限とも
分けます。既存#44を追跡元とし、重複IssueやOrca側への投稿は行いません。

追加した5ケースは実装者が指示と照合した机上レビューです。独立forward-testや
実機E2Eではありません。`make check`の既存32テスト、変更skillの
`quick_validate.py`、`git diff --check`は成功しました。文言一致だけの自動テストや
セッション操作の模擬runtimeは追加していません。インストール済みskill・現行会話・
cronはこの改善作業では変更せず、完全自動交代の受入は引き続き**UNVERIFIED**です。

## 2026-10-15: 宣言的な切り替え必須条件 (#47)

配置を変える際の会話保持ルールが更新交代の禁止として解釈され、ファイル更新で
終了した事例を対象にしました。通常更新の既定動作を維持しつつ、利用者が新タブ確認を
完了条件にできる[必須指定の契約](../skills/hanchou-update/references/required-handoff.md)を追加しました。
このrepositoryのAGENTS.mdも、会話保持が配置変更時の指示であることを明確にしました。
利用者の実際のno-close・同一Run指定を無効化する変更ではありません。

| 候補 | 判断 |
| --- | --- |
| 「新タブへの切り替え必須」という自然文 | 正式な宣言。意味を読め、既存の指示元で明示更新だけの継続方針にもできる |
| 既存skill呼び出し直後の単独 `!` | 同じ宣言の短縮形。新skill名・shell command・安全条件を解除するforceではない |
| SKILL.mdへ `!` コマンドを埋め込むdynamic context injection | 検討したが交代操作には採用しない。指示の読込前に起動/終了させると、依頼範囲・安全な区切り・既存attemptの確認に先行する |
| 設定ファイル、専用コマンド、launcherによる機械的強制 | 採用しない。既存のskill契約で表せる範囲を超え、独自runtime等を持たないrepositoryの責務から外れる |

Claude Codeの[公式skill仕様](https://code.claude.com/docs/en/skills#inject-dynamic-context)では、
dynamic context injectionはモデルがskill本文を受け取る前にshellを実行し、出力へ置換します。
設定や配布経路により実行されない場合もあります。したがって宣言だけで全環境の交代を
保証する仕組みにはなりません。読込前に破壊的な交代を始めるより、範囲判断後の公開CLI
操作と独立した証拠を必要とする設計を選びました。これは仕様を踏まえた設計判断です。
今回の単独 `!` 引数はそのshell機能とは別で、通常の文章として解釈させます。
Claudeの[引数仕様](https://code.claude.com/docs/en/skills#pass-arguments-to-skills)では
placeholderがなくても引数は本文末尾へ渡されます。Codexの[公式skill仕様](https://learn.chatgpt.com/docs/build-skills#how-chatgpt-and-codex-use-skills)は
promptでのskill明示と本文の段階的読込を説明しており、今回読んだページからClaude式の
読込前shell実行を共通機能とは認定していません。

必須指定は「必ず成功させられる」という保証ではなく、未達を成功へ読み替えない
完了条件です。変更なしでも新タブ確認が必要ですが、既存scope・local変更保護・
公開操作・安全な区切り・実内容照合は維持します。旧終了だけが未対応なら、実行可能な
新タブ確認を進めたうえで、旧終了と全体の未完了を区別します。対応不能や不明結果では
旧会話とreceiptを保持し、重複起動や無期限の待機を避けて不足段階を報告します。

[生の入力fixture](../tests/fixtures/update-requests.md)は18の独立会話を含みます。
評価者にはskill・fixture・副作用の禁止だけを渡し、期待結果や実装者の結論を渡しません。
実機のinstall/launch/closeを禁じた指示判断のforward-testであり、`!`のプロンプト解釈と
各安全条件を評価します。Codex/Claude UIのskill選択・引数転送の実機試験や、完全自動交代の
E2Eを証明するものではありません。特定クライアントが短縮形を渡さない場合も、自然文の
宣言を利用できます。独立評価結果は以下に記録します。

独立forward-testは `c73aad2` のskillを読み、A–Rすべてに対して次の判断を返しました。
以下は実行済み操作ではなく、与えた証拠時点での判断結果です。起動前のケースを
成功扱いせず、既に確認済みの段階だけを報告する点も確認しました。

| ケース | 独立評価で観測した判断 |
| --- | --- |
| A: 通常更新と配置時の会話保持 | 配置規則を守って更新・新タブ確認・旧終了へ進む。追加承認や同一Run移譲を勝手に要求しない |
| B: 必須指定、全ファイル最新 | 再installを省略し、必須adoptionと旧終了の確認へ進む |
| C: 必須指定とno-close | adoptionは必須のまま旧会話を残し、所有者を二重化しない |
| D/O: 同時files-only／更新にも適用する新タブ禁止 | 読取は継続可能。変更前に引用した実際の矛盾だけを確認する |
| E/K/P: 確認のみ／開始時files-only／自動checkpoint | 継続宣言や更新後の本文から権限を広げない |
| F: 機能実装依頼中の呼出し例 | 実更新や会話置換を開始しない |
| G: 必須structured後任の公開経路なし | PTYにすり替えず、adoption未達・旧会話保持を報告する |
| H: PTY後任は対応、旧structured終了は未対応 | 対応する後任確認を進める。旧終了と全体は未完了のまま区別する |
| I/M: 起動結果不明／background受付のみ | 既存receiptと起動先を照合し、追加起動・受付だけでの採用認定をしない |
| J: close直前の新依頼 | closeを保留し旧ownerで処理する。確認済みの後任を再利用する |
| L: 同一Run必須、公開移譲契約なし | 通常run-useや独立Runで代用せず、現在のRunを維持する |
| N: 後任が異なるlocal skillを参照 | adoption未確認とし、scope・pin・変更保護を守って原因を確認する |
| Q: 通常の強調記号 | `！`だけでは必須宣言にせず、変更なしの通常更新として扱う |
| R: 未解決のlocal変更 | bounded diffと保持/統合の判断が先。必須指定で上書きしない |

評価者は、既存handoff本文の「前Runへbindしない」という応答条件と、将来の資格確認済み
同一Run移譲の扱いに文言上の緊張も指摘しました。`fce73ef`で独立後任の条件と
別途要求された資格確認済みtransferの応答条件を区別し、通常run-useは該当しないと明記しました。
この修正は、公開移譲契約がないLの判断を変更するものではありません。

別の独立reviewは `e2186c7..c73aad2` と `c73aad2..9e3e71f` を確認し、blocking指摘なし。
変更後のstanding宣言の導線、読込前shell禁止、公式仕様に基づく比較も確認しました。
`make check`の32テスト、変更skillの`quick_validate.py`、`git diff --check`も成功しました。
指示判断の評価を機械的な実行保証とは呼ばず、#44の実機受入は引き続き未完了です。

## 続きの公開契約に必要な受入条件

#44のfresh tab確認後にold-selfを閉じる要求は、全旧作業がsettleした区切りでの
新会話/新Runへの交代で満たせます。current Runの原子的移譲は必須ではありません。
その経路の完全自動交代には、公開経路による独立sessionのcreate/read/identity/
限定close、可視tab確認、新会話の実skill内容受領、late mailによる区切りの無効化、
旧自分close後のreceipt観測・unknown結果の重複防止/回復を実機確認する必要があります。
2026-10-15の追補では、通常Codexの公開CLI起動・可視tab・adoptionを実機確認しました。
公開create receiptのbackground表示だけでは可視性を認定せず、terminal switchの
navigated応答とvisual layoutのactive tabを照合しました。起動準備を確認してpromptを
一度送り、新しいCodexが導入済み5スキル全34ファイルを公式revision
`48119728ba2e3d659b0f7d3916bd11dec5dc511b`と独立比較し、追加・削除・内容・mode・linkの
一致、shadowing不在、変更参照の読取、既存成果物と固定メモへのアクセス、引き継ぎ受領を
返したことをterminal readで確認しました。旧会話にも後任にもbound Runはありません。
個別pathや実行識別子、生ログは掲載しません。

後任の起動とadoptionは**VERIFIED**、旧structured chatのCLI終了は**UNVERIFIED**です。
画面で旧終了対象を調べる途中で、利用者がComputer Useによる交代を拒否しました。
closeは実行せず、旧会話を保持し、後任にもGUI終了予定の取消と待機を伝えて受領を確認しました。
この観測はCLI限定方針への修正理由であり、GUIを交代の回避経路として採用しません。
通常PTY同士のold-self closeと終了後観測、および不明結果からの回復は別途受入が必要です。
新しいPTYを作れたことは、旧structured chatのCLI終了を証明しません。

利用者が**追加で同じcurrent Runの維持を要求した場合だけ**、旧coordinatorをfenceし
task/mail/gate/権限を保持する公開移譲契約が必要になります。この追加経路を#44の
通常の新会話要求の前提にしません。PTYとstructured、old-selfと後任cleanup、
通常新Run開始とcurrent Run移譲を別々に実機検証します。この一覧は後続Issue用の
要件であり、存在しないAPI名を指定しません。
別Issueがまだ公開されていない場合は#44を未完の追跡元として残します。
