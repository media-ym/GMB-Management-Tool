import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const reportType = url.searchParams.get("type") || undefined;
  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (reportType) where.reportType = reportType;

  const reports = await db.report.findMany({
    where,
    orderBy: { generatedAt: "desc" },
    take: 100,
    include: { location: { select: { name: true, city: true } }, generator: { select: { name: true } } },
  });

  return ok(reports.map((r) => ({
    id: r.id,
    reportType: r.reportType,
    locationId: r.locationId,
    locationName: r.location?.name ?? "All Locations",
    locationCity: r.location?.city ?? "",
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
