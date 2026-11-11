// Reproduce production onboarding (clinician path) + document extraction timings. Throwaway user, deleted after.
import { chromium } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const base = process.argv[2] ?? "https://sukhi-60.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `repro-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = data.user!.id;
const b = await chromium.launch();
try {
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("response", (r) => { if (r.request().method() === "POST") console.log("POST", r.status(), r.url().replace(base, ""), r.request().timing().responseEnd | 0); });
  await page.goto(base + "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/onboarding/, { timeout: 60000 });
  for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Enter my doctor's instructions/).check();
  let t0 = Date.now();
  await page.getByRole("button", { name: "Start using Sukhi" }).click();
  await page.waitForURL(/\/plan/, { timeout: 90000 }).catch(() => console.log("onboarding: no navigation after 90s; url=", page.url()));
  console.log("onboarding finish ->", page.url().replace(base, ""), Date.now() - t0, "ms");
  if (!/\/plan/.test(page.url())) process.exit(0);
  await page.getByLabel("Plan name").fill("Discharge plan");
  await page.getByRole("radio", { name: /Instructions from my doctor/ }).check().catch(() => {});
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 60000 });
  await page.locator("#src-file").setInputFiles("tests/fixtures/sample-instructions.jpg");
  t0 = Date.now();
  await page.locator("form", { has: page.locator("#src-file") }).getByRole("button", { name: "Save" }).click();
  await page.getByText(/Draft items from your document|couldn't read|isn't available|AI processing is off/).first().waitFor({ timeout: 120000 }).catch(() => console.log("extract: no result after 120s"));
  console.log("extract ->", Date.now() - t0, "ms");
  console.log((await page.locator("form", { has: page.locator('input[name="document_id"]') }).innerText().catch(() => "")).slice(0, 900));
} finally {
  await b.close();
  await admin.auth.admin.deleteUser(uid);
  console.log("user deleted");
}
