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

## 更新確認と更新後の新しい会話

有効なHanchouは起動時と別の新規依頼の開始時に、導入済みの任意helperで
読み取り専用の更新確認を一度行います。初回依頼と起動は一回として扱い、同じ依頼の
追記・worker通知・再開では繰り返しません。helper未導入、通信失敗、baseline不明、
ローカル変更があっても元の作業は続けます。通常のOrca sessionでは起動せず、
timerやcronは追加しません。確認対象は既存skillのsubset・scope・agent・pinで、
関係のないrepository commitだけでは更新ありと通知しません。

```text
$hanchou-update で既存Hanchou skillの更新を確認してください。
```

これは確認だけの依頼で、更新や交代の許可にはなりません。一方、通常の
「`$hanchou-update`でHanchouを更新して」は、既存scope/agentの更新、新しい可視タブで
更新内容と引き継ぎの受領を確認、旧自分のcloseまでを含み、追加承認は求めません。
「files-only」は起動・closeなし、「旧会話を閉じない」は旧endpoint保持、対象scopeの
限定や適用される反対の継続指示も優先します。起動時checkに適用するinstallation-onlyの
継続許可は交代権限に広げません。選択skillの内容が変わらず、現行会話が古い内容を
読んでいる証拠もなければ再install・新タブ作成は不要です。明示的なreload依頼は別扱いです。

公開機能と安全な区切りの検証は省略しません。未完了の業務Task/worker、Inbox、
ユーザー判断、CI待ち、成果物・固定参照元を失う状態では交代しません。交代操作自体の
完了はpendingのまま進められ、自分のclose結果を起動前提にはしません。同一依頼の
wakeや再試行では既存receiptを確認し、新タブを増やしません。

更新したファイルと、新しい会話で実際に読んだskillのpath・内容・revisionを照合し、
引き継ぎを受領した応答を確認します。sendのacceptedだけでは不十分です。
調査したOrca 1.4.224公開CLIでは、独立structured sessionの自動交代とcurrent Runの
所有権移譲は未資格です。該当経路では現行会話を保持し、作業がsettleした後に利用者が
通常操作で新タブを開く回復手順を案内します。旧Runへの二重coordinatorや
worker-start、通常のrun-useを代用しません。旧業務がsettleした新会話/新Runには
current Run移譲を要求せず、同じRunの維持を別途求める場合だけ移譲契約が必要です。
詳細は[更新の受入と制限](UPDATE_VALIDATION.md)へ。

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

Hanchouがworktreeを新規作成するときの既定名は、用途が分かる短い`hanchou-`名です。
通常作業・調査・対話coordinator・追加worker・レビュー・再試行に適用し、例えば
`hanchou-fix-login`、`hanchou-coordinator`、`hanchou-review-login`を使います。
明示された名前を優先し、既にある`hanchou-`は重ねません。定期業務の継続利用先は
`hanchou-cron`、ジョブの分離が必要なら`hanchou-cron-<job-name>`が既定です。
命名だけを理由に新規作成や既存worktreeの改名・移動は行いません。
同名でもproject・host・必要な親子関係・用途・所有者を確認してから再利用し、
既定名の衝突には短い接尾辞か別の確認済み対象を選びます。明示名が衝突した場合は
勝手に変えず選択を確認し、作成結果が不明な場合は別名で重複起動せず元のreceiptを照合します。
詳細は[配置と命名](../skills/hanchou-orchestrator/references/placement.md)を参照してください。

ブラウザQAでは利用者の明示指定を優先し、指定がなければ必要な操作ができるOrca内蔵
ブラウザ、独立したagentブラウザ、必要時の利用者既存ブラウザの順に選びます。操作後の
対象URL・識別子・保存状態を確認し、効果が不明な変更操作は重ねません。改善メモは明示
された言語、なければ作業場所の開発文書の言語で書き、Issue公開時の言語は別に判断します。

DBを使う機能のQA開始前には、許可済みの非秘密metadataで意図した接続先と
アプリの実接続先を照合し、その機能のtable/view/schemaを使うread-only代表業務queryを
実効権限で確認します。HTTPや`SELECT 1`のhealth成功だけではreadiness合格にせず、
代表query成功も実画面/APIの機能QA完了とは分けます。失敗は接続先・構造・権限を
証拠で切り分け、未許可の修復やDB変更へ進みません。秘密値・行データを出さず、
最小boolean/許可済みmetadataと未実施の層を報告します。
[QA readiness acceptance](QA_READINESS_VALIDATION.md)に合成例と未検証範囲を示します。

起動やsendのreceiptだけで開始・受領・完了を断定しません。DB照合とブラウザ検証、
成果の受け入れとresource回収も区別します。判断規則と合成受入例は
[Policy acceptance](POLICY_ACCEPTANCE.md)を参照してください。

通知集約と会話終了後の定期継続は現在policy/design案です。この文書で通知設定や
scheduleは変更していません。継続の対象は元の対話とそのRunです。1つの対話の全依頼を同じRunで
管理し、再起動後はその依頼・Task・worker・CI・権限を照合します。Orcaの公開機能で
元の対話を定期的に起こせるかは未検証です。Automationのsession再利用だけでは
保証しません。元の対話を復元できない場合の後任・takeoverは今回の対象外です。
