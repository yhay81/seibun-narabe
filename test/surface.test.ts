import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product surface", () => {
  const worker = read("src/worker.tsx");
  const domain = read("src/domain/nutrients.ts");
  const client = read("public/app.js");
  const css = read("public/styles.css");
  const migration = read("migrations/0001_telemetry.sql");
  const source = read("SOURCE.md");

  it("communicates through a grocery scale, food trays, and nutrient bars without oversized type", () => {
    expect(worker).toContain('class="scale-scene"');
    expect(worker).toContain('class="nutrition-slip"');
    expect(worker).toContain('class="comparison-cards"');
    expect(worker).toContain('class="nutrient-board"');
    expect(client).toContain('card.className = "food-card"');
    expect(client).toContain('card.className = "comparison-card"');
    expect(client).toContain('track.className = "bar-track"');
    expect(css.toLowerCase()).not.toContain("gradient");
    expect(css).not.toMatch(/h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px/su);
  });

  it("keeps queries and comparison details out of APIs, telemetry, and URLs", () => {
    expect(worker).toContain('app.post("/api/telemetry"');
    expect(worker).not.toContain('app.post("/api/search"');
    expect(client).toContain('fetch("/foods.json"');
    expect(client).toContain("localStorage");
    expect(client).toContain("slice(0, 4)");
    expect(migration).not.toMatch(
      /food_id|query|search_term|selected_food|gram_value|nutrient_value|email|phone|advertising/iu,
    );
    expect(migration).toContain("CHECK(event_name IN");
    expect(client).not.toMatch(/history\.(?:pushState|replaceState)|location\.search\s*=/u);
  });

  it("bounds amounts and preserves official special notation", () => {
    expect(domain).toContain('text === "Tr"');
    expect(domain).toContain('text === "(Tr)"');
    expect(domain).toContain("Math.min(2000, Math.max(1");
    expect(client).toContain('text === "Tr" || text === "(Tr)"');
    expect(client).toContain('estimated: text.startsWith("(")');
    expect(client).toContain("numeric === null");
    expect(worker).not.toContain('fetch("https://');
  });

  it("renders data as text and limits the saved comparison to four foods", () => {
    expect(client).not.toContain("innerHTML");
    expect(worker).not.toContain("dangerouslySetInnerHTML");
    expect(client).toContain("textContent");
    expect(client).toContain("selected.length >= 4");
    expect(client).toContain("selected.slice(0, 4)");
  });

  it("states the official source, terms, corrected date, transformation, and limitations", () => {
    expect(source).toContain("文部科学省");
    expect(source).toContain("日本食品標準成分表（八訂）増補2023年");
    expect(source).toContain("令和8年3月27日正誤反映版");
    expect(source).toContain("政府標準利用規約2.0");
    expect(source).toContain("加工内容");
    expect(worker).toContain("文部科学省が作成した画面ではありません");
    expect(worker).toContain("医療・栄養指導を示すものではありません");
  });

  it("marks automated QA and needs no account for local comparisons", () => {
    expect(client).toContain("navigator.webdriver === true");
    expect(client).toContain('"X-Seibun-QA"');
    expect(`${worker}\n${client}`).not.toMatch(/better-auth|betterAuth/iu);
  });
});
