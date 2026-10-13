# Project Hanchou example

Install `hanchou-orchestrator` locally in the existing project without editing
its instructions. Open a new Orca Codex pane and use:

```text
$hanchou-orchestrator を使って、Project Hanchouとして開始してください。
対象はこのrepositoryです。
実作業は必要に応じてOrca Orchestrationでworkerへ委譲し、結果をまとめてください。
```

In a Claude Code pane, replace the first invocation with
`/hanchou-orchestrator `.

Other panes in the same project remain ordinary Orca sessions unless explicitly
activated.

New improvement notes use `.hanchou/hanchou_update.md` as the default candidate;
an explicit destination takes precedence. Verify the exact memo and auxiliary
paths are local, untracked and effectively ignored before writing. If no
authorized safe location is available, defer. Keep any legacy
`tmp/hanchou_update.md` and its receipts in place; select the source explicitly
before publishing when old notes make an unspecified request ambiguous. See
the [improvement workflow](../../docs/IMPROVEMENTS.md).
