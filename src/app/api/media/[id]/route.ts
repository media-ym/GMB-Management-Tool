import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  deleteGooglePhoto,
  getValidAccessToken,
  googleServiceStatus,
} from "@/lib/google-service";
import { requireClientAuth } from "@/lib/client-auth";
import { unlink } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// ─── DELETE /api/media/[id]?type=media|photo ──────────────────────────────
//
// `type=media` (default): delete a MediaLibrary record (asset uploaded via the
//   POST /api/media route). Best-effort: if a matching BusinessPhoto exists
//   with a googlePhotoId, also delete from Google.
//
// `type=photo`: delete a BusinessPhoto record directly (covers photos that
//   were synced FROM Google via syncLocationFull, which never created a
//   MediaLibrary entry).
//
// In both cases:
//   1. requireClientAuth(locationId, "media.delete") IF the record has a
//      googlePhotoId (i.e. it exists on Google). The gate is skipped for
//      local-only records — no Google-side action means no policy gate.
//   2. Best-effort delete on Google (never blocks the local delete).
//   3. Delete the local DB record(s) + remove the file from disk if owned.
//   4. Audit log with the Google-side outcome.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "media.manage")) return forbidden();

  const { id } = await params;
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "media").toLowerCase();
  if (type !== "media" && type !== "photo") {
    return fail("Invalid 'type' query param — must be 'media' or 'photo'");
  }

  // ─── Load the record ──────────────────────────────────────────────────
  let locationId: string | null = null;
  let googlePhotoId: string | null = null;
  let localFilePath: string | null = null; // absolute path on disk to remove
  let mediaRecord: { id: string; locationId: string | null; fileUrl: string } | null = null;
  let photoRecord: { id: string; locationId: string; googlePhotoId: string | null; imageUrl: string } | null = null;

  if (type === "media") {
    const m = await db.mediaLibrary.findUnique({
      where: { id },
      include: { location: { select: { id: true } } },
    });
    if (!m) return notFound("Media record not found");
    locationId = m.locationId;
    mediaRecord = { id: m.id, locationId: m.locationId, fileUrl: m.fileUrl };

    // Derive local file path from the fileUrl (only when the URL points at our
    // own /uploads/media/... asset — external URLs are left untouched).
    try {
      const u = new URL(m.fileUrl);
      if (u.pathname.startsWith("/uploads/media/")) {
        localFilePath = join(process.cwd(), "public", u.pathname);
      }
    } catch {
      // fileUrl wasn't an absolute URL — skip local file removal
    }

    // Best-effort: locate a BusinessPhoto sharing the same fileUrl so we can
    // also delete from Google if it was published there.
    if (locationId) {
      const bp = await db.businessPhoto.findFirst({
        where: { locationId, imageUrl: m.fileUrl },
        select: { id: true, googlePhotoId: true },
      });
      if (bp) {
        googlePhotoId = bp.googlePhotoId;
        photoRecord = { id: bp.id, locationId, googlePhotoId: bp.googlePhotoId, imageUrl: m.fileUrl };
      }
    }
  } else {
    // type === "photo" — direct BusinessPhoto delete (covers Google-synced
    // photos that never created a MediaLibrary entry).
    const p = await db.businessPhoto.findUnique({
      where: { id },
      include: { location: { select: { id: true } } },
    });
    if (!p) return notFound("Business photo not found");
    locationId = p.locationId;
    googlePhotoId = p.googlePhotoId;
    photoRecord = { id: p.id, locationId: p.locationId, googlePhotoId: p.googlePhotoId, imageUrl: p.imageUrl };
  }

  if (!locationId) return fail("Cannot delete media without an associated location");

  // Scope check for branch managers
  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  // ─── End-client authorization gate ────────────────────────────────────
  // Only enforce when the photo actually exists on Google — deleting a
  // local-only asset is not a Google-side action and needs no policy gate.
  if (googlePhotoId) {
    const authCheck = await requireClientAuth(locationId, "media.delete");
    if (!authCheck.ok) return authCheck.response;
  }

  // ─── Best-effort delete from Google ───────────────────────────────────
  let googleDeleted = false;
  let googleError: string | null = null;

  if (googlePhotoId && googleServiceStatus.isConfigured) {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      googleError = "Google access token unavailable — photo deleted locally only.";
    } else {
      try {
        await deleteGooglePhoto(accessToken, googlePhotoId);
        googleDeleted = true;
      } catch (e: any) {
        googleError = e.message || "Unknown Google delete error";
        await logAudit({
          userId: user.id, userName: user.name,
          action: "media.delete.google_failed",
          entity: type === "media" ? "media" : "businessPhoto",
          entityId: id,
          newValue: { googlePhotoId, error: googleError },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
          status: "failed",
        });
      }
    }
  }

  // ─── Remove local file from disk (best-effort) ────────────────────────
  if (localFilePath) {
    try {
      await unlink(localFilePath);
    } catch {
      // File may already be gone — non-fatal
    }
  }

  // ─── Delete DB records ────────────────────────────────────────────────
  if (mediaRecord) {
    await db.mediaLibrary.delete({ where: { id: mediaRecord.id } }).catch(() => {
      // Already deleted by a concurrent request — non-fatal
    });
  }
  if (photoRecord) {
    await db.businessPhoto.delete({ where: { id: photoRecord.id } }).catch(() => {
      // Already deleted — non-fatal
    });
  }

  await logAudit({
    userId: user.id, userName: user.name,
    action: googleDeleted ? "media.delete.google" : "media.delete",
    entity: type === "media" ? "media" : "businessPhoto",
    entityId: id,
    newValue: {
      locationId, type,
      googlePhotoId, googleDeleted, googleError,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message = googleDeleted
    ? "Photo deleted locally and on Google Business Profile."
    : googleError
      ? `Photo deleted locally — Google delete failed: ${googleError}`
      : "Photo deleted.";

  return ok({ id, type, googleDeleted, googleError }, message);
}
