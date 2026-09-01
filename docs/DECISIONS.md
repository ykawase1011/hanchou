# Final decisions

## 確定

1. RuntimeはHerdrのみ。
2. Task正本はBeads、標準Task操作GUIはbeads-ui、Herdr内表示はherdr-beads optional。
3. Cron正本はherdr-automations。
4. L0 Orchestratorは当面Codex Sol。
5. L2は原則Claude Sonnet／Codex Terra。
6. 日本語draftと最終文章reviewはCodex Writer／Editor。
7. `Mailbox`の外向け名称は`Hanchou Relay`。
8. Relayを内部`Inbox`と外向け`Delivery`へ分ける。
9. Orchestratorは委譲後にturnを終了し、完了時はRelayが新しいturnを起こす。
10. 通常Task、定期Task、日次digestは共通Reporting policyを使う。
11. `hanchou-skills`をPublic Skillsのcanonical repositoryにする。
12. `hanchou-kingdom`はwork/personal共用のsecret-free repository。
13. Slack／Discordは`hanchou-chat`としてCore E2E後に選定する。
14. Hanchou CLIは薄いmechanics layerとして維持する。`bd`、`herdr`、
    `herdr-automations`の単独操作は直接行い、Hanchouは固有stateまたは
    cross-system operationだけを扱う。
15. `hanchou-cli` SkillをCodex／Claude Codeへ共通配布し、command surfaceの
    選択規則を明示する。
16. HerdrとNode.jsのversion管理は`mise`を標準とし、`hanchou/mise.toml`を
    要求versionの正本にする。HerdrはCore E2Eを伴う明示的upgradeのみ許可し、
    Homebrewからの直接installや`latest`への自動追従を標準手順にしない。
17. Hanchouのproduction実装、validator、generatorはTypeScriptへ統一する。
    Node.js 22のnative type strippingで実行し、runtime npm dependencyとPython
    runtimeを要求しない。TypeScript compilerはCI/typecheck専用とする。
18. 新規Leaf dispatchはhuman-owned machine-local project registryで
    deny-by-defaultとする。通常はexact repo、opt-inではsecret-freeな専用rootの
    descendant Git repoを許可する。Managed Agentは照合のみ行い、authorityを
    追加・拡張しない。
19. 初回の専用root登録は、固定path・plan-first・対話TTY限定の
    `hanchou onboard`を人間向けに提供する。Managed Agent環境からの適用と任意path
    指定は認めない。
20. HanchouはTask／Agent操作GUIを複製せず、Herdr、Beads、Relay、workspaceの状態と
    upstream入口をまとめるloopback限定・read-only Dashboardだけを提供する。
    Herdrmはnamed-session socket互換性を確認できる場合のoptional monitorとする。
    明示起動時に限り、空のdefault pathから検証済みlive named socketへのsymlinkを
    作成できるが、既存pathの置換や別Herdr serverの起動は行わない。
21. Herdr 0.8.2のversion Pingはshutdown中も成功するため、Core readinessは
    pin済みversionのPingとread-onlyな非Ping APIの両方で判定する。LaunchAgent更新は
    profile単位で排他し、durable reload markerを残して全plistを先に配置する。UI serviceを
    先にloadしてから旧Herdr API／client socket消滅と再登録をbounded waitする。pathnameが
    残る場合のlive／stale判定はpin済みHerdrへ委ね、中断後はmarkerから未完了reloadを
    再開する。
22. `launchctl bootstrap`のservice登録成功とprocess起動成功を分ける。各managed
    LaunchAgentは登録後と変更なしの再適用時に`kickstart -p`をbounded retryし、成功後だけ
    reload markerを消す。`-k`を使わず、既存のrunning processは再起動しない。kickstart前後に
    登録が消えたraceは、対象だけを一度再登録して同じbounded retryへ戻す。
23. Orchestrator lifecycleはprofile単位で排他し、作成したworkspace／paneのopaque IDを
    Hanchou固有runtime bindingとしてAgent開始前に保存する。失敗・blocked・`/exit`後は
    同じpaneを再利用し、曖昧なlegacy候補があれば新規作成せずfail closedとする。
    `launch`／`start-orchestrator`からworkspaceを自動削除しない。Orchestratorを開く標準
    commandは対象をfocusしたfull Herdr clientとし、単一ownerのdirect attachを使わない。
24. Orchestratorの破棄は通常起動から分離したhuman-confirmed commandとする。
    `stop-orchestrator --all`はread-only planで、対象snapshotに束縛した64文字のlowercase hex
    tokenとexact apply commandを表示する。profile-local invocationではabsolute local launcherを
    commandへ保持し、seed／legacy invocationだけbare fallbackを許す。applyは
    `--all --plan <64hex-token> --yes`をordinary
    interactive terminalから実行する。snapshotの状態変化は旧tokenを無効にして全close前に
    fail closedとし、partial failure後も再planした新tokenを必須とする。configured label、approved
    Hanchou workspace cwd、
    1 tab／1 pane、no-worktreeに厳密一致する全件をlegacyから先にcloseし、binding対象を最後に
    処理する。全件消失後だけbinding／markerを消す。TTY／Agent環境拒否、token、Codex非allowlistは
    defense-in-depthであり、同一OS userに対する完全なsecurity boundaryとは扱わない。legacy
    process検査はOS process tableで観測できるsame-TTYとshell-descendantの和集合に限定する。
    検査するunowned legacy targetだけ`observed_additional`を数値とし、Agent occupant targetは
    OS shell scan対象外なので`n/a`とする。
    Darwinでは同じOS process sessionの完全列挙にならず、Herdr 0.8.2にconditional closeもないため、
    最終revalidate後のTOCTOUは残る。applyはworkspaceのPTY／OS process session全体の終了を
    人間が承認する操作とし、承認できなければHerdr TUIで手動cleanupする。
    approved rootは通常exact profile rootとし、移行中だけinit metadataに明記したpre-2.4
    bootstrap Core rootを加える。任意旧pathは認めず、新profile-root workspace作成後に消去する。
25. `--include-unmanaged`は広いforce surfaceにしない。人間が明示したときだけ、unboundかつ
    authoritative Agent recordのないlegacy paneのactivity判定をoverrideする。busy foreground、
    observed background、OS scan不能、stale pane authorityは
    `UNMANAGED-ACTIVE`としてreview対象にできるが、exact label、approved rootの
    base/current/process cwd、1 tab／1 pane、
    no-worktree、ID／binding／実Agent整合とHerdr `pane process-info` schemaは常に維持する。
    `process_scan_unavailable`は後段のOS scanだけを指し、malformed Herdr responseは拒否する。
    cwd containmentはactivity overrideの対象にしない。modeをtokenに束縛し、apply／retryにも
    flagを残す。これは「unmanagedだから安全」という推定を避けながら、過去版のbusy legacy
    PTYを人間のwhole-session終了承認で整理するための限定escape hatchである。
26. v1 instanceは`~/HanchouWorkspace/<profile>`をprofile rootとし、その直下に
    regular-fileの`bin/hanchou`、managed clean detached checkoutの`hanchou/`と
    `hanchou-skills/`、canonical target shelfの`repositories/`を置く。Core／Skillsは
    target repositoryではなく、標準のdescendant worker grantでinstalled supply-chain codeを
    作業対象にしないため`repositories/`配下へ置かない。local launcherはrootと
    profileを固定し、caller環境や矛盾するprofile指定による差し替えを拒否する。
27. bare `hanchou init <profile>`はcandidate pairをdownload／validateしてexact token commandを
    表示するprepare-only stepとし、表示commandにはprepareを実行した同じseed Core executableの
    exact pathを固定する。deployed instance、launcher、managed checkout、shelf、registryを
    作らない。ただしcandidateのmise/npm/make codeを実行するため、prepare自体もManaged Agent外の
    通常の人間TTYに限定する。exact `--plan <token> --yes`だけが上記instanceを作成し、
    boundedな`onboard`処理を再利用して固定shelfも同時に登録する。`onboard`は単独でも呼べる。
    Coreは`https://github.com/ykawase1011/hanchou.git`、Public Skillsは
    `https://github.com/ykawase1011/hanchou-skills.git`の固定public HTTPS remoteを使い、
    refは双方とも`refs/heads/main`に固定する。未知file、symlink、dirty/mismatched checkoutを
    上書きせず、未deploy rootは保持する`repositories/`と空の`.hanchou/`以外のentryを拒否する。
    candidate／registry／target-path driftはapply前に拒否し、valid instanceへの再実行は
    updateにしない。
28. CoreとPublic Skillsは独立したexact commitへpinするが、candidate validation、activation、
    current／previous記録、rollback、health判定はcommit pair単位とする。candidate Coreは
    sibling candidate Skillsと検証し、Coreが要求するSkills version、共有`hanchou-cli`のbyte一致、
    設定済みpublic Skillの存在を要求する。validationはfresh temporary HOME/XDGを使って一般的な
    GitHub token／HTTP proxy環境変数とambient Git設定を外し、npm install scriptを無効にするが、
    candidate `make check`をOS sandboxなしで実行する境界は明記する。managed checkoutでのmanual edit、branch switch、
    `git pull`を標準運用にしない。
29. `./bin/hanchou update`は固定public `main` pairをfetch／prevalidateしてexact tokenを表示する
    planであり、running deploymentを切り替えない。candidate codeを実行するためprepareも通常の
    人間TTYに限定する。各candidateは対応するcurrentからfast-forwardであることを要求し、
    currentと同じpairならtoken不要のno-opにする。exact `--plan <token> --yes`だけがreview済み
    pairをactivateし、plan後のupstream移動を再解決しない。applyはprevious pairを記録して
    `bootstrap`／`doctor`を完了する。half-pairやhealth failureを成功として記録せず、元pairへの
    自動復元を試みる。applyはstop-orchestratorでL0 workspaceを意図的に閉じないが、bootstrapの
    service reloadはsessionへ影響し得る。instruction reloadには人間の明示restartを要求する。
    自動復元も失敗したtransactionはautomatic rollbackを含むlifecycle commandをblockし、人間が
    両checkoutとmetadataを一貫してinspect／repairするまでjournalを保持する。
30. `./bin/hanchou rollback`もplan/applyとし、記録済みprevious Core／Skills pair全体を戻して
    `bootstrap`、`doctor`を行う。prepareはcandidate code実行のため通常の人間TTYに限定する。
    成功時は退避したcurrent pairを新しいpreviousとして記録し、逆方向も再度reviewed plan/applyにする。
    片側だけ、任意commit、dirty stateの
    implicit resetは提供しない。`latest`をpoll／activateするdaemonは置かない。exact commit pinは
    reproducibility／TOCTOU対策であり、release署名やupstream compromise対策とは扱わない。
31. Orchestratorのcwdはexact profile rootとする。これはprofile tree全体への明示的なL0
    read/write authorizationであり、Core、Skills、canonical repositoryへのdirect accessを
    filesystemでは遮断しない。通常実装をLeafへ委譲するのはRole policyである。project registryは
    worker dispatch boundaryであり、L0 filesystem boundaryではない。
32. profile-local checkout／stateを複数持っても、同一OS userのprovider integration、global Agent
    定義、plugin/tool link等は完全には分離されず、最後に成功したbootstrapが共有stateを所有し得る。
    instance lockはglobal coordinatorにせず、人間のoperatorがcross-profile update／bootstrapを
    直列化し、各profileでdoctorする。hard independenceには
    別OS userまたはVMを使う。

## 初期default

| 対象 | Default |
|---|---|
| root user Task | `on_terminal`, `orchestrator`, `origin` |
| child Task | `parent_only` |
| Decision | `immediate` |
| routine Automation | `on_failure` |
| monitor | `on_change` |
| daily digest | `always`, `orchestrator`, `local_session` |

## 未決定

- `hanchou-chat`のtransport library。
- `existing-orchestrator` targetをherdr-automationsへupstreamするか、Hanchou
  plugin extensionとして保持するか。
- provider usageの安定した自動取得方法。初期はmanual snapshot。
- Beadsをembeddedからserver modeへ移行する閾値。
