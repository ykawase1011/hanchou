# v2 検証状況

検証日: 2026-10-20。旧版の検査結果はv2の合格根拠に流用しない。
本書は実施済みの根拠と残件を分ける。設計上の出荷条件は[設計書](HANCHOU_V2_DESIGN.md)のR01–R15。

## 配布と起動スクリプト

- 配布対象は4スキルと単発のBash起動スクリプト。旧cron、kaizen、issue公開helper、status-view、Orca用参照、旧テストを削除。
- `make check`: 構造、リンク、shell構文、実Gitとmock Herdrによる起動試験、Bash 3.2回帰試験。ネットワーク・認証・実agentを必要としない。
- 起動試験は新規branch/worktree、元checkoutのstaged/unstaged/untracked保全、設定override、異常値、cwd/provider不一致、途中失敗時の資源保全を検査する。mock成功はHerdr実機成功とは別。
- 回帰試験はClaude既定modelの空配列、不正JSON時の単一failure receipt、false model、不正scalar設定、両providerのeffort引数を検査する。
- `skills@1.7.4`を一時Git projectで実行。Codex/Claude Code向けに4スキルだけを選択し、全ファイルの一致、launcher実行権限、references/assetsの保持、導入先での`--help`を確認。global/userインストールは変更しない。[正確な導入コマンド](INSTALLATION.md)。

## 使用量

`ccusage@20.0.37`の限定受入、再現手順、native子の範囲、resume/fork/compactionの検証差分は[使用量検証](USAGE_TOOL_VALIDATION.md)に記録。
既存実ログの完了thread、fork、子thread、Claude子込みsession、重複・途中書込みを確認した。新規resume/reset/compactionの全経路を実機保証するものではない。

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
導入済み旧スキルの置換とGitHub Issueの処置は別途残る。

## 残る受入

次を完了するまで、v2全体の出荷判定は未完了。

- native側近によるより広い成果統合・共有ref保全。実Gitとmock Herdrのfixtureでは、起動結果の専用worktreeで競合merge・解決を行い、並行変更後の人間側branch・HEAD・index・ファイルと無関係な共有tagが各操作後も保持されることを確認した。dirtyな失敗checkoutを保持した新規置換も確認した。これはlauncherと明示したGit操作の試験であり、native側近自身による統合行動の実証ではない。
- worker/model選択、欠測・予算・retry境界、役割受領と予備枠は上記範囲で確認済み。任意のprovider/model組合せ・実障害・並列競合に対する網羅保証はない。
- 通知は上記の制御した環境で確認済み。利用者のCLI/OS/remote-control等に別の通知設定があれば採用時に照合する。
- 旧Issueの処置、旧運用の所有・停止状態、公開参照先の確定。新仕様だけで旧障害を修正済みにしない。

[#39](https://github.com/ykawase1011/hanchou/issues/39)と[#41](https://github.com/ykawase1011/hanchou/issues/41)の旧運用は上記のとおり終了・回収した。公開された移行内容と対応づけて`not planned`で整理できる。上流障害を解決済みとする根拠にはしない。

週次枠のsession別正確な配賦、providerが強制する厳密なtoken cap、全ホスト共通の自動復帰、24時間TTL解放は設計で保証しない項目であり、上記未実施検証とは区別する。
