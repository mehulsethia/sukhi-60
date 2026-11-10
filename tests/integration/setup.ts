import { config } from "dotenv";
import path from "node:path";

// Integration tests run against the LOCAL Supabase stack (supabase start), never a remote project.
config({ path: path.resolve(__dirname, "../../.env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321/.test(url)) {
  throw new Error("Integration tests must target the local Supabase stack (http://127.0.0.1:54321).");
}
// Provider credentials are deliberately unset so tests can never reach real providers.
for (const k of ["ANTHROPIC_API_KEY", "SARVAM_API_KEY", "WHATSAPP_ACCESS_TOKEN"]) delete process.env[k];
