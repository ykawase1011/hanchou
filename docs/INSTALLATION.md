# 導入

Git、Bash、jq、Herdr、利用する公式Codex／Claude Code CLIを用意します。
必要な版・起動オプションは同梱スクリプトと導入したCLIのhelpで確認してください。
OrcaやOrcaのorchestrationスキルはv2製品の前提ではありません。
Claude Codeは許可済みサブスク認証を確認し、API・追加課金経路へ切り替えません。

Agent Skills対応ホストへ以下の4ディレクトリを、ホストの導入方法に従って配置します。
スキル内のscripts・references・assetsも含めて保持してください。

```text
skills/hanchou-orchestrator/
skills/hanchou-sokkin/
skills/hanchou-init/
skills/hanchou-update/
```

導入先、scope、link／copy、既存のlocal変更を確認します。以前のinstaller操作の成功を
v2の導入確認として流用しません。v2の4スキル選択・同梱シェルの保持を含む正確な
installerコマンドは未検証です。利用するinstallerの現在のhelpを確認してから実行してください。

対象projectで`$hanchou-init`（Claude Codeでは`/hanchou-init`）を明示的に呼びます。
設定例:

```json
{
  "version": 2,
  "sokkin": { "agent": "codex", "model": null }
}
```

`.hanchou/config.json`は機械向け起動値、`.hanchou/policy.md`は人間向け責務・権限です。
設定元は対象project rootに固定します。Git管理外の設定を新worktreeへ無断コピーせず、
認証情報を設定・依頼・報告に書きません。共有・Git管理は明示的に選択します。

導入・設定だけでは起動しません。[README](../README.md)の明示的な依頼から開始します。
実作業の前に[検証状況](VALIDATION.md)を確認し、native ID・使用量・Claude認証の
未確認項目が残る経路で自律実行を開始しません。

更新は`hanchou-update`へ明示的に依頼し、導入済みsubset・scope・local変更を保全します。
新しい内容の採用は次の明示的な起動で確認します。現在の会話を自動終了する契約はありません。
削除は導入に使った仕組みで対象スキルだけを指定し、projectの設定や成果は別に保全します。
