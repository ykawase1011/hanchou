# Hanchou v2

Hanchouは、班長が依頼・結果報告・使用量監督を担当し、Herdr内の側近（sokkin）が
作業・worker選択・検証・統合を担当するAgent Skillsです。班長のホストにOrcaは必須ではありません。

新しい側近を起動するたびに、同梱の`launch-sokkin.sh`が新規branchとGit worktreeを作り、
依頼専用Herdr serverとworkspaceを用意し、最初のタブへ設定されたCodexまたはClaude Codeを起動します。
元checkoutのbranch・index・人間の変更は保全します。
班長は側近を起動するたびに、そのHerdrセッションを人間が確認できるタブを開き、
対象workspaceの表示を確認してから実作業を渡します。同じ側近への追加指示では既存タブを使います。
表示できない場合は理由と接続先を報告し、明示的な画面なし実行の指定がなければ割当を待ちます。
タブは完了後も残し、閉じても実行中の側近は停止しません。
検証済みCodex版では、同梱の`measure-session.sh`がnative sessionと既存usage toolを
単発で照合します。計測値と予算判断を分け、未確定の処理を0には扱いません。

## 導入と使い方

[導入手順](docs/INSTALLATION.md)に従い、次の4スキルを用意します。

- `hanchou-orchestrator`: 薄い班長。依頼、成果の受入、使用量監督。
- `hanchou-sokkin`: 実行担当。分解、worker・model選択、検証、統合。
- `hanchou-init`: 対象projectの設定・方針とツール導入状況を確認。不足分は導入方法を選んでからインストール。
- `hanchou-update`: 導入済みHanchouだけを明示的に更新。

対象repositoryで`$hanchou-init`を呼び、`.hanchou/config.json`と
`.hanchou/policy.md`を準備します。新規設定で指定がなければ、側近はCodexの
Astra／mediumです。[コピー用設定テンプレート](skills/hanchou-init/assets/config-template.json):

```json
{"version":2,"sokkin":{"agent":"codex","model":"gpt-6-astra","effort":"medium"}}
```

`agent`は`codex`または`claude`、`model: null`は公式CLIの設定済み既定値です。
`sokkin.effort`には任意で`low`・`medium`・`high`を指定できます。省略時はCLI既定値なので、
modelと併せて設定し、起動後の実際値を確認します。既存設定と明示指定を優先し、
再初期化でテンプレートへ上書きしません。定型の小作業にはSol／low等も選べます。
Claude Codeは本人の許可済みサブスク認証だけを使います。

班長は目的・完了条件・権限・予算を整理し、解き方は側近に委ねます。
側近の判断品質を確保し、workerはSolなど承認済み候補から必要な品質を満たす
低消費のモデルを選びます。側近と同じモデルを一律に使いません。
最適化の対象は全階層の総使用量・完遂率・手戻りです。Astra既定による削減率は未測定です。

Codexへの依頼例:

```text
$hanchou-orchestrator を使って、このrepositoryの対象機能を修正してください。
完了条件は既存テストの成功です。変更のcommitまでを許可します。
予算・並列数・再試行上限を確認し、側近の受領と使用量の計測準備が整ってから作業してください。
```

Claude Codeでは`/hanchou-orchestrator`を使います。依頼時に目的・完了条件・権限・予算を
具体化します。導入や設定だけでは実作業を始めません。

班長は起動結果の接続先とnative thread/session IDを照合し、使用量を計測できることを
確認してから実作業を渡します。予算は実測から見直す目安とし、固定予算内の完遂は必須にしません。
超過見込み・異常な消費・欠測は、実測と残量見積り、実行状態、次の判断を人間向け会話へ知らせます。
欠測を0として扱わず、計測不能やユーザーが明示した停止上限では新規割当を止めます。
会話への注意表示とOS/mobileへの通知到達は区別し、未検証の非同期到達は保証しません。
完了は成果・検証・未解決事項・使用量で確認し、Herdrの待機表示だけで判断しません。

班長は専用serverの終了も管理します。側近が`.hanchou/instances`へ完了時刻を記録し、
班長が成果・最終使用量・プロセス終了を確認します。完了から1日以上経過したものは、
班長が次に記録を確認したときに実体と停止条件を再確認して閉じます。常駐タイマーはありません。
明示的に既存共有sessionを選んだ場合は、そのserverを自動停止しません。
詳しくは[ライフサイクル手順](skills/hanchou-orchestrator/references/lifecycle.md)を参照してください。

## 対応範囲

単発の起動・ライフサイクル操作と計測シェル以外に独自runtime、daemon、DB、scheduler、dashboardは追加しません。
定期実行、改善メモ収集・公開、Orca Run管理、旧状況ビューはv2の配布対象外です。
既存の設定・成果・実行中資源は自動削除しません。[移行手順](docs/MIGRATION.md)を参照してください。

スクリプトの試験と実機受入は別です。利用前に[検証状況](docs/VALIDATION.md)を確認してください。
未検証のproviderや計測経路を自律実行に使いません。

[仕様](HANCHOU_SPEC.md) / [設計と判断の経緯](docs/HANCHOU_V2_DESIGN.md)

開発時の確認: `make check`

lifecycle テストは実プロセス情報と一時的な Unix socket を使います。
sandbox がこれらを拒否する場合は、ホストの承認手順で対象のテストコマンドだけを
実行してください。権限不足をテスト成功や製品の assertion 失敗として扱わず、
sandbox 全体の無効化やテストの省略で回避しません。
