// Manual responsive review (not CI). Requires a local build on :3300 with .env.test.local.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const base = "http://localhost:3300";
const b = await chromium.launch();
const widths = [375, 768, 1440];
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 800 ? 812 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const menuVisible = await page.getByRole("button", { name: "Menu" }).isVisible();
  console.log(`w=${w} landing overflow=${overflow} menuButtonVisible=${menuVisible}`);
  await page.screenshot({ path: `${out}/landing-${w}.png`, fullPage: true });
  await page.goto(base + "/signup");
  await page.getByLabel("Email").fill(`resp-${w}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("resp-password-1");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  await page.screenshot({ path: `${out}/onb0-${w}.png` });
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/onb3-${w}.png`, fullPage: true });
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start using Sukhi" }).click();
  await page.waitForURL(/today/);
  await page.waitForTimeout(600);
  const o2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`w=${w} today overflow=${o2}`);
  await page.screenshot({ path: `${out}/today-${w}.png`, fullPage: true });
  await page.goto(base + "/progress", { waitUntil: "networkidle" });
  const o3 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`w=${w} progress overflow=${o3}`);
  await page.screenshot({ path: `${out}/progress-${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
