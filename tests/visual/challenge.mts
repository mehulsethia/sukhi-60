// Visual + flow check: an operator creates a challenge in /admin, a tester joins with the code.
// Run against the LOCAL stack with ADMIN_EMAILS=ops@example.test ADMIN_PASSWORD=<pw> set for
// both this script and the dev server. Not part of CI.
import { chromium, devices } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.test.local", quiet: true });
const out = process.argv[2];
const base = "http://localhost:3200";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `screens-tester-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = data.user!.id;
await admin.from("profiles").update({ display_name: "Mehul", timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString() }).eq("id", uid);
const browser = await chromium.launch();
let challengeId: string | null = null;
try {
  const ops = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await ops.goto(base + "/admin", { waitUntil: "networkidle" });
  await ops.locator("input[type=email]").fill(process.env.ADMIN_EMAILS!);
  await ops.locator("input[type=password]").fill(process.env.ADMIN_PASSWORD!);
  await ops.getByRole("button", { name: "Sign in" }).click();
  await ops.waitForSelector("input[name=prize]", { timeout: 60000 });
  await ops.waitForLoadState("networkidle");
  const ends = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await ops.locator("input[name=name]").fill("Pilot challenge");
  await ops.locator("input[name=ends_on]").fill(ends);
  await ops.locator("input[name=prize]").fill("₹500 Amazon voucher");
  await ops.getByRole("button", { name: "Create", exact: true }).click();
  await ops.waitForURL(/challenge=created/);
  const card = ops.locator("#challenges + *");
  const code = (await ops.locator("li .font-mono").first().textContent())!.trim();
  console.log("code", code);
  const { data: c } = await admin.from("circles").select("id").eq("invite_code", code).single();
  challengeId = c!.id;
  await card.screenshot({ path: `${out}/admin-challenges.png` });

  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base + "/login", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill(email);
  await p.locator("#password").fill(password);
  await p.locator("form button[type=submit]").first().click();
  await p.waitForURL(/today|plan|chat/, { timeout: 30000 });
  await p.goto(base + "/circle", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Join with a code" }).click();
  await p.getByLabel("Join with a code").fill(code);
  await p.getByRole("button", { name: "Join", exact: true }).click();
  await p.waitForURL(/r=joined/);
  await p.screenshot({ path: `${out}/tester-challenge.png`, fullPage: true });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(uid);
  if (challengeId) await admin.from("circles").delete().eq("id", challengeId);
}
