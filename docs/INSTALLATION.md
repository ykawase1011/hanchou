# 導入

Git、Bash、jq、Herdr、ccusage、利用する公式Codex／Claude Code CLIを用意します。
必要な版・起動オプションは同梱スクリプトと導入したCLIのhelpで確認してください。
OrcaやOrcaのorchestrationスキルはv2製品の前提ではありません。
Claude Codeは許可済みサブスク認証を確認し、API・追加課金経路へ切り替えません。

Agent Skills installerの`skills@1.7.4`で、v2 checkoutからCodexとClaude Codeへの
project-local導入を2026-10-20に確認しました。導入対象は次の4スキルです。

```text
skills/hanchou-orchestrator/
skills/hanchou-sokkin/
skills/hanchou-init/
skills/hanchou-update/
```

ローカルsourceからの確認済み手順です。`hanchou_source`にはv2を含むcheckoutの絶対pathを
指定します。以下の試験は一時Git project内だけで実施し、globalなスキルやユーザー設定を変更していません。

```bash
hanchou_source=/absolute/path/to/hanchou
install_project=$(mktemp -d)
git -C "$install_project" init -q
cd "$install_project"
npx --yes skills@1.7.4 --help
npx --yes skills@1.7.4 --version
npx --yes skills@1.7.4 add "$hanchou_source" \
  --agent codex claude-code \
  --skill hanchou-orchestrator hanchou-sokkin hanchou-init hanchou-update --yes
npx --yes skills@1.7.4 list --agent codex claude-code --json
```

実利用では`cd`先を導入対象projectへ変更します。`--global`を付けないこの手順では、
`.agents/skills/`へ4スキルの本体を配置し、`.claude/skills/`に4つのsymlinkを作成しました。
`skills-lock.json`もproject内へ作成されます。source checkoutへのsymlinkではなく、
配置された本体へのlinkです。導入済み全ファイルをsourceと比較し、内容一致と、
launcherの実行権限、`--help`の動作を確認しました。scripts、references、assetsを含み、
無関係なスキルは導入されていません。

公開mainのv2（`f19c958`、PR #59）からCodex／Claude Codeへのglobal導入も確認しました。
同じ公開sourceをproject-localへ導入するコマンドは次のとおりです。

```bash
npx --yes skills@1.7.4 add https://github.com/ykawase1011/hanchou \
  --agent codex claude-code \
  --skill hanchou-orchestrator hanchou-sokkin hanchou-init hanchou-update --yes
```

global導入では上記に`--global`を追加しました。4スキルの全ファイル、Claude側の
symlink、launcherの実行権限と`--help`を公開sourceと照合しました。
既存の5つの旧スキルは更新前に旧sourceとの一致を確認し、local変更がない状態で移行しました。
旧cron・publish-issuesの除去では、installer成功後も共有実体とlock entryが残ったため、
対象を再照合して保全先へ退避し、2 entryだけを除去しました。成功表示だけで除去完了と
判断せず、実体・link・登録情報と無関係なentryの保全を確認してください。

実際の導入先・scope・link／copy・既存のlocal変更を確認します。localとglobalの重複が
ある場合はagentが読む実体を確認し、既存のcustom copyを自動削除しません。
他版のinstallerはこの試験の対象外です。

対象projectで`$hanchou-init`（Claude Codeでは`/hanchou-init`）を明示的に呼びます。
初期化では実行先hostのツールの導入状況・版・PATH・管理元を確認します。
不足があれば、利用可能なHomebrewまたは公式の直接導入などから導入方法を選んでもらい、
選択後に不足分をproject外へ導入します。すでに明示された選択は聞き直しません。
既存の互換性のある導入は再利用し、古いpackage情報だけで版の提供有無を断定しません。
Homebrew版ccusageはnative binaryでNode不要、npm経由ではNode wrapperを使用します。
Herdr 0.9.5／ccusage 20.0.37は検証基準であり、導入方法や最低版の固定ではありません。
別版は必要なCLI契約・ログ集計の互換性を確認して採用します。
認証・Herdr内PATH・native使用量の未確認事項は準備待ちとして報告し、
初期化だけでserver・agent・service・旧cronを起動しません。

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
