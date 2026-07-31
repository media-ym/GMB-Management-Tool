import type { SessionUser } from "@/lib/types";

/** Build Prisma `where.locationId` from single id, multiple ids, and branch scope. */
export function buildLocationIdFilter(
  user: SessionUser,
  opts: { locationId?: string | null; locationIds?: string[] | null },
): { locationId?: string | { in: string[] } } {
  const scoped = Array.isArray(user.scopedLocationIds)
    ? user.scopedLocationIds.length > 0
      ? user.scopedLocationIds
      : ["__none__"]
    : user.role === "client_portal"
      ? user.assignedLocationIds?.length
        ? user.assignedLocationIds
        : ["__none__"]
      : user.role === "branch_manager" &&
          user.assignedLocationIds &&
          user.assignedLocationIds.length > 0
        ? user.assignedLocationIds
        : undefined;

  const requested = opts.locationIds?.filter(Boolean)?.length
    ? opts.locationIds!.filter(Boolean)
    : opts.locationId
      ? [opts.locationId]
      : [];

  if (requested.length > 0) {
    const ids = scoped ? requested.filter((id) => scoped.includes(id)) : requested;
    if (ids.length === 0) return { locationId: { in: ["__none__"] } };
    if (ids.length === 1) return { locationId: ids[0] };
    return { locationId: { in: ids } };
  }

  if (scoped) return { locationId: { in: scoped } };
  return {};
}

export function parseLocationIdsParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function appendLocationIdsToParams(
  params: URLSearchParams,
  ids: string[],
): void {
  if (ids.length > 0) params.set("locationIds", ids.join(","));
}

export function parseDaysFilter(raw: string | null): Date | null {
  if (!raw || raw === "all") return null;
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface DateRangeParams {
  from?: string;
  to?: string;
}

/** Parse YYYY-MM-DD as a UTC calendar day (matches AnalyticDaily storage). */
function parseYmdUtc(
  raw: string,
  endOfDay = false,
): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (endOfDay) return new Date(Date.UTC(y, mo - 1, day, 23, 59, 59, 999));
  return new Date(Date.UTC(y, mo - 1, day, 0, 0, 0, 0));
}

/** First day of the calendar month N months before today (local), as YYYY-MM-DD. */
export function calendarMonthsFromIso(monthsBack: number): string {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  return isoLocalDate(from);
}

/** Parse ?days=30 or ?from=YYYY-MM-DD&to=YYYY-MM-DD into a Prisma date range. */
export function parseDateRangeFromSearchParams(
  searchParams: { get: (key: string) => string | null },
): { gte?: Date; lte?: Date } | undefined {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from) {
    const gte = parseYmdUtc(from, false);
    if (!gte) return undefined;
    const range: { gte: Date; lte?: Date } = { gte };
    if (to) {
      const lte = parseYmdUtc(to, true);
      if (lte) range.lte = lte;
    }
    return range;
  }
  const since = parseDaysFilter(searchParams.get("days"));
  return since ? { gte: since } : undefined;
}

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Append duration filter params (?days= or ?from=&to=). Clears prior duration keys. */
export function appendDurationToParams(
  params: URLSearchParams,
  preset: string,
  custom?: DateRangeParams | null,
): void {
  params.delete("days");
  params.delete("from");
  params.delete("to");
  if (preset === "all") return;
  if (preset === "custom") {
    if (custom?.from) params.set("from", custom.from);
    if (custom?.to) params.set("to", custom.to);
    return;
  }
  if (preset === "today") {
    const d = isoLocalDate(new Date());
    params.set("from", d);
    params.set("to", d);
    return;
  }
  if (preset === "yesterday") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const d = isoLocalDate(y);
    params.set("from", d);
    params.set("to", d);
    return;
  }
  // Calendar months (matches GMB Performance month picker, e.g. Feb–Jul)
  if (preset === "6m") {
    params.set("from", calendarMonthsFromIso(5));
    params.set("to", isoLocalDate(new Date()));
    return;
  }
  params.set("days", preset);
}

export interface NpsBreakdown {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
}

/** Standard GMB NPS from 1–5 stars: 5=promoter, 4=passive, 1–3=detractor. */
export function computeNps(
  distribution: { rating: number; count: number }[],
  total: number,
): NpsBreakdown {
  const promoters = distribution.find((d) => d.rating === 5)?.count ?? 0;
  const passives = distribution.find((d) => d.rating === 4)?.count ?? 0;
  const detractors = distribution
    .filter((d) => d.rating <= 3)
    .reduce((s, d) => s + d.count, 0);
  const promoterPct = total > 0 ? Math.round((promoters / total) * 1000) / 10 : 0;
  const passivePct = total > 0 ? Math.round((passives / total) * 1000) / 10 : 0;
  const detractorPct = total > 0 ? Math.round((detractors / total) * 1000) / 10 : 0;
  const score = total > 0 ? Math.round((promoterPct - detractorPct) * 100) / 100 : 0;
  return {
    score,
    promoters,
    passives,
    detractors,
    promoterPct,
    passivePct,
    detractorPct,
  };
}
