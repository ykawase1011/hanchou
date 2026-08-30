# Document index

## 最初に読む

- `FINAL_OVERVIEW.md`：最終構成の1-page summary
- `../HANCHOU_SPEC.md`：最終architecture specification
- `DECISIONS.md`：確定事項と未決定事項
- `PLANNING.md`：実装順序、acceptance criteria、非目標
- `SESSION_HANDOFF.md`：次の実装sessionへ渡す要約

## Domain別

- `ARCHITECTURE.md`：componentとstate ownership
- `REPOSITORY_BOUNDARIES.md`：4 repositoryの責務
- `AGENT_DEFINITIONS.md`：L0/L1/L2 Roleとprovider定義
- `MODEL_ROUTING.md`：usage-aware routing
- `TASKS.md`：Beads model、metadata、Task lifecycle
- `SCHEDULER.md`：Cron、existing-orchestrator wake、digest
- `RELAY.md`：Inbox、Dispatcher、lease、ack
- `REPORTING.md`：Reporting policy、Delivery、destination
- `EXECUTION_BRIDGE.md`：Beads↔Herdr binding
- `HANCHOU_CHAT.md`：将来のSlack／Discord境界

## 運用・検証

- `ONBOARDING.md`：初心者向けの専用workspace作成、起動、Herdr／Herdrm操作
- `COMMANDS.md`：CLI surface
- `CLI_AND_SKILL_BOUNDARY.md`：CLIを残す理由とupstream CLIとの境界
- `CONFIGURATION_MATRIX.md`：設定値と所有repository
- `PROJECT_WORKSPACES.md`：repository配置、human-owned allowlist、自動worktree境界
- `OPERATIONS.md`：apply、startup、backup、recovery
- `CORE_E2E_TEST_PLAN.md`：Core live E2E
- `VALIDATION.md`：静的検証と未検証範囲
- `LEGACY_REPLACEMENT_AUDIT.md`：旧構想の置換監査
- `SHARED_SKILLS.md`：Public／Private Skill配布
