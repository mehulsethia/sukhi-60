import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Tests use the LOCAL Supabase stack from .env.test.local (process env overrides .env.local in Next).
const testEnv = config({ path: ".env.test.local", processEnv: {} }).parsed ?? {};

// E2E runs the production build against the LOCAL Supabase stack. WhatsApp traffic goes to a
// loopback mock of the Graph API (tests/e2e/graph-mock.ts) — this is NOT real Meta delivery.
const PORT = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ...testEnv,
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      WHATSAPP_ACCESS_TOKEN: "e2e-fake-token-xxxxxxxxxxxxxxxx",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_APP_SECRET: "e2e-app-secret-123456",
      WHATSAPP_VERIFY_TOKEN: "e2e-verify-token-123456",
      WHATSAPP_GRAPH_BASE_URL: "http://127.0.0.1:4545",
      SARVAM_API_KEY: "e2e-fake-sarvam-key",
      DEMO_MODE_ENABLED: "true",
    },
  },
});
