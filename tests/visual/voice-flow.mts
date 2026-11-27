// End-to-end check of "Talk to Sukhi" against the real database with a throwaway user (deleted at
// the end). Runs the same server turn the /api/voice/command route runs, then optionally
// screenshots the mic button and panel on a local `next dev` (pass an output folder).
// Not part of CI:  npx tsx --conditions=react-server tests/visual/voice-flow.mts [outDir]
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });

const { voiceTurn } = await import("../../src/server/voice");
const out = process.argv[2];
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `voice-${Date.now()}@example.test`, password = "pw-" + crypto.randomUUID();
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = data.user!.id;
const ist = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
let failures = 0;
const check = (label: string, ok: boolean, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`); if (!ok) failures++; };

try {
  const up = await admin.from("profiles").update({ display_name: "Asha", timezone: "Asia/Kolkata", locale: "hi", onboarded_at: new Date().toISOString() }).eq("id", uid);
  if (up.error) throw new Error(up.error.message);
  // The app asks every account for a phone; a unique fake one gets past that screen.
  await admin.from("profiles").update({ phone: `9199${String(Date.now()).slice(-8)}` }).eq("id", uid);
  await admin.from("consents").insert(["ai_processing", "reminders", "voice_processing"].map((kind) => ({ user_id: uid, kind, granted: true, granted_at: new Date().toISOString() })));
  const { data: plan } = await admin.from("care_plans").insert({ user_id: uid, title: "Doctor's plan", mode: "clinician_instructions", status: "active" }).select("id").single();
  await admin.from("plan_items").insert([
    { plan_id: plan!.id, user_id: uid, title: "Metformin 500 mg", category: "medication", schedule_kind: "daily", times: [ist(10)], status: "confirmed", evidence_hint: "none" },
    { plan_id: plan!.id, user_id: uid, title: "Morning walk 30 min", category: "activity", schedule_kind: "daily", times: [ist(5)], status: "confirmed", evidence_hint: "none" },
  ]);
  const turn = (text: string, pending: unknown = null) => voiceTurn(admin as never, uid, { text, pending: pending as never, key: `t${Date.now()}` });

  const r1 = await turn("Tablet le li, khane ke baad");
  check("reads back before saving (Hindi)", /Metformin 500 mg, .* पर हो गया। सही है\?/.test(r1.say), r1.say);
  const before = await admin.from("check_ins").select("id", { count: "exact", head: true }).eq("user_id", uid);
  check("nothing saved before yes", before.count === 0);
  const r2 = await turn("haan", r1.pending);
  const done = await admin.from("action_occurrences").select("status, plan_items!inner(title)").eq("user_id", uid).eq("plan_items.title", "Metformin 500 mg");
  check("saves after “haan”", done.data?.some((o) => o.status === "self_reported") ?? false, r2.say);

  const r3 = await turn("Aaj walk nahi hua, ghutna dard");
  check("skip read-back names the reason", r3.say.includes("दर्द"), r3.say);
  const r4 = await turn("हाँ", r3.pending);
  const barrier = await admin.from("barrier_reports").select("barrier_code").eq("user_id", uid);
  check("skip saved with pain reason", barrier.data?.[0]?.barrier_code === "physical_discomfort", r4.say);

  const r5 = await turn("Har roz raat 10 baje paani yaad dilana");
  check("drafts a daily reminder", r5.pending?.kind === "add_task", r5.say);
  await turn("ok", r5.pending);
  const added = await admin.from("plan_items").select("title, times, status").eq("user_id", uid).eq("title", "Drink water");
  check("reminder added at 22:00", added.data?.[0]?.times?.[0]?.startsWith("22:00") ?? false);

  const r6 = await turn("Aaj kya baaki hai?");
  check("answers what's left", r6.say.length > 5, r6.say);
  const r7 = await turn("Kitni goli leni hai?");
  check("medical question gets the referral", /डॉक्टर|doctor/.test(r7.say) && !r7.pending, r7.say);
  const r8 = await turn("Progress dikhao");
  check("navigates", r8.navigate === "/progress", r8.say);

  if (out) {
    const { chromium, devices } = await import("@playwright/test");
    const base = "http://localhost:3200";
    const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
    const page = await ctx.newPage();
    await page.goto(base + "/login", { waitUntil: "load", timeout: 90000 });
    // The dev build hydrates late: refill until React has the values and enables the button.
    const submit = page.locator('form button[type="submit"]');
    for (let i = 0; i < 20 && (await submit.isDisabled()); i++) {
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.waitForTimeout(1500);
    }
    await submit.click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }).catch(() => undefined);
    console.log("after login:", new URL(page.url()).pathname, (await page.locator('[role="alert"], .alert').allInnerTexts()).join(" | ").slice(0, 200));
    await page.goto(base + "/today", { waitUntil: "load", timeout: 90000 });
    await page.screenshot({ path: `${out}/today-mic.png` });
    await page.getByRole("button", { name: /सुखी से बात करें|talk to sukhi/i }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/panel-listening.png` });
    await browser.close();
  }
} finally {
  await admin.auth.admin.deleteUser(uid);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall voice checks passed");
process.exit(failures ? 1 : 0);
