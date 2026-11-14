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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Stay with the plan");
  for (const p of ["/signup", "/forgot-password", "/privacy", "/terms"]) expect((await request.get(p)).status(), p).toBe(200);
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
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByPlaceholder("Your name").fill("Smoke Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Start using Sukhi" }).click();
  await expect(page).toHaveURL(/\/today/);
  // Reminders must fire at any hour: shrink quiet hours to one minute.
  await admin.from("profiles").update({ timezone: "Asia/Kolkata", quiet_start: "03:00", quiet_end: "03:01" }).eq("id", a.id);

  await page.goto("/plan");
  await page.getByText("Build it myself").click();
  await page.getByLabel("Plan name").fill("Smoke walking goal");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: "Smoke walking goal" })).toBeVisible();
  const add = page.locator("section", { has: page.getByRole("heading", { name: "Add an action" }) });
  await add.getByLabel("Action", { exact: true }).fill("Short walk");
  await add.getByLabel("Times").fill(ist(10));
  await add.getByRole("button", { name: "Confirm & schedule" }).click();
  // Saved and confirmed: the item row now offers "Pause".
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  // Document extraction must degrade honestly (AI off: "unavailable"; AI on + blank image: "couldn't read").
  await page.locator("#src-file").setInputFiles(path.resolve(__dirname, "../fixtures/tiny.png"));
  await page.locator("form", { has: page.locator("#src-file") }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Automatic reading isn't available|We couldn't read this document/)).toBeVisible({ timeout: 45_000 });

  // Reminder via the real secured worker endpoint.
  const tick = await request.post("/api/worker/tick", { headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } });
  expect(tick.status()).toBe(200);
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Short walk" })).toBeVisible();
  await expect(page.getByText("Waiting for your reply")).toBeVisible();

  // Evidence + assessment: never shown as verified; a blank photo can't support the action.
  await page.getByRole("button", { name: "More options" }).first().click();
  await page.getByRole("link", { name: "Proof" }).first().click();
  await page.getByLabel("Take or choose a photo").setInputFiles(path.resolve(__dirname, "../fixtures/tiny.png"));
  await page.getByLabel("Also mark this as done").check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Couldn't assess clearly|Doesn't seem to match|Partly supports/ })).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByText(/Done \(your report\)|Needs a closer look/).first()).toBeVisible();
  await expect(page.getByText("Done · supported by evidence")).toHaveCount(0);

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
