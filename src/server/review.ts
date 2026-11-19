import "server-only";
// Human review of proof: appeals, flagged photos, unclear assessments and a random audit of
// AI-accepted photos. Any /admin user can decide; every decision is final, logged and told to
// the person.
import type { AdminClient } from "@/lib/supabase/admin";
import { w } from "@/domain/wa-copy";
import { notify } from "./wa/send";
import { challengeFor } from "./proof";

export type ReviewFilter = "open" | "waiting" | "decided";
const SOURCE_ORDER = ["appeal", "flag", "evaluator", "user", "assistant", "safety", "audit"];

async function signed(admin: AdminClient, bucket: string | undefined, path: string | undefined) {
  if (!bucket || !path) return null;
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}

export async function reviewQueue(admin: AdminClient, filter: ReviewFilter) {
  let q = admin.from("review_requests").select("*").order("created_at", { ascending: filter !== "decided" }).limit(filter === "decided" ? 50 : 100);
  q = filter === "open" ? q.eq("status", "open") : filter === "waiting" ? q.eq("status", "waiting_patient") : q.in("status", ["resolved", "dismissed"]);
  const { data: reqs } = await q;
  const rows = (reqs ?? []).sort((a, b) => (filter === "decided" ? 0 : SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)));
  return Promise.all(
    rows.map(async (r) => {
      const [{ data: prof }, { data: item }, { data: ev }, { data: occ }] = await Promise.all([
        admin.from("profiles").select("display_name, timezone").eq("id", r.user_id).maybeSingle(),
        r.item_id ? admin.from("plan_items").select("title, instructions, category").eq("id", r.item_id).maybeSingle() : Promise.resolve({ data: null }),
        r.evaluation_id ? admin.from("evaluations").select("*").eq("id", r.evaluation_id).maybeSingle() : Promise.resolve({ data: null }),
        r.occurrence_id ? admin.from("action_occurrences").select("local_date, local_time, status, proof_level").eq("id", r.occurrence_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const evidenceId = r.evidence_id ?? ev?.evidence_id ?? null;
      const { data: evidence } = evidenceId ? await admin.from("evidence").select("id, kind, text_content, created_at, taken_at, documents(bucket, storage_path, mime_type)").eq("id", evidenceId).maybeSingle() : { data: null };
      const docOf = (e: { documents: unknown } | null) => (e?.documents as { bucket: string; storage_path: string; mime_type: string } | null) ?? null;
      const doc = docOf(evidence);
      // Earlier photos of the same task, and the photo it may have been copied from.
      const { data: earlier } = r.item_id
        ? await admin.from("evidence").select("id, created_at, documents(bucket, storage_path, mime_type), action_occurrences!inner(item_id)").eq("user_id", r.user_id).eq("action_occurrences.item_id", r.item_id).neq("id", evidenceId ?? "00000000-0000-0000-0000-000000000000").in("kind", ["photo", "document"]).order("created_at", { ascending: false }).limit(4)
        : { data: [] };
      const reusedId = ((ev?.flag_detail as { reused?: { evidenceId?: string } } | null)?.reused?.evidenceId) ?? null;
      const { data: reused } = reusedId ? await admin.from("evidence").select("id, created_at, documents(bucket, storage_path, mime_type)").eq("id", reusedId).maybeSingle() : { data: null };
      return {
        req: r,
        name: prof?.display_name ?? "Patient",
        item,
        occ,
        ev,
        evidence: evidence ? { id: evidence.id, kind: evidence.kind, text: evidence.text_content, createdAt: evidence.created_at, takenAt: evidence.taken_at, mime: doc?.mime_type ?? null, url: await signed(admin, doc?.bucket, doc?.storage_path) } : null,
        earlier: await Promise.all((earlier ?? []).map(async (e) => ({ id: e.id, createdAt: e.created_at, url: await signed(admin, docOf(e)?.bucket, docOf(e)?.storage_path) }))),
        reused: reused ? { createdAt: reused.created_at, url: await signed(admin, docOf(reused)?.bucket, docOf(reused)?.storage_path) } : null,
      };
    }),
  );
}

export async function reviewStats(admin: AdminClient) {
  const [{ data: open }, { data: audits }] = await Promise.all([
    admin.from("review_requests").select("source, status").in("status", ["open", "waiting_patient"]),
    admin.from("review_requests").select("decision").eq("source", "audit").eq("status", "resolved"),
  ]);
  const bySource = (s: string) => (open ?? []).filter((r) => r.source === s && r.status === "open").length;
  const decided = (audits ?? []).filter((a) => a.decision === "verified" || a.decision === "rejected");
  return {
    open: (open ?? []).filter((r) => r.status === "open").length,
    waiting: (open ?? []).filter((r) => r.status === "waiting_patient").length,
    appeals: bySource("appeal"),
    flags: bySource("flag") + bySource("evaluator"),
    audits: bySource("audit"),
    auditDecided: decided.length,
    auditAgreed: decided.filter((a) => a.decision === "verified").length,
  };
}

export type Decision = "verified" | "rejected" | "more_photo" | "dismissed";

export async function decideReview(admin: AdminClient, reviewer: string, requestId: string, decision: Decision, note: string | null) {
  const { data: r } = await admin.from("review_requests").select("*").eq("id", requestId).maybeSingle();
  if (!r || !["open", "waiting_patient"].includes(r.status)) return { ok: false as const, error: "not_open" };
  const cleanNote = note?.replace(/\s+/g, " ").trim().slice(0, 500) || null;
  const now = new Date().toISOString();
  const { data: item } = r.item_id ? await admin.from("plan_items").select("title").eq("id", r.item_id).maybeSingle() : { data: null };
  const { data: prof } = await admin.from("profiles").select("locale").eq("id", r.user_id).single();
  const l = prof?.locale ?? "en";
  const title = item?.title ?? "";
  const noteLine = cleanNote ? `\n\n"${cleanNote}"` : "";

  if (decision === "more_photo") {
    await admin.from("review_requests").update({ status: "waiting_patient", decision, decision_note: cleanNote, decided_by: reviewer, decided_at: now }).eq("id", r.id);
    if (r.occurrence_id) await challengeFor(admin, r.user_id, r.occurrence_id);
    await tell(admin, r.user_id, w(l, "review_more", { title, note: noteLine }), r.occurrence_id ? [{ id: `pf:${r.occurrence_id}`, title: w(l, "btn_new_photo") }] : [], `review:${r.id}:more`);
  } else if (decision === "dismissed" || !r.occurrence_id) {
    await admin.from("review_requests").update({ status: "dismissed", decision: "dismissed", decision_note: cleanNote, decided_by: reviewer, decided_at: now }).eq("id", r.id);
  } else {
    const { data: base } = r.evaluation_id ? await admin.from("evaluations").select("evidence_id").eq("id", r.evaluation_id).maybeSingle() : { data: null };
    const evidenceId = r.evidence_id ?? base?.evidence_id ?? null;
    const verified = decision === "verified";
    const { data: ev, error } = await admin
      .from("evaluations")
      .upsert(
        {
          user_id: r.user_id,
          occurrence_id: r.occurrence_id,
          evidence_id: evidenceId,
          method: "manual_review",
          outcome: verified ? "supports" : "does_not_support",
          explanation: (cleanNote ?? (verified ? "Checked by a Sukhi reviewer: confirmed." : "Checked by a Sukhi reviewer: could not be confirmed.")).slice(0, 1500),
          needs_review: false,
          reviewer,
          proof_level: verified ? "human_verified" : "flagged",
        },
        { onConflict: "evidence_id,method" },
      )
      .select("id")
      .single();
    if (error || !ev) return { ok: false as const, error: "save_failed" };
    await admin.rpc("apply_evaluation_internal", { p_evaluation: ev.id });
    await admin.from("review_requests").update({ status: "resolved", decision, decision_note: cleanNote, decided_by: reviewer, decided_at: now }).eq("id", r.id);
    // An audit only bothers the person when the reviewer disagrees with the AI.
    if (r.source !== "audit" || !verified) {
      await tell(admin, r.user_id, verified ? w(l, "review_verified", { title }) : w(l, "review_rejected", { title, note: noteLine }), verified ? [] : [{ id: `pf:${r.occurrence_id}`, title: w(l, "btn_new_photo") }], `review:${r.id}:${decision}`);
    }
  }
  await admin.from("audit_events").insert({ user_id: r.user_id, actor: "system", action: "proof_review_decided", entity: "review_request", entity_id: r.id, details: { decision, by: reviewer, source: r.source } });
  return { ok: true as const };
}

/** In the app (chat) and on WhatsApp when connected; held until the person writes if needed. */
async function tell(admin: AdminClient, userId: string, text: string, buttons: { id: string; title: string }[], key: string) {
  await admin.from("messages").insert({ user_id: userId, role: "assistant", channel: "system", content: text.slice(0, 2000) });
  await notify(admin, userId, buttons.length ? { type: "buttons", body: text, buttons } : { type: "text", body: text }, key, { hold: true }).catch(() => undefined);
}
