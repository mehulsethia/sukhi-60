"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveDoctorPlan, getDoctor, redeemReward, saveReward, sendDoctorNote, setProofRequired, type RedeemResult } from "@/server/clinic";

// Web clinic actions. Each one checks the signed-in user is a doctor; the shared functions
// then check the patient link belongs to them.
async function doctor() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const doc = await getDoctor(admin, user.id);
  if (!doc) throw new Error("not_a_doctor");
  return { admin, doctorId: user.id };
}

const uuid = z.string().uuid();

export type NoteState = { ok?: boolean; sent?: boolean; error?: string } | null;

export async function clinicNoteAction(_prev: NoteState, fd: FormData): Promise<NoteState> {
  const { admin, doctorId } = await doctor();
  const linkId = uuid.safeParse(fd.get("linkId"));
  const text = z.string().trim().min(1).max(1500).safeParse(fd.get("text"));
  if (!linkId.success || !text.success) return { error: "invalid_input" };
  const r = await sendDoctorNote(admin, doctorId, linkId.data, text.data, fd.get("review") === "1", crypto.randomUUID());
  if (!r) return { error: "not_found" };
  revalidatePath(`/clinic/p/${linkId.data}`);
  return { ok: true, sent: r.sent };
}

export async function clinicApproveAction(linkId: string, planId: string): Promise<{ ok: boolean }> {
  const { admin, doctorId } = await doctor();
  if (!uuid.safeParse(linkId).success || !uuid.safeParse(planId).success) return { ok: false };
  const r = await approveDoctorPlan(admin, doctorId, linkId, planId, "web");
  revalidatePath(`/clinic/p/${linkId}`);
  revalidatePath("/clinic");
  return { ok: !!r };
}

export async function clinicProofAction(linkId: string, itemId: string, on: boolean): Promise<{ ok: boolean }> {
  const { admin, doctorId } = await doctor();
  if (!uuid.safeParse(linkId).success || !uuid.safeParse(itemId).success) return { ok: false };
  const r = await setProofRequired(admin, doctorId, linkId, itemId, on, crypto.randomUUID(), "web");
  revalidatePath(`/clinic/p/${linkId}`);
  return { ok: !!r };
}

export type RewardState = { ok?: boolean; error?: string } | null;

export async function clinicRewardAction(_prev: RewardState, fd: FormData): Promise<RewardState> {
  const { admin, doctorId } = await doctor();
  const raw = z.string().trim().max(160).safeParse(fd.get("reward") ?? "");
  if (!raw.success) return { error: "invalid_input" };
  await saveReward(admin, doctorId, raw.data || null);
  revalidatePath("/clinic");
  return { ok: true };
}

export type RedeemState = (RedeemResult & { at: number }) | null;

export async function clinicRedeemAction(_prev: RedeemState, fd: FormData): Promise<RedeemState> {
  const { admin, doctorId } = await doctor();
  const code = z.string().trim().min(4).max(20).safeParse(fd.get("code"));
  if (!code.success) return { kind: "bad", at: Date.now() };
  return { ...(await redeemReward(admin, doctorId, code.data)), at: Date.now() };
}
