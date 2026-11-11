"use server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { ADMIN_COOKIE, checkAdminPassword, createAdminSession, requireAdmin } from "@/server/admin";

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
