# Hanchou v2 仕様

Hanchouは4つのスキルと単発の側近起動シェルで構成する。
班長は依頼・結果報告・使用量監督に集中し、側近が作業遂行を担当する。

| 項目 | 契約 |
| --- | --- |
| 設定 | 対象project rootの`.hanchou/config.json`を固定して読む。`version: 2`、`sokkin.agent: codex / claude`、任意の`model`と`effort: low / medium / high`。JSONをshellコードとして実行しない |
| 方針 | `.hanchou/policy.md`に責務・権限・報告方針を置く。依頼の一時指定を永続設定へ自動反映しない |
| 起動 | `skills/hanchou-orchestrator/scripts/launch-sokkin.sh`は必ず新規branch・worktreeを作成・照合してから専用Herdr workspaceの最初のタブへ側近を起動する |
| 保全 | 元checkoutのbranch切替・reset・stash・未コミット変更の移送を行わない。失敗時に元checkoutで代替実行しない |
| 接続 | 版付きJSONでmission・attempt、設定元、worktree、Herdr接続先、provider・native ID、計測準備状態、失敗・残存資源を返す |
| 人間向け表示 | 側近起動ごとに班長が対象Herdrのviewerタブを開き、workspace表示を確認して残す。同一側近への追加指示では再利用。表示不能時は明示的な画面なし実行の指定がない限り実作業の割当を待つ |
| 作業開始 | 起動結果と側近の受領を照合し、native IDと計測元が対応してから実作業を渡す |
| 使用量 | 入力・出力・cacheと親子実行を区別し、resume・fork・重複を扱う。欠測は不明。起動時点からの使用量も含める |
| 制御 | 許可済みagent・model・認証経路と有限の予算・並列数・再試行上限を守る。計測不能・上限到達時は新規割当を止める |
| Claude | 公式Claude Codeの許可済みサブスク認証限定。API・追加課金経路へ自動fallbackしない |
| 報告 | 通常のworker通知を集約し、完了・判断要求・予算問題・継続不能を班長から人間へ伝える |
| 完了・解放 | 成果、検証、未解決事項、使用量を確認して受入。停止・workspace閉鎖・worktree削除を分け、未保存成果を残す |

新しい側近への置換・再起動でも新規branch・worktreeを作る。同じ生存中の側近への
追加指示やviewer再接続は新規起動ではない。側近の再帰起動は行わない。
タイムアウト時は元試行の状態と受領を照合してから再送する。

worktreeは強制的なファイルアクセス隔離ではない。厳密なトークン上限の即時停止や、
全ホストでの班長の自動復帰は保証しない。実機の対応範囲は[検証状況](docs/VALIDATION.md)、
要件と受入基準の詳細は[設計書](docs/HANCHOU_V2_DESIGN.md)を参照する。
