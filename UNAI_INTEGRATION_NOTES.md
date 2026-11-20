# Unai Integration Notes

## License and reuse scope

UnaiのREADMEは **MITライセンス** と明記している。したがって、著作権表示とライセンス文を保持したうえで、許諾範囲内の実装を利用・改変できる。[Unai README](https://github.com/PixelNest256/Unai/blob/main/README.md)

## Relevant response flow

UnaiはLLMではなく、`skills/priority.json` の順に有効なスキルを評価する。入力がスラッシュコマンドなら先に処理し、それ以外は各スキルの `match()` を順番に評価する。最初に一致し、かつ `respond()` が応答を返すスキルを採用する。一致がなければ固定フォールバックを返す。

## Integration decision

ClioはNode.jsの管理ランタイムで動作するため、Pythonモジュールの動的ロードや任意スキルの実行をそのままサーバーに持ち込まない。代わりに、Unaiの **優先順位付き `match → respond` ルーター** をTypeScriptで忠実に実装し、Unaiの公開済み組み込みスキルのうち安全に実装できる処理を信頼済みハンドラとして登録する。外部パッケージを含むZIPスキルのアップロード・インストール・任意コード実行は、ホスティング環境の安全性のため対象外とする。

実装では `greeting`、`wikipedia`、`ddgs`、`calc`、`joke`、`ddgs_chatbot` の順番を維持した。各入力はこの順に一致判定され、最初に応答を返したハンドラを採用する。`/help` と `/help <skill_id>` もLLMを介さず先に処理する。CalculatorとGreetingの実操作、4ファイル・7テスト、型検査、再起動後のUI表示を確認した。

## Sources

- [README.md](https://raw.githubusercontent.com/PixelNest256/Unai/main/README.md)
- [unai_core.py](https://raw.githubusercontent.com/PixelNest256/Unai/main/unai_core.py)
- [app.py](https://raw.githubusercontent.com/PixelNest256/Unai/main/app.py)
