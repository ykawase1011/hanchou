# Hanchou

> Hanchou provides optional, opinionated skills for Orca. Install them globally
> for Codex and Claude Code and start as many project or cross-project
> Hanchou sessions as needed, without changing ordinary Orca behavior.

Hanchou v3はruntimeやdaemonではありません。Orca上のCodexまたはClaude sessionへ、
依頼の分解、worker選択、review、model routing、最終報告のpolicyを追加する
標準Agent Skillです。Run、Task、Dispatch、terminal、worktree、message、Automationは
すべてOrcaが所有します。

## Install

Orcaを先に導入し、公式のcore skillを準備します。Orca Skills UIを使っても構いません。
以下のglobal installは、Node projectの外のdirectoryで実行してください。
project内ではnpmがそのprojectの`devEngines`を検査し、Node versionの不一致で
`EBADDEVENGINES`になることがあります。

```bash
npx skills add https://github.com/stablyai/orca \
  --skill orca-cli orchestration --agent codex claude-code --global
```

HanchouはCodexとClaude Codeの両方へglobal installするのが標準です。
coreと2つの任意helperを明示して入れます。

```bash
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-publish-issues hanchou-update \
  --agent codex claude-code --global
```

`--agent codex claude-code`で両providerを明示します。installerが表示する実際の
保存先とlinkを確認してください。global installだけではHanchouは起動しません。

`Installation method`では、通常のCodex／Claude Code向けglobal installは
**Symlink (Recommended)**を選びます。installerが配置する共通のskill本体を
各agentからlinkで参照するため、更新をまとめて管理できます。
link先はinstall済みの共通本体で、repository checkoutではありません。
upstreamの変更が自動取得されるわけではなく、更新操作は別途必要です。
agentごとの独立したcopyが必要な環境では**Copy to all agents**を選びます
（commandに`--copy`を追加しても指定できます）。

project限定のlocal installも選べます。同じcommandを対象projectのrootで実行し、
`--global`を外します。coreだけ必要なら`--skill hanchou-orchestrator`に絞れます。

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
skills/hanchou-orchestrator/   core orchestratorとlocal改善メモの記録
skills/hanchou-publish-issues/ 任意helper: 改善メモの秘匿化・Issue起票・成功部分の除去
skills/hanchou-update/         任意helper: 既存Hanchou skillだけをscope維持で更新
examples/project/             Project Hanchouの例
examples/cross-project/       専用workspaceの例
docs/                         architecture、導入、運用、移行、検証
```

Hanchou用production CLI、Node runtime、DB、scheduler、Dashboard、serviceはありません。
install/update/removeはAgent Skills installerまたはOrca Skills UIに任せます。

更新はCodexで`$hanchou-update`、Claude Codeで`/hanchou-update`を使います。
改善メモの記録は外部公開を伴いません。公開したいときだけ
`$hanchou-publish-issues`または`/hanchou-publish-issues`で対象メモを指定します。
helperはそれだけでRunやworkerを作りません。具体例と失敗時の扱いは
[Improvement workflow](docs/IMPROVEMENTS.md)を参照してください。

初回利用は[Onboarding](docs/ONBOARDING.md)、詳しい導入は
[Installation](docs/INSTALLATION.md)、prompt例と運用は[Usage](docs/USAGE.md)を
参照してください。設計は[Architecture](docs/ARCHITECTURE.md)、旧版からの移行は
[v2 migration](docs/MIGRATION_V2_TO_V3.md)にあります。helperの検証は
[maintenance validation](docs/MAINTENANCE_VALIDATION.md)、v3移行時の記録は
[v3 migration report](docs/V3_MIGRATION_REPORT.md)と
[acceptance matrix](docs/ACCEPTANCE_MATRIX.md)に記録しています。
