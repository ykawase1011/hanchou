# Cross-project Hanchou example

Use a dedicated Orca folder workspace when one Hanchou must coordinate work
across repositories.

1. Create or open the dedicated workspace.
2. Local-install `hanchou-orchestrator` there.
3. Copy `AGENTS.md`, `CLAUDE.md`, and `POLICY.example.md` into the workspace.
4. Replace the repository placeholders in the policy and review the scope.
5. Open a new Orca pane and explicitly invoke the skill.

For Codex:

```text
$hanchou-orchestrator を使って、Cross-project Hanchouとして開始してください。
対象はこのworkspaceのpolicyで許可されたrepositoryです。repositoryごとにworkerを
割り当て、依存関係と最終結果をまとめてください。
```

For Claude Code:

```text
/hanchou-orchestrator Cross-project Hanchouとして開始してください。
対象はこのworkspaceのpolicyで許可されたrepositoryです。repositoryごとにworkerを
割り当て、依存関係と最終結果をまとめてください。
```

Keep credentials and mutable Orca identifiers out of the policy file.
