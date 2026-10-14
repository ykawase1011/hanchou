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
  --skill orca-cli orchestration --agent codex claude-code --global
```

## 3. Hanchouをglobal installする

HanchouはCodexとClaude Codeへglobal installするのが標準です。

```bash
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron hanchou-init \
  --agent codex claude-code --global
```

installerの結果と`npx skills list --global --agent codex claude-code`で両方の
配置を確認します。project限定なら対象projectで`--global`を外して実行します。
coreだけ必要ならskill名も絞れます。既に開いていた
paneがskillを認識しない場合は、新しいCodexまたはClaude Code paneを開きます。
PJ責任方針を作る場合は、起動とは別に`$hanchou-init`（Claude Codeでは
`/hanchou-init`）を依頼します。[Initialization](INITIALIZATION.md)を参照してください。
方針がなくても通常の依頼でHanchouを起動できます。

## 4. skill名を指定して開始する

「人間はmain、Hanchouは明示的な子worktree」という希望がある場合は、今後の
coordinator用の入口にも適用します。インストール済みOrcaの公開`orca-cli` guideで
対象parent・host・projectを確認し、明示的な親指定で子を作るか、確認済みの専用の
子を選んで新しいagent sessionを開きます。作成前のselectorと、作成後のreceipt・
実path・親子関係・host・projectを照合してから、下記promptを送ります。
別pathや同じGit baseだけでは子配置の証拠になりません。必要な配置を公開操作で
表現・確認できなければ、その制約を説明して開始を止めます。指定がなければOrcaの
通常の既定を保ち、明示的な今回だけの例外は継続方針と区別します。

既に開いている会話とbound Runはその場所に残します。配置希望から暗黙に移動・複製・
再bindしません。新規の対話coordinatorは独立した会話として通常のstartupを行い、
以前のRunのworkerや第2のcoordinatorにしません。監督下のworker・調査・review・
追加担当・再試行は元のcoordinatorと同じRunで配置希望を引き継ぎます。
固定の方針・定義参照元も実行先とは別に保持し、ignoredファイルを暗黙にcopyしたり
新しいcheckoutの同名ファイルへ切り替えたりしません。
詳細は[配置方針](../skills/hanchou-orchestrator/references/placement.md)を参照してください。

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

改善依頼の意図を振り分けるには`$hanchou-kaizen`（Claude Codeでは
`/hanchou-kaizen`）を使います。更新は`$hanchou-update`（Claude Codeでは
`/hanchou-update`）を指定します。
改善メモからの公開は[Improvement workflow](IMPROVEMENTS.md)を参照してください。
定期実行を明示的に設定するときは`$hanchou-cron`（Claude Codeでは
`/hanchou-cron`）を使います。[Scheduled work](CRON.md)に定義例と確認手順が
あります。installだけで定期実行は作られません。
