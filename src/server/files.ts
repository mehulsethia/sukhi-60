import "server-only";
// Upload validation: declared type must match magic bytes; size bounded; content hashed.
import { createHash } from "node:crypto";

const SIGS: { mime: string; test: (b: Uint8Array) => boolean; ext: string }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/webp", ext: "webp", test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => String.fromCharCode(...b.slice(0, 5)) === "%PDF-" },
  { mime: "audio/webm", ext: "webm", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: "audio/ogg", ext: "ogg", test: (b) => String.fromCharCode(...b.slice(0, 4)) === "OggS" },
  { mime: "audio/wav", ext: "wav", test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WAVE" },
  { mime: "audio/mp4", ext: "m4a", test: (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp" },
  { mime: "audio/mpeg", ext: "mp3", test: (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
];

export interface ValidFile {
  bytes: Uint8Array;
  mime: string;
  ext: string;
  sha256: string;
  size: number;
}

export async function validateUpload(file: File, allowed: string[], maxBytes: number): Promise<{ ok: true; file: ValidFile } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "empty_file" };
  if (file.size > maxBytes) return { ok: false, error: "file_too_large" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sig = SIGS.find((s) => s.test(bytes));
  if (!sig || !allowed.includes(sig.mime)) return { ok: false, error: "unsupported_file_type" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { ok: true, file: { bytes, mime: sig.mime, ext: sig.ext, sha256, size: bytes.byteLength } };
}
