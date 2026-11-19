"use server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { ADMIN_COOKIE, checkAdminPassword, createAdminSession, requireAdmin } from "@/server/admin";
import { createChallenge, newChallengeCode } from "@/server/circle";
import { decideReview, type Decision } from "@/server/review";

export async function adminLogin(_prev: { error?: string } | null, fd: FormData): Promise<{ error?: string } | null> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`sukhi-admin:${ip}`).digest("hex").slice(0, 24);
  const admin = createAdminClient();
  // Lockout: at most 8 failed attempts per IP (or per email) in 15 minutes.
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [{ count: byIp }, { count: byEmail }] = await Promise.all([
    admin.from("audit_events").select("id", { count: "exact", head: true }).eq("action", "admin_login_failed").eq("entity_id", ipHash).gte("created_at", since),
    admin.from("audit_events").select("id", { count: "exact", head: true }).eq("action", "admin_login_failed").contains("details", { email }).gte("created_at", since),
  ]);
  if ((byIp ?? 0) >= 8 || (byEmail ?? 0) >= 8) return { error: "Too many attempts. Try again in 15 minutes." };
  // Same answer for unknown email and wrong password; small delay slows guessing.
  const ok = settings.adminEmails().includes(email) && checkAdminPassword(password);
  if (!ok) {
    await admin.from("audit_events").insert({ actor: "system", action: "admin_login_failed", entity: "admin_session", entity_id: ipHash, details: { email: email.slice(0, 120) } as never });
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Email or password is incorrect." };
  }
  const s = createAdminSession(email);
  (await cookies()).set(ADMIN_COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: s.maxAge });
  redirect("/admin");
}

export async function adminLogout() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin");
}

/** Mark a team/test account as internal so it is excluded from pilot metrics. */
export async function setInternal(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(fd.get("user_id"));
  const internal = fd.get("internal") === "true";
  await createAdminClient().rpc("admin_set_internal", { p_user: id, p_internal: internal });
  revalidatePath("/admin");
}

const ChallengeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prize: z.string().trim().max(120).optional(),
}).refine((v) => v.ends_on >= v.starts_on, { message: "end_before_start" });

export async function createChallengeAction(fd: FormData) {
  const { email } = await requireAdmin();
  const v = ChallengeSchema.safeParse({ name: fd.get("name"), starts_on: fd.get("starts_on"), ends_on: fd.get("ends_on"), prize: fd.get("prize") || undefined });
  if (!v.success) redirect("/admin?challenge=invalid#challenges");
  const admin = createAdminClient();
  const c = await createChallenge(admin, { name: v.data.name, startsOn: v.data.starts_on, endsOn: v.data.ends_on, prize: v.data.prize ?? null });
  await admin.from("audit_events").insert({ actor: "system", action: "challenge_created", entity: "circle", entity_id: c.id, details: { by: email } as never });
  revalidatePath("/admin");
  redirect("/admin?challenge=created#challenges");
}

export async function newChallengeCodeAction(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(fd.get("circle_id"));
  await newChallengeCode(createAdminClient(), id);
  revalidatePath("/admin");
  redirect("/admin#challenges");
}

/** Removes a challenge, its members and its feed (test runs, mistakes). Points stay with each person. */
export async function deleteChallengeAction(fd: FormData) {
  const { email } = await requireAdmin();
  const id = z.string().uuid().parse(fd.get("circle_id"));
  const admin = createAdminClient();
  await admin.from("circles").delete().eq("id", id).eq("kind", "challenge");
  await admin.from("audit_events").insert({ actor: "system", action: "challenge_deleted", entity: "circle", entity_id: id, details: { by: email } as never });
  revalidatePath("/admin");
  redirect("/admin#challenges");
}

/** A reviewer's decision on a proof photo, appeal or audit. Final, logged, told to the person. */
export async function decideReviewAction(fd: FormData) {
  const { email } = await requireAdmin();
  const id = z.string().uuid().parse(fd.get("id"));
  const decision = z.enum(["verified", "rejected", "more_photo", "dismissed"]).parse(fd.get("decision")) as Decision;
  const note = String(fd.get("note") ?? "").slice(0, 500) || null;
  await decideReview(createAdminClient(), email, id, decision, note);
  revalidatePath("/admin/reviews");
  redirect("/admin/reviews?done=1");
}
