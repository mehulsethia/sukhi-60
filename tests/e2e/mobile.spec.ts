import { expect, test } from "@playwright/test";

test("mobile: landing fits, bottom nav after sign-up, microphone denial falls back to typing", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("link", { name: "How it works" }).last()).toBeVisible();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`m-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("mobile-password-1");
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/Allow voice notes/).check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/today/);
  const nav = page.getByRole("navigation", { name: "Main navigation" }).last();
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan((page.viewportSize()!.height) - 5); // pinned to bottom
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
  await nav.getByRole("link", { name: "Assistant" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.getByRole("button", { name: /Record voice note/ }).click();
  await expect(page.getByText(/Microphone access is blocked|isn't supported in this browser/)).toBeVisible();
  await expect(page.getByLabel("Type a message…")).toBeEnabled();
});
