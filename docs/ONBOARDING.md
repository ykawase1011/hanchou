# Hanchou onboarding

この手順は、macOSでHanchouを初めて使う人が、専用の作業場所を作り、
Herdr上のOrchestratorへ最初の依頼を送るところまでを説明します。

## 完了するとできること

```text
通常terminal
  └─ ~/HanchouWorkspace/work/bin/hanchou launch
       ├─ Hanchou Dashboardを開く
       ├─ Herdr上のOrchestratorを開始・初期化する
       └─ 必要なら互換性確認後にHerdrmを開く

~/HanchouWorkspace/work/
  ├─ bin/hanchou          work instanceに固定されたregular-file launcher
  ├─ hanchou/             managed clean detached Core checkout
  ├─ hanchou-skills/      managed clean detached Public Skills checkout
  └─ repositories/
      ├─ repository-a/    人間がcloneまたは作成
      └─ repository-b/    人間がcloneまたは作成

~/.local/share/hanchou/work/
  ├─ control/.beads/      profile共通のTask正本
  ├─ worktrees/           Leaf委任時にHanchouが自動作成
  ├─ relay/               完了・失敗・報告のdurable event
  └─ logs/                LaunchAgentのlog
```

Core、Public Skills、作業対象repositoryは同じprofile rootの別siblingとして分けます。
CoreとSkillsを`repositories/`へ入れたり、Hanchouを各作業repositoryへinstallし直したり
しません。

`init`、`update`、`rollback`、profile-root cwdはv2.4.0で利用できます。旧Core-cwd
deploymentから移行する場合は、先に[`SESSION_HANDOFF.md`](SESSION_HANDOFF.md)の
cutover手順を確認してください。

## 0. Security boundaryを理解する

新しいrepositoryへのdispatchはdeny-by-defaultです。標準`init` applyまたは単独`onboard`で許可する
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

`init --plan <token> --yes`と`onboard --yes`は人間が操作する通常terminalでしか実行できません。
`HERDR_ENV=1`のHerdr管理ペイン、`HANCHOU_AGENT_ID`を持つManaged Agent、
非対話実行からは拒否されます。AgentがHanchou CLIを使って自分の許可範囲を
広げられないようにするためです。ただし、同じmacOS userで動くprocessに対する
OSレベルの隔離ではありません。強い隔離が必要なら、別OS userまたは
Kingdom／VMを使ってください。

Orchestratorのcwdは`~/HanchouWorkspace/work`そのものです。これはprofile tree全体を
L0へ明示的に許可する選択です。L0はmanaged Core、managed Public Skills、canonicalな
作業repository shelfを直接read/writeでき、Role policyは委任を求めますがfilesystemで
direct accessを阻止しません。Agentに見せたくないものはprofile rootのどこにも置かないで
ください。

workとpersonalに別instanceを作っても、同じOS userのglobal integration、Agent定義、
plugin/tool linkまでは分離されません。異なるcommit pairを併用すると最後に成功した
`bootstrap`が共有設定を更新し、他profileとdriftし得ます。更新とbootstrapを直列化し、
各profileで`doctor`を確認します。hard isolationには別OS userまたはVMを使います。

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

## 2. Profile-local instanceを作る

最初の`init`だけは、信頼して取得したbootstrap用Hanchou checkoutから実行します。
`init`は対象profile、root、固定された公式public HTTPS remote、`refs/heads/main`の
Core／Skills candidate commit pairをdownloadして検証します。このprepare stepでは
deployed instance、launcher、managed checkout、repository shelf、registryをまだ作りません。
ただしcandidateのmise/npm/make codeを実行するため、prepare自体もManaged Agent外の
通常の対話terminalだけで受け付けます。

```text
Core    https://github.com/ykawase1011/hanchou.git         refs/heads/main
Skills  https://github.com/ykawase1011/hanchou-skills.git  refs/heads/main
```

初回だけ、profile rootの外へseed Coreをcloneし、そのseed自身がpinするNode.jsを
`mise`で用意します。`make check`が成功してから`init`へ進みます。

```bash
git clone --branch main --single-branch \
  https://github.com/ykawase1011/hanchou.git \
  "$HOME/HanchouBootstrap/hanchou"
cd "$HOME/HanchouBootstrap/hanchou"
mise install
mise exec -- npm ci
make check

./bin/hanchou init work
```

出力でcandidate pair、version、validation、rootを確認し、init applyが固定shelfも登録する
ことを理解したうえで、末尾の実token入りexact
commandを変更せずcopy/pasteします。形式は次です。

```text
$HOME/HanchouBootstrap/hanchou/bin/hanchou init work --plan <64hex-token> --yes
```

`<64hex-token>`はplaceholderであり、そのまま入力しません。applyはordinary interactive
terminalだけで受け付け、review済みcandidateを使って次の主要pathを作ります。

```text
~/HanchouWorkspace/work/
├── bin/hanchou
├── hanchou/
├── hanchou-skills/
└── repositories/
```

Hanchouは同時に`.hanchou/instance.json`、root-level `AGENTS.md`／`CLAUDE.md`、
`.codex`／`.claude` control filesを生成します。root-level instructionsがmanaged Core内の
Orchestrator Roleと運用文書を指すため、L0はprofile root cwdから起動できます。

両checkoutはそれぞれのexact commitでclean detached HEADになり、Coreのcandidateは
siblingのcandidate Skillsと組み合わせ、要求Skills version、共有`hanchou-cli`のbyte一致、
設定済みpublic Skillの存在まで検証されます。validationは一時HOME/XDGを使い、一般的な
GitHub token／HTTP proxy環境変数とambient Git設定を外し、npm install scriptを無効にします。
ただしcandidateの`make check`自体はOS sandboxなしのupstream code実行です。
launcherはsymlinkではないregular executableで、instance rootと`work` profileを固定します。
既存の未知file、symlink、
dirty checkout、remote/ref不一致には上書きせずfail closedします。plan後にcandidate、
registry、対象pathがdriftすればapply前に拒否します。正しい既存instanceへの再`init`は
状態を検証するだけで、updateとしては扱いません。applyは固定shelfをmachine-local
registryへ同時に登録する
ため、完了時点でworker dispatchに使えます。

初回profile rootは存在しないか、保持する`repositories/`と空の`.hanchou/`だけを含む必要が
あります。それ以外のroot entryや、内容のある未初期化control directoryを見つけた場合は
自動整理・上書きせず停止します。

作成後は必ずprofile rootへ移動し、local launcherを使います。

```bash
cd "$HOME/HanchouWorkspace/work"
```

ここから先のcanonical commandは`./bin/hanchou`です。seed checkoutや、最後に
bootstrapしたprofileへ向き得るuser-global linkはprofile selectorに使いません。
seed側で`git pull`して稼働instanceを更新せず、後述のlocal `update`を使います。

この時点ではまだserviceをbootstrapしていないため、完全な`doctor`成功は期待しません。
先に次節でshelf authorityを確認し、続く手順で`bootstrap`後に`doctor`を実行します。

managed checkout内で`git pull`、branch checkout、直接編集をしません。更新と復元は
後述の`update`／`rollback`だけで行います。また、repository-local Git config、
実行hook、replace／alternate系のobject
indirection、hidden index flagもmanaged stateとして拒否されます。

## 3. Repository shelfの許可を確認する

成功した`init` applyは空の`repositories/`を作り、同じhuman approval内でworker dispatchの
固定rootとして登録します。まず確認します。

```bash
./bin/hanchou project list --json
```

JSONに含まれる次の2つのpathを確認します。

```text
dedicated workspace: ~/HanchouWorkspace/work/repositories
human-owned registry: ~/.config/hanchou/work/projects.local.toml
```

`workspace_roots`に`work-repositories`が1件あれば追加操作は不要です。registryを別途削除した
場合など、固定shelf authorityだけを単独で再適用するときは`onboard`を使えます。最初は
plan-onlyです。

```bash
./bin/hanchou onboard
./bin/hanchou onboard --yes
```

このcommandは`init`済みshelfのmode `0700`とidentityを確認し、machine-local registryへ
`descendant-git-repositories`の許可を追加します。registryはmode `0600`で保存し、
既存fileを変えるときは同じdirectoryにtimestamp付きbackupを作ります。同じ設定へ
再実行しても重複登録しません。

もう一度`project list --json`で確認します。`onboard`を正常なinit直後に再実行しても
重複登録しません。

personal profileも分けて使う場合だけ、同様に次を実行します。

```bash
cd "$HOME/HanchouBootstrap/hanchou"
./bin/hanchou init personal
# plan出力のexact token入りapply commandを実行
$HOME/HanchouBootstrap/hanchou/bin/hanchou init personal --plan <64hex-token> --yes
cd "$HOME/HanchouWorkspace/personal"
./bin/hanchou project list --json
```

workとpersonalは別のprofile root、managed commit pair、Beads、Relay、Herdr session、portを
使います。ただし、同一OS userのglobal integrationまで完全に独立するわけではありません。

## 4. Hanchouを構築する

`plan`で変更予定を読み、`bootstrap`でmise tool、provider integration、Skills、
Herdr plugin、Beads、beads-ui、macOS LaunchAgentを構築します。

```bash
./bin/hanchou plan
./bin/hanchou bootstrap
sleep 5
./bin/hanchou doctor
```

`bootstrap`は既存の管理対象設定を変える前にbackupを作ります。`doctor`では少なく
ともmise、Herdr／Node.js version、Beads、Codex、Claude Code、provider integration、
herdr-automations、beads-ui、Hanchou Dashboard、Skills、project registryを確認します。

`doctor`がすべて`ok`なら、日常利用は次の1 commandです。

```bash
./bin/hanchou launch
```

`bootstrap`は`~/.local/bin/hanchou`のようなuser-global entrypointも管理し得ます。ただし
これはprofile-local selectorではなく、最後に成功したbootstrapのinstanceを指し得る共有stateです。
複数profileを使う場合は常に`<profile-root>/bin/hanchou`を使います。PATHにlocal commandが
見つからない場合だけ、そのterminalで次を実行し、必要なら同じ設定を`~/.zshrc`へ追加します。

```bash
export PATH="$HOME/.local/bin:$PATH"
```

単一profileでglobal `hanchou` commandを使う場合も、どのinstanceを指すか確認します。
`launch`は稼働中のHerdr、beads-ui、Dashboardを確認し、`orchestrator`を開始または
初期化して、Dashboardをdefault browserで開きます。管理serviceがまだ構築されて
いない場合は勝手に別構成を作らず、`./bin/hanchou bootstrap`を案内します。

browserを開かない場合は次です。

```bash
./bin/hanchou launch --no-browser
```

## 4.1 Instanceを更新・rollbackする

更新planは両方の固定remoteから`refs/heads/main`をfetchし、現在pairとcandidate pair、
version、candidate validationを表示し、各candidateが対応するcurrent commitから
fast-forwardであることを要求します。両tipがcurrent pairと同じならapply tokenなしで
currentと報告します。fetchはGit objectを
追加し得ますが、running checkoutとcurrent pairは切り替えません。
candidateのmise/npm/make codeを実行するため、bare updateもManaged Agent外の通常の
対話terminalだけで受け付けます。

```bash
cd "$HOME/HanchouWorkspace/work"
./bin/hanchou update
# 出力されたexact commandをreviewしてcopy/paste
./bin/hanchou update --plan <64hex-token> --yes
```

上のapply行は説明用の形式です。実際のplanはprofile-local launcherのabsolute pathを
含むexact commandを表示するため、その1行を変更せず使います。

tokenはprofile/root、現在pair、candidate pair、version、固定remote/ref、machine-local
project registry digestに束縛されます。prepared candidateもapply前に再検証します。
applyはupstreamを再解決せず、plan時のexact Core／Skills pairだけを切り替えます。
切替前のpairをpreviousとして
記録し、両checkoutをactivateした後に`bootstrap`と`doctor`を実行します。途中失敗や
half-pairを成功とは記録せず、元pairへの自動復元と再bootstrap／doctorを試みます。
自動復元も失敗した
場合はtransactionを残すため、そのpathを人間がinspectしてからrecoveryします。
この状態ではautomatic `rollback`も含むlocal lifecycle commandが拒否されます。journalだけを
削除してretryせず、両managed checkoutとinstance metadataを一貫して確認・修復するreviewed
maintainer手順が必要です。

```bash
./bin/hanchou rollback
# previous/current pairを確認してcopy/paste
./bin/hanchou rollback --plan <64hex-token> --yes
```

rollbackはpreviousのCore／Skills pair全体を復元し、同じく`bootstrap`と`doctor`を実行します。
rollback prepareもcandidate validation codeを実行するため、同じordinary-terminal制約です。
片方だけのrollback、任意commit指定、自動`latest` poller／daemonはありません。upstream
`main`のexact commit pinは再現性とplan/apply間のすり替わりを抑えますが、release署名ではなく、
upstream compromiseから保護するcryptographic authenticityにはなりません。

update／rollback applyは`stop-orchestrator`を呼んでL0 workspaceを意図的に閉じませんが、
必須のbootstrapが変更されたHerdr／Dashboard等をreloadし得るため、running sessionが無影響とは
限りません。Roleやinstruction変更を読み込ませるには、成功後に
`./bin/hanchou open orchestrator`で`/exit`し、`Ctrl+B`、`q`でdetachしてから
`./bin/hanchou start-orchestrator`を実行します。同じrecorded paneが再利用されます。

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
`REPOSITORY`はcloneしたdirectory名に置き換え、新規例なら`example-app`を指定します。

```bash
cd "$HOME/HanchouWorkspace/work"
REPO="$HOME/HanchouWorkspace/work/repositories/REPOSITORY"
./bin/hanchou project resolve --path "$(git -C "$REPO" rev-parse --show-toplevel)"
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
| Dashboardを開く | `./bin/hanchou open dashboard` |
| Herdr TUI全体を開く | `./bin/hanchou open herdr` |
| OrchestratorへfocusしたHerdr TUIを開く | `./bin/hanchou open orchestrator` |
| Task画面を開く | `./bin/hanchou open tasks` |
| Automation boardを開く | `./bin/hanchou open automations` |

最初は次を実行します。

```bash
./bin/hanchou open orchestrator
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
`./bin/hanchou open orchestrator`で戻れます。

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
cd "$HOME/HanchouWorkspace/work"
./bin/hanchou execution inspect <task-id> --json
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
./bin/hanchou open herdrm
# または、Dashboard起動と同時に試す
./bin/hanchou launch --herdrm
```

非互換ならHanchou本体は起動したまま、Herdrmだけを開かず理由を表示します。
別profileのcompatibility linkやdefault sessionが既にある場合も、安全のため同じです。
互換環境でもmonitor／attach専用とし、HerdrmのNew AgentからHanchou管理の
OrchestratorやWorkerを新規作成しないでください。標準操作はHanchou Dashboardと
`./bin/hanchou open herdr`です。

Herdrmでpaneへattachする操作と、`herdr agent attach`／`herdr terminal attach`は
同じpaneに対して同時に使えません。direct attachの書き込みownerは1つだけです。
前のdirect viewを`Ctrl+B`、`q`でdetachしてから別のdirect clientを使ってください。
`Another client took this pane over`と表示された場合、Agentが停止したのではなく、
後から接続したclientへ表示・入力ownerが移ったという意味です。通常は
`./bin/hanchou open orchestrator`のfull Herdr TUIを使えばこの競合を避けられます。

## 10. よくある状態

### `orchestrator ... blocked; initialization remains pending`

初回のproject／hook review待ちです。次でfull Herdr viewを開き、表示された対象が意図した
Hanchou checkoutとHerdr integrationであることを確認してからtrustします。

```bash
./bin/hanchou open orchestrator
```

古いAgentを`apply`より前から動かしていた場合は、Agent内で`/exit`し、`Ctrl+B`、`q`で
通常terminalへ戻って次を実行します。同じworkspace／paneが再利用されます。

```bash
./bin/hanchou start-orchestrator
```

### `agent target orchestrator not found`

まだOrchestratorが作られていません。通常terminalで次を実行してから再度attachします。

```bash
./bin/hanchou launch
./bin/hanchou open orchestrator
```

### `00-orchestrator`が複数表示される

過去版では、初回trust待ち、Herdr再起動、または`/exit`後にAgent名が見えなくなると、
残っているworkspaceを認識できず新しい`00-orchestrator`を作ることがありました。
現行版は作成したworkspace／pane IDを保存し、起動を直列化して同じpaneを再利用します。
未管理の古い候補が残っている場合は、新しいworkspaceを作らず停止します。ただし、
要求kind、`00-orchestrator` label、1 tab／1 pane、no-worktree、approved Hanchou workspace cwd、全IDが一致する
live named `orchestrator`だけは、過去版から安全にbindingへ移行してそのまま維持します。

通常のapproved cwdはexact profile rootです。移行中だけ、`init`がmetadataへ明示的に記録した
pre-2.4 bootstrap Core rootも対象にできます。任意の旧pathは追加せず、新しいprofile-root
workspaceを作成できた時点でlegacy allowanceを消去します。

すべて止めて1つだけ作り直す標準手順は次です。まず通常terminalでplanを表示します。

```bash
./bin/hanchou stop-orchestrator --all
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
- paneのbase cwdが実体pathとしてapproved Hanchou rootと一致する
- 1 tab／1 paneで、worktreeを持たない
- workspace／tab／pane／terminal IDと保存済みbindingに矛盾がない
- Agentがいる場合は設定済みの名前／kind／pane identityと一致する
- Herdr `pane process-info`のresult type、foreground PID／PGID／TTY、process recordが妥当である
- 既定modeでは、Agentがいない古いpaneはcwdがapproved rootと一致する利用可能なshellだけがforegroundにいて、
  OS process tableで同じTTYまたはshell descendantとして観測できる追加processが0件である

`refusing to stop same-label workspace ...: expected one tab, one pane, and no worktree`は、labelは
一致したものの、このhard containmentに違反したため何も閉じなかったという意味です。
`--include-unmanaged`はpane activityだけの限定overrideなので、このtopology違反は解除しません。
Herdr TUIでtab／pane／worktreeとprocessを確認し、人間が安全を判断できるrowだけを手動整理します。

同じlabelでも1件を安全に検証できなければ、最初の検査では1件も閉じません。planの全対象を
終了してよければ、出力末尾のcommandを文字を変えずにcopyし、同じ通常terminalへ貼り付けます。
表示形式は次のとおりです。

```text
<exact-profile-local-launcher> stop-orchestrator --all --plan <64hex-token> --yes
```

local launcherからplanした場合は、`<exact-profile-local-launcher>`に実際のabsolute
`.../HanchouWorkspace/work/bin/hanchou` pathが出ます。pathも含めてそのまま使います。

`<64hex-token>`は説明用placeholderなので、その文字を入力したり自分でtokenを作ったりしません。
直前のplanが表示した64文字のlowercase hexを含む1行をそのまま使います。このtokenはreviewした
profile設定のdigest、全profile state path、binding、workspace／pane／Agent／process identityなどの
対象snapshotに束縛されます。plan後にAgent statusやprocessを含む対象状態が変わると、applyは
1件も閉じずに新しいplanを表示して拒否します。その新しいplanを読み、新しいexact commandを
使ってください。cleanup modeもtokenに束縛されるため、後述の`--include-unmanaged`を付けた
tokenと既定modeのtokenは交換できません。

#### 既定planがbusyな未管理paneを拒否した場合

まず`./bin/hanchou open herdr`で対象を確認します。既定planの拒否理由を解消できるなら、processを
終了してapproved Hanchou rootへ戻した後、最初の`--all`を再実行するのが標準です。解消できず、かつ人間が
そのpaneの全processを終了してよいと明示した場合だけ、通常terminalで次のread-only planを
使います。

```bash
./bin/hanchou stop-orchestrator --all --include-unmanaged
```

このmodeがactivity判定を緩和できるのは、unboundかつAgent recordがないlegacy paneだけです。
`UNMANAGED-ACTIVE` rowの`processes`、pane-reported `cwd`、全foreground processの
`process_cwds`、`observed_additional`、`base_cwd`、`reasons`を1件ずつ読みます。
reasonは`foreground_busy`、`background_processes_observed`、`process_scan_unavailable`、
`stale_pane_authority`の組合せです。paneと全foreground processのcwdがapproved rootの
いずれかと実体pathで完全一致することはhard containmentであり、このmodeでもoverrideしません。
`observed_additional=n/a`は0件ではなく、busyなどでOS scan結果を確定できなかった意味です。

> **警告:** `unmanaged`は「空」や「安全」ではありません。有効なAgent recordがないという
> 意味だけです。applyは表示されていないprocessを含むpaneのOS process session全体を終了します。
> 不明なrowが1件でもあれば実行せず、Herdr TUIで手動整理してください。

このmodeでもexact label、approved rootのbase/current/process cwd、1 tab／1 pane、no-worktree、opaque ID、binding、
実在Agent、Herdr process-info schemaの整合は必須です。`process_scan_unavailable`は後段のOS
process table scanだけを指し、malformedなHerdr responseを許す理由ではありません。別label、
approved root外のcwd、worktree、foreign Agentなどを閉じるforce optionでもありません。全rowを
承認できる場合だけ、plan末尾に表示された次の形式のexact commandをそのまま貼り付けます。

```text
<exact-profile-local-launcher> stop-orchestrator --all --include-unmanaged --plan <64hex-token> --yes
```

状態変化やpartial failure後は、flagを外さず次から再planし、新しいexact commandを使います。

```bash
./bin/hanchou stop-orchestrator --all --include-unmanaged
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
./bin/hanchou start-orchestrator
./bin/hanchou open orchestrator
```

自動手順がcwd、pane構成、worktree、bindingなどの不一致を理由に拒否した場合は、手動整理を
fallbackにします。`./bin/hanchou open herdr`でfull Herdr TUIを開き、sidebarで内容を確認します。
live Agent named `orchestrator`を残して重複だけ整理する場合は、そのrowを1つ残します。閉じて
よいと人間が確認できた各rowを選び、`Ctrl+B`を押して指を離し、`Shift+D`を押してcloseを
承認します。すべて作り直す場合だけ、確認済みの`00-orchestrator`をすべて閉じます。手動closeも
PTY内のprocessを終了するため、内容が不明なrowは閉じないでください。整理後は上と同じ
`start-orchestrator`／`open orchestrator`を実行します。

### `HERDR_ENV=1`ではないと言われる

通常のCodex／Claude sessionへ質問を送っています。Hanchouのlive Agent状態を扱う
依頼は、`./bin/hanchou open orchestrator`で開いたHerdr管理Agentへ送ってください。
一方、profile rootの`./bin/hanchou onboard --yes`は通常terminalで実行するのが正解です。
tmuxを使っても現在のAgentがHerdr管理Agentへ変わるわけではありません。
`HERDR_ENV=1`を手動で設定せず、実Herdr操作は必ずHerdr内で起動したAgentへ依頼します。

### `server is shutting down`または`server shut down`

Herdrの更新処理が完了する前に`start-orchestrator`や`open orchestrator`を実行した状態です。
これらのcommandはHerdr service自体をinstallしません。通常terminalでprofile-local updateを
plan/applyし、pair activationに含まれる`bootstrap`と`doctor`を完了します。

```bash
cd "$HOME/HanchouWorkspace/work"
./bin/hanchou update
# candidate pairと影響を確認して、plan出力のexact commandを実行
./bin/hanchou update --plan <64hex-token> --yes
./bin/hanchou launch
```

`doctor`がすべて`ok`になった後に`./bin/hanchou open orchestrator`を実行します。
現行版はshutdown中でも成功するversion Pingだけではreadyと判定しません。

### Dashboardまたはbeads-uiが開かない

Hanchou pairを更新した後は、新しいLaunchAgentやintegrationが追加・変更されている場合が
あります。`update` applyは`bootstrap`と`doctor`まで行い、`launch`は設定を勝手にinstallしません。
updateせず現在pairを再構築する場合は次を使います。

```bash
cd "$HOME/HanchouWorkspace/work"
./bin/hanchou plan
./bin/hanchou bootstrap
sleep 5
./bin/hanchou doctor
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
./bin/hanchou project list --json
./bin/hanchou project resolve --path /absolute/path/to/repository
```

既存の機密repositoryを専用rootへ移動して回避しないでください。exact entryが必要な
場合は[`PROJECT_WORKSPACES.md`](PROJECT_WORKSPACES.md)の手動設定を使います。
