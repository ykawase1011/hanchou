# v2 検証状況

検証日: 2026-10-20。旧版の検査結果はv2の合格根拠に流用しない。
本書は実施済みの根拠と残件を分ける。設計上の出荷条件は[設計書](HANCHOU_V2_DESIGN.md)のR01–R15。

## 配布と起動スクリプト

- 配布対象は4スキルと単発のBash起動スクリプト。旧cron、kaizen、issue公開helper、status-view、Orca用参照、旧テストを削除。
- `make check`: 構造、リンク、shell構文、実Gitとmock Herdrによる起動試験、Bash 3.2回帰試験。ネットワーク・認証・実agentを必要としない。
- 起動試験は新規branch/worktree、元checkoutのstaged/unstaged/untracked保全、設定override、異常値、cwd/provider不一致、途中失敗時の資源保全を検査する。mock成功はHerdr実機成功とは別。
- 39回帰ケースはClaude既定modelの空配列、不正JSON時の単一failure receipt、false model、不正scalar設定、両providerのeffort引数、caller/paneでのAPI・不明認証の拒否を検査する。caller拒否では資源未作成、pane拒否では資源と識別情報を保持してagent未起動となる。
- `skills@1.7.4`を一時Git projectで実行。Codex/Claude Code向けに4スキルだけを選択し、全ファイルの一致、launcher実行権限、references/assetsの保持、導入先での`--help`を確認。global/userインストールは変更しない。[正確な導入コマンド](INSTALLATION.md)。

### 初期化時のツール導入確認

`hanchou-init`に導入状況・PATH・版・管理元の確認と、不足時に導入方法を
ユーザーが選んでからインストールする手順を追加した。既存の互換導入と明示済みの
選択は再利用し、server・agent・scheduleは初期化だけで起動しない。
これはスキル指示の変更であり、全OS・全導入分岐の実機受入ではない。

macOS 26.4.1 arm64では、Homebrew metadataを更新後にHerdr 0.9.5と
ccusage 20.0.37のbottleを導入した。ccusageはMach-O arm64で、
Nodeを含まないPATHでも既存Codex子threadを集計できた。nativeの
input 78,595（cache 71,168込み）+ output 294 = **78,889 tokens**と一致し、
先に導入したnpm版との内訳も一致した。
エージェントのいない専用named sessionをbrew版Herdrで起動し直し、
pane内のbrew実行path、CodexのChatGPT認証、同じ使用量、通知設定の適用を確認した。
今回作成した直接導入のbinary・npm prefix・symlinkのみ削除し、既存session dataと
共有設定を保持した。新規推論・班長・側近・worker・旧cronは起動していない。

## 使用量

### 班長の準備費用（Issue #63）

2026-10-20の初期化済み新タブ試験では、Sol / mediumの班長が側近への実作業送信前に
311,370 tokensへ到達し、外側から停止した。内訳は非cache入力44,251、
cache read265,344、出力1,775。注入済みスキルの再読と、開発文書・CLIガイドの
全文読取りが重なり、7つの使用量増分で入力が約2.1万から5.6万tokensへ増えた。
側近は更新案内で起動未確定となり、任務完遂の測定ではない。
前回674,422とは初期化の有無と停止点が異なるため削減率を算出しない。

この観測から、起動時の参照を絞り、固定情報の再利用と変動状態の再確認を区別した。
班長の自己計測を準備段階へ移し、cache込みの入力と残り往復を含む予算判断を追加した。
開発用配置・権限・native identity/usageの必須確認は維持する。
スキル指示の変更と静的検査だけでは、消費削減・予算停止の実機受入とは扱わない。
追跡先は[#63](https://github.com/ykawase1011/hanchou/issues/63)。

2026-10-21（JST）、PR #64を導入し、同じSol / medium・依頼内容・班長30万／側近20万
の目安で新タブを1回試験した。結果保存先と版は変更し、前回同様に外側へ有限の
30万tokens停止observerを置いた。注入済みSKILLと開発文書の再読はなく、
自己ID/使用量を早期に帰属した。残りの起動・受領・検証・解放が予算に収まらないと
判断し、launcher未実行のまま自律停止した。外側のinterruptは発火しなかった。

最終応答後のnative累積とccusageは**278,879 tokens**で一致
（非cache入力35,975、cache read238,848、出力4,056、reasoning459は出力の内数）。
班長の報告にある138,859は途中の観測値であり最終値ではない。
実作業・成果生成は未達であり、停止点の違う前回との効率改善率や完遂率は算出しない。
元会話の使用量は含まず、weekly枠にも換算しない。

残る読取りでは、nativeの`session_meta`全体に埋め込まれた指示文の再入力が見つかった。
これを避けるidentityフィールドの選択例と、資源未作成で停止した後は既存証跡を一度に
保存し追加調査を続けない指示を補った。抽出例は実ログで必要フィールドと指示本文の
除外を確認したが、この追補後の新規LLM試験は行っていない。
CLIガイド・承認往復と報告費用の削減、同条件での完遂評価は#63に残す。

### 計測基盤と従来の比較

`ccusage@20.0.37`の限定受入、再現手順、native子の範囲、resume/fork/compactionの検証差分は[使用量検証](USAGE_TOOL_VALIDATION.md)に記録。
既存実ログの完了thread、fork、子thread、Claude子込みsession、重複・途中書込みを確認した。新規resume/reset/compactionの全経路を実機保証するものではない。

旧main `9e2e4f9`の班長`SKILL.md`は10,590 bytes、v2は4,424 bytes。
常時読む入口の文量は約58%減ったが、実token消費や週次枠の削減率ではない。
今回のホストは班長自身のsession別使用量を帰属できず、実機数値は側近以下の小計である。
同じ仕事のv1/v2全階層比較は未測定で、実コスト改善の定量的保証は行わない。

## Herdr実機

macOS arm64、Herdr 0.9.5、Codex 0.162.1、Claude Code 2.1.299。
専用のnamed local serverと一時Git repositoryを使用。Hanchou/OrcaのworkerやRunを使わず、公開Herdr CLIで操作した。Orcaアプリ自体は停止していない。

| 確認 | 観測した結果 |
| --- | --- |
| Codex起動 | launcherの新規worktreeが最初のpaneのcwdと一致。初回の起動未確定を同じpaneで調査し、更新案内をskipして再照合。別の側近へ無条件に再送しない |
| Claude起動 | callerと実paneのauth statusがfirst-party Claude Max。初回trust画面を確認後、同じpaneで続行。API fallbackを使わない |
| Codex bootstrap | exact cwdとbootstrap markerからnative threadを一意に特定。要求model `gpt-6.1-sol`とnative観測値が一致。effortは既定のhighだったためoptional effort指定を追加 |
| Codex usage | native input 19,061（cache 13,056込み）、output 18、total **19,079**。ccusage noncached input 6,005 + cache 13,056 + output 18で一致 |
| Claude bootstrap | exact cwdとmarkerからnative sessionを一意に特定。`haiku`の実modelは`claude-haiku-5-5` |
| Claude usage | input 2 + cache creation 22,384 + cache read 26,558 + output 28 = **48,972**。ccusage sessionと一致 |
| 明示effort | 別の新規worktreeで`--effort low`を指定。実プロセスのCodex設定引数とCLI表示のSol lowが一致 |

いずれもnative IDは今回Herdrの`agent_session`に現れず、固有cwd・起動時刻・bootstrap marker・native metadataを照合した。Herdr integrationをユーザー環境へ自動導入していない。

### 小さな成果の回収と解放

Codexは`smoke.txt`、Claudeは`claude-smoke.txt`を作成し、指定した内容と改行を検証して専用branchにcommitした。supervisor側からcommit内容・変更対象・clean状態を再確認した。Codexのcommitは`8ae27f515029ef809ae91531c0b6245fe765fd2a`、Claudeは`b7cc8bd2287878495cdc0612c0414970d31c7b35`（いずれも一時fixture内）。

人間役の元checkoutにはstaged・unstaged・untrackedを用意し、Codex実行中にも追記した。両試験後とcleanup後のdiff/index/statusは、その並行変更後の期待値と一致し、main HEADも維持した。共有Git metadataへのcommit書込みはCodex sandboxの個別承認を要した。許可済みの当該commitだけを承認し、sandboxを無効化しなかった。

最終報告後のCodex合計は**210,214 tokens**。200,000のcheckpoint予算を**10,214超過**した。途中観測157,742の後に最終応答等が加わったためであり、厳密な予算停止の合格ではない。直近の入力全量・cache・残りtool turn数から報告予備枠を見積もる指示を追加した。修正後の境界停止試験は次節に記録する。Claudeは**256,975 tokens**で350,000以内だった。

Claudeは単に指示ファイルを「読む」という依頼を役割の起動とは解釈しなかった。引渡しを「このmissionのsokkinとして、その指示に従う」と明示する手順へ修正した。修正後は次節の両providerで役割受領を確認した。

成果をGit bundleとファイルに保全してからCLIを終了し、Herdrのprocess-infoと元PIDの消滅で停止を確認した。Claudeに付随したMCPプロセスも終了した。所有する4つの試験workspaceを閉鎖し、cleanな3つの新規worktreeを通常の`git worktree remove`で削除した。最初の一時fixtureと成果bundleは保持し、試験専用serverの終了も確認した。ユーザーの実projectや共有serverは停止・削除していない。

### 起動環境の差

試験環境のshell wrapperはClaudeへremote-controlとpermission関連の引数を追加していた。launcher自身の指定ではない。実プロセスの引数をbootstrapで確認する手順を明記し、paneの認証確認も実起動と同じshellのcommand解決を使うよう修正した。同じshellからの`claude auth status --json`はClaude Max／first-partyであることを確認済み。ユーザーのshell設定は変更していない。全てのwrapperや追加課金設定をこの1件で保証するものではない。

### OrcaへアクセスできないHerdr環境での再確認

別のnamed server `hanchou-v2-gates`を使用し、Orca環境変数を除去した。
macOS sandboxでOrcaの実行、データディレクトリ、Unix socket、localhost宛通信を拒否し、
Orca CLI実行とsocket接続が`Operation not permitted`になることを確認した。
この制限をHerdr serverと子プロセスへ継承し、viewerは開かなかった。
Orcaアプリを物理的に終了した試験ではなく、試験対象から利用不能にした非依存性の試験である。
Herdrのtoast deliveryはoff、soundはfalse、shellは個人のaliasを読まないBashに固定した。
ユーザーの通常server・shell設定は変更していない。

| 確認 | 結果 |
| --- | --- |
| 欠測時停止 | Codex側近はnative IDと計測が未確定のbootstrapでblockを返し、worker・ファイル作業を開始しなかった |
| 予算到達時停止 | 読取りtoolと個別承認を含むbootstrapは見積60,000に対し99,608となった。実測を渡して延長を認めない依頼に対し、worker起動を拒否。拒否応答後は120,508。超過分を隠さず合算した |
| 起動時の往復削減 | 上記を受け、検証済みmetadataと固定した指示本文を一度渡すtool-free acknowledgmentへ変更。Claude Code 2.1.304／haiku lowは役割を受領し、実作業を止めて待機。tool callは0 |
| Claude計測 | session `cf026c7b-e2d4-4e63-b73b-9d019038e8af`。input 2 + cache creation 22,395 + cache read 28,058 + output 251 = **50,706**。重複native行を除いた値とccusageが一致。実modelは`claude-haiku-5-5` |
| 実worker選択 | Codex側近がroutine writeを理由に`gpt-6.1-sol`／lowを選び、1 workerだけ起動。native metadataでも同じmodel/effortと親子関係を確認 |
| 実成果 | workerが`worker-result.txt`を作成。側近は内容`hanchou-v2-worker\n`を独立に検査し、workerの誤った17-byte報告を18 bytesへ訂正。元checkoutへ変更せず専用worktreeに成果を残した |
| 親子会計と予備枠 | 上限を明示的に700,000、最終検証・報告予備枠150,000へ設定して実作業を許可。最終応答後の親582,523 + 子78,889 = **661,412**。各native累積値とccusageが一致し、コピーされた親履歴を加算していない |
| retry上限 | 別の境界probeで上限850,000を明示し、検証失敗を仮定してretry／worker置換を要求。retry limit 0を維持した側近は両方拒否。該当turnにtool call・新規worker・成果変更はなかった。probe後の親615,362 + 子78,889 = **694,251** |
| 通知・報告経路 | viewerなしで実行、判断要求と最終結果をHerdrのpublic readから班長が回収。通常worker出力をOrcaへ転送する処理はない。Herdr側のtoast/sound無効化を確認。全OS・mobile・個別provider hookの設定を横断して検証したものではない |

親threadは`01a1575b-0b45-7a23-8571-97518cc27c7a`、
子threadは`01a15760-32cd-7a13-8c02-6ef582f70fe1`。
子のnative累積値はinput 78,595（cache 71,168込み）+ output 294 = 78,889。
Claudeの実プロセス引数は`--model haiku --effort low`で、先の個人shell wrapperが追加した
remote-control／permission引数はない。

外側のmacOS sandboxによりCodex内側のsandbox初期化が失敗し、許可済みの読取り・
fixture書込みには個別承認が必要だった。外側のOrca拒否は維持した。この承認往復を含む
token数は通常環境の効率比較ではなく、会計と停止判断の証拠として扱う。
retry probeは失敗を仮定した境界入力であり、実障害からの自動復旧を保証するものではない。

成果ファイルを試験用resultsへコピーして一致を確認後、元の試験worktreeから回収した。
両CLIとClaudeの付随MCPプロセスの終了を確認し、所有する2 workspaceと2 worktreeを
通常の削除で解放、専用serverのexit 0を確認した。元fixtureのdiff/index/statusは、
先の人間役による並行変更を含む期待値と再び一致した。

### native側近の競合統合と並行編集

別の一時repositoryとOrca拒否環境のnamed serverで、Claude Code 2.1.304／
Haiku 5.5 low／Maxを起動した。attempt `6289d8f52048f7a1`、
native session `43ac6ce9-e2b0-4aaf-b2fc-e7d46a0352d0`。
launcherの新規worktree内で側近がincoming branchをmergeし、実際に`UU`と
index stages 1/2/3の競合状態になった地点でいったん止めた。
その時点で元checkoutの保全を確認したうえで、人間役が追記と新規untrackedファイルを追加した。

続行した側近は指定した2行へ競合を解決し、merge commit
`ba11420fdb23aff0fcca42bdee5c4877d6ed687b`を専用branchへ作成した。
両親commit、期待する38 bytes、clean状態を独立に検証した。人間側のbranch・HEAD・index、
staged/unstaged/untrackedと並行編集、incoming branch、無関係な共有tagは保持され、
動いたrefは専用branchだけだった。実Git/mock試験でのdirtyな失敗checkoutを残した
新規置換の確認と合わせ、R03/R04の受入根拠とする。

usageはbootstrap **50,810** → 競合地点 **157,364** → 最終 **269,695**で、
各地点のnative値とccusageが一致した。最終内訳はinput 10、cache creation 27,636、
cache read 239,510、output 2,539。500,000枠（報告予備枠150,000）以内で、
5 request・2 Bash tool・追加workerなし・retryなしだった。

側近の「46 bytes」という報告は誤りだったため、報告だけで合格にせず実ファイルで訂正した。
明示したinline指示の役割受領と実行を検証したもので、スキルの自動発見は検証していない。
成果bundleの完全性を確認し、CLIと付随MCPの全記録PIDの終了、workspace閉鎖、
clean worktree削除、専用serverのexit 0とsocket消滅、元checkoutの再照合まで完了した。

### 旧運用の撤去

旧Automation `d03aafa6-530c-47a2-8d75-e7a46ed3b8df`はdisabledであることを再確認。
10端末は起動occurrence 92および116–124のPTY IDと一致し、全出力は認証要求または
bootstrap失敗のみだった。対応する進行中のRun・worker・子workspaceはなかった。
旧checkoutはstaged/unstaged/untracked/ignored差分がなく、HEADはmainの祖先で
固有commitもなかった。所有・履歴・Git状態・各操作receiptを旧workspace外へ保全した。

公開Orca CLIでこの10端末だけを閉じ、全件`ptyKilled:true`を確認した。
停止済みAutomationを削除し、cleanな`hanchou-issue-work`をforceなしで削除した。
旧workspace・process一覧・物理path・Git worktree登録・対応するmerge済みlocal branchが
なくなったことを再照合した。他projectのAutomationや現在の作業workspaceは変更していない。
これは旧運用の終了・回収であり、Orca自体の設定不一致や認証起動の不具合修正ではない。
導入済み旧スキルの置換とGitHub Issueの処置は次節に記録する。

## 必須要件との対応と公開移行

固定した版・検証環境における技術受入を次の根拠で確認した。任意のprovider/model、
実障害・並列競合・OS通知設定の全組合せを保証するものではない。

| 要件 | 主な根拠 |
| --- | --- |
| R01 薄い構成 | 配布4スキル、唯一の単発shell、構造検査 |
| R02 Orca非依存 | Orca CLI・socket等へのアクセスを拒否した子プロセスで起動・実行・回収・会計・解放 |
| R03 新規worktree/branch | 両providerの実起動、実Git/mockの異常系・置換・設定試験 |
| R04 人間の作業場所の保全 | native競合地点・並行編集後・統合後・cleanup後の照合、共有ref確認 |
| R05 専用workspace | receiptのworkspace/最初のpaneと実cwd/providerの照合 |
| R06 Herdr内の実行 | viewerなしで側近とnative workerが実行、Orca Run/workerなし |
| R07 設定 | provider/model/effortの設定・override試験と実プロセス/native観測 |
| R08 session識別 | 両providerの固有cwd/marker/ID、実Codex親子関係と別計上 |
| R09 欠測・重複 | native照合、確定prefix、重複・fork/compaction試料、resume/reset/欠損offline試験。不明経路はunavailable |
| R10 使用量による割当制御 | native欠測・超過時拒否、実workerの予備枠付き会計、retry 0境界拒否 |
| R11 自律選択 | 側近がroutine workにSol lowを選択し理由と実modelを照合 |
| R12 サブスク限定 | caller/実pane Max認証、実argv、API/不明認証拒否の6回帰ケース |
| R13 成果による受入 | ファイル・merge commit・検証・使用量を独立照合。誤ったbyte報告を訂正 |
| R14 報告集約 | 制御したquiet sessionで重要結果を班長が回収。Orcaへのworker通知転送なし。採用環境の別設定は要照合 |
| R15 保全と解放 | bundle/ファイル保全後に所有PID終了・workspace閉鎖・通常worktree削除を実確認 |

公開移行も以下まで完了した。新仕様だけで旧障害を修正済みにしない。

- [PR #59](https://github.com/ykawase1011/hanchou/pull/59)をマージし、公開main `f19c958`から`skills@1.7.4`で4スキルをCodex/Claude Codeの既存global scopeへ導入した。内容・link・launcher権限を照合し、旧2スキルの実体・link・lock entryを除去した。無関係な登録情報は保持。
- 旧dashboard、公開済みreceipt、削除したAutomationの定義の7ファイルを保全先へ退避し、空のcron directoryを削除。元projectの`policy.md`と改善メモはhash一致で保持し、権限を勝手に書き換えていない。
- [#13](https://github.com/ykawase1011/hanchou/issues/13)、[#39](https://github.com/ykawase1011/hanchou/issues/39)、[#41](https://github.com/ykawase1011/hanchou/issues/41)、[#44](https://github.com/ykawase1011/hanchou/issues/44)を旧機能・運用終了の`not planned`でclose。
- [#40](https://github.com/ykawase1011/hanchou/issues/40)は対象をv2のR03/R04へ明示的に変更し、上記受入を根拠に`completed`でclose。旧Orca全経路の受入とは扱わない。
- [#10](https://github.com/ykawase1011/hanchou/issues/10)と[#22](https://github.com/ykawase1011/hanchou/issues/22)は採用環境の通知・報告品質の確認としてOPENを維持し、旧Orca更新待ちラベルを解除。制御した試験環境の成功を全OS/mobileへ一般化しない。

導入されたファイルと現在の会話への採用は別である。この実装作業では班長スキルを
起動せず、次の明示的な起動でv2を採用する。既存projectの独自方針は初期化・移行時に
確認し、設定が不足する状態で側近を自動起動しない。

週次枠のsession別正確な配賦、providerが強制する厳密なtoken cap、全ホスト共通の自動復帰、24時間TTL解放は設計で保証しない項目であり、上記未実施検証とは区別する。
