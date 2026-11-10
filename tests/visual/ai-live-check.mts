// Live AI check against production (throwaway user, deleted afterwards). Manual use only.
import { chromium } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const base = "https://sukhi-60.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `aicheck-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = data.user!.id;
try {
  await admin.from("profiles").update({ display_name: "Asha", timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString(), quiet_start: "03:00", quiet_end: "03:01" }).eq("id", uid);
  await admin.from("consents").insert(["ai_processing", "reminders"].map((kind) => ({ user_id: uid, kind, granted: true, granted_at: new Date().toISOString() })));
  const hh = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() - 10 * 60000));
  const { data: plan } = await admin.from("care_plans").insert({ user_id: uid, title: "Walking goal", mode: "personal_goal", status: "active" }).select("id").single();
  await admin.from("plan_items").insert({ plan_id: plan!.id, user_id: uid, title: "Evening walk", instructions: "20 minutes", category: "activity", schedule_kind: "daily", times: [hh], status: "confirmed" });
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await page.goto(base + "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/today/, { timeout: 60000 });
  for (const text of ["What's on my plan today?", "मैंने आज 20 मिनट टहल लिया", "Should I double my tablet if I missed it?"]) {
    const t0 = Date.now();
    const r = await page.request.post(base + "/api/chat", { data: { text } });
    const j = await r.json();
    console.log(`\n> ${text}\n  [${r.status()} route=${j.route} ${Date.now() - t0}ms] ${String(j.text).slice(0, 260)}\n  sources: ${(j.sources ?? []).map((s: { label: string }) => s.label).join(", ")}`);
  }
  const { data: occ } = await admin.from("action_occurrences").select("status").eq("user_id", uid);
  const { data: runs } = await admin.from("agent_runs").select("route, outcome, model_id, latency_ms, error_code").eq("user_id", uid).order("created_at");
  console.log("\noccurrence statuses:", occ?.map((o) => o.status).join(","));
  console.log("agent runs:", JSON.stringify(runs));
  await b.close();
} finally {
  await admin.auth.admin.deleteUser(uid);
  console.log("test user deleted");
}
