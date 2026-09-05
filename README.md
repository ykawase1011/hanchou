# Hanchou

> Hanchou is an optional, opinionated orchestrator skill for Orca. Install it
> into an existing Orca workspace and start as many project or cross-project
> Hanchou sessions as needed, without changing ordinary Orca behavior.

Hanchou v3はruntimeやdaemonではありません。Orca上のCodexまたはClaude sessionへ、
依頼の分解、worker選択、review、model routing、最終報告のpolicyを追加する
標準Agent Skillです。Run、Task、Dispatch、terminal、worktree、message、Automationは
すべてOrcaが所有します。

## Install

Orcaを先に導入し、公式のcore skillを準備します。Orca Skills UIを使っても構いません。

```bash
npx skills add https://github.com/stablyai/orca \
  --skill orca-cli orchestration --agent universal claude-code --global
```

対象projectまたは専用workspaceでHanchouだけをlocal installします。

```bash
cd /path/to/project
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator --agent universal claude-code --local
```

`--agent universal claude-code`は標準`.agents/skills`配置に加え、Claude Code用の
provider aliasも作ります。実行中agentの自動検出だけに任せると、別providerへの
placementが省略されることがあります。

installはOrca本体、userData、既存session、default agent、Automation、
既存の`AGENTS.md`／`CLAUDE.md`を変更しません。現在のOrcaでは専用の
「オーケストレーション」設定ページからskill状態とworker depthを確認できます。
旧版がExperimental機能の有効化を明示的に要求した場合だけ、ユーザーがその版の
案内に従って手動で有効化します。

## Start

通常のOrca sessionでは何も変わりません。Hanchouを使うsessionだけ、最初のpromptで
skill名を明示します。Codexでは次のpromptを使います。

```text
$hanchou-orchestrator を使って、Project Hanchouとして開始してください。
対象はこのrepositoryです。必要な実作業はOrca Orchestrationでworkerへ委譲し、
必要なreview後に最終結果をまとめてください。
```

Claude Codeでは同じ本文をskill commandへ渡します。

```text
/hanchou-orchestrator Project Hanchouとして開始してください。対象はこのrepositoryです。
必要な実作業はOrca Orchestrationでworkerへ委譲し、必要なreview後に最終結果を
まとめてください。
```

自然文だけでもskill descriptionに一致すればactivateできますが、利用者向け資料では
選択結果が明確な名前付き呼び出しを標準にします。新しいpaneでは再度明示してください。

同じOrca runtimeで別paneを開けば、Project、Cross-project、Temporary Hanchouを
任意個数並行利用できます。各paneは独立したRunを1つだけbindし、各Taskのowner Runも
1つです。同じRunを複数coordinatorが通常運用で共有しません。

## Three uses

- **Project Hanchou**: 1つのproject/repositoryを主に扱います。
- **Cross-project Hanchou**: 専用folder workspaceから、登録済みの複数repositoryへ
  Orca経由でworkerをdispatchします。
- **Temporary Hanchou**: migration、release、比較調査などの期間だけ使います。

3種類とも同じ`hanchou-orchestrator` skillです。違うのは起動場所、最初のprompt、
必要ならlocalな静的policyだけです。

## Repository

```text
skills/hanchou-orchestrator/  配布する唯一のcore skill
examples/project/             Project Hanchouの例
examples/cross-project/       専用workspaceの例
docs/                         architecture、導入、運用、移行、検証
```

Hanchou用production CLI、Node runtime、DB、scheduler、Dashboard、serviceはありません。
install/update/removeはAgent Skills installerまたはOrca Skills UIに任せます。

初回利用は[Onboarding](docs/ONBOARDING.md)、詳しい導入は
[Installation](docs/INSTALLATION.md)、prompt例と運用は[Usage](docs/USAGE.md)を
参照してください。設計は[Architecture](docs/ARCHITECTURE.md)、旧版からの移行は
[v2 migration](docs/MIGRATION_V2_TO_V3.md)にあります。今回の実装・検証結果は
[v3 migration report](docs/V3_MIGRATION_REPORT.md)と
[acceptance matrix](docs/ACCEPTANCE_MATRIX.md)に記録しています。
