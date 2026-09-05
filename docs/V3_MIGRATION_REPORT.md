# Hanchou v3 migration report

## Final architecture

Hanchou v3は、既存Orca workspaceへlocal installできる1つのoptional
`hanchou-orchestrator` skillです。Orcaがruntime、GUI、workspace/worktree、
terminal/agent lifecycle、Run/Task/Dispatch/message/gate、Automationを所有します。
Hanchouが所有するのはtask分解、routing、review、reportingのpolicyだけです。

1つのHanchou instanceは、1 coordinator pane、1 CodexまたはClaude session、
1 skill、1 bound Runです。同一Orca runtimeでProject、Cross-project、Temporary
Hanchouを任意個数動かせます。各paneとRun、各Taskのownerは分離します。

## Orca baseline

- 初回調査日: 2026-09-02
- 再確認日: 2026-09-03
- request baseline / installed runtime: v1.4.195
- latest release: v1.4.196
- latest release commit: `aad4ae42ea5e555f25fdec679ebbcd18cc1e8911`
- installed v1.4.195 commit: `bc2f593ebba70a0ee6ff900129e4918f57b143aa`
- packaged CLI guide: `orca-cli` 414行、`orchestration --full` 437行
- core official skills: `orca-cli`, `orchestration`
- optional official skills: `computer-use`, `orca-per-workspace-env`,
  `orca-linear`, `orca-emulator`, `orca-emulator-android`

実行時は常にinstalled binaryのlive guideを優先します。

## Distribution state

- `hanchou`: v3.0.0の唯一の主要distribution。core skill、7つのpolicy
  reference、examples、docs、repository validationだけを保持。
- `hanchou-skills`: core dependencyから除外し、deprecated pointerへ縮小。
- `hanchou-kingdom`: install/runtimeから除外し、deprecated pointerへ縮小。
- `hanchou-chat`: scope外。実装なし。

Pre-migration sourceはlocal annotated tagとして固定しました:
`hanchou/v2.4.0`、`hanchou-skills/v0.3.0`、
`hanchou-kingdom/v2.3.1`。release時に各remoteへpublishする必要があります。

## Removed responsibilities

Production CLI、Node runtime、Herdr/Beads integration、Task DB、Relay/Delivery
mirror、wake/poll daemon、scheduler、Dashboard/status server、loopback port、
launchd templates、managed checkout、paired update/rollback、profile launcher、
mutable project registry、model gateway、duplicate agent launcherを削除しました。
旧architectureはGit historyに残し、current pathでは正規経路にしません。

## Verification

- `make check`: pass
- shell syntax、trailing whitespace、`git diff --check`: pass
- standard `skills` 1.5.23 local install: pass
- install対象の既存README/AGENTS/CLAUDE/policy hash不変: pass
- Codex CLI 0.152.1の通常依頼非発火・自然文による明示activation: pass
- Claude Code 2.1.234の通常依頼非発火・自然文による明示activation: pass
- 両provider sessionでv1.4.195 live guideを先に取得しruntime gateで停止: pass
- v1.4.195 asset checksumとbundle version: pass
- packaged CLIから2つのlive guide取得: pass
- runtime unavailable時のfail-closed response: pass
- installed runtimeのpublic `orchestration.contract.v1`とread-only binding
  probe: pass
- Settings → Orchestrationの正式ページ、skill coverage、worker depth表示: pass
- `orchestration_feature_disabled` fixtureでguide/status/read-only probe後に
  Runを作らず手動Settings案内だけを返すfail-closed forward test: pass
- v1.4.188 official headless runtime起動: pass
- 同一repoの2 coordinator pane / 2独立Run: pass
- Project Task / worker-start / question / reply / worker_done: pass
- independent review Task / worker-retain: pass
- `hanchou`、`hanchou-skills`、`hanchou-kingdom` local routing: pass
- runtime/daemon再起動後のRunとcompleted Task復元: pass
- 再起動後のpublic `run-use` recovery、2 RunのTask/Delivery分離: pass
- tracked DispatchからRun Inboxへの`escalation`とack: pass
- desktop renderer上のCodex worker完了とclean `worker-release`: pass
- connected Linux Orcaのpairing、remote repo/worktree、worker placement: pass
- disabled Automationのmanual run、completed history、edit、remove: pass
- local install済みTemporary Hanchou Automationのmanual trigger、Run/Task/
  Dispatch、bounded Delivery、worker release、ack、変更なし: pass
- user-installed v1.4.195 desktop runtime、live guide、Codex worker、bounded
  Delivery、clean `worker-release`: pass
- v1.4.195でnative idle wakeが利用不能な場合の公式bounded wait fallback: pass

## Runtime qualification and limitations

このhostには事前導入済みOrca runtimeがありませんでした。latest v1.4.195の
packaged headless runtimeはofficial issue #16761と同じstartup errorを再現し、
desktop runtimeも`starting`のまま到達不能でした。修正commitはv1.4.195 release
commitのancestorではありません。

そこでchecksum検証済みofficial v1.4.188 packageをbounded E2Eに使用しました。
複数Run、Project worker、question/reply、completion、independent review、retain、
3 local repo routing、restart preservation、manual Automation lifecycleはpassしました。
最後のlocal repo workerはv1.4.188のCLI、live guide、runtimeを揃えて完走しています。
checksum検証済みofficial v1.4.188 Linux arm64 AppImageも接続し、remote runtimeの
ready、repo/worktree登録、指定host上へのworker terminal配置までpassしました。
containerへhost credentialsを渡さずprovider CLIも入れなかったため、remote
`worker_done`は`agent_prompt_stalled`で未完了です。必須criterionはremote workerの
起動までであり、認証済みproviderでの完了は利用可能時の追加検証です。

desktop rendererではclean worker releaseまでpassしました。一方、2つの実Codex
coordinatorへtracked escalationを送ってもnative pointerは注入されず、同じmessageは
public `check`で未読確認できました。

その後、user-installed v1.4.195 desktop runtimeが`ready`になった環境で再検証しました。
Computer UseのAccessibility/screenshot権限はいずれも`granted`でした。Run
`run_e36d686e6f8c`のread-only workerは`worker_done`まで完走しましたが、35秒超の
idle観測中にcoordinatorへのnative turnはありませんでした。未読messageを
`check --peek`で確認後、公式bounded `check --wait`、worker release、Delivery ackは
すべて成功しました。よって権限不足は原因候補から外れましたが、native wake自体は
installed v1.4.195では利用不能です。設定は変更していません。

2026-09-03の再確認では、installed v1.4.195のSettingsに専用
「オーケストレーション」ページがあり、5 agentのskill coverageとnested worker
depth `1`が表示されました。Experimental enable/disable toggleは存在せず、public
statusには`orchestration.contract.v1`があります。Hanchouはこの正式contractを
availability判定に使い、存在しないtoggleを要求しないよう更新しました。

同日、standard installerでHanchouを入れた使い捨てOrca worktreeでも再試験しました。
Run `run_8cb0c22a6743`のworker完了後、coordinatorを90秒超受動観察しましたがnative
turnは届かず、`check --peek`には`delivered_at: null`の未読`worker_done`が残りました。
一方、同workspaceを対象にしたdisabled Automationのmanual runは、Temporary Hanchou
Run `run_39c3962e5e5e`、Task `task_fb0b5ee6ce68`、Dispatch
`ctx_97d1a21880af`、bounded Delivery、release、ackまで完走し、source変更なしでした。
Automationとterminal/worktree/project setupは検証後に削除しました。

native desktop idle wakeはOrca側のopen issue
[#12953](https://github.com/stablyai/orca/issues/12953)と一致します。同issueは
lightweight Runのlifecycle mailが現状`check --wait`経由でcoordinatorへ届くと説明
しています。原依頼20.7はnative deliveryが利用できない場合に公式bounded waitだけを
使うことを明示しているため、このfallbackをpassとします。Hanchou独自daemonやpolling
loopは追加していません。認証済みproviderを持つconnected remoteは現在のprofileに
存在しないため、remote completionは利用可能時の条件付き検証です。利用可能な環境と
明記されたfallbackを含む必須acceptance criteriaはqualifiedです。

以前のdisposable Orca test processは停止し、headless/recovery profileに加え、
desktop renderer profileも`/tmp/orca-v3-desktop-evidence-20260902T2105`へ丸ごと
退避しました。後から導入された通常v1.4.195 profileでは、test worker/coordinator
terminalと一時worktreeだけを削除し、証拠RunはOrca所有stateとして保持しています。

Orchestration contractはinstalled versionのlive guideに従う必要があります。旧版が
feature disabledを明示した場合だけ、その版のSettings案内に従ってユーザーが手動で
有効化します。native idle deliveryを正のcapabilityまたはrelease実績で確認できない
runtimeでは、最終結果を同期的に返すsupervised workに公式bounded `check --wait`を
使います。
