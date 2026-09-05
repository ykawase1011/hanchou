# Orca Automations

Hanchou does not schedule work. Read the version-matched `orca-cli` guide and
use Orca Automations for creation, editing, deletion, manual runs, history,
timezone, remote targets, and missed-run handling.

Simple scheduled work should launch an ordinary Codex or Claude session.
Scheduled orchestration targets a workspace where `hanchou-orchestrator` is
installed and names the skill in the prompt. For a Codex target:

```text
$hanchou-orchestrator を使って、このAutomation run専用のTemporary Hanchouとして
開始してください。
対象の週次検証をworkerへ委譲し、必要なreview後に結果をまとめてください。
```

For a Claude Code target, replace the first invocation with
`/hanchou-orchestrator `.

Create a schedule disabled, inspect it, perform a manual run, and then enable it.
Fresh session is the default. Use native session reuse only when prior context is
required. Installation never creates an Automation.

There is no bridge from an Automation into an existing interactive Run in v3.
