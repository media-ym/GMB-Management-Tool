import sharp from "sharp";

/** Longest edge for GMB-friendly uploads (matches common post canvas width). */
const MAX_EDGE = 2120;
/** WebP quality — good visual quality at much smaller bytes than JPEG/PNG. */
const WEBP_QUALITY = 78;

export type OptimizedImage = {
  bytes: Buffer;
  mimeType: "image/webp";
  ext: "webp";
  width: number;
  height: number;
  originalBytes: number;
};

/**
 * Convert raster images to compressed WebP.
 * GIFs are left untouched (animation). Already-small WebPs are still re-encoded
 * when re-encoding yields a smaller (or similar) result.
 */
export async function optimizeImageToWebp(
  input: Buffer,
  mimeType: string,
): Promise<OptimizedImage | null> {
  if (mimeType === "image/gif") return null;

  const pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  let img = pipeline;
  if (width > MAX_EDGE || height > MAX_EDGE) {
    img = img.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const bytes = await img
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  const outMeta = await sharp(bytes).metadata();

  // If somehow larger than original and source was already webp, keep original
  if (mimeType === "image/webp" && bytes.byteLength >= input.byteLength) {
    return null;
  }

  return {
    bytes,
    mimeType: "image/webp",
    ext: "webp",
    width: outMeta.width ?? width,
    height: outMeta.height ?? height,
    originalBytes: input.byteLength,
  };
}

export function webpFileName(originalName: string, fallbackUuid: string): string {
  const base = (originalName || fallbackUuid)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
  return `${base || fallbackUuid}.webp`;
}
