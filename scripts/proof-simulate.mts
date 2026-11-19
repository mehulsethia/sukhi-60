// End-to-end check of the proof loop against the database in .env.local (needs migration
// 20261119001900). A throwaway patient sends photos on WhatsApp (Graph API replaced by a
// loopback fake): reuse is caught, a reviewer verifies / asks for a new photo, appeals reach
// the queue, and the patient is told each decision. Deletes the throwaway user afterwards.
// The AI itself only runs where ANTHROPIC_API_KEY is set; without it the rule checks still run.
//
// Usage: pnpm proof:simulate
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import sharp from "sharp";

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
Object.assign(process.env, {
  WHATSAPP_ACCESS_TOKEN: "sim-token-0000000000000000000000",
  WHATSAPP_PHONE_NUMBER_ID: "100000000000001",
  WHATSAPP_APP_SECRET: "sim-secret-000000000",
  WHATSAPP_VERIFY_TOKEN: "sim-verify-000000000",
  WHATSAPP_GRAPH_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  WHATSAPP_DISPLAY_NUMBER: "15550001111",
  PROOF_AUDIT_RATE: "0",
});

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { handleWhatsAppMessage } = await import("../src/server/wa/inbound");
const P = await import("../src/server/wa/patient");
const { decideReview, reviewQueue } = await import("../src/server/review");
const admin = createAdminClient();
const stamp = String(Date.now()).slice(-6);
const FROM = `9198${stamp}11`;
let n = 0;
let failed = false;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "  ✔" : "  ✘"} ${what}`); if (!ok) failed = true; };
const textOf = (b: Record<string, unknown>) => (b.type === "text" ? (b.text as { body: string }).body : ((b.interactive as { body?: { text: string } } | undefined)?.body?.text ?? ""));
const since = () => sent.length;
const after = (i: number) => sent.slice(i).map((s) => textOf(s.body)).join("\n---\n");
const msg = (extra: Record<string, unknown>) => ({ id: `wamid.proof.${stamp}.${++n}`, from: FROM, timestamp: Math.floor(Date.now() / 1000), ...extra }) as never;

// Two different test pictures, plus a recompressed, slightly cropped copy of the first.
const noise = (seed: number) => Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => ((i * seed) ^ (i >> 3)) % 256));
const imgA = await sharp(noise(37), { raw: { width: 64, height: 64, channels: 3 } }).resize(640, 640).jpeg({ quality: 90 }).toBuffer();
const imgB = await sharp(noise(101), { raw: { width: 64, height: 64, channels: 3 } }).resize(640, 640).jpeg({ quality: 90 }).toBuffer();
const imgA2 = await sharp(imgA).extract({ left: 12, top: 12, width: 616, height: 616 }).resize(560, 560).jpeg({ quality: 60 }).toBuffer();

let userId: string | null = null;
try {
  // Account and a plan with several tasks today.
  await handleWhatsAppMessage(admin, msg({ kind: "text", text: "hi" }));
  await handleWhatsAppMessage(admin, msg({ kind: "interactive", text: "Start", replyId: "ob:start" }));
  await handleWhatsAppMessage(admin, msg({ kind: "interactive", text: "English", replyId: "ob:lang:en" }));
  await handleWhatsAppMessage(admin, msg({ kind: "text", text: "Proofy" }));
  await handleWhatsAppMessage(admin, msg({ kind: "interactive", text: "Glow", replyId: "ob:pack:glow" }));
  const { data: b } = await admin.from("channel_bindings").select("id, user_id").eq("external_id", FROM).single();
  userId = b!.user_id;
  const { data: occs } = await admin.from("action_occurrences").select("id, local_time").eq("user_id", userId).order("due_at").limit(4);
  check((occs?.length ?? 0) >= 4, `plan has tasks (${occs?.length})`);
  const ctx = () => ({ admin, userId: userId!, bindingId: b!.id, to: FROM, locale: "en", key: `proof.${stamp}.${++n}`, n: 0 });

  // 1. Asking for proof gives a fresh-photo sign.
  let i = since();
  await P.askProof(ctx(), occs![0].id);
  check(/fingers|piece of paper/.test(after(i)), "proof request includes a fresh-photo sign");
  const { data: ch } = await admin.from("proof_challenges").select("kind, value").eq("occurrence_id", occs![0].id).single();
  check(!!ch, `challenge stored (${ch?.kind} ${ch?.value})`);

  // 2. First photo: accepted path (no reuse).
  i = since();
  await P.saveProof(ctx(), { bytes: new Uint8Array(imgA), mime: "image/jpeg" }, "image", undefined, `wamid.photo.${stamp}.1`, occs![0].id);
  const { data: e1 } = await admin.from("evaluations").select("id, flags, proof_level, evidence_id").eq("occurrence_id", occs![0].id).single();
  const { data: ev1 } = await admin.from("evidence").select("phash").eq("id", e1!.evidence_id!).single();
  check(!!ev1?.phash, `photo fingerprinted (${ev1?.phash})`);
  check(!(e1?.flags ?? []).includes("reused_photo"), "first photo not flagged as reused");

  // 3. Same photo for another task: caught.
  i = since();
  await P.saveProof(ctx(), { bytes: new Uint8Array(imgA), mime: "image/jpeg" }, "image", undefined, `wamid.photo.${stamp}.2`, occs![1].id);
  const { data: e2 } = await admin.from("evaluations").select("id, flags, proof_level, needs_review").eq("occurrence_id", occs![1].id).single();
  check((e2?.flags ?? []).includes("reused_photo") && e2?.proof_level === "flagged", "exact same photo again is flagged as reused");
  check(after(i).includes("looks like a photo you sent before"), "patient told it looks reused");
  const { data: occ2 } = await admin.from("action_occurrences").select("status").eq("id", occs![1].id).single();
  check(occ2?.status === "needs_review", "reused photo does not count as done");

  // 4. Cropped, recompressed copy: still caught by the visual fingerprint.
  await P.saveProof(ctx(), { bytes: new Uint8Array(imgA2), mime: "image/jpeg" }, "image", undefined, `wamid.photo.${stamp}.3`, occs![2].id);
  const { data: e3 } = await admin.from("evaluations").select("id, flags").eq("occurrence_id", occs![2].id).single();
  const { data: a3 } = await admin.from("review_requests").select("id").eq("evaluation_id", e3!.id).limit(1).maybeSingle();
  check(((e3?.flags ?? []).includes("reused_photo") || (e3?.flags ?? []).includes("similar_photo")) && !!a3, `cropped + recompressed copy is caught and sent to a reviewer (${(e3?.flags ?? []).join(", ")})`);

  // 5. A different picture: fine.
  await P.saveProof(ctx(), { bytes: new Uint8Array(imgB), mime: "image/jpeg" }, "image", undefined, `wamid.photo.${stamp}.4`, occs![3].id);
  const { data: e4 } = await admin.from("evaluations").select("id, flags").eq("occurrence_id", occs![3].id).single();
  check(!(e4?.flags ?? []).includes("reused_photo"), "a genuinely different photo is not flagged");

  // 6. Flagged photo is in the review queue; reviewer verifies it.
  const queue = await reviewQueue(admin, "open");
  const flagReq = queue.find((q) => q.req.occurrence_id === occs![1].id);
  check(flagReq?.req.source === "flag" && !!flagReq.evidence?.url && !!flagReq.reused?.url, "flag in queue with photo and the earlier matching photo");
  i = since();
  await decideReview(admin, "reviewer@sim", flagReq!.req.id, "verified", null);
  const { data: occ2b } = await admin.from("action_occurrences").select("status, proof_level").eq("id", occs![1].id).single();
  check(occ2b?.status === "evidence_supported" && occ2b.proof_level === "human_verified", "reviewer verified: done and human-verified");
  check(after(i).includes("confirmed ✓"), "patient told the reviewer confirmed it");

  // 7. Appeal from WhatsApp (Disagree → note).
  i = since();
  await handleWhatsAppMessage(admin, msg({ kind: "interactive", text: "Disagree", replyId: `ap:${e4!.id}` }));
  await handleWhatsAppMessage(admin, msg({ kind: "text", text: "That is my new strip" }));
  const { data: appeal } = await admin.from("review_requests").select("id, source, patient_note, status").eq("evaluation_id", e4!.id).eq("source", "appeal").single();
  check(appeal?.patient_note === "That is my new strip" && after(i).includes("Sent to a Sukhi reviewer"), "appeal filed with the patient's note");

  // 8. Reviewer asks for a new photo; the new photo closes that request.
  i = since();
  await decideReview(admin, "reviewer@sim", appeal!.id, "more_photo", "Please show the strip clearly");
  check(after(i).includes("needs another photo") && after(i).includes("Please show the strip clearly"), "patient asked for a new photo with the note");
  const { data: waiting } = await admin.from("review_requests").select("status").eq("id", appeal!.id).single();
  check(waiting?.status === "waiting_patient", "request waits for the patient");
  const imgC = await sharp(noise(211), { raw: { width: 64, height: 64, channels: 3 } }).resize(640, 640).jpeg().toBuffer();
  await P.saveProof(ctx(), { bytes: new Uint8Array(imgC), mime: "image/jpeg" }, "image", undefined, `wamid.photo.${stamp}.5`, occs![3].id);
  const { data: closed } = await admin.from("review_requests").select("status").eq("id", appeal!.id).single();
  check(closed?.status === "resolved", "new photo closes the waiting request");

  // 9. Doctor/family numbers include the proof breakdown.
  const { adherenceFor } = await import("../src/server/wa/data");
  const today = new Date().toISOString().slice(0, 10);
  const a = await adherenceFor(admin, userId!, today, today);
  check(a.proof.human >= 1, `proof breakdown (photo ${a.proof.photo}, human ${a.proof.human}, flagged ${a.proof.flagged})`);
} catch (e) {
  failed = true;
  console.error("\nERROR", e);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log(userId ? "\nCleaned up the test user." : "");
  server.close();
  console.log(failed ? "\nPROOF SIMULATION FAILED" : "\nPROOF SIMULATION PASSED");
  process.exit(failed ? 1 : 0);
}
