import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/config";
import { evaluateEvidence } from "@/server/ai-tasks";
import { getConsents, getProfile } from "@/server/core";
import { validateUpload } from "@/server/files";
import { transcribe } from "@/server/providers";
import { errorJson, json } from "@/server/http";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Fields = z.object({
  occurrence_id: z.string().uuid(),
  kind: z.enum(["photo", "text", "audio", "document", "video"]),
  text: z.string().trim().max(2000).optional(),
  mark_done: z.enum(["true", "false"]).optional(),
  idempotency_key: z.string().min(8).max(120),
  video_path: z.string().max(300).optional(),
  via: z.enum(["chat", "action"]).optional(),
});
const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];

const ALLOWED: Record<string, string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  document: ["application/pdf", "image/jpeg", "image/png"],
  audio: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"],
};

// Evidence always belongs to one occurrence the caller owns. Writes go through the
// user's RLS-scoped client; only the evaluation step uses the service role.
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const form = await req.formData().catch(() => null);
  if (!form) return errorJson("invalid_input", 400);
  const parsed = Fields.safeParse(Object.fromEntries(["occurrence_id", "kind", "text", "mark_done", "idempotency_key", "video_path", "via"].filter((k) => form.get(k) !== null).map((k) => [k, String(form.get(k))])));
  if (!parsed.success) return errorJson("invalid_input", 400);
  const f = parsed.data;

  const { data: occ } = await supabase.from("action_occurrences").select("id, status, plan_items!inner(title)").eq("id", f.occurrence_id).maybeSingle();
  if (!occ) return errorJson("occurrence_not_found", 404); // RLS hides other users' rows

  const admin = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("evidence").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= LIMITS.evidencePerHour) return errorJson("rate_limited", 429);

  let checkIn: unknown = null;
  if (f.mark_done === "true") {
    const { data, error } = await supabase.rpc("record_check_in", { p_occurrence: f.occurrence_id, p_kind: "done", p_idempotency_key: `${f.idempotency_key}:done` });
    if (error) return errorJson(error.message, 409);
    checkIn = data;
  }

  let documentId: string | null = null;
  let contentHash: string;
  let transcript: string | null = null;
  const frames: Uint8Array[] = [];
  if (f.kind === "text") {
    if (!f.text) return errorJson("missing_text", 400);
    contentHash = createHash("sha256").update(`text:${f.text}`).digest("hex");
  } else if (f.kind === "video") {
    // The browser uploaded the clip directly to the user's own folder; verify it exists there.
    const path = f.video_path ?? "";
    if (!path.startsWith(`${user.id}/${f.occurrence_id}/`) || path.includes("..")) return errorJson("invalid_video_path", 400);
    const dir = path.slice(0, path.lastIndexOf("/"));
    const name = path.slice(path.lastIndexOf("/") + 1);
    const { data: listed } = await admin.storage.from("evidence").list(dir, { search: name, limit: 5 });
    const obj = listed?.find((o) => o.name === name);
    const meta = obj?.metadata as { size?: number; mimetype?: string } | undefined;
    const mime = (meta?.mimetype ?? "").split(";")[0];
    if (!obj || !meta?.size || !VIDEO_MIMES.includes(mime)) return errorJson("video_not_found", 400);
    for (const fr of form.getAll("frames").slice(0, 6)) {
      if (!(fr instanceof File)) continue;
      const v = await validateUpload(fr, ["image/jpeg"], 1_500_000);
      if (v.ok) frames.push(v.file.bytes);
    }
    contentHash = createHash("sha256").update(`video:${path}:${meta.size}`).digest("hex");
    const existing = await supabase.from("documents").select("id").eq("bucket", "evidence").eq("storage_path", path).maybeSingle();
    if (existing.data) documentId = existing.data.id;
    else {
      const { data: doc, error } = await supabase.from("documents").insert({ user_id: user.id, bucket: "evidence", storage_path: path, mime_type: mime, size_bytes: meta.size, sha256: contentHash }).select("id").single();
      if (error || !doc) return errorJson("document_insert_failed", 500);
      documentId = doc.id;
    }
  } else {
    const file = form.get("file");
    if (!(file instanceof File)) return errorJson("missing_file", 400);
    const v = await validateUpload(file, ALLOWED[f.kind], f.kind === "audio" ? LIMITS.audioMaxBytes : LIMITS.uploadMaxBytes);
    if (!v.ok) return errorJson(v.error, 400);
    contentHash = v.file.sha256;
    const path = `${user.id}/${f.occurrence_id}/${v.file.sha256.slice(0, 16)}.${v.file.ext}`;
    const up = await supabase.storage.from("evidence").upload(path, v.file.bytes, { contentType: v.file.mime, upsert: false });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) return errorJson("upload_failed", 500);
    const existing = await supabase.from("documents").select("id").eq("bucket", "evidence").eq("storage_path", path).maybeSingle();
    if (existing.data) documentId = existing.data.id;
    else {
      const { data: doc, error } = await supabase.from("documents").insert({ user_id: user.id, bucket: "evidence", storage_path: path, mime_type: v.file.mime, size_bytes: v.file.size, sha256: v.file.sha256 }).select("id").single();
      if (error || !doc) return errorJson("document_insert_failed", 500);
      documentId = doc.id;
    }
    if (f.kind === "audio") {
      const consents = await getConsents(admin, user.id);
      if (consents.voice_processing) {
        const profile = await getProfile(admin, user.id);
        const t = await transcribe(new Blob([v.file.bytes as BlobPart], { type: v.file.mime }), profile.locale);
        if (t.ok) transcript = t.value.transcript;
      }
    }
  }

  const { data: ev, error: evErr } = await supabase
    .from("evidence")
    .insert({ user_id: user.id, occurrence_id: f.occurrence_id, kind: f.kind, document_id: documentId, text_content: f.text ?? null, transcript, content_hash: contentHash, channel: "web" })
    .select("id")
    .single();
  if (evErr) {
    if (evErr.code === "23505") return errorJson("duplicate_evidence", 409); // same evidence already attached
    return errorJson("evidence_insert_failed", 500);
  }
  const evaluation = await evaluateEvidence(admin, user.id, ev.id, { frames });

  // Proof shared from the chat shows up in the conversation, like a WhatsApp exchange.
  if (f.via === "chat") {
    const t = await getTranslations();
    const title = (occ.plan_items as unknown as { title: string }).title;
    const ref = [{ type: "occurrence", id: f.occurrence_id, label: title }];
    const userText = f.kind === "text" ? f.text! : `${t(`chatUi.sent_${f.kind}`, { title })}${f.text ? `\n${f.text}` : ""}`;
    const points = ((checkIn as { rewards?: { points: number }[] } | null)?.rewards ?? []).reduce((a, r) => a + r.points, 0);
    const reply = [
      f.mark_done === "true" ? t("chatUi.markedDone", { title }) : null,
      evaluation.outcome !== "not_applicable" ? `**${t(`action.outcome_${evaluation.outcome}`)}** — ${evaluation.explanation}` : t("chatUi.savedNote"),
      points > 0 ? t("today.pointsEarned", { points }) : null,
    ].filter(Boolean).join("\n\n");
    // Two statements so the timestamps keep the order (one statement shares now()).
    await admin.from("messages").insert({ user_id: user.id, role: "user", channel: "web", content: userText.slice(0, 8000), source_refs: [{ type: "evidence", id: ev.id, label: f.kind }, ...ref] as never });
    await admin.from("messages").insert({ user_id: user.id, role: "assistant", channel: "web", content: reply.slice(0, 8000), source_refs: ref as never });
  }
  return json({ evidence_id: ev.id, check_in: checkIn, evaluation });
}
