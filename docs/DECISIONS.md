# Final decisions

## 確定

1. RuntimeはHerdrのみ。
2. Task正本はBeads、標準GUIはbeads-ui、Herdr内表示はherdr-beads optional。
3. Cron正本はherdr-automations。
4. L0 Orchestratorは当面Codex Sol。
5. L2は原則Claude Sonnet／Codex Terra。
6. 日本語draftと最終文章reviewはCodex Writer／Editor。
7. `Mailbox`の外向け名称は`Hanchou Relay`。
8. Relayを内部`Inbox`と外向け`Delivery`へ分ける。
9. Orchestratorは委譲後にturnを終了し、完了時はRelayが新しいturnを起こす。
10. 通常Task、定期Task、日次digestは共通Reporting policyを使う。
11. `hanchou-skills`をPublic Skillsのcanonical repositoryにする。
12. `hanchou-kingdom`はwork/personal共用のsecret-free repository。
13. Slack／Discordは`hanchou-chat`としてCore E2E後に選定する。
14. Hanchou CLIは薄いmechanics layerとして維持する。`bd`、`herdr`、
    `herdr-automations`の単独操作は直接行い、Hanchouは固有stateまたは
    cross-system operationだけを扱う。
15. `hanchou-cli` SkillをCodex／Claude Codeへ共通配布し、command surfaceの
    選択規則を明示する。
16. HerdrとNode.jsのversion管理は`mise`を標準とし、`hanchou/mise.toml`を
    要求versionの正本にする。HerdrはCore E2Eを伴う明示的upgradeのみ許可し、
    Homebrewからの直接installや`latest`への自動追従を標準手順にしない。
17. Hanchouのproduction実装、validator、generatorはTypeScriptへ統一する。
    Node.js 22のnative type strippingで実行し、runtime npm dependencyとPython
    runtimeを要求しない。TypeScript compilerはCI/typecheck専用とする。

## 初期default

| 対象 | Default |
|---|---|
| root user Task | `on_terminal`, `orchestrator`, `origin` |
| child Task | `parent_only` |
| Decision | `immediate` |
| routine Automation | `on_failure` |
| monitor | `on_change` |
| daily digest | `always`, `orchestrator`, `local_session` |

## 未決定

- `hanchou-chat`のtransport library。
- `existing-orchestrator` targetをherdr-automationsへupstreamするか、Hanchou
  plugin extensionとして保持するか。
- provider usageの安定した自動取得方法。初期はmanual snapshot。
- Beadsをembeddedからserver modeへ移行する閾値。
