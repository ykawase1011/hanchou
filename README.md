# Hanchou v2

Hanchouは、班長が依頼・結果報告・使用量監督を担当し、Herdr内の側近（sokkin）が
作業・worker選択・検証・統合を担当するAgent Skillsです。班長のホストにOrcaは必須ではありません。

新しい側近を起動するたびに、同梱の`launch-sokkin.sh`が新規branchとGit worktreeを作り、
専用Herdr workspaceの最初のタブへ設定されたCodexまたはClaude Codeを起動します。
元checkoutのbranch・index・人間の変更は保全します。

## 導入と使い方

[導入手順](docs/INSTALLATION.md)に従い、次の4スキルを用意します。

- `hanchou-orchestrator`: 薄い班長。依頼、成果の受入、使用量監督。
- `hanchou-sokkin`: 実行担当。分解、worker・model選択、検証、統合。
- `hanchou-init`: 対象projectの設定と人間向け方針を初期化。
- `hanchou-update`: 導入済みHanchouだけを明示的に更新。

対象repositoryで`$hanchou-init`を呼び、`.hanchou/config.json`と
`.hanchou/policy.md`を準備します。最小の起動設定は次の形です。

```json
{"version":2,"sokkin":{"agent":"codex","model":null}}
```

`agent`は`codex`または`claude`、`model: null`は公式CLIの設定済み既定値です。
`sokkin.effort`には任意で`low`・`medium`・`high`を指定できます。省略時はCLI既定値なので、
定型作業の費用を抑えるにはmodelと併せて設定し、起動後の実際値を確認します。
Claude Codeは本人の許可済みサブスク認証だけを使います。

Codexへの依頼例:

```text
$hanchou-orchestrator を使って、このrepositoryの対象機能を修正してください。
完了条件は既存テストの成功です。変更のcommitまでを許可します。
予算・並列数・再試行上限を確認し、側近の受領と使用量の計測準備が整ってから作業してください。
```

Claude Codeでは`/hanchou-orchestrator`を使います。依頼時に目的・完了条件・権限・予算を
具体化します。導入や設定だけでは実作業を始めません。

班長は起動結果の接続先とnative thread/session IDを照合し、使用量を計測できることを
確認してから実作業を渡します。欠測を0として扱わず、計測不能・上限到達時は新規割当を止めます。
完了は成果・検証・未解決事項・使用量で確認し、Herdrの待機表示だけで判断しません。

## 対応範囲

単発の起動シェル以外に独自runtime、daemon、DB、scheduler、dashboardは追加しません。
定期実行、改善メモ収集・公開、Orca Run管理、旧状況ビューはv2の配布対象外です。
既存の設定・成果・実行中資源は自動削除しません。[移行手順](docs/MIGRATION.md)を参照してください。

スクリプトの試験と実機受入は別です。利用前に[検証状況](docs/VALIDATION.md)を確認してください。
未検証のproviderや計測経路を自律実行に使いません。

[仕様](HANCHOU_SPEC.md) / [設計と判断の経緯](docs/HANCHOU_V2_DESIGN.md)

開発時の確認: `make check`
