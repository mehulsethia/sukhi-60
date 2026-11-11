/** Downscale photos in the browser (max 1600px JPEG) so uploads stay well under server limits. */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Replace the file in an <input type="file"> with a downscaled copy (keeps native form posts small). */
export async function shrinkInputFile(input: HTMLInputElement) {
  const f = input.files?.[0];
  if (!f) return;
  const small = await shrinkImage(f);
  if (small === f) return;
  const dt = new DataTransfer();
  dt.items.add(small);
  input.files = dt.files;
}
