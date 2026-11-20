import { describe, expect, it } from "vitest";
import { parseRoutingMode, shouldAutoCommit } from "./experienceSettings";

describe("experience settings", () => {
  it("defaults missing or invalid stored settings to auto routing", () => {
    expect(parseRoutingMode(null)).toBe("auto");
    expect(parseRoutingMode("unknown")).toBe("auto");
    expect(parseRoutingMode("manual")).toBe("manual");
  });

  it("auto-commits the highest-priority candidate only in auto mode", () => {
    expect(shouldAutoCommit("auto", 3)).toBe(true);
    expect(shouldAutoCommit("manual", 3)).toBe(false);
    expect(shouldAutoCommit("manual", 1)).toBe(true);
    expect(shouldAutoCommit("auto", 0)).toBe(false);
  });
});
