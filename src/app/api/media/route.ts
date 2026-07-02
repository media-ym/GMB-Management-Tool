import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

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
