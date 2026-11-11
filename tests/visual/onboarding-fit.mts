// Checks every onboarding step fits one desktop viewport (no page or panel scrolling). Manual / local.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3300";
const out = process.argv[3];
const b = await chromium.launch();
let worst = 0;
for (const vp of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
  const page = await (await b.newContext({ viewport: vp })).newPage();
  await page.goto(base + "/signup");
  await page.getByLabel("Email").fill(`fit-${vp.width}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("fit-password-1");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(350);
    if (i === 7) await page.getByLabel(/Enter my doctor's instructions/).check();
    if (i === 4) await page.locator("details summary").click();
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const doc = document.documentElement.scrollHeight - window.innerHeight;
      const panel = [...document.querySelectorAll("main form > div")].find((d) => getComputedStyle(d).overflowY === "auto") as HTMLElement | undefined;
      return { doc, panel: panel ? panel.scrollHeight - panel.clientHeight : -1 };
    });
    worst = Math.max(worst, m.doc, m.panel);
    console.log(`${vp.width}x${vp.height} step ${i + 1}: page overflow ${m.doc}px, panel overflow ${m.panel}px`);
    if (out && (i === 3 || i === 6 || i === 7)) await page.screenshot({ path: `${out}/fit-${vp.width}-s${i + 1}.png` });
    if (i < 7) await page.getByRole("button", { name: "Continue" }).click();
  }
}
console.log("WORST", worst);
await b.close();
