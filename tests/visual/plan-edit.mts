// Visual + flow check for editing a plan item (time pickers, confirm keeps it confirmed). Not part of CI.
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
  await admin.from("profiles").update({ display_name: "Asha", timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString() }).eq("id", uid);
  await admin.from("consents").insert(["ai_processing", "reminders"].map((kind) => ({ user_id: uid, kind, granted: true, granted_at: new Date().toISOString() })));
  const { data: plan } = await admin.from("care_plans").insert({ user_id: uid, title: "Doctor's plan", mode: "clinician_instructions", status: "active" }).select("id").single();
  const { data: item } = await admin.from("plan_items").insert({ plan_id: plan!.id, user_id: uid, title: "Metformin 500", category: "medication", schedule_kind: "daily", times: ["09:00"], status: "confirmed", evidence_hint: "none" }).select("id").single();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(/today|plan|chat/, { timeout: 30000 });
  await page.goto(`${base}/plan/${plan!.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^edit$/i }).first().click();
  const form = page.locator("form").filter({ has: page.locator('input[name="item_id"]') }).filter({ has: page.locator('input[name="title"]') });
  await form.getByRole("button", { name: /add a time/i }).click();
  await form.getByLabel("Times 2").fill("20:30");
  await form.getByLabel("Times", { exact: true }).fill("14:00");
  await form.getByLabel("Times", { exact: true }).press("Enter"); // must NOT submit as draft
  await page.waitForTimeout(800);
  await form.screenshot({ path: `${out}/edit-form.png` });
  const afterEnter = await admin.from("plan_items").select("status, times").eq("id", item!.id).single();
  console.log("after Enter:", afterEnter.data);
  await form.getByRole("button", { name: /confirm & schedule/i }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/after-confirm.png`, fullPage: true });
  const after = await admin.from("plan_items").select("status, times").eq("id", item!.id).single();
  console.log("after confirm:", after.data);
  await browser.close();
} finally {
  await admin.auth.admin.deleteUser(uid);
}
