// Measures the onboarding "finish" server action on production N times (throwaway users, deleted after).
import { chromium } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const base = "https://sukhi-60.vercel.app";
const runs = Number(process.argv[2] ?? 5);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const b = await chromium.launch();
for (let r = 0; r < runs; r++) {
  const email = `lat-${Date.now()}-${r}@example.test`, password = "pw-" + crypto.randomUUID();
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  try {
    const page = await (await b.newContext()).newPage();
    await page.goto(base + "/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/onboarding/, { timeout: 60000 });
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: /keep up with a plan I already have/ }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("I'll set up my plan myself").check();
    const t0 = Date.now();
    const resp = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/onboarding"), { timeout: 60000 }).then((res) => `${res.status()} ${res.headers()["x-vercel-id"] ?? ""}`).catch(() => "NO RESPONSE in 60s");
    await page.getByRole("button", { name: "Start using Sukhi" }).click();
    console.log(`run ${r + 1}: ${await resp} after ${Date.now() - t0}ms; url=${page.url().replace(base, "")}`);
  } finally {
    await admin.auth.admin.deleteUser(data.user!.id);
  }
}
await b.close();
