# Hanchou final specification

## 1. Goal

Hanchouは、1つの高品質なOrchestratorへ指示し、Task化・定期実行・
Claude/Codexへの委譲・session可視化・後追い報告を行うためのHerdr-first
configuration distributionです。便利機能のために別runtimeや別Task DBを
増やさず、各componentの正本を1つに限定します。

## 2. Architecture

```text
Human / future Chat
        │
        ▼
Codex Sol Orchestrator（Herdr上の論理Agent `orchestrator`）
        │
        ├─ Beads：Task / Decision / dependency
        ├─ herdr-automations：recurring schedule
        ├─ Hanchou Relay：Inbox / Dispatcher / Delivery
        └─ Herdr：Mission Lead / Worker / Reviewer / Writer / Editor
```

### State ownership

| State | Source of truth |
|---|---|
| Task、依存、Decision、due/defer、closure | Beads |
| Agent process、PTY、workspace、worktree、liveness | Herdr |
| Cron entry、run history | herdr-automations |
| 内部Agent間event、claim、lease、ack | Relay Inbox |
| ユーザー向けreportのpending/rendered/delivered | Delivery |
| 実装・調査結果 | Git / PR / report / verification artifact |
| 現在の会話 | Orchestrator provider session |

会話contextは継続性に使いますが、durable truthにはしません。

## 3. Orchestrator contract

Orchestratorは丁寧・簡潔な秘書です。キャラクター口調は使用しません。
L0は調査・実装を抱えず、即答・委譲・Decision requestのいずれかを返します。

委譲時は先に受付を返し、そのturnを終了します。

```text
Turn 1: 「Task hch-123として開始しました」
Background: Worker実行
Turn 2: Relay wake → 「Task hch-123が完了しました」
```

L0が直接行えるのは、Beads、Herdr、Schedule、Relay、Delivery、bounded artifact
確認、日次digestなどのcontrol-plane workです。

## 4. Delegation topology

```text
通常: Human → L0 → Leaf
複雑: Human → L0 → Mission Lead → Leaves
```

Herdr上の最大depthは2です。L2はHerdr Agentをspawnしません。
Claude↔Codex handoffは会話同期ではなく、plan、report、commit、diff、review
artifactで行います。

## 5. Model routing

- L0はCodex Sol固定。
- L1はClaude Opusをprimary、Codex Solをfallbackとし、weekly usage pressureで
  可変。
- L2はClaude Sonnet／Codex Terra。
- 日本語draftはCodex Writer、最終文章reviewはCodex Editor。
- code/artifact reviewはusage-aware。
- usage snapshotがmissing／staleの場合、推測でproviderを切り替えません。

## 6. Task model

中央Beads DBをprofileごとに1つ持ちます。初期はembedded Dolt＋Orchestrator
single writerです。WorkerはTask graphを直接変更せず、Relay eventで報告します。

- Epic：大きなユーザー依頼
- Task：委譲単位
- Decision：人間判断
- blocks：実行順序
- metadata：Herdr binding、routing、reporting、origin

Herdrの`idle/done`だけではBeadをcloseしません。Acceptance criteriaとdurable
artifactを検証します。

新規dispatchはmachine-local project registryでdeny-by-defaultとします。
人間がexact Git repositoryまたはsecret-freeな専用workspace rootを許可し、
Agentは`list/show/resolve/doctor`のみ行います。Beadのproject ID、canonical
repository path、profileをdispatch前に再照合し、Agent自身が許可範囲を広げる
commandは提供しません。初回の専用rootだけは、通常terminalの人間が固定pathを
plan確認後に登録する`hanchou onboard <profile> --yes`を提供します。この適用は
Managed Agent環境と非対話実行から拒否します。Leafごとのworktreeは許可照合後に
自動生成します。
これはGit作業分離であり、host上のsecret read isolationではありません。

## 7. Scheduler

Cronの正本はherdr-automationsです。

- `new-agent`：fresh Agent/worktreeで独立作業。
- `existing-orchestrator`：`schedule_due` eventをRelay Inboxへ保存し、同じL0を
  wakeするHanchou extension。

定期実行にはreporting policyを必須とします。日次digestは通常
`existing-orchestrator + always`です。

## 8. Relay and Delivery

`Mailbox`ではなく`Hanchou Relay`を正式名称とします。

```text
Relay
├─ Inbox       durable internal events
├─ Dispatcher  Herdr stateを見てtargetをwake
├─ Delivery    user-facing report lifecycle
└─ Receipts    processing / delivery acknowledgement
```

Inboxは`pending → processing → acknowledged/dead-letter`、Deliveryは
`pending → rendered → delivered/failed`です。Lease切れはretry可能です。

## 9. Reporting

Policy：`silent`、`parent_only`、`on_failure`、`on_change`、`on_terminal`、
`always`、`digest`、`immediate`。

Renderer：`orchestrator`、`editor`、`producer`。

Destination：`local_session`、`origin`、将来のSlack／Discord channel/thread、
`file`。

Child Taskは原則`parent_only`、root user Taskは`on_terminal`、Decisionは
`immediate`、routine automationは`on_failure`、日報は`always`です。

## 10. CLI and Skill boundary

Hanchouは薄いCLIを持ちます。Skillはpolicy、CLIはatomic file operation、
command-level contract validation、lease、retry、stable JSON outputなどの
mechanicsを担当します。

- Task graphの通常操作は`bd`。
- Agent runtimeの通常操作は`herdr`。
- 通常のfresh-agent Cronは`herdr-automations`。
- Profile、routing、Relay、Delivery、cross-system operationは`hanchou`。
- machine-local project authorizationの照合は`hanchou project`。
- human-ownedな固定専用workspaceの初期登録は`hanchou onboard`。
- service readiness、Orchestrator開始、read-only Dashboard起動は`hanchou launch`。

GenericなTask／Agent facadeは作りません。`hanchou execution`は
Beads↔Herdrをまたぐdispatch/reconcileに限定し、`hanchou schedule`は
Hanchou reporting metadataまたは`existing-orchestrator` targetに限定します。
共通`hanchou-cli` Skillがこの選択規則をCodex／Claude Codeへ配布します。

## 11. Repositories

- `hanchou`：Coreと最終仕様。
- `hanchou-skills`：Public Skillsの正本。
- `hanchou-kingdom`：secret-free deployment/configuration。
- `hanchou-chat`：Core E2E後に選定・実装するoptional transport。

## 12. Tool installation and version management

Hanchouでは、HerdrおよびNode.jsのversion管理に`mise`を標準利用します。
HomebrewによるHerdrの直接installは標準手順としません。

`hanchou` repositoryの`mise.toml`を要求versionの正本とし、少なくとも次を
pinします。

```toml
[tools]
herdr = "0.8.2"
node = "22"
```

Core CLI、validator、generatorはerasable TypeScriptで実装し、pinされた
Node.js 22が直接実行します。runtime npm dependencyやcompile済みartifactを
要求せず、`mise install`直後から`./bin/hanchou`を再現可能にします。
TypeScript compilerとNode型定義はtypecheck専用のdev dependencyとしてlock
します。Python runtimeはHanchouの成立条件に含めません。

Herdrはplugin API、Socket API、Agent lifecycle、event、CLI contractへ
Hanchouが依存するため、`latest`へ自動追従しません。Herdrをupgradeする場合は
Hanchou Core E2Eを通し、`mise.toml`のversionを明示的に更新します。

初期セットアップの標準経路は次のとおりです。

```bash
# prerequisite
brew install mise git gh beads

cd hanchou
mise install

./bin/hanchou onboard work
./bin/hanchou onboard work --yes
./bin/hanchou plan work
./bin/hanchou bootstrap
./bin/hanchou doctor work
./bin/hanchou launch work
```

`bootstrap`はHerdrのCodex／Claude integration、Hanchou Skills、必要なHerdr
plugin等を初期設定します。既存のユーザー設定を変える場合はbackupを作成し、
変更内容を`hanchou plan <profile>`で事前確認可能にします。

`doctor`は少なくとも、mise、要求されたHerdr／Node.js version、Beads (`bd`)、
Codex、Claude Code、Herdrの両provider integration、herdr-automations、beads-ui、
loopback限定のHanchou Dashboard、Hanchou Skills、project registryを検証します。

Hanchou DashboardはTask／Agentの新しい正本や操作GUIではありません。Herdr、
Beads、Relay、workspace登録のread-only summaryと、各upstream UI／TUIへの入口だけを
profile別loopback portで提供します。状態変更API、CORS、telemetryは持ちません。
`launch`はbootstrap済みserviceのreadinessを確認してOrchestratorを開始・初期化し、
このDashboardを開きます。

Herdrmはoptionalです。Herdrm 0.5.xのdefault socketとHanchou named-session socketが
同じ実体だと確認できる場合だけmonitor／attach用途で開きます。人間がHerdrm起動を
明示した時点でdefault pathが存在せず、pin済みversionのlive named socketが同一user
所有だと確認できる場合だけcompatibility symlinkを作成できます。既存default socketを
上書きしたり、別のdefault Herdr sessionを起動したりしません。

`herdr-beads`はoptional dependencyでありCoreの成立条件に含めません。source
buildに追加toolchainが必要な場合、利用者がHerdr内Boardを必要とするときだけ
導入します。Beadsは初期構成でembedded Doltを使うため、standalone Dolt
serverの事前installは不要です。

Hanchouは可能な限りHomebrew、mise、Codex、Claude Codeが準備済みであれば、
以後の環境構築を`bootstrap`、`apply`、`doctor`から完結できることを目標とします。

## 13. Core milestone

Chat接続前に、以下をHerdr上で成立させます。

```text
Human → L0受付 → Bead → visible Worker → Relay event → L0後追い返答
Schedule → fresh Agent or same L0 → report policy → Delivery
```

Core E2Eが通るまではSlack／Discordを実装しません。
