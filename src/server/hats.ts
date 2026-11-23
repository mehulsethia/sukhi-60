import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { hatsFrom, type Hat } from "@/domain/hats";

/** The roles one account holds right now (see src/domain/hats.ts). */
export async function getHats(admin: AdminClient, userId: string): Promise<Hat[]> {
  const [plan, doctor, follows, profile] = await Promise.all([
    admin.from("plan_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "confirmed"),
    admin.from("doctors").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("family_access").select("id", { count: "exact", head: true }).eq("member_user_id", userId).eq("status", "active"),
    admin.from("profiles").select("primary_role").eq("id", userId).maybeSingle(),
  ]);
  return hatsFrom({ hasPlan: (plan.count ?? 0) > 0, isDoctor: !!doctor.data, follows: follows.count ?? 0, primaryRole: profile.data?.primary_role });
}
