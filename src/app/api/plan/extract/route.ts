import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/config";
import { extractPlanDraft } from "@/server/ai-tasks";
import { validateUpload } from "@/server/files";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 130;

// Upload a plan source (photo/PDF) to private storage and extract DRAFT items with
// provenance. Nothing is scheduled until the user reviews and confirms each item.
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return errorJson("unauthenticated", 401);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorJson("missing_file", 400);
  const v = await validateUpload(file, ["image/jpeg", "image/png", "image/webp", "application/pdf"], LIMITS.uploadMaxBytes);
  if (!v.ok) return errorJson(v.error, 400);
  const path = `${user.id}/${v.file.sha256.slice(0, 24)}.${v.file.ext}`;
  const up = await supabase.storage.from("plan-sources").upload(path, v.file.bytes, { contentType: v.file.mime, upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) return errorJson("upload_failed", 500);
  let docId: string;
  const existing = await supabase.from("documents").select("id").eq("bucket", "plan-sources").eq("storage_path", path).maybeSingle();
  if (existing.data) docId = existing.data.id;
  else {
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({ user_id: user.id, bucket: "plan-sources", storage_path: path, mime_type: v.file.mime, size_bytes: v.file.size, sha256: v.file.sha256, original_name: file.name.slice(0, 200) })
      .select("id")
      .single();
    if (error || !doc) return errorJson("document_insert_failed", 500);
    docId = doc.id;
  }
  const hint = String(form?.get("hint") ?? "").slice(0, 600);
  const r = await extractPlanDraft(createAdminClient(), user.id, docId, { hint });
  if (!r.ok) return json({ document_id: docId, ok: false, error: r.error });
  return json({ document_id: docId, ok: true, drafts: r.drafts, document_kind: r.documentKind, clinician_name: r.clinicianName, warnings: r.warnings, injection: r.injection });
}
