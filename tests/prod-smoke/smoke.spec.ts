// LIVE smoke test (production). Creates two throwaway users via the admin API, exercises the
// real deployment, then deletes the users and their stored files. Run: pnpm smoke:prod
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(__dirname, "../../.env.local"), quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const tag = `smoke-${Date.now()}`;
const users: { id: string; email: string; password: string }[] = [];

async function makeUser(label: string) {
  const email = `${tag}-${label}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push({ id: data.user.id, email, password });
  return users.at(-1)!;
}

test.afterAll(async () => {
  for (const u of users) {
    for (const bucket of ["evidence", "plan-sources"]) {
      const { data: top } = await admin.storage.from(bucket).list(u.id, { limit: 100 });
      const paths: string[] = [];
      for (const f of top ?? []) {
        if (f.id) paths.push(`${u.id}/${f.name}`);
        else (await admin.storage.from(bucket).list(`${u.id}/${f.name}`)).data?.forEach((g) => paths.push(`${u.id}/${f.name}/${g.name}`));
      }
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    }
    await admin.auth.admin.deleteUser(u.id); // cascades to all patient rows
  }
});

const ist = (minAgo: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() - minAgo * 60_000));

test("public surface and machine endpoints", async ({ page, request }) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.post("/api/worker/tick")).status()).toBe(401);
  expect((await request.post("/api/chat", { data: { text: "hi" } })).status()).toBe(401);
  expect((await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status()).toBe(403);
  await page.goto("/");
  await expect(page.getByText("A gentle companion")).toBeVisible();
  await page.goto("/demo");
  await expect(page.getByText(/Fictional demo/)).toBeVisible();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  for (const p of ["/manifest.webmanifest", "/icons/192", "/sw.js"]) expect((await request.get(p)).status(), p).toBe(200);
});

test("full patient journey on production", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const a = await makeUser("a");

  await page.goto("/login");
  await page.getByLabel("Email").fill(a.email);
  await page.getByLabel("Password").fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("What should we call you?").fill("Smoke Test");
  await page.getByLabel("Time zone").selectOption("Asia/Kolkata");
  await page.locator("#quiet_start").fill("03:00");
  await page.locator("#quiet_end").fill("03:01");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/connect WhatsApp later/).check();
  await page.getByLabel(/invite a family member/).check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("I'll set up my plan myself").check();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/today/);

  await page.goto("/plan");
  await page.getByLabel("Plan name").fill("Smoke walking goal");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: "Smoke walking goal" })).toBeVisible();
  const add = page.locator("section", { has: page.getByRole("heading", { name: "Add an action" }) });
  await add.getByLabel("Action", { exact: true }).fill("Short walk");
  await add.getByLabel("Times").fill(ist(10));
  await add.getByRole("button", { name: "Confirm & schedule" }).click();
  await expect(page.getByText("Confirmed · Version 1")).toBeVisible();

  // Document extraction without an AI key must degrade honestly.
  await page.locator("#src-file").setInputFiles(path.resolve(__dirname, "../fixtures/tiny.png"));
  await page.locator("form", { has: page.locator("#src-file") }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Automatic reading isn't available/)).toBeVisible({ timeout: 20_000 });

  // Reminder via the real secured worker endpoint.
  const tick = await request.post("/api/worker/tick", { headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } });
  expect(tick.status()).toBe(200);
  await page.goto("/today");
  await expect(page.getByText(/Time for: Short walk/)).toBeVisible();
  await expect(page.getByText("Waiting for your reply")).toBeVisible();

  // Evidence + assessment (AI unconfigured -> saved, not "verified").
  await page.getByRole("link", { name: "Add photo or note" }).click();
  await page.getByLabel("Take or choose a photo").setInputFiles(path.resolve(__dirname, "../fixtures/tiny.png"));
  await page.getByLabel("Also mark this as done").check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Couldn't assess clearly" })).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByText("Done (your report)").first()).toBeVisible();

  await page.goto("/progress");
  await expect(page.getByText("First step").first()).toBeVisible();

  // Assistant: deterministic quick reply + safety escalation work without an AI key.
  await page.goto("/chat");
  await page.getByLabel("Type a message…").fill("I have chest pain");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/call your local emergency number/)).toBeVisible({ timeout: 20_000 });

  // Settings: services reported honestly; family invite link created.
  await page.goto("/settings");
  await expect(page.getByText("WhatsApp isn't configured for this Sukhi installation yet.", { exact: false })).toBeVisible();
  await page.getByLabel("Who is this for?").fill("Smoke relative");
  await page.getByRole("button", { name: "Create invitation link" }).click();
  await expect(page.getByTestId("family-link")).toContainText("https://sukhi-60.vercel.app/family/accept?token=");

  // Cross-user isolation on the real project.
  const b = await makeUser("b");
  const bClient = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await bClient.auth.signInWithPassword({ email: b.email, password: b.password });
  for (const t of ["care_plans", "plan_items", "action_occurrences", "messages", "evidence"] as const) {
    const { data } = await bClient.from(t).select("id").eq("user_id", a.id);
    expect(data, t).toEqual([]);
  }
  const { data: files } = await bClient.storage.from("evidence").list(a.id);
  expect(files ?? []).toEqual([]);

  expect(errors, "browser errors").toEqual([]);
});
