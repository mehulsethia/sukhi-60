// Fictional demo account for LOCAL development only (refuses non-local Supabase URLs).
// Creates demo@sukhi.example with a fictional personal routine. Never use real health data.
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error("Refusing to seed: only allowed against the local Supabase stack.");
  process.exit(1);
}
const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = "demo@sukhi.example";
const password = "sukhi-demo-password";
const existing = (await db.auth.admin.listUsers()).data.users.find((u) => u.email === email);
const user = existing ?? (await db.auth.admin.createUser({ email, password, email_confirm: true })).data.user!;
await db.from("profiles").update({ display_name: "Asha (fictional)", timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString() }).eq("id", user.id);
for (const kind of ["ai_processing", "reminders", "voice_processing", "whatsapp", "family_sharing"]) {
  await db.from("consents").upsert({ user_id: user.id, kind, granted: true, granted_at: new Date().toISOString() }, { onConflict: "user_id,kind" });
}
const { data: plans } = await db.from("care_plans").select("id").eq("user_id", user.id);
if (!plans?.length) {
  const { data: plan } = await db.from("care_plans").insert({ user_id: user.id, title: "Fictional demo routine", mode: "personal_goal", status: "active", source_description: "Fictional demo data" }).select("id").single();
  await db.from("plan_items").insert([
    { plan_id: plan!.id, user_id: user.id, title: "Evening walk", instructions: "Comfortable pace", category: "activity", schedule_kind: "daily", times: ["18:00"], status: "confirmed", provenance: "template", evidence_hint: "any" },
    { plan_id: plan!.id, user_id: user.id, title: "Light stretches", category: "activity", schedule_kind: "weekly_target", weekly_target: 3, status: "confirmed", provenance: "template" },
  ]);
}
console.log(`Demo user ready: ${email} / ${password} (local only)`);
