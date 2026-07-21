"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore, roleLabel } from "@/lib/store";
import { useAppNavigation } from "@/hooks/use-app-navigation";
import { useUser } from "@/lib/user-context";
import { useLocations } from "@/hooks/use-locations";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard, MiniStatCard, ScoreStatCard } from "@/components/shared/stat-card";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { NumberedPagination } from "@/components/shared/numbered-pagination";
import {
  RatingStars, SentimentBadge, ScoreBadge, SyncStatusBadge,
} from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Star, TrendingUp, MousePointerClick, Phone, Navigation,
  Bell, Search, RefreshCw, MapPin, AlertTriangle, ArrowRight,
  CheckCircle2, ExternalLink, FileText, ChevronDown, BarChart3, Eye, Map,
  Bot, MessageSquare, Sparkles,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { DashboardSummary, ReviewWithLocation, NotificationItem, AnalyticsPoint } from "@/lib/types";
import { can } from "@/lib/permissions";
import { setMisaPendingPrompt } from "@/lib/misa-handoff";
import { appendDurationToParams } from "@/lib/location-filter";
import {
  GmbTimePeriodFilter,
  defaultGmbPeriod,
  formatGmbPeriodLabel,
  gmbPeriodToDateParams,
  type GmbPeriodValue,
} from "@/components/shared/gmb-time-period-filter";

const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

type MisaInsight = {
  type: "warning" | "success" | "info" | "critical";
  category: string;
  title: string;
  description: string;
  locationName?: string;
  impact: "high" | "medium" | "low";
  action?: string;
};

export function DashboardView() {
  const user = useUser();
  const { navigate } = useAppNavigation();
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const qc = useQueryClient();
  const { data: allLocations } = useLocations();

  /** GMB-style period (default: last 6 calendar months, e.g. Feb–Jul) */
  const [period, setPeriod] = useState<GmbPeriodValue>(() => defaultGmbPeriod(5));

  const filterLabel = useMemo(() => {
    if (selectedLocationIds.length === 0) return "All locations";
    if (selectedLocationIds.length === 1) {
      const loc = allLocations?.find((l) => l.id === selectedLocationIds[0]);
      return loc?.name || "1 location";
    }
    return `${selectedLocationIds.length} locations`;
  }, [selectedLocationIds, allLocations]);

  const durationLabel = formatGmbPeriodLabel(period);
  const dateRange = useMemo(() => gmbPeriodToDateParams(period), [period]);

  const dashboardQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedLocationIds.length > 0) params.set("locationIds", selectedLocationIds.join(","));
    appendDurationToParams(params, "custom", dateRange);
    const qs = params.toString();
    return `/api/dashboard${qs ? `?${qs}` : ""}`;
  }, [selectedLocationIds, dateRange]);

  const analyticsQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedLocationIds.length > 0) params.set("locationIds", selectedLocationIds.join(","));
    appendDurationToParams(params, "custom", dateRange);
    return `/api/analytics?${params.toString()}`;
  }, [selectedLocationIds, dateRange]);

  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", selectedLocationIds, dateRange],
    queryFn: () => api<DashboardSummary>(dashboardQueryUrl),
  });

  const { data: reviews } = useQuery<ReviewWithLocation[]>({
    queryKey: ["reviews", "latest"],
    queryFn: () => api<ReviewWithLocation[]>("/api/reviews?limit=5&status=pending"),
  });

  const { data: notifs } = useQuery<NotificationItem[]>({
    queryKey: ["notifications", "latest"],
    queryFn: () => api<NotificationItem[]>("/api/notifications?limit=5"),
  });

  const keywordsMonths = useMemo(() => {
    if (period.mode === "months") {
      const span =
        (period.to.year - period.from.year) * 12 + (period.to.month - period.from.month) + 1;
      return Math.min(12, Math.max(1, span));
    }
    const from = new Date(period.from);
    const to = new Date(period.to);
    const months = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (30 * 24 * 60 * 60 * 1000)),
    );
    return Math.min(12, months);
  }, [period]);

  const { data: searchKeywords } = useQuery<{ keywords: { keyword: string; impressions: number }[] }>({
    queryKey: ["search-keywords", selectedLocationIds, keywordsMonths],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("months", String(keywordsMonths));
      if (selectedLocationIds.length > 0) params.set("locationIds", selectedLocationIds.join(","));
      return api<{ keywords: { keyword: string; impressions: number }[] }>(`/api/analytics/keywords?${params.toString()}`);
    },
  });

  const { data: analytics } = useQuery<{ series: AnalyticsPoint[] }>({
    queryKey: ["analytics", "dashboard", selectedLocationIds, dateRange],
    queryFn: () => api<{ series: AnalyticsPoint[] }>(analyticsQueryUrl),
  });

  const canUseAi = can(user.role, "ai.use");

  const { data: misaInsights } = useQuery<{
    insights: MisaInsight[];
    summary: { total: number; critical: number; warnings: number; successes: number };
  }>({
    queryKey: ["dashboard-misa-insights"],
    queryFn: () => api("/api/analytics/ai-insights"),
    enabled: canUseAi || can(user.role, "analytics.view"),
    staleTime: 60_000,
  });

  function openMisa(prompt?: string) {
    if (!canUseAi) {
      toast.error("MiSA AI access nahi hai is role pe");
      return;
    }
    if (prompt) setMisaPendingPrompt(prompt);
    navigate("ai");
  }

  async function handleSync() {
    try {
      toast.loading("Triggering Google sync…", { id: "sync-dash" });
      await api("/api/dashboard", { method: "POST", body: JSON.stringify({}) });
      qc.invalidateQueries();
      toast.success("Sync complete.", { id: "sync-dash" });
    } catch (e: any) {
      toast.error(e.message || "Sync failed", { id: "sync-dash" });
    }
  }

  const chartData = (analytics?.series ?? []).map((p) => ({
    date: new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    search: p.searchViews,
    maps: p.mapsViews,
    clicks: p.websiteClicks,
    calls: p.phoneCalls,
    directions: p.directionRequests,
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`Here's what's happening across MyFNG locations today. You're signed in as ${roleLabel(user.role)}.`}
        icon={Building2}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <LocationMultiSelect
              locations={allLocations}
              selectedIds={selectedLocationIds}
              onChange={setSelectedLocationIds}
            />
            <GmbTimePeriodFilter
              value={period}
              onChange={setPeriod}
              className="w-[158px] sm:w-[178px]"
            />
            <Button variant="outline" size="sm" onClick={() => navigate("analytics")}>
              View analytics <ArrowRight className="size-3.5 ml-1" />
            </Button>
            <Button size="sm" onClick={handleSync} disabled={summary?.googleConnected === false}>
              <RefreshCw className="size-3.5 mr-1.5" /> Sync now
            </Button>
          </div>
        }
      />

      {/* Google disconnected banner */}
      {summary && summary.googleConnected === false && (
        <Card className="border-slate-500/30 bg-slate-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-slate-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Google Business Profile disconnected</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Live reviews, analytics, and impressions are hidden. Reconnect from Google Integration to sync data again.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("google")}>
              Connect <ArrowRight className="size-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sync error banner */}
      {summary && summary.syncErrors > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {summary.syncErrors} location{summary.syncErrors > 1 ? "s" : ""} have sync errors
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Google OAuth token may have expired. Re-authorize from the Locations page to resume syncing.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("locations")}>
              Review <ArrowRight className="size-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI stat cards with gradient backgrounds */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {isLoading || !summary ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard icon={MapPin} label="Locations" value={summary.totalLocations} hint={`${summary.activeLocations} active`} accent="emerald" />
            <StatCard icon={Star} label="Total Reviews" value={fmt(summary.totalReviews)} hint={`${summary.pendingReviews} pending`} accent="amber" />
            <StatCard icon={Eye} label="Impressions" value={fmt(summary.totalSearchViews + summary.totalMapsViews)} hint={durationLabel} accent="blue" />
            <StatCard
              icon={MousePointerClick}
              label="Interactions"
              value={fmt(summary.totalInteractions ?? (summary.totalWebsiteClicks + summary.totalPhoneCalls + summary.totalDirectionRequests + (summary.totalConversations ?? 0) + (summary.totalBookings ?? 0)))}
              hint={durationLabel}
              accent="violet"
            />
            <StatCard icon={Phone} label="Phone Calls" value={fmt(summary.totalPhoneCalls)} hint={durationLabel} accent="rose" />
            <StatCard
              icon={MessageSquare}
              label="Chat Clicks"
              value={(summary.totalConversations ?? 0) > 0 ? fmt(summary.totalConversations ?? 0) : "—"}
              hint={
                (summary.totalConversations ?? 0) > 0
                  ? durationLabel
                  : "GMB UI shows this · Google API no longer returns it"
              }
              accent="cyan"
            />
          </>
        )}
      </div>

      {/* Secondary KPIs with colored backgrounds */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <MiniStatCard icon={Navigation} label="Direction Requests" value={fmt(summary.totalDirectionRequests)} accent="orange" />
            <MiniStatCard icon={Map} label="Maps Views" value={fmt(summary.totalMapsViews)} accent="emerald" />
            <ScoreStatCard label="Avg Health Score" value={summary.avgHealthScore} />
            <ScoreStatCard label="Avg Visibility" value={summary.avgVisibilityScore} />
          </>
        )}
      </div>

      {/* Performance Section with time period filter */}
      <CardSection
        title="Performance"
        description={`Business Profile interactions · ${durationLabel} · ${filterLabel}`}
        icon={BarChart3}
        accent="blue"
        action={
          <GmbTimePeriodFilter value={period} onChange={setPeriod} />
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <PerfMetric icon={Search} label="Search Views" value={summary?.totalSearchViews ?? 0} color="text-blue-500 bg-blue-100 dark:bg-blue-900/30" />
          <PerfMetric icon={Map} label="Maps Views" value={summary?.totalMapsViews ?? 0} color="text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30" />
          <PerfMetric icon={MousePointerClick} label="Website Clicks" value={summary?.totalWebsiteClicks ?? 0} color="text-violet-500 bg-violet-100 dark:bg-violet-900/30" />
          <PerfMetric icon={Phone} label="Phone Calls" value={summary?.totalPhoneCalls ?? 0} color="text-amber-500 bg-amber-100 dark:bg-amber-900/30" />
          <PerfMetric icon={Navigation} label="Directions" value={summary?.totalDirectionRequests ?? 0} color="text-rose-500 bg-rose-100 dark:bg-rose-900/30" />
          <PerfMetric
            icon={MessageSquare}
            label="Chat Clicks"
            value={summary?.totalConversations ?? 0}
            displayValue={(summary?.totalConversations ?? 0) > 0 ? undefined : "—"}
            hint={(summary?.totalConversations ?? 0) > 0 ? undefined : "Not in Google API"}
            color="text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30"
          />
        </div>
        <div className="h-72">
          {chartData.length === 0 ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSearch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gMaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "var(--foreground)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="search" name="Search Views" stroke="#3b82f6" strokeWidth={2} fill="url(#gSearch)" />
                <Area type="monotone" dataKey="maps" name="Maps Views" stroke="#10b981" strokeWidth={2} fill="url(#gMaps)" />
                <Area type="monotone" dataKey="clicks" name="Website Clicks" stroke="#8b5cf6" strokeWidth={2} fill="url(#gClicks)" />
                <Area type="monotone" dataKey="calls" name="Calls" stroke="#f59e0b" strokeWidth={1.5} fill="none" strokeDasharray="5 5" />
                <Area type="monotone" dataKey="directions" name="Directions" stroke="#ef4444" strokeWidth={1.5} fill="none" strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardSection>

      {/* Business Performance KPI Carousel — same date + location filter as KPIs */}
      <CardSection
        title="Business Performance"
        description={`${durationLabel} · ${filterLabel}`}
        icon={TrendingUp}
      >
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          <PerfKpiCard label="Profile Views" value={fmt((summary?.totalSearchViews ?? 0) + (summary?.totalMapsViews ?? 0))} change={null} index={0} />
          <PerfKpiCard
            label="Interactions"
            value={fmt(summary?.totalInteractions ?? ((summary?.totalWebsiteClicks ?? 0) + (summary?.totalPhoneCalls ?? 0) + (summary?.totalDirectionRequests ?? 0) + (summary?.totalConversations ?? 0) + (summary?.totalBookings ?? 0)))}
            change={null}
            index={1}
          />
          <PerfKpiCard label="Call Clicks" value={fmt(summary?.totalPhoneCalls ?? 0)} change={null} index={2} />
          <PerfKpiCard label="Direction Clicks" value={fmt(summary?.totalDirectionRequests ?? 0)} change={null} index={3} />
          <PerfKpiCard label="Website Clicks" value={fmt(summary?.totalWebsiteClicks ?? 0)} change={null} index={4} />
          <PerfKpiCard
            label="Chat Clicks"
            value={(summary?.totalConversations ?? 0) > 0 ? fmt(summary?.totalConversations ?? 0) : "—"}
            change={null}
            index={5}
          />
          <PerfKpiCard label="Bookings" value={fmt(summary?.totalBookings ?? 0)} change={null} index={6} />
          <PerfKpiCard label="Search Views" value={fmt(summary?.totalSearchViews ?? 0)} change={null} index={7} />
          <PerfKpiCard label="Maps Views" value={fmt(summary?.totalMapsViews ?? 0)} change={null} index={8} />
        </div>
      </CardSection>

      {/* Audit / Suspension / Profile Strength row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 border-emerald-200/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Audit Status</div>
                <div className="text-xs text-muted-foreground">Profile completion</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2.5 rounded-full bg-white/60 dark:bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${summary ? Math.round((summary.avgHealthScore / 100) * 100) : 0}%` }} />
              </div>
              <span className="text-sm font-bold tabular-nums">{summary?.avgHealthScore ?? 0}%</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">Strength: {(summary?.avgHealthScore ?? 0) >= 80 ? "High" : (summary?.avgHealthScore ?? 0) >= 50 ? "Medium" : "Low"}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Suspension Risk</div>
                <div className="text-xs text-muted-foreground">Guideline compliance</div>
              </div>
            </div>
            <Badge className={cn(
              (summary?.syncErrors ?? 0) > 0
                ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400",
            )}>
              {(summary?.syncErrors ?? 0) > 0 ? "Needs attention" : "Low risk"}
            </Badge>
            <div className="text-xs text-muted-foreground mt-2">{summary?.syncErrors ?? 0} issues detected</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-xl bg-violet-500 text-white flex items-center justify-center shadow-sm">
                <BarChart3 className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Profile Strength</div>
                <div className="text-xs text-muted-foreground">Average across locations</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold tabular-nums">{((summary?.avgHealthScore ?? 0) / 10).toFixed(1)}</div>
              <span className="text-sm text-muted-foreground">/ 10</span>
            </div>
            <div className="flex-1 h-2.5 rounded-full bg-white/60 dark:bg-white/10 overflow-hidden mt-2">
              <div className="h-full rounded-full bg-violet-500" style={{ width: `${summary?.avgHealthScore ?? 0}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How People Discovered You — Search Terms — Posts Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/20 dark:to-blue-950/20 border-sky-200/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-8 rounded-lg bg-blue-500 text-white flex items-center justify-center">
                <Eye className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">How People Discovered You</h3>
                <p className="text-[10px] text-muted-foreground">Platform & device breakdown</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg bg-white/60 dark:bg-white/10 p-3 text-center">
                <div className="text-xl font-bold tabular-nums">{fmt((summary?.totalSearchViews ?? 0) + (summary?.totalMapsViews ?? 0))}</div>
                <div className="text-[10px] text-muted-foreground">People viewed your profile</div>
              </div>
              <div className="rounded-lg bg-white/60 dark:bg-white/10 p-3 text-center">
                <div className="text-xl font-bold tabular-nums">
                  {fmt((searchKeywords?.keywords ?? []).reduce((a, k) => a + (k.impressions || 0), 0))}
                </div>
                <div className="text-[10px] text-muted-foreground">Search term impressions</div>
              </div>
            </div>
            {(() => {
              const sd = summary?.totalSearchDesktop ?? 0;
              const sm = summary?.totalSearchMobile ?? 0;
              const md = summary?.totalMapsDesktop ?? 0;
              const mm = summary?.totalMapsMobile ?? 0;
              const total = sd + sm + md + mm;
              if (total <= 0) {
                return (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    Sync analytics to load Maps/Search device breakdown.
                  </div>
                );
              }
              const rows = [
                { label: "Google Maps - mobile", value: mm, color: "bg-rose-500" },
                { label: "Google Search - mobile", value: sm, color: "bg-amber-500" },
                { label: "Google Search - desktop", value: sd, color: "bg-blue-500" },
                { label: "Google Maps - desktop", value: md, color: "bg-emerald-500" },
              ];
              return (
                <div className="space-y-2">
                  {rows.map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-[11px]">
                      <span className={cn("size-2 rounded-full shrink-0", r.color)} />
                      <span className="flex-1 text-muted-foreground truncate">{r.label}</span>
                      <span className="font-semibold tabular-nums">{fmt(r.value)}</span>
                      <span className="text-muted-foreground w-9 text-right tabular-nums">
                        {Math.round((r.value / total) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20 border-indigo-200/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center">
                <Search className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Searches Breakdown</h3>
                <p className="text-[10px] text-muted-foreground">Search terms that showed your profile</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {(searchKeywords?.keywords ?? []).slice(0, 5).length > 0 ? (
                (searchKeywords?.keywords ?? []).slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground w-4 text-right tabular-nums">{i + 1}.</span>
                    <span className="flex-1 font-medium">{item.keyword}</span>
                    <span className="text-muted-foreground tabular-nums">{item.impressions < 15 ? "< 15" : item.impressions}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Search keywords will appear after syncing your profile data.
                </div>
              )}
            </div>
            <button
              className="mt-3 text-xs text-primary font-medium hover:underline"
              onClick={() =>
                navigate("keywords", {
                  search: `tab=searches&months=${keywordsMonths}`,
                })
              }
            >
              See more →
            </button>
          </CardContent>
        </Card>

        <CardSection
          title="Posts Overview"
          description="Content pipeline"
          accent="amber"
          action={<Button variant="ghost" size="sm" onClick={() => navigate("content-updates")}>Open <ArrowRight className="size-3.5 ml-1" /></Button>}
        >
          <div className="space-y-3">
            <PostPipelineRow icon={CheckCircle2} label="Published" value={summary?.publishedPosts ?? 0} color="text-emerald-500" />
            <PostPipelineRow icon={Sparkles} label="Scheduled" value={summary?.scheduledPosts ?? 0} color="text-amber-500" />
            <PostPipelineRow icon={FileText} label="Drafts" value={summary?.draftPosts ?? 0} color="text-slate-500" />
            <div className="pt-3 border-t">
              <Button
                className="w-full bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] text-white hover:brightness-110"
                size="sm"
                onClick={() => openMisa("Pune / Mumbai ke liye next Google post draft karo - offer + CTA")}
                disabled={!canUseAi}
              >
                <Sparkles className="size-3.5 mr-1.5" /> Generate with MiSA AI
              </Button>
            </div>
          </div>
        </CardSection>
      </div>

      {/* Listings Table */}
      <ListingsTable locations={allLocations ?? []} onNavigate={() => navigate("locations")} />

      {/* Latest reviews + AI suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection
          title="Reviews needing attention"
          description="Pending replies, lowest ratings first"
          className="lg:col-span-2"
          action={<Button variant="ghost" size="sm" onClick={() => navigate("reviews")}>All reviews <ArrowRight className="size-3.5 ml-1" /></Button>}
        >
          <div className="space-y-3 max-h-96 overflow-y-auto scroll-area pr-1">
            {!reviews || reviews.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500 mb-2" />
                All caught up — no pending reviews.
              </div>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-amber-100 dark:border-amber-900/30 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/10 dark:to-orange-950/10 p-3 hover:shadow-sm transition cursor-pointer" onClick={() => navigate("reviews")}>
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                      {r.authorName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium truncate">{r.authorName}</span>
                          <span className="text-xs text-muted-foreground"> · {r.locationCity}</span>
                        </div>
                        <RatingStars rating={r.rating} showValue={false} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.text}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <SentimentBadge sentiment={r.sentiment} />
                        <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardSection>

        <CardSection
          title="MiSA AI Suggestions"
          description="Live priorities + quick actions"
          accent="cyan"
          action={<Bot className="size-4 text-[#0096FF]" />}
        >
          <div className="space-y-3">
            {(misaInsights?.insights ?? []).slice(0, 3).map((ins, i) => (
              <AiSuggestion
                key={`insight-${i}`}
                icon={ins.type === "success" ? CheckCircle2 : AlertTriangle}
                accent={
                  ins.type === "critical" || ins.type === "warning"
                    ? "text-rose-500 bg-rose-500/10"
                    : ins.type === "success"
                      ? "text-emerald-500 bg-emerald-500/10"
                      : "text-[#0096FF] bg-[#0096FF]/10"
                }
                title={ins.title}
                body={ins.description}
                action={canUseAi ? "Ask MiSA" : ins.action || "Open"}
                onClick={() =>
                  canUseAi
                    ? openMisa(`${ins.title}. Short action plan do.`)
                    : navigate(
                        ins.action?.includes("Review")
                          ? "reviews"
                          : ins.action?.includes("SEO")
                            ? "seo"
                            : "locations",
                      )
                }
              />
            ))}
            {(summary?.pendingReviews ?? 0) > 0 && (
              <AiSuggestion
                icon={AlertTriangle}
                accent="text-rose-500 bg-rose-500/10"
                title={`${summary?.pendingReviews} reviews awaiting reply`}
                body="Low-rated reviews impact local SEO. MiSA se empathetic replies draft karo."
                action="Reply with MiSA"
                onClick={() =>
                  canUseAi
                    ? openMisa("Pending negative reviews ka reply draft karo - short aur on-brand")
                    : navigate("reviews")
                }
              />
            )}
            {(summary?.draftPosts ?? 0) > 0 && (
              <AiSuggestion
                icon={TrendingUp}
                accent="text-amber-500 bg-amber-500/10"
                title={`${summary?.draftPosts} draft post${summary?.draftPosts === 1 ? "" : "s"} ready`}
                body="Publish or schedule drafts to keep listings active on Google."
                action="View posts"
                onClick={() => navigate("posts")}
              />
            )}
            {(summary?.syncErrors ?? 0) > 0 && (
              <AiSuggestion
                icon={Search}
                accent="text-teal-500 bg-teal-500/10"
                title={`${summary?.syncErrors} location sync error${summary?.syncErrors === 1 ? "" : "s"}`}
                body="Fix sync issues to keep reviews, posts and analytics up to date."
                action="View locations"
                onClick={() => navigate("locations")}
              />
            )}
            {(misaInsights?.insights?.length ?? 0) === 0 &&
              (summary?.pendingReviews ?? 0) === 0 &&
              (summary?.draftPosts ?? 0) === 0 &&
              (summary?.syncErrors ?? 0) === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No urgent actions - your listings look healthy.
                </div>
              )}
            <Button
              variant="outline"
              size="sm"
              className="w-full border-[#0096FF]/30"
              onClick={() => openMisa()}
              disabled={!canUseAi}
            >
              <Bot className="size-3.5 mr-1.5" /> Ask MiSA AI
            </Button>
          </div>
        </CardSection>
      </div>

      {/* Ranking summary + notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection
          title="Ranking Summary"
          description="Local SEO snapshot"
          className="lg:col-span-2"
          action={<Button variant="ghost" size="sm" onClick={() => navigate("seo")}>Open SEO <ArrowRight className="size-3.5 ml-1" /></Button>}
        >
          <RankingMini />
        </CardSection>

        <CardSection
          title="Recent Notifications"
          description="System & alerts"
          action={<Bell className="size-4 text-muted-foreground" />}
        >
          <div className="space-y-2 max-h-72 overflow-y-auto scroll-area pr-1">
            {!notifs || notifs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No notifications</div>
            ) : (
              notifs.map((n) => (
                <div key={n.id} className="rounded-lg border p-2.5 cursor-pointer hover:bg-accent/30 transition" onClick={() => n.link && navigate(n.link as any)}>
                  <div className="flex items-start gap-2">
                    <NotifDot severity={n.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{n.title}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardSection>
      </div>

    </div>
  );
}

function PostPipelineRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={cn("size-4", color)} />
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function InsightDot({ type }: { type: MisaInsight["type"] }) {
  const color =
    type === "critical"
      ? "bg-rose-500"
      : type === "warning"
        ? "bg-amber-500"
        : type === "success"
          ? "bg-emerald-500"
          : "bg-[#0096FF]";
  return <span className={cn("size-1.5 rounded-full shrink-0", color)} />;
}

function AiSuggestion({ icon: Icon, accent, title, body, action, onClick }: { icon: any; accent: string; title: string; body: string; action: string; onClick: () => void }) {
  return (
    <div className="rounded-lg border border-[#0047AB]/12 bg-gradient-to-r from-[#0047AB]/[0.04] to-[#0096FF]/[0.06] p-3">
      <div className="flex items-start gap-2.5">
        <div className={cn("size-7 rounded-md flex items-center justify-center shrink-0", accent)}><Icon className="size-3.5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-3">{body}</p>
          <button type="button" onClick={onClick} className="mt-1.5 text-[11px] font-medium text-[#0047AB] dark:text-[#0096FF] hover:underline inline-flex items-center gap-0.5">
            {action} <ArrowRight className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifDot({ severity }: { severity: string }) {
  const color = severity === "critical" ? "bg-rose-500" : severity === "warning" ? "bg-amber-500" : severity === "success" ? "bg-emerald-500" : "bg-slate-400";
  return <span className={cn("size-2 rounded-full mt-1.5 shrink-0", color)} />;
}

function RankingMini() {
  const { data } = useQuery<{ keywords: any[]; overview: any }>({
    queryKey: ["seo", "mini"],
    queryFn: () => api<{ keywords: any[]; overview: any }>("/api/seo"),
  });
  if (!data) return <Skeleton className="h-48" />;
  const top = (data.keywords ?? []).slice().sort((a, b) => (a.avgRank ?? 99) - (b.avgRank ?? 99)).slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Avg Rank" value={data.overview.avgRank ? `#${data.overview.avgRank}` : "—"} />
        <MiniMetric label="Top 3" value={`${data.overview.top3Count}`} />
        <MiniMetric label="Top 10" value={`${data.overview.top10Count}`} />
        <MiniMetric label="Keywords" value={`${data.overview.totalKeywords}`} />
      </div>
      <div className="space-y-1.5">
        {top.map((k) => (
          <div key={k.id} className="flex items-center gap-2 text-xs py-1.5 border-b last:border-0">
            <span className="font-medium truncate flex-1">{k.keyword}</span>
            <Badge variant="outline" className="text-[10px]">{k.city}</Badge>
            <span className={cn("font-semibold tabular-nums w-8 text-right", (k.avgRank ?? 99) <= 3 ? "text-emerald-500" : (k.avgRank ?? 99) <= 10 ? "text-amber-500" : "text-rose-500")}>
              #{k.avgRank ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const KPI_COLORS = [
  "from-blue-50 to-sky-50 dark:from-blue-950/20 dark:to-sky-950/20 border-blue-200/50",
  "from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200/50",
  "from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200/50",
  "from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 border-rose-200/50",
  "from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200/50",
  "from-cyan-50 to-sky-50 dark:from-cyan-950/20 dark:to-sky-950/20 border-cyan-200/50",
  "from-green-50 to-lime-50 dark:from-green-950/20 dark:to-lime-950/20 border-green-200/50",
];

function PerfKpiCard({ label, value, change, index = 0 }: { label: string; value: string; change: number | null; index?: number }) {
  return (
    <div className={cn("min-w-[150px] rounded-xl border p-4 shrink-0 bg-gradient-to-br shadow-sm", KPI_COLORS[index % KPI_COLORS.length])}>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {change !== null && (
        <div className={cn("text-xs font-medium mt-1", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
          {change >= 0 ? "+" : ""}{change.toFixed(1)}%
          <span className="text-muted-foreground ml-1">vs Last Month</span>
        </div>
      )}
    </div>
  );
}

function ListingsTable({ locations, onNavigate }: { locations: any[]; onNavigate: () => void }) {
  const [page, setPage] = useState(0);
  const perPage = 15;
  const totalPages = Math.ceil(locations.length / perPage);
  const paged = locations.slice(page * perPage, (page + 1) * perPage);

  if (locations.length === 0) return null;

  return (
    <CardSection
      title="Listings Overview"
      description={`${locations.length} locations`}
      icon={MapPin}
      action={<Button variant="ghost" size="sm" onClick={onNavigate}>View all <ArrowRight className="size-3.5 ml-1" /></Button>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-muted-foreground">Location</th>
              <th className="pb-2 font-medium text-muted-foreground">City</th>
              <th className="pb-2 font-medium text-muted-foreground text-center">Rating</th>
              <th className="pb-2 font-medium text-muted-foreground text-center">Reviews</th>
              <th className="pb-2 font-medium text-muted-foreground text-center">Health</th>
              <th className="pb-2 font-medium text-muted-foreground text-center">Sync</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((loc) => (
              <tr key={loc.id} className="border-b last:border-0 hover:bg-accent/30 transition">
                <td className="py-2.5 font-medium max-w-[200px] truncate">{loc.name}</td>
                <td className="py-2.5 text-muted-foreground">{loc.city}</td>
                <td className="py-2.5 text-center">
                  <span className={cn("font-semibold", (loc.avgRating ?? 0) >= 4 ? "text-emerald-500" : (loc.avgRating ?? 0) >= 3 ? "text-amber-500" : "text-rose-500")}>
                    {loc.avgRating?.toFixed(1) ?? "—"}
                  </span>
                </td>
                <td className="py-2.5 text-center tabular-nums">{loc.reviewCount ?? 0}</td>
                <td className="py-2.5 text-center">
                  <Badge variant="outline" className={cn("text-[10px]", (loc.healthScore ?? 0) >= 75 ? "text-emerald-600" : (loc.healthScore ?? 0) >= 50 ? "text-amber-600" : "text-rose-600")}>
                    {loc.healthScore ?? 0}%
                  </Badge>
                </td>
                <td className="py-2.5 text-center">
                  <SyncStatusBadge status={loc.syncStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NumberedPagination
        page={page}
        totalPages={Math.max(1, totalPages)}
        totalItems={locations.length}
        perPage={perPage}
        onPageChange={setPage}
        itemLabel="locations"
        hideWhenSinglePage
        className="mt-3"
      />
    </CardSection>
  );
}

function PerfMetric({
  icon: Icon,
  label,
  value,
  color,
  displayValue,
  hint,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  displayValue?: string;
  hint?: string;
}) {
  const parts = color.split(" ");
  const textColor = parts[0] || "";
  const bgColor = parts.slice(1).join(" ") || "bg-primary/10";
  return (
    <div className={cn("rounded-xl p-3 flex items-center gap-3 shadow-sm border-0", bgColor)}>
      <div className="size-10 rounded-lg flex items-center justify-center bg-white/60 dark:bg-white/10 shrink-0">
        <Icon className={cn("size-5", textColor)} />
      </div>
      <div>
        <div className="text-lg font-bold tabular-nums leading-tight">{displayValue ?? fmt(value)}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
        {hint && <div className="text-[9px] text-muted-foreground/80 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}
