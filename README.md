# Hanchou

Hanchouは、Herdr上に1つの永続Orchestratorを置き、Beads、定期実行、
Claude Code／Codex worker、共有Skillsを統合するための設定・policy・bridge
distributionです。独自のPTY runtime、Task DB、Cron engine、Chat transport、
GUIは再実装しません。

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

```bash
brew install mise git gh beads
mise install
mise exec -- npm ci
make check
./bin/hanchou plan work
./bin/hanchou bootstrap work
./bin/hanchou doctor work
./bin/hanchou start-orchestrator work
./bin/hanchou status work
```

Herdr 0.8.2とNode.js 22は`mise.toml`で管理します。HerdrをHomebrewから直接
installしたり、`latest`へ自動追従させたりしません。`herdr-beads`はoptional、
Beadsのstandalone Dolt serverは初期構成では不要です。Core CLI、validator、
generatorはTypeScriptで実装し、Node.js 22が直接実行します。runtime npm
dependencyとPython runtimeは必要ありません。

Task UI：

```text
work      http://127.0.0.1:3737
personal  http://127.0.0.1:3837
```

Herdr：

```bash
herdr --session work
herdr --session personal
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
