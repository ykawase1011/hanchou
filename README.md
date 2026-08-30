# Hanchou

Hanchouは、Herdr上に1つの永続Orchestratorを置き、Beads、定期実行、
Claude Code／Codex worker、共有Skillsを統合するための設定・policy・bridge
distributionです。独自のPTY runtime、Task DB、Cron engine、Chat transport、
書き込み可能なTask／Agent GUIは再実装しません。代わりに、各systemの状態と
安全な入口だけをまとめたloopback限定・読み取り専用のDashboardを提供します。

## 名前

`Hanchou`は、福本伸行作品『カイジ』に登場する印象的な「班長」への
敬意と、OSS名としてのユニークさを込めた名称です。本ソフトウェアは
非公式・非提携であり、キャラクターや口調を模倣しません。Orchestratorは
丁寧で簡潔な秘書・サポートとして振る舞います。

## 構成

```text
Herdr             Agent / PTY / Workspace / Worktree / lifecycle API
Beads             Task / Epic / Decision / dependencyの正本
beads-ui          標準Task GUI
herdr-beads       Herdr内のoptional Task board
herdr-automations recurring scheduleとrun history
Hanchou Relay     内部Inbox event、wake、user-facing Delivery
Hanchou Dashboard loopback限定のread-only statusと操作入口
Hanchou           Role、routing、設定、bridge、運用CLI
```

## Repository境界

```text
hanchou
  Core CLI、Role、Schema、Relay、Task/Cron bridge、設計資料

hanchou-skills
  work/personalで共用するPublic Skillsの正本

hanchou-kingdom
  work/personal両方で使えるsecret-free deployment/configuration

hanchou-chat（将来）
  Slack / Discord ingressとDelivery adapter
```

`hanchou-kingdom`はsecret storeではありません。Token、password、cookie、
private key、private repository URL、会社固有policyはGitに保存しません。

## Orchestrator

初期L0はCodex Solです。新規依頼には即時に次のどれかを返します。

1. 現在の会話とdurable stateだけで回答する。
2. Beadを作成・委譲し、Task IDと担当Roleを返してturnを終了する。
3. 安全なdefaultがない場合のみ、blocking questionを1件返す。

Worker完了までturnを維持しません。完了・失敗・判断待ちはRelay Inboxへ
保存され、Herdr上の同じOrchestrator sessionがidleになった時点で新しい
turnを起こします。そこで最終報告またはDecision requestを返します。

## Model policy

```text
L0 Orchestrator   Codex Sol
L1 Mission Lead   Claude Opus / Codex Sol（weekly usageで可変）
L2 Leaves         Claude Sonnet / Codex Terra（economy tier）
Writer            Codex
Editor            Codex（日本語・最終output review）
```

## Reporting policy

通常Task、定期Task、日次digestを同じDelivery contractで扱います。

```text
silent / parent_only / on_failure / on_change / on_terminal /
always / digest / immediate
```

日次digestは、Beads、Herdr、Automation history、未解決Decision、usage snapshot
をまとめるbounded control-plane workとして、Orchestratorが直接作成できます。

## CLIとSkills

Hanchou CLIは必要ですが、`bd`・`herdr`・`herdr-automations`を丸ごと
包むものではありません。単一systemの通常操作はupstream CLIを直接使い、
Hanchou CLIはprofile設定、usage routing、Relay／Delivery、Beads↔Herdr
execution bridgeなど、Hanchou固有または複数systemをまたぐ処理だけを担当します。

```text
Task graph             bd
Agent runtime          herdr
ordinary fresh-agent Cron  herdr-automations
Hanchou setup/routing/Relay/Delivery/cross-system  hanchou
```

Codex／Claude Codeには共通`hanchou-cli` Skillを配布し、どのCLIを使うかを
Roleごとに推測させません。詳細は`docs/CLI_AND_SKILL_BOUNDARY.md`です。

## Quick start

初めてでも次の順に進めれば、専用workspaceの作成からDashboard起動まで完了します。
Coreが参照するPublic Skillsも必要なため、2つのrepositoryを同じ親directoryの
`hanchou`／`hanchou-skills`として保持します。既に両方をこの配置でclone済みなら、
clone部分は省略してください。

```bash
brew install mise git gh beads

mkdir -p "$HOME/HanchouSource"
cd "$HOME/HanchouSource"
git clone https://github.com/ykawase1011/hanchou.git
git clone https://github.com/ykawase1011/hanchou-skills.git
cd hanchou

mise install
mise exec -- npm ci
make check

# 人間がHanchouに自由な作業を許可する専用領域を確認して作る
./bin/hanchou onboard work
./bin/hanchou onboard work --yes

./bin/hanchou plan work
./bin/hanchou bootstrap work
sleep 5
./bin/hanchou doctor work

# Orchestratorを開始し、Hanchou Dashboardをブラウザで開く
./bin/hanchou launch work
```

`onboard`は最初にplanだけを表示し、`--yes`を付けた2回目だけ次を作成します。

```text
~/HanchouWorkspace/work/repositories/             Agent-safeなGit repository置き場
~/.config/hanchou/work/projects.local.toml        human-ownedな許可設定
```

`--yes`は通常terminalの対話セッションでのみ受け付けます。Managed AgentやHerdr
管理ペインはHanchouの通常command経由で許可範囲を拡張できません。専用領域には
publicまたはAgentに見せてよいrepositoryだけを置き、secret、credential、private repository、
downloadや雑多なfileは置かないでください。同一OS userに対するhard boundaryが
必要なら、別OS userまたはKingdom／VMを使います。

最初の対象repositoryは専用領域の直下へcloneし、dispatch可能か確認します。

```bash
cd ~/HanchouWorkspace/work/repositories
gh repo clone OWNER/REPOSITORY

hanchou project resolve \
  --path "$(git -C REPOSITORY rev-parse --show-toplevel)"
```

`dispatch ready: yes`なら準備完了です。詳しい初心者向け手順、Herdrの画面操作、
最初の依頼例、troubleshootingは[`docs/ONBOARDING.md`](docs/ONBOARDING.md)を参照して
ください。配置とsecurity boundaryの詳細は
[`docs/PROJECT_WORKSPACES.md`](docs/PROJECT_WORKSPACES.md)にあります。

Leaf Taskをdispatchすると、固有branchと
`~/.local/share/hanchou/<profile>/worktrees/<task>/<execution>/`が自動生成されます。
merge、push、PR作成、worktree削除は自動ではありません。

Herdr 0.8.2とNode.js 22は`mise.toml`で管理します。HerdrをHomebrewから直接
installしたり、`latest`へ自動追従させたりしません。`herdr-beads`はoptional、
Beadsのstandalone Dolt serverは初期構成では不要です。Core CLI、validator、
generatorはTypeScriptで実装し、Node.js 22が直接実行します。runtime npm
dependencyとPython runtimeは必要ありません。

## 画面を開く

| 画面 | work | personal | 開くcommand |
|---|---:|---:|---|
| Hanchou Dashboard | <http://127.0.0.1:3747> | <http://127.0.0.1:3847> | `hanchou open dashboard work` |
| beads-ui | <http://127.0.0.1:3737> | <http://127.0.0.1:3837> | `hanchou open tasks work` |
| Herdr TUI | terminal | terminal | `hanchou open herdr work` |
| Orchestrator | terminal | terminal | `hanchou open orchestrator work` |

Dashboardは5秒ごとにHerdr、Beads、Relay、workspace登録を読み取ります。Task本文や
artifact本文はDashboardに表示しませんが、Task titleやpathにはsecretを書かないでください。
状態確認専用で、Task編集はbeads-ui、Agent操作はHerdrを使います。Herdr TUIから
通常terminalへ戻るには、`Ctrl+B`を押してから`q`です。

Herdrmはoptionalです。現在のHerdrm 0.5.xはdefault socketを使う一方、Hanchouは
`work`／`personal`のnamed sessionを使うため、通常は同じsessionを表示できません。
Hanchouは別sessionの誤起動を避けるため、socket一致を確認できない場合は
`hanchou open herdrm work`を安全側に失敗させます。標準画面はHanchou Dashboardと
Herdr TUIです。互換性が確認できる環境だけ、次を利用できます。

```bash
hanchou launch work --herdrm
```

## Authoritative documents

1. `docs/INDEX.md`
2. `HANCHOU_SPEC.md`
3. `docs/DECISIONS.md`
4. `docs/PLANNING.md`
5. `docs/SESSION_HANDOFF.md`

新しい実装sessionでは、次を実行してください。

```bash
./bin/hanchou handoff
```
