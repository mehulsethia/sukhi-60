import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export const admin = () => createAdminClient();

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
}

/** Create a real auth user and a session-bound (RLS-enforced) client for it. */
export async function makeUser(label: string, opts: { tz?: string; consents?: Partial<Record<string, boolean>> } = {}): Promise<TestUser> {
  const a = admin();
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  await a.from("profiles").update({ timezone: opts.tz ?? "Asia/Kolkata", onboarded_at: new Date().toISOString(), quiet_start: "23:59", quiet_end: "23:59" }).eq("id", data.user.id);
  const consents = { ai_processing: true, reminders: true, whatsapp: true, voice_processing: false, family_sharing: true, ...opts.consents };
  await a.from("consents").insert(Object.entries(consents).map(([kind, granted]) => ({ user_id: data.user!.id, kind: kind as never, granted: !!granted, granted_at: new Date().toISOString() })));
  return { id: data.user.id, email, client };
}

export const anonClient = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });

/** A personal plan with one confirmed daily item whose occurrence is due now. */
export async function planWithDueItem(u: TestUser, opts: { mode?: "personal_goal" | "clinician_instructions"; category?: string; schedule?: "daily" | "weekly_target"; target?: number } = {}) {
  const { data: plan, error } = await u.client.from("care_plans").insert({ user_id: u.id, title: "Test plan", mode: opts.mode ?? "personal_goal", status: "active" }).select("id").single();
  if (error) throw error;
  const now = new Date();
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now.getTime() - 10 * 60_000));
  const { data: item, error: e2 } = await u.client
    .from("plan_items")
    .insert({
      plan_id: plan!.id,
      user_id: u.id,
      title: "Evening walk",
      category: (opts.category ?? "activity") as never,
      schedule_kind: opts.schedule ?? "daily",
      times: opts.schedule === "weekly_target" ? [] : [hhmm],
      weekly_target: opts.schedule === "weekly_target" ? (opts.target ?? 3) : null,
      window_minutes: 180,
      status: "confirmed",
    })
    .select("*")
    .single();
  if (e2) throw e2;
  return { planId: plan!.id, item: item! };
}
