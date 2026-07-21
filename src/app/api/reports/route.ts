import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const filterLocationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const reportType = url.searchParams.get("type") || undefined;
  const where: Record<string, unknown> = {
    ...buildLocationIdFilter(user, { locationId, locationIds: filterLocationIds }),
  };
  if (reportType) where.reportType = reportType;

  const reports = await db.report.findMany({
    where,
    orderBy: { generatedAt: "desc" },
    take: 100,
    include: { generator: { select: { name: true } } },
  });

  // Report.locationId is a plain String? (no Prisma relation) — fetch the
  // referenced locations in one query and join in JS.
  const locationIds = Array.from(new Set(reports.map((r) => r.locationId).filter(Boolean) as string[]));
  const locations = locationIds.length
    ? await db.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true, city: true } })
    : [];
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  return ok(reports.map((r) => ({
    id: r.id,
    reportType: r.reportType,
    locationId: r.locationId,
    locationName: (r.locationId && locationMap.get(r.locationId)?.name) || "All Locations",
    locationCity: (r.locationId && locationMap.get(r.locationId)?.city) || "",
    reportName: r.reportName,
    fileUrl: r.fileUrl,
    generatedBy: r.generator?.name ?? "System",
    generatedAt: r.generatedAt.toISOString(),
  })));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reports.generate" as any) && !can(user.role, "analytics.view")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { reportType, locationId, reportName } = body;
  if (!reportType) return fail("reportType required");

  const scoped = scopeLocationIds(user, locationId);
  if (locationId && scoped && !scoped.includes(locationId)) return forbidden();

  const loc = locationId ? await db.location.findUnique({ where: { id: locationId } }) : null;
  const name = reportName || `MyFNG ${loc?.city ?? "All"} ${reportType} report — ${new Date().toLocaleDateString("en-IN")}`;

  const report = await db.report.create({
    data: {
      reportType,
      locationId: locationId || null,
      reportName: name,
      fileUrl: `https://myfng.in/reports/${reportType}_${locationId ?? "all"}_${Date.now()}.pdf`,
      generatedBy: user.id,
    },
  });

  await logAudit({
    userId: user.id, userName: user.name, action: "report.generate", entity: "report",
    entityId: report.id, newValue: { reportType, locationId, reportName: name },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ id: report.id, reportName: name }, "Report generated");
}
