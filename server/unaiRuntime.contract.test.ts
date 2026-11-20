import { describe, expect, it, vi } from "vitest";
import { processUnaiInput } from "./unaiRuntime";

describe("external skill routing contract", () => {
  it("records the same selected skill and explicit request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Heading: "TypeScript",
          AbstractText: "TypeScript is a programming language.",
        }),
      })
    );

    const result = await processUnaiInput("TypeScriptについて調べたい");

    expect(result.matchedSkillIds).toEqual([result.skill]);
    expect(result.skill).toBe("ddgs");
    expect(result.execution).toBe("external");
    expect(result.selectionReason).toContain("ddgs");
  });

  it("does not return an unrelated external response without an external request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "Penzance",
          extract: "A pirate-themed article.",
        }),
      })
    );

    const result = await processUnaiInput("こんにちは");

    expect(result.execution).toBe("local");
    expect(["greeting"]).toContain(result.skill);
    expect(result.response).not.toContain("Wikipedia検索:");
  });
});
