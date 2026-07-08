import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { unauthorized, forbidden, notFound } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { ZipArchive } from "archiver";

export const dynamic = "force-dynamic";

// GET /api/clients/[id]/export — download a ZIP archive containing all client data.
//
// The archive includes:
//   client.json       — client record + all authorizations
//   locations.json    — all locations linked to this client
//   reviews.json      — all reviews for client's locations
//   posts.json        — all posts for client's locations
//   photos.json       — all business photo metadata for client's locations
//   analytics.csv     — daily analytics aggregated across all client locations
//   audit-logs.json   — last 1000 audit log entries for client's locations
//
// This endpoint satisfies Google's Third-Party Policy requirement that an
// end-client can receive a full export of their data on termination.
//
// Admin-only (settings.view).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { authorizations: { orderBy: { grantedAt: "desc" } } },
  });
  if (!client) return notFound("Client not found");

  const locations = await db.location.findMany({
    where: { clientId: id },
    orderBy: { city: "asc" },
  });
  const locationIds = locations.map((l) => l.id);

  // Run all data queries in parallel for speed. If the client has no locations
  // yet, the empty-array `in` clause is harmless.
  const [reviews, posts, photos, analytics, auditLogs] = await Promise.all([
    db.review.findMany({
      where: { locationId: { in: locationIds } },
      orderBy: { createdAt: "desc" },
    }),
    db.post.findMany({
      where: { locationId: { in: locationIds } },
      orderBy: { createdAt: "desc" },
    }),
    db.businessPhoto.findMany({
      where: { locationId: { in: locationIds } },
      orderBy: { createdAt: "desc" },
    }),
    db.analyticDaily.findMany({
      where: { locationId: { in: locationIds } },
      orderBy: { date: "asc" },
    }),
    db.auditLog.findMany({
      where: { entityId: { in: locationIds } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);

  // Build the ZIP in memory using archiver. This is more portable across
  // Next.js runtimes than streaming a Node PassThrough into NextResponse.
  // archiver v8 exposes the `ZipArchive` class directly (no factory call).
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finalizePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", (err) => reject(err));
  });

  // Sanitize Dates → ISO strings for stable JSON output.
  const safe = (obj: unknown) => JSON.parse(JSON.stringify(obj, (_k, v) =>
    v instanceof Date ? v.toISOString() : v,
  )) as unknown;

  const clientPayload = {
    ...(safe(client) as Record<string, unknown>),
    authorizations: client.authorizations.map((a) => ({
      ...(safe(a) as Record<string, unknown>),
      // Surface the parsed scope list alongside the raw JSON for convenience.
      scopes: a.authorizedScopes ? safeJsonParse(a.authorizedScopes) : [],
    })),
  };

  archive.append(JSON.stringify(clientPayload, null, 2), { name: "client.json" });
  archive.append(JSON.stringify(safe(locations), null, 2), { name: "locations.json" });
  archive.append(JSON.stringify(safe(reviews), null, 2), { name: "reviews.json" });
  archive.append(JSON.stringify(safe(posts), null, 2), { name: "posts.json" });
  archive.append(JSON.stringify(safe(photos), null, 2), { name: "photos.json" });
  archive.append(JSON.stringify(safe(auditLogs), null, 2), { name: "audit-logs.json" });

  // CSV for analytics — flat tabular format suitable for spreadsheet import.
  const csvHeader = "date,locationId,searchViews,mapsViews,websiteClicks,phoneCalls,directionRequests,bookings\n";
  const csvRows = analytics
    .map((a) =>
      [
        a.date.toISOString().slice(0, 10),
        a.locationId,
        a.searchViews,
        a.mapsViews,
        a.websiteClicks,
        a.phoneCalls,
        a.directionRequests,
        a.bookings,
      ].join(","),
    )
    .join("\n");
  archive.append(csvHeader + csvRows, { name: "analytics.csv" });

  // README summarizing the export
  const readme = [
    `# Client Data Export — ${client.name}`,
    `Client ID: ${client.id}`,
    `Client Code: ${client.clientCode ?? "(none)"}`,
    `Status: ${client.status}`,
    `Exported At: ${new Date().toISOString()}`,
    `Exported By: ${user.name} (${user.email})`,
    ``,
    `## Contents`,
    `- client.json       — client record + authorization history`,
    `- locations.json    — ${locations.length} location(s)`,
    `- reviews.json      — ${reviews.length} review(s)`,
    `- posts.json        — ${posts.length} post(s)`,
    `- photos.json       — ${photos.length} photo(s)`,
    `- analytics.csv     — ${analytics.length} daily analytic row(s)`,
    `- audit-logs.json   — ${auditLogs.length} audit log entry(ies) (most recent 1000)`,
    ``,
    `This export was generated to comply with Google's Third-Party Policy`,
    `requirement that end-clients can receive their data on termination.`,
  ].join("\n");
  archive.append(readme, { name: "README.txt" });

  await archive.finalize();
  const zipBuffer = await finalizePromise;

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "client.export",
    entity: "client",
    entityId: id,
    newValue: {
      locations: locations.length,
      reviews: reviews.length,
      posts: posts.length,
      photos: photos.length,
      analyticsRows: analytics.length,
      auditLogs: auditLogs.length,
      zipBytes: zipBuffer.byteLength,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const filename = `client-${client.clientCode || client.id}-export-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

function safeJsonParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
