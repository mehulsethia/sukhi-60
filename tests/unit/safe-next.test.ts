import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps in-app paths with their query", () => {
    expect(safeNext("/family/accept?token=abc", "/today")).toBe("/family/accept?token=abc");
    expect(safeNext("/clinic")).toBe("/clinic");
  });
  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/\tevil", "/%0a", ""]) {
      expect(safeNext(bad, "/today"), bad).toBe(bad === "/%0a" ? "/%0a" : "/today");
    }
    expect(safeNext(null)).toBeUndefined();
  });
});
