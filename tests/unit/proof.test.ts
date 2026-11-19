import { describe, expect, it } from "vitest";
import { auditRate, challengeForModel, dhashFromPixels, flagsFor, hamming, newChallenge, proofBreakdown, proofLevelFor, REUSE_DISTANCE } from "@/domain/proof";

describe("perceptual hash", () => {
  const img = Array.from({ length: 72 }, (_, i) => (i * 37) % 255);
  it("is stable and 16 hex chars", () => {
    expect(dhashFromPixels(img)).toMatch(/^[0-9a-f]{16}$/);
    expect(dhashFromPixels(img)).toBe(dhashFromPixels([...img]));
  });
  it("barely changes when the picture is brightened or slightly noisy", () => {
    const brighter = img.map((v) => Math.min(255, v + 10));
    const noisy = img.map((v, i) => (i % 17 === 0 ? v + 3 : v));
    expect(hamming(dhashFromPixels(img), dhashFromPixels(brighter))).toBeLessThanOrEqual(REUSE_DISTANCE);
    expect(hamming(dhashFromPixels(img), dhashFromPixels(noisy))).toBeLessThanOrEqual(REUSE_DISTANCE);
  });
  it("differs a lot for a different picture", () => {
    const other = Array.from({ length: 72 }, (_, i) => (i * 101 + 50) % 255);
    expect(hamming(dhashFromPixels(img), dhashFromPixels(other))).toBeGreaterThan(REUSE_DISTANCE);
  });
  it("counts bits", () => {
    expect(hamming("0000000000000000", "0000000000000003")).toBe(2);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hamming("bad", "0000000000000000")).toBe(64);
  });
});

describe("challenges", () => {
  it("makes fingers 1-5 or a two-character code", () => {
    for (let i = 0; i < 50; i++) {
      const c = newChallenge();
      if (c.kind === "fingers") expect(["1", "2", "3", "4", "5"]).toContain(c.value);
      else expect(c.value).toMatch(/^[A-Z0-9]{2}$/);
    }
    expect(challengeForModel({ kind: "fingers", value: "1" })).toContain("1 raised finger");
    expect(challengeForModel({ kind: "code", value: "K7" })).toContain('"K7"');
  });
});

describe("flags and proof levels", () => {
  const base = { kind: "photo" as const, category: "medication", outcome: "partially_supports" as const };
  it("a fresh matched pill photo is photo_fresh", () => {
    const f = { ...base, challengeIssued: true, challengeMet: true, labelMatch: "yes" as const };
    expect(flagsFor(f)).toEqual([]);
    expect(proofLevelFor(f, [])).toBe("photo_fresh");
  });
  it("no challenge asked: photo_ai", () => expect(proofLevelFor(base, [])).toBe("photo_ai"));
  it("reused, shared, old, screen, wrong label and missed challenge are hard flags", () => {
    const f = { ...base, reusedOwn: true, reusedOther: true, takenHoursAgo: 72, screenOrEdited: true, labelMatch: "no" as const, challengeIssued: true, challengeMet: false };
    const flags = flagsFor(f);
    expect(flags).toEqual(["reused_photo", "shared_photo", "old_photo", "screen_photo", "label_mismatch", "challenge_missed"]);
    expect(proofLevelFor(f, flags)).toBe("flagged");
  });
  it("a similar (not identical) photo is a soft flag: still counts, goes to a reviewer", () => {
    const f = { ...base, similarOwn: true };
    expect(flagsFor(f)).toEqual(["similar_photo"]);
    expect(proofLevelFor(f, flagsFor(f))).toBe("photo_ai");
  });
  it("label mismatch only matters for medicines; blister count going down is soft", () => {
    expect(flagsFor({ ...base, category: "nutrition", labelMatch: "no" })).toEqual([]);
    const f = { ...base, blisterEmpty: 3, previousBlisterEmpty: 5 };
    expect(flagsFor(f)).toEqual(["blister_count_down"]);
    expect(proofLevelFor(f, flagsFor(f))).toBe("photo_ai");
  });
  it("video showing the act is video_action; an unrelated photo has no level", () => {
    expect(proofLevelFor({ ...base, kind: "video", outcome: "supports", actionObserved: true }, [])).toBe("video_action");
    expect(proofLevelFor({ ...base, outcome: "does_not_support" }, [])).toBeNull();
  });
  it("breakdown counts done tasks by proof", () => {
    const b = proofBreakdown([
      { status: "self_reported", proof_level: null },
      { status: "evidence_supported", proof_level: "photo_ai" },
      { status: "evidence_supported", proof_level: "photo_fresh" },
      { status: "evidence_supported", proof_level: "human_verified" },
      { status: "needs_review", proof_level: "flagged" },
      { status: "no_response", proof_level: null },
    ]);
    expect(b).toEqual({ done: 4, photo: 3, fresh: 2, human: 1, flagged: 1 });
  });
  it("audit rate defaults to 7%", () => {
    expect(auditRate(undefined)).toBe(0.07);
    expect(auditRate("0.2")).toBe(0.2);
    expect(auditRate("5")).toBe(0.07);
  });
});
