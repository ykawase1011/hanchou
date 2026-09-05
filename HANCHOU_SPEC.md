# Hanchou v3 specification

Hanchouは既存Orca環境へ任意で追加する、provider-neutralなOrchestrator policy skillです。
独立runtimeではなく、Orca上の1 coordinator pane、1 Codex/Claude session、
`hanchou-orchestrator`、そのpaneにbindされた1 Runから成ります。

## Invariants

1. 1つのOrca runtime上でHanchou sessionを任意個数動かせる。
2. 1 coordinator paneが同時に所有するcurrent Runは1つ。Run takeoverは明示的な
   recoveryだけに使う。
3. 各Taskのowner Runは1つ。workerの実行repositoryとは別の概念である。
4. Hanchouが所有する永続状態、process、port、registry、launcherはない。
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

HanchouはCodexまたはClaudeで動作し、具体的なprovider/modelはユーザーpolicyと
実行時にOrcaが提供する選択肢へ従います。

## Session contract

activate時に実行中binaryを解決し、`orca-cli`と`orchestration --full`の
version-matched guideを読み、runtimeの公開Orchestration contractを確認します。
旧版がfeature disabledを明示した場合は、その版の手動Settings案内で停止します。
既存bindingがなければRunを1つ作り、そのsessionの全依頼をTaskとして同じRunへ入れます。
explicit recoveryを除き既存Runを奪いません。

通常はcoordinatorからleaf workerへ直接委譲します。複雑な案件だけTask spec内で
mission-lead相当の責務を与えます。独立reviewが必要なら後続Taskにします。
worker lifecycleとcompletion authorityは公式orchestration preambleに従います。
