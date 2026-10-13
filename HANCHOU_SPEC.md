# Hanchou v3 specification

Hanchouは既存Orca環境へ任意で追加する、provider-neutralなOrchestrator policy skillです。
独立runtimeではなく、Orca上の1 coordinator pane、1 Codex/Claude session、
`hanchou-orchestrator`、そのpaneにbindされた1 Runから成ります。

## Invariants

1. 1つのOrca runtime上でHanchou sessionを任意個数動かせる。
2. 1 coordinator paneが同時に所有するcurrent Runは1つ。1 Runのactive coordinatorも
   同時に1つ。元の対話を復元できない場合の後任・takeoverは継続設計の対象外。
3. 各Taskのowner Runは1つ。workerの実行repositoryとは別の概念である。
4. Hanchouが所有するruntime永続状態、process、port、registry、launcherはない。
   任意のignore済み改善メモと最小限の公開receiptは利用者のlocal文書である。
5. Orca-managed stateはpublic CLIと公式skill contractだけで操作する。
6. Hanchouは名前付きskill呼び出し、明示的な依頼、または専用workspace local
   instructionでだけactivateする。利用者向けpromptは名前付き呼び出しを標準とする。
7. 通常のOrca session、既存project、agent/model既定値、Automationには介入しない。

## Ownership

| Responsibility | Owner |
| --- | --- |
| project/workspace/worktree/terminal/agent lifecycle | Orca + `orca-cli` |
| Run/Task/Dispatch/message/gate/worker lifecycle | Orca + `orchestration` |
| schedule/timezone/history/rerun | Orca Automations |
| VM/cloud/per-workspace environment | `orca-per-workspace-env` |
| task decomposition/routing/review/reporting policy | `hanchou-orchestrator` |
| local improvement capture | `hanchou-orchestrator` reference |
| explicit improvement-intent routing | optional `hanchou-kaizen` |
| requested sanitized issue publication and verified cleanup | optional `hanchou-publish-issues` |
| requested scoped skill updates | optional `hanchou-update` + official installer |
| scheduled-job configuration and management policy | optional `hanchou-cron` + Orca Automations |
| requested static project responsibility setup | optional `hanchou-init` |

HanchouはCodexまたはClaudeで動作し、具体的なprovider/modelはユーザーpolicyと
実行時にOrcaが提供する選択肢へ従います。

配布は1つのcoreと5つの任意helperから成り、production codeは含みません。
新規installはCodex/Claude Codeへのglobal配置を標準とし、local配置も選択できます。
helperだけの呼び出しはorchestratorをactivateせず、Runやworkerを作りません。
`hanchou-cron`の設定操作も同様です。独立した定期業務の明示的な手動試行や
スケジュール実行では、指定されたジョブのためにTemporary Hanchouを起動できます。
元の対話とRunを対象とする継続点検は別の用途であり、公開wake契約の確認前に
fresh sessionで代用しません。PJの静的ジョブ定義は業務内容を示す文書で、
schedule・timezone・有効状態・履歴はOrca Automationsが所有します。
Project責任方針の任意の既定sourceは対象project rootの`.hanchou/policy.md`です。
明示された別sourceも選べます。対象projectを特定してから読み、選択済みsourceが
欠けたら停止して報告します。既定sourceがない場合は通常の明示依頼を続けます。
実行権限は現在の依頼と方針の条件で判断し、方針だけでTaskやscheduleを作りません。
workerのTaskには有効な方針をsnapshotとして伝えます。

## Session contract

activate時に実行中binaryを解決し、`orca-cli`と`orchestration --full`の
version-matched guideを読み、runtimeの公開Orchestration contractを確認します。
旧版がfeature disabledを明示した場合は、その版の手動Settings案内で停止します。
初回起動時に既存bindingがなければRunを1つ作り、その対話の全依頼をTaskとして
同じRunへ入れます。復元後は元の対話・Runが所有する依頼、Task、worker、CI、権限を
照合します。同一projectというだけで他Runを引き継ぎません。

通常はcoordinatorからleaf workerへ直接委譲します。複雑な案件だけTask spec内で
mission-lead相当の責務を与えます。独立reviewが必要なら後続Taskにします。
worker lifecycleとcompletion authorityは公式orchestration preambleに従います。
