export type NutrientStatus = "estimated" | "estimated_trace" | "measured" | "trace" | "unavailable";

export type ParsedNutrient = {
  numeric: number | null;
  status: NutrientStatus;
};

export const parseNutrientValue = (value: unknown): ParsedNutrient => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { numeric: value, status: "measured" };
  }
  if (typeof value !== "string") return { numeric: null, status: "unavailable" };

  const text = value.trim();
  if (!text || text === "-") return { numeric: null, status: "unavailable" };
  if (text === "Tr") return { numeric: null, status: "trace" };
  if (text === "(Tr)") return { numeric: null, status: "estimated_trace" };

  const estimated = text.startsWith("(") && text.endsWith(")");
  const numeric = Number(estimated ? text.slice(1, -1) : text);
  if (!Number.isFinite(numeric)) return { numeric: null, status: "unavailable" };
  return { numeric, status: estimated ? "estimated" : "measured" };
};

export const scaleNutrientValue = (value: unknown, grams: number) => {
  const parsed = parseNutrientValue(value);
  if (parsed.numeric === null) return parsed;
  const boundedGrams = Math.min(2000, Math.max(1, Number.isFinite(grams) ? grams : 100));
  return { ...parsed, numeric: (parsed.numeric * boundedGrams) / 100 };
};

export const normalizeAmount = (value: unknown) => {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) ? Math.min(2000, Math.max(1, numeric)) : 100;
};
