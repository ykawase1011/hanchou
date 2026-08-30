# Legacy replacement audit

対象：`hermes-fleet`、旧`meidoya`、旧`meidoya-yashiki`で実現したかった内容。
判定日：2026-08-30

判定：

- **Covered**：選定済みupstreamまたはscaffoldで成立。
- **Planned**：設計済みだが実装／実機検証が必要。
- **Changed**：旧方式を意図的に置換。
- **Gap**：設計追加が必要。

## Product／UX

| 旧要件 | 新生構成 | 判定 | 備考 |
|---|---|---:|---|
| 1つの窓口へ指示 | Herdr上のCodex `orchestrator` | Covered | 同一sessionを論理窓口にする |
| 丁寧で簡潔な秘書 | Orchestrator Role | Covered | キャラクター口調なし |
| 即答またはTask化 | L0 response contract + Beads | Covered | worker完了前に受付返信 |
| 質問／完了中心の通知 | Relay Inbox + Delivery + future gateway | Planned/Core scaffold | local後追いturnを先に実装 |
| CLIだけでも利用 | Hanchou CLI + Herdr + Beads | Covered | gateway不要 |
| Slack／Discord入口 | future hanchou-chat | Planned | targetはorchestrator固定 |
| GUIでTask確認 | beads-ui | Covered | profile別loopback URL |
| 各Agent sessionを確認 | Herdr／HerdrM候補 | Covered | Herdrが正本 |

## Orchestration

| 旧要件 | 新生構成 | 判定 | 備考 |
|---|---|---:|---|
| Head/Maid/Manager/Worker固定階層 | L0／optional Mission Lead／Leaf | Changed | 伝言ゲームを減らす可変深度 |
| planning／implementation／review | Role + Beads child tasks | Planned | runtime強制bridgeが必要 |
| ClaudeとCodexの混在 | Herdr Agent kind + generated roles | Covered | artifact handoffを推奨 |
| project別worktree | Herdr worktree | Covered | execution bridgeが許可済みrepoからtask別branch/worktreeを作成 |
| max depth／step／loop | profile + role policy | Planned | central enforcement未実装 |
| no-progress／wedge検知 | Herdr state + reconcile | Planned | Firstmate相当の深い監視は未実装 |
| 再起動後の継続 | Herdr restore + Beads + Relay | Planned | E2E failure test未完了 |
| 待機中にworker processを残さない | Decision bead + worker終了方針 | Planned | 現在はpolicyのみ |

## Task／Cron

| 旧要件 | 新生構成 | 判定 | 備考 |
|---|---|---:|---|
| durable Task | Beads／Dolt | Covered | central DB per profile |
| dependency／ready queue | Beads | Covered | native graph |
| Task GUI | beads-ui + optional herdr-beads | Covered | 二重storeなし |
| AgentとTaskのbinding | Hanchou execution bridge | Implemented／live検証中 | dispatch/inspect/reconcileとWALを実装 |
| Agent自身がCron登録 | hanchou-schedule + herdr-automations | Covered/Planned | YAML操作は可能、typed CRUDは予定 |
| cron／interval／one-shot | herdr-automations | Partial | cron中心。one-shot wrapper要検討 |
| pause／resume／run-now／history | wrapper計画 | Planned | upstream一部機能を統一surfaceへ |
| same orchestrator wake | Relay Dispatcher / existing-orchestrator target | Planned | upstream fresh Agentとは別 |
| cronをTask/report pathへ統合 | run↔Bead↔Delivery link | Planned | 初期upstreamだけでは未達 |
| overlap／catch-up | herdr-automations | Covered | policy値の固定が必要 |

## State／Communication

| 旧要件 | 新生構成 | 判定 | 備考 |
|---|---|---:|---|
| child→parent疎通 | typed Relay | Covered | free-form transcriptは禁止 |
| durable Inbox／Delivery | Relay state + journal + receipts | Covered scaffold | live kill/retry testが必要 |
| idempotency／dedupe | event ID／claim lock／receipt | Covered scaffold | distributed multi-nodeは未対応 |
| Event log＋snapshot | journal + directory states | Partial | global event schema／replay設計は簡易 |
| auditability | Relay journal + Delivery receipt + Beads history | Partial | retention/redaction policy追加が必要 |
| conversation continuity | Herdr native session restore | Covered | durable truthは外部state |

## Permissions／Isolation

| 旧要件 | 新生構成 | 判定 | 備考 |
|---|---|---:|---|
| workspace越境禁止 | human-owned project registry + execution bridge | Covered locally | exact repo / trusted descendant-Git rootをdispatch前にfail-closed照合。host read isolationはVM境界 |
| Mac/Linux/Lima routing | Herdr remote + Kingdom node plan | Planned | provider lifecycle未実装 |
| credential分離 | Unix user/VM + provider-native auth + external secret manager | Planned | Kingdomはsecretを保持しない |
| fail-closed ingress binding | future hanchou-chat allowlist + fixed target | Planned | Core完成後に実装 |
| secret-bearing log禁止 | policy | Planned | log redaction testが必要 |
| command approval／Human Gate | Herdr/provider UI + Decision bead | Partial | Task gateの強制engineなし |

## `hermes-fleet`安全資産の継承

| 旧資産 | 方針 | 判定 |
|---|---|---:|
| bounded process-group kill | Herdrへprocess ownershipを委譲 | Changed |
| safe guest exec／Lima | hanchou-kingdomのsecret-free node blueprintとして再実装 | Planned |
| no-follow snapshot／filesystem safety | Kingdom bootstrapで再実装 | Planned |
| project/auth lock | Beads claim + local locks + Kingdom lock | Partial |
| Keychain／SOPS wrapper | external runtime integration（Kingdom外） | Planned |
| preflight／doctor／receipt | Hanchou doctor + Kingdom receipt | Partial |
| checksum／version pin | versions.toml + plugin ref | Covered |
| backup／rollback／reprovision | hanchou-kingdom | Planned |
| Hermes固有Gateway／Cron wrapper | 継承しない | Changed |

## 最終判定

新構成は、旧3repositoryで求めていた**利用体験と中核機能を実現できる設計**です。
ただし、現時点で完全に置き換え済みなのは、Runtime選定、Task正本、UI、Role、
Skill配布、Relay Inbox/Delivery scaffold、Cron engine選定までです。

本当の置換完了条件は以下です。

1. Beads↔Herdr execution bridgeがrestart-safeである。
2. recurring runとBeadが相互に追跡できる。
3. existing Orchestrator wakeがdurableである。
4. workspace/project bindingがfail closedである。
5. hanchou-kingdomがsecret-freeなwork/personal deployment、backup、rollback、reprovisionを担う。
6. optionalなLima/remote-node lifecycleをcredential非保持で検証する。
7. hanchou-chatはCore完成後に別境界として選定し、Gateway secretsを外部注入する。
8. kill／sleep／restart／duplicate／blockedのE2E試験を通す。
9. 定期Taskと日次digestがreporting policyどおりDeliveryされる。

この9点を満たすまでは、旧構想を**設計上は代替できるが、運用上の完全代替は未完了**と評価します。
