import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import { createHmac } from "node:crypto";

config({ path: path.resolve(__dirname, "../../.env.test.local"), override: true });

const email = `e2e-${Date.now()}@example.test`;
const password = "e2e-password-123";
const waNumber = `9199${Math.floor(10000000 + Math.random() * 89999999)}`;

function istMinus(minutes: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() - minutes * 60_000));
}

async function signedWebhook(page: Page, text: string, id: string) {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: [{ from: waNumber, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }] });
  const sig = `sha256=${createHmac("sha256", "e2e-app-secret-123456").update(body).digest("hex")}`;
  return page.request.post("/api/whatsapp/webhook", { data: body, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
}

test.describe.serial("core journey", () => {
  test("unauthenticated users are redirected to sign in; APIs return 401", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login\?next=%2Ftoday/);
    const api = await page.request.post("/api/chat", { data: { text: "hi" } });
    expect(api.status()).toBe(401);
    const worker = await page.request.post("/api/worker/tick");
    expect(worker.status()).toBe(401);
  });

  test("sign up -> onboarding -> plan -> reminder -> evidence -> assessment -> progress -> WhatsApp shared context", async ({ page }) => {
    page.on("pageerror", (e) => console.log("PAGEERROR", e.stack));
    page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 300)));
    // Sign up (local Supabase: email confirmation disabled)
    await page.goto("/");
    await page.getByRole("link", { name: "Get started" }).first().click();
    await expect(page).toHaveURL(/\/signup/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Please agree to the Terms and Privacy notice to continue.")).toBeVisible();
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    // Onboarding (4 steps). Keep Asia/Kolkata so times below are predictable.
    await page.getByLabel("What should we call you?").fill("Asha Test");
    await page.getByLabel("Time zone").selectOption("Asia/Kolkata");
    // Quiet hours must not cover "now" for the reminder test.
    await page.locator("#quiet_start").fill("03:00");
    await page.locator("#quiet_end").fill("03:01");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel(/Allow voice notes/).check();
    await page.getByLabel(/connect WhatsApp later/).check();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("I'll set up my plan myself").check();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("No actions scheduled for today.")).toBeVisible();

    // Create a personal plan and confirm an item due 10 minutes ago.
    await page.getByRole("link", { name: "Set up your plan" }).click();
    await page.getByLabel("Plan name").fill("My walking goal");
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { name: "My walking goal" })).toBeVisible();
    await expect(page.getByText("Personal goal — not medical advice").first()).toBeVisible();
    const add = page.locator("section", { has: page.getByRole("heading", { name: "Add an action" }) });
    await add.getByLabel("Action", { exact: true }).fill("Short walk");
    await add.getByLabel("Times").fill(istMinus(10));
    await add.getByRole("button", { name: "Confirm & schedule" }).click();
    await expect(page.getByText("Confirmed · Version 1")).toBeVisible();

    // Reminder fires via the secured worker endpoint (as Supabase Cron would call it).
    const tick = await page.request.post("/api/worker/tick", { headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } });
    expect(tick.status()).toBe(200);
    await page.goto("/today");
    await expect(page.getByText(/Time for: Short walk/)).toBeVisible();
    await expect(page.getByText("Waiting for your reply")).toBeVisible();

    // Submit a photo (AI not configured -> saved, described honestly, not "verified").
    await page.getByRole("link", { name: "Add photo or note" }).click();
    await page.getByLabel("Take or choose a photo").setInputFiles(path.resolve(__dirname, "../fixtures/tiny.png"));
    await page.getByLabel("Also mark this as done").check();
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Couldn't assess clearly" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Done (your report)").first()).toBeVisible(); // self-report, not evidence-supported
    await expect(page.getByText("Recorded by rules (no AI description)")).toBeVisible();
    await expect(page.getByText("This is a description, not a score or proof.").first()).toBeVisible();

    // Progress shows garden points and the week table.
    await page.getByRole("link", { name: "Progress" }).first().click();
    await expect(page).toHaveURL(/\/progress/);
    await expect(page.getByText(/\d+ garden points/).first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("First step").first()).toBeVisible();

    // Link WhatsApp with a one-time code, then message from that number (signed fixture).
    await page.getByRole("link", { name: "Settings" }).first().click();
    await expect(page).toHaveURL(/\/settings/);
    await page.getByRole("button", { name: "Create link code" }).click();
    const code = (await page.getByTestId("link-code").textContent())!.trim();
    expect(code).toMatch(/^SUKHI-[A-HJ-NP-Z2-9]{8}$/);
    expect((await signedWebhook(page, code, `wamid.e2e.link.${Date.now()}`)).status()).toBe(200);
    await expect.poll(async () => { await page.reload(); return (await page.getByRole("region", { name: "WhatsApp" }).textContent()) ?? ""; }, { timeout: 15_000 }).toMatch(/Status:\s*Connected/);
    // Replayed link code is rejected.
    expect((await signedWebhook(page, code, `wamid.e2e.link2.${Date.now()}`)).status()).toBe(200);

    expect((await signedWebhook(page, "Feeling good after the walk", `wamid.e2e.msg.${Date.now()}`)).status()).toBe(200);
    await page.getByRole("link", { name: "Assistant" }).first().click();
    await expect(page).toHaveURL(/\/chat/);
    await expect.poll(async () => { await page.reload(); return page.getByText("Feeling good after the walk").count(); }, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText("via WhatsApp").first()).toBeVisible();

    // Web chat continues the same conversation/context.
    await page.getByLabel("Type a message…").fill("done");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/already recorded|I don't see an action waiting/)).toBeVisible();

    // The mock Graph API received replies (proves our outbound path, not Meta delivery).
    const sent = await (await page.request.get("http://127.0.0.1:4545/__sent")).json();
    expect(sent.some((m: { to: string }) => m.to === waNumber)).toBe(true);
  });

  test("auth pages: log in errors, forgot password, legal pages", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByText(/don't match/)).toBeVisible();
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/reset link is on its way/)).toBeVisible();
    await page.goto("/reset-password");
    await expect(page.getByText(/expired/)).toBeVisible();
    for (const p of ["/privacy", "/terms"]) {
      await page.goto(p);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("demo route is clearly fictional", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByText(/Fictional demo — no real AI, WhatsApp, or medical evaluation/)).toBeVisible();
  });
});
