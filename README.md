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

Coreを`git pull`した後も、LaunchAgentやintegrationの追加・変更を反映するため
`bootstrap`をもう一度実行します。`launch`は不足するserviceを勝手にinstallせず、
未installのLaunchAgent名やHerdr reload中のcontrol-plane状態を理由付きで表示します。

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
| OrchestratorへfocusしたHerdr TUI | terminal | terminal | `hanchou open orchestrator work` |

Dashboardは5秒ごとにHerdr、Beads、Relay、workspace登録を読み取ります。Task本文や
artifact本文はDashboardに表示しませんが、Task titleやpathにはsecretを書かないでください。
状態確認専用で、Task編集はbeads-ui、Agent操作はHerdrを使います。Herdr TUIから
通常terminalへ戻るには、`Ctrl+B`を押してから`q`です。

`hanchou open orchestrator work`はOrchestratorへfocusして通常のHerdr TUIを開きます。
単一ownerのdirect attachではないため、複数のHerdr clientから同じsessionを表示できます。
`launch`／`start-orchestrator`はprofile単位で直列化され、作成したworkspace／pane IDを
保存して再利用します。過去版が残した未管理の`00-orchestrator`を検出した場合は、
新しいworkspaceを追加せず停止します。唯一の例外として、要求kind、single-pane形状、
no-worktree、Core cwd、全IDが一致するlive named `orchestrator`は、過去版から安全に
bindingへ移行して維持します。

複数ある`00-orchestrator`をすべて止めて1つだけ作り直す場合は、通常terminalで
まずplanを表示します。このcommandは何も変更しません。

```bash
hanchou stop-orchestrator work --all
```

終了対象と、そのpaneで終了するAgent／processを確認します。すべて終了してよければ、plan末尾に
表示されたexact apply commandを変更せずcopy/pasteします。表示形式は次のとおりです。

```text
hanchou stop-orchestrator work --all --plan <64hex-token> --yes
```

`<64hex-token>`は説明用placeholderであり、そのまま入力しません。planが表示した64文字の
token入りcommandを使います。tokenはreviewしたprofile設定のdigest、全profile state path、
binding、workspace／pane／Agent／process identityなどの対象snapshotに束縛されます。plan後に
対象状態が変わるとapplyは何も閉じずに拒否するため、再planして新しいexact commandを
確認してください。

`--plan <64hex-token> --yes`は人間が操作する通常の対話terminalでのみ受け付けます。これは
誤操作や通常のAgent自動実行を減らすdefense-in-depthであり、同じOS userに対する完全な
security boundaryではありません。対象は、設定済みlabel、Hanchou Coreと一致するpane base cwd、
1 tab／1 pane、no-worktree、pane ID、存在する場合のbindingとAgent identityをすべて検証できた
workspaceだけです。Herdr `pane process-info`のresult type、foreground PID／PGID／TTY、process
recordが妥当であることも必須で、malformed responseはinclude modeでも拒否します。
Agentがいないlegacy paneでは、Core cwd上の利用可能なshellを確認し、OS process tableで
同じTTYまたはshell descendantとして観測できる追加processが0件であることを検証し、
`observed_additional=0`と表示します。
AgentがいるtargetではこのOS shell scanを行わず、`observed_additional=n/a`と表示します。
これは全processの不存在証明ではありません。Darwinでは同じOS process sessionに属していても、
この2条件から外れるprocessを完全には列挙できません。またHerdr 0.8.2には検証したidentityを
条件にするclose APIがないため、各workspaceの最終revalidateからcloseまでのTOCTOUは残ります。
applyは、対象workspaceのPTYと同じOS process session内の全processを終了してよいと人間が
承認する操作です。不安があればapplyせず、Herdr TUIで個別に確認して手動整理してください。

既定planが、unboundかつAgent recordのないlegacy paneについて、busyなforeground、Core外の
current cwd、観測したbackground process、OS process scan不能、またはstaleなpane authorityを
理由に拒否することがあります。この場合もflagを自動追加しません。人間がHerdr TUIで確認し、
そのpaneの全processを終了してよいと明示した場合だけ、通常terminalで次の危険な
activity override planを表示します。このcommand自体は何も閉じません。

```bash
hanchou stop-orchestrator work --all --include-unmanaged
```

`UNMANAGED-ACTIVE` rowの`processes`、pane-reported `cwd`、全foreground processの
`process_cwds=PID:name@cwd`、`observed_additional`、`base_cwd`、`reasons`をすべて確認します。
`current_cwd_outside_core`は全process cwdの判定です。このmodeの`observed_additional=n/a`は
0件ではなく、scan結果を確定できないという意味です。planが表示した次の形式のexact command
だけを使います。

```text
hanchou stop-orchestrator work --all --include-unmanaged --plan <64hex-token> --yes
```

ここで`unmanaged`は「空」や「安全」ではなく、有効なAgent recordでownerを確認できないという
意味です。このmodeでもexact label、Coreのbase cwd、1 tab／1 pane、no-worktree、opaque ID、
binding、実在Agent、Herdr process-info schemaの整合条件は緩和しません。
`process_scan_unavailable`は後段のOS process table scanだけを指します。mode自体もtokenに
束縛されるため、状態変化やpartial failure後は`--include-unmanaged`を付けたplanからやり直し、
flagを外したり旧tokenを再利用したりしません。

Herdr server／session、Beads、Relay、Dashboard、repository、worktreeは残ります。
途中で失敗した場合も古いtokenは
再利用しません。errorの`closed`／`remaining`／`uncertain`を確認して原因を直し、
errorが示す同じmodeのread-only planからやり直して、新しいtoken入りcommandを使います。

stop完了後に、新しいOrchestratorを1つ作って画面を開きます。

```bash
hanchou start-orchestrator work
hanchou open orchestrator work
```

自動検証できないworkspaceは閉じずに停止するため、手動整理のfallbackは
[`docs/ONBOARDING.md`](docs/ONBOARDING.md#00-orchestratorが複数表示される)を参照してください。

Herdrmはoptionalです。現在のHerdrm 0.5.xはdefault socketを使う一方、Hanchouは
`work`／`personal`のnamed sessionを使うため、通常は同じsessionを表示できません。
Hanchouは別sessionの誤起動を避けるため、socket一致を確認できない場合は
`hanchou open herdrm work`を安全側に失敗させます。default socketが存在しない場合だけ、
明示的なHerdrm起動commandはlive named socketへのcompatibility linkを作成できます。
既存default sessionは上書きしません。標準画面はHanchou DashboardとHerdr TUIです。
Herdrmのpane attachと`herdr agent attach`／`herdr terminal attach`は、同じpaneに対して
同時に使わないでください。direct attachは書き込みownerが1つだけで、後から接続した
clientが前のclientをtake overします。前のdirect viewは`Ctrl+B`、`q`でdetachします。

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
