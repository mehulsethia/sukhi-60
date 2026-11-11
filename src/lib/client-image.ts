// Browser-side image preparation for uploads.
// Plan documents go to a vision model that reads up to 2576px on the long edge, so we keep
// that much detail (handwriting needs it) and only re-encode to stay under the ~4 MB route limit.
const MAX_BYTES = 3_800_000;

async function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
}

/**
 * Downscale (max `maxEdge` px) and optionally rotate a photo, returning a JPEG.
 * EXIF orientation is applied by createImageBitmap; `rotate` fixes photos that are
 * genuinely sideways (e.g. WhatsApp forwards, which strip EXIF).
 */
export async function prepareImage(file: File, opts: { maxEdge?: number; rotate?: 0 | 90 | 180 | 270; force?: boolean } = {}): Promise<File> {
  const { maxEdge = 2576, rotate = 0, force = false } = opts;
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (!force && rotate === 0 && scale === 1 && file.size <= MAX_BYTES) return file;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const swap = rotate === 90 || rotate === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
    let blob: Blob | null = null;
    for (const q of [0.92, 0.85, 0.75, 0.65]) {
      blob = await encode(canvas, q);
      if (blob && blob.size <= MAX_BYTES) break;
    }
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Evidence photos don't need document-grade detail: keep them small. */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  return prepareImage(file, { maxEdge: 1600, force: true });
}

/** Replace the file in an <input type="file"> with a prepared copy (keeps native form posts small). */
export async function shrinkInputFile(input: HTMLInputElement, opts: { maxEdge?: number; rotate?: 0 | 90 | 180 | 270 } = {}) {
  const f = input.files?.[0];
  if (!f) return;
  const small = await prepareImage(f, opts);
  if (small === f) return;
  const dt = new DataTransfer();
  dt.items.add(small);
  input.files = dt.files;
}
