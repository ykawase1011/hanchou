# Usage

## 明示呼び出し

利用者向けpromptではskill名を明示します。

- Codex: `$hanchou-orchestrator`
- Claude Code: `/hanchou-orchestrator`

以下はCodex用のcopy-and-paste例です。Claude Codeでは先頭の
`$hanchou-orchestrator を使って、`を`/hanchou-orchestrator `へ置き換えます。
自然文だけでも選択される場合はありますが、標準の起動方法にはしません。

## Project Hanchou

任意のPJ責任方針は対象rootの`.hanchou/policy.md`から読みます。別sourceを
明示できます。初期化は`$hanchou-init`（Claude Codeでは`/hanchou-init`）で
依頼し、[Initialization](INITIALIZATION.md)の手順で内容を確認します。

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

「hanchou kaizen」「Hanchou 改善」で記録・確認・実装・公開・更新を依頼する場合は
`$hanchou-kaizen`（Claude Codeでは`/hanchou-kaizen`）を使えます。依頼の動詞と文脈で
振り分け、曖昧なら意図を確認します。単なる引用や改善の相談では公開、更新、
Hanchou起動は行いません。

有効なHanchou sessionは作業の区切りで改善点をignore確認済みのlocalメモへ
記録できます。新規メモは指定がなければ`.hanchou/hanchou_update.md`を候補にし、
明示された保存先を優先します。実パス・親やファイルのsymlink・追跡状態・有効な
ignore規則を確認し、安全なlocal保存先がなければ保留します。
旧`tmp/hanchou_update.md`とその未解決項目・receiptは自動移動や複製をせず保持します。
旧メモがある場合、参照元が未指定の公開依頼では対象メモと項目を明示してから処理し、
新しい既定メモが空でも旧項目を処理済みとはみなしません。
記録は公開を意味しません。Issueへ移す依頼は`$hanchou-publish-issues`、
既存Hanchou skillの更新依頼は`$hanchou-update`を指定します。
Claude Codeでは同名の`/` commandを使います。helperだけの依頼でRunは作りません。
入力例、公開先確認、秘匿化、timeoutや部分成功は[Improvement workflow](IMPROVEMENTS.md)へ。

## 定期実行の設定

定期業務の登録・確認・変更・停止・削除は`$hanchou-cron`（Claude Codeでは
`/hanchou-cron`）で明示的に依頼します。PJごとの静的ジョブ定義は
`.hanchou/cron/<job>.md`を標準候補とし、別の場所も明示できます。
同じPJに複数のジョブを置く場合は対象の一つを指定します。
設定だけではHanchou Runを作りません。独立した業務の手動試行・定期実行は
指定されたTemporary Hanchouを起動できます。手順と制約は
[Scheduled work](CRON.md)にあります。

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
PJ方針の責任と許可条件は現在の依頼に合わせて適用し、workerのTaskへsnapshotを
渡します。同じPJで新しく依頼されたTaskでも方針を読み直し、進行中Taskの
scopeは方針の編集だけでは拡大しません。方針に許可があっても自動で仕事を
作りません。明示的な後続指示はその
Taskの条件を変更できますが、1回限りの変更を既定方針へ保存しません。
例えば「workerとreviewは専用workspaceへ配置、PR作成まで許可、mergeと環境反映は
判断待ち」と指定できます。この場合、同じRunのまま専用配置を使い、許可済みのPR作成
まで進め、mergeを待ちます。指定のない利用者にはOrcaの公式配置既定を使います。
このrepositoryでのHanchou開発には`AGENTS.md`と`CLAUDE.md`に専用配置の方針があり、
対象workerのTask仕様と起動receiptを照合します。この方針を配布skillの全利用者へは適用しません。

ブラウザQAでは利用者の明示指定を優先し、指定がなければ必要な操作ができるOrca内蔵
ブラウザ、独立したagentブラウザ、必要時の利用者既存ブラウザの順に選びます。操作後の
対象URL・識別子・保存状態を確認し、効果が不明な変更操作は重ねません。改善メモは明示
された言語、なければ作業場所の開発文書の言語で書き、Issue公開時の言語は別に判断します。

起動やsendのreceiptだけで開始・受領・完了を断定しません。DB照合とブラウザ検証、
成果の受け入れとresource回収も区別します。判断規則と合成受入例は
[Policy acceptance](POLICY_ACCEPTANCE.md)を参照してください。

通知集約と会話終了後の定期継続は現在policy/design案です。この文書で通知設定や
scheduleは変更していません。継続の対象は元の対話とそのRunです。1つの対話の全依頼を同じRunで
管理し、再起動後はその依頼・Task・worker・CI・権限を照合します。Orcaの公開機能で
元の対話を定期的に起こせるかは未検証です。Automationのsession再利用だけでは
保証しません。元の対話を復元できない場合の後任・takeoverは今回の対象外です。
