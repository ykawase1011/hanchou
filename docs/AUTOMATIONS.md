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

This snippet illustrates activation only. An independent Hanchou job needs the
approved scope, pinned job definition, and a separately pinned project policy
source or explicit no-policy decision in its registered prompt; see
[Scheduled work](CRON.md). The occurrence uses that decision rather than a
fresh lookup of the interactive default policy.

Create a schedule disabled and inspect it. Perform only a bounded check within
the approved timing and effects; scheduled merge or deployment permission does
not authorize doing it immediately for setup. Enable after verified limited
checks only within the user's decision, and report untested effects. If a safe
check cannot be verified, leave disabled and ask how to proceed.
Fresh session is the default for an independent recurring job. Native session
reuse concerns a previous Automation session and is not a guarantee of waking
an original interactive Hanchou. Installation never creates an Automation.

The original interactive Run continuation path remains unqualified by the
current public contract.
The separate [continuation design](../skills/hanchou-orchestrator/references/continuation.md)
requires a qualified native wake of the original interactive conversation and
Run, including after restart. Automation session reuse does not qualify it.
