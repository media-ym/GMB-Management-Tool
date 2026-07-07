"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { useLocations } from "@/hooks/use-locations";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RatingStars, ScoreBadge } from "@/components/shared/badges";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Search, Map, MousePointerClick, Phone, Navigation,
  Filter, Calendar, ChevronDown, ChevronUp, ArrowUpDown, Inbox, Building2,
  Download, RefreshCw, Sparkles, AlertTriangle, AlertCircle, CheckCircle2,
  Info, TrendingUp, TrendingDown, Star, FileText, Activity, Zap, Clock,
  Server, ArrowRight, Crown, ShieldAlert, CircleDot, Target, Eye,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList,
} from "recharts";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { AnalyticsPoint, ViewKey } from "@/lib/types";

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

interface ExecutiveKpis {
  totalLocations: number;
  activeLocations: number;
  totalReviews: number;
  reviewsThisMonth: number;
  avgRating: number;
  pendingReviews: number;
  responseRate: number;
  negativeReviews: number;
  positiveReviews: number;
  searchViews: number;
  mapsViews: number;
  websiteClicks: number;
  phoneCalls: number;
  directionRequests: number;
  publishedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
  aiGeneratedPosts: number;
  avgHealthScore: number;
  avgSeoScore: number;
  syncErrors: number;
}

interface ExecutiveLocation {
  id: string;
  name: string;
  city: string;
  searchViews: number;
  websiteClicks: number;
  phoneCalls: number;
  avgRating: number;
  reviewCount: number;
  healthScore: number;
  visibilityScore: number;
  status: string;
  syncStatus: string;
}

interface ExecutiveDashboard {
  kpis: ExecutiveKpis;
  ratingDistribution: { rating: number; count: number }[];
  topPerforming: ExecutiveLocation[];
  needsAttention: ExecutiveLocation[];
  allLocations: ExecutiveLocation[];
}

type InsightType = "warning" | "success" | "info" | "critical";
type InsightImpact = "high" | "medium" | "low";

interface AiInsight {
  type: InsightType;
  category: string;
  title: string;
  description: string;
  locationName?: string;
  impact: InsightImpact;
  action?: string;
}

interface AiInsightsResponse {
  insights: AiInsight[];
  summary: { total: number; critical: number; warnings: number; successes: number };
}

interface LocationComparisonRow {
  id: string;
  name: string;
  city: string;
  avgRating: number;
  reviewCount: number;
  responseRate: number;
  searchViews: number;
  mapsViews: number;
  websiteClicks: number;
  phoneCalls: number;
  directionRequests: number;
  postsPublished: number;
  seoScore: number;
  visibilityScore: number;
}

type ComparisonSortKey =
  | "name" | "city" | "avgRating" | "reviewCount" | "responseRate"
  | "searchViews" | "mapsViews" | "websiteClicks" | "phoneCalls"
  | "directionRequests" | "postsPublished" | "seoScore" | "visibilityScore";

interface SystemData {
  syncLogs: {
    id: string; module: string; locationName: string; locationCity: string;
    status: string; startedAt: string; completedAt: string | null;
    recordsProcessed: number; recordsInserted: number; recordsUpdated: number;
    recordsFailed: number; errorMessage: string | null;
  }[];
  backgroundJobs: {
    id: string; queueName: string; jobName: string; status: string;
    attempts: number; startedAt: string | null; completedAt: string | null;
    errorMessage: string | null; createdAt: string;
  }[];
  errorLogs: {
    id: string; module: string; errorCode: string; errorMessage: string;
    resolved: boolean; createdAt: string;
  }[];
  aiUsage: {
    total: { requests: number; tokens: number; cost: number };
    daily: { date: string; requests: number; tokens: number; cost: number }[];
  };
}

type DateRangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "thisMonth" | "lastMonth";
type DashboardTab = "executive" | "marketing" | "location" | "reviews" | "seo" | "posts" | "ai" | "operations";

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

const RATING_COLORS: Record<number, string> = {
  5: "#10b981", // emerald
  4: "#14b8a6", // teal
  3: "#f59e0b", // amber
  2: "#fb923c", // orange-400
  1: "#f43f5e", // rose
};

const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
];

function dateRangeToDays(key: DateRangeKey): number {
  const now = new Date();
  switch (key) {
    case "today": return 1;
    case "yesterday": return 2;
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "thisMonth": return Math.max(1, now.getDate());
    case "lastMonth": return new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
}

/** Map an insight action string ("View SEO", "Create Post"…) to a ViewKey. */
function actionToView(action?: string): ViewKey | null {
  if (!action) return null;
  const a = action.toLowerCase();
  if (a.includes("review")) return "reviews";
  if (a.includes("seo")) return "seo";
  if (a.includes("google")) return "google";
  if (a.includes("post")) return "posts";
  if (a.includes("location")) return "locations";
  if (a.includes("notif")) return "notifications";
  if (a.includes("setting") || a.includes("system")) return "system";
  return null;
}

const INSIGHT_ICON: Record<InsightType, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const INSIGHT_BORDER: Record<InsightType, string> = {
  critical: "border-rose-500/40 bg-rose-500/[0.04]",
  warning: "border-amber-500/40 bg-amber-500/[0.04]",
  success: "border-emerald-500/40 bg-emerald-500/[0.04]",
  info: "border-teal-500/40 bg-teal-500/[0.04]",
};

const INSIGHT_ICON_COLOR: Record<InsightType, string> = {
  critical: "text-rose-500",
  warning: "text-amber-500",
  success: "text-emerald-500",
  info: "text-teal-500",
};

const INSIGHT_DOT: Record<InsightType, string> = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  info: "bg-teal-500",
};

const IMPACT_BADGE: Record<InsightImpact, string> = {
  high: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

const IMPACT_ORDER: Record<InsightImpact, number> = { high: 0, medium: 1, low: 2 };

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
  const user = useUser();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const setView = useAppStore((s) => s.setView);
  const qc = useQueryClient();
  const { data: locations } = useLocations();

  const canViewAnalytics = can(user.role, "analytics.view");
  const canExport = canViewAnalytics;
  const canSystem = can(user.role, "settings.view") || can(user.role, "audit.view");

  const [activeTab, setActiveTab] = useState<DashboardTab>("executive");
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");
  const [tableOpen, setTableOpen] = useState<boolean>(true);
  const [comparisonOpen, setComparisonOpen] = useState<boolean>(true);
  const [sortKey, setSortKey] = useState<SortKey>("searchViews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [cmpSortKey, setCmpSortKey] = useState<ComparisonSortKey>("searchViews");
  const [cmpSortDir, setCmpSortDir] = useState<"asc" | "desc">("desc");

  const days = dateRangeToDays(dateRange);

  // Build analytics query URL — relative only.
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (activeLocationId && activeLocationId !== "all") {
      params.set("locationId", activeLocationId);
    }
    return `/api/analytics?${params.toString()}`;
  }, [activeLocationId, days]);

  const { data: analyticsData, isLoading: analyticsLoading, isError: analyticsError } = useQuery<AnalyticsResponse>({
    queryKey: ["analytics", activeLocationId, days],
    queryFn: () => api<AnalyticsResponse>(queryUrl),
    staleTime: 30_000,
    enabled: canViewAnalytics,
  });

  const { data: execData, isLoading: execLoading } = useQuery<ExecutiveDashboard>({
    queryKey: ["dashboard-executive"],
    queryFn: () => api<ExecutiveDashboard>("/api/dashboard/executive"),
    staleTime: 30_000,
    enabled: canViewAnalytics,
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery<AiInsightsResponse>({
    queryKey: ["ai-insights"],
    queryFn: () => api<AiInsightsResponse>("/api/analytics/ai-insights"),
    staleTime: 30_000,
    enabled: canViewAnalytics,
  });

  const comparisonUrl = useMemo(() => `/api/analytics/location-comparison?days=${days}`, [days]);
  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<LocationComparisonRow[]>({
    queryKey: ["location-comparison", days],
    queryFn: () => api<LocationComparisonRow[]>(comparisonUrl),
    staleTime: 30_000,
    enabled: canViewAnalytics,
  });

  const { data: systemData, isLoading: systemLoading } = useQuery<SystemData>({
    queryKey: ["system-overview"],
    queryFn: () => api<SystemData>("/api/system"),
    staleTime: 30_000,
    enabled: canSystem,
  });

  const series = analyticsData?.series ?? [];
  const totals = analyticsData?.totals;
  const perLocation = analyticsData?.perLocation ?? [];
  const kpis = execData?.kpis;
  const insights = insightsData?.insights ?? [];
  const insightSummary = insightsData?.summary;

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

  const comparisonRows = useMemo(() => {
    const rows = [...(comparisonData ?? [])];
    rows.sort((a, b) => {
      let cmp = 0;
      if (cmpSortKey === "name" || cmpSortKey === "city") {
        cmp = a[cmpSortKey].localeCompare(b[cmpSortKey]);
      } else {
        cmp = (a[cmpSortKey] ?? 0) - (b[cmpSortKey] ?? 0);
      }
      return cmpSortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [comparisonData, cmpSortKey, cmpSortDir]);

  const sortedInsights = useMemo(() => {
    return [...insights].sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
  }, [insights]);

  const performanceAlerts = useMemo(
    () => sortedInsights.filter((i) => i.type === "critical" || i.type === "warning"),
    [sortedInsights],
  );

  const hasData = series.length > 0 || perLocation.length > 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function toggleComparisonSort(key: ComparisonSortKey) {
    if (cmpSortKey === key) {
      setCmpSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCmpSortKey(key);
      setCmpSortDir(key === "name" || key === "city" ? "asc" : "desc");
    }
  }

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: ["dashboard-executive"] });
    qc.invalidateQueries({ queryKey: ["ai-insights"] });
    qc.invalidateQueries({ queryKey: ["location-comparison"] });
    qc.invalidateQueries({ queryKey: ["system-overview"] });
    toast.success("Analytics refreshed", { description: "All dashboard data re-fetched." });
  }

  function handleExport() {
    const params = new URLSearchParams({ days: String(days) });
    if (activeLocationId && activeLocationId !== "all") {
      params.set("locationId", activeLocationId);
    }
    window.open(`/api/analytics/export?${params.toString()}`, "_blank");
    toast.success("CSV export started", { description: "Your download will begin shortly." });
  }

  function handleInsightAction(action?: string) {
    const v = actionToView(action);
    if (v) {
      setView(v);
      toast.success(`Opening ${v}…`);
    }
  }

  // Build the list of available tabs based on permissions
  const tabs: { value: DashboardTab; label: string; icon: typeof BarChart3; allowed: boolean }[] = [
    { value: "executive", label: "Executive", icon: BarChart3, allowed: true },
    { value: "marketing", label: "Marketing", icon: Target, allowed: true },
    { value: "location", label: "Location", icon: Building2, allowed: true },
    { value: "reviews", label: "Reviews", icon: Star, allowed: true },
    { value: "seo", label: "SEO", icon: Search, allowed: true },
    { value: "posts", label: "Posts", icon: FileText, allowed: true },
    { value: "ai", label: "AI", icon: Sparkles, allowed: true },
    { value: "operations", label: "Operations", icon: Server, allowed: canSystem },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Analytics"
        description="Business intelligence & performance dashboards"
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

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeKey)}>
              <SelectTrigger size="sm" className="w-[140px]">
                <Calendar className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canExport && (
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
              <RefreshCw className="size-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)}>
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <TabsList className="w-max">
            {tabs.filter((t) => t.allowed).map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="size-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ----------------- Executive tab ----------------- */}
        <TabsContent value="executive" className="space-y-4">
          <ExecutiveTab
            kpis={kpis}
            kpisLoading={execLoading}
            totals={totals}
            series={series}
            trendData={trendData}
            engagementData={engagementData}
            analyticsLoading={analyticsLoading}
            analyticsError={analyticsError}
            hasData={hasData}
            days={days}
            dateRangeLabel={DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? ""}
            topPerforming={execData?.topPerforming ?? []}
            needsAttention={execData?.needsAttention ?? []}
            ratingDistribution={execData?.ratingDistribution ?? []}
            insights={sortedInsights}
            insightSummary={insightSummary}
            insightsLoading={insightsLoading}
            performanceAlerts={performanceAlerts}
            onInsightAction={handleInsightAction}
            comparisonRows={comparisonRows}
            comparisonLoading={comparisonLoading}
            comparisonOpen={comparisonOpen}
            setComparisonOpen={setComparisonOpen}
            cmpSortKey={cmpSortKey}
            cmpSortDir={cmpSortDir}
            toggleComparisonSort={toggleComparisonSort}
            tableOpen={tableOpen}
            setTableOpen={setTableOpen}
            tableRows={tableRows}
            perLocation={perLocation}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            locationBars={locationBars}
          />
        </TabsContent>

        {/* ----------------- Marketing tab ----------------- */}
        <TabsContent value="marketing" className="space-y-4">
          <MarketingTab
            kpis={kpis}
            kpisLoading={execLoading}
            engagementData={engagementData}
            analyticsLoading={analyticsLoading}
            trendData={trendData}
            locationBars={locationBars}
            days={days}
            insights={sortedInsights.filter((i) => i.category === "content" || i.category === "reviews" || i.category === "reputation")}
            insightsLoading={insightsLoading}
            onInsightAction={handleInsightAction}
          />
        </TabsContent>

        {/* ----------------- Location tab ----------------- */}
        <TabsContent value="location" className="space-y-4">
          <LocationTab
            locations={locations ?? []}
            activeLocationId={activeLocationId}
            setActiveLocationId={setActiveLocationId}
            analyticsData={analyticsData}
            isLoading={analyticsLoading}
            trendData={trendData}
            days={days}
          />
        </TabsContent>

        {/* ----------------- Reviews tab ----------------- */}
        <TabsContent value="reviews" className="space-y-4">
          <ReviewsTab
            kpis={kpis}
            kpisLoading={execLoading}
            ratingDistribution={execData?.ratingDistribution ?? []}
            insights={sortedInsights.filter((i) => i.category === "reviews" || i.category === "reputation")}
            insightsLoading={insightsLoading}
            onInsightAction={handleInsightAction}
          />
        </TabsContent>

        {/* ----------------- SEO tab ----------------- */}
        <TabsContent value="seo" className="space-y-4">
          <SeoTab
            kpis={kpis}
            kpisLoading={execLoading}
            comparisonRows={comparisonRows}
            comparisonLoading={comparisonLoading}
            insights={sortedInsights.filter((i) => i.category === "seo" || i.category === "visibility")}
            insightsLoading={insightsLoading}
            onInsightAction={handleInsightAction}
          />
        </TabsContent>

        {/* ----------------- Posts tab ----------------- */}
        <TabsContent value="posts" className="space-y-4">
          <PostsTab
            kpis={kpis}
            kpisLoading={execLoading}
            insights={sortedInsights.filter((i) => i.category === "content")}
            insightsLoading={insightsLoading}
            onInsightAction={handleInsightAction}
          />
        </TabsContent>

        {/* ----------------- AI tab ----------------- */}
        <TabsContent value="ai" className="space-y-4">
          <AiTab
            insights={sortedInsights}
            insightSummary={insightSummary}
            insightsLoading={insightsLoading}
            onInsightAction={handleInsightAction}
            onRefresh={handleRefresh}
            systemData={systemData}
            systemLoading={systemLoading}
            canSystem={canSystem}
          />
        </TabsContent>

        {/* ----------------- Operations tab ----------------- */}
        <TabsContent value="operations" className="space-y-4">
          <OperationsTab
            kpis={kpis}
            kpisLoading={execLoading}
            systemData={systemData}
            systemLoading={systemLoading}
            insights={sortedInsights.filter((i) => i.category === "sync")}
            onInsightAction={handleInsightAction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Executive Tab
// ============================================================================

interface ExecutiveTabProps {
  kpis?: ExecutiveKpis;
  kpisLoading: boolean;
  totals?: AnalyticsTotals;
  series: AnalyticsPoint[];
  trendData: { date: string; search: number; maps: number }[];
  engagementData: { name: string; value: number; key: MetricKey }[];
  analyticsLoading: boolean;
  analyticsError: boolean;
  hasData: boolean;
  days: number;
  dateRangeLabel: string;
  topPerforming: ExecutiveLocation[];
  needsAttention: ExecutiveLocation[];
  ratingDistribution: { rating: number; count: number }[];
  insights: AiInsight[];
  insightSummary?: { total: number; critical: number; warnings: number; successes: number };
  insightsLoading: boolean;
  performanceAlerts: AiInsight[];
  onInsightAction: (action?: string) => void;
  comparisonRows: LocationComparisonRow[];
  comparisonLoading: boolean;
  comparisonOpen: boolean;
  setComparisonOpen: (v: boolean) => void;
  cmpSortKey: ComparisonSortKey;
  cmpSortDir: "asc" | "desc";
  toggleComparisonSort: (k: ComparisonSortKey) => void;
  tableOpen: boolean;
  setTableOpen: (v: boolean) => void;
  tableRows: (PerLocationRow["totals"] & { city: string; name: string; total: number })[];
  perLocation: PerLocationRow[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (k: SortKey) => void;
  locationBars: (PerLocationRow["totals"] & { city: string; name: string; total: number })[];
}

function ExecutiveTab(props: ExecutiveTabProps) {
  const {
    kpis, kpisLoading, totals, series, trendData, engagementData,
    analyticsLoading, analyticsError, hasData, days, dateRangeLabel,
    topPerforming, needsAttention, ratingDistribution,
    insights, insightSummary, insightsLoading, performanceAlerts,
    onInsightAction, comparisonRows, comparisonLoading, comparisonOpen,
    setComparisonOpen, cmpSortKey, cmpSortDir, toggleComparisonSort,
    tableOpen, setTableOpen, tableRows, perLocation, sortKey, sortDir,
    toggleSort, locationBars,
  } = props;

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {kpisLoading || !kpis ? (
          Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Active Locations" value={kpis.activeLocations} icon={Building2} accent="emerald" hint={`of ${kpis.totalLocations} total`} />
            <StatCard label="Total Reviews" value={fmt(kpis.totalReviews)} icon={Star} accent="amber" hint={`${kpis.reviewsThisMonth} this month`} />
            <StatCard label="Avg Rating" value={kpis.avgRating.toFixed(2)} icon={Star} accent="teal" hint={`${kpis.responseRate}% response rate`} />
            <StatCard label="Search Views" value={fmt(kpis.searchViews)} icon={Search} accent="emerald" hint="30-day total" />
            <StatCard label="Website Clicks" value={fmt(kpis.websiteClicks)} icon={MousePointerClick} accent="rose" hint="30-day total" />
            <StatCard label="Phone Calls" value={fmt(kpis.phoneCalls)} icon={Phone} accent="amber" hint="30-day total" />
            <StatCard label="Direction Requests" value={fmt(kpis.directionRequests)} icon={Navigation} accent="teal" hint="30-day total" />
            <StatCard label="Published Posts" value={kpis.publishedPosts} icon={FileText} accent="emerald" hint={`${kpis.aiGeneratedPosts} AI-generated`} />
            <StatCard label="Avg Health Score" value={kpis.avgHealthScore} icon={Activity} accent="rose" hint="across all locations" />
            <StatCard label="Avg SEO Score" value={kpis.avgSeoScore} icon={TrendingUp} accent="slate" hint="across all locations" />
          </>
        )}
      </div>

      {/* Performance alerts banner */}
      {!insightsLoading && performanceAlerts.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/[0.03]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  Performance Alerts
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                    {performanceAlerts.length} active
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {performanceAlerts.filter((a) => a.type === "critical").length} critical ·{" "}
                  {performanceAlerts.filter((a) => a.type === "warning").length} warnings
                </p>
                <ul className="mt-3 space-y-2">
                  {performanceAlerts.slice(0, 4).map((a, i) => {
                    const Icon = INSIGHT_ICON[a.type];
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Icon className={cn("size-4 mt-0.5 shrink-0", INSIGHT_ICON_COLOR[a.type])} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{a.title}</span>
                          <span className="text-muted-foreground"> — {a.description}</span>
                        </span>
                        {a.action && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs shrink-0" onClick={() => onInsightAction(a.action)}>
                            {a.action} <ArrowRight className="size-3 ml-1" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {analyticsError ? (
        <EmptyState
          title="Couldn't load analytics"
          description="There was a problem fetching Google Business Profile metrics. Try a different location or date range."
        />
      ) : !hasData && !analyticsLoading ? (
        <EmptyState
          title="No analytics data"
          description={`No Google Business Profile metrics recorded for ${dateRangeLabel} for this selection.`}
        />
      ) : (
        <>
          {/* Main trend + engagement pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardSection
              title="Search & Maps Views Trend"
              description={`Daily totals · ${dateRangeLabel}`}
              className="lg:col-span-2"
              action={<Badge variant="outline" className="text-xs">{days}d</Badge>}
            >
              <div className="h-[280px]">
                {analyticsLoading || trendData.length === 0 ? (
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
                {analyticsLoading || engagementData.length === 0 ? (
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

          {/* AI Insights section */}
          <CardSection
            title="AI Insights"
            description="Rule-based recommendations from MiSA AI"
            action={insightSummary ? (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                  {insightSummary.critical} critical
                </Badge>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                  {insightSummary.warnings} warnings
                </Badge>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                  {insightSummary.successes} successes
                </Badge>
              </div>
            ) : undefined}
          >
            {insightsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
              </div>
            ) : insights.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500 mb-2" />
                No active insights — everything looks healthy.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} onAction={onInsightAction} />
                ))}
              </div>
            )}
          </CardSection>

          {/* Top performers + Needs attention */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardSection
              title="Top Performing Locations"
              description="Highest visibility over the last 30 days"
              action={<Badge variant="outline" className="text-xs">Top {topPerforming.length}</Badge>}
            >
              {kpisLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
                </div>
              ) : topPerforming.length === 0 ? (
                <EmptyRow icon={Crown} text="No top-performing locations yet." />
              ) : (
                <ul className="space-y-2">
                  {topPerforming.map((loc, i) => (
                    <li key={loc.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30 transition">
                      <div className="size-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{loc.name}</div>
                        <div className="text-xs text-muted-foreground">{loc.city}</div>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        <div className="font-semibold tabular-nums">{fmt(loc.searchViews)}</div>
                        <div className="text-muted-foreground">views</div>
                      </div>
                      <RatingStars rating={loc.avgRating} size={11} showValue={false} />
                      <ScoreBadge score={loc.healthScore} />
                    </li>
                  ))}
                </ul>
              )}
            </CardSection>

            <CardSection
              title="Locations Requiring Attention"
              description="Low health score or sync errors"
              action={<Badge variant="outline" className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">{needsAttention.length}</Badge>}
            >
              {kpisLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
                </div>
              ) : needsAttention.length === 0 ? (
                <EmptyRow icon={CheckCircle2} text="All locations are healthy." />
              ) : (
                <ul className="space-y-2">
                  {needsAttention.map((loc) => (
                    <li key={loc.id} className="flex items-center gap-3 p-2 rounded-md border border-rose-500/20 bg-rose-500/[0.03]">
                      <div className="size-7 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <ShieldAlert className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{loc.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {loc.city} · {loc.syncStatus === "error" ? "Sync error" : `Health ${loc.healthScore}/100`}
                        </div>
                      </div>
                      <ScoreBadge score={loc.healthScore} />
                    </li>
                  ))}
                </ul>
              )}
            </CardSection>
          </div>

          {/* Rating distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardSection
              title="Rating Distribution"
              description="All reviews across locations"
              className="lg:col-span-2"
            >
              {kpisLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <RatingDistributionBars distribution={ratingDistribution} />
              )}
            </CardSection>

            <CardSection
              title="Conversion Funnel"
              description="Discovery → Engagement drop-off"
            >
              {analyticsLoading || !totals ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Funnel totals={totals} />
              )}
            </CardSection>
          </div>

          {/* Location Comparison table */}
          <Collapsible open={comparisonOpen} onOpenChange={setComparisonOpen}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b cursor-pointer hover:bg-accent/30 transition">
                  <div>
                    <h3 className="text-sm font-semibold">Location Comparison</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {comparisonRows.length} location{comparisonRows.length !== 1 ? "s" : ""} · click to {comparisonOpen ? "collapse" : "expand"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    {comparisonOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    {comparisonOpen ? "Hide" : "Show"}
                  </Button>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 sm:p-5">
                  {comparisonLoading ? (
                    <Skeleton className="h-72 w-full" />
                  ) : comparisonRows.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">No comparison data for this selection.</div>
                  ) : (
                    <LocationComparisonTable
                      rows={comparisonRows}
                      sortKey={cmpSortKey}
                      sortDir={cmpSortDir}
                      onSort={toggleComparisonSort}
                    />
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Per-location breakdown table (legacy, kept) */}
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
                  {analyticsLoading ? (
                    <Skeleton className="h-72 w-full" />
                  ) : perLocation.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">No location-level data for this selection.</div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto scroll-area rounded-md">
                      <div className="overflow-x-auto scroll-area">
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
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Top locations bar chart */}
          <CardSection
            title="Top Locations by Search Views"
            description={`Top ${Math.min(10, locationBars.length)} by visibility · ${dateRangeLabel}`}
            action={<Badge variant="outline" className="text-xs">Top {Math.min(10, locationBars.length)}</Badge>}
          >
            <div className="h-[300px]">
              {analyticsLoading || locationBars.length === 0 ? (
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
        </>
      )}
    </>
  );
}

// ============================================================================
// Marketing Tab
// ============================================================================

interface MarketingTabProps {
  kpis?: ExecutiveKpis;
  kpisLoading: boolean;
  engagementData: { name: string; value: number; key: MetricKey }[];
  analyticsLoading: boolean;
  trendData: { date: string; search: number; maps: number }[];
  locationBars: (PerLocationRow["totals"] & { city: string; name: string; total: number })[];
  days: number;
  insights: AiInsight[];
  insightsLoading: boolean;
  onInsightAction: (action?: string) => void;
}

function MarketingTab(props: MarketingTabProps) {
  const { kpis, kpisLoading, engagementData, analyticsLoading, trendData, locationBars, days, insights, insightsLoading, onInsightAction } = props;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {kpisLoading || !kpis ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Published Posts" value={kpis.publishedPosts} icon={FileText} accent="emerald" hint="All-time" />
            <StatCard label="Scheduled Posts" value={kpis.scheduledPosts} icon={Clock} accent="amber" hint="Awaiting publish" />
            <StatCard label="AI-Generated Posts" value={kpis.aiGeneratedPosts} icon={Sparkles} accent="teal" hint="Via MiSA AI" />
            <StatCard label="Response Rate" value={`${kpis.responseRate}%`} icon={Target} accent="rose" hint="Review replies" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection
          title="Engagement Breakdown"
          description="Clicks · Calls · Directions"
          className="lg:col-span-1"
        >
          <div className="h-[240px]">
            {analyticsLoading || engagementData.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={engagementData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                    {engagementData.map((d) => <Cell key={d.key} fill={METRIC_COLORS[d.key]} />)}
                    <LabelList dataKey="value" position="outside" formatter={(v: number) => fmt(v)} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardSection>

        <CardSection
          title="Search Views Trend"
          description={`Last ${days} days`}
          className="lg:col-span-2"
        >
          <div className="h-[240px]">
            {analyticsLoading || trendData.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mSearch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={METRIC_COLORS.searchViews} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={METRIC_COLORS.searchViews} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => fmt(v)} />
                  <Area type="monotone" dataKey="search" name="Search Views" stroke={METRIC_COLORS.searchViews} strokeWidth={2} fill="url(#mSearch)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection
          title="Top Locations by Search Views"
          description={`Top ${Math.min(10, locationBars.length)}`}
        >
          <div className="h-[280px]">
            {analyticsLoading || locationBars.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationBars} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }} barCategoryGap={8}>
                  <defs>
                    <linearGradient id="mLoc" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={METRIC_HEX.searchViews} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={METRIC_HEX.searchViews} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} />
                  <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={88} interval={0} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [fmt(v), "Search Views"]} />
                  <Bar dataKey="searchViews" name="Search Views" fill="url(#mLoc)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    <LabelList dataKey="searchViews" position="right" formatter={(v: number) => fmt(v)} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardSection>

        <CardSection
          title="Content & Reputation Insights"
          description="From MiSA AI"
          action={<Badge variant="outline" className="text-xs">{insights.length}</Badge>}
        >
          {insightsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
            </div>
          ) : insights.length === 0 ? (
            <EmptyRow icon={CheckCircle2} text="No content insights at this time." />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto scroll-area">
              {insights.map((ins, i) => <InsightCard key={i} insight={ins} onAction={onInsightAction} compact />)}
            </div>
          )}
        </CardSection>
      </div>
    </>
  );
}

// ============================================================================
// Location Tab
// ============================================================================

interface LocationTabProps {
  locations: { id: string; name: string; city: string }[];
  activeLocationId: string | "all";
  setActiveLocationId: (id: string | "all") => void;
  analyticsData?: AnalyticsResponse;
  isLoading: boolean;
  trendData: { date: string; search: number; maps: number }[];
  days: number;
}

function LocationTab(props: LocationTabProps) {
  const { locations, activeLocationId, setActiveLocationId, analyticsData, isLoading, trendData, days } = props;

  // If no location is selected, prompt the user to pick one.
  const selectedId = activeLocationId !== "all" ? activeLocationId : (locations[0]?.id ?? "");
  const totals = analyticsData?.totals;
  const series = analyticsData?.series ?? [];

  // Compute deltas for this location's series
  const delta = (k: MetricKey) => computeDelta(series, k);

  return (
    <>
      <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Building2 className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Location Deep Dive</h3>
              <p className="text-xs text-muted-foreground">Select a single location to inspect its metrics</p>
            </div>
          </div>
          <div className="sm:ml-auto">
            <Select value={selectedId} onValueChange={(v) => setActiveLocationId(v as string)}>
              <SelectTrigger size="sm" className="w-[220px] sm:w-[260px]">
                <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name} · {l.city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!totals ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Search Views" value={fmt(totals.searchViews)} icon={Search} accent="emerald" hint={`Last ${days} days`} delta={delta("searchViews")} deltaLabel="vs prior half" />
          <StatCard label="Maps Views" value={fmt(totals.mapsViews)} icon={Map} accent="amber" hint={`Last ${days} days`} delta={delta("mapsViews")} deltaLabel="vs prior half" />
          <StatCard label="Website Clicks" value={fmt(totals.websiteClicks)} icon={MousePointerClick} accent="teal" hint={`Last ${days} days`} delta={delta("websiteClicks")} deltaLabel="vs prior half" />
          <StatCard label="Phone Calls" value={fmt(totals.phoneCalls)} icon={Phone} accent="rose" hint={`Last ${days} days`} delta={delta("phoneCalls")} deltaLabel="vs prior half" />
          <StatCard label="Direction Requests" value={fmt(totals.directionRequests)} icon={Navigation} accent="emerald" hint={`Last ${days} days`} delta={delta("directionRequests")} deltaLabel="vs prior half" />
          <StatCard label="Engagement Total" value={fmt(totals.websiteClicks + totals.phoneCalls + totals.directionRequests)} icon={Activity} accent="amber" hint={`Last ${days} days`} />
          <StatCard label="Conversion Rate" value={`${totals.searchViews > 0 ? Math.round(((totals.websiteClicks + totals.phoneCalls + totals.directionRequests) / totals.searchViews) * 100) : 0}%`} icon={Zap} accent="teal" hint="Engagement / Discovery" />
          <StatCard label="Data Points" value={series.length} icon={BarChart3} accent="slate" hint={`Daily series, ${days}d`} />
        </div>
      )}

      <CardSection
        title="Daily Trend"
        description={`Search & Maps views · ${days} days`}
        action={<Badge variant="outline" className="text-xs">{days}d</Badge>}
      >
        <div className="h-[300px]">
          {isLoading || trendData.length === 0 ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="locSearch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={METRIC_COLORS.searchViews} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={METRIC_COLORS.searchViews} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="locMaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={METRIC_COLORS.mapsViews} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={METRIC_COLORS.mapsViews} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="search" name="Search Views" stroke={METRIC_COLORS.searchViews} strokeWidth={2} fill="url(#locSearch)" />
                <Area type="monotone" dataKey="maps" name="Maps Views" stroke={METRIC_COLORS.mapsViews} strokeWidth={2} fill="url(#locMaps)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardSection>

      {totals && (
        <CardSection title="Conversion Funnel" description="Discovery → Engagement for this location">
          <Funnel totals={totals} />
        </CardSection>
      )}
    </>
  );
}

// ============================================================================
// Reviews Tab
// ============================================================================

interface ReviewsTabProps {
  kpis?: ExecutiveKpis;
  kpisLoading: boolean;
  ratingDistribution: { rating: number; count: number }[];
  insights: AiInsight[];
  insightsLoading: boolean;
  onInsightAction: (action?: string) => void;
}

function ReviewsTab(props: ReviewsTabProps) {
  const { kpis, kpisLoading, ratingDistribution, insights, insightsLoading, onInsightAction } = props;
  const totalReviews = ratingDistribution.reduce((a, r) => a + r.count, 0);
  const sentimentPos = kpis?.positiveReviews ?? 0;
  const sentimentNeg = kpis?.negativeReviews ?? 0;
  const sentimentNeu = Math.max(0, (kpis?.totalReviews ?? 0) - sentimentPos - sentimentNeg);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {kpisLoading || !kpis ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total Reviews" value={fmt(kpis.totalReviews)} icon={Star} accent="emerald" hint={`${kpis.reviewsThisMonth} this month`} />
            <StatCard label="Avg Rating" value={kpis.avgRating.toFixed(2)} icon={Star} accent="amber" hint="All locations" />
            <StatCard label="Response Rate" value={`${kpis.responseRate}%`} icon={Target} accent="teal" hint="Replied / total" />
            <StatCard label="Negative Reviews" value={kpis.negativeReviews} icon={TrendingDown} accent="rose" hint="1–2★ total" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection title="Rating Distribution" description={`${totalReviews} total reviews`}>
          {kpisLoading ? <Skeleton className="h-48 w-full" /> : <RatingDistributionBars distribution={ratingDistribution} />}
        </CardSection>

        <CardSection title="Sentiment Breakdown" description="Based on rating thresholds">
          {kpisLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-3">
              <SentimentRow icon={Star} color="emerald" label="Positive (4–5★)" value={sentimentPos} total={kpis?.totalReviews ?? 1} />
              <SentimentRow icon={CircleDot} color="amber" label="Neutral (3★)" value={sentimentNeu} total={kpis?.totalReviews ?? 1} />
              <SentimentRow icon={TrendingDown} color="rose" label="Negative (1–2★)" value={sentimentNeg} total={kpis?.totalReviews ?? 1} />
              <div className="pt-3 mt-3 border-t text-xs text-muted-foreground">
                Pending reply (negative reviews): <span className="font-semibold text-foreground">{kpis?.pendingReviews ?? 0}</span>
              </div>
            </div>
          )}
        </CardSection>
      </div>

      <CardSection
        title="Reputation Insights"
        description="AI-detected review patterns"
        action={<Badge variant="outline" className="text-xs">{insights.length}</Badge>}
      >
        {insightsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : insights.length === 0 ? (
          <EmptyRow icon={CheckCircle2} text="No reputation insights — review health is good." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} insight={ins} onAction={onInsightAction} />)}
          </div>
        )}
      </CardSection>
    </>
  );
}

function SentimentRow({ icon: Icon, color, label, value, total }: { icon: typeof Star; color: "emerald" | "amber" | "rose"; label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const colorMap = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon className={cn("size-3.5", color === "emerald" ? "text-emerald-500" : color === "amber" ? "text-amber-500" : "text-rose-500")} />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          <span className="text-foreground font-semibold">{value}</span> ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", colorMap[color])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ============================================================================
// SEO Tab
// ============================================================================

interface SeoTabProps {
  kpis?: ExecutiveKpis;
  kpisLoading: boolean;
  comparisonRows: LocationComparisonRow[];
  comparisonLoading: boolean;
  insights: AiInsight[];
  insightsLoading: boolean;
  onInsightAction: (action?: string) => void;
}

function SeoTab(props: SeoTabProps) {
  const { kpis, kpisLoading, comparisonRows, comparisonLoading, insights, insightsLoading, onInsightAction } = props;

  const topByVisibility = useMemo(
    () => [...comparisonRows].sort((a, b) => b.visibilityScore - a.visibilityScore).slice(0, 10),
    [comparisonRows],
  );
  const seoIssues = comparisonRows.filter((r) => r.visibilityScore < 70 || r.seoScore < 70);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {kpisLoading || !kpis ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Avg SEO Score" value={kpis.avgSeoScore} icon={Search} accent="emerald" hint="Across locations" />
            <StatCard label="Avg Health Score" value={kpis.avgHealthScore} icon={Activity} accent="amber" hint="Across locations" />
            <StatCard label="Total Locations" value={kpis.totalLocations} icon={Building2} accent="teal" hint={`${kpis.activeLocations} active`} />
            <StatCard label="Sync Errors" value={kpis.syncErrors} icon={AlertTriangle} accent="rose" hint="Locations failing" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection title="Visibility Score by Location" description="Top 10 locations by visibility">
          <div className="h-[300px]">
            {comparisonLoading || topByVisibility.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topByVisibility.map((r) => ({ city: r.city, visibility: r.visibilityScore, seo: r.seoScore }))} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={88} interval={0} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                  <Bar dataKey="visibility" name="Visibility" fill={METRIC_HEX.searchViews} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardSection>

        <CardSection
          title="Locations with SEO Issues"
          description="Visibility or SEO score below 70"
          action={<Badge variant="outline" className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">{seoIssues.length}</Badge>}
        >
          {comparisonLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
            </div>
          ) : seoIssues.length === 0 ? (
            <EmptyRow icon={CheckCircle2} text="All locations have healthy SEO scores." />
          ) : (
            <div className="max-h-72 overflow-y-auto scroll-area space-y-2">
              {seoIssues.map((loc) => (
                <div key={loc.id} className="flex items-center gap-3 p-2 rounded-md border border-amber-500/20 bg-amber-500/[0.03]">
                  <div className="size-7 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Eye className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{loc.name}</div>
                    <div className="text-xs text-muted-foreground">{loc.city}</div>
                  </div>
                  <ScoreBadge score={loc.visibilityScore} label="vis" />
                  <ScoreBadge score={loc.seoScore} label="seo" />
                </div>
              ))}
            </div>
          )}
        </CardSection>
      </div>

      <CardSection
        title="SEO Insights"
        description="AI-detected visibility opportunities"
        action={<Badge variant="outline" className="text-xs">{insights.length}</Badge>}
      >
        {insightsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : insights.length === 0 ? (
          <EmptyRow icon={CheckCircle2} text="No SEO insights at this time." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} insight={ins} onAction={onInsightAction} />)}
          </div>
        )}
      </CardSection>
    </>
  );
}

// ============================================================================
// Posts Tab
// ============================================================================

interface PostsTabProps {
  kpis?: ExecutiveKpis;
  kpisLoading: boolean;
  insights: AiInsight[];
  insightsLoading: boolean;
  onInsightAction: (action?: string) => void;
}

function PostsTab(props: PostsTabProps) {
  const { kpis, kpisLoading, insights, insightsLoading, onInsightAction } = props;

  const typeData = useMemo(() => {
    if (!kpis) return [];
    return [
      { name: "Published", value: kpis.publishedPosts, color: METRIC_HEX.searchViews },
      { name: "Scheduled", value: kpis.scheduledPosts, color: METRIC_HEX.mapsViews },
      { name: "Drafts", value: kpis.draftPosts, color: METRIC_HEX.websiteClicks },
      { name: "AI-Generated", value: kpis.aiGeneratedPosts, color: METRIC_HEX.phoneCalls },
    ].filter((d) => d.value > 0);
  }, [kpis]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {kpisLoading || !kpis ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total Posts" value={kpis.publishedPosts + kpis.scheduledPosts + kpis.draftPosts} icon={FileText} accent="emerald" hint="All statuses" />
            <StatCard label="Published" value={kpis.publishedPosts} icon={CheckCircle2} accent="teal" hint="Live on Google" />
            <StatCard label="Scheduled" value={kpis.scheduledPosts} icon={Clock} accent="amber" hint="Awaiting publish" />
            <StatCard label="Drafts" value={kpis.draftPosts} icon={FileText} accent="slate" hint="Not yet scheduled" />
            <StatCard label="AI-Generated" value={kpis.aiGeneratedPosts} icon={Sparkles} accent="rose" hint="Via MiSA AI" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection title="Post Status Distribution" description="Across all locations">
          <div className="h-[260px]">
            {kpisLoading || typeData.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                    {typeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    <LabelList dataKey="value" position="outside" style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardSection>

        <CardSection
          title="Content Insights"
          description="Posting frequency & opportunities"
          action={<Badge variant="outline" className="text-xs">{insights.length}</Badge>}
        >
          {insightsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
            </div>
          ) : insights.length === 0 ? (
            <EmptyRow icon={CheckCircle2} text="No content insights — posting cadence looks healthy." />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto scroll-area">
              {insights.map((ins, i) => <InsightCard key={i} insight={ins} onAction={onInsightAction} compact />)}
            </div>
          )}
        </CardSection>
      </div>
    </>
  );
}

// ============================================================================
// AI Tab
// ============================================================================

interface AiTabProps {
  insights: AiInsight[];
  insightSummary?: { total: number; critical: number; warnings: number; successes: number };
  insightsLoading: boolean;
  onInsightAction: (action?: string) => void;
  onRefresh: () => void;
  systemData?: SystemData;
  systemLoading: boolean;
  canSystem: boolean;
}

function AiTab(props: AiTabProps) {
  const { insights, insightSummary, insightsLoading, onInsightAction, onRefresh, systemData, systemLoading, canSystem } = props;
  return (
    <>
      {insightSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Total Insights" value={insightSummary.total} icon={Sparkles} accent="emerald" hint="All categories" />
          <StatCard label="Critical" value={insightSummary.critical} icon={AlertTriangle} accent="rose" hint="Immediate action" />
          <StatCard label="Warnings" value={insightSummary.warnings} icon={AlertCircle} accent="amber" hint="Monitor closely" />
          <StatCard label="Successes" value={insightSummary.successes} icon={CheckCircle2} accent="teal" hint="Going strong" />
        </div>
      )}

      <CardSection
        title="All AI Insights"
        description="Rule-based recommendations sorted by impact"
        action={
          <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-1.5">
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        }
      >
        {insightsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : insights.length === 0 ? (
          <EmptyRow icon={CheckCircle2} text="No active insights — everything looks healthy." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} insight={ins} onAction={onInsightAction} />)}
          </div>
        )}
      </CardSection>

      {canSystem && (
        <CardSection
          title="AI Usage Stats"
          description="Last 7 days · MiSA AI consumption"
        >
          {systemLoading || !systemData ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UsageStat icon={Zap} label="Total Requests" value={systemData.aiUsage.total.requests.toString()} accent="emerald" />
              <UsageStat icon={Activity} label="Total Tokens" value={fmt(systemData.aiUsage.total.tokens)} accent="amber" />
              <UsageStat icon={Target} label="Est. Cost" value={`₹${systemData.aiUsage.total.cost.toFixed(2)}`} accent="teal" />
            </div>
          )}
        </CardSection>
      )}
    </>
  );
}

function UsageStat({ icon: Icon, label, value, accent }: { icon: typeof Zap; label: string; value: string; accent: "emerald" | "amber" | "teal" }) {
  const colorMap = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  };
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
      <div className={cn("size-10 rounded-lg flex items-center justify-center shrink-0", colorMap[accent])}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Operations Tab
// ============================================================================

interface OperationsTabProps {
  kpis?: ExecutiveKpis;
  kpisLoading: boolean;
  systemData?: SystemData;
  systemLoading: boolean;
  insights: AiInsight[];
  onInsightAction: (action?: string) => void;
}

function OperationsTab(props: OperationsTabProps) {
  const { kpis, kpisLoading, systemData, systemLoading, insights, onInsightAction } = props;

  const syncStatusCounts = useMemo(() => {
    const logs = systemData?.syncLogs ?? [];
    return {
      success: logs.filter((l) => l.status === "success").length,
      failed: logs.filter((l) => l.status === "failed").length,
      running: logs.filter((l) => l.status === "running").length,
    };
  }, [systemData]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {kpisLoading || !kpis ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total Locations" value={kpis.totalLocations} icon={Building2} accent="emerald" hint={`${kpis.activeLocations} active`} />
            <StatCard label="Sync Errors" value={kpis.syncErrors} icon={AlertTriangle} accent="rose" hint="Failing locations" />
            <StatCard label="Pending Reviews" value={kpis.pendingReviews} icon={Star} accent="amber" hint="Awaiting reply" />
            <StatCard label="Avg Health Score" value={kpis.avgHealthScore} icon={Activity} accent="teal" hint="Across locations" />
          </>
        )}
      </div>

      {insights.length > 0 && (
        <CardSection title="Sync Insights" description="AI-detected sync issues" action={<Badge variant="outline" className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">{insights.length}</Badge>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} insight={ins} onAction={onInsightAction} />)}
          </div>
        </CardSection>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection title="Sync Status" description="Recent sync log summary">
          {systemLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !systemData ? (
            <EmptyRow icon={Server} text="No sync logs available." />
          ) : (
            <div className="space-y-3">
              <SyncStatRow label="Successful" value={syncStatusCounts.success} color="emerald" />
              <SyncStatRow label="Failed" value={syncStatusCounts.failed} color="rose" />
              <SyncStatRow label="Running" value={syncStatusCounts.running} color="amber" />
              <div className="pt-3 mt-3 border-t text-xs text-muted-foreground">
                Showing last {systemData.syncLogs.length} sync runs
              </div>
            </div>
          )}
        </CardSection>

        <CardSection title="Recent Sync Logs" description="Last 8 runs" className="lg:col-span-2">
          {systemLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
            </div>
          ) : !systemData || systemData.syncLogs.length === 0 ? (
            <EmptyRow icon={Inbox} text="No sync logs recorded." />
          ) : (
            <div className="max-h-72 overflow-y-auto scroll-area space-y-2">
              {systemData.syncLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-2 rounded-md border">
                  <div className={cn(
                    "size-2 rounded-full shrink-0",
                    log.status === "success" ? "bg-emerald-500" : log.status === "failed" ? "bg-rose-500" : "bg-amber-500",
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {log.module} <span className="text-muted-foreground font-normal">· {log.locationName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {log.recordsProcessed} processed · {log.recordsFailed > 0 && <span className="text-rose-500">{log.recordsFailed} failed · </span>}
                      {formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-xs shrink-0",
                    log.status === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                    log.status === "failed" ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" :
                    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                  )}>
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection
          title="Recent Errors"
          description="Last 8 error logs"
          action={<Badge variant="outline" className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">{systemData?.errorLogs.length ?? 0}</Badge>}
        >
          {systemLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
            </div>
          ) : !systemData || systemData.errorLogs.length === 0 ? (
            <EmptyRow icon={CheckCircle2} text="No recent errors — system is healthy." />
          ) : (
            <div className="max-h-72 overflow-y-auto scroll-area space-y-2">
              {systemData.errorLogs.slice(0, 8).map((err) => (
                <div key={err.id} className="flex items-start gap-3 p-2 rounded-md border border-rose-500/20 bg-rose-500/[0.03]">
                  <AlertTriangle className="size-4 text-rose-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {err.module} <span className="text-muted-foreground font-mono text-xs">[{err.errorCode}]</span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{err.errorMessage}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(err.createdAt), { addSuffix: true })}
                      {err.resolved && <span className="ml-1.5 text-emerald-500">· resolved</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardSection>

        <CardSection
          title="Background Jobs"
          description="Recent queue activity"
          action={<Badge variant="outline" className="text-xs">{systemData?.backgroundJobs.length ?? 0}</Badge>}
        >
          {systemLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
            </div>
          ) : !systemData || systemData.backgroundJobs.length === 0 ? (
            <EmptyRow icon={Inbox} text="No background jobs recorded." />
          ) : (
            <div className="max-h-72 overflow-y-auto scroll-area space-y-2">
              {systemData.backgroundJobs.slice(0, 8).map((job) => (
                <div key={job.id} className="flex items-center gap-3 p-2 rounded-md border">
                  <Activity className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{job.jobName}</div>
                    <div className="text-xs text-muted-foreground">
                      Queue: {job.queueName} · {job.attempts} attempt{job.attempts !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-xs shrink-0",
                    job.status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                    job.status === "failed" ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" :
                    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                  )}>
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardSection>
      </div>
    </>
  );
}

function SyncStatRow({ label, value, color }: { label: string; value: number; color: "emerald" | "amber" | "rose" }) {
  const colorMap = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 font-medium">
        <span className={cn("size-2 rounded-full", colorMap[color])} />
        {label}
      </span>
      <span className="tabular-nums font-semibold">{value}</span>
    </div>
  );
}

// ============================================================================
// Shared sub-components
// ============================================================================

function InsightCard({ insight, onAction, compact = false }: { insight: AiInsight; onAction: (action?: string) => void; compact?: boolean }) {
  const Icon = INSIGHT_ICON[insight.type];
  const view = actionToView(insight.action);
  return (
    <div className={cn("rounded-lg border p-3 sm:p-4 flex flex-col gap-2", INSIGHT_BORDER[insight.type])}>
      <div className="flex items-start gap-2">
        <Icon className={cn("size-4 mt-0.5 shrink-0", INSIGHT_ICON_COLOR[insight.type])} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-tight">{insight.title}</h4>
            <Badge variant="outline" className={cn("text-[10px] shrink-0 px-1.5 py-0", IMPACT_BADGE[insight.impact])}>
              {insight.impact}
            </Badge>
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.description}</p>
          )}
          {!compact && insight.locationName && (
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <Building2 className="size-3" /> {insight.locationName}
            </div>
          )}
        </div>
      </div>
      {insight.action && view && (
        <Button size="sm" variant="ghost" className="h-7 self-end text-xs gap-1" onClick={() => onAction(insight.action)}>
          {insight.action} <ArrowRight className="size-3" />
        </Button>
      )}
    </div>
  );
}

function RatingDistributionBars({ distribution }: { distribution: { rating: number; count: number }[] }) {
  const total = distribution.reduce((a, r) => a + r.count, 0);
  const sorted = [...distribution].sort((a, b) => b.rating - a.rating);
  if (total === 0) {
    return <EmptyRow icon={Star} text="No reviews recorded yet." />;
  }
  return (
    <div className="space-y-2.5">
      {sorted.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <div key={r.rating}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="flex">
                  {Array.from({ length: r.rating }).map((_, i) => (
                    <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                  ))}
                </span>
                <span className="text-muted-foreground">{r.rating}★</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                <span className="text-foreground font-semibold">{r.count}</span> ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: RATING_COLORS[r.rating] }} />
            </div>
          </div>
        );
      })}
      <div className="pt-3 mt-2 border-t text-[11px] text-muted-foreground">
        Total: <span className="font-semibold text-foreground">{total}</span> reviews across all locations
      </div>
    </div>
  );
}

function LocationComparisonTable({
  rows, sortKey, sortDir, onSort,
}: {
  rows: LocationComparisonRow[];
  sortKey: ComparisonSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: ComparisonSortKey) => void;
}) {
  return (
    <div className="max-h-96 overflow-y-auto scroll-area rounded-md">
      <div className="overflow-x-auto scroll-area">
        <Table>
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>
            <ComparisonSortableHead label="Location" sortKey="name" current={sortKey} dir={sortDir} onSort={onSort} />
            <ComparisonSortableHead label="Rating" sortKey="avgRating" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Reviews" sortKey="reviewCount" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Resp %" sortKey="responseRate" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Search" sortKey="searchViews" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Clicks" sortKey="websiteClicks" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Calls" sortKey="phoneCalls" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Directions" sortKey="directionRequests" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Posts" sortKey="postsPublished" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="SEO" sortKey="seoScore" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <ComparisonSortableHead label="Visibility" sortKey="visibilityScore" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Building2 className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate max-w-[160px]">{row.name}</div>
                    <div className="text-[10px] text-muted-foreground">{row.city}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span className={cn(
                  "inline-flex items-center gap-1 tabular-nums",
                  row.avgRating >= 4.5 ? "text-emerald-600 dark:text-emerald-400" :
                  row.avgRating >= 4.0 ? "text-amber-600 dark:text-amber-400" :
                  "text-rose-600 dark:text-rose-400",
                )}>
                  <Star className="size-3 fill-current" />
                  {row.avgRating.toFixed(1)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.reviewCount}</TableCell>
              <TableCell className="text-right tabular-nums">{row.responseRate}%</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(row.searchViews)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(row.websiteClicks)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(row.phoneCalls)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(row.directionRequests)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.postsPublished}</TableCell>
              <TableCell className="text-right">
                <ScoreBadge score={row.seoScore} />
              </TableCell>
              <TableCell className="text-right">
                <ScoreBadge score={row.visibilityScore} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ComparisonSortableHead({
  label, sortKey, current, dir, onSort, align = "left",
}: {
  label: string;
  sortKey: ComparisonSortKey;
  current: ComparisonSortKey;
  dir: "asc" | "desc";
  onSort: (k: ComparisonSortKey) => void;
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

function EmptyRow({ icon: Icon, text }: { icon: typeof Inbox; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 text-sm text-muted-foreground">
      <Icon className="size-7 mb-2 opacity-60" />
      {text}
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
