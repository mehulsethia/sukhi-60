import { describe, expect, it, vi } from "vitest";
import { applyCheckIn, ProofRequiredError, proofNeededFor } from "@/server/core";
import { reply, rewardLine } from "@/domain/replies";
import { w, d } from "@/domain/wa-copy";
import type { AdminClient } from "@/lib/supabase/admin";

function fakeAdmin(item: { proof_required: boolean; proof_required_by: string | null } | null, doctorName = "Dr. Asha Rao") {
  const rpc = vi.fn(async () => ({ data: { status: "self_reported", result: "recorded", rewards: [], duplicate: false }, error: null }));
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data });
    return c;
  };
  const admin = {
    rpc,
    from: (t: string) => (t === "doctors" ? chain({ name: doctorName }) : chain(item ? { plan_items: item } : null)),
  } as unknown as AdminClient;
  return { admin, rpc };
}

describe("doctor's proof needed", () => {
  it("blocks a plain Done and names the doctor", async () => {
    const { admin, rpc } = fakeAdmin({ proof_required: true, proof_required_by: "doc-1" });
    const err = await applyCheckIn(admin, "u", "occ", "done", { channel: "whatsapp", idempotencyKey: "k-123456" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProofRequiredError);
    expect((err as ProofRequiredError).doctor).toBe("Dr. Asha Rao");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("still allows Later and Skip on those tasks", async () => {
    const { admin, rpc } = fakeAdmin({ proof_required: true, proof_required_by: "doc-1" });
    await applyCheckIn(admin, "u", "occ", "skipped", { channel: "whatsapp", idempotencyKey: "k-123456" });
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("lets Done through when no photo is needed", async () => {
    const { admin, rpc } = fakeAdmin({ proof_required: false, proof_required_by: null });
    expect(await proofNeededFor(admin, "occ")).toBeNull();
    await applyCheckIn(admin, "u", "occ", "done", { channel: "whatsapp", idempotencyKey: "k-123456" });
    expect(rpc).toHaveBeenCalledOnce();
  });
});

describe("done reply copy", () => {
  it("is short in every language, with plain points", () => {
    expect(reply("en", "recorded_done", { title: "Fruit or salad" })).toBe("“Fruit or salad” done ✓");
    expect(reply("hi", "recorded_done", { title: "सैर" })).toBe("“सैर” हो गया ✓");
    expect(reply("mr", "recorded_done", { title: "चालणं" })).toBe("“चालणं” झालं ✓");
    expect(rewardLine("en", [{ points: 2, label: "Honest check-in" }, { points: 1, label: "Action done" }])).toBe("+3 points");
  });
  it("has proof copy for patients and doctors", () => {
    expect(w("en", "proof_needed", { doctor: "Dr. Rao" })).toBe("Dr. Rao asked for a photo for this one.");
    expect(w("mr", "proof_required_on", { doctor: "Dr. Rao", title: "Metformin" })).toContain("Metformin");
    expect(d("proof_on_set", { name: "Asha", title: "Metformin" })).toContain("Asha");
  });
});
