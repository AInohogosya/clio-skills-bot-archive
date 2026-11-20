import { afterEach, describe, expect, it, vi } from "vitest";
import { calculate, clearExternalSkillCache, matchSkill, runSkills, SPEED_TARGETS } from "./skills";

function stubPublicSearch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("wikipedia")) {
      return new Response(JSON.stringify({ title: "JavaScript", extract: "JavaScript is a programming language. It is widely used on the web." }), { status: 200 });
    }
    return new Response(JSON.stringify({ Heading: "JavaScript", AbstractText: "JavaScript is a programming language used to create interactive web pages." }), { status: 200 });
  }));
}

describe("Clio's Unai-compatible skills", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearExternalSkillCache();
  });

  it("runs the Greeting skill independently", async () => {
    const result = await runSkills({ message: "こんにちは", enabledSkillIds: ["greeting"], priority: ["greeting"] });
    expect(result.matchedSkills).toEqual(["greeting"]);
    expect(result.candidates[0]?.response).toContain("こんにちは");
  });

  it("runs the Calculator skill independently for safe arithmetic", async () => {
    const result = await runSkills({ message: "calc: 7 + 3 * 2", enabledSkillIds: ["calc"], priority: ["calc"] });
    expect(result.matchedSkills).toEqual(["calc"]);
    expect(result.candidates[0]?.response).toContain("13");
    expect(calculate("2 ^ 8")).toBe(256);
    expect(() => calculate("process.exit(1)")).toThrow();
  });

  it("runs Unit Converter with category checks and temperature safeguards", async () => {
    const converted = await runSkills({ message: "2.5 km to mi", enabledSkillIds: ["unit_converter"], priority: ["unit_converter"], executionMode: "auto" });
    const mismatch = await runSkills({ message: "2 kg to m", enabledSkillIds: ["unit_converter"], priority: ["unit_converter"], executionMode: "auto" });
    const invalidTemperature = await runSkills({ message: "-300 C to F", enabledSkillIds: ["unit_converter"], priority: ["unit_converter"], executionMode: "auto" });
    expect(converted.candidates[0]?.response).toContain("1.553");
    expect(mismatch.candidates[0]?.response).toContain("異なる種類の単位");
    expect(invalidTemperature.candidates[0]?.response).toContain("絶対零度");
  });

  it("runs Date Planner for differences, offsets, weekdays, and invalid input guidance", async () => {
    const difference = await runSkills({ message: "日数: 2026-04-01 から 2026-04-10", enabledSkillIds: ["date_planner"], priority: ["date_planner"], executionMode: "auto" });
    const offset = await runSkills({ message: "2026-04-01から30日後", enabledSkillIds: ["date_planner"], priority: ["date_planner"], executionMode: "auto" });
    const weekday = await runSkills({ message: "曜日: 2026-04-10", enabledSkillIds: ["date_planner"], priority: ["date_planner"], executionMode: "auto" });
    const invalid = await runSkills({ message: "日付を計画したい", enabledSkillIds: ["date_planner"], priority: ["date_planner"], executionMode: "auto" });
    expect(difference.candidates[0]?.response).toContain("9日");
    expect(offset.candidates[0]?.response).toContain("2026-05-01");
    expect(weekday.candidates[0]?.response).toContain("金曜日");
    expect(invalid.candidates[0]?.response).toContain("日付スキルの例");
  });

  it("runs JSON Toolkit for formatting, validation, keys, minification, and parse failures", async () => {
    const formatted = await runSkills({ message: 'JSON整形: {"name":"Clio","active":true}', enabledSkillIds: ["json_toolkit"], priority: ["json_toolkit"], executionMode: "auto" });
    const keys = await runSkills({ message: 'JSONキー: {"name":"Clio","active":true}', enabledSkillIds: ["json_toolkit"], priority: ["json_toolkit"], executionMode: "auto" });
    const minified = await runSkills({ message: 'JSON圧縮: { "name": "Clio" }', enabledSkillIds: ["json_toolkit"], priority: ["json_toolkit"], executionMode: "auto" });
    const invalid = await runSkills({ message: 'JSON検証: {"name":}', enabledSkillIds: ["json_toolkit"], priority: ["json_toolkit"], executionMode: "auto" });
    expect(formatted.candidates[0]?.response).toContain("\n  \"name\"");
    expect(keys.candidates[0]?.response).toContain("• name");
    expect(minified.candidates[0]?.response).toContain('{"name":"Clio"}');
    expect(invalid.candidates[0]?.response).toContain("JSON validation failed");
  });

  it("supports Calculator solve, expand, and factor patterns", async () => {
    const solved = await runSkills({ message: "solve: x^2 - 4", enabledSkillIds: ["calc"], priority: ["calc"] });
    const expanded = await runSkills({ message: "expand: (x+1)^2", enabledSkillIds: ["calc"], priority: ["calc"] });
    const factored = await runSkills({ message: "factor: x^2 - 4", enabledSkillIds: ["calc"], priority: ["calc"] });
    expect(solved.candidates[0]?.response).toContain("-2");
    expect(solved.candidates[0]?.response).toContain("2");
    expect(expanded.candidates[0]?.response).toContain("x^2");
    expect(factored.candidates[0]?.response).toContain("x");
  });

  it("runs the Wikipedia skill independently", async () => {
    stubPublicSearch();
    const result = await runSkills({ message: "what is JavaScript?", enabledSkillIds: ["wikipedia"], priority: ["wikipedia"] });
    expect(result.matchedSkills).toEqual(["wikipedia"]);
    expect(result.candidates[0]?.response).toContain("JavaScript");
  });

  it("runs the DDGS Search skill independently", async () => {
    stubPublicSearch();
    const result = await runSkills({ message: "search JavaScript", enabledSkillIds: ["ddgs"], priority: ["ddgs"] });
    expect(result.matchedSkills).toEqual(["ddgs"]);
    expect(result.candidates[0]?.response).toContain("JavaScript");
  });

  it("runs the Joke skill independently", async () => {
    const result = await runSkills({ message: "プログラマーのジョークを教えて", enabledSkillIds: ["joke"], priority: ["joke"] });
    expect(result.matchedSkills).toEqual(["joke"]);
    expect(result.candidates[0]?.response.length).toBeGreaterThan(10);
  });

  it("runs the Valves Test skill independently with current settings", async () => {
    const result = await runSkills({ message: "設定確認", enabledSkillIds: ["valves_test"], priority: ["valves_test"], valves: { maxResults: 3, excludeQuestions: false, excludeQueryMatch: true, minSentenceLength: 12 } });
    expect(result.matchedSkills).toEqual(["valves_test"]);
    expect(result.candidates[0]?.response).toContain("max_results: 3");
    expect(result.candidates[0]?.response).toContain("exclude_questions: false");
  });

  it("runs the DDGS Chatbot fallback independently", async () => {
    stubPublicSearch();
    const result = await runSkills({ message: "unstructured JavaScript question", enabledSkillIds: ["ddgs_chatbot"], priority: ["ddgs_chatbot"], valves: { maxResults: 8, excludeQuestions: false, excludeQueryMatch: false, minSentenceLength: 1 } });
    expect(result.matchedSkills).toEqual(["ddgs_chatbot"]);
    expect(result.candidates[0]?.response).toContain("Search Chat");
  });

  it("keeps multiple matching candidates in the chosen priority order", async () => {
    stubPublicSearch();
    const result = await runSkills({ message: "hello", enabledSkillIds: ["greeting", "ddgs_chatbot"], priority: ["greeting", "ddgs_chatbot"], valves: { maxResults: 8, excludeQuestions: false, excludeQueryMatch: false, minSentenceLength: 1 } });
    expect(result.matchedSkills).toEqual(["greeting", "ddgs_chatbot"]);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["greeting", "ddgs_chatbot"]);
  });

  it("runs only the highest-priority matched skill in auto mode", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ Heading: "Unused", AbstractText: "This request should not run." }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runSkills({ message: "hello", enabledSkillIds: ["greeting", "ddgs_chatbot"], priority: ["greeting", "ddgs_chatbot"], executionMode: "auto" });
    expect(result.matchedSkills).toEqual(["greeting", "ddgs_chatbot"]);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["greeting"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the three new skills ahead of the search fallback in auto mode", async () => {
    const dateResult = await runSkills({ message: "2026-04-01から30日後", enabledSkillIds: ["date_planner", "ddgs_chatbot"], priority: ["date_planner", "ddgs_chatbot"], executionMode: "auto" });
    const unitResult = await runSkills({ message: "100 cm to m", enabledSkillIds: ["unit_converter", "ddgs_chatbot"], priority: ["unit_converter", "ddgs_chatbot"], executionMode: "auto" });
    const jsonResult = await runSkills({ message: 'JSON検証: {"ok":true}', enabledSkillIds: ["json_toolkit", "ddgs_chatbot"], priority: ["json_toolkit", "ddgs_chatbot"], executionMode: "auto" });
    expect(dateResult.candidates.map((candidate) => candidate.id)).toEqual(["date_planner"]);
    expect(unitResult.candidates.map((candidate) => candidate.id)).toEqual(["unit_converter"]);
    expect(jsonResult.candidates.map((candidate) => candidate.id)).toEqual(["json_toolkit"]);
  });

  it("returns static auto-routed answers within the response budget", async () => {
    const startedAt = performance.now();
    const result = await runSkills({ message: "hello", enabledSkillIds: ["greeting", "ddgs_chatbot"], priority: ["greeting", "ddgs_chatbot"], executionMode: "auto" });
    expect(result.candidates[0]?.id).toBe("greeting");
    expect(performance.now() - startedAt).toBeLessThan(SPEED_TARGETS.staticAutoResponseMs);
  });

  it("caches repeated external lookups", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ title: "JavaScript", extract: "JavaScript is a programming language." }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = { message: "what is JavaScript?", enabledSkillIds: ["wikipedia"], priority: ["wikipedia"], executionMode: "auto" as const };
    await runSkills(input);
    await runSkills(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns cached external answers within the response budget", async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify({ title: "JavaScript", extract: "JavaScript is a programming language." }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const input = { message: "what is JavaScript?", enabledSkillIds: ["wikipedia"], priority: ["wikipedia"], executionMode: "auto" as const };
    await runSkills(input);
    const startedAt = performance.now();
    await runSkills(input);
    expect(performance.now() - startedAt).toBeLessThan(SPEED_TARGETS.cachedExternalResponseMs);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses Unai-compatible match patterns", () => {
    expect(matchSkill("greeting", "こんにちは")).toBe(true);
    expect(matchSkill("calc", "calc: 7 + 3 * 2")).toBe(true);
    expect(matchSkill("date_planner", "2026-04-01から30日後")).toBe(true);
    expect(matchSkill("unit_converter", "100 cm to m")).toBe(true);
    expect(matchSkill("json_toolkit", 'JSON検証: {"ok":true}')).toBe(true);
    expect(matchSkill("ddgs_chatbot", "a completely unstructured request")).toBe(true);
  });
});
