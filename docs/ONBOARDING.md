# Hanchou onboarding

この手順は、macOSでHanchouを初めて使う人が、専用の作業場所を作り、
Herdr上のOrchestratorへ最初の依頼を送るところまでを説明します。

## 完了するとできること

```text
通常terminal
  └─ hanchou launch work
       ├─ Hanchou Dashboardを開く
       ├─ Herdr上のOrchestratorを開始・初期化する
       └─ 必要なら互換性確認後にHerdrmを開く

~/HanchouWorkspace/work/repositories/
  ├─ repository-a/        人間がcloneまたは作成
  └─ repository-b/        人間がcloneまたは作成

~/.local/share/hanchou/work/
  ├─ control/.beads/      profile共通のTask正本
  ├─ worktrees/           Leaf委任時にHanchouが自動作成
  ├─ relay/               完了・失敗・報告のdurable event
  └─ logs/                LaunchAgentのlog
```

Hanchou Coreのcheckoutと、作業対象repositoryの置き場は分けます。Hanchouを
各repositoryへinstallし直す必要はありません。

## 0. Security boundaryを理解する

新しいrepositoryへのdispatchはdeny-by-defaultです。`onboard`で許可する
`~/HanchouWorkspace/work/repositories`は、「この配下のGit repositoryならAgentが
作業してよい」という人間の包括的な許可になります。

この中に置いてよいものは次のとおりです。

- public repository
- Agentに内容を読ませてよいrepository
- Agentがbranch、commit、testを操作してよいrepository

置かないものは次のとおりです。

- password、token、cookie、private keyなどのsecret
- Agentに見せたくないprivate repository
- download、backup、写真などGit作業と無関係なfile
- 複数用途が混在する既存の大きなdirectory

`onboard --yes`は人間が操作する通常terminalでしか実行できません。
`HERDR_ENV=1`のHerdr管理ペイン、`HANCHOU_AGENT_ID`を持つManaged Agent、
非対話実行からは拒否されます。AgentがHanchou CLIを使って自分の許可範囲を
広げられないようにするためです。ただし、同じmacOS userで動くprocessに対する
OSレベルの隔離ではありません。強い隔離が必要なら、別OS userまたは
Kingdom／VMを使ってください。

## 1. 前提commandを確認する

通常のmacOS Terminalを開きます。Herdr内のAgent terminalではありません。

```bash
for cmd in brew mise git gh bd codex claude; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "OK      $cmd"
  else
    echo "MISSING $cmd"
  fi
done
```

不足する基本toolは次でinstallします。CodexとClaude Codeはそれぞれの公式手順で
installし、上の確認で`OK`になるようにしてください。初回はそれぞれを通常terminal
から起動し、公式のlogin／認証を完了してからHanchouを構築します。

```bash
brew install mise git gh beads
```

GitHub loginとcommit用のGit名義も確認します。`gh auth status`が未loginなら
`gh auth login`を実行します。Git名義が空なら、例の値を自分のものへ置き換えて設定します。

```bash
gh auth status
git config --global user.name
git config --global user.email

# 空だった場合だけ
git config --global user.name "YOUR NAME"
git config --global user.email "YOUR_EMAIL"
```

HerdrとNode.jsをHomebrewから直接installする必要はありません。Hanchouの
`mise.toml`がHerdr 0.8.2とNode.js 22をpinし、`mise install`が用意します。

## 2. Hanchou Coreを準備する

CoreとPublic Skillsを同じ親directoryに置きます。Coreは標準設定でsiblingの
`../hanchou-skills`を参照するため、どちらか一方だけでは`bootstrap`を完了できません。
既に両方をこの配置でclone済みなら、その`hanchou` directoryへ移動するだけです。

```bash
mkdir -p "$HOME/HanchouSource"
cd "$HOME/HanchouSource"
git clone https://github.com/ykawase1011/hanchou.git
git clone https://github.com/ykawase1011/hanchou-skills.git
cd hanchou

mise install
mise exec -- npm ci
make check
```

`make check`が最後まで成功してから次へ進みます。

Core checkoutはLaunchAgent、plugin link、Skillsのsourceとして参照されます。動作中に
移動・削除する一時directoryではなく、今後も保持する安定した場所へ置いてください。
作業対象repositoryはこのcheckout内ではなく、次に作る専用shelfへ置きます。

## 3. 「この配下は自由に作業してよい」directoryを作る

最初のcommandはplan表示だけで、fileを変更しません。

```bash
./bin/hanchou onboard work
```

表示された2つのpathを確認します。

```text
dedicated workspace: ~/HanchouWorkspace/work/repositories
human-owned registry: ~/.config/hanchou/work/projects.local.toml
```

問題なければ、同じ通常terminalで適用します。

```bash
./bin/hanchou onboard work --yes
```

このcommandはworkspaceをmode `0700`で作り、machine-local registryへ
`descendant-git-repositories`の許可を追加します。registryはmode `0600`で保存し、
既存fileを変えるときは同じdirectoryにtimestamp付きbackupを作ります。同じ設定へ
再実行しても重複登録しません。

確認commandは次です。

```bash
./bin/hanchou project list --json
```

`workspace_roots`に`work-repositories`が1件あれば成功です。

personal profileも分けて使う場合だけ、同様に次を実行します。

```bash
./bin/hanchou onboard personal
./bin/hanchou onboard personal --yes
```

workとpersonalは別のroot、Beads、Relay、Herdr session、portを使います。

## 4. Hanchouを構築する

`plan`で変更予定を読み、`bootstrap`でmise tool、provider integration、Skills、
Herdr plugin、Beads、beads-ui、macOS LaunchAgentを構築します。

```bash
./bin/hanchou plan work
./bin/hanchou bootstrap work
sleep 5
./bin/hanchou doctor work
```

`bootstrap`は既存の管理対象設定を変える前にbackupを作ります。`doctor`では少なく
ともmise、Herdr／Node.js version、Beads、Codex、Claude Code、provider integration、
herdr-automations、beads-ui、Hanchou Dashboard、Skills、project registryを確認します。

`doctor`がすべて`ok`なら、日常利用は次の1 commandです。

```bash
./bin/hanchou launch work
```

`bootstrap`は`~/.local/bin/hanchou`も用意します。`command -v hanchou`で見つからない
場合は、そのterminalで次を実行し、必要なら同じ設定を`~/.zshrc`へ追加します。

```bash
export PATH="$HOME/.local/bin:$PATH"
```

これは稼働中のHerdr、beads-ui、Dashboardを確認し、`orchestrator`を開始または
初期化して、Dashboardをdefault browserで開きます。管理serviceがまだ構築されて
いない場合は勝手に別構成を作らず、`hanchou bootstrap work`を案内します。

browserを開かない場合は次です。

```bash
hanchou launch work --no-browser
```

## 5. 最初のrepositoryを置く

GitHubからcloneする例です。`OWNER`と`REPOSITORY`を置き換えてください。

```bash
cd ~/HanchouWorkspace/work/repositories
gh repo clone OWNER/REPOSITORY
```

まだGitHubにないrepositoryを新規作成する場合は、空directoryではなく、最初の
commitを持つGit repositoryにします。

```bash
mkdir example-app
cd example-app
git init -b main
printf '# example-app\n' > README.md
git add README.md
git commit -m 'Initial commit'
```

Hanchouから見える正確なGit top-levelを確認します。

```bash
REPO="$HOME/HanchouWorkspace/work/repositories/REPOSITORY"
hanchou project resolve --path "$(git -C "$REPO" rev-parse --show-toplevel)"
```

次が出ればLeafへ委任できます。

```text
dispatch ready: yes
```

dirty working tree、初回commitがないrepository、外部Git filterなどがある場合は
readyになりません。表示された`FAIL`を人間が確認して解消します。

## 6. Herdrを開いて依頼する

Dashboardは全体の状態確認、beads-uiはTask確認、HerdrはAgentのterminalです。

| 目的 | command |
|---|---|
| Dashboardを開く | `hanchou open dashboard work` |
| Herdr TUI全体を開く | `hanchou open herdr work` |
| OrchestratorへfocusしたHerdr TUIを開く | `hanchou open orchestrator work` |
| Task画面を開く | `hanchou open tasks work` |
| Automation boardを開く | `hanchou open automations work` |

最初は次を実行します。

```bash
hanchou open orchestrator work
```

このcommandは排他的なdirect attachではありません。Orchestratorのpaneへfocusして、
複数clientから表示できる通常のHerdr TUIを開きます。開いたterminalへそのまま日本語で
依頼を入力してください。

初回初期化時は、Orchestratorがcontrol planeの接続確認として次の内容を自動確認します。
既に初期化済みのOrchestratorを使っている場合だけ、同じ質問をその画面へ送ります。

```text
現在、進行中またはブロック中のBeadsタスクを確認してください。
あわせてHerdr上の実行Agentを確認し、実行中の委任タスク数を答えてください。
何もなければゼロと明記してください。
```

BeadsとHerdrの両方を参照した回答が返れば、今回の基本動作確認は完了です。

Orchestratorのterminalに、対象repository、依頼、完了条件、検証commandを送ります。

```text
対象repo: /Users/あなた/HanchouWorkspace/work/repositories/example-app
依頼: READMEに開発環境の起動手順を追加してください。
完了条件: 初めての人が記載どおりに起動できること。
検証: make check
まずproject resolveで登録を確認し、Leaf Taskへ委譲してください。
commitまでは行い、merge、push、PR作成はしないでください。
```

Herdr TUIから通常terminalへ戻る操作は次です。

1. `Ctrl+B`を押します。
2. 指を離して`q`を押します。

これはAgentを停止せず、画面からdetachする操作です。再び
`hanchou open orchestrator work`で戻れます。

`/exit`は別の操作です。これは表示だけでなくCodex／Claude Agent自体を終了します。
画面を切り替えるだけなら`/exit`を使わず、`Ctrl+B`、`q`を使ってください。

## 7. 自動worktreeの範囲

Hanchouは常に勝手にworktreeを作るわけではありません。

| 状況 | 動作 |
|---|---|
| Orchestratorが会話だけで回答 | worktreeを作らない |
| OrchestratorがLeaf Taskへ委任 | task専用branchとworktreeを自動作成 |
| Workerが成功 | task branchへboundedな結果をcommitし、証拠をRelayへ保存 |
| Task完了後 | merge、push、PR作成、worktree削除は自動で行わない |

worktreeの場所は次です。

```text
~/.local/share/hanchou/work/worktrees/<task-id>/<execution-id>/
```

確認するときは次を使います。

```bash
hanchou execution inspect <task-id> --json
```

Git worktreeはcheckout、index、HEAD、branchを分けますが、元repositoryとGit object、
ref、config、hookを共有します。秘密情報から隔離するVMではありません。

## 8. Dashboardの読み方

`work` profileのDashboardは<http://127.0.0.1:3747>、Task UIは
<http://127.0.0.1:3737>です。`personal`はそれぞれ3847、3837です。

Dashboardは5秒ごとに次のread-only情報を更新します。

- HerdrとOrchestratorの状態
- active TaskのID、title、statusとRelay件数
- Agentのname、role、status
- 許可済みworkspace rootとproject数
- 各画面を開くcommand
- optional Herdrmとの互換性

HTTP serverは`127.0.0.1`または`::1`だけにbindし、状態変更API、CORS、telemetryを
持ちません。Task本文やartifact本文はDashboardに表示しません。ただしTask titleやpathは
表示するため、secretをTask名、repository名、pathへ入れないでください。

## 9. Herdrmはoptional

HerdrmはmacOS 14+向けの別projectです。必要なら人間が明示的にinstallします。

```bash
brew install owo-network/brew/herdrm
```

現在のHerdrm 0.5.xのlocal接続はdefault socketを使います。一方、Hanchouの標準は
`work`／`personal`のnamed Herdr sessionです。そのため、通常はHerdrmからHanchouの
sessionを安全に表示できません。

Hanchouはdefault socketとnamed-session socketが同じ実体だと確認できた場合だけ
Herdrmを開きます。明示的なHerdrm起動commandを実行した時点でdefault socketが
存在しなければ、同一userのlive named socketを確認してcompatibility symlinkを
作成します。既存のdefault socketや別serverは上書きしません。

```bash
hanchou open herdrm work
# または、Dashboard起動と同時に試す
hanchou launch work --herdrm
```

非互換ならHanchou本体は起動したまま、Herdrmだけを開かず理由を表示します。
別profileのcompatibility linkやdefault sessionが既にある場合も、安全のため同じです。
互換環境でもmonitor／attach専用とし、HerdrmのNew AgentからHanchou管理の
OrchestratorやWorkerを新規作成しないでください。標準操作はHanchou Dashboardと
`hanchou open herdr work`です。

Herdrmでpaneへattachする操作と、`herdr agent attach`／`herdr terminal attach`は
同じpaneに対して同時に使えません。direct attachの書き込みownerは1つだけです。
前のdirect viewを`Ctrl+B`、`q`でdetachしてから別のdirect clientを使ってください。
`Another client took this pane over`と表示された場合、Agentが停止したのではなく、
後から接続したclientへ表示・入力ownerが移ったという意味です。通常は
`hanchou open orchestrator work`のfull Herdr TUIを使えばこの競合を避けられます。

## 10. よくある状態

### `orchestrator ... blocked; initialization remains pending`

初回のproject／hook review待ちです。次でfull Herdr viewを開き、表示された対象が意図した
Hanchou checkoutとHerdr integrationであることを確認してからtrustします。

```bash
hanchou open orchestrator work
```

古いAgentを`apply`より前から動かしていた場合は、Agent内で`/exit`し、`Ctrl+B`、`q`で
通常terminalへ戻って次を実行します。同じworkspace／paneが再利用されます。

```bash
hanchou start-orchestrator work
```

### `agent target orchestrator not found`

まだOrchestratorが作られていません。通常terminalで次を実行してから再度attachします。

```bash
hanchou launch work
hanchou open orchestrator work
```

### `00-orchestrator`が複数表示される

過去版では、初回trust待ち、Herdr再起動、または`/exit`後にAgent名が見えなくなると、
残っているworkspaceを認識できず新しい`00-orchestrator`を作ることがありました。
現行版は作成したworkspace／pane IDを保存し、起動を直列化して同じpaneを再利用します。
未管理の古い候補が残っている場合は、新しいworkspaceを作らず停止します。ただし、
要求kind、`00-orchestrator` label、1 tab／1 pane、no-worktree、Core cwd、全IDが一致する
live named `orchestrator`だけは、過去版から安全にbindingへ移行してそのまま維持します。

すべて止めて1つだけ作り直す標準手順は次です。まず通常terminalでplanを表示します。

```bash
hanchou stop-orchestrator work --all
```

これは読み取り専用です。`CLOSE`と表示された各workspace ID、terminal ID、Agent名、
statusに加え、`processes=<PID:name>`、pane-reported `cwd`、全foreground processの
`process_cwds=<PID:name@cwd>`、`observed_additional=<数値またはn/a>`を読み、すべて終了して
よいことを確認してください。`working`や
`blocked`を含め、表示された
workspaceのPTYと同じOS process session内で動く全processが終了します。planの末尾には、
実際の64文字tokenを含むexact apply commandも表示されます。

Hanchouが対象にするのは、次の条件をすべて自動検証できたworkspaceだけです。

- labelが設定済みの`00-orchestrator`である
- paneのbase cwdが実体pathとして現在のHanchou Core checkoutと一致する
- 1 tab／1 paneで、worktreeを持たない
- workspace／tab／pane／terminal IDと保存済みbindingに矛盾がない
- Agentがいる場合は設定済みの名前／kind／pane identityと一致する
- Herdr `pane process-info`のresult type、foreground PID／PGID／TTY、process recordが妥当である
- 既定modeでは、Agentがいない古いpaneはCore cwd上の利用可能なshellだけがforegroundにいて、
  OS process tableで同じTTYまたはshell descendantとして観測できる追加processが0件である

同じlabelでも1件を安全に検証できなければ、最初の検査では1件も閉じません。planの全対象を
終了してよければ、出力末尾のcommandを文字を変えずにcopyし、同じ通常terminalへ貼り付けます。
表示形式は次のとおりです。

```text
hanchou stop-orchestrator work --all --plan <64hex-token> --yes
```

`<64hex-token>`は説明用placeholderなので、その文字を入力したり自分でtokenを作ったりしません。
直前のplanが表示した64文字のlowercase hexを含む1行をそのまま使います。このtokenはreviewした
profile設定のdigest、全profile state path、binding、workspace／pane／Agent／process identityなどの
対象snapshotに束縛されます。plan後にAgent statusやprocessを含む対象状態が変わると、applyは
1件も閉じずに新しいplanを表示して拒否します。その新しいplanを読み、新しいexact commandを
使ってください。cleanup modeもtokenに束縛されるため、後述の`--include-unmanaged`を付けた
tokenと既定modeのtokenは交換できません。

#### 既定planがbusyな未管理paneを拒否した場合

まず`hanchou open herdr work`で対象を確認します。既定planの拒否理由を解消できるなら、processを
終了してCore cwdへ戻した後、最初の`--all`を再実行するのが標準です。解消できず、かつ人間が
そのpaneの全processを終了してよいと明示した場合だけ、通常terminalで次のread-only planを
使います。

```bash
hanchou stop-orchestrator work --all --include-unmanaged
```

このmodeがactivity判定を緩和できるのは、unboundかつAgent recordがないlegacy paneだけです。
`UNMANAGED-ACTIVE` rowの`processes`、pane-reported `cwd`、全foreground processの
`process_cwds`、`observed_additional`、`base_cwd`、`reasons`を1件ずつ読みます。
`current_cwd_outside_core`は全process cwdの判定です。reasonは`foreground_busy`、
`current_cwd_outside_core`、
`background_processes_observed`、`process_scan_unavailable`、`stale_pane_authority`の組合せです。
`observed_additional=n/a`は0件ではなく、busyなどでOS scan結果を確定できなかった意味です。

> **警告:** `unmanaged`は「空」や「安全」ではありません。有効なAgent recordがないという
> 意味だけです。applyは表示されていないprocessを含むpaneのOS process session全体を終了します。
> 不明なrowが1件でもあれば実行せず、Herdr TUIで手動整理してください。

このmodeでもexact label、Coreのbase cwd、1 tab／1 pane、no-worktree、opaque ID、binding、
実在Agent、Herdr process-info schemaの整合は必須です。`process_scan_unavailable`は後段のOS
process table scanだけを指し、malformedなHerdr responseを許す理由ではありません。別label、
Core外のbase cwd、worktree、foreign Agentなどを閉じるforce optionでもありません。全rowを
承認できる場合だけ、plan末尾に表示された次の形式のexact commandをそのまま貼り付けます。

```text
hanchou stop-orchestrator work --all --include-unmanaged --plan <64hex-token> --yes
```

状態変化やpartial failure後は、flagを外さず次から再planし、新しいexact commandを使います。

```bash
hanchou stop-orchestrator work --all --include-unmanaged
```

applyはHerdr内のAgent terminalや非対話実行からは受け付けません。ただし、この確認、token、
Agent環境判定は誤操作や通常の自動実行を減らすdefense-in-depthであり、同じOS userに対する
完全なsecurity boundaryではありません。実行権限を与える秘密tokenでもないため、applyは
人間がplanを確認した場合だけ実行してください。

`observed_additional=0`は上のbest-effort検査で追加processを検出しなかったという意味であり、
Agentがいるtargetの`n/a`はOS shell scanを実行していないという意味です。どちらも
「ほかのprocessが絶対にない」という証明ではありません。Darwinでは、同じOS process sessionに
属していても同TTYでもshell descendantでもないprocessを完全には列挙できません。さらにHerdr
0.8.2には検証したidentityを条件にするclose APIがないため、Hanchouが各workspaceを直前に
再検証してからcloseするまでの短い間に状態が変わる可能性も残ります。

したがってapplyは、planに表示されなかったprocessを含め、close時点で対象workspaceのPTYと
同じOS process session内にある全processを終了してよい、と人間が承認する操作です。少しでも
不安があればapplyせず、後述のHerdr TUIでworkspaceを1件ずつ確認して手動整理してください。

この操作で閉じるのは検証済みOrchestrator workspaceとそのPTYです。Herdr server／session、
Beads、Relay、Dashboard、作業repository、Leaf用worktreeは残ります。workspaceは1件ずつ
閉じるため、途中で失敗することがあります。その場合はerrorに表示された`closed`と
`remaining`、結果を確認できなかった`uncertain`を確認して原因を直します。`uncertain`を
終了済みと推測してはいけません。古いtokenを再利用せず、errorが示す同じmodeのread-only
planから再planし、現在の対象と新tokenをreviewして、新しく表示されたexact apply commandを
使ってください。include modeで失敗した場合は`--include-unmanaged`を残します。全対象の
終了を確認できた時点でだけ、古いbindingと初期化markerが消去されます。

完了後、通常terminalで新しいOrchestratorを1つ作り、画面を開きます。

```bash
hanchou start-orchestrator work
hanchou open orchestrator work
```

自動手順がcwd、pane構成、worktree、bindingなどの不一致を理由に拒否した場合は、手動整理を
fallbackにします。`hanchou open herdr work`でfull Herdr TUIを開き、sidebarで内容を確認します。
live Agent named `orchestrator`を残して重複だけ整理する場合は、そのrowを1つ残します。閉じて
よいと人間が確認できた各rowを選び、`Ctrl+B`を押して指を離し、`Shift+D`を押してcloseを
承認します。すべて作り直す場合だけ、確認済みの`00-orchestrator`をすべて閉じます。手動closeも
PTY内のprocessを終了するため、内容が不明なrowは閉じないでください。整理後は上と同じ
`start-orchestrator`／`open orchestrator`を実行します。

### `HERDR_ENV=1`ではないと言われる

通常のCodex／Claude sessionへ質問を送っています。Hanchouのlive Agent状態を扱う
依頼は、`hanchou open orchestrator work`で開いたHerdr管理Agentへ送ってください。
一方、`hanchou onboard work --yes`は通常terminalで実行するのが正解です。
tmuxを使っても現在のAgentがHerdr管理Agentへ変わるわけではありません。
`HERDR_ENV=1`を手動で設定せず、実Herdr操作は必ずHerdr内で起動したAgentへ依頼します。

### `server is shutting down`または`server shut down`

Herdrの更新処理が完了する前に`start-orchestrator`や`open orchestrator`を実行した状態です。
これらのcommandはHerdr service自体をinstallしません。通常terminalで、現在のCore checkoutを
更新してから`bootstrap`を再実行します。

```bash
cd /path/to/hanchou
git pull --ff-only
./bin/hanchou bootstrap work
sleep 5
./bin/hanchou doctor work
./bin/hanchou launch work
```

`doctor`がすべて`ok`になった後に`./bin/hanchou open orchestrator work`を実行します。
現行版はshutdown中でも成功するversion Pingだけではreadyと判定しません。

### Dashboardまたはbeads-uiが開かない

Hanchou Coreを更新した後は、新しいLaunchAgentが追加・変更されている場合があるため、
`launch`の前にもう一度`bootstrap`します。`launch`は設定を勝手にinstallしません。
まず再構築とhealth checkを行います。

```bash
cd /path/to/hanchou
hanchou plan work
hanchou bootstrap work
sleep 5
hanchou doctor work
```

現行版の`doctor`には少なくとも次の3項目も表示されます。表示されない場合は、別の
checkoutまたは更新前の出力を見ていないか、`pwd -P`と`git rev-parse --short HEAD`を
確認してください。

```text
project registry
Hanchou dashboard endpoint
Herdrm optional
```

Herdrのreload直後はversion確認だけ成功してもcontrol planeがshutdown中の場合があります。
現行版はこの状態をreadyにせず、旧serviceとsocketを最大10秒待って新serviceを起動します。
socket pathnameが残る場合も警告後にpin済みHerdr自身のlive／stale判定へ進みます。
`bootstrap`が途中で止まっても、次の実行はreload-pending markerから未完了分を再開します。
同じprofileの`bootstrap`を同時に実行した場合、後から来た実行は安全に停止するので、先の
実行が終わってから再実行してください。終了したprocessが残したlockは自動回収されます。
LaunchAgentの登録だけ成功してprocessがまだ一度も起動していない場合も、`bootstrap`は
変更なしの再実行で各serviceを明示的にkickstartします。既に動作中なら再起動しません。

Dashboardのlogは次にあります。

```text
~/.local/share/hanchou/work/logs/dashboard.out.log
~/.local/share/hanchou/work/logs/dashboard.err.log
```

### repositoryが許可されない

repositoryが専用rootの「直下または子孫」にあるGit top-levelか確認します。root自身を
repositoryにはせず、必ずその下にrepository directoryを作ります。

```bash
git -C /absolute/path/to/repository rev-parse --show-toplevel
hanchou project list --json
hanchou project resolve --path /absolute/path/to/repository
```

既存の機密repositoryを専用rootへ移動して回避しないでください。exact entryが必要な
場合は[`PROJECT_WORKSPACES.md`](PROJECT_WORKSPACES.md)の手動設定を使います。
