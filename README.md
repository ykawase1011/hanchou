# Hanchou

Hanchouは、Herdr上にprofileごとに1つの永続Orchestratorを置き、Beads、定期実行、
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

v1のprofile-local instanceは、1回のreviewed `init` flowでCore、Public Skills、安定launcher、
作業repository shelfを同じprofile rootへ作ります。主要pathは次の4つです。

```text
~/HanchouWorkspace/work/
├── bin/hanchou          regular-fileのprofile-local launcher
├── hanchou/             Hanchou管理のclean detached Core checkout
├── hanchou-skills/      Hanchou管理のclean detached Public Skills checkout
└── repositories/        人間がAgent作業を許可するrepository shelf
```

`hanchou`と`hanchou-skills`は、固定された公式public HTTPS remote
`https://github.com/ykawase1011/hanchou.git`と
`https://github.com/ykawase1011/hanchou-skills.git`の
`refs/heads/main`から取得します。どちらも作業対象repositoryではなく、
`repositories/`の中へ置きません。各checkoutは独立したexact commitへpinしますが、
init、更新、rollback、validationは常にCore／Skillsのcommit pairとして扱います。
candidate pairはCoreが要求するSkills version、共有`hanchou-cli`の同一内容、設定済み
public Skillsの存在も相互検証します。
このほか、Hanchouはprofile rootへ`.hanchou/instance.json`、root-level
`AGENTS.md`／`CLAUDE.md`、provider control filesを生成します。root-level instructionsは
managed Core内のRole／運用文書を参照させるため、Orchestratorがprofile root cwdでも正しい
指示を読み込めます。

`init`、`update`、`rollback`とprofile-root cwdはv2.4.0で実装されています。
旧Core-cwd deploymentから移行する場合は、先に
[`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md)のcutover手順を確認してください。

初回手順は次の形です。最初の`init`だけは、信頼して取得したbootstrap用
Hanchou checkoutから実行します。作成後はprofile-local launcherを使い、別のCore checkoutに
依存しません。

```bash
brew install mise git gh beads

# 初回initだけに使うseed Coreを、profile rootの外へ取得する
git clone --branch main --single-branch \
  https://github.com/ykawase1011/hanchou.git \
  "$HOME/HanchouBootstrap/hanchou"
cd "$HOME/HanchouBootstrap/hanchou"
mise install
mise exec -- npm ci
make check

# candidate pairを取得・検証する（deploymentはまだ作らない）
./bin/hanchou init work
# 表示されたexact token入りcommandを、そのままcopy/pasteしてinstanceを作る
$HOME/HanchouBootstrap/hanchou/bin/hanchou init work --plan <64hex-token> --yes

cd "$HOME/HanchouWorkspace/work"

./bin/hanchou plan
./bin/hanchou bootstrap
sleep 5
./bin/hanchou doctor

# Orchestratorを開始し、Hanchou Dashboardをブラウザで開く
./bin/hanchou launch
```

`<64hex-token>`は説明用placeholderです。bare `init`が出力した実token入りabsolute
seed commandを
変更せず使います。planはprepareを実行した同じseed Core executableのpathをapply commandへ
埋め込むため、PATH上の別の`hanchou`へ置き換えません。
このseed checkoutは初回作成専用です。instance作成後の正本は
`~/HanchouWorkspace/work/bin/hanchou`であり、seed側で`git pull`して運用を続けません。

profile-local launcherはinstance rootとprofileを固定します。呼び出し元の`HOME`や環境変数で
別instanceへ差し替えたり、local commandへ矛盾するprofileを渡したりできません。

更新はmanaged checkout内の`git pull`ではなく、必ずpair-awareなplan/applyを使います。

```bash
cd "$HOME/HanchouWorkspace/work"
./bin/hanchou update
# candidate Core/Skills commitとvalidationを確認する
./bin/hanchou update --plan <64hex-token> --yes
```

このapply行も説明用の形式です。実際のplanはprofile-local launcherのabsolute pathと
tokenを含むexact commandを表示するため、1行全体を変更せず使います。

planは公式public `main`のexact commit pairをfetchし、candidate Coreをcandidate
Skillsと組み合わせて事前検証し、現在の各commitからそれぞれfast-forwardであることを
要求します。
両tipが現在pairと同じならcurrentと報告してapply tokenは出しません。running deploymentは
まだ切り替えません。applyはplan時のexact pairだけをactivateし、`bootstrap`と
`doctor`を実行し、直前のpairをrollback用に
記録します。plan後にupstream `main`が進んでも新しいcommitへ読み替えません。
`rollback`も同じplan/apply modelで直前のpair全体を復元します。片方だけを戻す操作や、
`latest`へ自動追従するdaemonは提供しません。

prepareはcandidateのmise/npm/make codeを実行するため、init／update／rollbackのbare
commandもManaged Agent外の通常の対話terminalに限定されます。applyはそれに加えて
exact tokenを必須とします。
validationは一時HOME/XDGを使い、一般的なGitHub token／HTTP proxy環境変数とambient Git設定を
外し、npm install scriptを無効にします。それでもcandidateの`make check`はOS sandboxなしで
upstream codeを実行するため、信頼できないsourceを安全化する境界ではありません。

applyは`stop-orchestrator`を呼んでL0 workspaceを意図的に閉じませんが、activation後の
`bootstrap`は変更されたHerdr／Dashboard等をreloadし得るため、running sessionが無影響とは
限りません。Roleやinstructionの変更を読み込ませるには、成功後に
`./bin/hanchou open orchestrator`で`/exit`し、detach後に
`./bin/hanchou start-orchestrator`で同じpaneへ明示的に再起動します。activation後の
bootstrap／doctorが失敗した場合、Hanchouは元pairへの自動復元と再bootstrap／doctorを試み、
それも失敗した場合だけrecovery transactionを残して成功扱いにしません。
このincomplete transactionはautomatic `rollback`の入力にはならず、local lifecycle
commandをfail closedにします。人間が両checkoutとinstance metadataを整合する形で
inspect／repairするまで、
journalだけを消して再試行しません。

`launch`は不足するserviceを勝手にinstallせず、未installのLaunchAgent名やHerdr reload中の
control-plane状態を理由付きで表示します。

bare `init`は固定remote/refのcandidate pairをdownloadして検証し、tokenを表示する
prepare-only stepです。profile root、managed checkout、launcher、repository shelf、registryを
deployed stateとしては作りません。exact `--plan <token> --yes`を通常の対話terminalで実行した
ときだけinstanceを作り、固定shelfをworker dispatch対象として登録します。これにより初回
`init` applyの完了直後からrepositoryを置いて使えます。
初回profile rootは存在しないか、保持する`repositories/`と空の`.hanchou/`だけを
含む必要があり、ほかのroot/control entryは上書きせず拒否します。

`onboard`は、固定shelfのauthorityを後から単独で確認・再適用する場合にも引き続き
呼び出せます。最初にplanだけを表示し、`--yes`を付けた2回目だけregistryへ適用します。

```text
~/HanchouWorkspace/work/repositories/             Agent-safeなGit repository置き場
~/.config/hanchou/work/projects.local.toml        human-ownedな許可設定
```

`--yes`は通常terminalの対話セッションでのみ受け付けます。Managed AgentやHerdr
管理ペインはHanchouの通常command経由で許可範囲を拡張できません。専用領域には
publicまたはAgentに見せてよいrepositoryだけを置き、secret、credential、private repository、
downloadや雑多なfileは置かないでください。同一OS userに対するhard boundaryが
必要なら、別OS userまたはKingdom／VMを使います。

Orchestratorのcwdはprofile rootそのものです。これは利用者がprofile tree全体をL0へ
明示的に許可する設計であり、L0は`hanchou/`、`hanchou-skills/`、`repositories/`を
直接read/writeできます。Role policyは通常作業をLeafへ委任させますが、filesystemで
direct L0 accessを遮断するものではありません。profile rootは運用上のscopeであって、
同一OS userに対するOS security boundaryではありません。また、profile-local checkoutを
複数作っても、
同じOS userのglobal integration、Agent定義、plugin/tool linkは完全には分離されません。
異なるcommitのprofileを併用すると最後に成功した`bootstrap`の内容とdriftし得るため、
更新・bootstrapを直列化し、各profileで`doctor`を確認してください。hard independenceには
別OS userまたはVMを使います。

最初の対象repositoryは専用領域の直下へcloneし、dispatch可能か確認します。

```bash
cd ~/HanchouWorkspace/work
gh repo clone OWNER/REPOSITORY repositories/REPOSITORY

./bin/hanchou project resolve \
  --path "$(git -C repositories/REPOSITORY rev-parse --show-toplevel)"
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

以下は対象の`cd "$HOME/HanchouWorkspace/<profile>"`後に、profile-local launcherから
実行します。

| 画面 | work | personal | 開くcommand |
|---|---:|---:|---|
| Hanchou Dashboard | <http://127.0.0.1:3747> | <http://127.0.0.1:3847> | `./bin/hanchou open dashboard` |
| beads-ui | <http://127.0.0.1:3737> | <http://127.0.0.1:3837> | `./bin/hanchou open tasks` |
| Herdr TUI | terminal | terminal | `./bin/hanchou open herdr` |
| OrchestratorへfocusしたHerdr TUI | terminal | terminal | `./bin/hanchou open orchestrator` |

Dashboardは5秒ごとにHerdr、Beads、Relay、workspace登録を読み取ります。Task本文や
artifact本文はDashboardに表示しませんが、Task titleやpathにはsecretを書かないでください。
状態確認専用で、Task編集はbeads-ui、Agent操作はHerdrを使います。Herdr TUIから
通常terminalへ戻るには、`Ctrl+B`を押してから`q`です。
クイックリンクには、現在のprofile-local launcherを使う`status`／`update` commandも表示します。
Dashboardから更新を自動実行はせず、表示されたcommandを通常terminalでreviewして使います。

`./bin/hanchou open orchestrator`はOrchestratorへfocusして通常のHerdr TUIを開きます。
単一ownerのdirect attachではないため、複数のHerdr clientから同じsessionを表示できます。
`launch`／`start-orchestrator`はprofile単位で直列化され、作成したworkspace／pane IDを
保存して再利用します。過去版が残した未管理の`00-orchestrator`を検出した場合は、
新しいworkspaceを追加せず停止します。唯一の例外として、要求kind、single-pane形状、
no-worktree、approved Hanchou workspace cwd、全IDが一致するlive named `orchestrator`は、過去版から安全に
bindingへ移行して維持します。

通常のapproved cwdはexact profile rootです。移行中だけ、`init`がinstance metadataへ明示的に
記録したpre-2.4 bootstrap Core rootも許可します。任意pathは許可せず、新しいprofile-root
workspaceを作成できた時点でlegacy allowanceを消去します。

複数ある`00-orchestrator`をすべて止めて1つだけ作り直す場合は、通常terminalで
まずplanを表示します。このcommandは何も変更しません。

```bash
cd "$HOME/HanchouWorkspace/work"
./bin/hanchou stop-orchestrator --all
```

終了対象と、そのpaneで終了するAgent／processを確認します。すべて終了してよければ、plan末尾に
表示されたexact apply commandを変更せずcopy/pasteします。表示形式は次のとおりです。

```text
<exact-profile-local-launcher> stop-orchestrator --all --plan <64hex-token> --yes
```

profile-local launcherからplanした場合、`<exact-profile-local-launcher>`部分には実際の
absolute `.../HanchouWorkspace/work/bin/hanchou` pathが表示されます。そのpathも含めて変更しません。

`<64hex-token>`は説明用placeholderであり、そのまま入力しません。planが表示した64文字の
token入りcommandを使います。tokenはreviewしたprofile設定のdigest、全profile state path、
binding、workspace／pane／Agent／process identityなどの対象snapshotに束縛されます。plan後に
対象状態が変わるとapplyは何も閉じずに拒否するため、再planして新しいexact commandを
確認してください。

`--plan <64hex-token> --yes`は人間が操作する通常の対話terminalでのみ受け付けます。これは
誤操作や通常のAgent自動実行を減らすdefense-in-depthであり、同じOS userに対する完全な
security boundaryではありません。対象は、設定済みlabel、approved Hanchou rootと一致するpane base cwd、
1 tab／1 pane、no-worktree、pane ID、存在する場合のbindingとAgent identityをすべて検証できた
workspaceだけです。Herdr `pane process-info`のresult type、foreground PID／PGID／TTY、process
recordが妥当であることも必須で、malformed responseはinclude modeでも拒否します。
Agentがいないlegacy paneでは、cwdがapproved rootと一致する利用可能なshellを確認し、OS process tableで
同じTTYまたはshell descendantとして観測できる追加processが0件であることを検証し、
`observed_additional=0`と表示します。
AgentがいるtargetではこのOS shell scanを行わず、`observed_additional=n/a`と表示します。
これは全processの不存在証明ではありません。Darwinでは同じOS process sessionに属していても、
この2条件から外れるprocessを完全には列挙できません。またHerdr 0.8.2には検証したidentityを
条件にするclose APIがないため、各workspaceの最終revalidateからcloseまでのTOCTOUは残ります。
applyは、対象workspaceのPTYと同じOS process session内の全processを終了してよいと人間が
承認する操作です。不安があればapplyせず、Herdr TUIで個別に確認して手動整理してください。

既定planが、unboundかつAgent recordのないlegacy paneについて、busyなforeground、
観測したbackground process、OS process scan不能、またはstaleなpane authorityを
理由に拒否することがあります。この場合もflagを自動追加しません。人間がHerdr TUIで確認し、
そのpaneの全processを終了してよいと明示した場合だけ、通常terminalで次の危険な
activity override planを表示します。このcommand自体は何も閉じません。

```bash
./bin/hanchou stop-orchestrator --all --include-unmanaged
```

`UNMANAGED-ACTIVE` rowの`processes`、pane-reported `cwd`、全foreground processの
`process_cwds=PID:name@cwd`、`observed_additional`、`base_cwd`、`reasons`をすべて確認します。
paneと全foreground processのcwdはapproved rootのいずれかと実体pathで完全一致することがhard containmentであり、
`--include-unmanaged`でもoverrideしません。このmodeの`observed_additional=n/a`は0件ではなく、
scan結果を確定できないという意味です。planが表示した次の形式のexact command
だけを使います。

```text
<exact-profile-local-launcher> stop-orchestrator --all --include-unmanaged --plan <64hex-token> --yes
```

ここで`unmanaged`は「空」や「安全」ではなく、有効なAgent recordでownerを確認できないという
意味です。このmodeでもexact label、approved rootのbase/current/process cwd、1 tab／1 pane、no-worktree、opaque ID、
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
./bin/hanchou start-orchestrator
./bin/hanchou open orchestrator
```

自動検証できないworkspaceは閉じずに停止するため、手動整理のfallbackは
[`docs/ONBOARDING.md`](docs/ONBOARDING.md#00-orchestratorが複数表示される)を参照してください。

Herdrmはoptionalです。現在のHerdrm 0.5.xはdefault socketを使う一方、Hanchouは
`work`／`personal`のnamed sessionを使うため、通常は同じsessionを表示できません。
Hanchouは別sessionの誤起動を避けるため、socket一致を確認できない場合は
`./bin/hanchou open herdrm`を安全側に失敗させます。default socketが存在しない場合だけ、
明示的なHerdrm起動commandはlive named socketへのcompatibility linkを作成できます。
既存default sessionは上書きしません。標準画面はHanchou DashboardとHerdr TUIです。
Herdrmのpane attachと`herdr agent attach`／`herdr terminal attach`は、同じpaneに対して
同時に使わないでください。direct attachは書き込みownerが1つだけで、後から接続した
clientが前のclientをtake overします。前のdirect viewは`Ctrl+B`、`q`でdetachします。

```bash
./bin/hanchou launch --herdrm
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
