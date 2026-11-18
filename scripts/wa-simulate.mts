// End-to-end check of the WhatsApp interface without a phone or a Meta app.
// Runs real conversations (patient, family member, doctor) through the same code the
// webhook uses, against the database in .env.local, with Meta's Graph API replaced by a
// loopback fake that records every message. Prints the transcript, then deletes the
// throwaway users it created.
//
// Usage: pnpm wa:simulate          (needs migration 20261118001600 applied)
// AI steps (own-words plans, prescription reading, free chat) run only where an
// ANTHROPIC_API_KEY is set; the script sticks to the button paths so it works without one.
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createServer } from "node:http";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });

const sent: { to: string; body: Record<string, unknown> }[] = [];
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url?.endsWith("/messages")) {
      const body = JSON.parse(raw) as Record<string, unknown>;
      sent.push({ to: String(body.to), body });
      res.end(JSON.stringify({ messages: [{ id: `wamid.sim.${sent.length}.${Date.now()}` }] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const port = (server.address() as { port: number }).port;

Object.assign(process.env, {
  WHATSAPP_ACCESS_TOKEN: "sim-token-0000000000000000000000",
  WHATSAPP_PHONE_NUMBER_ID: "100000000000001",
  WHATSAPP_APP_SECRET: "sim-secret-000000000",
  WHATSAPP_VERIFY_TOKEN: "sim-verify-000000000",
  WHATSAPP_GRAPH_BASE_URL: `http://127.0.0.1:${port}`,
  WHATSAPP_DISPLAY_NUMBER: "15550001111",
});

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { handleWhatsAppMessage } = await import("../src/server/wa/inbound");
const admin = createAdminClient();

const stamp = String(Date.now()).slice(-6);
const PATIENT = `9199${stamp}01`, FAMILY = `9199${stamp}02`, DOCTOR = `9199${stamp}03`;
const label: Record<string, string> = { [PATIENT]: "PATIENT", [FAMILY]: "FAMILY ", [DOCTOR]: "DOCTOR " };

let n = 0;
function render(b: Record<string, unknown>): string {
  if (b.type === "text") return (b.text as { body: string }).body;
  if (b.type === "image") return `[image] ${(b.image as { link: string; caption?: string }).caption ?? ""} ${(b.image as { link: string }).link}`;
  if (b.type === "template") return `[template ${(b.template as { name: string }).name}]`;
  const i = b.interactive as { type: string; body: { text: string }; action: { buttons?: { reply: { id: string; title: string } }[]; sections?: { rows: { id: string; title: string; description?: string }[] }[] } };
  const opts = i.type === "button" ? i.action.buttons!.map((x) => `[${x.reply.title}] ${x.reply.id}`) : i.action.sections!.flatMap((s) => s.rows.map((r) => `(${r.title}${r.description ? `: ${r.description}` : ""}) ${r.id}`));
  return `${i.body.text}\n    ${opts.join("\n    ")}`;
}
function ids(to: string): string[] {
  return sent.filter((s) => s.to === to).flatMap((s) => {
    const i = s.body.interactive as { action?: { buttons?: { reply: { id: string } }[]; sections?: { rows: { id: string }[] }[] } } | undefined;
    return [...(i?.action?.buttons?.map((b) => b.reply.id) ?? []), ...(i?.action?.sections?.flatMap((x) => x.rows.map((r) => r.id)) ?? [])];
  });
}
const lastId = (to: string, prefix: string) => [...ids(to)].reverse().find((x) => x.startsWith(prefix)) ?? null;
const allText = (to: string) => sent.filter((s) => s.to === to).map((s) => render(s.body)).join("\n");

async function say(from: string, text: string) {
  console.log(`\n${label[from]} > ${text}`);
  const before = sent.length;
  await handleWhatsAppMessage(admin, { id: `wamid.in.${stamp}.${++n}`, from, timestamp: Math.floor(Date.now() / 1000), kind: "text", text });
  sent.slice(before).forEach((s) => console.log(`  ${label[s.to] ?? s.to} < ${render(s.body).replace(/\n/g, "\n    ")}`));
}
async function tap(from: string, replyId: string | null) {
  if (!replyId) throw new Error(`no button to tap for ${label[from]}`);
  console.log(`\n${label[from]} * tap ${replyId}`);
  const before = sent.length;
  await handleWhatsAppMessage(admin, { id: `wamid.in.${stamp}.${++n}`, from, timestamp: Math.floor(Date.now() / 1000), kind: "interactive", text: replyId, replyId });
  sent.slice(before).forEach((s) => console.log(`  ${label[s.to] ?? s.to} < ${render(s.body).replace(/\n/g, "\n    ")}`));
}

let failed = false;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "  ✔" : "  ✘"} ${what}`); if (!ok) failed = true; };

try {
  // Doctor signs up
  await say(DOCTOR, "doctor");
  await tap(DOCTOR, "ob:start:doc");
  await say(DOCTOR, "Dr. Sim Test");
  await say(DOCTOR, "Sim Clinic");
  await tap(DOCTOR, "dr:rw:10");
  const drCode = allText(DOCTOR).match(/DR-(\d{6})/)?.[1] ?? null;
  check(!!drCode, "doctor got a DR code");

  // Patient arrives from the doctor's link
  await say(PATIENT, `DR-${drCode}`);
  await tap(PATIENT, lastId(PATIENT, "ob:start:dr:"));
  await tap(PATIENT, "ob:lang:en");
  await say(PATIENT, "my name is Asha");
  await tap(PATIENT, lastId(PATIENT, "dc:yes:"));
  check(allText(DOCTOR).includes("New patient: Asha"), "doctor told about the new patient");
  await tap(PATIENT, "ob:path:pack");
  await tap(PATIENT, "ob:pack:water");
  check(allText(PATIENT).includes("Your plan is ready"), "plan created from a goal");
  await tap(PATIENT, "m:today");
  const done = lastId(PATIENT, "ci:done:");
  if (done) {
    await tap(PATIENT, done);
    check(/done|already/i.test(allText(PATIENT)), "Done recorded");
  } else console.log("  (nothing due right now; Done not tested)");
  await tap(PATIENT, "m:progress");
  await tap(PATIENT, "m:plan");
  await tap(PATIENT, "m:circle");
  await tap(PATIENT, "m:doctor");
  check(allText(PATIENT).includes("Dr. Sim Test"), "patient sees their doctor");

  // Family
  await tap(PATIENT, "m:family");
  await tap(PATIENT, "fm:add");
  const famCode = allText(PATIENT).match(/FAMILY-([A-Z0-9]{6})/)?.[1] ?? null;
  check(!!famCode, "family link made");
  await say(FAMILY, `FAMILY-${famCode}`);
  await tap(FAMILY, lastId(FAMILY, "ob:start:fam:"));
  await say(FAMILY, "Ravi");
  check(allText(FAMILY).includes("Asha today"), "family member sees the summary");
  await tap(FAMILY, lastId(FAMILY, "fm:cheer:"));
  check(allText(PATIENT).includes("Ravi is cheering you on"), "patient got the cheer");
  check(allText(PATIENT).includes("Ravi will now get your daily update"), "patient told family joined");

  // Doctor looks at patients
  await say(DOCTOR, "menu");
  await tap(DOCTOR, "dr:m:patients");
  await tap(DOCTOR, lastId(DOCTOR, "dr:p:"));
  check(allText(DOCTOR).includes("Last 7 days"), "doctor sees adherence detail");
  await tap(DOCTOR, lastId(DOCTOR, "dr:note:"));
  await say(DOCTOR, "Keep it up, see you next week.");
  check(allText(PATIENT).includes("Message from Dr. Sim Test"), "doctor note reached the patient");

  // Settings, help, STOP / START
  await say(PATIENT, "help");
  await say(PATIENT, "STOP");
  await say(PATIENT, "today");
  await say(PATIENT, "START");
} catch (e) {
  failed = true;
  console.error("\nERROR", e);
} finally {
  // Clean up the throwaway accounts (cascades to plans, bindings, doctor rows).
  const { data: bindings } = await admin.from("channel_bindings").select("user_id").in("external_id", [PATIENT, FAMILY, DOCTOR]);
  for (const id of new Set((bindings ?? []).map((b) => b.user_id))) await admin.auth.admin.deleteUser(id);
  console.log(`\nCleaned up ${new Set((bindings ?? []).map((b) => b.user_id)).size} test users.`);
  server.close();
  console.log(failed ? "\nSIMULATION FAILED" : "\nSIMULATION PASSED");
  process.exit(failed ? 1 : 0);
}
