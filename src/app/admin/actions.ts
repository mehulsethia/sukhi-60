"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { settings } from "@/lib/config";
import { ADMIN_COOKIE, checkAdminPassword, createAdminSession, requireAdmin } from "@/server/admin";

export async function adminLogin(_prev: { error?: string } | null, fd: FormData): Promise<{ error?: string } | null> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  // Same answer for unknown email and wrong password; small delay slows guessing.
  const ok = settings.adminEmails().includes(email) && checkAdminPassword(password);
  if (!ok) {
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
