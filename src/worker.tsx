import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

export type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(code);
  }
}

const canonicalOrigin = "https://seibun-narabe.yhay81.com";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const telemetryNames = new Set([
  "visited",
  "searched",
  "compared",
  "amount_changed",
  "summary_copied",
  "saved",
  "returned",
]);
const groups = [
  ["01", "穀類"],
  ["02", "いも・でん粉"],
  ["03", "砂糖・甘味"],
  ["04", "豆類"],
  ["05", "種実類"],
  ["06", "野菜類"],
  ["07", "果実類"],
  ["08", "きのこ類"],
  ["09", "藻類"],
  ["10", "魚介類"],
  ["11", "肉類"],
  ["12", "卵類"],
  ["13", "乳類"],
  ["14", "油脂類"],
  ["15", "菓子類"],
  ["16", "し好飲料類"],
  ["17", "調味料・香辛料"],
  ["18", "調理済み食品"],
] as const;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError("cross_site_request", 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new ApiError("cross_site_request", 403);
};

const parseJson = async (c: AppContext, maximumBytes = 256) => {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError("unsupported_media_type", 415);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes)
    throw new ApiError("payload_too_large", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const recordEvent = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-seibun-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(await sha256(session), name, c.req.header("x-seibun-qa") === "1" ? 1 : 0, nowSeconds())
    .run();
};

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width,initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}
      <link href={canonical} rel="canonical" />
      <meta content="website" property="og:type" />
      <meta content="成分ならべ" property="og:site_name" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${canonicalOrigin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#31483d" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
      <script defer src="/app.js" />
    </head>
    <body>
      <a class="skip-link" href="#main">
        本文へ
      </a>
      <header class="site-header">
        <a aria-label="成分ならべ ホーム" class="wordmark" href="/">
          <span aria-hidden="true" class="mini-label">
            <i />
            <i />
            <i />
          </span>
          <span>成分ならべ</span>
        </a>
        <nav aria-label="案内">
          <a href="/guide">使い方</a>
          <a href="/source">出典</a>
          <a href="/privacy">保存</a>
        </nav>
      </header>
      {children}
      <footer class="site-footer">
        <span>出典：文部科学省「日本食品標準成分表（八訂）増補2023年」</span>
        <span>
          <a
            href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html"
            rel="noopener noreferrer"
          >
            公式成分表
          </a>
          <a href="https://www.mext.go.jp/b_menu/1351168.htm" rel="noopener noreferrer">
            利用規約
          </a>
        </span>
      </footer>
    </body>
  </html>
);

const ScaleScene = () => (
  <div aria-hidden="true" class="scale-scene">
    <div class="scale-tray">
      <span class="food-block rice">米</span>
      <span class="food-block bean">豆</span>
      <span class="food-block greens">菜</span>
    </div>
    <div class="scale-neck" />
    <div class="scale-body">
      <span class="scale-display">100 g</span>
      <i />
      <i />
      <i />
    </div>
    <div class="nutrition-slip">
      <b>食品成分</b>
      <span>エネルギー</span>
      <i />
      <span>たんぱく質</span>
      <i />
      <span>食物繊維</span>
      <i />
      <strong>比較 01—04</strong>
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/`}
    description="文部科学省の2,538食品を名前や食品群から探し、100g当たりと任意量の栄養成分を最大4食品まで並べて比較できます。"
    title="食品の栄養成分を並べて比較 | 成分ならべ"
  >
    <main class="home" id="main">
      <section class="market-board" aria-labelledby="product-title">
        <div class="product-heading">
          <p class="eyebrow">2,538 FOODS / 14 NUTRIENTS</p>
          <h1 id="product-title">食品を置く。成分の違いが見える。</h1>
          <p>公式の食品成分を100gでも、食べる量でも。四つまで同じ台に並べます。</p>
        </div>
        <ScaleScene />
        <div class="search-station">
          <label class="food-search" for="food-search">
            <span>食品名・別名から探す</span>
            <span class="search-box">
              <i aria-hidden="true">⌕</i>
              <input
                autocomplete="off"
                id="food-search"
                placeholder="ごはん、納豆、バナナ…"
                type="search"
              />
            </span>
          </label>
          <label class="group-filter" for="group-filter">
            <span>食品群</span>
            <select id="group-filter">
              <option value="">すべての食品群</option>
              {groups.map(([code, name]) => (
                <option value={code}>{name}</option>
              ))}
            </select>
          </label>
          <p id="search-status" role="status">
            公式データを読み込んでいます…
          </p>
        </div>
      </section>

      <div class="source-ribbon">
        <span>文部科学省</span>
        <span>八訂 増補2023年</span>
        <span>正誤反映 2026-03-27</span>
        <a href="/source">数値の読み方</a>
      </div>

      <section class="food-workspace" id="workspace">
        <section class="result-basket" aria-labelledby="result-heading">
          <header class="section-heading">
            <div>
              <p>食品棚</p>
              <h2 id="result-heading">見つかった食品</h2>
            </div>
            <output id="result-count">—件</output>
          </header>
          <div class="quick-picks" aria-label="よく見る食品">
            <button data-food="01088" type="button">
              ごはん
            </button>
            <button data-food="04046" type="button">
              納豆
            </button>
            <button data-food="12004" type="button">
              卵
            </button>
            <button data-food="13003" type="button">
              牛乳
            </button>
            <button data-food="07107" type="button">
              バナナ
            </button>
            <button data-food="06263" type="button">
              ブロッコリー
            </button>
          </div>
          <div class="food-results" id="food-results">
            <p class="loading-note">成分表を開いています…</p>
          </div>
        </section>

        <section class="comparison-counter" aria-labelledby="comparison-heading">
          <header class="counter-heading">
            <div>
              <p>比較台</p>
              <h2 id="comparison-heading">四つまで並べる</h2>
            </div>
            <output id="comparison-count">0 / 4</output>
          </header>
          <div class="comparison-cards" id="comparison-cards">
            <p class="empty-comparison">
              食品棚から「比べる」を押すと、ここに食品トレイが並びます。
            </p>
          </div>
          <section class="nutrient-board" aria-labelledby="nutrient-heading">
            <header>
              <div>
                <p>一つ選んで比較</p>
                <h3 id="nutrient-heading">成分ものさし</h3>
              </div>
              <span>選んだ量あたり</span>
            </header>
            <div class="nutrient-tabs" id="nutrient-tabs" />
            <div class="bar-comparison" id="bar-comparison">
              <p>食品を置くと棒が伸びます。</p>
            </div>
          </section>
          <section class="meal-total" aria-labelledby="total-heading">
            <header>
              <div>
                <p>全部を合わせる</p>
                <h3 id="total-heading">トレイ合計</h3>
              </div>
              <strong id="total-weight">0 g</strong>
            </header>
            <dl id="total-nutrients" />
            <p class="notation-note">※ 括弧付き数値は推定値。Trは微量、—は未測定です。</p>
          </section>
          <div class="comparison-actions">
            <button disabled id="copy-summary" type="button">
              比較をコピー
            </button>
            <button class="clear-button" disabled id="clear-comparison" type="button">
              すべて外す
            </button>
          </div>
        </section>
      </section>
    </main>
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/guide`}
    description="成分ならべで食品を検索し、食べる量に合わせて栄養成分を比較する方法。"
    title="使い方 | 成分ならべ"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">並</span>
        <div>
          <p>使い方</p>
          <h1>食品を同じ台へ置く</h1>
        </div>
      </header>
      <div class="instruction-grid">
        <section>
          <b>一</b>
          <h2>食品を探す</h2>
          <p>食品名、別名、備考のことば、または18食品群から絞ります。</p>
        </section>
        <section>
          <b>二</b>
          <h2>食べる量を合わせる</h2>
          <p>最大4食品を比較台へ置き、それぞれ1〜2,000gの範囲で量を変えます。</p>
        </section>
        <section>
          <b>三</b>
          <h2>違いと合計を見る</h2>
          <p>14成分の棒とトレイ合計を確認し、必要なら文章としてコピーします。</p>
        </section>
      </div>
      <aside class="care-note">
        <strong>数値の位置づけ</strong>
        <p>
          食品の一般的な成分値を比べる道具です。個別の製品、調理差、体調に応じた医療・栄養指導を示すものではありません。
        </p>
      </aside>
      <a class="page-cta" href="/">
        食品を並べる
      </a>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/source`}
    description="成分ならべが利用する日本食品標準成分表、収録範囲、特殊記号、出典と加工の説明。"
    title="出典と数値 | 成分ならべ"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">典</span>
        <div>
          <p>出典と数値</p>
          <h1>公式2,538食品を、比べる形へ</h1>
        </div>
      </header>
      <div class="source-grid">
        <section>
          <h2>出典</h2>
          <p>
            文部科学省「
            <a
              href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html"
              rel="noopener noreferrer"
            >
              日本食品標準成分表（八訂）増補2023年
            </a>
            」第2章Excelを使用し、令和8年3月27日付正誤表を反映した版を収録します。
          </p>
        </section>
        <section>
          <h2>表示の加工</h2>
          <p>
            18食品群・2,538食品から14成分を選び、可食部100g当たりの値を表示します。指定量は100g値へ重量比を掛け、複数食品の数値を合計します。文部科学省が作成した画面ではありません。
          </p>
        </section>
        <section>
          <h2>記号</h2>
          <p>
            括弧付き数値は推定値、Trは最小記載量の10分の1以上5分の1未満等の微量、—は未測定です。微量と未測定は数値の合計へ加えません。
          </p>
        </section>
        <section>
          <h2>利用条件</h2>
          <p>
            <a href="https://www.mext.go.jp/b_menu/1351168.htm" rel="noopener noreferrer">
              文部科学省ウェブサイト利用規約
            </a>
            に従い、出典と加工を表示します。数値データと簡単な表は自由に利用でき、同規約は政府標準利用規約2.0に準拠しCC
            BY 4.0と互換です。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${canonicalOrigin}/privacy`}
    description="成分ならべの食品検索、比較トレイ、匿名利用計測の保存範囲。"
    title="保存とプライバシー | 成分ならべ"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">守</span>
        <div>
          <p>保存</p>
          <h1>比較トレイはこの端末だけ</h1>
        </div>
      </header>
      <div class="privacy-grid">
        <section>
          <h2>検索</h2>
          <p>
            2,538食品のデータをブラウザへ読み込み、入力した食品名と食品群を端末内で照合します。検索語をサーバーへ送りません。
          </p>
        </section>
        <section>
          <h2>比較トレイ</h2>
          <p>
            選んだ最大4食品の食品番号と量は、このブラウザのlocalStorageだけに保存します。アカウントやCookieは使いません。
          </p>
        </section>
        <section>
          <h2>利用計測</h2>
          <p>
            ランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保持します。検索語、食品番号、量、成分値の列はありません。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", requestId());
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});

app.get("/", (c) => {
  c.header("Cache-Control", "public,max-age=60,s-maxage=300");
  return c.html(<HomePage />);
});
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  const payload = await parseJson(c);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ApiError("invalid_request", 400);
  const name =
    typeof (payload as Record<string, unknown>).name === "string"
      ? (payload as Record<string, string>).name
      : "";
  if (!telemetryNames.has(name)) throw new ApiError("invalid_event", 400);
  await recordEvent(c, name);
  return c.body(null, 202);
});

app.get("/health", async (c) => {
  const database = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({ foods: 2538, nutrients: 14, ok: database?.ok === 1, service: "seibun-narabe" });
});

app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/sitemap/0.9">${paths.map((path) => `<url><loc>${canonicalOrigin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=3600,s-maxage=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${canonicalOrigin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 成分ならべ"
    >
      <main class="not-found" id="main">
        <span>404</span>
        <h1>この食品棚はありません</h1>
        <p>検索と比較の台へ戻ってください。</p>
        <a href="/">食品を並べる</a>
      </main>
    </Layout>,
  );
});

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.code, requestId: c.get("requestId") }, error.status);
  console.error(
    "request_failed",
    c.get("requestId"),
    error instanceof Error ? error.message : "unknown",
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export { app };
export default { fetch: app.fetch, scheduled };
