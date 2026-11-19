import { describe, expect, it } from "vitest";
import { FAMILY_LIMIT, FAMILY_SCOPES, familySeats } from "@/domain/family";

describe("family seats", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const future = "2026-11-25T00:00:00Z", past = "2026-11-10T00:00:00Z";
  it("counts active members and live invites, not revoked or expired ones", () => {
    expect(familySeats([{ status: "active", expires_at: past }, { status: "invited", expires_at: future }, { status: "invited", expires_at: past }, { status: "revoked", expires_at: future }], now)).toBe(2);
  });
  it("limit is 2 and family sees everything", () => {
    expect(FAMILY_LIMIT).toBe(2);
    expect([...FAMILY_SCOPES].sort()).toEqual(["alerts", "garden", "weekly_summary"]);
  });
});
