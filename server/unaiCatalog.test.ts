import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUnaiSkills, getCatalogSkills } from "./unaiCatalog";
import { unaiPriority } from "./unaiRuntime";

describe("fetchUnaiSkills", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("priority.json の順序とメタデータ、helpをカタログ項目へ変換する", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("priority.json")) {
        return new Response(JSON.stringify({ order: ["calc", "joke"], disabled: [] }));
      }
      if (url.endsWith("calc/meta.json")) {
        return new Response(JSON.stringify({
          name: "Calculator",
          description: "数式を安全に評価するスキル",
          author: "PixelNest256",
          version: "2.0.0",
        }));
      }
      if (url.endsWith("joke/meta.json")) {
        return new Response(JSON.stringify({ name: "Joke", description: "会話を和らげるスキル" }));
      }
      if (url.endsWith("joke/help.txt")) return new Response("ジョークを依頼して実行します。");
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const skills = await fetchUnaiSkills();

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      sourceId: "calc",
      category: "Utility",
      name: "Calculator",
      version: "2.0.0",
      inputs: [{ key: "expression", required: true }],
    });
    expect(skills[1]).toMatchObject({
      sourceId: "joke",
      category: "Conversation",
      helpText: "ジョークを依頼して実行します。",
      steps: ["スキルを選択する", "help.txt の利用手順を確認する", "Unai 環境でリクエストを送る"],
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("raw.githubusercontent.com/PixelNest256/Unai/main/skills/priority.json"), expect.any(Object));
  });
});

describe("getCatalogSkills", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("DBが使えない場合でも、実行可能な全スキルをスキル一覧に含める", async () => {
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const skills = await getCatalogSkills();
      const sourceIds = skills.map(skill => skill.sourceId);
      expect(new Set(sourceIds)).toEqual(new Set(unaiPriority));
      expect(sourceIds.length).toBe(unaiPriority.length);
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });

  it("同梱カタログの各スキルは一覧表示に必要な項目を満たす", async () => {
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const skills = await getCatalogSkills();
      for (const skill of skills) {
        expect(skill.name).toBeTruthy();
        expect(skill.category).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.keywords.length).toBeGreaterThan(0);
        expect(["ready", "setup"]).toContain(skill.status);
        expect(Array.isArray(skill.inputs)).toBe(true);
        expect(Array.isArray(skill.steps)).toBe(true);
      }
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });
});
