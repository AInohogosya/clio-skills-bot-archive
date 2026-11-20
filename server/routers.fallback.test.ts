import { describe, expect, it } from "vitest";
import { autoSelectSkill, catalogFallback } from "./routers";

const catalog = [
  { sourceId: "ddgs", name: "Web Search Summary", category: "Research", description: "検索結果を要約します。" },
  { sourceId: "calc", name: "Calculator", category: "Utility", description: "数式を計算します。" },
];

describe("catalogFallback", () => {
  it("routes a math expression to Calculator when the LLM is unavailable", () => {
    const response = catalogFallback("x^2 - 4 = 0 を解きたい", catalog);

    expect(response.mode).toBe("fallback");
    expect(response.matchedSkillIds).toEqual(["calc"]);
    expect(response.content).toContain("Calculator");
  });

  it("returns an explicit automatic selection for a research request", () => {
    const result = autoSelectSkill("競合をWebで検索して調べたい", catalog);

    expect(result.skill?.sourceId).toBe("ddgs");
    expect(result.reason).toContain("検索");
  });
});
