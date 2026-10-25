# v2 検証状況

検証日: 2026-10-20–21。旧版の検査結果はv2の合格根拠に流用しない。
本書は実施済みの根拠と残件を分ける。設計上の出荷条件は[設計書](HANCHOU_V2_DESIGN.md)のR01–R15。

## 配布と起動スクリプト

- 配布対象は4スキルと単発のBash起動・計測スクリプト。旧cron、kaizen、issue公開helper、status-view、Orca用参照、旧テストを削除。
- `make check`: 構造、リンク、shell構文、実Gitとmock Herdrによる起動試験、Bash 3.2回帰試験。ネットワーク・認証・実agentを必要としない。
- 起動試験は新規branch/worktree、元checkoutのstaged/unstaged/untracked保全、設定override、異常値、cwd/provider不一致、途中失敗時の資源保全を検査する。mock成功はHerdr実機成功とは別。
- 39回帰ケースはClaude既定modelの空配列、不正JSON時の単一failure receipt、false model、不正scalar設定、両providerのeffort引数、caller/paneでのAPI・不明認証の拒否を検査する。caller拒否では資源未作成、pane拒否では資源と識別情報を保持してagent未起動となる。
- `skills@1.7.4`を一時Git projectで実行。Codex/Claude Code向けに4スキルだけを選択し、全ファイルの一致、launcher実行権限、references/assetsの保持、導入先での`--help`を確認。global/userインストールは変更しない。[正確な導入コマンド](INSTALLATION.md)。

### 初期化時のツール導入確認

`hanchou-init`に導入状況・PATH・版・管理元の確認と、不足時に導入方法を
ユーザーが選んでからインストールする手順を追加した。既存の互換導入と明示済みの
選択は再利用し、server・agent・scheduleは初期化だけで起動しない。
これはスキル指示の変更であり、全OS・全導入分岐の実機受入ではない。

macOS 26.4.1 arm64では、Homebrew metadataを更新後にHerdr 0.9.5と
ccusage 20.0.37のbottleを導入した。ccusageはMach-O arm64で、
Nodeを含まないPATHでも既存Codex子threadを集計できた。nativeの
input 78,595（cache 71,168込み）+ output 294 = **78,889 tokens**と一致し、
先に導入したnpm版との内訳も一致した。
エージェントのいない専用named sessionをbrew版Herdrで起動し直し、
pane内のbrew実行path、CodexのChatGPT認証、同じ使用量、通知設定の適用を確認した。
今回作成した直接導入のbinary・npm prefix・symlinkのみ削除し、既存session dataと
共有設定を保持した。新規推論・班長・側近・worker・旧cronは起動していない。

## 使用量

### Issue #67: 計測専用の単発Shell

#### 自己計測のtool終了待ちを解消（2026-10-22）

PR #69導入後の実Codex 0.162.1 / Astra high班長が、自己計測15秒のtimeout、
続く45秒の`unsettled_counters`で側近起動前に停止した。応答終了後には同じログを
既存scriptで308,611 tokensと照合できた。実ログでは`token_usage_record`がtool前、
対応する`token_count`がtool終了後に書かれ、自己計測が自分の終了を待っていた。

activeな依頼に限り、一つの未対応native応答の実counterを検証してccusage用一時行へ
写像する。最初の応答と後続応答、実ccusage 20.0.37との一致、増分・identity・時刻・
重複・欠測の拒否、実counter到着後の二重計上防止、完了時に写像を使わない条件を
`tests/test-measure-session.sh`へ追加した。元ログへの書込みは行わない。

失敗時点の本文を除去したprefix再生で、従来ccusageが161,916までしか読めなかった
状態から、記録済みの最新応答まで209,117を照合した。その後、同じ生存中の実班長で
候補scriptを一度呼び、`ready / active`、`counterSource: token_usage_record`、
累積359,534（非cache入力38,974、cache316,160、出力4,400）を取得した。
この値は診断も含むsession累積であり、当該確認一回の消費量や最終確定量ではない。
この時点で側近は未起動。実側近の任務完遂・FINISHED・受入の検証とは区別する。

#### 初回実装と検証（2026-10-21）

2026-10-21、ユーザーの追加承認により、本番実行ファイルを起動・計測の2本に限定した。
`measure-session.sh`はCodex 0.162.1（native source cli）／ccusage 20.0.37について、
現在依頼のmarker・cwd・model/effort・時刻・native IDと使用量を1回の有期限呼出しで照合する。
activeな自己計測とsettledな側近完了を区別し、未記録の推論を0として返さない。
既存cwdを必要とするため、最終測定はworktree削除前に行いreceiptを保全する。

Bash 3.2、jq 1.6／1.7のオフライン検査と独立レビューを通過。
不正counter、reset／fork／compaction、識別・版・scope不一致、曖昧な候補、
完了とcounterの書込み競合、timeoutと成功時の子プロセス残留を検査した。
合成nativeログの選択フィールドを実ccusage 20.0.37へ渡す照合も成功した。
全体の`make check`も通過。これらは実機の予算内完遂を証明しない。

最初の新規Sol medium班長試験は、計測Shellを呼ぶ前に**112,694 tokens**
（非cache入力19,591、cache92,416、出力687）へ達し、起動前10万の外側checkpointで停止した。
側近・workerは未起動で成果は未生成。readinessの拡張子をjsonと誤認し、既知の環境・
承認経路を引き継がず再探索していた。スキルでconfig／policy／readinessの既定pathを明示した。

同じ実ログの中断前prefixを保存して計測Shellへ渡すと、同値counterの再掲時刻と
ccusageのlastActivityが異なる不一致を検出した。最後の増分の初出時刻`usageChangedAt`と
最後のcounter観測時刻`observedThrough`を分け、同じ112,694を照合した。
mockと実ccusageの再掲回帰を追加し、独立レビューを通過した。
これは過去prefixの再生であり、新規実機任務の成功ではない。

#### Issue #67 の停止後調査（2026-10-21）

2回目（baad442）も側近未起動のまま準備 **125,872 tokens** に到達して中断した。
4往復は、入口・設定・Herdr skill読取り、help群、launch参照、未実行wrapperの作成。
初回入力22,419、途中累積22,674 → 55,184 → 88,874 → 125,872だった。
設定path修正だけでは往復削減にならなかった。入口を短縮し、既知のidentityでの
自己計測を最初の読取りにまとめ、help/詳細参照とwrapper作成だけの往復を避ける形にした。

同じsessionの継続は`turn_aborted`を境界検査が無視し、次の`task_started`を二重開始と
判定していた。対応する過去の中断でactiveを閉じ、最新依頼は別のmarker・時刻・context
照合を維持する。最新依頼そのものの中断は`current_request_aborted`、不一致・二重終了・
turn ID再利用・時刻逆転は拒否する。合成ログで再開active／settled、過去marker拒否、
異常境界、実ccusageで110 → 165の累積を確認した。

実ログの本文を除いたprefix再生では、再開後 **163,630** と最後の記録済み **330,424**
（非cache入力29,858、cache297,088、出力3,478）がnative／ccusageで一致した。
途中値125,872を再加算しない。実ログ全体は最終中断を正しく拒否し、settledな総量や
成功任務としては採用しない。330,424は記録済み量だけでも班長予算300,000を超える。
側近・workerは起動していない。これは過去ログの再生であり、新規起動の成功ではない。
停止後の確認で試験CLIはシェルへ戻り、observer停止ファイルを確認した。
固定policy/config/readinessのhash、main HEADとclean状態、実装childの親・host・projectは一致。

新規班長の3回目（fa9dcdb、同じSol medium／Astra medium、300k／200k、留保各50k、
worker0／retry0）は、最初のtoolで自己計測し、3回目の起動判定で **90,116 tokens** を
native／ccusage照合できた。ただし残りを6往復相当（各35,188）と見積もり、
必要量301,244／headroom -1,244で自律停止した。側近は未起動。続く応答生成で
記録済み **125,290**（非cache入力22,683、cache101,120、出力1,487）に達し、
外側の起動前10万checkpointでも中断した。初回入力22,083、初回total22,475。
初回self計測は改善したが、1000msの短いyield、具体的な残処理を示さない往復見積りが残った。
残りのモデル往復と処理の対応を記録し、初回計測にも長い待機を適用する指示を補った。
この追補の新規実機検証は未実施。数値を予算に収めるため見積りを下げることは許可しない。

3回目も成果作成・受入・側近解放の一連成功ではなく、準備費用や総費用の削減率を主張しない。
試験を説明文の追加だけで反復しない。この時点では旧受入条件によりPRをDraftに保持した。
以後の受入条件変更は次節を参照する。過去の未完遂を成功へ書き換えない。

#### 固定予算内完遂の受入条件を撤回（2026-10-21）

ユーザーは「『予算内完遂』というのはなくていい」「適切な予算を見極めて怪しいタイミングで
人間側にアラートが出せて検知することができればいい」と方針を変更した。
Sol30万／Astra20万・準備10万は過去試験の診断条件として保存し、製品の合否やPRの
マージを阻む固定条件として使わない。予算目安の較正、異常検知、人間向けの注意・判断要求を中心にする。
ユーザーが別途指定する停止上限、計測不能時停止、保全、worker/retry制限は維持する。

PR #68の受入対象は、計測Shellの限定契約と回帰、実ログでの照合、中断再開の修正、
予算目安と明示停止上限を区別する班長/側近の手順、scopeを偽らない検証記録とする。
実装済み部分は必要なcheck通過後にマージできる。較正と通知の実機検証は既存Issueで継続する。

手順の整合確認（新規の推論試験やOS通知試験ではない）:

| 入力・状況 | 求める判断・通知 | 証拠の限界 |
| --- | --- | --- |
| test3の実測90,116、残量見積り込み301,244、計画値300,000 | 差1,244と6往復の仮定を知らせ、権限内の限定継続/縮小/判断待ちを選ぶ。超過だけで失敗とはしない | 旧test3は中断済み。新手順で完遂したという証拠ではない |
| 同じ値でユーザーが300,000を停止上限に指定 | 新規割当を止め、実測と停止理由を人間へ知らせる | 進行中requestの厳密な上限停止は保証しない |
| 計測unavailable・不一致・古い観測 | 新規割当を止め、既知小計・不足scope・対応案を知らせる | Shellの異常系回帰は成功。JSONだけで人間へ届いたとはしない |
| 同じ注意が継続／費用・見積りが悪化 | 同値の空報告を抑え、悪化や未解決の判断は再通知する | 指示の整合確認。OS/mobileの実到達は未検証 |

実測からの予算較正と同条件の成果・保存・解放の一連確認は[#67](https://github.com/ykawase1011/hanchou/issues/67)、
採用環境の重要通知の実到達は[#10](https://github.com/ykawase1011/hanchou/issues/10)、
注意を埋もれさせない会話報告は[#22](https://github.com/ykawase1011/hanchou/issues/22)で追跡する。
新しいdaemon・scheduler・通知配送機構は追加せず、既存host機能を使う。

### 班長の準備費用（Issue #63）

2026-10-20の初期化済み新タブ試験では、Sol / mediumの班長が側近への実作業送信前に
311,370 tokensへ到達し、外側から停止した。内訳は非cache入力44,251、
cache read265,344、出力1,775。注入済みスキルの再読と、開発文書・CLIガイドの
全文読取りが重なり、7つの使用量増分で入力が約2.1万から5.6万tokensへ増えた。
側近は更新案内で起動未確定となり、任務完遂の測定ではない。
前回674,422とは初期化の有無と停止点が異なるため削減率を算出しない。

この観測から、起動時の参照を絞り、固定情報の再利用と変動状態の再確認を区別した。
班長の自己計測を準備段階へ移し、cache込みの入力と残り往復を含む予算判断を追加した。
開発用配置・権限・native identity/usageの必須確認は維持する。
スキル指示の変更と静的検査だけでは、消費削減・予算停止の実機受入とは扱わない。
追跡先は[#63](https://github.com/ykawase1011/hanchou/issues/63)。

2026-10-21（JST）、PR #64を導入し、同じSol / medium・依頼内容・班長30万／側近20万
の目安で新タブを1回試験した。結果保存先と版は変更し、前回同様に外側へ有限の
30万tokens停止observerを置いた。注入済みSKILLと開発文書の再読はなく、
自己ID/使用量を早期に帰属した。残りの起動・受領・検証・解放が予算に収まらないと
判断し、launcher未実行のまま自律停止した。外側のinterruptは発火しなかった。

最終応答後のnative累積とccusageは**278,879 tokens**で一致
（非cache入力35,975、cache read238,848、出力4,056、reasoning459は出力の内数）。
班長の報告にある138,859は途中の観測値であり最終値ではない。
実作業・成果生成は未達であり、停止点の違う前回との効率改善率や完遂率は算出しない。
元会話の使用量は含まず、weekly枠にも換算しない。

残る読取りでは、nativeの`session_meta`全体に埋め込まれた指示文の再入力が見つかった。
これを避けるidentityフィールドの選択例と、資源未作成で停止した後は既存証跡を一度に
保存し追加調査を続けない指示を補った。抽出例は実ログで必要フィールドと指示本文の
除外を確認したが、この追補後の新規LLM試験は行っていない。
CLIガイド・承認往復と報告費用の削減、同条件での完遂評価は#63に残す。

### Issue #63: 起動確認を単発shellへ移す試験

2026-10-21（JST）の追加試験では、起動確認を班長が都度組み立てる方式を4候補で試したが、
いずれも班長から実作業を渡すところまで完遂しなかった。次の値は
最終native累積とccusageで確認したcache込みtokensであり、weekly消費率ではない。
親の調査会話・独立レビューの費用を含む総開発費でもない。

| 試験 | 班長 | 側近 | 結果 |
| --- | ---: | ---: | --- |
| 1 | 308,954 | 未起動 | hookの存在を通知発生と混同し、調査が膨張 |
| 2 | 313,822 | 25,248 | bootstrapまで。ログ探索・help・承認・短い待機の往復 |
| 3 | 336,198 | 未確定 | 起動後、bootstrap前に停止。側近を0として合計しない |
| 4 初回 | 250,152 | 未起動 | 残り往復数を過大見積りして起動前に停止 |
| 4 同じ会話を再開 | 530,981 | 25,329 | 50万へ明示変更した較正試験も失敗。班長値は初回を含む累積 |
| 5 | 325,514 | 24,620 | jq 1.6の予約語と変数名が衝突してqualification失敗。実作業未送信 |
| 6 | 326,800 | 291,550 | 側近は成果生成・検証済み。班長は受入前に外側から停止。側近もテスト待機の往復で超過 |
| 7 | 273,320 | 24,759 | 起動確認済み。割当前の予算計画が超過し、追加推論を避けて呼出元が停止 |
| 8 | 300,310 | 未起動 | 実装とnative metadataの再読で膨張。起動前の予算判定で停止し、報告中に外側停止 |
| 9 | 339,767 | 79,902 | 班長が存在しないusage参照を指定し側近停止。解放時も相対Git pathの誤解釈で停止し、呼出元が解放 |
| 10 | 295,651 | 未起動 | 参照全文・接続再確認・計測準備の往復が残り、起動前に自律停止 |
| 11 | 167,416 | 未起動 | 準備済み依頼templateでも起動前129,357に到達。事前の約10万停止条件で呼出元が打切り |
| 12 | 321,050 | 未起動 | 起動限定のhost context縮小でも準備往復が残り、起動前自律停止。終了報告まで含めると30万超過 |

試験3では、ほぼ空の待機3往復だけで120,383 tokensを追加した。
試験4の再開では、毎回生成する確認コードがMarkdown付きACKに対応できず、
修正の往復と留保枠の重複見積りが加わった。安い停止を完遂時の効率改善とは扱わない。
較正試験の予算変更も30万条件の合格とは扱わない。

この観測を受け、唯一の本番shellに任意`--qualify-startup`を追加した。
Codex 0.162.1／ccusage 20.0.37に限定し、固定のtool-free側近指示を1回送り、
新規cwd・時刻・固有marker・native metadata・完了と初回使用量を照合して終了する。
実作業・任意prompt・継続計測・再試行を起動スクリプトへ移してはいない。
起動時のsource snapshotはGitのoptional index更新を抑制する。
既定のpending receipt、Claudeのサブスク確認、元checkout保全は維持する。

実機の単体probeではnative `01a15a31-08bb-73f1-94fb-be925ccf4e6a`、
Astra medium、**24,629 tokens**で`startup_qualified`を取得した。
これは起動確認の成功であり、班長による任務完遂の測定ではない。
実作業は送らず、CLIの終了・専用workspace/worktree/branchの解放を確認した。

オフライン検査は、実Gitとmock CLIで装飾付きACK、prompt echo拒否、遅延した
完了／counter、identity/model不一致、fork、未知／builtin tool呼出し、不正counter、
別log home、未対応版、timeout時の資源保持と計測helper停止を検証する。
同じbootstrapの再送は行わない。独立レビューで見つかった即時判定・helper残存・
不正値受理・tool種別の取りこぼしを修正した。これらのmock成功を実機の
全provider／全version保証には使わない。

試験5の側近は正常にtool-free応答していたが、班長が選んだjq 1.6では
`$end`が構文エラーになった。Apple jq 1.7.1での単体probeでは顕在化しなかった。
変数名を変更し、全29個のjq filterを両版でcompile確認、同じ実ログの
native判定とccusage照合をjq 1.6でも再確認した。全回帰検査もjq 1.6で通過。
parserの構文不良はstderrに原因を出し、agent側の異常と区別して即時停止する。

試験6の成果は呼出元が20 bytesとSHA-256
`2b4547eb96884facd16de86d027fe9b674b037f65d806724227bf7fc0553cc97`を
独立確認して回収した。班長の自律完遂とは扱わない。側近の報告値108,994は途中値で、
native／ccusageの最終値291,550に置き換えた。テスト中の短いpollを含む後続4増分は
146,888 tokensだった。側近にも長いtool待機・検証後の再計測を明記した。
試験7の早い停止を試験6とのコスト改善率には使わない。

試験8–10から、正常時の公開起動契約、選択したnativeフィールドだけを出力する例、
実在するusage契約の所在、source checkout基準の絶対Git pathを入口に明示した。
正常時に詳細参照へ進まず、準備・計測と起動・割当と結果受信・受入と解放をまとめる
手順を示した。ただし説明の追加だけで班長の往復数を安定させたとは確認できていない。
試験9の誤った相対path判定は実際の元checkout変更を意味せず、呼出元が正しい絶対pathと
HEAD・branch・diff/status hashの一致を確認した。
試験10の班長報告168,766は起動前の値で、停止報告まで含む最終累積は295,651だった。

試験11はcallerが検証済みpath・版・接続経路と4段階の出力を埋めたtemplate実験。
起動まで2往復／約10万tokensを超えれば仮説を棄却する条件で停止し、配布templateには採用しなかった。
callerの準備費用は班長値に含まれず、この試験を通常依頼と同条件の削減率に使わない。

試験12はHanchouの変更に加え、Codexの起動プロセスだけで不要なskill候補・connectorを
絞る別条件を試した。公式CLIの`debug prompt-input`による無推論の診断ではskill一覧が
2,743 bytes、実sessionでは一部Google Drive候補が残り5,460 bytesだった
（元の実sessionは15,126 bytes）。初回inputは試験10の22,300に対し19,927だったが、
総消費の改善や厳密な因果寄与率ではない。global configのhashは前後で一致し、承認・認証・
AGENTSを変更していない。版と導入pathに依存する除外設定はHanchouへ配布しない。
設定の意味は[公式Codex設定](https://learn.chatgpt.com/docs/config-file/config-reference)、
導入版の`--help`と実際のprompt診断で確認した。

試験12のCLI終了表示はinput 27,081 + output 4,049 = 31,130と、別記のcached 289,920だった。
本書のnative／ccusage総量321,050とはcacheの含め方が異なる。同じ「tokens」の数字だけを
比較せず、input非cache・cache・output・完遂状態を併記する。weekly利用枠への換算係数は不明。
ここまでの12試験と単体probeの既知小計は4,335,820 tokens（試験4初回を再加算しない）。
未確定の試験3側近、親調査会話、独立レビューはこの小計に含まれない。これは改善後1任務の費用ではない。

30万／20万の完遂条件は未達。説明・template・host contextだけの試験を追加せず、
[次の設計判断](ISSUE63_NEXT_STEPS.md)に計測処理の単発shell化と比較条件を整理した。

### 計測基盤と従来の比較

`ccusage@20.0.37`の限定受入、再現手順、native子の範囲、resume/fork/compactionの検証差分は[使用量検証](USAGE_TOOL_VALIDATION.md)に記録。
既存実ログの完了thread、fork、子thread、Claude子込みsession、重複・途中書込みを確認した。新規resume/reset/compactionの全経路を実機保証するものではない。

旧main `9e2e4f9`の班長`SKILL.md`は10,590 bytes、v2は4,424 bytes。
常時読む入口の文量は約58%減ったが、実token消費や週次枠の削減率ではない。
今回のホストは班長自身のsession別使用量を帰属できず、実機数値は側近以下の小計である。
同じ仕事のv1/v2全階層比較は未測定で、実コスト改善の定量的保証は行わない。

## Herdr実機

macOS arm64、Herdr 0.9.5、Codex 0.162.1、Claude Code 2.1.299。
専用のnamed local serverと一時Git repositoryを使用。Hanchou/OrcaのworkerやRunを使わず、公開Herdr CLIで操作した。Orcaアプリ自体は停止していない。

| 確認 | 観測した結果 |
| --- | --- |
| Codex起動 | launcherの新規worktreeが最初のpaneのcwdと一致。初回の起動未確定を同じpaneで調査し、更新案内をskipして再照合。別の側近へ無条件に再送しない |
| Claude起動 | callerと実paneのauth statusがfirst-party Claude Max。初回trust画面を確認後、同じpaneで続行。API fallbackを使わない |
| Codex bootstrap | exact cwdとbootstrap markerからnative threadを一意に特定。要求model `gpt-6.1-sol`とnative観測値が一致。effortは既定のhighだったためoptional effort指定を追加 |
| Codex usage | native input 19,061（cache 13,056込み）、output 18、total **19,079**。ccusage noncached input 6,005 + cache 13,056 + output 18で一致 |
| Claude bootstrap | exact cwdとmarkerからnative sessionを一意に特定。`haiku`の実modelは`claude-haiku-5-5` |
| Claude usage | input 2 + cache creation 22,384 + cache read 26,558 + output 28 = **48,972**。ccusage sessionと一致 |
| 明示effort | 別の新規worktreeで`--effort low`を指定。実プロセスのCodex設定引数とCLI表示のSol lowが一致 |

いずれもnative IDは今回Herdrの`agent_session`に現れず、固有cwd・起動時刻・bootstrap marker・native metadataを照合した。Herdr integrationをユーザー環境へ自動導入していない。

### 小さな成果の回収と解放

Codexは`smoke.txt`、Claudeは`claude-smoke.txt`を作成し、指定した内容と改行を検証して専用branchにcommitした。supervisor側からcommit内容・変更対象・clean状態を再確認した。Codexのcommitは`8ae27f515029ef809ae91531c0b6245fe765fd2a`、Claudeは`b7cc8bd2287878495cdc0612c0414970d31c7b35`（いずれも一時fixture内）。

人間役の元checkoutにはstaged・unstaged・untrackedを用意し、Codex実行中にも追記した。両試験後とcleanup後のdiff/index/statusは、その並行変更後の期待値と一致し、main HEADも維持した。共有Git metadataへのcommit書込みはCodex sandboxの個別承認を要した。許可済みの当該commitだけを承認し、sandboxを無効化しなかった。

最終報告後のCodex合計は**210,214 tokens**。200,000のcheckpoint予算を**10,214超過**した。途中観測157,742の後に最終応答等が加わったためであり、厳密な予算停止の合格ではない。直近の入力全量・cache・残りtool turn数から報告予備枠を見積もる指示を追加した。修正後の境界停止試験は次節に記録する。Claudeは**256,975 tokens**で350,000以内だった。

Claudeは単に指示ファイルを「読む」という依頼を役割の起動とは解釈しなかった。引渡しを「このmissionのsokkinとして、その指示に従う」と明示する手順へ修正した。修正後は次節の両providerで役割受領を確認した。

成果をGit bundleとファイルに保全してからCLIを終了し、Herdrのprocess-infoと元PIDの消滅で停止を確認した。Claudeに付随したMCPプロセスも終了した。所有する4つの試験workspaceを閉鎖し、cleanな3つの新規worktreeを通常の`git worktree remove`で削除した。最初の一時fixtureと成果bundleは保持し、試験専用serverの終了も確認した。ユーザーの実projectや共有serverは停止・削除していない。

### 起動環境の差

試験環境のshell wrapperはClaudeへremote-controlとpermission関連の引数を追加していた。launcher自身の指定ではない。実プロセスの引数をbootstrapで確認する手順を明記し、paneの認証確認も実起動と同じshellのcommand解決を使うよう修正した。同じshellからの`claude auth status --json`はClaude Max／first-partyであることを確認済み。ユーザーのshell設定は変更していない。全てのwrapperや追加課金設定をこの1件で保証するものではない。

### OrcaへアクセスできないHerdr環境での再確認

別のnamed server `hanchou-v2-gates`を使用し、Orca環境変数を除去した。
macOS sandboxでOrcaの実行、データディレクトリ、Unix socket、localhost宛通信を拒否し、
Orca CLI実行とsocket接続が`Operation not permitted`になることを確認した。
この制限をHerdr serverと子プロセスへ継承し、viewerは開かなかった。
Orcaアプリを物理的に終了した試験ではなく、試験対象から利用不能にした非依存性の試験である。
Herdrのtoast deliveryはoff、soundはfalse、shellは個人のaliasを読まないBashに固定した。
ユーザーの通常server・shell設定は変更していない。

| 確認 | 結果 |
| --- | --- |
| 欠測時停止 | Codex側近はnative IDと計測が未確定のbootstrapでblockを返し、worker・ファイル作業を開始しなかった |
| 予算到達時停止 | 読取りtoolと個別承認を含むbootstrapは見積60,000に対し99,608となった。実測を渡して延長を認めない依頼に対し、worker起動を拒否。拒否応答後は120,508。超過分を隠さず合算した |
| 起動時の往復削減 | 上記を受け、検証済みmetadataと固定した指示本文を一度渡すtool-free acknowledgmentへ変更。Claude Code 2.1.304／haiku lowは役割を受領し、実作業を止めて待機。tool callは0 |
| Claude計測 | session `cf026c7b-e2d4-4e63-b73b-9d019038e8af`。input 2 + cache creation 22,395 + cache read 28,058 + output 251 = **50,706**。重複native行を除いた値とccusageが一致。実modelは`claude-haiku-5-5` |
| 実worker選択 | Codex側近がroutine writeを理由に`gpt-6.1-sol`／lowを選び、1 workerだけ起動。native metadataでも同じmodel/effortと親子関係を確認 |
| 実成果 | workerが`worker-result.txt`を作成。側近は内容`hanchou-v2-worker\n`を独立に検査し、workerの誤った17-byte報告を18 bytesへ訂正。元checkoutへ変更せず専用worktreeに成果を残した |
| 親子会計と予備枠 | 上限を明示的に700,000、最終検証・報告予備枠150,000へ設定して実作業を許可。最終応答後の親582,523 + 子78,889 = **661,412**。各native累積値とccusageが一致し、コピーされた親履歴を加算していない |
| retry上限 | 別の境界probeで上限850,000を明示し、検証失敗を仮定してretry／worker置換を要求。retry limit 0を維持した側近は両方拒否。該当turnにtool call・新規worker・成果変更はなかった。probe後の親615,362 + 子78,889 = **694,251** |
| 通知・報告経路 | viewerなしで実行、判断要求と最終結果をHerdrのpublic readから班長が回収。通常worker出力をOrcaへ転送する処理はない。Herdr側のtoast/sound無効化を確認。全OS・mobile・個別provider hookの設定を横断して検証したものではない |

親threadは`01a1575b-0b45-7a23-8571-97518cc27c7a`、
子threadは`01a15760-32cd-7a13-8c02-6ef582f70fe1`。
子のnative累積値はinput 78,595（cache 71,168込み）+ output 294 = 78,889。
Claudeの実プロセス引数は`--model haiku --effort low`で、先の個人shell wrapperが追加した
remote-control／permission引数はない。

外側のmacOS sandboxによりCodex内側のsandbox初期化が失敗し、許可済みの読取り・
fixture書込みには個別承認が必要だった。外側のOrca拒否は維持した。この承認往復を含む
token数は通常環境の効率比較ではなく、会計と停止判断の証拠として扱う。
retry probeは失敗を仮定した境界入力であり、実障害からの自動復旧を保証するものではない。

成果ファイルを試験用resultsへコピーして一致を確認後、元の試験worktreeから回収した。
両CLIとClaudeの付随MCPプロセスの終了を確認し、所有する2 workspaceと2 worktreeを
通常の削除で解放、専用serverのexit 0を確認した。元fixtureのdiff/index/statusは、
先の人間役による並行変更を含む期待値と再び一致した。

### native側近の競合統合と並行編集

別の一時repositoryとOrca拒否環境のnamed serverで、Claude Code 2.1.304／
Haiku 5.5 low／Maxを起動した。attempt `6289d8f52048f7a1`、
native session `43ac6ce9-e2b0-4aaf-b2fc-e7d46a0352d0`。
launcherの新規worktree内で側近がincoming branchをmergeし、実際に`UU`と
index stages 1/2/3の競合状態になった地点でいったん止めた。
その時点で元checkoutの保全を確認したうえで、人間役が追記と新規untrackedファイルを追加した。

続行した側近は指定した2行へ競合を解決し、merge commit
`ba11420fdb23aff0fcca42bdee5c4877d6ed687b`を専用branchへ作成した。
両親commit、期待する38 bytes、clean状態を独立に検証した。人間側のbranch・HEAD・index、
staged/unstaged/untrackedと並行編集、incoming branch、無関係な共有tagは保持され、
動いたrefは専用branchだけだった。実Git/mock試験でのdirtyな失敗checkoutを残した
新規置換の確認と合わせ、R03/R04の受入根拠とする。

usageはbootstrap **50,810** → 競合地点 **157,364** → 最終 **269,695**で、
各地点のnative値とccusageが一致した。最終内訳はinput 10、cache creation 27,636、
cache read 239,510、output 2,539。500,000枠（報告予備枠150,000）以内で、
5 request・2 Bash tool・追加workerなし・retryなしだった。

側近の「46 bytes」という報告は誤りだったため、報告だけで合格にせず実ファイルで訂正した。
明示したinline指示の役割受領と実行を検証したもので、スキルの自動発見は検証していない。
成果bundleの完全性を確認し、CLIと付随MCPの全記録PIDの終了、workspace閉鎖、
clean worktree削除、専用serverのexit 0とsocket消滅、元checkoutの再照合まで完了した。

### 旧運用の撤去

旧Automation `d03aafa6-530c-47a2-8d75-e7a46ed3b8df`はdisabledであることを再確認。
10端末は起動occurrence 92および116–124のPTY IDと一致し、全出力は認証要求または
bootstrap失敗のみだった。対応する進行中のRun・worker・子workspaceはなかった。
旧checkoutはstaged/unstaged/untracked/ignored差分がなく、HEADはmainの祖先で
固有commitもなかった。所有・履歴・Git状態・各操作receiptを旧workspace外へ保全した。

公開Orca CLIでこの10端末だけを閉じ、全件`ptyKilled:true`を確認した。
停止済みAutomationを削除し、cleanな`hanchou-issue-work`をforceなしで削除した。
旧workspace・process一覧・物理path・Git worktree登録・対応するmerge済みlocal branchが
なくなったことを再照合した。他projectのAutomationや現在の作業workspaceは変更していない。
これは旧運用の終了・回収であり、Orca自体の設定不一致や認証起動の不具合修正ではない。
導入済み旧スキルの置換とGitHub Issueの処置は次節に記録する。

## 必須要件との対応と公開移行

固定した版・検証環境における技術受入を次の根拠で確認した。任意のprovider/model、
実障害・並列競合・OS通知設定の全組合せを保証するものではない。

| 要件 | 主な根拠 |
| --- | --- |
| R01 薄い構成 | 配布4スキル、限定した単発shell 2本、構造検査 |
| R02 Orca非依存 | Orca CLI・socket等へのアクセスを拒否した子プロセスで起動・実行・回収・会計・解放 |
| R03 新規worktree/branch | 両providerの実起動、実Git/mockの異常系・置換・設定試験 |
| R04 人間の作業場所の保全 | native競合地点・並行編集後・統合後・cleanup後の照合、共有ref確認 |
| R05 専用workspace | receiptのworkspace/最初のpaneと実cwd/providerの照合 |
| R06 Herdr内の実行 | viewerなしで側近とnative workerが実行、Orca Run/workerなし |
| R07 設定 | provider/model/effortの設定・override試験と実プロセス/native観測 |
| R08 session識別 | 両providerの固有cwd/marker/ID、実Codex親子関係と別計上 |
| R09 欠測・重複 | native照合、確定prefix、重複・fork/compaction試料、resume/reset/欠損offline試験。不明経路はunavailable |
| R10 使用量による割当制御 | native欠測・超過時拒否、実workerの予備枠付き会計、retry 0境界拒否 |
| R11 自律選択 | 側近がroutine workにSol lowを選択し理由と実modelを照合 |
| R12 サブスク限定 | caller/実pane Max認証、実argv、API/不明認証拒否の6回帰ケース |
| R13 成果による受入 | ファイル・merge commit・検証・使用量を独立照合。誤ったbyte報告を訂正 |
| R14 報告集約 | 制御したquiet sessionで重要結果を班長が回収。Orcaへのworker通知転送なし。採用環境の別設定は要照合 |
| R15 保全と解放 | bundle/ファイル保全後に所有PID終了・workspace閉鎖・通常worktree削除を実確認 |

公開移行も以下まで完了した。新仕様だけで旧障害を修正済みにしない。

- [PR #59](https://github.com/ykawase1011/hanchou/pull/59)をマージし、公開main `f19c958`から`skills@1.7.4`で4スキルをCodex/Claude Codeの既存global scopeへ導入した。内容・link・launcher権限を照合し、旧2スキルの実体・link・lock entryを除去した。無関係な登録情報は保持。
- 旧dashboard、公開済みreceipt、削除したAutomationの定義の7ファイルを保全先へ退避し、空のcron directoryを削除。元projectの`policy.md`と改善メモはhash一致で保持し、権限を勝手に書き換えていない。
- [#13](https://github.com/ykawase1011/hanchou/issues/13)、[#39](https://github.com/ykawase1011/hanchou/issues/39)、[#41](https://github.com/ykawase1011/hanchou/issues/41)、[#44](https://github.com/ykawase1011/hanchou/issues/44)を旧機能・運用終了の`not planned`でclose。
- [#40](https://github.com/ykawase1011/hanchou/issues/40)は対象をv2のR03/R04へ明示的に変更し、上記受入を根拠に`completed`でclose。旧Orca全経路の受入とは扱わない。
- [#10](https://github.com/ykawase1011/hanchou/issues/10)と[#22](https://github.com/ykawase1011/hanchou/issues/22)は採用環境の通知・報告品質の確認としてOPENを維持し、旧Orca更新待ちラベルを解除。制御した試験環境の成功を全OS/mobileへ一般化しない。

導入されたファイルと現在の会話への採用は別である。この実装作業では班長スキルを
起動せず、次の明示的な起動でv2を採用する。既存projectの独自方針は初期化・移行時に
確認し、設定が不足する状態で側近を自動起動しない。

週次枠のsession別正確な配賦、providerが強制する厳密なtoken cap、全ホスト共通の自動復帰、24時間TTL解放は設計で保証しない項目であり、上記未実施検証とは区別する。


## 依頼専用Herdr serverの寿命管理（2026-10-21）

既定の起動を、依頼専用named server＋設定元`.hanchou/instances`の記録へ変更した。
既存sessionを明示する互換経路は共有のままで、自動停止対象にしない。
`FINISHED`のUTC時刻、班長の受入、成果・最終使用量の保全、全agent終了を必要条件とし、
班長の次のチェック時に24時間以上経過した専用serverだけを回収する。タイマーは追加していない。

`tests/test-herdr-lifecycle.py`は一時Git repository、実PID/socket、mock Herdr/agentを使い、
完了・受入・再開・閉鎖、24時間境界、未受入、変更された証拠・実体・inventory、
稼働agent・background処理、lock、symlink、部分起動失敗、停止失敗の保全を検証する。
元checkoutのstaged/unstaged/untracked、HEAD、index、設定が変わらないことも照合する。
Pythonはrepositoryの試験依存であり、配布scriptの実行依存ではない。

macOS、実Herdr 0.9.5では`tests/test-herdr-lifecycle-live.py /absolute/path/to/herdr`で
named server起動、workspace作成、実pane/process一覧による受入、24時間経過fixtureの回収、
server/socket/pane PID消滅とCLOSED記録まで確認した。起動直後のshell準備中は受入を拒否し、
同じ試行で状態が落ち着いた後に受入できた。agent startとusageは明示的なfixtureであり、
この試験を実AI側近の完遂・最終使用量・自律的なFINISHED書込みの受入とは扱わない。
既存の共有serverと設定には変更を加えていない。通常の起動・計測の回帰は`make check`で確認する。

プロセスとsocket照合は協調する管理操作を対象とする。外部から同時にserverを入れ替える
操作を公開CLIと原子的に排他する保証や、複数hostの回収、正確な24時間後の実行は提供しない。

### PR #69: 完了・受入の証拠照合を補強（2026-10-22）

完了時にもserver実体と、呼出し元が持つinstance／record／mission／attemptの対応を照合する。
受入時は観測時刻だけでなく、側近の`currentRequest.completedAt`が`finishedAt`以降か確認する。
使用量は単一native sessionの累積・子や他sessionを含まない範囲に限定し、入力・cache read・
cache creation・出力の非負整数と合計、reasoningが出力の内数であることを検証する。
欠測や集計範囲不明は受入を拒否する。nativeログのUTC小数秒は、既存の寿命管理時計に
合わせて秒精度で照合する。pane一覧の空・改行・重複ID、不正なprocess形式も拒否する。

変更前にserver差し替え後の完了と、不完全／古い使用量の受入が通ることを回帰テストで再現した。
`tests/test-herdr-lifecycle.py`は3テスト追加で計12テストになり、拒否後の記録・server保全と
正常な回収を確認する。macOS / Herdr 0.9.5のserver-only実機試験も更新したreceipt形式で
`CLOSED`まで成功した。agent起動・使用量は引き続きfixtureであり、実AI完遂の証明ではない。

### 起動tool終了後の専用server保全（2026-10-22）

mainの実Codex試験でbootstrap qualification（21,184 tokens）は成功したが、
次のtool呼出しでの任務送信は`server_not_running`となり、記録したserver・agent PIDも
消滅していた。実任務は未送信で、FINISHED・受入は未達。失敗instanceと証拠は保持した。

起動tool専用のprocess groupへ終了通知を送る回帰試験で、従来の`nohup`だけでは
serverも停止することを再現した。専用serverをBash job controlで別groupにし、
PIDとPGIDの一致を確認する修正後は、後続の独立した完了・受入・回収呼出しまで成功する。
`make check`（lifecycle計13テスト）とmacOS / Herdr 0.9.5の実server試験で確認した。
後者も起動元groupの終了を挟むが、agentとusageはfixtureのままであり、実AI任務の
完遂検証とは区別する。元の停止で送られたOS signalそのものを特定した主張ではない。

### 側近環境のlifecycle検証（2026-10-22、#72）

Codex 0.162.1の公開`codex sandbox`でworkspace-writeを指定し、実側近と同じ
`ps`実行とUnix socket作成の`Operation not permitted`を再現した。
旧テストの13件のserver_start失敗はこの実行条件と整合する。修正後の`make check`は
fixture作成前に必要権限を検査し、制限環境では明示的なエラーで止まる。skipや成功にはしない。
本番launcherもprocess情報を取得できなければ資源作成・記録変更前に
`process_inspection_unavailable`を返す。ホストの承認経路で対象コマンドだけを実行し、
global sandbox設定を変更しない手順を側近skillへ追加した。

別途、呼出し元の4つのHANCHOU instance/mission/attempt環境変数を引き継ぐとfixtureの
finishがinstance_mismatchになることを再現。offline/live双方のfixture環境からこの4つを
除外し、実callerの環境は保持する。意図的な異なるbindingの拒否テストは維持した。
親bindingを設定した15件のlifecycleテストと、Herdr 0.9.5のlive fixtureのCLOSEDを確認。
live fixtureではユーザーのzsh起動設定によるssh-add待機も観測したため、公開workspace
environment指定でテスト用ZDOTDIRを渡す。ユーザー設定は変更せず、本番launcherの
起動環境にもこのテスト用設定を追加しない。

### 側近起動時の人間向けHerdr表示（2026-10-23）

班長の通常手順に、起動receiptのsession/workspaceをviewerタブで表示してから
実作業を渡す段階を追加した。明示的なheadless指定、同じ側近への追加指示時の再利用、
表示失敗・作成timeout時の既存タブ照合、完了後のタブ保全を規定する。
起動シェルにホスト依存処理は追加せず、既存のターミナル機能を班長が操作する。

macOS / Orca / Herdr 0.9.5で、#72の受入済み専用sessionへ公開
`session attach NAME`を使って新しい可視タブから接続した。terminal handleの返却後、
画面読取りで対象workspace、専用branchとcwd、終了済みCodexのnative IDを照合した。
初回案内を進め、optional integrations画面は導入せず閉じた。対象workspaceの表示を
再確認してタブを残した。対象の側近は既に終了しており、新しい任務・agentは起動していない。
これは既存sessionへの表示経路の実機確認であり、改訂スキルを読んだ新規班長による
自動起動一巡、他ホスト、共有sessionのworkspace選択、browser viewer、read-only化を
検証したものではない。viewer表示は実行・計測・完了の証拠の代用にはしない。

### Codex 0.163.0 の起動・使用量互換性（2026-10-23）

CLI更新後の班長は、旧allowlistによる`unsupported_version`で実任務前に停止した。
0.162.1を維持し、0.163.0だけを追加する。未知の版、fork、compaction、counter reset、
不明なidentity/scopeは引き続き拒否する。起動時はcaller・pane・nativeログの版を
同一に限定し、別の対応済み版へ途中で変わる場合も拒否する。

macOS / Codex 0.163.0 / ccusage 20.0.37 / Herdr 0.9.5の実ログで確認した。
班長（gpt-6-astra/high）のsettled累積191,132 tokens、および実行中の
`token_usage_record`を使ったactive累積232,740 tokensは既存照合処理で一致した。
activeは観測後の実行・最終応答を含まず、任務全体の確定値ではない。
新しい専用server・fresh worktreeで側近（gpt-6-astra/medium）のtool-free
bootstrapを実行し、process引数・native identity・版・settled累積21,223 tokensを
照合して`startup_qualified`を得た。ユーザーのzsh起動時待機を避ける既存承認済みの
process-local ZDOTDIRとupdate通知skipをこの試験に限り使用し、設定は変更していない。

`make check`は両版の計測回帰、従来の起動回帰、0.163.0の正常起動・pane/native版不一致・
counter不一致、およびlifecycle 15件を通過した。これは限定した起動・計測の検証であり、
Issue整理任務の完遂、他provider、未知のCLI版の互換性を示すものではない。

### OrcaのHerdr閲覧タブの命名（2026-10-23）

班長skillに、Orcaのviewerを`Herdr | 短い任務名`で明示的に命名し、tab IDと
表示名を照合する手順を追加した。公開`terminal rename`を使い、既存の2つの閲覧タブを
`Herdr | Issue整理`と`Herdr | Codex 0.163.0検証`へ変更した。後続の
`terminal list --include-visual-layouts`で、それぞれ同じtab IDのtitleが一致した。
通常のterminal/pane titleはHerdr由来の名前を表示し続けるため、命名の検証には使わない。
agentやserverの再起動、接続先の変更、新しいviewer作成は行っていない。
これは既存Orcaタブの命名経路の実機確認であり、改訂skillによる新規班長の一巡や
他ホストの命名機能の検証ではない。

### フォーカスを移さない閲覧手順（2026-10-23）

班長skillの作成・確認をバックグラウンドに限定し、明示的な表示切替依頼がない限り
現在のタブ／workspaceを維持する。Orcaのactivation操作を確認の代用にせず、
公開read/list/visual-layoutで照合する。他ホストで非操作の確認ができない場合は
限界を報告し、勝手に前面化しない。本番の起動・計測scriptは変更していない。

README整備任務の班長から提供された公開CLI観測では、同じ親workspaceに
`Herdr | README整備`タブを保持し、visual layoutのactiveTabIdは班長タブのままだった。
班長が行ったbackground作成・readによる対象session/workspaceの照合を受け継ぎ、
側近では追加viewerや表示切替を行っていない。これは当該macOS / Orca環境の限定証拠であり、
他ホストや改訂skillによる新規起動一巡の検証ではない。

### 承認判断の委任（2026-10-24）

workerの要求は側近、側近の要求は班長、班長の未解決判断は人間へ戻す手順を、
両skill・方針テンプレート・設計・README図に反映した。本番shellは変更していない。
次のケースを文書間の整合レビューで確認した。これは指示のレビューであり、
実モデルが承認UIへ回答して再開したことの証明ではない。

| ケース | 指示上の判断 |
| --- | --- |
| workerが任務内の許可済み操作を要求 | 側近が対象・効果・条件を照合して当該要求に回答 |
| 側近が同様の操作を要求 | 班長が同じ照合を行い、人間への再確認だけで停止しない |
| 側近だけでは判断できない仕様・権限 | 班長へ相談し、班長の既存権限でも決められなければ人間へ |
| 明示禁止／人間へ毎回確認／本人操作が必須のgate | 禁止は拒否、必要な人間判断・操作は班長から案内。委任で迂回しない |
| blocked agentが報告できない／promptが拒否される | 親が同じ実行先のpending UIを確認し、公開された回答経路を使う |
| 回答のtimeoutや取消でturnがabort | 同じ試行を再確認。abort後の継続は新しいmarkerで計測し、任務を重複送信しない |

変更した3skillの`quick_validate.py`とREADME Mermaid 11.12.0のrenderを通過し、
図のラベルと経路を目視確認した。二段の承認回答・再開と、権限外の要求だけを
人間へ上げる実モデル／採用hostでの一巡は未実施であり、他providerのUI互換性も主張しない。
未実施の一巡は[承認委任の実モデル検証 #79](https://github.com/ykawase1011/hanchou/issues/79)で追跡する。

### native自動承認reviewの限定probe（2026-10-25）

macOS、Herdr 0.9.5、Codex 0.163.0、Astra mediumのfresh CLI 1件で、
`--approve-for-me`を明示した開発用probeを実施した。実process引数とnativeの
`workspace-write`・`on-request`・`auto_review`を照合し、tool-free bootstrapの
使用量を既存scriptで確認してから、2個の無害なファイルを作成した。
workspace外の1個は通常sandboxで拒まれ、native reviewerの`allow`後に成功した。
親による承認キー入力、包括許可、global設定変更は行っていない。

意図的に未決とした選択は実行せず直属の親へ報告され、同じCLIが親の回答を受領した。
これは通常の報告・継続promptの確認であり、providerの承認UIや拒否がHanchouの
親へ自動転送されることの証明ではない。自動review拒否、人間本人必須gate、取消、
複数review、Claude auto、非対話fallbackは未検証である。

主threadの最終settled値は118,218 tokens、6応答。別の`guardian_review` threadは
nativeのparent/thread/turn対応を確認でき、1応答のraw値は9,054 tokensだった。
ccusage 20.0.37の合計も9,054だったが、native model `codex-auto-review`に対して
toolは`gpt-5.6-luna`・`isFallback: true`を返したため、reviewer計測は未認定とした。
同梱`measure-session.sh`もこのsourceを`unsupported_history`として拒否した。
主threadのreadyを全体のreadyに広げず、reviewerを0や認定済み合計へ混ぜていない。

この観測に基づき、自動承認reviewをmodel選択と区別し、親・人間gateとreviewerの
使用量scopeを保つ手順、および実際のguardian sourceを拒否する回帰を追加した。
本番shellの対応scopeとglobal installは変更していない。これはn=1の機能probeであり、
旧版と候補版のend-to-end比較やtoken・wall改善の証明ではない。費用scopeの残件は
[#67](https://github.com/ykawase1011/hanchou/issues/67)、承認経路は[#79](https://github.com/ykawase1011/hanchou/issues/79)で追跡する。

### 計測テストの期限と失敗診断（2026-10-25）

macOS / Bash 3.2 / jq 1.6 / ccusage 20.0.37で、正常な最初のsettled fixtureが
テスト指定の1,600ms期限内に照合できず、`invalid_native_log`で終了する経路を再現した。
同じfixture・計測script・mockで期限だけ15,000msにした観測は1.928秒で
`ready`、110 tokensに一致した。このjq 1.6の`now`は整数秒であり、短い期限の
成否は時計精度とホスト負荷にも影響される。過去のB2/C1試行では失敗receiptが
保存されていないため、同じ原因だったとは断定せず、当時の検証失敗は維持する。

`tests/test-measure-session.sh`の正誤判定は計測scriptの既定10,000msを使う。
2秒遅れる正しいtool応答の照合を追加し、race再読取りとhangしたhelper・子processの
回収も同じ期限で検査する。失敗receiptはmock mode・fixture版・exitとともにstderrへ
表示し、一時fixtureは従来どおり削除する。診断用の意図的失敗で表示と削除を確認した。
本番2shellの期限・identity・counter判定、sandbox、固定設定は変更していない。

`make check`は0.162.1/0.163.0双方の計測回帰とlifecycle 15件を含め通過した。
0.163.0 fixtureの計測回帰はjq 1.7.1-appleでも通過した。
拒否待ちにも既定期限を使うため、この環境の全検査は約11分だった。
これはオフライン検証の安定化であり、実missionのトークン削減効果や過去試行の
検証成功を示すものではない。

### 待機・完了確認・receipt読取りの文書明確化（2026-10-25）

任務で提示されたB2/C1の限定観測は、同じ調査課題で3,671,420 tokens／46応答から
4,824,913／61応答、班長のFINISHED→acceptで265,706／2応答から1,058,525／9応答だった。
短い初回待機、pane引数の誤用、receipt envelopeに合わない抽出も報告されたが、
各要因の寄与や表示縮小だけの効果は分離できていない。

既存の長待機・batch指示を新機能とは扱わず、初回テストにも待機値を指定すること、
完全receipt保存後に判断項目を読むこと、FINISHED後の機械的確認をassertion付きで
順次まとめることを明確化した。文書ケースでは正常経路、missing/null、active usage、
assertion失敗、承認待ち、保持されたserverを照合し、後続処理の停止と独立受入・
最終settled計測・CLI終了・accept・reapの条件を維持した。
候補checkoutで`make check`全体はexit 0（両版の計測回帰、lifecycle 15件を含む）。
完全stdout/stderr/exitは任務の証拠として保存した。

この文書改善の開発任務時点では実tokens削減率は未検証。同じ課題・モデル・文脈条件で、応答数、入力全量とcache、
最終settled総量、受入品質を比較する必要がある。旧installed skillによるこの開発任務は、
候補skillのlive検証ではない。

### 待機候補の後続比較と採用範囲（2026-10-25）

上記の開発任務後、A（`78b2ddc`：初回長待機・receipt読取り・完了確認）、
B（`efd6d82`：初回と継続双方の二層待機）、C（`b1bc55c`：生存する有期限
foreground観測の継続）を別々の対で各1回比較した。CはA+Bを含み、最後の対は
A+BとA+B+Cの比較である。

| 対 | 班長＋側近の最終tokens | 応答数 | 観測差 |
| --- | ---: | ---: | ---: |
| 旧文書 → A | 6,050,658 → 5,589,045 | 88 → 78 | −7.63% |
| A → A+B | 5,730,732 → 4,699,814 | 80 → 64 | −17.99% |
| A+B → A+B+C | 5,182,855 → 5,293,337 | 72 → 74 | +2.13% |

Codex 0.163.0 / native source `cli`、ccusage 20.0.37、班長Astra/high・側近Astra/medium、
worker・fresh retryなし。固定policy/config、専用worktreeとHerdr server、同じ監査課題を
各対で使い、各nativeの最終ready/settledを一度だけ合算した。tokensはcached input込みで、
cache readは順に5,886,080 → 5,416,704、5,533,824 → 4,527,104、
4,981,120 → 5,116,672。料金・subscription枠消費率ではない。
各armは`make check`を1回通過し、FINISHED、最終settled、独立受入・保全、CLI退出、
accept/readback/reapを実施した。外側の研究・承認・整理費用は表に含まない。

Aの班長総量は1.09%増。Bの班長wallは1,633.633 → 2,107.296秒で長くなり、
外側の承認回数は12 → 15、回答タイミングにも差があった。Cでは班長の
割当→FINISHEDが2,351,957 → 2,028,575 tokens、25 → 23応答だった一方、
FINISHED→acceptは230,853 → 651,263 tokens、2 → 6応答だった。
後者にはlifecycleのGit object hashをSHA-256と誤解したguardの訂正等も含む。
その費用を差し引いた削減値を作らず、増加全体を待機へ帰属させない。

全対は異なるn=1観測であり、百分率を乗算しない。独立生成assignment、順序、cache、
host負荷、モデルの非決定性、承認回答の遅延が残り、因果効果や一般的削減率は未確定。
先行B2/C1も単一因子を統制した比較ではなく、読取り集約だけの効果は未分離。
全組合せ・別モデル・workerあり・直接実行対Hanchouの比較は行っていない。

A/Bの文書指示を採用し、Cは条件を明示した範囲に絞る。生存中の同じ観測sessionを
継続し、終了済みsessionの偽継続や重複観測を避ける。複数wait/readをまとめる優先方針は、
unknown・報告・読取り失敗での返却と、読取り・結果回収も含む固定wall deadlineを
採用hostで確認できた場合だけにする。未確認なら単発の有期限waitと状態・報告読取りへ戻す。
Cの総量増だけを理由に恒久棄却せず、完全な複合観測の成立や追加の削減効果も主張しない。

### Herdrの観測機能を限定確認（2026-10-25）

installed Herdr 0.9.5のhelpと既存試験を確認し、実agentを起動しない専用named serverで
合成状態とshell出力だけを試した。unknownに対する既定waitは300ms指定でtimeout
（実測約338ms）、unknownを明示したwaitは約15msで返却した。公開のoutput waitで
固有文字列を検出できたが、同じ既存出力にも再度一致した。文字列一致だけで今回の
報告・完了とはせず、report本文と依頼・試行の対応を別に確認する。

初回の試験準備では、停止中でもexit 0を返すstatus表示を稼働中と誤読し、workspace作成が
`server_not_running`で失敗した。保存したreceiptを確認し、別の隔離試験で公開snapshotの
成功内容を使って起動を確認した。両試験のserverは公開stop後、元PID・socketの消失を確認。
作成されたpaneのshell PIDも消失した。失敗を含む証拠とsession履歴は保持した。

これは既存の状態待機・文字列検出・process確認の限定試験であり、実AI任務やusage認定、
未知状態への遷移中の即時検出、報告と状態の同時待機、厳密な複合wall deadlineの保証ではない。
研究Cの名目13分も最後のwait/read分を超え得るため厳密期限と扱わない。
本番shell・認証・権限・役割分担を変えず、常駐監視・自動承認・新規実行ファイルを追加しない。
nativeログ、完全receipt、機械固有pathは公開Gitへ入れず、公開記録は条件・観測・限界に絞る。
