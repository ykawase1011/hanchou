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

## 改善メモとhelper

有効なHanchou sessionは作業の区切りで改善点をignore確認済みのlocalメモへ
記録できます。指定がなければ`tmp/hanchou_update.md`を候補にします。
記録は公開を意味しません。Issueへ移す依頼は`$hanchou-publish-issues`、
既存Hanchou skillの更新依頼は`$hanchou-update`を指定します。
Claude Codeでは同名の`/` commandを使います。helperだけの依頼でRunは作りません。
入力例、公開先確認、秘匿化、timeoutや部分成功は[Improvement workflow](IMPROVEMENTS.md)へ。

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

## 依頼ごとの方針と検証

配置・権限・完了条件は依頼ごとに保持し、途中の変更をworkerへ反映します。
例えば「workerとreviewは専用workspaceへ配置、PR作成まで許可、mergeと環境反映は
判断待ち」と指定できます。この場合、同じRunのまま専用配置を使い、許可済みのPR作成
まで進め、mergeを待ちます。指定のない利用者にはOrcaの公式配置既定を使います。

起動やsendのreceiptだけで開始・受領・完了を断定しません。DB照合とブラウザ検証、
成果の受け入れとresource回収も区別します。判断規則と合成受入例は
[Policy acceptance](POLICY_ACCEPTANCE.md)を参照してください。

通知集約と会話終了後の定期継続は現在policy/design案です。通知設定やscheduleは
変更していません。同じcoordinator/Runへの復帰や不在時の通知fallbackはOrcaの
公開機能による検証が必要であり、Automationのsession再利用だけでは保証しません。
