import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  uploadGooglePhoto,
  getValidAccessToken,
  googleServiceStatus,
  type GooglePhotoCategory,
} from "@/lib/google-service";
import { requireClientAuth } from "@/lib/client-auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// ─── GET /api/media — list media library entries (optionally scoped) ──────
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "media.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };

  const media = await db.mediaLibrary.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { location: { select: { name: true, city: true } } },
  });

  return ok(media.map((m) => ({
    id: m.id,
    locationId: m.locationId,
    locationName: m.location?.name ?? "—",
    locationCity: m.location?.city ?? "",
    fileName: m.fileName,
    bucket: m.bucket,
    fileUrl: m.fileUrl,
    mimeType: m.mimeType,
    fileSize: m.fileSize,
    aiGenerated: m.aiGenerated,
    createdAt: m.createdAt.toISOString(),
  })));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "media");
const PUBLIC_BASE = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — Google's photo limit

const VALID_CATEGORIES = new Set<GooglePhotoCategory>([
  "COVER", "PROFILE", "INTERIOR", "EXTERIOR", "PRODUCT", "TEAM",
  "FOOD_AND_DRINK", "MENU", "AT_WORK", "COMMON_AREA", "ROOMS", "LANDSCAPE",
]);

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
//   1. Persist file to /public/uploads/media/<uuid>.<ext>
//   2. Create a MediaLibrary record (always)
//   3. If publishToGoogle && linked GBP found:
//      a. requireClientAuth(locationId, "media.upload")
//      b. Get valid access token
//      c. Call uploadGooglePhoto() with the public sourceUrl
//      d. On success: create a BusinessPhoto row with the returned googlePhotoId
//      e. On failure: log audit, keep local upload (best-effort)
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
  const category: GooglePhotoCategory | undefined = rawCategory && VALID_CATEGORIES.has(rawCategory as GooglePhotoCategory)
    ? (rawCategory as GooglePhotoCategory)
    : undefined;
  const publishToGoogle = String(formData.get("publishToGoogle") || "false").toLowerCase() === "true";

  // ─── 1. Persist file to local storage ─────────────────────────────────
  const fileUuid = randomUUID();
  const ext = extForMime(file.type);
  const fileName = `${fileUuid}.${ext}`;
  const absPath = join(UPLOAD_DIR, fileName);
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(absPath, bytes);
  } catch (e: any) {
    return fail(`Failed to save file locally: ${e.message}`, 500);
  }

  // Public URL — Google must be able to fetch this when publishToGoogle=true.
  const fileUrl = `${PUBLIC_BASE}/uploads/media/${fileName}`;

  // ─── 2. Create MediaLibrary record (always) ──────────────────────────
  const media = await db.mediaLibrary.create({
    data: {
      locationId,
      fileName: file.name || fileName,
      bucket: "business-photos",
      fileUrl,
      mimeType: file.type,
      fileSize: file.size,
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
      googleError = "Google integration is not configured — photo saved locally only.";
    } else {
      // End-client authorization gate — must hold "media.upload" scope before
      // we publish anything to the client's Google Business Profile.
      const authCheck = await requireClientAuth(locationId, "media.upload");
      if (!authCheck.ok) {
        // Authorization revoked — surface 403 but the local upload already
        // succeeded; do NOT silently keep going. The user sees the 403 and
        // knows the photo was not pushed to Google.
        await logAudit({
          userId: user.id, userName: user.name,
          action: "media.upload.google_blocked",
          entity: "media", entityId: media.id,
          newValue: { locationId, fileName, reason: "client authorization missing media.upload scope" },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        });
        return authCheck.response;
      }

      const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
      if (!gbp) {
        googleError = "No Google Business Profile linked to this location — photo saved locally only.";
      } else {
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
          googleError = "Google access token unavailable — photo saved locally only. Please reconnect Google OAuth.";
        } else {
          try {
            const result = await uploadGooglePhoto(accessToken, gbp.googleLocationId, {
              sourceUrl: fileUrl,
              description,
              category,
            });
            googlePhotoId = result.name;
            googleUrl = result.googleUrl ?? null;
            googleSynced = true;

            // Mirror the published photo into BusinessPhoto so it shows up in
            // location.photos alongside Google-synced photos. Use source="google"
            // so the UI can distinguish "published to Google" photos from
            // local-only uploads.
            await db.businessPhoto.create({
              data: {
                locationId,
                googlePhotoId,
                imageUrl: googleUrl || fileUrl,
                thumbnailUrl: null,
                uploadedBy: user.id,
                source: "google",
                status: "active",
              },
            });
          } catch (e: any) {
            googleError = e.message || "Unknown Google upload error";
            await logAudit({
              userId: user.id, userName: user.name,
              action: "media.upload.google_failed",
              entity: "media", entityId: media.id,
              newValue: { locationId, fileName, error: googleError },
              ip: req.headers.get("x-forwarded-for") ?? undefined,
              status: "failed",
            });
          }
        }
      }
    }
  }

  await logAudit({
    userId: user.id, userName: user.name,
    action: googleSynced ? "media.upload.google" : "media.upload",
    entity: "media", entityId: media.id,
    newValue: {
      locationId, fileName: media.fileName, fileUrl,
      publishToGoogle, googlePhotoId, googleError,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message = googleSynced
    ? "Photo uploaded and published to Google Business Profile."
    : googleError
      ? `Photo saved locally. Google publish skipped: ${googleError}`
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
