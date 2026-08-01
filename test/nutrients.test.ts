import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeAmount, parseNutrientValue, scaleNutrientValue } from "../src/domain/nutrients";

type FoodDatabase = {
  foods: Array<{ g: string; id: string; n: string; note: string; v: unknown[] }>;
  groups: Record<string, string>;
  nutrients: Array<{ key: string; label: string; unit: string }>;
  source: { correctedAt: string; foodCount: number; sha256: string; url: string };
};

const database = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/foods.json"), "utf8"),
) as FoodDatabase;

describe("official food database", () => {
  it("contains the verified source, 18 groups, 2,538 unique foods, and 14 nutrients", () => {
    expect(database.source).toMatchObject({ correctedAt: "2026-03-27", foodCount: 2538 });
    expect(database.source.url).toBe(
      "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx",
    );
    expect(database.source.sha256).toBe(
      "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c",
    );
    expect(Object.keys(database.groups)).toHaveLength(18);
    expect(database.foods).toHaveLength(2538);
    expect(new Set(database.foods.map((food) => food.id)).size).toBe(2538);
    expect(database.nutrients).toHaveLength(14);
    expect(database.foods.every((food) => food.v.length === 14)).toBe(true);
  });

  it("retains known official values for cooked white rice and a whole raw egg", () => {
    const rice = database.foods.find((food) => food.id === "01088");
    const egg = database.foods.find((food) => food.id === "12004");
    expect(rice?.g).toBe("01");
    expect(rice?.v.slice(0, 6)).toEqual([156, 2.5, 0.3, 37.1, 1.5, "0"]);
    expect(egg?.g).toBe("12");
    expect(egg?.v.slice(0, 6)).toEqual([142, 12.2, 10.2, 0.4, "0", 0.4]);
  });
});

describe("nutrient notation", () => {
  it("distinguishes measured, estimated, trace, estimated trace, and unavailable values", () => {
    expect(parseNutrientValue(12.3)).toEqual({ numeric: 12.3, status: "measured" });
    expect(parseNutrientValue("(4.5)")).toEqual({ numeric: 4.5, status: "estimated" });
    expect(parseNutrientValue("Tr")).toEqual({ numeric: null, status: "trace" });
    expect(parseNutrientValue("(Tr)")).toEqual({ numeric: null, status: "estimated_trace" });
    expect(parseNutrientValue("-")).toEqual({ numeric: null, status: "unavailable" });
  });

  it("scales numeric values by the bounded amount without converting special values to zero", () => {
    expect(scaleNutrientValue(156, 50)).toEqual({ numeric: 78, status: "measured" });
    expect(scaleNutrientValue("(4.5)", 200)).toEqual({ numeric: 9, status: "estimated" });
    expect(scaleNutrientValue("Tr", 300)).toEqual({ numeric: null, status: "trace" });
    expect(normalizeAmount(0)).toBe(1);
    expect(normalizeAmount(2500)).toBe(2000);
    expect(normalizeAmount("123.6")).toBe(124);
    expect(normalizeAmount("unknown")).toBe(100);
  });
});
