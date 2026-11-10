// Manual visual-review helper (not CI): run against a local build on :3300 using .env.test.local.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
await page.goto("http://localhost:3300/signup");
await page.getByLabel("Email").fill(`shot-${Date.now()}@example.test`);
await page.getByLabel("Password", { exact: true }).fill("shot-password-1");
await page.getByLabel(/I agree/).check();
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(/onboarding/);
const next = () => page.getByRole("button", { name: "Continue" }).click();
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(450);
  if ([0, 1, 3, 5, 6, 7].includes(i)) await page.screenshot({ path: `${out}/onb-${i}.png` });
  if (i === 2) await page.getByLabel("What should we call you?").fill("Asha");
  if (i < 7) await next();
}
await page.goto("http://localhost:3300/");
const how = page.locator("#how"); await how.scrollIntoViewIfNeeded(); await how.screenshot({ path: `${out}/land-how.png` });
const wa = page.getByRole("heading", { name: /Prefer WhatsApp/ }).locator("xpath=ancestor::section[1]"); await wa.screenshot({ path: `${out}/land-wa.png` });
await b.close();
