import { NextRequest } from "next/server";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { runPriorityScan } from "@/lib/priority-scan";
import { parseLocationIdsParam } from "@/lib/location-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/analytics/priority-scan — scan all (or selected) GMB profiles → detailed report */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view") && !can(user.role, "ai.use") && !can(user.role, "dashboard.view")) {
    return forbidden();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requested = parseLocationIdsParam(
      typeof body.locationIds === "string"
        ? body.locationIds
        : Array.isArray(body.locationIds)
          ? body.locationIds.join(",")
          : null,
    );
    const scoped = scopeLocationIds(user);
    let ids: string[] | null = scoped ?? null;
    if (requested.length > 0) {
      ids = scoped ? requested.filter((id) => scoped.includes(id)) : requested;
    }

    const report = await runPriorityScan(ids);
    return ok(report);
  } catch (e: any) {
    return fail(e?.message || "Priority scan failed", 500);
  }
}
