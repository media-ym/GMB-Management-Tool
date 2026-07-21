import type { DateRangeParams } from "@/lib/location-filter";

export type AnalyticsDateRangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "thisMonth"
  | "lastMonth"
  | "custom";

/** Matches GMB Performance month picker better than rolling 30d */
export const DEFAULT_ANALYTICS_DATE_RANGE: AnalyticsDateRangeKey = "6m";

export const ANALYTICS_DATE_RANGE_OPTIONS: {
  value: Exclude<AnalyticsDateRangeKey, "custom">;
  label: string;
}[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "6m", label: "Past 6 Months" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
];

/** Local calendar YYYY-MM-DD (avoid UTC day-shift from toISOString). */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatCustomLabel(range?: DateRangeParams | null): string {
  if (!range?.from) return "Custom range";
  if (!range.to) return `${range.from} - now`;
  return `${range.from} - ${range.to}`;
}

/** Human-readable label for analytics date presets. */
export function getAnalyticsDateRangeLabel(
  key: AnalyticsDateRangeKey,
  customRange?: DateRangeParams | null,
): string {
  if (key === "custom") return formatCustomLabel(customRange);
  return ANALYTICS_DATE_RANGE_OPTIONS.find((o) => o.value === key)?.label ?? "Last 30 Days";
}

/** Approximate day count for charts that still use a numeric days hint. */
export function analyticsDateRangeToDays(
  key: AnalyticsDateRangeKey,
  customRange?: DateRangeParams | null,
): number {
  const now = new Date();
  switch (key) {
    case "today":
    case "yesterday":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "6m":
      return 180;
    case "thisMonth":
      return Math.max(1, now.getDate());
    case "lastMonth":
      return new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    case "custom": {
      if (!customRange?.from) return 30;
      const from = new Date(customRange.from);
      const to = customRange.to ? new Date(customRange.to) : now;
      const diff = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      return Math.max(1, Math.min(365, diff));
    }
  }
}

/** Append ?days= or ?from=&to= for API routes using parseDateRangeFromSearchParams. */
export function appendAnalyticsDateRangeToParams(
  params: URLSearchParams,
  key: AnalyticsDateRangeKey,
  customRange?: DateRangeParams | null,
): void {
  params.delete("days");
  params.delete("from");
  params.delete("to");

  const now = new Date();
  switch (key) {
    case "today": {
      const d = isoDate(startOfDay(now));
      params.set("from", d);
      params.set("to", d);
      return;
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = isoDate(startOfDay(y));
      params.set("from", d);
      params.set("to", d);
      return;
    }
    case "7d":
      params.set("days", "7");
      return;
    case "30d":
      params.set("days", "30");
      return;
    case "90d":
      params.set("days", "90");
      return;
    case "6m": {
      // Calendar months (e.g. Feb 1 → today) — matches GMB Performance month picker
      params.set("from", isoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
      params.set("to", isoDate(now));
      return;
    }
    case "thisMonth":
      params.set("from", isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      return;
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      params.set("from", isoDate(start));
      params.set("to", isoDate(end));
      return;
    }
    case "custom":
      if (customRange?.from) params.set("from", customRange.from);
      if (customRange?.to) params.set("to", customRange.to);
      return;
  }
}

export function analyticsDateRangeToCustomRange(
  key: AnalyticsDateRangeKey,
  customRange?: DateRangeParams | null,
): DateRangeParams | null {
  if (key === "custom") return customRange ?? null;
  const params = new URLSearchParams();
  appendAnalyticsDateRangeToParams(params, key);
  const from = params.get("from");
  const to = params.get("to");
  if (from) return { from, to: to ?? undefined };
  return null;
}
