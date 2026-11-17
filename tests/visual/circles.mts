// Visual + flow check for several circles and 5-digit codes. Run against the LOCAL stack:
// ENV_FILE=.env.test.local npx tsx tests/visual/circles.mts <outdir>. Not part of CI.
import { chromium, devices } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: process.env.ENV_FILE ?? ".env.test.local", quiet: true });
const out = process.argv[2];
const base = "http://localhost:3200";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
async function user(name: string) {
  const email = `screens-${name}-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("profiles").update({ display_name: name, timezone: "Asia/Kolkata", onboarded_at: new Date().toISOString() }).eq("id", data.user!.id);
  return { id: data.user!.id, email, password };
}
const me = await user("Mehul"), friend = await user("Priya");
const browser = await chromium.launch();
async function login(u: { email: string; password: string }) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/today|plan|chat|onboarding/, { timeout: 30000 });
  return page;
}
try {
  const p = await login(me);
  await p.goto(base + "/circle", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "New circle" }).click();
  await p.getByLabel("New circle").fill("Family");
  await p.getByRole("button", { name: "Create" }).click();
  await p.waitForURL(/r=created/);
  const code = (await p.locator("#code + p").textContent())!.trim();
  console.log("code", code);
  await p.screenshot({ path: `${out}/owner.png`, fullPage: true });
  const f = await login(friend);
  await f.goto(base + "/circle", { waitUntil: "networkidle" });
  await f.getByRole("button", { name: "Join with a code" }).click();
  await f.getByLabel("Join with a code").fill(code);
  await f.screenshot({ path: `${out}/join-form.png` });
  await f.getByRole("button", { name: "Join", exact: true }).click();
  await f.waitForURL(/r=/);
  console.log("friend url", f.url());
  await f.screenshot({ path: `${out}/friend-joined.png`, fullPage: true });
  await p.goto(base + "/circle", { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}/owner-two-circles.png`, fullPage: true });
} finally {
  await browser.close();
  for (const u of [me, friend]) await admin.auth.admin.deleteUser(u.id);
}
