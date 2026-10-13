# Orca Automations

Hanchou does not own a scheduler. Read the version-matched `orca-cli` guide and
use Orca Automations for creation, editing, deletion, manual runs, history,
timezone, remote targets, and missed-run handling. The optional
`hanchou-cron` helper manages explicit scheduled-job requests; see
[Scheduled work](CRON.md) for definition provenance and acceptance cases.

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
Fresh session is the default for an independent recurring job. Native session
reuse concerns a previous Automation session and is not a guarantee of waking
an original interactive Hanchou. Installation never creates an Automation.

The original interactive Run continuation path remains unqualified by the
current public contract.
The separate [continuation design](../skills/hanchou-orchestrator/references/continuation.md)
requires a qualified native wake of the original interactive conversation and
Run, including after restart. Automation session reuse does not qualify it.
