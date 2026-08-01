# 成分ならべ

文部科学省「日本食品標準成分表（八訂）増補2023年」の2,538食品から、14成分を最大4食品まで並べて比較するウェブアプリです。100g当たりだけでなく、食品ごとに指定した量とトレイ全体の合計を確認できます。

## 開発

```powershell
npm install
npm run dev
```

公開前の一括確認は `npm run release:check`、`npm run check`、`npm test`、`npm run build` です。

## データと保存

- 食品と成分は文部科学省の公式Excelを変換した静的データです。実行時に外部サービスへ接続しません。
- 検索はブラウザ内で行い、検索語をサーバーへ送りません。
- 選んだ最大4食品の食品番号と量はブラウザの `localStorage` だけに保存します。
- 匿名計測にはランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保存します。

詳細は [SOURCE.md](SOURCE.md)、[PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md) を参照してください。

## 公開先

<https://seibun-narabe.yhay81.com>
