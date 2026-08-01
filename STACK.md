# Stack

- Cloudflare Workers / D1 / Static Assets
- Hono / Hono JSX
- Vite+
- TypeScript 7
- Vitest / Oxlint / Oxfmt

食品成分表は静的JSONとして配信し、検索・比較・合計はブラウザ内で行います。D1は匿名の製品利用計測だけに使います。個人データや端末間同期を必要としないため、認証は導入していません。
