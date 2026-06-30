"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useLocations } from "@/hooks/use-locations";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, Search, Map, MousePointerClick, Phone, Navigation,
  Filter, Calendar, ChevronDown, ChevronUp, ArrowUpDown, Inbox, Building2,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList,
} from "recharts";
import { cn } from "@/lib/utils";
import type { AnalyticsPoint } from "@/lib/types";

// ---- Types --------------------------------------------------------------

interface AnalyticsTotals {
  searchViews: number;
  mapsViews: number;
  websiteClicks: number;
  phoneCalls: number;
  directionRequests: number;
}

interface PerLocationRow {
  locationId: string;
  name: string;
  city: string;
  totals: AnalyticsTotals;
}

interface AnalyticsResponse {
  series: AnalyticsPoint[];
  perLocation: PerLocationRow[];
  totals: AnalyticsTotals;
}

type MetricKey = keyof AnalyticsTotals;
type SortKey = MetricKey | "name" | "total";

// ---- Helpers ------------------------------------------------------------

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${n}`;

const METRIC_COLORS: Record<MetricKey, string> = {
  searchViews: "var(--chart-1)",      // emerald
  mapsViews: "var(--chart-2)",        // amber
  websiteClicks: "var(--chart-3)",    // teal
  phoneCalls: "var(--chart-4)",       // rose
  directionRequests: "var(--chart-5)",// cyan
};

const METRIC_HEX: Record<MetricKey, string> = {
  searchViews: "#10b981",
  mapsViews: "#f59e0b",
  websiteClicks: "#14b8a6",
  phoneCalls: "#f43f5e",
  directionRequests: "#06b6d4",
};

/** % change of second half of series vs first half. */
function computeDelta(series: AnalyticsPoint[], key: MetricKey): number | undefined {
  if (series.length < 4) return undefined;
  const mid = Math.floor(series.length / 2);
  const first = series.slice(0, mid).reduce((s, p) => s + p[key], 0);
  const second = series.slice(mid).reduce((s, p) => s + p[key], 0);
  if (first === 0) return undefined;
  return Math.round(((second - first) / first) * 100);
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

const tooltipLabelStyle = { color: "var(--foreground)" } as const;

// ---- Main view ----------------------------------------------------------

export function AnalyticsView() {
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const { data: locations } = useLocations();

  const [days, setDays] = useState<number>(30);
  const [tableOpen, setTableOpen] = useState<boolean>(true);
  const [sortKey, setSortKey] = useState<SortKey>("searchViews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Build query URL — relative only.
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (activeLocationId && activeLocationId !== "all") {
      params.set("locationId", activeLocationId);
    }
    return `/api/analytics?${params.toString()}`;
  }, [activeLocationId, days]);

  const { data, isLoading, isError } = useQuery<AnalyticsResponse>({
    queryKey: ["analytics", activeLocationId, days],
    queryFn: () => api<AnalyticsResponse>(queryUrl),
    staleTime: 30_000,
  });

  const series = data?.series ?? [];
  const totals = data?.totals;
  const perLocation = data?.perLocation ?? [];

  // Chart data transforms (memoized)
  const trendData = useMemo(
    () =>
      series.map((p) => ({
        date: new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        search: p.searchViews,
        maps: p.mapsViews,
      })),
    [series],
  );

  const engagementData = useMemo(
    () =>
      totals
        ? [
            { name: "Website Clicks", value: totals.websiteClicks, key: "websiteClicks" as MetricKey },
            { name: "Phone Calls", value: totals.phoneCalls, key: "phoneCalls" as MetricKey },
            { name: "Directions", value: totals.directionRequests, key: "directionRequests" as MetricKey },
          ].filter((d) => d.value > 0)
        : [],
    [totals],
  );

  const locationBars = useMemo(() => {
    const rows = [...perLocation]
      .map((p) => ({
        city: p.city || p.name || p.locationId,
        name: p.name,
        searchViews: p.totals.searchViews,
        mapsViews: p.totals.mapsViews,
        websiteClicks: p.totals.websiteClicks,
        phoneCalls: p.totals.phoneCalls,
        directionRequests: p.totals.directionRequests,
        total:
          p.totals.searchViews + p.totals.mapsViews + p.totals.websiteClicks +
          p.totals.phoneCalls + p.totals.directionRequests,
      }))
      .sort((a, b) => b.searchViews - a.searchViews)
      .slice(0, 10);
    return rows;
  }, [perLocation]);

  // Sorted table rows
  const tableRows = useMemo(() => {
    const rows = locationBars.map((r) => r);
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "total") cmp = a.total - b.total;
      else cmp = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [locationBars, sortKey, sortDir]);

  const hasData = series.length > 0 || perLocation.length > 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Analytics"
        description="Google Business Profile performance across all locations"
        icon={BarChart3}
        actions={
          <>
            <Select value={activeLocationId} onValueChange={(v) => setActiveLocationId(v as string | "all")}>
              <SelectTrigger size="sm" className="w-[180px] sm:w-[220px]">
                <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {l.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger size="sm" className="w-[130px]">
                <Calendar className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {isLoading || !totals ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Search Views"
              value={fmt(totals.searchViews)}
              icon={Search}
              accent="emerald"
              hint={`Last ${days} days`}
              delta={computeDelta(series, "searchViews")}
              deltaLabel="vs prior half"
            />
            <StatCard
              label="Maps Views"
              value={fmt(totals.mapsViews)}
              icon={Map}
              accent="amber"
              hint={`Last ${days} days`}
              delta={computeDelta(series, "mapsViews")}
              deltaLabel="vs prior half"
            />
            <StatCard
              label="Website Clicks"
              value={fmt(totals.websiteClicks)}
              icon={MousePointerClick}
              accent="teal"
              hint={`Last ${days} days`}
              delta={computeDelta(series, "websiteClicks")}
              deltaLabel="vs prior half"
            />
            <StatCard
              label="Phone Calls"
              value={fmt(totals.phoneCalls)}
              icon={Phone}
              accent="rose"
              hint={`Last ${days} days`}
              delta={computeDelta(series, "phoneCalls")}
              deltaLabel="vs prior half"
            />
            <StatCard
              label="Direction Requests"
              value={fmt(totals.directionRequests)}
              icon={Navigation}
              accent="emerald"
              hint={`Last ${days} days`}
              delta={computeDelta(series, "directionRequests")}
              deltaLabel="vs prior half"
            />
          </>
        )}
      </div>

      {isError ? (
        <EmptyState
          title="Couldn't load analytics"
          description="There was a problem fetching Google Business Profile metrics. Try a different location or date range."
        />
      ) : !hasData && !isLoading ? (
        <EmptyState
          title="No analytics data"
          description={`No Google Business Profile metrics recorded for the last ${days} days for this selection.`}
        />
      ) : (
        <>
          {/* Main trend + engagement pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardSection
              title="Search & Maps Views Trend"
              description={`Daily totals across ${activeLocationId === "all" ? "all locations" : "selected location"}`}
              className="lg:col-span-2"
              action={<Badge variant="outline" className="text-xs">{days}d</Badge>}
            >
              <div className="h-[280px]">
                {isLoading || trendData.length === 0 ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="aSearch" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={METRIC_COLORS.searchViews} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={METRIC_COLORS.searchViews} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="aMaps" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={METRIC_COLORS.mapsViews} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={METRIC_COLORS.mapsViews} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="search" name="Search Views" stroke={METRIC_COLORS.searchViews} strokeWidth={2} fill="url(#aSearch)" />
                      <Area type="monotone" dataKey="maps" name="Maps Views" stroke={METRIC_COLORS.mapsViews} strokeWidth={2} fill="url(#aMaps)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardSection>

            <CardSection
              title="Engagement Breakdown"
              description="Clicks · Calls · Directions"
            >
              <div className="h-[240px]">
                {isLoading || engagementData.length === 0 ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={engagementData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {engagementData.map((d) => (
                          <Cell key={d.key} fill={METRIC_COLORS[d.key]} />
                        ))}
                        <LabelList
                          dataKey="value"
                          position="outside"
                          formatter={(v: number) => fmt(v)}
                          style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        />
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardSection>
          </div>

          {/* Per-location comparison + Conversion funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardSection
              title="Top Locations by Search Views"
              description="Top 10 by visibility over the selected period"
              className="lg:col-span-2"
              action={<Badge variant="outline" className="text-xs">Top {Math.min(10, locationBars.length)}</Badge>}
            >
              <div className="h-[300px]">
                {isLoading || locationBars.length === 0 ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={locationBars}
                      layout="vertical"
                      margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                      barCategoryGap={8}
                    >
                      <defs>
                        <linearGradient id="gLocation" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={METRIC_HEX.searchViews} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={METRIC_HEX.searchViews} stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} />
                      <YAxis
                        type="category"
                        dataKey="city"
                        tick={{ fontSize: 11 }}
                        stroke="var(--muted-foreground)"
                        width={88}
                        interval={0}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        formatter={(v: number) => [fmt(v), "Search Views"]}
                      />
                      <Bar dataKey="searchViews" name="Search Views" fill="url(#gLocation)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        <LabelList
                          dataKey="searchViews"
                          position="right"
                          formatter={(v: number) => fmt(v)}
                          style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardSection>

            <CardSection
              title="Conversion Funnel"
              description="Discovery → Engagement drop-off"
            >
              {isLoading || !totals ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <Funnel totals={totals} />
              )}
            </CardSection>
          </div>

          {/* Collapsible per-location data table */}
          <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b cursor-pointer hover:bg-accent/30 transition">
                  <div>
                    <h3 className="text-sm font-semibold">Per-location Breakdown</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {perLocation.length} location{perLocation.length !== 1 ? "s" : ""} · click to {tableOpen ? "collapse" : "expand"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    {tableOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    {tableOpen ? "Hide" : "Show"}
                  </Button>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 sm:p-5">
                  {isLoading ? (
                    <Skeleton className="h-72 w-full" />
                  ) : perLocation.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">No location-level data for this selection.</div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto scroll-area rounded-md">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <SortableHead label="Location" sortKey="name" current={sortKey} dir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Search" sortKey="searchViews" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                            <SortableHead label="Maps" sortKey="mapsViews" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                            <SortableHead label="Clicks" sortKey="websiteClicks" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                            <SortableHead label="Calls" sortKey="phoneCalls" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                            <SortableHead label="Directions" sortKey="directionRequests" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                            <SortableHead label="Total" sortKey="total" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableRows.map((row) => (
                            <TableRow key={row.city + row.name}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Building2 className="size-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate max-w-[180px]">{row.name}</div>
                                    <div className="text-[10px] text-muted-foreground">{row.city}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.searchViews)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.mapsViews)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.websiteClicks)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.phoneCalls)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.directionRequests)}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{fmt(row.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      )}
    </div>
  );
}

// ---- Sub-components -----------------------------------------------------

function SortableHead({
  label, sortKey, current, dir, onSort, align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium hover:text-foreground transition",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-60" />
        )}
      </button>
    </TableHead>
  );
}

function Funnel({ totals }: { totals: AnalyticsTotals }) {
  const steps = [
    { label: "Search Views", value: totals.searchViews, key: "searchViews" as MetricKey, icon: Search },
    { label: "Maps Views", value: totals.mapsViews, key: "mapsViews" as MetricKey, icon: Map },
    { label: "Website Clicks", value: totals.websiteClicks, key: "websiteClicks" as MetricKey, icon: MousePointerClick },
    { label: "Phone Calls", value: totals.phoneCalls, key: "phoneCalls" as MetricKey, icon: Phone },
    { label: "Directions", value: totals.directionRequests, key: "directionRequests" as MetricKey, icon: Navigation },
  ];
  const max = steps[0]?.value || 1;
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const widthPct = Math.max(2, Math.round((s.value / max) * 100));
        const convPct = i === 0 ? 100 : Math.round((s.value / (steps[i - 1].value || 1)) * 100);
        return (
          <div key={s.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium flex items-center gap-1.5">
                <s.icon className="size-3.5" style={{ color: METRIC_COLORS[s.key] }} />
                {s.label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                <span className="text-foreground font-semibold">{fmt(s.value)}</span>
                {i > 0 && <span className="ml-1.5 text-[10px]">({convPct}%)</span>}
              </span>
            </div>
            <div className="h-6 rounded-md bg-muted overflow-hidden">
              <div
                className="h-full rounded-md transition-all flex items-center justify-end pr-2 text-[10px] font-semibold text-white"
                style={{ width: `${widthPct}%`, backgroundColor: METRIC_HEX[s.key] }}
              >
                {widthPct >= 8 ? `${widthPct}%` : ""}
              </div>
            </div>
          </div>
        );
      })}
      <div className="pt-2 mt-2 border-t text-[11px] text-muted-foreground leading-relaxed">
        Overall conversion: <span className="font-semibold text-foreground">
          {totals.searchViews > 0 ? Math.round(((totals.websiteClicks + totals.phoneCalls + totals.directionRequests) / totals.searchViews) * 100) : 0}%
        </span> of discovery actions converted to engagement.
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <div className="size-12 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
          <Inbox className="size-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>
      </CardContent>
    </Card>
  );
}
