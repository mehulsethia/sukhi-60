import { defineConfig, devices } from "@playwright/test";

// Live smoke test against the deployed app. Uses throwaway accounts that the spec deletes.
export default defineConfig({
  testDir: "tests/prod-smoke",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  expect: { timeout: 15_000 },
  use: { navigationTimeout: 30_000, baseURL: process.env.SMOKE_BASE_URL ?? "https://sukhi-60.vercel.app", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "prod", use: { ...devices["Desktop Chrome"] } }],
});
