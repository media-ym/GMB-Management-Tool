import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { parseLocationIdsParam, buildLocationIdFilter } from "@/lib/location-filter";

export const dynamic = "force-dynamic";

function postFileName(title: string, content: string, googlePostId: string | null): string {
  const base = title.trim() || content.trim().slice(0, 60) || "Google Post";
  const suffix = googlePostId?.split("/").pop()?.slice(0, 8) ?? "";
  const name = base.replace(/[^\w\s.-]/g, " ").replace(/\s+/g, " ").trim();
  return `${name.slice(0, 72)}${suffix ? ` (${suffix})` : ""}.jpg`;
}

/** POST /api/media/sync-from-google — import MediaLibrary entries from Google posts & photos already in DB */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "media.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const locationIds = Array.isArray(body.locationIds)
    ? (body.locationIds as string[])
    : parseLocationIdsParam(body.locationIds ?? null);

  const locationFilter = buildLocationIdFilter(user, {
    locationIds: locationIds.length > 0 ? locationIds : undefined,
  });

  let created = 0;
  let skipped = 0;

  const posts = await db.post.findMany({
    where: {
      ...locationFilter,
      status: "published",
      imageUrl: { not: null },
    },
    select: {
      id: true,
      locationId: true,
      imageUrl: true,
      title: true,
      content: true,
      googlePostId: true,
    },
  });

  for (const post of posts) {
    if (!post.imageUrl || !post.locationId) {
      skipped++;
      continue;
    }
    const exists = await db.mediaLibrary.findFirst({
      where: { locationId: post.locationId, fileUrl: post.imageUrl },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await db.mediaLibrary.create({
      data: {
        locationId: post.locationId,
        fileName: postFileName(post.title, post.content, post.googlePostId),
        bucket: "post-images",
        fileUrl: post.imageUrl,
        mimeType: "image/jpeg",
        fileSize: 0,
        uploadedBy: user.id,
        aiGenerated: false,
      },
    });
    created++;
  }

  const photos = await db.businessPhoto.findMany({
    where: locationFilter,
    select: {
      id: true,
      locationId: true,
      imageUrl: true,
      category: true,
      googlePhotoId: true,
    },
  });

  for (const photo of photos) {
    if (!photo.imageUrl) {
      skipped++;
      continue;
    }
    const exists = await db.mediaLibrary.findFirst({
      where: { locationId: photo.locationId, fileUrl: photo.imageUrl },
    });
    if (exists) {
      skipped++;
      continue;
    }
    const cat = (photo.category ?? "photo").toLowerCase();
    await db.mediaLibrary.create({
      data: {
        locationId: photo.locationId,
        fileName: `${cat}-${photo.googlePhotoId?.split("/").pop()?.slice(0, 12) ?? photo.id.slice(0, 8)}.jpg`,
        bucket: "business-photos",
        fileUrl: photo.imageUrl,
        mimeType: "image/jpeg",
        fileSize: 0,
        uploadedBy: user.id,
        aiGenerated: false,
      },
    });
    created++;
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "media.sync_from_google",
    entity: "media",
    newValue: { created, skipped, posts: posts.length, photos: photos.length },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    { created, skipped, fromPosts: posts.length, fromPhotos: photos.length },
    created > 0
      ? `Imported ${created} image(s) from Google into Media Library`
      : "No new images to import — library is already up to date",
  );
}
