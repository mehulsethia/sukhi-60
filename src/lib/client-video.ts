// Browser-side helpers for video proof: read duration, grab evenly spaced JPEG frames for
// the AI review, and upload the clip straight to private storage (bypassing route limits).
import { createClient } from "@/lib/supabase/browser";

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) return resolve(v);
      // Clips straight from MediaRecorder (webm) carry no duration until the end is reached.
      v.ondurationchange = () => {
        if (!Number.isFinite(v.duration)) return;
        v.ondurationchange = null;
        v.currentTime = 0;
        resolve(v);
      };
      v.currentTime = 1e7;
      setTimeout(() => { v.ondurationchange = null; resolve(v); }, 4000); // give up: frames from the start
    };
    v.onerror = () => reject(new Error("video_unreadable"));
  });
}

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    const done = () => { v.removeEventListener("seeked", done); resolve(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

/** Duration in seconds and up to `count` frames (JPEG, max 1024px) spread across the clip. */
export async function videoFrames(file: File, count = 4): Promise<{ duration: number; frames: Blob[] }> {
  const v = await loadVideo(file);
  const duration = Number.isFinite(v.duration) ? v.duration : 0;
  const scale = Math.min(1, 1024 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((v.videoWidth || 640) * scale));
  canvas.height = Math.max(1, Math.round((v.videoHeight || 480) * scale));
  const ctx = canvas.getContext("2d")!;
  const frames: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration ? Math.min(duration - 0.05, (duration * (i + 0.5)) / count) : 0;
    try {
      await seek(v, Math.max(0, t));
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
      if (b) frames.push(b);
    } catch { /* skip unreadable frame */ }
  }
  URL.revokeObjectURL(v.src);
  return { duration, frames };
}

const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/** Delete one of the user's own uploads (owner delete policy on the evidence bucket). */
export async function removeUpload(path: string) {
  try { await createClient().storage.from("evidence").remove([path]); } catch { /* the hourly sweep cleans up */ }
}

/** Upload to evidence/<user>/<occurrence>/<uuid>.<ext>; returns the storage path. */
export async function uploadVideo(file: File, occurrenceId: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthenticated");
  const mime = file.type.split(";")[0] || "video/mp4";
  const path = `${data.user.id}/${occurrenceId}/${crypto.randomUUID()}.${EXT[mime] ?? "mp4"}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file, { contentType: mime, upsert: false });
  if (error) throw new Error("upload_failed");
  return path;
}
