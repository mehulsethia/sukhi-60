// Visual + flow check: a Marathi user adds a ready-made pack from My plan. Not part of CI.
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
  await admin.from("profiles").update({ display_name: "Aai", timezone: "Asia/Kolkata", locale: "mr", onboarded_at: new Date().toISOString() }).eq("id", uid);
  await admin.from("consents").insert(["ai_processing", "reminders"].map((kind) => ({ user_id: uid, kind, granted: true, granted_at: new Date().toISOString() })));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "sukhi_locale", value: "mr", url: base }]);
  const page = await ctx.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/today|plan|chat/, { timeout: 30000 });
  await page.goto(`${base}/plan`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/mr-plan-packs.png`, fullPage: true });
  await page.getByRole("button", { name: /चमकदार त्वचा/ }).click();
  await page.waitForTimeout(5000);
  const { data: plans } = await admin.from("care_plans").select("title, plan_items(title, instructions)").eq("user_id", uid);
  const { data: prof } = await admin.from("profiles").select("personal_motivation").eq("id", uid).single();
  console.log(JSON.stringify({ plans, motivation: prof?.personal_motivation }, null, 1));
  await page.goto(`${base}/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/mr-today.png`, fullPage: true });
  await browser.close();
} finally {
  await admin.auth.admin.deleteUser(uid);
}
