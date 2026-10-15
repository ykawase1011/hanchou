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
coreと5つの任意helperを明示して入れます。

```bash
npx skills add https://github.com/ykawase1011/hanchou \
  --skill hanchou-orchestrator hanchou-kaizen hanchou-publish-issues hanchou-update hanchou-cron hanchou-init \
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
1つです。通常はprojectの馴染みの窓口を1つ使い、独立した目的・権限・完了条件が
ある場合に別Hanchouを明示して始めます。同じRunを複数coordinatorが同時に共有せず、
元の対話の依頼を同じRunで管理します。

## Three uses

- **Project Hanchou**: 1つのproject/repositoryを主に扱います。
- **Cross-project Hanchou**: 専用folder workspaceから、登録済みの複数repositoryへ
  Orca経由でworkerをdispatchします。
- **Temporary Hanchou**: migration、release、比較調査などの期間だけ使います。

3種類とも同じ`hanchou-orchestrator` skillです。違うのは起動場所、最初のprompt、
必要ならlocalな静的policyだけです。

## 任意のローカル状況ビュー

起動済みのHanchouに「このprojectの依頼・判断待ち・PR結果をローカル状況ビューに
してください。保存先は `.hanchou/index.html`、今後は意味のある作業節目でも更新して
ください」と依頼できます。一回だけなら「今回は一度だけ更新」と指定します。
保存先・単一の更新担当・対象Runを記録し、欠損も明示した部分的な表示を作れます。
一回の明確な依頼ならprivate・再生成可能・別バックアップなしの既定で進め、実際の
衝突がある場合だけ確認します。
HTMLをブラウザで開くと日本語のカード、原文と訂正の詳細、検索・絞り込みを使えます。
ライブ監視ではなく、開いても最新化されません。「状況ビューを更新して」と担当へ
依頼してください。既存ファイルやinstallだけで有効化せず、停止中のcronも再開しません。
詳細は[status-view手順](skills/hanchou-orchestrator/references/status-view.md)。

## Repository

```text
skills/hanchou-orchestrator/   core orchestratorとlocal改善メモの記録
skills/hanchou-kaizen/         任意helper: 明示的なHanchou改善依頼の振り分け
skills/hanchou-publish-issues/ 任意helper: 改善メモの秘匿化・Issue起票・成功部分の除去
skills/hanchou-update/         任意helper: 既存Hanchou skillだけをscope維持で更新
skills/hanchou-cron/           任意helper: Orca Automationsによる定期業務の設定・管理
skills/hanchou-init/           任意helper: PJ責任方針の静的初期化
examples/project/             Project Hanchouの例
examples/cross-project/       専用workspaceの例
docs/                         architecture、導入、運用、移行、検証
```

Hanchou用production CLI、Node runtime、DB、scheduler、status serverはありません。
限定的な例外として、明示opt-inの読み取り専用ローカルHTMLテンプレートを配布します。
Orca/GitHubを正本にした再生成可能な時点表示で、操作・承認・編集UIは持ちません。
install/update/removeはAgent Skills installerまたはOrca Skills UIに任せます。

「hanchou kaizen」「Hanchou 改善」の明示的な依頼は`$hanchou-kaizen`
（Claude Codeでは`/hanchou-kaizen`）で意図に応じて扱います。
更新はCodexで`$hanchou-update`、Claude Codeで`/hanchou-update`を使います。
有効なHanchouは任意helperが導入済みなら起動・新規依頼ごとに一度だけ更新を確認します。
通常の明示的な更新依頼は、対象を限定した更新、新しい可視タブでの内容・引き継ぎ確認、
旧自分のcloseまでを含み、追加の承認は求めません。確認のみ・files-only・旧会話保持・
scope制限・適用される反対の継続指示を優先します。変更なしで会話も古くなければ
新タブは開きません。自動確認は更新や交代の許可にならず、公開契約が未対応なら現行会話を保持します。
結果はファイル更新・新タブでの読み込み確認・旧タブ終了を分けて報告します。
ファイル更新だけでは完全自動交代の成功とせず、移行できない理由と確認範囲を明示します。
通常のCodex/Claude端末も後任にできます。自動交代は公開CLIのみを使い、
Computer Useへ切り替えません。旧チャットのCLI終了が未対応なら、その会話を保持します。
対応範囲と手動回復は[更新の受入と制限](docs/UPDATE_VALIDATION.md)を参照してください。

新タブへの切り替えを**必須の完了条件**にするには、次のように依頼します。

```text
$hanchou-update 新タブへの切り替え必須
```

短縮形は Codex で `$hanchou-update !`、Claude Code で `/hanchou-update !` です。
`!` は既存 skill に渡す単独のチャット引数で、shell command や別名の skill ではありません。
この指定では導入済みファイルが最新でも再インストールを省くだけで、新しい可視タブ自身の
内容照合と引き継ぎ受領を必要とします。既定では確認後に旧自分を閉じます。
`旧会話は閉じない` を添えれば、新タブ確認を必須にしたまま旧会話を保持します。
配置時の会話/Run保持指示を更新交代の禁止へ広げず、実際の no-close や同一Run維持の指定は守ります。
同じ依頼に `files-only`／確認のみ／新タブ禁止も含まれ、矛盾が未解決なら、変更前にその選択を確認します。

継続方針にする場合は、既存の指示元で「明示的な Hanchou 更新依頼では、新タブでの
読み込み・引き継ぎ確認を必須とする」と宣言できます。自動確認の更新権限にはなりません。
公開CLIや安全な区切りが不足していれば、必須条件が未達であることと不足段階を報告します。
ファイル更新だけでは完了になりません。旧終了だけが未対応でも、許可済みで実行可能な
新タブ確認を省略せず進めます。詳細は[必須指定の契約](skills/hanchou-update/references/required-handoff.md)を参照してください。

改善メモの記録は外部公開を伴いません。公開したいときだけ
`$hanchou-publish-issues`または`/hanchou-publish-issues`で対象メモを指定します。
helperはそれだけでRunやworkerを作りません。具体例と失敗時の扱いは
[Improvement workflow](docs/IMPROVEMENTS.md)を参照してください。

定期点検・定期業務は明示的に`$hanchou-cron`（Claude Codeでは`/hanchou-cron`）を
呼び出します。PJ固有のジョブ定義は標準候補の`.hanchou/cron/<job>.md`、または
指定した別の静的Markdownに置きます。設定例、定義の参照元と権限の扱いは
[Scheduled work](docs/CRON.md)を参照してください。

PJごとの任意の責任方針は`$hanchou-init`（Claude Codeでは`/hanchou-init`）で
明示的に初期化できます。既定は対象PJ rootの`.hanchou/policy.md`です。
許可条件は依頼された作業にだけ適用され、方針やinstallだけで仕事を開始しません。
手順は[Initialization](docs/INITIALIZATION.md)を参照してください。

初回利用は[Onboarding](docs/ONBOARDING.md)、詳しい導入は
[Installation](docs/INSTALLATION.md)、prompt例と運用は[Usage](docs/USAGE.md)を
参照してください。設計は[Architecture](docs/ARCHITECTURE.md)、旧版からの移行は
[v2 migration](docs/MIGRATION_V2_TO_V3.md)にあります。helperの検証は
[maintenance validation](docs/MAINTENANCE_VALIDATION.md)、v3移行時の記録は
[v3 migration report](docs/V3_MIGRATION_REPORT.md)と
[acceptance matrix](docs/ACCEPTANCE_MATRIX.md)に記録しています。
