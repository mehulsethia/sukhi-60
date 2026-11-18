// Visual check: the "How points work" explainer on Circle, at phone width. Uses .env.local with a
// throwaway user that is deleted at the end. Not part of CI.
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
const browser = await chromium.launch();
try {
  await admin.from("profiles").update({ display_name: "Asha", timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString() }).eq("id", uid);
  const p = await (await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(base + "/login", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill(email);
  await p.locator("#password").fill(password);
  await p.locator("form button[type=submit]").first().click();
  await p.waitForURL(/today|plan|chat/, { timeout: 30000 });
  await p.goto(base + "/circle", { waitUntil: "networkidle" });
  await p.getByText("How points work").click();
  await p.waitForTimeout(300);
  await p.locator("#board").locator("xpath=ancestor::section").screenshot({ path: `${out}/explainer.png` });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(uid);
  const { data: left } = await admin.from("circles").select("id").eq("owner_id", uid);
  for (const c of left ?? []) await admin.from("circles").delete().eq("id", c.id);
}
