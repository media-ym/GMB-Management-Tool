import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  uploadGooglePhoto,
  getValidAccessToken,
  googleServiceStatus,
  resolveV4LocationName,
} from "@/lib/google-service";
import { normalizePhotoCategory } from "@/lib/media-categories";
import { requireClientAuth } from "@/lib/client-auth";
import { createBusinessPhotoRecord } from "@/lib/business-photo-db";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";
import { getRequestOrigin, normalizeMediaFileUrl } from "@/lib/media-url";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  isSupabaseStorageConfigured,
  uploadMediaFile,
  MEDIA_BUCKET,
} from "@/lib/supabase/storage";
import { optimizeImageToWebp, webpFileName } from "@/lib/image-optimize";

export const dynamic = "force-dynamic";
/** sharp native bindings — keep off Edge runtime */
export const runtime = "nodejs";

// ─── GET /api/media — list media library entries (optionally scoped) ──────
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "media.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const where: Record<string, unknown> = {
    ...buildLocationIdFilter(user, { locationId, locationIds }),
  };

  const media = await db.mediaLibrary.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { location: { select: { name: true, city: true } } },
  });

  const origin = getRequestOrigin(req);

  return ok(media.map((m) => ({
    id: m.id,
    locationId: m.locationId,
    locationName: m.location?.name ?? "—",
    locationCity: m.location?.city ?? "",
    fileName: m.fileName,
    bucket: m.bucket,
    fileUrl: normalizeMediaFileUrl(m.fileUrl, origin),
    mimeType: m.mimeType,
    fileSize: m.fileSize,
    aiGenerated: m.aiGenerated,
    createdAt: m.createdAt.toISOString(),
  })));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "media");

function publicBaseFromRequest(req: NextRequest): string {
  return getRequestOrigin(req);
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — Google's photo limit

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "bin";
  }
}

// ─── POST /api/media — upload (multipart/form-data) ──────────────────────
//
// Form fields:
//   file            — required, the image binary
//   locationId      — required, the location this photo belongs to
//   description     — optional, caption pushed to Google
//   category        — optional, Google locationAssociation category
//   publishToGoogle — optional ("true"/"false"), default false
//
// Flow:
//   1. Persist file to Supabase Storage (business-photos) or local /public/uploads/media
//   2. Create a MediaLibrary record (always)
//   3. If publishToGoogle && linked GBP found:
//      a. requireClientAuth(locationId, "media.upload")
//      b. Get valid access token
//      c. Call uploadGooglePhoto() with the public sourceUrl
//      d. On success: create a BusinessPhoto row with the returned googlePhotoId
//      e. On failure: log audit, keep upload (best-effort)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "media.manage")) return forbidden();

  // ─── Parse multipart form ─────────────────────────────────────────────
  const formData = await req.formData().catch(() => null);
  if (!formData) return fail("Expected multipart/form-data request");

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Missing 'file' field");
  if (!ALLOWED_MIME.has(file.type)) return fail(`Unsupported file type: ${file.type || "unknown"}. Allowed: JPEG, PNG, WebP, GIF.`);
  if (file.size === 0) return fail("File is empty");
  if (file.size > MAX_FILE_BYTES) return fail(`File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`);

  const locationId = String(formData.get("locationId") || "");
  if (!locationId) return fail("locationId is required");

  // Scope check for branch managers
  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  // Confirm location exists before persisting
  const location = await db.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } });
  if (!location) return fail("Location not found", 404);

  const description = formData.get("description") ? String(formData.get("description")) : undefined;
  const rawCategory = formData.get("category") ? String(formData.get("category")) : undefined;
  const category = normalizePhotoCategory(rawCategory);
  const publishToGoogle = String(formData.get("publishToGoogle") || "false").toLowerCase() === "true";

  // ─── 1. Optimize → WebP, then persist (Supabase preferred) ────────────
  const fileUuid = randomUUID();
  const rawBytes = Buffer.from(await file.arrayBuffer());
  let bytes: Buffer = rawBytes;
  let mimeType = file.type;
  let ext = extForMime(file.type);

  try {
    const optimized = await optimizeImageToWebp(rawBytes, file.type);
    if (optimized) {
      bytes = optimized.bytes;
      mimeType = optimized.mimeType;
      ext = optimized.ext;
    }
  } catch (e: any) {
    console.warn("image optimize failed, storing original:", e?.message || e);
  }

  const storageFileName = `${fileUuid}.${ext}`;
  const displayName =
    mimeType === "image/webp"
      ? webpFileName(file.name || storageFileName, fileUuid)
      : file.name || storageFileName;
  let fileUrl: string;
  let storageBucket = MEDIA_BUCKET;

  if (isSupabaseStorageConfigured()) {
    try {
      const storagePath = `${locationId}/${storageFileName}`;
      const uploaded = await uploadMediaFile({
        path: storagePath,
        bytes,
        contentType: mimeType,
        bucket: MEDIA_BUCKET,
      });
      fileUrl = uploaded.publicUrl;
    } catch (e: any) {
      return fail(`Failed to upload to Supabase Storage: ${e.message}`, 500);
    }
  } else {
    const absPath = join(UPLOAD_DIR, storageFileName);
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(absPath, bytes);
    } catch (e: any) {
      return fail(`Failed to save file locally: ${e.message}`, 500);
    }
    fileUrl = `${publicBaseFromRequest(req)}/uploads/media/${storageFileName}`;
    storageBucket = "local";
  }

  // ─── 2. Create MediaLibrary record (always) ──────────────────────────
  const media = await db.mediaLibrary.create({
    data: {
      locationId,
      fileName: displayName,
      bucket: storageBucket,
      fileUrl,
      mimeType,
      fileSize: bytes.byteLength,
      uploadedBy: user.id,
      aiGenerated: false,
    },
  });

  // ─── 3. Best-effort publish to Google Business Profile ───────────────
  let googlePhotoId: string | null = null;
  let googleUrl: string | null = null;
  let googleError: string | null = null;
  let googleSynced = false;

  if (publishToGoogle) {
    if (!googleServiceStatus.isConfigured) {
      googleError = "Google integration is not configured — photo saved to storage only.";
    } else {
      // End-client authorization gate — must hold "media.upload" scope before
      // we publish anything to the client's Google Business Profile.
      const authCheck = await requireClientAuth(locationId, "media.upload");
      if (!authCheck.ok) {
        googleError = "Client authorization required for Google publish — photo saved to storage only.";
        await logAudit({
          userId: user.id, userName: user.name,
          action: "media.upload.google_blocked",
          entity: "media", entityId: media.id,
          newValue: { locationId, fileName: displayName, reason: googleError },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        });
      } else {
      const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
      if (!gbp) {
        googleError = "No Google Business Profile linked to this location — photo saved to storage only.";
      } else {
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
          googleError = "Google access token unavailable — photo saved to storage only. Please reconnect Google OAuth.";
        } else {
          try {
            const v4LocationName = await resolveV4LocationName(accessToken, gbp.googleLocationId);
            const result = await uploadGooglePhoto(accessToken, v4LocationName, {
              sourceUrl: fileUrl,
              description,
              category,
            });
            googlePhotoId = result.name;
            googleUrl = result.googleUrl ?? null;
            googleSynced = true;
          } catch (e: any) {
            googleError = e.message || "Unknown Google upload error";
            await logAudit({
              userId: user.id, userName: user.name,
              action: "media.upload.google_failed",
              entity: "media", entityId: media.id,
              newValue: { locationId, fileName: displayName, category: category ?? null, error: googleError },
              ip: req.headers.get("x-forwarded-for") ?? undefined,
              status: "failed",
            });
          }
        }
      }
      }
    }
  }

  // Mirror into BusinessPhoto so content dashboard + location photos stay in sync.
  await createBusinessPhotoRecord({
    locationId,
    googlePhotoId,
    imageUrl: googleUrl || fileUrl,
    thumbnailUrl: null,
    category: category ?? null,
    uploadedBy: user.id,
    source: googleSynced ? "google" : "manual",
    status: "active",
  });

  await logAudit({
    userId: user.id, userName: user.name,
    action: googleSynced ? "media.upload.google" : "media.upload",
    entity: "media", entityId: media.id,
    newValue: {
      locationId, fileName: media.fileName, fileUrl,
      publishToGoogle, googlePhotoId, googleError, category: category ?? null,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message = googleSynced
    ? "Photo uploaded and published to Google Business Profile."
    : googleError
      ? `Photo saved to storage. Google publish skipped: ${googleError}`
      : "Photo uploaded.";

  return ok({
    id: media.id,
    locationId,
    fileName: media.fileName,
    fileUrl,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    googleSynced,
    googlePhotoId,
    googleUrl,
    googleError,
  }, message);
}
