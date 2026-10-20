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

最終報告後のCodex合計は**210,214 tokens**。200,000のcheckpoint予算を**10,214超過**した。途中観測157,742の後に最終応答等が加わったためであり、厳密な予算停止の合格ではない。直近の入力全量・cache・残りtool turn数から報告予備枠を見積もる指示を追加した。この修正後の境界停止試験は未実施。Claudeは**256,975 tokens**で350,000以内だったが、worker選択や欠測時停止を試してはいない。

Claudeは単に指示ファイルを「読む」という依頼を役割の起動とは解釈しなかった。引渡しを「このmissionのsokkinとして、その指示に従う」と明示する手順へ修正した。役割起動の修正後の行動試験も残る。

成果をGit bundleとファイルに保全してからCLIを終了し、Herdrのprocess-infoと元PIDの消滅で停止を確認した。Claudeに付随したMCPプロセスも終了した。所有する4つの試験workspaceを閉鎖し、cleanな3つの新規worktreeを通常の`git worktree remove`で削除した。最初の一時fixtureと成果bundleは保持し、試験専用serverの終了も確認した。ユーザーの実projectや共有serverは停止・削除していない。

### 起動環境の差

試験環境のshell wrapperはClaudeへremote-controlとpermission関連の引数を追加していた。launcher自身の指定ではない。実プロセスの引数をbootstrapで確認する手順を明記し、paneの認証確認も実起動と同じshellのcommand解決を使うよう修正した。同じshellからの`claude auth status --json`はClaude Max／first-partyであることを確認済み。ユーザーのshell設定は変更していない。全てのwrapperや追加課金設定をこの1件で保証するものではない。

## 残る受入

次を完了するまで、v2全体の出荷判定は未完了。

- より広い成果統合・共有ref保全。今回の成果は専用branchの単一commitで、競合mergeや他者のbranch操作は試していない。
- 側近のworker/model選択、予算到達・欠測・retry上限で新規割当が止まる行動試験と、上記の役割起動・予備枠修正の再確認。
- Orca APIやCLIを利用できない実行環境での一巡。viewerなしの継続と、通知経路の確認。
- 人間への通常進捗通知の抑制と、完了・判断要求が届くこと。CLI/OS/remote-control等の既存設定も別に確認する。
- 旧Issueの処置、旧運用の所有・停止状態、公開参照先の確定。新仕様だけで旧障害を修正済みにしない。

旧運用の読取り監査では、対象Automationは現在disabled。ただし[#39](https://github.com/ykawase1011/hanchou/issues/39)のworkspace/path不一致は残り、[#41](https://github.com/ykawase1011/hanchou/issues/41)の旧workspaceには認証待ち9件を含む10端末が残っていた。v2配布物の削除とこれらの稼働資源の終了は別であり、この監査では変更していない。

週次枠のsession別正確な配賦、providerが強制する厳密なtoken cap、全ホスト共通の自動復帰、24時間TTL解放は設計で保証しない項目であり、上記未実施検証とは区別する。
