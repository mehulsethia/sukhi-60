// Checks the smart router on PRODUCTION (the only place with the Anthropic key), with a throwaway
// user that is deleted at the end. Sends phrases the word lists don't cover to /api/voice/command
// through a real signed-in session. Not part of CI:  npx tsx tests/visual/voice-router-prod.mts
import { chromium } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });

const base = "https://sukhi-60.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `router-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = data.user!.id;
const ist = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
let failures = 0;
const check = (label: string, ok: boolean, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`); if (!ok) failures++; };

try {
  await admin.from("profiles").update({ display_name: "Asha", timezone: "Asia/Kolkata", locale: "en", onboarded_at: new Date().toISOString() }).eq("id", uid);
  await admin.from("profiles").update({ phone: `9198${String(Date.now()).slice(-8)}` }).eq("id", uid);
  await admin.from("consents").insert(["ai_processing", "reminders", "voice_processing"].map((kind) => ({ user_id: uid, kind, granted: true, granted_at: new Date().toISOString() })));
  const { data: plan } = await admin.from("care_plans").insert({ user_id: uid, title: "My goals", mode: "personal_goal", status: "active" }).select("id").single();
  await admin.from("plan_items").insert([
    { plan_id: plan!.id, user_id: uid, title: "Evening walk", category: "activity", schedule_kind: "daily", times: [ist(5)], status: "confirmed", evidence_hint: "none" },
    { plan_id: plan!.id, user_id: uid, title: "Glass of water", category: "nutrition", schedule_kind: "daily", times: [ist(8)], status: "confirmed", evidence_hint: "none" },
  ]);

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.goto(base + "/login", { waitUntil: "load" });
  const submit = page.locator('form button[type="submit"]');
  for (let i = 0; i < 20 && (await submit.isDisabled()); i++) {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.waitForTimeout(800);
  }
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 });

  const say = async (text: string, pending: unknown = null) => {
    const t0 = Date.now();
    try {
      const res = await page.request.post(base + "/api/voice/command", { data: { text, pending, key: `router${Date.now()}` }, timeout: 90_000 });
      const j = await res.json().catch(async () => ({ say: `HTTP ${res.status()}: ${(await res.text()).slice(0, 120)}` }));
      return { ...j, ms: Date.now() - t0 };
    } catch (e) {
      return { say: `request failed: ${(e as Error).message.split("\n")[0]}`, ms: Date.now() - t0 };
    }
  };

  const r1 = await say("I've had my water already");
  check("router: “I've had my water already” → read-back", r1.pending?.kind === "checkin" && r1.pending?.status === "done", `${r1.say} (${r1.ms} ms)`);
  const r2 = await say("could you push my evening walk to quarter past seven");
  check("router: “push my walk to quarter past seven” → time change", r2.pending?.kind === "change" && r2.pending?.time === "19:15", `${r2.say} (${r2.ms} ms)`);
  const r3 = await say("I feel dizzy, should I stop my BP tablets?");
  check("router: medical question → referral, nothing pending", !r3.pending && /doctor|pharmacist/i.test(r3.say), `${r3.say} (${r3.ms} ms)`);
  const r4 = await say("thank you Sukhi, you're really helpful");
  check("router: small talk → short kind reply", typeof r4.say === "string" && r4.say.length > 3 && !r4.pending, `${r4.say} (${r4.ms} ms)`);
  const r5 = await say("how many days did I manage this week");
  check("router: progress question", /This week|Nothing has been scheduled/.test(r5.say), `${r5.say} (${r5.ms} ms)`);
  const r6 = await say("tablet le li");
  check("word list still answers instantly (no AI)", r6.ms < 4000, `${r6.say} (${r6.ms} ms)`);
  await browser.close();
} finally {
  await admin.auth.admin.deleteUser(uid);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall router checks passed");
process.exit(failures ? 1 : 0);
