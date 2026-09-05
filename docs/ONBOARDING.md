# Hanchou onboarding

この手順は、既存のOrca projectで最初のProject Hanchouを開始するところまでを
説明します。Hanchou独自のruntimeやserviceは起動しません。

## 1. Orcaを確認する

Orcaを起動し、Settings → Orchestrationで公式skillのcoverageとworker depthを
確認します。現在の正式版にenable/disable controlがなければ、Experimental設定を
探す必要はありません。古いbuildが無効化を明示した場合だけ、そのbuildの案内に
従って手動で有効化してください。

## 2. 公式skillを準備する

まだ入っていない場合は、Orca公式の`orca-cli`と`orchestration`をglobal installします。

```bash
npx skills add https://github.com/stablyai/orca \
  --skill orca-cli orchestration --agent universal claude-code --global
```

## 3. Hanchouをprojectへ入れる

Hanchouは対象projectへlocal installするのが標準です。

```bash
cd /absolute/path/to/project
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator --agent universal claude-code --local
```

installerの結果で、標準の`.agents/skills/hanchou-orchestrator`とClaude Code用の
`.claude/skills/hanchou-orchestrator`が対象になったことを確認します。既に開いていた
paneがskillを認識しない場合は、新しいCodexまたはClaude Code paneを開きます。

## 4. skill名を指定して開始する

Codexでは次を最初のpromptとして使います。`<依頼>`は実際の作業へ置き換えます。

```text
$hanchou-orchestrator を使って、Project Hanchouとして開始してください。
対象はこのrepositoryです。必要な作業はOrca Orchestrationでworkerへ委譲し、
必要なreview後に最終結果をまとめてください。

依頼: <依頼>
```

Claude Codeでは`/hanchou-orchestrator`を使います。

```text
/hanchou-orchestrator Project Hanchouとして開始してください。対象はこのrepositoryです。
必要な作業はOrca Orchestrationでworkerへ委譲し、必要なreview後に最終結果を
まとめてください。

依頼: <依頼>
```

Hanchouはkindとscopeを確認し、実行中Orcaに一致する公式guideを読み、1つのRunを
このpaneへbindします。同じpaneで続ける依頼ではskill名を毎回書く必要はありません。
新しいpaneでは、最初のpromptで再度明示します。

## 5. 通常sessionとの違いを確認する

Hanchouを指定しない別paneは通常のOrca sessionのままです。installしただけでRun、
worker、Automationが作られることはありません。

Project以外のprompt例、full handoffとの違い、複数paneの扱いは
[Usage](USAGE.md)を参照してください。install先や更新・削除は
[Installation](INSTALLATION.md)にまとめています。
