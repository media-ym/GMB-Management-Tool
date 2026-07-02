"use client";

import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore, roleLabel } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  RatingStars, SentimentBadge, ScoreBadge, SyncStatusBadge,
} from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Star, TrendingUp, MousePointerClick, Phone, Navigation,
  Sparkles, Bell, Search, RefreshCw, MapPin, AlertTriangle, ArrowRight,
  CheckCircle2, ExternalLink, FileText,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { DashboardSummary, ReviewWithLocation, NotificationItem, AnalyticsPoint } from "@/lib/types";

const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

export function DashboardView() {
  const user = useUser();
  const setView = useAppStore((s) => s.setView);
  const qc = useQueryClient();

  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<DashboardSummary>("/api/dashboard"),
  });

  const { data: reviews } = useQuery<ReviewWithLocation[]>({
    queryKey: ["reviews", "latest"],
    queryFn: () => api<ReviewWithLocation[]>("/api/reviews?limit=5&status=pending"),
  });

  const { data: notifs } = useQuery<NotificationItem[]>({
    queryKey: ["notifications", "latest"],
    queryFn: () => api<NotificationItem[]>("/api/notifications?limit=5"),
  });

  const { data: analytics } = useQuery<{ series: AnalyticsPoint[] }>({
    queryKey: ["analytics", "dashboard"],
    queryFn: () => api<{ series: AnalyticsPoint[] }>("/api/analytics?days=30"),
  });

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
          <>
            <Button variant="outline" size="sm" onClick={() => setView("analytics")}>
              View analytics <ArrowRight className="size-3.5 ml-1" />
            </Button>
            <Button size="sm" onClick={handleSync}>
              <RefreshCw className="size-3.5 mr-1.5" /> Sync now
            </Button>
          </>
        }
      />

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
            <Button variant="outline" size="sm" onClick={() => setView("locations")}>
              Review <ArrowRight className="size-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {isLoading || !summary ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Locations" value={summary.totalLocations} icon={MapPin} hint={`${summary.activeLocations} active`} accent="emerald" />
            <StatCard label="Total Reviews" value={fmt(summary.totalReviews)} icon={Star} hint={`${summary.pendingReviews} pending reply`} accent="amber" />
            <StatCard label="Avg Rating" value={summary.avgRating.toFixed(2)} icon={TrendingUp} hint="Across all locations" accent="teal" />
            <StatCard label="Search Views" value={fmt(summary.totalSearchViews)} icon={Search} hint="Last 30 days" accent="emerald" delta={8} />
            <StatCard label="Website Clicks" value={fmt(summary.totalWebsiteClicks)} icon={MousePointerClick} hint="Last 30 days" accent="rose" delta={12} />
            <StatCard label="Phone Calls" value={fmt(summary.totalPhoneCalls)} icon={Phone} hint="Last 30 days" accent="slate" delta={-3} />
          </>
        )}
      </div>

      {/* Secondary KPIs + visibility/health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <MiniStat icon={Navigation} label="Direction Requests" value={fmt(summary.totalDirectionRequests)} accent="teal" />
            <MiniStat icon={TrendingUp} label="Maps Views" value={fmt(summary.totalMapsViews)} accent="emerald" />
            <ScoreCard label="Avg Health Score" value={summary.avgHealthScore} />
            <ScoreCard label="Avg Visibility" value={summary.avgVisibilityScore} />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection
          title="Search & Maps Views"
          description="Last 30 days across all locations"
          className="lg:col-span-2"
          action={<Badge variant="outline" className="text-xs">30d</Badge>}
        >
          <div className="h-72">
            {chartData.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSearch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gMaps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
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
                  <Area type="monotone" dataKey="search" name="Search Views" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gSearch)" />
                  <Area type="monotone" dataKey="maps" name="Maps Views" stroke="var(--chart-2)" strokeWidth={2} fill="url(#gMaps)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardSection>

        <CardSection
          title="Posts Overview"
          description="Content pipeline"
          action={<Button variant="ghost" size="sm" onClick={() => setView("posts")}>Open <ArrowRight className="size-3.5 ml-1" /></Button>}
        >
          <div className="space-y-3">
            <PostPipelineRow icon={CheckCircle2} label="Published" value={summary?.publishedPosts ?? 0} color="text-emerald-500" />
            <PostPipelineRow icon={Sparkles} label="Scheduled" value={summary?.scheduledPosts ?? 0} color="text-amber-500" />
            <PostPipelineRow icon={FileText} label="Drafts" value={summary?.draftPosts ?? 0} color="text-slate-500" />
            <div className="pt-3 border-t">
              <Button className="w-full" size="sm" onClick={() => setView("posts")}>
                <Sparkles className="size-3.5 mr-1.5" /> Generate with MiSA AI
              </Button>
            </div>
          </div>
        </CardSection>
      </div>

      {/* Latest reviews + AI suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection
          title="Reviews needing attention"
          description="Pending replies, lowest ratings first"
          className="lg:col-span-2"
          action={<Button variant="ghost" size="sm" onClick={() => setView("reviews")}>All reviews <ArrowRight className="size-3.5 ml-1" /></Button>}
        >
          <div className="space-y-3 max-h-96 overflow-y-auto scroll-area pr-1">
            {!reviews || reviews.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500 mb-2" />
                All caught up — no pending reviews.
              </div>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 hover:bg-accent/30 transition cursor-pointer" onClick={() => setView("reviews")}>
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
          description="Auto-detected priorities"
          action={<Sparkles className="size-4 text-amber-500" />}
        >
          <div className="space-y-3">
            <AiSuggestion
              icon={AlertTriangle}
              accent="text-rose-500 bg-rose-500/10"
              title={`${summary?.pendingReviews ?? 0} reviews awaiting reply`}
              body="Low-rated reviews impact local SEO. Use MiSA AI to draft empathetic replies in seconds."
              action="Reply now"
              onClick={() => setView("reviews")}
            />
            <AiSuggestion
              icon={TrendingUp}
              accent="text-amber-500 bg-amber-500/10"
              title="Refresh posts on underperforming locations"
              body="3 locations haven't posted in 14+ days. MiSA AI can generate week-ready content."
              action="Generate posts"
              onClick={() => setView("posts")}
            />
            <AiSuggestion
              icon={Search}
              accent="text-teal-500 bg-teal-500/10"
              title="SEO ranking dropped on 2 keywords"
              body="'modular kitchen mumbai' and 'home interiors pune' slipped this week. Review recommendations."
              action="View SEO"
              onClick={() => setView("seo")}
            />
            <Button variant="outline" size="sm" className="w-full" onClick={() => setView("ai")}>
              <Sparkles className="size-3.5 mr-1.5" /> Ask MiSA AI
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
          action={<Button variant="ghost" size="sm" onClick={() => setView("seo")}>Open SEO <ArrowRight className="size-3.5 ml-1" /></Button>}
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
                <div key={n.id} className="rounded-lg border p-2.5 cursor-pointer hover:bg-accent/30 transition" onClick={() => n.link && setView(n.link as any)}>
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

function MiniStat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center", accent)}><Icon className="size-4" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "text-emerald-500" : value >= 50 ? "text-amber-500" : "text-rose-500";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 flex items-end gap-1.5">
          <span className={cn("text-2xl font-bold tabular-nums", color)}>{value}</span>
          <span className="text-xs text-muted-foreground mb-1">/100</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full", value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${value}%` }} />
        </div>
      </CardContent>
    </Card>
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

function AiSuggestion({ icon: Icon, accent, title, body, action, onClick }: { icon: any; accent: string; title: string; body: string; action: string; onClick: () => void }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2.5">
        <div className={cn("size-7 rounded-md flex items-center justify-center shrink-0", accent)}><Icon className="size-3.5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
          <button onClick={onClick} className="mt-1.5 text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-0.5">
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
