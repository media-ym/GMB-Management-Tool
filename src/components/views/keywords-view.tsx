"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useLocations } from "@/hooks/use-locations";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { appendLocationIdsToParams } from "@/lib/location-filter";
import {
  DurationFilter,
  type DurationValue,
  type DurationCustomRange,
} from "@/components/shared/duration-filter";
import { analyticsDateRangeToDays } from "@/lib/analytics-date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, TrendingUp, TrendingDown, Target, BarChart3, Eye, Plus, Download,
  Hash, Activity, ArrowUpRight, ArrowDownRight, ChevronRight, X, Loader2,
  Filter, Globe, MapPin, Crosshair, Sparkles, LineChart as LineChartIcon, Trophy,
  Lightbulb, Link2, Calendar, ChevronDown, Languages,
} from "lucide-react";
import {
  CITY_GEO,
  DATE_PRESET_OPTIONS,
  GEO_INDIA,
  INDIA_GEO_OPTIONS,
  geoLabelForConstant,
  plannerYearMonthRange,
  type PlannerDatePreset,
} from "@/lib/google-ads-keyword-geo";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

/* ---------- Types ---------- */

interface KeywordData {
  id: string;
  keyword: string;
  city: string | null;
  state: string | null;
  status: string;
  locationId: string | null;
  locationName: string;
  locationCity: string;
  currentRank: number | null;
  previousRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  rankChange: number;
  rankHistory: { rank: number; date: string }[];
  trackingCount: number;
}

interface RankingHistory {
  keywordId: string;
  keyword: string;
  locationName?: string;
  locationCity?: string;
  history: { rank: number; date: string; checkedAt: string }[];
  stats?: { current: number | null; best: number | null; worst: number | null; avg: number | null };
}

type SubTab = "searches" | "ranking" | "traffic" | "researcher";
type IntentType = "branded" | "navigational" | "transactional" | "informational";
type SearchKeywordRow = { keyword: string; impressions: number };

function durationToRankingDays(value: DurationValue, custom?: DurationCustomRange | null): number {
  if (value === "all") return 730;
  if (value === "custom") {
    return analyticsDateRangeToDays("custom", custom);
  }
  if (value === "today" || value === "yesterday") return 1;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(n, 730) : 30;
}

/* ---------- Intent classification heuristic ---------- */

function classifyIntent(keyword: string): IntentType {
  const kw = keyword.toLowerCase();
  if (/\b(buy|price|cost|order|book|hire|cheap|discount|deal|offer|shop|purchase)\b/.test(kw)) return "transactional";
  if (/\b(near me|directions|address|location|hours|phone|contact|open)\b/.test(kw)) return "navigational";
  if (/\b(myfng|fng|brand)\b/.test(kw)) return "branded";
  return "informational";
}

const INTENT_CONFIG: Record<IntentType, { label: string; color: string; badge: string; chartColor: string }> = {
  branded: { label: "Branded", color: "bg-emerald-500", badge: "B", chartColor: "#10b981" },
  navigational: { label: "Navigational", color: "bg-blue-500", badge: "N", chartColor: "#3b82f6" },
  transactional: { label: "Transactional", color: "bg-amber-500", badge: "T", chartColor: "#f59e0b" },
  informational: { label: "Informational", color: "bg-purple-500", badge: "I", chartColor: "#8b5cf6" },
};

const RANK_COLORS = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#ef4444",
  none: "#94a3b8",
};

/* ---------- Helpers ---------- */

function getRankColor(rank: number | null): string {
  if (!rank || rank === 0) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  if (rank <= 3) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";
  if (rank <= 10) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
}

function getRankBadgeColor(rank: number | null): string {
  if (!rank || rank === 0) return "bg-slate-500";
  if (rank <= 3) return "bg-emerald-500";
  if (rank <= 10) return "bg-amber-500";
  return "bg-red-500";
}

/* ---------- Main Component ---------- */

export function KeywordsView() {
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const activeLocationId = selectedLocationIds.length === 1 ? selectedLocationIds[0] : "all";
  const { data: locations } = useLocations();
  const qc = useQueryClient();

  const [subTab, setSubTab] = useState<SubTab>("ranking");
  const [searchQuery, setSearchQuery] = useState("");
  const [trendKeyword, setTrendKeyword] = useState<KeywordData | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<DurationValue>("30");
  const [trendCustomRange, setTrendCustomRange] = useState<DurationCustomRange | null>(null);
  const [rankTab, setRankTab] = useState<"city" | "brand">("city");
  const [searchMonths, setSearchMonths] = useState(6);
  const [rankRefreshing, setRankRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "searches") setSubTab("searches");
    const monthsParam = parseInt(params.get("months") || "", 10);
    if (Number.isFinite(monthsParam) && monthsParam >= 1) {
      setSearchMonths(Math.min(12, monthsParam));
    }
  }, []);

  const keywordsUrl = useMemo(() => {
    const params = new URLSearchParams();
    appendLocationIdsToParams(params, selectedLocationIds);
    const qs = params.toString();
    return qs ? `/api/seo/keywords?${qs}` : "/api/seo/keywords";
  }, [selectedLocationIds]);

  const searchKeywordsUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("months", String(searchMonths));
    params.set("limit", "100");
    appendLocationIdsToParams(params, selectedLocationIds);
    return `/api/analytics/keywords?${params.toString()}`;
  }, [selectedLocationIds, searchMonths]);

  const { data: keywords, isLoading } = useQuery<KeywordData[]>({
    queryKey: ["seo-keywords", selectedLocationIds],
    queryFn: () => api<KeywordData[]>(keywordsUrl),
    enabled: subTab !== "searches",
  });

  const {
    data: gbpSearchData,
    isLoading: gbpSearchLoading,
    isFetching: gbpSearchFetching,
  } = useQuery<{ keywords: SearchKeywordRow[] }>({
    queryKey: ["search-keywords", selectedLocationIds, searchMonths],
    queryFn: () => api<{ keywords: SearchKeywordRow[] }>(searchKeywordsUrl),
    enabled: subTab === "searches",
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<RankingHistory>({
    queryKey: ["seo-rankings", trendKeyword?.id, trendPeriod, trendCustomRange],
    queryFn: () => {
      const days = durationToRankingDays(trendPeriod, trendCustomRange);
      return api<RankingHistory>(`/api/seo/rankings?keywordId=${trendKeyword!.id}&days=${days}`);
    },
    enabled: !!trendKeyword,
  });

  const totalLocations = locations?.length ?? 0;
  const totalKeywords = keywords?.length ?? 0;

  const lastUpdated = useMemo(() => {
    if (!keywords?.length) return null;
    const histories = keywords.flatMap((k) => k.rankHistory);
    if (!histories.length) return null;
    const latest = histories.reduce((max, h) => (h.date > max ? h.date : max), histories[0].date);
    return new Date(latest);
  }, [keywords]);

  const metadata = useMemo(() => {
    const daysAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)) : null;
    return `${totalLocations} locations · ${totalKeywords} keywords${daysAgo !== null ? ` · updated ${daysAgo}d ago` : ""}`;
  }, [totalLocations, totalKeywords, lastUpdated]);

  const keywordKpis = useMemo(() => {
    const list = keywords ?? [];
    const ranked = list.filter((k) => k.currentRank != null);
    const top3 = ranked.filter((k) => (k.currentRank ?? 99) <= 3).length;
    const top10 = ranked.filter((k) => (k.currentRank ?? 99) <= 10).length;
    const avgRank =
      ranked.length > 0
        ? (ranked.reduce((s, k) => s + (k.currentRank ?? 0), 0) / ranked.length).toFixed(1)
        : "—";
    return { top3, top10, avgRank };
  }, [keywords]);

  async function handleRankRefresh() {
    if (subTab === "searches") {
      qc.invalidateQueries({ queryKey: ["search-keywords"] });
      return;
    }
    setRankRefreshing(true);
    try {
      const body: { locationId?: string; limit?: number } = { limit: 40 };
      if (selectedLocationIds.length === 1) body.locationId = selectedLocationIds[0];
      const res = await api<{ refreshed: number; ranked: number; errors?: string[] }>(
        "/api/seo/refresh",
        { method: "POST", body: JSON.stringify(body) },
      );
      toast.success(`Rank check: ${res.refreshed} keyword(s) · ${res.ranked} in top 20`);
      if (res.errors?.length) {
        toast.error(res.errors[0], { duration: 12000 });
      }
      qc.invalidateQueries({ queryKey: ["seo-keywords"] });
      qc.invalidateQueries({ queryKey: ["seo-rankings"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Rank refresh failed");
    } finally {
      setRankRefreshing(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Keywords Position"
        description={
          subTab === "searches"
            ? `Google search terms that showed your profile · last ${searchMonths} months`
            : metadata
        }
        icon={Target}
        actions={
          <div className="flex items-center gap-2">
            <LocationMultiSelect
              locations={locations}
              selectedIds={selectedLocationIds}
              onChange={setSelectedLocationIds}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleRankRefresh}
              disabled={rankRefreshing}
            >
              {rankRefreshing ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Activity className="size-4 mr-1.5" />
              )}
              {subTab === "searches" ? "Refresh" : "Check ranks"}
            </Button>
          </div>
        }
      />

      {subTab !== "searches" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))
          ) : (
            <>
              <StatCard label="Total Keywords" value={totalKeywords} icon={Target} accent="violet" hint="Tracked terms" />
              <StatCard label="Locations" value={totalLocations} icon={MapPin} accent="emerald" hint="In portfolio" />
              <StatCard label="Top 3 Rankings" value={keywordKpis.top3} icon={Trophy} accent="amber" hint={`${keywordKpis.top10} in top 10`} />
              <StatCard label="Avg Rank" value={keywordKpis.avgRank} icon={TrendingUp} accent="blue" hint="Across keywords" />
            </>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)}>
        <TabsList className="grid w-full max-w-2xl grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="searches">GBP Searches</TabsTrigger>
          <TabsTrigger value="ranking">Ranking Dashboard</TabsTrigger>
          <TabsTrigger value="traffic">Traffic Analysis</TabsTrigger>
          <TabsTrigger value="researcher">Keyword Researcher</TabsTrigger>
        </TabsList>
      </Tabs>

      {subTab === "searches" ? (
        <GbpSearchesPanel
          keywords={gbpSearchData?.keywords ?? []}
          isLoading={gbpSearchLoading || gbpSearchFetching}
          months={searchMonths}
          onMonthsChange={setSearchMonths}
        />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {subTab === "ranking" && <RankingDashboard keywords={keywords ?? []} searchQuery={searchQuery} setSearchQuery={setSearchQuery} setTrendKeyword={setTrendKeyword} rankTab={rankTab} setRankTab={setRankTab} activeLocationId={activeLocationId} locations={locations ?? []} />}
          {subTab === "traffic" && <TrafficAnalysis keywords={keywords ?? []} />}
          {subTab === "researcher" && <KeywordResearcher locations={locations ?? []} activeLocationId={activeLocationId} />}
        </>
      )}

      {/* Keyword Trends Modal */}
      <Dialog open={!!trendKeyword} onOpenChange={(open) => { if (!open) setTrendKeyword(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LineChartIcon className="size-5 text-primary" />
              Keyword Trends
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg">{trendKeyword?.keyword}</p>
                <p className="text-sm text-muted-foreground">
                  Avg Rank: {trendData?.stats?.current ?? trendKeyword?.currentRank ?? "N/A"}
                  {trendKeyword?.locationCity ? ` · ${trendKeyword.locationCity}` : ""}
                </p>
              </div>
              <DurationFilter
                value={trendPeriod}
                onChange={setTrendPeriod}
                customRange={trendCustomRange}
                onCustomRangeChange={setTrendCustomRange}
                className="w-[160px]"
              />
            </div>
            {trendLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (() => {
              const chartData = trendData?.history ?? trendKeyword?.rankHistory ?? [];
              if (chartData.length === 0) {
                return (
                  <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 text-center px-6">
                    <LineChartIcon className="size-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium">No rank history yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      Click <strong>Check ranks</strong> to run a Google Maps rank check.
                      Enable <strong>Places API (New)</strong> on your Google Cloud project if the check fails.
                      Run weekly to build a trend line.
                    </p>
                  </div>
                );
              }
              return (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} className="text-xs" />
                    <YAxis reversed domain={[1, "dataMax + 2"]} className="text-xs" label={{ value: "Rank", angle: -90, position: "insideLeft", className: "text-xs fill-muted-foreground" }} />
                    <RTooltip contentStyle={{ borderRadius: 8 }} formatter={(value: number) => [`Rank ${value || "20+"}`, "Position"]} labelFormatter={(l) => new Date(l).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                    <Line type="monotone" dataKey="rank" stroke="var(--chart-1, #10b981)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Sub-tab: GBP search impressions (Performance API) ---------- */

function GbpSearchesPanel({
  keywords,
  isLoading,
  months,
  onMonthsChange,
}: {
  keywords: SearchKeywordRow[];
  isLoading: boolean;
  months: number;
  onMonthsChange: (m: number) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return keywords;
    return keywords.filter((k) => k.keyword.toLowerCase().includes(q));
  }, [keywords, query]);

  const totalImpressions = useMemo(
    () => keywords.reduce((sum, k) => sum + (k.impressions || 0), 0),
    [keywords],
  );

  const fmtImpressions = (n: number) => (n < 15 ? "< 15" : n.toLocaleString("en-IN"));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Search terms" value={keywords.length} icon={Search} accent="blue" hint="From Google profile" />
        <StatCard
          label="Total impressions"
          value={totalImpressions >= 15 ? totalImpressions.toLocaleString("en-IN") : totalImpressions > 0 ? "< 15+" : "0"}
          icon={Eye}
          accent="violet"
          hint={`Last ${months} months`}
        />
        <StatCard label="Period" value={`${months} mo`} icon={Activity} accent="emerald" hint="Google monthly buckets" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Searches Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Search terms that showed your Google Business Profile
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(months)} onValueChange={(v) => onMonthsChange(parseInt(v, 10))}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      Last {m} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter terms…"
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-10">
              {keywords.length === 0
                ? "Search keywords will appear after syncing your profile performance data."
                : "No terms match your filter."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Search term</TableHead>
                  <TableHead className="text-right w-32">Impressions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={`${item.keyword}-${i}`}>
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">{item.keyword}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtImpressions(item.impressions)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Sub-tab 1: Ranking Dashboard ---------- */

function RankingDashboard({
  keywords, searchQuery, setSearchQuery, setTrendKeyword, rankTab, setRankTab, activeLocationId, locations,
}: {
  keywords: KeywordData[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setTrendKeyword: (k: KeywordData | null) => void;
  rankTab: "city" | "brand";
  setRankTab: (t: "city" | "brand") => void;
  activeLocationId: string | "all";
  locations: { id: string; name: string; city: string }[];
}) {
  const intentDistribution = useMemo(() => {
    const counts: Record<IntentType, number> = { branded: 0, navigational: 0, transactional: 0, informational: 0 };
    keywords.forEach((k) => { counts[classifyIntent(k.keyword)]++; });
    return Object.entries(counts).map(([key, value]) => ({
      name: INTENT_CONFIG[key as IntentType].label,
      value,
      color: INTENT_CONFIG[key as IntentType].chartColor,
    }));
  }, [keywords]);

  const avgRank = useMemo(() => {
    const ranks = keywords.map((k) => k.currentRank).filter((r): r is number => r !== null && r > 0);
    return ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : 0;
  }, [keywords]);

  const weeklyChange = useMemo(() => {
    const changes = keywords.map((k) => k.rankChange).filter((c) => c !== 0);
    return changes.length ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 : 0;
  }, [keywords]);

  const improved = keywords.filter((k) => k.rankChange > 0).length;
  const decreased = keywords.filter((k) => k.rankChange < 0).length;

  const lastUpdated = useMemo(() => {
    const histories = keywords.flatMap((k) => k.rankHistory);
    if (!histories.length) return null;
    const latest = histories.reduce((max, h) => (h.date > max ? h.date : max), histories[0].date);
    return new Date(latest);
  }, [keywords]);

  const visibilityScore = useMemo(() => {
    const ranks = keywords.map((k) => k.currentRank).filter((r): r is number => r !== null && r > 0);
    if (!ranks.length) return 0;
    const score = ranks.reduce((acc, rank) => {
      if (rank <= 3) return acc + 100;
      if (rank <= 10) return acc + 60;
      if (rank <= 20) return acc + 20;
      return acc;
    }, 0) / ranks.length;
    return Math.round(score);
  }, [keywords]);

  const rankDistribution = useMemo(() => {
    const buckets = [
      { label: "1-3", min: 1, max: 3, color: "#10b981" },
      { label: "4-6", min: 4, max: 6, color: "#22c55e" },
      { label: "7-11", min: 7, max: 11, color: "#f59e0b" },
      { label: "12-15", min: 12, max: 15, color: "#f97316" },
      { label: "16-20", min: 16, max: 20, color: "#ef4444" },
    ];
    return buckets.map((b) => ({
      ...b,
      count: keywords.filter((k) => k.currentRank !== null && k.currentRank >= b.min && k.currentRank <= b.max).length,
    }));
  }, [keywords]);

  const high = keywords.filter((k) => k.currentRank !== null && k.currentRank >= 1 && k.currentRank <= 3).length;
  const medium = keywords.filter((k) => k.currentRank !== null && k.currentRank >= 4 && k.currentRank <= 10).length;
  const low = keywords.filter((k) => k.currentRank !== null && k.currentRank >= 11 && k.currentRank <= 20).length;
  const noData = keywords.filter((k) => k.currentRank === null || k.currentRank === 0).length;
  const showDistribution = activeLocationId === "all" || locations.length >= 2;

  const filteredKeywords = useMemo(() => {
    if (!searchQuery) return keywords;
    const q = searchQuery.toLowerCase();
    return keywords.filter((k) => k.keyword.toLowerCase().includes(q) || k.locationName.toLowerCase().includes(q));
  }, [keywords, searchQuery]);

  const groupedByCity = useMemo(() => {
    const map = new Map<string, KeywordData[]>();
    keywords.forEach((k) => {
      const city = k.locationCity || k.city || "Unknown";
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(k);
    });
    return Array.from(map.entries());
  }, [keywords]);

  const exportCsv = useCallback(() => {
    const rows = [["Keyword", "Location", "Current Rank", "Previous Rank", "Change", "Best", "Worst", "Intent"]];
    keywords.forEach((k) => {
      rows.push([k.keyword, k.locationName, String(k.currentRank ?? ""), String(k.previousRank ?? ""), String(k.rankChange), String(k.bestRank ?? ""), String(k.worstRank ?? ""), classifyIntent(k.keyword)]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-rankings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  }, [keywords]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Keywords Tracked - Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Keywords Tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-28 w-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={intentDistribution} dataKey="value" innerRadius={30} outerRadius={50} paddingAngle={2}>
                      {intentDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 min-w-0">
                <p className="text-2xl font-bold">{keywords.length}</p>
                {intentDistribution.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-medium ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Rank */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Rank</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold">{avgRank || "—"}</span>
              {weeklyChange !== 0 && (
                <Badge variant="secondary" className={cn("gap-0.5", weeklyChange > 0 ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" : "text-red-600 bg-red-100 dark:bg-red-900/30")}>
                  {weeklyChange > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {Math.abs(weeklyChange)}
                </Badge>
              )}
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600">
                <TrendingUp className="size-3.5" /> {improved} Improved
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <TrendingDown className="size-3.5" /> {decreased} Decreased
              </span>
            </div>
            {lastUpdated && (
              <p className="mt-2 text-xs text-muted-foreground">
                Last Updated: {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Visibility Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visibility Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative size-24 shrink-0">
                <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${visibilityScore * 2.64} 264`} strokeLinecap="round" className="text-primary" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{visibilityScore}%</span>
                </div>
              </div>
              <div className="space-y-1">
                {weeklyChange !== 0 && (
                  <div className={cn("flex items-center gap-1 text-sm font-medium", weeklyChange > 0 ? "text-emerald-600" : "text-red-600")}>
                    {weeklyChange > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {Math.abs(weeklyChange)}% WoW
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Based on top-20 rankings weighted by position</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Average Rank Distribution */}
      {showDistribution && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Rank Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary pills */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Locations</p>
                <p className="text-xl font-bold mt-1">{locations.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-3 text-center bg-emerald-50/50 dark:bg-emerald-950/20">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">High (1-3)</p>
                <p className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{high}</p>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 text-center bg-amber-50/50 dark:bg-amber-950/20">
                <p className="text-xs text-amber-600 dark:text-amber-400">Medium (4-10)</p>
                <p className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-300">{medium}</p>
              </div>
              <div className="rounded-lg border border-red-200 dark:border-red-800 p-3 text-center bg-red-50/50 dark:bg-red-950/20">
                <p className="text-xs text-red-600 dark:text-red-400">Low (11-20)</p>
                <p className="text-xl font-bold mt-1 text-red-700 dark:text-red-300">{low}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Without Data</p>
                <p className="text-xl font-bold mt-1">{noData}</p>
              </div>
            </div>

            {/* Bar chart */}
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" />
                  <RTooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="count" name="Keywords" radius={[4, 4, 0, 0]}>
                    {rankDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keywords Position Tracking Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Keywords Position Tracking</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Official Google Maps Result for {keywords.length} Keywords
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Filter keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-52"
                />
              </div>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="size-4 mr-1.5" /> Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Top Keywords</TableHead>
                  <TableHead>Listing Name</TableHead>
                  <TableHead className="text-center">Avg Center Rank</TableHead>
                  <TableHead className="text-center">Intent</TableHead>
                  <TableHead className="text-center">Change</TableHead>
                  <TableHead className="text-center w-10">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeywords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "No keywords match your filter" : "No keywords tracked yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredKeywords.slice(0, 50).map((k) => {
                    const intent = classifyIntent(k.keyword);
                    const cfg = INTENT_CONFIG[intent];
                    return (
                      <TableRow key={k.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{k.keyword}</span>
                            <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {k.city && <p className="text-xs text-muted-foreground mt-0.5">{k.city}</p>}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{k.locationName || "—"}</span>
                          {k.trackingCount > 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">({k.trackingCount})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold min-w-[2.5rem]", getRankColor(k.currentRank))}>
                            {k.currentRank ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("inline-flex items-center justify-center size-6 rounded text-xs font-bold text-white", cfg.color)}>
                            {cfg.badge}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {k.rankChange !== 0 ? (
                            <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", k.rankChange > 0 ? "text-emerald-600" : "text-red-600")}>
                              {k.rankChange > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                              {Math.abs(k.rankChange)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <button onClick={() => setTrendKeyword(k)} className="p-1 rounded hover:bg-muted transition-colors" title="View trend">
                            <Activity className="size-4 text-muted-foreground hover:text-primary" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredKeywords.length > 50 && (
            <div className="px-4 py-3 border-t text-center text-sm text-muted-foreground">
              Showing 50 of {filteredKeywords.length} keywords. Use the filter to narrow results.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rank Changes - City/Brand wise */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Keyword Rank Changes</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant={rankTab === "city" ? "default" : "ghost"} onClick={() => setRankTab("city")}>
                City Wise
              </Button>
              <Button size="sm" variant={rankTab === "brand" ? "default" : "ghost"} onClick={() => setRankTab("brand")}>
                Brand Wise
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{rankTab === "city" ? "City" : "Brand Keyword"}</TableHead>
                  <TableHead className="text-center">Keywords</TableHead>
                  <TableHead className="text-center">Avg Rank</TableHead>
                  <TableHead className="text-center">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankTab === "city" ? (
                  groupedByCity.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No data</TableCell></TableRow>
                  ) : (
                    groupedByCity.map(([city, kws]) => {
                      const ranks = kws.map((k) => k.currentRank).filter((r): r is number => r !== null && r > 0);
                      const avg = ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : 0;
                      const avgChange = kws.reduce((a, k) => a + k.rankChange, 0) / Math.max(kws.length, 1);
                      return (
                        <TableRow key={city}>
                          <TableCell className="font-medium">{city}</TableCell>
                          <TableCell className="text-center">{kws.length}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", getRankColor(avg))}>
                              {avg}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {avgChange !== 0 ? (
                              <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", avgChange > 0 ? "text-emerald-600" : "text-red-600")}>
                                {avgChange > 0 ? "+" : ""}{avgChange.toFixed(1)}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )
                ) : (
                  keywords.filter((k) => classifyIntent(k.keyword) === "branded").length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No branded keywords</TableCell></TableRow>
                  ) : (
                    keywords.filter((k) => classifyIntent(k.keyword) === "branded").map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.keyword}</TableCell>
                        <TableCell className="text-center">1</TableCell>
                        <TableCell className="text-center">
                          <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", getRankColor(k.currentRank))}>
                            {k.currentRank ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {k.rankChange !== 0 ? (
                            <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", k.rankChange > 0 ? "text-emerald-600" : "text-red-600")}>
                              {k.rankChange > 0 ? "+" : ""}{k.rankChange}
                            </span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Sub-tab 2: Traffic Analysis ---------- */

function TrafficAnalysis({ keywords }: { keywords: KeywordData[] }) {
  const [timeFilter, setTimeFilter] = useState<"6m" | "1y" | "all">("6m");
  const [intentFilter, setIntentFilter] = useState<"all" | IntentType>("all");

  const keywordsByIntent = useMemo(() => {
    const map: Record<IntentType, KeywordData[]> = { branded: [], navigational: [], transactional: [], informational: [] };
    keywords.forEach((k) => { map[classifyIntent(k.keyword)].push(k); });
    return map;
  }, [keywords]);

  const intentSummary = useMemo(() => {
    const total = keywords.length;
    return [
      { intent: "all" as const, label: "All", count: total, pct: 100 },
      ...Object.entries(keywordsByIntent).map(([key, kws]) => ({
        intent: key as IntentType,
        label: INTENT_CONFIG[key as IntentType].label,
        count: kws.length,
        pct: total ? Math.round((kws.length / total) * 100) : 0,
      })),
    ];
  }, [keywords, keywordsByIntent]);

  const filteredKws = useMemo(() => {
    if (intentFilter === "all") return keywords;
    return keywords.filter((k) => classifyIntent(k.keyword) === intentFilter);
  }, [keywords, intentFilter]);

  const intentBarData = useMemo(() => {
    return Object.entries(keywordsByIntent).map(([key, kws]) => ({
      intent: INTENT_CONFIG[key as IntentType].label,
      count: kws.length,
      color: INTENT_CONFIG[key as IntentType].chartColor,
    }));
  }, [keywordsByIntent]);

  return (
    <div className="space-y-6">
      {/* Time filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Keywords by Intent</h3>
        <div className="flex gap-1">
          {(["6m", "1y", "all"] as const).map((t) => (
            <Button key={t} size="sm" variant={timeFilter === t ? "default" : "ghost"} onClick={() => setTimeFilter(t)}>
              {t === "6m" ? "6 Months" : t === "1y" ? "1 Year" : "All Time"}
            </Button>
          ))}
        </div>
      </div>

      {/* Intent Distribution Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex h-4 rounded-full overflow-hidden">
            {intentBarData.map((d) => (
              <div
                key={d.intent}
                className="h-full transition-all"
                style={{ width: `${keywords.length ? (d.count / keywords.length) * 100 : 0}%`, backgroundColor: d.color }}
                title={`${d.intent}: ${d.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {intentBarData.map((d) => (
              <div key={d.intent} className="flex items-center gap-1.5 text-xs">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground">{d.intent}</span>
                <span className="font-medium">{d.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Intent Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Intent Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Intent</TableHead>
                <TableHead className="text-center">Keywords</TableHead>
                <TableHead className="text-center">Avg Rank</TableHead>
                <TableHead className="text-center">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intentSummary.map((row) => {
                const kws = row.intent === "all" ? keywords : keywordsByIntent[row.intent];
                const ranks = kws.map((k) => k.currentRank).filter((r): r is number => r !== null && r > 0);
                const avg = ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : 0;
                return (
                  <TableRow
                    key={row.intent}
                    className={cn("cursor-pointer", intentFilter === row.intent && "bg-muted/50")}
                    onClick={() => setIntentFilter(row.intent === "all" ? "all" : row.intent)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.intent !== "all" && (
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: INTENT_CONFIG[row.intent].chartColor }} />
                        )}
                        <span className="font-medium">{row.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">{row.count}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", getRankColor(avg))}>{avg || "—"}</span>
                    </TableCell>
                    <TableCell className="text-center">{row.pct}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Traffic Driving Keywords */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Traffic Driving Keywords</CardTitle>
            <Button size="sm" variant="link" className="text-primary">
              <Plus className="size-3.5 mr-1" /> Add Branded Keywords
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead className="text-center">Rank</TableHead>
                <TableHead className="text-center">Intent</TableHead>
                <TableHead className="text-center">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKws.slice(0, 20).map((k) => {
                const intent = classifyIntent(k.keyword);
                const cfg = INTENT_CONFIG[intent];
                return (
                  <TableRow key={k.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.keyword}</span>
                        {intent === "branded" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Branded
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", getRankColor(k.currentRank))}>
                        {k.currentRank ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn("inline-flex items-center justify-center size-6 rounded text-xs font-bold text-white", cfg.color)}>
                        {cfg.badge}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {k.rankChange !== 0 ? (
                        <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", k.rankChange > 0 ? "text-emerald-600" : "text-red-600")}>
                          {k.rankChange > 0 ? "+" : ""}{k.rankChange}
                        </span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredKws.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No keywords found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Sub-tab 3: Keyword Researcher ---------- */

type KeywordIdeaRow = {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: string;
  competitionIndex: number | null;
  lowBidInr: number | null;
  highBidInr: number | null;
  monthlySearches?: number[];
};

type KeywordIdeasResponse = {
  ideas: KeywordIdeaRow[];
  seed: string[];
  pageUrl?: string | null;
  geoLabel: string;
  geoTargetConstant?: string;
  languageId: string;
  datePreset?: PlannerDatePreset;
  dateLabel?: string;
  source: string;
};

type KeywordPlannerStatus = {
  configured: boolean;
  connected: boolean;
  hasAdwordsScope: boolean;
  ready: boolean;
  customerIdMasked: string | null;
  loginCustomerIdSet?: boolean;
  loginCustomerIdMasked?: string | null;
  accessibleCustomers?: string[];
  adsApiReachable?: boolean | null;
  keywordPlannerReachable?: boolean | null;
  hint?: string;
};

type PlannerSort = "volume" | "competition" | "bid" | "alpha";
type PlannerScreen = "home" | "discover" | "results";

function competitionBadge(level: string) {
  const v = (level || "").toUpperCase();
  if (v === "HIGH") return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  if (v === "MEDIUM") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  if (v === "LOW") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function competitionRank(level: string) {
  const v = (level || "").toUpperCase();
  if (v === "HIGH") return 3;
  if (v === "MEDIUM") return 2;
  if (v === "LOW") return 1;
  return 0;
}

function formatVolume(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN");
}

function formatBid(low: number | null, high: number | null) {
  if (low == null && high == null) return "—";
  if (low != null && high != null) return `₹${low.toLocaleString("en-IN")} – ₹${high.toLocaleString("en-IN")}`;
  if (low != null) return `₹${low.toLocaleString("en-IN")}+`;
  return `~₹${(high as number).toLocaleString("en-IN")}`;
}

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function VolumeSparkline({ values }: { values?: number[] }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 1);
  const w = 56;
  const h = 18;
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="shrink-0 text-[#1a73e8]" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function KeywordResearcher({ locations, activeLocationId }: { locations: { id: string; name: string; city: string }[]; activeLocationId: string | "all" }) {
  const [screen, setScreen] = useState<PlannerScreen>("home");
  const [mode, setMode] = useState<"keywords" | "website">("keywords");
  const [query, setQuery] = useState("car service\ngarage near me\ncar repair");
  const [pageUrl, setPageUrl] = useState("https://myfng.in");
  const [geoTargetConstant, setGeoTargetConstant] = useState(GEO_INDIA);
  const [languageId, setLanguageId] = useState("1000");
  const [datePreset, setDatePreset] = useState<PlannerDatePreset>("1");
  const [citySearch, setCitySearch] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [requestKey, setRequestKey] = useState<{
    seeds: string;
    pageUrl: string;
    geoTargetConstant: string;
    languageId: string;
    datePreset: PlannerDatePreset;
  } | null>(null);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<PlannerSort>("volume");
  const [compFilter, setCompFilter] = useState<"all" | "LOW" | "MEDIUM" | "HIGH">("all");
  const [addingKeyword, setAddingKeyword] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const dateMeta = useMemo(() => plannerYearMonthRange(datePreset), [datePreset]);
  const geoLabel = geoLabelForConstant(geoTargetConstant);
  const languageLabel = languageId === "1001" ? "Hindi" : "English";

  useEffect(() => {
    if (activeLocationId === "all") return;
    const loc = locations.find((l) => l.id === activeLocationId);
    if (!loc?.city) return;
    const geo = CITY_GEO[loc.city.toLowerCase().trim()];
    if (geo) setGeoTargetConstant(geo);
  }, [activeLocationId, locations]);

  const portfolioCities = useMemo(() => {
    const seen = new Set<string>();
    const rows: { id: string; label: string; region: string }[] = [];
    for (const loc of locations) {
      const key = (loc.city || "").toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      const geo = CITY_GEO[key];
      if (!geo || seen.has(geo)) continue;
      seen.add(key);
      seen.add(geo);
      rows.push({ id: geo, label: loc.city, region: "Your locations" });
    }
    return rows;
  }, [locations]);

  const cityOptions = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    const merged = [
      ...portfolioCities,
      ...INDIA_GEO_OPTIONS.filter((g) => !portfolioCities.some((p) => p.id === g.id)),
    ];
    if (!q) return merged;
    return merged.filter(
      (g) =>
        g.label.toLowerCase().includes(q) ||
        (g.region || "").toLowerCase().includes(q),
    );
  }, [citySearch, portfolioCities]);

  const { data: plannerStatus } = useQuery<KeywordPlannerStatus>({
    queryKey: ["keyword-planner-status"],
    queryFn: () => api<KeywordPlannerStatus>("/api/seo/keyword-ideas"),
    staleTime: 30_000,
  });

  const {
    data: ideasData,
    isFetching: researching,
    error: researchError,
    refetch,
  } = useQuery<KeywordIdeasResponse>({
    queryKey: ["keyword-ideas", requestKey],
    queryFn: () =>
      api<KeywordIdeasResponse>("/api/seo/keyword-ideas", {
        method: "POST",
        body: JSON.stringify({
          seed: requestKey!.seeds,
          pageUrl: requestKey!.pageUrl || undefined,
          geoTargetConstant: requestKey!.geoTargetConstant,
          languageId: requestKey!.languageId,
          datePreset: requestKey!.datePreset,
        }),
      }),
    enabled: !!requestKey,
    retry: false,
  });

  useEffect(() => {
    if (requestKey && !researching) setScreen("results");
  }, [requestKey, researching, ideasData]);

  function runResearch() {
    const seeds =
      mode === "keywords"
        ? query
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .join("\n")
        : "";
    const url = pageUrl.trim();

    if (mode === "keywords" && seeds.length < 2 && !url) {
      toast.error("Enter at least one seed keyword");
      return;
    }
    if (mode === "website" && !url) {
      toast.error("Enter a website URL");
      return;
    }

    const next = {
      seeds: mode === "website" ? "" : seeds,
      pageUrl: url,
      geoTargetConstant,
      languageId,
      datePreset,
    };
    if (
      requestKey &&
      requestKey.seeds === next.seeds &&
      requestKey.pageUrl === next.pageUrl &&
      requestKey.geoTargetConstant === next.geoTargetConstant &&
      requestKey.languageId === next.languageId &&
      requestKey.datePreset === next.datePreset
    ) {
      void refetch();
    } else {
      setRequestKey(next);
      setSelected(new Set());
    }
    setScreen("results");
  }

  async function addKeyword(keyword: string) {
    try {
      setAddingKeyword(keyword);
      const matchLoc = locations.find(
        (l) => CITY_GEO[(l.city || "").toLowerCase().trim()] === geoTargetConstant,
      );
      await api("/api/seo/keywords", {
        method: "POST",
        body: JSON.stringify({
          keyword,
          locationId: matchLoc?.id || null,
          city: geoLabel !== "India" ? geoLabel : matchLoc?.city || null,
        }),
      });
      toast.success(`"${keyword}" added to tracking`);
      qc.invalidateQueries({ queryKey: ["seo-keywords"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to add keyword");
    } finally {
      setAddingKeyword(null);
    }
  }

  async function addSelected() {
    const list = [...selected];
    if (!list.length) return;
    for (const kw of list) {
      // eslint-disable-next-line no-await-in-loop
      await addKeyword(kw);
    }
    setSelected(new Set());
  }

  function downloadIdeasCsv() {
    if (!ideas.length) {
      toast.error("No keywords to download");
      return;
    }
    const headers = [
      "Keyword",
      "Avg monthly searches",
      "Competition",
      "Competition index",
      "Top of page bid low (INR)",
      "Top of page bid high (INR)",
      "Location",
      "Language",
      "Date range",
    ];
    const period = ideasData?.dateLabel || dateMeta.label;
    const rows = ideas.map((i) => [
      csvEscape(i.keyword),
      csvEscape(i.avgMonthlySearches),
      csvEscape(i.competition),
      csvEscape(i.competitionIndex),
      csvEscape(i.lowBidInr),
      csvEscape(i.highBidInr),
      csvEscape(ideasData?.geoLabel || geoLabel),
      csvEscape(languageLabel),
      csvEscape(period),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyword-ideas-${geoLabel.toLowerCase().replace(/\s+/g, "-")}-${datePreset}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${ideas.length} keyword ideas`);
  }

  const ideas = useMemo(() => {
    let rows = ideasData?.ideas ?? [];
    const q = filter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.keyword.toLowerCase().includes(q));
    if (compFilter !== "all") {
      rows = rows.filter((r) => (r.competition || "").toUpperCase() === compFilter);
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortBy === "volume") return (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0);
      if (sortBy === "competition") return competitionRank(b.competition) - competitionRank(a.competition);
      if (sortBy === "bid") return (b.highBidInr ?? 0) - (a.highBidInr ?? 0);
      return a.keyword.localeCompare(b.keyword);
    });
    return sorted;
  }, [ideasData?.ideas, filter, sortBy, compFilter]);

  const totalVolume = ideas.reduce((s, i) => s + (i.avgMonthlySearches ?? 0), 0);
  const needsReconnect =
    plannerStatus && (!plannerStatus.connected || !plannerStatus.hasAdwordsScope);
  const needsConfig = plannerStatus && !plannerStatus.configured;
  const maxVolume = Math.max(...ideas.map((i) => i.avgMonthlySearches ?? 0), 1);
  const canGetResults =
    mode === "website"
      ? pageUrl.trim().length > 0
      : query.trim().length > 0 || pageUrl.trim().length > 0;

  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={locOpen} onOpenChange={setLocOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
            <MapPin className="size-3.5 opacity-70" />
            <span className="max-w-[140px] truncate">{geoLabel}</span>
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="p-3 border-b space-y-2">
            <p className="text-xs font-semibold">Locations</p>
            <p className="text-[11px] text-muted-foreground">
              India select karo, ya city-wise target choose karo
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder="Search cities…"
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {cityOptions.map((g) => (
              <button
                key={`${g.region}-${g.id}`}
                type="button"
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-md text-sm hover:bg-accent flex items-center justify-between gap-2",
                  geoTargetConstant === g.id && "bg-accent font-medium ring-1 ring-primary/20",
                )}
                onClick={() => {
                  setGeoTargetConstant(g.id);
                  setLocOpen(false);
                  setCitySearch("");
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{g.label}</span>
                </span>
                {g.region && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{g.region}</span>
                )}
              </button>
            ))}
            {cityOptions.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No cities match</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={langOpen} onOpenChange={setLangOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
            <Languages className="size-3.5 opacity-70" />
            {languageLabel}
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          {[
            { id: "1000", label: "English" },
            { id: "1001", label: "Hindi" },
          ].map((l) => (
            <button
              key={l.id}
              type="button"
              className={cn(
                "w-full text-left px-2.5 py-2 rounded-md text-sm hover:bg-accent",
                languageId === l.id && "bg-accent font-medium",
              )}
              onClick={() => {
                setLanguageId(l.id);
                setLangOpen(false);
              }}
            >
              {l.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
            <Calendar className="size-3.5 opacity-70" />
            <span className="max-w-[180px] truncate">{dateMeta.label}</span>
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Date range
          </p>
          {DATE_PRESET_OPTIONS.map((opt) => {
            const meta = plannerYearMonthRange(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-md text-sm hover:bg-accent",
                  datePreset === opt.value && "bg-accent font-medium ring-1 ring-primary/20",
                )}
                onClick={() => {
                  setDatePreset(opt.value);
                  setDateOpen(false);
                }}
              >
                <div>{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{meta.label}</div>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );

  if (screen === "home") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Keyword Planner</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Google Ads Keyword Planner jaisa — search volume, competition & bids
          </p>
        </div>

        {(needsConfig || needsReconnect) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 p-3 text-sm">
            {needsConfig ? (
              <p>Google Ads env missing. Add developer token + customer ID in <code>.env</code>.</p>
            ) : (
              <p>
                Ads scope missing —{" "}
                <a href="/google" className="font-medium text-primary underline underline-offset-2">
                  Reconnect for Ads
                </a>
                .
              </p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          <button
            type="button"
            onClick={() => {
              setMode("keywords");
              setScreen("discover");
            }}
            className="group text-left rounded-2xl border bg-card p-6 shadow-sm hover:border-primary/40 hover:shadow-md transition"
          >
            <div className="size-14 rounded-xl bg-amber-400/15 flex items-center justify-center mb-4">
              <Lightbulb className="size-7 text-amber-500" />
            </div>
            <h3 className="text-base font-semibold group-hover:text-primary transition-colors">
              Discover new keywords
            </h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Get keyword ideas that can help you reach people interested in your product or service.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("website");
              setScreen("discover");
            }}
            className="group text-left rounded-2xl border bg-card p-6 shadow-sm hover:border-primary/40 hover:shadow-md transition"
          >
            <div className="size-14 rounded-xl bg-sky-500/10 flex items-center justify-center mb-4">
              <LineChartIcon className="size-7 text-sky-600" />
            </div>
            <h3 className="text-base font-semibold group-hover:text-primary transition-colors">
              Get search volume and forecasts
            </h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Get search volume and other historical metrics for keywords — default last 1 month.
            </p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 mb-1"
            onClick={() => {
              setScreen("home");
              setRequestKey(null);
            }}
          >
            Keyword Planner <ChevronRight className="size-3" />
          </button>
          <h2 className="text-lg font-semibold tracking-tight">
            {screen === "results" && requestKey
              ? `Plan · ${ideasData?.dateLabel || dateMeta.label}`
              : "Discover new keywords"}
          </h2>
        </div>
        {screen === "results" && ideas.length > 0 && (
          <Button size="sm" variant="outline" onClick={downloadIdeasCsv}>
            <Download className="size-3.5 mr-1.5" />
            Download keyword ideas
          </Button>
        )}
      </div>

      {screen === "discover" && (
        <Card className="overflow-hidden max-w-4xl">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b">
              <Tabs value={mode} onValueChange={(v) => setMode(v as "keywords" | "website")}>
                <TabsList className="bg-transparent h-auto p-0 gap-4 rounded-none">
                  <TabsTrigger
                    value="keywords"
                    className="rounded-none px-0 pb-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                  >
                    Start with keywords
                  </TabsTrigger>
                  <TabsTrigger
                    value="website"
                    className="rounded-none px-0 pb-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                  >
                    Start with a website
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setScreen("home")}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="p-5 space-y-5">
              {mode === "keywords" ? (
                <div className="grid lg:grid-cols-[1fr_220px] gap-4">
                  <div className="space-y-3">
                    <Label className="text-sm">Enter products or services closely related to your business</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                      <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border bg-background pl-10 pr-3 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder={'Try "car service" or "garage near me"'}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">{filterChips}</div>
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs text-muted-foreground">Enter a site to filter unrelated keywords</Label>
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          value={pageUrl}
                          onChange={(e) => setPageUrl(e.target.value)}
                          placeholder="https://"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed lg:pt-7">
                    Try not to be too specific or general. For example, &quot;car service&quot; is better than
                    &quot;cars&quot; for a garage business.
                  </p>
                </div>
              ) : (
                <div className="grid lg:grid-cols-[1fr_220px] gap-4">
                  <div className="space-y-3">
                    <Label className="text-sm">Enter a website or a page to find keywords that match your site</Label>
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        value={pageUrl}
                        onChange={(e) => setPageUrl(e.target.value)}
                        placeholder="https://"
                        className="pl-9 h-11"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">{filterChips}</div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed lg:pt-7">
                    Use a website as a source of keywords. Default date range is last 1 month.
                  </p>
                </div>
              )}

              <Button onClick={runResearch} disabled={researching || !canGetResults}>
                {researching ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
                Get results
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {screen === "results" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={mode === "website" ? pageUrl : query.split("\n")[0] || ""}
                  readOnly
                  className="pl-8 h-9 bg-muted/30"
                  aria-label="Seed summary"
                />
              </div>
              {filterChips}
              <Button size="sm" onClick={runResearch} disabled={researching}>
                {researching ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh"}
              </Button>
            </CardContent>
          </Card>

          {(needsConfig || needsReconnect) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 p-3 text-sm">
              {needsConfig ? (
                <p>Google Ads env missing. Add developer token + customer ID in <code>.env</code>.</p>
              ) : (
                <p>
                  Ads scope missing —{" "}
                  <a href="/google" className="font-medium text-primary underline underline-offset-2">
                    Reconnect for Ads
                  </a>
                  .
                </p>
              )}
            </div>
          )}

          {researchError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/80 dark:bg-rose-950/20 p-3 text-sm text-rose-700 dark:text-rose-300 whitespace-pre-wrap">
              {(researchError as Error).message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {!researching && !researchError && requestKey && (
                <>
                  <span className="font-medium text-foreground">
                    {ideas.length.toLocaleString("en-IN")} keyword ideas available
                  </span>
                  <Badge variant="outline">Σ {formatVolume(totalVolume)} / mo</Badge>
                  <span>· {ideasData?.geoLabel || geoLabel}</span>
                  <span>· {ideasData?.dateLabel || dateMeta.label}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {ideas.length > 0 && (
                <>
                  <div className="relative w-[180px]">
                    <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Add filter…"
                      className="pl-8 h-9"
                    />
                  </div>
                  <Select value={compFilter} onValueChange={(v) => setCompFilter(v as typeof compFilter)}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Competition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All competition</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as PlannerSort)}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="volume">Sort: monthly searches</SelectItem>
                      <SelectItem value="competition">Sort: competition</SelectItem>
                      <SelectItem value="bid">Sort: top page bid</SelectItem>
                      <SelectItem value="alpha">Sort: A–Z</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => void addSelected()}>
                    <Plus className="size-3.5 mr-1" />
                    Add selected ({selected.size})
                  </Button>
                  <Button size="sm" variant="ghost" className="text-primary" onClick={downloadIdeasCsv}>
                    <Download className="size-3.5 mr-1.5" />
                    Download keyword ideas
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => setScreen("discover")}>
                Edit seeds
              </Button>
            </div>
          </div>

          {researching && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!researching && ideas.length > 0 && (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === ideas.length}
                        onCheckedChange={(checked) => {
                          setSelected(checked ? new Set(ideas.map((i) => i.keyword)) : new Set());
                        }}
                      />
                    </TableHead>
                    <TableHead>Keyword</TableHead>
                    <TableHead className="text-right min-w-[160px]">Avg. monthly searches</TableHead>
                    <TableHead className="min-w-[120px]">Competition</TableHead>
                    <TableHead className="text-right min-w-[150px]">Top of page bid (low–high)</TableHead>
                    <TableHead className="w-24 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ideas.map((idea) => {
                    const vol = idea.avgMonthlySearches ?? 0;
                    const barPct = Math.max(4, Math.round((vol / maxVolume) * 100));
                    return (
                      <TableRow key={idea.keyword}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(idea.keyword)}
                            onCheckedChange={(checked) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                checked ? next.add(idea.keyword) : next.delete(idea.keyword);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{idea.keyword}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <VolumeSparkline values={idea.monthlySearches} />
                            <div className="flex flex-col items-end gap-1">
                              <span className="tabular-nums text-sm font-medium">
                                {formatVolume(idea.avgMonthlySearches)}
                              </span>
                              <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-[#1a73e8]/80 rounded-full"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("text-[10px]", competitionBadge(idea.competition))}>
                            {idea.competition || "—"}
                            {idea.competitionIndex != null ? ` (${idea.competitionIndex})` : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {formatBid(idea.lowBidInr, idea.highBidInr)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={addingKeyword === idea.keyword}
                            onClick={() => addKeyword(idea.keyword)}
                          >
                            {addingKeyword === idea.keyword ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Plus className="size-3.5 mr-1" />
                            )}
                            Track
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {requestKey && !researching && !researchError && ideas.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
              No keyword ideas for this seed. Try broader terms (e.g. car service).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
