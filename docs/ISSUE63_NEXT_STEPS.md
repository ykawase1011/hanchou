# Issue #63: 次の設計判断（未承認）

12試験で、単発launcherの起動確認は実機で成功したが、Sol mediumの班長が30万tokens、
Astra mediumの側近が20万tokensの目安で成果受入・保存・解放まで完遂する条件は未達。
全試験の結果と範囲は[検証記録](VALIDATION.md)を参照する。30万はこの試験の工学的な
checkpointであり、weekly quotaや一般的な妥当量を表す値ではない。

## 判明した問題

- 短い待機でも再入力されるcontextが大きい。試験3は空に近い3往復で120,383 tokensを追加した。
- 起動確認を毎回コード生成すると、ACK表記、jq版、log所属、counter鮮度で手戻りが発生した。
  固定の初回確認は既存launcherにまとめて実機で成功した。
- 班長自身の計測・照合・予算式は依然として毎回組み立てられ、準備と終了報告に複数往復を使う。
  指示や依頼templateを増やしても、この動作は安定しなかった。
- 無関係なhost contextの縮小だけでは完遂条件を満たさなかった。

## 推奨案: 計測だけを単発shellへ移す

本番の`measure-session.sh`を1本追加する案。まだ実装しない。
目的はLLMが毎回生成している同じ照合処理を既存CLIの狭いwrapperへ移すこと。

- 入力: provider、native ID、根拠のあるlog home、期待cwd/model、現在依頼を識別するmarker。
- 出力: 既存ccusageの観測、nativeとの一致、不一致理由、scope、観測時刻、input非cache／cache／output。
- 既存の検証済みprovider/versionのみ扱う。欠測・fork/reset等の未対応scopeは明示的に失敗する。
- 1回の照合で終了。mission送信、任意コード実行、永続集計、DB、daemon、schedulerを持たない。
- 予算・残り往復の判断は班長が持つ。計測値をweekly quotaへ換算しない。
- 設定、権限、認証、source checkoutや成果を変更しない。資源削除の機能を含めない。

受入はオフラインの不正値・identity・version・scope・timeout検査の後、
同じSol medium／Astra medium、30万／20万、worker0・retry0の試験を1回だけ行う。
起動前だけで約10万を超えた場合は原因を記録して止め、さらに説明文を積み増して繰り返さない。
比較時は初回入力、往復数、全対象sessionの最終使用量、成果、保存、解放を記録する。

## 必要な承認

現行[AGENTS.md](../AGENTS.md)は次の制約を持つ。

> The only production executable allowed is the narrowly scoped, one-shot shell
> `skills/hanchou-orchestrator/scripts/launch-sokkin.sh`.

追加shellはこの明示的制約の例外になるため、ユーザーの設計承認が必要。
承認前に新たな本番scriptを追加したり、launcherを汎用runtimeへ拡張したりしない。

## 制約を維持する場合

既に検証した起動確認の改善を採用し、計測・受入の安定化は未解決として残す。
班長モデルをAstraへ変える比較は別条件として可能だが、Solでの完遂やweekly消費低減の
証明にはならない。予算を引き上げる較正試験も元の30万条件の合格とは区別する。
