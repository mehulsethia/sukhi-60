// Visual review helper: screenshots key screens. Not part of CI.
import { chromium, devices } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const out = process.argv[2];
const base = "http://localhost:3200";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `screens-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = data.user!.id;
try {
  await admin.from("profiles").update({ display_name: "Asha Kulkarni", timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString(), quiet_start: "03:00", quiet_end: "03:01" }).eq("id", uid);
  await admin.from("consents").insert(["ai_processing", "reminders", "family_sharing"].map((kind) => ({ user_id: uid, kind, granted: true, granted_at: new Date().toISOString() })));
  const hh = (m: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + m * 60000));
  const { data: plan } = await admin.from("care_plans").insert({ user_id: uid, title: "My walking goal", mode: "personal_goal", status: "active" }).select("id").single();
  const ins = await admin.from("plan_items").insert([
    { plan_id: plan!.id, user_id: uid, evidence_hint: "none", title: "Morning water", instructions: "One glass of water", category: "nutrition", schedule_kind: "daily", times: [hh(-90)], status: "confirmed" },
    { plan_id: plan!.id, user_id: uid, title: "Evening walk", instructions: "20 minutes, at your own pace", category: "activity", schedule_kind: "daily", times: [hh(-15)], status: "confirmed", evidence_hint: "any" },
    { plan_id: plan!.id, user_id: uid, title: "Light stretches", instructions: null, evidence_hint: "none", category: "activity", schedule_kind: "weekly_target", times: [], weekly_target: 3, status: "confirmed" },
  ]);
  if (ins.error) console.log("seed error:", ins.error.message);
  const browser = await chromium.launch();
  for (const [name, dev] of [["desktop", { viewport: { width: 1360, height: 900 } }], ["mobile", devices["Pixel 7"]]] as const) {
    const ctx = await browser.newContext(dev);
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}-landing.png`, fullPage: true });
    await page.goto(base + "/signup", { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}-signup.png` });
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/today/, { timeout: 30000 });
    // complete one action for a realistic state
    if (name === "desktop") { const b = page.getByRole("button", { name: /I did it/ }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(2500); await page.reload(); } }
    await page.screenshot({ path: `${out}/${name}-today.png`, fullPage: true });
    for (const p of ["progress", "plan", "chat"]) { await page.goto(`${base}/${p}`, { waitUntil: "networkidle" }); await page.screenshot({ path: `${out}/${name}-${p}.png`, fullPage: name === "desktop" }); }
    await ctx.close();
  }
  await browser.close();
} finally {
  await admin.auth.admin.deleteUser(uid);
  console.log("done; test user deleted");
}
