import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { isSupabaseStorageConfigured, uploadMediaFile } from "@/lib/supabase/storage";

/** GMB update photo canvas (16:9-ish). */
export const POST_TEMPLATE_WIDTH = 2120;
export const POST_TEMPLATE_HEIGHT = 1192;

export type PostTemplateVariant = "blue" | "white";

const TZ = "Asia/Kolkata";

const BRAND = {
  blueDark: "#0056B3",
  blueLight: "#00AAFF",
  blueDeep: "#003D80",
  white: "#FFFFFF",
  offWhite: "#F4F9FF",
  tagline: "YOUR FRIENDLY NEIGHBOURHOOD GARAGE",
} as const;

function todayKeyIST(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Alternate blue / white by IST calendar day — even days blue, odd days white. */
export function pickPostTemplateVariant(dayKey?: string): PostTemplateVariant {
  const key = dayKey ?? todayKeyIST();
  const n = Number(key.replace(/-/g, ""));
  return n % 2 === 0 ? "blue" : "white";
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHeadline(text: string, maxCharsPerLine = 22, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["MyFNG Service"];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxCharsPerLine ? word.slice(0, maxCharsPerLine - 1) + "…" : word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

function buildBackgroundSvg(
  headlineLines: string[],
  variant: PostTemplateVariant,
  subtitle?: string,
): Buffer {
  const lineHeight = 118;
  const subtitleY = 400;
  const headlineY = subtitle ? 560 : 520;
  const isBlue = variant === "blue";

  const headlineColor = isBlue ? BRAND.white : BRAND.blueDeep;
  const subtitleColor = isBlue ? BRAND.white : BRAND.blueDark;
  const subtitleOpacity = isBlue ? 0.72 : 0.75;
  const taglineColor = BRAND.white;
  const taglineOpacity = isBlue ? 0.85 : 1;
  const circleFill = isBlue ? BRAND.white : BRAND.blueDark;
  const circleOpacity = isBlue ? 0.06 : 0.07;

  const headlineSpans = headlineLines
    .map(
      (line, i) =>
        `<tspan x="120" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line.toUpperCase())}</tspan>`,
    )
    .join("");

  const subtitleBlock = subtitle
    ? `<text x="120" y="${subtitleY}" fill="${subtitleColor}" fill-opacity="${subtitleOpacity}" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="600" letter-spacing="4">${escapeXml(subtitle.toUpperCase())}</text>`
    : "";

  const bgStops = isBlue
    ? `<stop offset="0%" stop-color="${BRAND.blueDeep}"/>
      <stop offset="45%" stop-color="${BRAND.blueDark}"/>
      <stop offset="100%" stop-color="${BRAND.blueLight}"/>`
    : `<stop offset="0%" stop-color="${BRAND.white}"/>
      <stop offset="55%" stop-color="${BRAND.offWhite}"/>
      <stop offset="100%" stop-color="#D6EBFF"/>`;

  const footerOpacity = isBlue ? 0.55 : 1;

  const svg = `<svg width="${POST_TEMPLATE_WIDTH}" height="${POST_TEMPLATE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      ${bgStops}
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND.blueLight}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${BRAND.blueLight}" stop-opacity="${isBlue ? 0.35 : 0.55}"/>
      <stop offset="100%" stop-color="${BRAND.blueLight}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="1850" cy="180" r="320" fill="${circleFill}" fill-opacity="${circleOpacity}"/>
  <circle cx="200" cy="980" r="260" fill="${circleFill}" fill-opacity="${isBlue ? 0.05 : 0.06}"/>
  <rect x="0" y="1020" width="100%" height="172" fill="${BRAND.blueDeep}" fill-opacity="${footerOpacity}"/>
  <rect x="120" y="1000" width="520" height="8" rx="4" fill="url(#accent)"/>
  ${subtitleBlock}
  <text x="120" y="${headlineY}" fill="${headlineColor}" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="800" letter-spacing="1">${headlineSpans}</text>
  <text x="120" y="1100" fill="${taglineColor}" fill-opacity="${taglineOpacity}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" letter-spacing="4">${BRAND.tagline}</text>
</svg>`;

  return Buffer.from(svg);
}

function buildLogoPlateSvg(width: number, height: number, radius: number): Buffer {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" rx="${radius}" fill="${BRAND.white}"/>
</svg>`;
  return Buffer.from(svg);
}

export type PostTemplateImageOpts = {
  headline: string;
  subtitle?: string;
  variant?: PostTemplateVariant;
  logoPath?: string;
};

/**
 * Fixed MY FNG branded card — blue or white background, logo + headline (free, no AI image API).
 */
export async function generatePostTemplateImage(opts: PostTemplateImageOpts): Promise<Buffer> {
  const variant = opts.variant ?? "blue";
  const headlineLines = wrapHeadline(opts.headline);
  const logoPath = opts.logoPath ?? path.join(process.cwd(), "public/myfng-logo-transparent.png");

  const plateW = 560;
  const plateH = 168;
  const plateLeft = 100;
  const plateTop = 52;
  const logoLeft = 120;
  const logoTop = 72;

  const background = sharp(buildBackgroundSvg(headlineLines, variant, opts.subtitle)).png();
  const logo = await sharp(logoPath)
    .resize({ width: 500, height: 130, fit: "inside" })
    .png()
    .toBuffer();

  const layers: sharp.OverlayOptions[] = [];

  if (variant === "blue") {
    const logoPlate = sharp(buildLogoPlateSvg(plateW, plateH, 20)).png();
    layers.push(
      { input: await logoPlate.toBuffer(), top: plateTop, left: plateLeft },
      { input: logo, top: logoTop, left: logoLeft },
    );
  } else {
    layers.push({ input: logo, top: logoTop, left: logoLeft });
  }

  return background.composite(layers).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** Upload generated template bytes and return a public URL for Google publish. */
export async function uploadPostTemplateImage(
  locationId: string,
  bytes: Buffer,
): Promise<string> {
  const fileName = `auto-post-${randomUUID()}.jpg`;

  if (isSupabaseStorageConfigured()) {
    const uploaded = await uploadMediaFile({
      path: `${locationId}/${fileName}`,
      bytes,
      contentType: "image/jpeg",
    });
    return uploaded.publicUrl;
  }

  const dir = path.join(process.cwd(), "public/uploads/media");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), bytes);
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/uploads/media/${fileName}`;
}

export async function createBrandedPostImageUrl(opts: {
  locationId: string;
  headline: string;
  subtitle?: string;
  dayKey?: string;
}): Promise<{ url: string; variant: PostTemplateVariant }> {
  const variant = pickPostTemplateVariant(opts.dayKey);
  const bytes = await generatePostTemplateImage({
    headline: opts.headline,
    subtitle: opts.subtitle,
    variant,
  });
  const url = await uploadPostTemplateImage(opts.locationId, bytes);
  return { url, variant };
}
