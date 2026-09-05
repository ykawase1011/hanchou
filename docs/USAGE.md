# Usage

## 明示呼び出し

利用者向けpromptではskill名を明示します。

- Codex: `$hanchou-orchestrator`
- Claude Code: `/hanchou-orchestrator`

以下はCodex用のcopy-and-paste例です。Claude Codeでは先頭の
`$hanchou-orchestrator を使って、`を`/hanchou-orchestrator `へ置き換えます。
自然文だけでも選択される場合はありますが、標準の起動方法にはしません。

## Project Hanchou

```text
$hanchou-orchestrator を使って、Project Hanchouとして開始してください。
対象はこのrepositoryです。必要な実作業はOrca Orchestrationでworkerへ委譲し、
必要なreview後に最終結果をまとめてください。
```

## Cross-project Hanchou

```text
$hanchou-orchestrator を使って、Cross-project Hanchouとして開始してください。
対象はこのworkspaceで許可されたrepositoryです。repositoryごとにOrca workerを
割り当て、横断する依存関係と最終結果をまとめてください。
```

## Temporary Hanchou

```text
$hanchou-orchestrator を使って、このmigration専用のTemporary Hanchouとして
開始してください。完了まで複数workerと必要なreviewを管理し、結果をまとめてください。
```

## 通常のOrca session

Hanchouを指定しなければ、CodexとClaudeは通常どおり動作し、Hanchou Runは
作成されません。installだけではactivateしません。

## 起動後の依頼

最初のactivateでHanchouは2つの公式live guideを読み、runtimeと公開contractを
確認して、このpaneのRunを作成または確認します。同じpaneの後続依頼では
skill名を繰り返す必要はありません。新しいpaneでは再度明示します。

通常の監督型flowでは、必要最小限のTaskを作り、workerを開始し、Run Inboxのeventを
処理し、必要なら独立reviewを追加してから、受け入れた結果をまとめます。

ユーザーが作業の完全な引き渡しを明示した場合は、公式full-handoffを使い、Hanchouは
そのworkerを監督・待機しません。
