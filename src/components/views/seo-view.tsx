"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Search, Sparkles, Lightbulb, RefreshCw, Hash, Trophy, Target,
  TrendingUp, Minus, MapPin, Compass, Building2,
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, Info,
  Plus, Pencil, Trash2, History, Download, ChevronDown, ChevronRight,
  ClipboardList, CalendarClock, CircleAlert, CheckCircle2,
} from "lucide-react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar,
  Cell, LabelList, ReferenceLine,
} from "recharts";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { GeoGridPoint, LocationWithStats } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────
interface SeoKeywordOverview {
  id: string;
  keyword: string;
  city: string;
  locationId: string;
  locationName: string;
  avgRank: number;
  topRank: number | null;
  grid: GeoGridPoint[];
  gridPoints: number;
}

interface SeoOverview {
  totalKeywords: number;
  avgRank: number;
  top3Count: number;
  top10Count: number;
  totalGridPoints: number;
}

interface SeoResponse {
  keywords: SeoKeywordOverview[];
  overview: SeoOverview;
}

interface KeywordRow {
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

interface GeoGridResponse {
  location: { name: string; city: string; latitude: number | null; longitude: number | null };
  keywordId: string | null;
  size: number;
  radius: number;
  grid: { lat: number; lng: number; rank: number }[];
  summary: { avgRank: number; top3Count: number; top10Count: number; totalPoints: number };
}

interface LocationComparisonRow {
  id: string;
  name: string;
  city: string;
  seoScore: number;
  visibilityScore: number;
  avgRank: number;
  keywordCount: number;
  top3Count: number;
  avgRating: number;
  reviewCount: number;
  postCount: number;
  responseRate: number;
}

interface SeoAuditRow {
  id: string;
  locationId: string;
  locationName: string;
  locationCity: string;
  auditScore: number;
  profileStrength: number;
  missingCategories: string[];
  missingPhotos: number;
  missingServices: number;
  recommendations: string[];
  auditedAt: string;
}

interface CompetitorRow {
  id: string;
  businessName: string;
  category: string | null;
  address: string | null;
  locationName: string;
  locationCity: string;
  isActive: boolean;
  rankings: { keyword: string; ranking: number; checkedAt: string }[];
  avgRank: number | null;
}

interface LocationOption {
  id: string;
  name: string;
  city: string;
}

interface KeywordFormData {
  keyword: string;
  locationId?: string;
  city?: string;
  state?: string;
}

type TabKey = "keywords" | "geo-grid" | "competitors" | "location-comparison" | "audit" | "ai";
type SortDir = "asc" | "desc";
type KeywordSortKey = "keyword" | "city" | "currentRank" | "bestRank" | "worstRank" | "rankChange";
type ComparisonSortKey = keyof LocationComparisonRow;

// ── Rank → color helpers ─────────────────────────────────────────────
function rankColor(rank: number): { bg: string; text: string; label: string } {
  if (!rank || rank <= 0) return { bg: "bg-slate-300 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-300", label: "Not ranked" };
  if (rank <= 3) return { bg: "bg-emerald-500", text: "text-white", label: "Top 3" };
  if (rank <= 10) return { bg: "bg-amber-500", text: "text-white", label: "Top 10" };
  if (rank <= 20) return { bg: "bg-orange-500", text: "text-white", label: "Top 20" };
  return { bg: "bg-rose-500", text: "text-white", label: "21+" };
}

function rankTextClass(rank: number): string {
  if (!rank || rank <= 0) return "text-slate-500";
  if (rank <= 3) return "text-emerald-600 dark:text-emerald-400";
  if (rank <= 10) return "text-amber-600 dark:text-amber-400";
  if (rank <= 20) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
}

function rankBandClass(rank: number): string {
  if (!rank || rank <= 0) return "bg-slate-500/15 text-slate-600 dark:text-slate-400";
  if (rank <= 3) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (rank <= 10) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  if (rank <= 20) return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
}

// ── Main view ────────────────────────────────────────────────────────
export function SeoView() {
  const user = useUser();
  const queryClient = useQueryClient();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const canManage = can(user.role, "seo.manage");
  const canAI = can(user.role, "ai.use") && can(user.role, "seo.manage");

  const { data: locations } = useLocations();

  const [activeTab, setActiveTab] = useState<TabKey>("keywords");
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);

  // Geo-grid config
  const [gridSize, setGridSize] = useState<number>(5);
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [gridKeywordId, setGridKeywordId] = useState<string | null>(null);

  // Refresh
  const [refreshing, setRefreshing] = useState(false);

  // AI recs
  const [recs, setRecs] = useState<string[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [hasFetchedRecs, setHasFetchedRecs] = useState(false);

  // AI summary
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [hasFetchedSummary, setHasFetchedSummary] = useState(false);

  const aiDisabled = !activeLocationId || activeLocationId === "all";

  // ── Queries ───────────────────────────────────────────────────────
  const seoQuery = useQuery<SeoResponse>({
    queryKey: ["seo", activeLocationId],
    queryFn: () => {
      const url = activeLocationId && activeLocationId !== "all"
        ? `/api/seo?locationId=${encodeURIComponent(activeLocationId)}`
        : "/api/seo";
      return api<SeoResponse>(url);
    },
  });

  const keywordsQuery = useQuery<KeywordRow[]>({
    queryKey: ["seo", "keywords", activeLocationId],
    queryFn: () => {
      const url = activeLocationId && activeLocationId !== "all"
        ? `/api/seo/keywords?locationId=${encodeURIComponent(activeLocationId)}`
        : "/api/seo/keywords";
      return api<KeywordRow[]>(url);
    },
  });

  const locQuery = useQuery<LocationWithStats[]>({
    queryKey: ["locations", "stats"],
    queryFn: () => api<LocationWithStats[]>("/api/locations"),
  });

  const comparisonQuery = useQuery<LocationComparisonRow[]>({
    queryKey: ["seo", "comparison"],
    queryFn: () => api<LocationComparisonRow[]>("/api/seo/location-comparison"),
  });

  const auditsQuery = useQuery<SeoAuditRow[]>({
    queryKey: ["seo-audits", activeLocationId],
    queryFn: () => {
      const url = activeLocationId && activeLocationId !== "all"
        ? `/api/seo-audits?locationId=${encodeURIComponent(activeLocationId)}`
        : "/api/seo-audits";
      return api<SeoAuditRow[]>(url);
    },
  });

  const competitorsQuery = useQuery<CompetitorRow[]>({
    queryKey: ["competitors", activeLocationId],
    queryFn: () => {
      const url = activeLocationId && activeLocationId !== "all"
        ? `/api/competitors?locationId=${encodeURIComponent(activeLocationId)}`
        : "/api/competitors";
      return api<CompetitorRow[]>(url);
    },
  });

  const keywords = keywordsQuery.data ?? [];
  const overview = seoQuery.data?.overview;
  const isOverviewLoading = seoQuery.isLoading;
  const isKeywordsLoading = keywordsQuery.isLoading;

  // Auto-pick first keyword for geo-grid when none selected
  useEffect(() => {
    if (keywords.length > 0) {
      if (!gridKeywordId || !keywords.find((k) => k.id === gridKeywordId)) {
        const best = [...keywords].sort(
          (a, b) => (a.currentRank ?? 99) - (b.currentRank ?? 99),
        )[0];
        setGridKeywordId(best.id);
      }
    } else if (gridKeywordId !== null) {
      setGridKeywordId(null);
    }
  }, [keywordsQuery.data]);

  // Reset selectedKeywordId when location changes
  useEffect(() => {
    setSelectedKeywordId(null);
  }, [activeLocationId]);

  // Health & visibility for the selected location (or avg of all)
  const healthScore = useMemo(() => {
    if (!locQuery.data || locQuery.data.length === 0) return null;
    if (activeLocationId && activeLocationId !== "all") {
      const loc = locQuery.data.find((l) => l.id === activeLocationId);
      return loc ? loc.healthScore : null;
    }
    const avg = locQuery.data.reduce((s, l) => s + l.healthScore, 0) / locQuery.data.length;
    return Math.round(avg);
  }, [locQuery.data, activeLocationId]);

  const visibilityScore = useMemo(() => {
    if (!locQuery.data || locQuery.data.length === 0) return null;
    if (activeLocationId && activeLocationId !== "all") {
      const loc = locQuery.data.find((l) => l.id === activeLocationId);
      return loc ? loc.visibilityScore : null;
    }
    const avg = locQuery.data.reduce((s, l) => s + l.visibilityScore, 0) / locQuery.data.length;
    return Math.round(avg);
  }, [locQuery.data, activeLocationId]);

  const selectedLocationName = useMemo(() => {
    if (!activeLocationId || activeLocationId === "all") return "All locations";
    return locations?.find((l) => l.id === activeLocationId)?.name ?? "Selected location";
  }, [activeLocationId, locations]);

  // ── Actions ───────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const body: { locationId?: string } = {};
      if (activeLocationId && activeLocationId !== "all") body.locationId = activeLocationId;
      const res = await api<{ refreshed: number; timestamp: string }>(
        "/api/seo/refresh",
        { method: "POST", body: JSON.stringify(body) },
      );
      toast.success(`Refreshed rankings for ${res.refreshed} keyword${res.refreshed === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["seo"] });
      queryClient.invalidateQueries({ queryKey: ["seo-audits"] });
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to refresh rankings";
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  }, [activeLocationId, queryClient]);

  const fetchRecs = useCallback(async () => {
    if (aiDisabled) return;
    setRecsLoading(true);
    setRecsError(null);
    setHasFetchedRecs(true);
    try {
      const res = await api<{ recommendations: string[] }>("/api/ai", {
        method: "POST",
        body: JSON.stringify({ action: "seo", locationId: activeLocationId }),
      });
      setRecs(res.recommendations ?? []);
      toast.success("MiSA AI recommendations ready");
      setActiveTab("ai");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to fetch recommendations";
      setRecsError(msg);
      toast.error(msg);
    } finally {
      setRecsLoading(false);
    }
  }, [aiDisabled, activeLocationId]);

  const fetchSummary = useCallback(async () => {
    if (aiDisabled) return;
    setSummaryLoading(true);
    setSummaryError(null);
    setHasFetchedSummary(true);
    try {
      const res = await api<{ summary: string }>("/api/ai", {
        method: "POST",
        body: JSON.stringify({ action: "summary", locationId: activeLocationId }),
      });
      setSummary(res.summary ?? "");
      toast.success("MiSA AI monthly summary ready");
      setActiveTab("ai");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to fetch summary";
      setSummaryError(msg);
      toast.error(msg);
    } finally {
      setSummaryLoading(false);
    }
  }, [aiDisabled, activeLocationId]);

  const handleSelectKeyword = useCallback((id: string) => {
    setSelectedKeywordId(id);
    setGridKeywordId(id);
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Local SEO"
        description="Track keyword rankings, geo-grid visibility & competitor performance"
        icon={Search}
        actions={
          <>
            <Select
              value={activeLocationId}
              onValueChange={(v) => setActiveLocationId(v as string)}
            >
              <SelectTrigger size="sm" className="w-full sm:w-[180px]">
                <MapPin className="size-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full sm:w-auto"
              >
                {refreshing ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5 mr-1.5" />
                )}
                <span className="hidden sm:inline">Refresh</span> Rankings
              </Button>
            )}
            {canAI && (
              <Button
                size="sm"
                onClick={fetchRecs}
                disabled={recsLoading || aiDisabled}
                title={aiDisabled ? "Select a specific location to generate recommendations" : undefined}
                className="w-full sm:w-auto"
              >
                {recsLoading ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                <span className="hidden sm:inline">AI</span> Recs
              </Button>
            )}
            {canAI && (
              <Button
                size="sm"
                variant="outline"
                onClick={fetchSummary}
                disabled={summaryLoading || aiDisabled}
                title={aiDisabled ? "Select a specific location to generate summary" : undefined}
                className="w-full sm:w-auto"
              >
                {summaryLoading ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CalendarClock className="size-3.5 mr-1.5" />
                )}
                <span className="hidden sm:inline">AI</span> Summary
              </Button>
            )}
          </>
        }
      />

      {/* Overview stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isOverviewLoading || !overview ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Total Keywords"
              value={overview.totalKeywords}
              icon={Hash}
              hint="Tracked across locations"
              accent="emerald"
            />
            <StatCard
              label="Avg Rank"
              value={overview.avgRank ? `#${overview.avgRank}` : "—"}
              icon={TrendingUp}
              hint="Across all grid points"
              accent="amber"
            />
            <StatCard
              label="Top 3 Positions"
              value={overview.top3Count}
              icon={Trophy}
              hint="Grid points ranked 1–3"
              accent="emerald"
            />
            <StatCard
              label="Top 10 Positions"
              value={overview.top10Count}
              icon={Target}
              hint="Grid points ranked 1–10"
              accent="teal"
            />
          </>
        )}
      </div>

      {/* Health & Visibility scores */}
      <CardSection title="Health & Visibility" description={selectedLocationName}>
        {isOverviewLoading || healthScore === null || visibilityScore === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <ScoreRing label="Health" value={healthScore} />
            <ScoreRing label="Visibility" value={visibilityScore} />
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Rank color legend
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-1.5 gap-x-3 text-[11px]">
            <LegendItem color="bg-emerald-500" label="1 – 3" />
            <LegendItem color="bg-amber-500" label="4 – 10" />
            <LegendItem color="bg-orange-500" label="11 – 20" />
            <LegendItem color="bg-rose-500" label="21+" />
            <LegendItem color="bg-slate-300 dark:bg-slate-700" label="Not ranked" />
          </div>
        </div>
      </CardSection>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap">
          <TabsTrigger value="keywords" className="gap-1.5">
            <Hash className="size-3.5" /> Keywords
          </TabsTrigger>
          <TabsTrigger value="geo-grid" className="gap-1.5">
            <Compass className="size-3.5" /> Geo Grid
          </TabsTrigger>
          <TabsTrigger value="competitors" className="gap-1.5">
            <Building2 className="size-3.5" /> Competitors
          </TabsTrigger>
          <TabsTrigger value="location-comparison" className="gap-1.5">
            <ArrowUpDown className="size-3.5" /> Comparison
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ClipboardList className="size-3.5" /> Audit
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="size-3.5" /> AI Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keywords" className="mt-4">
          <KeywordsTab
            keywords={keywords}
            isLoading={isKeywordsLoading}
            selectedKeywordId={selectedKeywordId}
            onSelect={handleSelectKeyword}
            canManage={canManage}
            activeLocationId={activeLocationId}
            locations={locations ?? []}
          />
        </TabsContent>

        <TabsContent value="geo-grid" className="mt-4">
          <GeoGridTab
            keywords={keywords}
            keywordsLoading={isKeywordsLoading}
            gridSize={gridSize}
            setGridSize={setGridSize}
            radiusKm={radiusKm}
            setRadiusKm={setRadiusKm}
            gridKeywordId={gridKeywordId}
            setGridKeywordId={setGridKeywordId}
            selectedLocationName={selectedLocationName}
            activeLocationId={activeLocationId}
          />
        </TabsContent>

        <TabsContent value="competitors" className="mt-4">
          <CompetitorsTab
            competitors={competitorsQuery.data ?? []}
            isLoading={competitorsQuery.isLoading}
            myAvgRank={overview?.avgRank ?? null}
            canManage={canManage}
            activeLocationId={activeLocationId}
          />
        </TabsContent>

        <TabsContent value="location-comparison" className="mt-4">
          <LocationComparisonTab
            rows={comparisonQuery.data ?? []}
            isLoading={comparisonQuery.isLoading}
            activeLocationId={activeLocationId}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTab
            audits={auditsQuery.data ?? []}
            isLoading={auditsQuery.isLoading}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <AiInsightsTab
            locationName={selectedLocationName}
            canAI={canAI}
            recs={recs}
            recsLoading={recsLoading}
            recsError={recsError}
            hasFetchedRecs={hasFetchedRecs}
            recsDisabled={aiDisabled}
            onGenerateRecs={fetchRecs}
            summary={summary}
            summaryLoading={summaryLoading}
            summaryError={summaryError}
            hasFetchedSummary={hasFetchedSummary}
            onGenerateSummary={fetchSummary}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Score ring (radial gauge) ────────────────────────────────────────
function ScoreRing({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "#10b981" : value >= 50 ? "#f59e0b" : "#f43f5e";
  const data = [{ name: label, value, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full h-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: "var(--muted)" }}
              dataKey="value"
              cornerRadius={10}
              angleAxisId={0}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold tabular-nums" style={{ color }}>{value}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="text-xs font-medium text-muted-foreground -mt-1">{label}</div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", color)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

// ── Keywords Tab (enhanced with CRUD + rank history) ─────────────────
function KeywordsTab({
  keywords, isLoading, selectedKeywordId, onSelect, canManage, activeLocationId, locations,
}: {
  keywords: KeywordRow[];
  isLoading: boolean;
  selectedKeywordId: string | null;
  onSelect: (id: string) => void;
  canManage: boolean;
  activeLocationId: string | "all";
  locations: LocationOption[];
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<KeywordSortKey>("currentRank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [addOpen, setAddOpen] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<KeywordRow | null>(null);
  const [deletingKeyword, setDeletingKeyword] = useState<KeywordRow | null>(null);
  const [historyKeyword, setHistoryKeyword] = useState<KeywordRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    const arr = s
      ? keywords.filter((k) =>
          k.keyword.toLowerCase().includes(s) || (k.city ?? "").toLowerCase().includes(s),
        )
      : keywords;
    return [...arr].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "keyword": cmp = a.keyword.toLowerCase().localeCompare(b.keyword.toLowerCase()); break;
        case "city": cmp = (a.city ?? "").toLowerCase().localeCompare((b.city ?? "").toLowerCase()); break;
        case "currentRank": cmp = (a.currentRank ?? 99) - (b.currentRank ?? 99); break;
        case "bestRank": cmp = (a.bestRank ?? 99) - (b.bestRank ?? 99); break;
        case "worstRank": cmp = (a.worstRank ?? 0) - (b.worstRank ?? 0); break;
        case "rankChange": cmp = (a.rankChange ?? 0) - (b.rankChange ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [keywords, search, sortKey, sortDir]);

  function toggleSort(key: KeywordSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["seo"] }),
      queryClient.invalidateQueries({ queryKey: ["seo-audits"] }),
      queryClient.invalidateQueries({ queryKey: ["competitors"] }),
    ]);
  }

  async function handleCreate(data: KeywordFormData) {
    setSubmitting(true);
    try {
      await api("/api/seo/keywords", {
        method: "POST",
        body: JSON.stringify(data),
      });
      toast.success("Keyword added");
      setAddOpen(false);
      await invalidateAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add keyword";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: string, data: Partial<KeywordFormData>) {
    setSubmitting(true);
    try {
      await api(`/api/seo/keywords/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      toast.success("Keyword updated");
      setEditingKeyword(null);
      await invalidateAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update keyword";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setSubmitting(true);
    try {
      await api(`/api/seo/keywords/${id}`, { method: "DELETE" });
      toast.success("Keyword deleted");
      setDeletingKeyword(null);
      await invalidateAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete keyword";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CardSection
      title="Keyword Management"
      description="Add, edit, and track keyword rankings. Click a row to select it for the geo-grid."
      action={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keywords..."
              className="pl-8 h-8 w-full sm:w-[200px]"
            />
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="w-full sm:w-auto whitespace-nowrap">
              <Plus className="size-3.5 mr-1.5" /> Add Keyword
            </Button>
          )}
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Hash className="size-8 mx-auto mb-2 text-muted-foreground/40" />
          {search ? `No keywords match "${search}"` : "No keywords tracked yet. Click \"Add Keyword\" to start."}
        </div>
      ) : (
        <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1">
          <div className="overflow-x-auto scroll-area">
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <SortableHead label="Keyword" k="keyword" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="min-w-[180px]" />
                <SortableHead label="City" k="city" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Current" k="currentRank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <TableHead className="text-right">Previous</TableHead>
                <SortableHead label="Best" k="bestRank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableHead label="Worst" k="worstRank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableHead label="Change" k="rankChange" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <TableHead className="text-center">Trend</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((k) => {
                const isSelected = k.id === selectedKeywordId;
                const rankChange = k.rankChange ?? 0;
                return (
                  <TableRow
                    key={k.id}
                    onClick={() => onSelect(k.id)}
                    className={cn("cursor-pointer", isSelected && "bg-primary/5")}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {isSelected && <span className="size-1.5 rounded-full bg-primary" />}
                        <span className="truncate max-w-[220px]">{k.keyword}</span>
                        {k.status && k.status !== "active" && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">{k.status}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {k.city ? (
                        <Badge variant="outline" className="text-[10px]">{k.city}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-bold tabular-nums", rankTextClass(k.currentRank ?? 0))}>
                        {k.currentRank ? `#${k.currentRank}` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {k.previousRank ? `#${k.previousRank}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.bestRank ? (
                        <span className={cn("font-semibold tabular-nums", rankTextClass(k.bestRank))}>#{k.bestRank}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.worstRank ? (
                        <span className="font-semibold tabular-nums text-muted-foreground">#{k.worstRank}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <RankChangeBadge change={rankChange} />
                    </TableCell>
                    <TableCell className="text-center">
                      <MiniSparkline history={k.rankHistory} />
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => setHistoryKeyword(k)} title="View history">
                            <History className="size-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => setEditingKeyword(k)} title="Edit">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="size-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => setDeletingKeyword(k)} title="Delete">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Add Keyword Dialog */}
      <KeywordFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleCreate}
        submitting={submitting}
        locations={locations}
        defaultLocationId={activeLocationId !== "all" ? activeLocationId : undefined}
        mode="add"
      />

      {/* Edit Keyword Dialog */}
      <KeywordFormDialog
        open={!!editingKeyword}
        onOpenChange={(open) => !open && setEditingKeyword(null)}
        onSubmit={(data) => editingKeyword && handleUpdate(editingKeyword.id, data)}
        submitting={submitting}
        locations={locations}
        keyword={editingKeyword}
        mode="edit"
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingKeyword} onOpenChange={(open) => !open && setDeletingKeyword(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete keyword?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deletingKeyword?.keyword}</span> and all its ranking history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingKeyword && handleDelete(deletingKeyword.id)}
              disabled={submitting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {submitting ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Trash2 className="size-3.5 mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rank History Dialog */}
      <RankHistoryDialog keyword={historyKeyword} onClose={() => setHistoryKeyword(null)} />
    </CardSection>
  );
}

function SortableHead({
  label, k, sortKey, sortDir, onSort, align = "left", className,
}: {
  label: string;
  k: KeywordSortKey;
  sortKey: KeywordSortKey;
  sortDir: SortDir;
  onSort: (k: KeywordSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sortKey === k;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-foreground transition",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function RankChangeBadge({ change }: { change: number }) {
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
        <Minus className="size-3" /> 0
      </span>
    );
  }
  const isGood = change > 0; // positive rankChange = improvement (rank went down)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isGood ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {isGood ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(change)}
    </span>
  );
}

function MiniSparkline({ history }: { history: { rank: number; date: string }[] }) {
  const data = useMemo(() => {
    return (history ?? [])
      .filter((h) => h.rank > 0)
      .slice()
      .reverse() // API returns newest first; chart wants oldest first
      .map((h) => ({ rank: h.rank }));
  }, [history]);

  if (data.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const first = data[0].rank;
  const last = data[data.length - 1].rank;
  const delta = first - last; // positive = improvement
  const color = delta > 0 ? "var(--chart-1)" : delta < 0 ? "var(--chart-4)" : "var(--muted-foreground)";
  return (
    <div className="w-16 h-6 inline-block">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} reversed />
          <Line type="monotone" dataKey="rank" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Keyword Add/Edit Dialog ──────────────────────────────────────────
function KeywordFormDialog({
  open, onOpenChange, onSubmit, submitting, locations, defaultLocationId, keyword, mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: KeywordFormData) => void;
  submitting: boolean;
  locations: LocationOption[];
  defaultLocationId?: string;
  keyword?: KeywordRow | null;
  mode: "add" | "edit";
}) {
  const [formKeyword, setFormKeyword] = useState("");
  const [formLocationId, setFormLocationId] = useState<string>("none");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("Maharashtra");

  // Sync form state when dialog opens (event-driven, not effect-driven — lint-safe)
  function handleOpenChange(next: boolean) {
    if (next) {
      setFormKeyword(keyword?.keyword ?? "");
      setFormLocationId(keyword?.locationId ?? defaultLocationId ?? "none");
      setFormCity(keyword?.city ?? "");
      setFormState(keyword?.state ?? "Maharashtra");
    }
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formKeyword.trim()) {
      toast.error("Keyword is required");
      return;
    }
    onSubmit({
      keyword: formKeyword.trim(),
      locationId: formLocationId === "none" ? undefined : formLocationId,
      city: formCity.trim() || undefined,
      state: formState.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Keyword" : "Edit Keyword"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Track a new keyword across search rankings." : "Update keyword details and assignment."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kw">Keyword</Label>
            <Input
              id="kw"
              value={formKeyword}
              onChange={(e) => setFormKeyword(e.target.value)}
              placeholder="e.g. car service mumbai"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Select value={formLocationId} onValueChange={setFormLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="No specific location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific location</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City (optional)</Label>
              <Input id="city" value={formCity} onChange={(e) => setFormCity(e.target.value)} placeholder="e.g. Mumbai" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" value={formState} onChange={(e) => setFormState(e.target.value)} placeholder="Maharashtra" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {mode === "add" ? "Add Keyword" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Rank History Dialog ──────────────────────────────────────────────
function RankHistoryDialog({
  keyword, onClose,
}: {
  keyword: KeywordRow | null;
  onClose: () => void;
}) {
  const chartData = useMemo(() => {
    if (!keyword) return [];
    return (keyword.rankHistory ?? [])
      .filter((h) => h.rank > 0)
      .slice()
      .reverse() // API returns newest first
      .map((h) => ({
        date: format(parseISO(h.date), "dd MMM"),
        rank: h.rank,
      }));
  }, [keyword]);

  if (!keyword) return null;

  const current = keyword.currentRank;
  const best = keyword.bestRank;
  const worst = keyword.worstRank;
  const ranked = (keyword.rankHistory ?? []).filter((h) => h.rank > 0).map((h) => h.rank);
  const avg = ranked.length
    ? Math.round((ranked.reduce((a, b) => a + b, 0) / ranked.length) * 10) / 10
    : null;

  const maxRank = ranked.length ? Math.max(...ranked) + 2 : 10;

  return (
    <Dialog open={!!keyword} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            Rank History
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{keyword.keyword}</span>
            {keyword.city && <span> · {keyword.city}</span>}
            {keyword.locationName && <span> · {keyword.locationName}</span>}
          </DialogDescription>
        </DialogHeader>

        {chartData.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <History className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            No rank history recorded for this keyword yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile label="Current" value={current ? `#${current}` : "—"} color={rankTextClass(current ?? 0)} />
              <StatTile label="Best" value={best ? `#${best}` : "—"} color={rankTextClass(best ?? 0)} />
              <StatTile label="Worst" value={worst ? `#${worst}` : "—"} color="text-muted-foreground" />
              <StatTile label="Average" value={avg ? `#${avg}` : "—"} color="text-foreground" />
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={24} />
                  <YAxis reversed domain={[0, maxRank]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`#${v}`, "Rank"]}
                  />
                  <Line type="monotone" dataKey="rank" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
                  <ReferenceLine y={3} stroke="var(--chart-2)" strokeDasharray="4 4" label={{ value: "Top 3", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <ReferenceLine y={10} stroke="var(--chart-4)" strokeDasharray="4 4" label={{ value: "Top 10", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Info className="size-3.5 shrink-0" />
              <span>
                Lower rank is better. Y-axis is inverted so rank #1 appears at the top.
                {keyword.trackingCount > 0 && <span> · {keyword.trackingCount} data points tracked.</span>}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}

// ── Geo Grid Tab (configurable size + radius) ────────────────────────
function GeoGridTab({
  keywords, keywordsLoading, gridSize, setGridSize, radiusKm, setRadiusKm,
  gridKeywordId, setGridKeywordId, selectedLocationName, activeLocationId,
}: {
  keywords: KeywordRow[];
  keywordsLoading: boolean;
  gridSize: number;
  setGridSize: (n: number) => void;
  radiusKm: number;
  setRadiusKm: (n: number) => void;
  gridKeywordId: string | null;
  setGridKeywordId: (id: string | null) => void;
  selectedLocationName: string;
  activeLocationId: string | "all";
}) {
  const isAllLocations = !activeLocationId || activeLocationId === "all";
  const locationId = isAllLocations ? null : activeLocationId;

  const geoGridQuery = useQuery<GeoGridResponse>({
    queryKey: ["seo", "geo-grid", locationId, gridKeywordId, gridSize, radiusKm],
    queryFn: () => {
      const params = new URLSearchParams({
        size: String(gridSize),
        radius: String(radiusKm),
      });
      if (locationId) params.set("locationId", locationId);
      if (gridKeywordId) params.set("keywordId", gridKeywordId);
      return api<GeoGridResponse>(`/api/seo/geo-grid?${params.toString()}`);
    },
    enabled: !!locationId && !!gridKeywordId,
  });

  return (
    <CardSection
      title="Geo-Grid Ranking"
      description="Heatmap of keyword ranking at different lat/lng points around your location"
      action={
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <ToggleGroup
            type="single"
            value={String(gridSize)}
            onValueChange={(v) => v && setGridSize(Number(v))}
            size="sm"
            variant="outline"
          >
            <ToggleGroupItem value="3">3×3</ToggleGroupItem>
            <ToggleGroupItem value="5">5×5</ToggleGroupItem>
            <ToggleGroupItem value="7">7×7</ToggleGroupItem>
          </ToggleGroup>
          <Select value={String(radiusKm)} onValueChange={(v) => setRadiusKm(Number(v))}>
            <SelectTrigger size="sm" className="w-[90px] sm:w-[100px]">
              <Compass className="size-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 km</SelectItem>
              <SelectItem value="3">3 km</SelectItem>
              <SelectItem value="5">5 km</SelectItem>
              <SelectItem value="10">10 km</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {/* Keyword selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Keyword:</span>
          <Select
            value={gridKeywordId ?? undefined}
            onValueChange={(v) => setGridKeywordId(v)}
            disabled={keywordsLoading || keywords.length === 0 || isAllLocations}
          >
            <SelectTrigger size="sm" className="w-full sm:w-[260px]">
              <SelectValue placeholder={
                isAllLocations ? "Select a location first"
                : keywords.length === 0 ? "No keywords available"
                : "Select keyword"
              } />
            </SelectTrigger>
            <SelectContent>
              {keywords.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.keyword} {k.currentRank ? `(#${k.currentRank})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isAllLocations && (
          <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Info className="size-3.5" />
            Select a specific location above to view its geo-grid.
          </div>
        )}
      </div>

      {isAllLocations ? (
        <div className="py-16 text-center">
          <Compass className="size-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Select a specific location to view its geo-grid heatmap.</p>
        </div>
      ) : geoGridQuery.isLoading || geoGridQuery.isFetching ? (
        <div className="flex justify-center py-8">
          <Skeleton className="h-[340px] w-full max-w-md" />
        </div>
      ) : geoGridQuery.isError ? (
        <div className="py-10 text-center text-sm text-rose-600 dark:text-rose-400">
          Failed to load geo-grid. Try again.
        </div>
      ) : !gridKeywordId ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No keyword selected. Choose a keyword above to view its geo-grid.
        </div>
      ) : (
        <GeoGridHeatmap
          grid={geoGridQuery.data?.grid ?? []}
          size={gridSize}
          radius={radiusKm}
          summary={geoGridQuery.data?.summary}
          locationName={selectedLocationName}
          keywordLabel={keywords.find((k) => k.id === gridKeywordId)?.keyword ?? ""}
        />
      )}
    </CardSection>
  );
}

function GeoGridHeatmap({
  grid, size, radius, summary, locationName, keywordLabel,
}: {
  grid: { lat: number; lng: number; rank: number }[];
  size: number;
  radius: number;
  summary?: { avgRank: number; top3Count: number; top10Count: number; totalPoints: number };
  locationName: string;
  keywordLabel: string;
}) {
  const grid2d = useMemo(() => {
    if (grid.length === 0) {
      return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => null as { lat: number; lng: number; rank: number } | null),
      );
    }
    const lats = Array.from(new Set(grid.map((p) => p.lat))).sort((a, b) => b - a);
    const lngs = Array.from(new Set(grid.map((p) => p.lng))).sort((a, b) => a - b);
    const g: ({ lat: number; lng: number; rank: number } | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null),
    );
    grid.forEach((p) => {
      const row = lats.indexOf(p.lat);
      const col = lngs.indexOf(p.lng);
      if (row >= 0 && row < size && col >= 0 && col < size) {
        g[row][col] = p;
      }
    });
    return g;
  }, [grid, size]);

  const cellSize = size === 3 ? "size-12 sm:size-16" : size === 5 ? "size-10 sm:size-14" : "size-8 sm:size-11";
  const fontSize = size === 7 ? "text-[10px] sm:text-xs" : "text-xs sm:text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{locationName} · {radius} km radius</div>
          <div className="text-base font-semibold">
            Geo-Grid — <span className="text-primary">{keywordLabel || "—"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MiniStat label="Avg" value={summary?.avgRank ? `#${summary.avgRank}` : "—"} />
          <MiniStat label="Top 3" value={`${summary?.top3Count ?? 0}/${summary?.totalPoints ?? size * size}`} />
          <MiniStat label="Top 10" value={`${summary?.top10Count ?? 0}/${summary?.totalPoints ?? size * size}`} />
        </div>
      </div>

      <div className="flex justify-center overflow-x-auto scroll-area pb-2">
        <div className="flex items-stretch gap-2 shrink-0">
          <div className="flex flex-col items-center justify-between py-1">
            <span className="text-[10px] font-medium text-muted-foreground">N</span>
            <Compass className="size-3 text-muted-foreground/60" />
            <span className="text-[10px] font-medium text-muted-foreground">S</span>
          </div>
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">W</span>
              <span className="text-[10px] text-muted-foreground/70">lat ↓ / lng →</span>
              <span className="text-[10px] font-medium text-muted-foreground">E</span>
            </div>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
            >
              {grid2d.flat().map((cell, idx) => {
                if (!cell) {
                  return (
                    <div key={idx} className={cn("rounded-md bg-muted/40 border border-dashed", cellSize)} />
                  );
                }
                const c = rankColor(cell.rank);
                return (
                  <div
                    key={idx}
                    title={`Rank #${cell.rank || "—"} · lat ${cell.lat.toFixed(4)}, lng ${cell.lng.toFixed(4)}`}
                    className={cn(
                      "rounded-md flex items-center justify-center font-bold tabular-nums font-mono shadow-sm transition-transform hover:scale-105 cursor-default",
                      cellSize, fontSize, c.bg, c.text,
                    )}
                  >
                    {cell.rank > 0 ? cell.rank : "—"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap text-[11px]">
        <LegendItem color="bg-emerald-500" label="1–3" />
        <LegendItem color="bg-amber-500" label="4–10" />
        <LegendItem color="bg-orange-500" label="11–20" />
        <LegendItem color="bg-rose-500" label="21+" />
        <LegendItem color="bg-slate-300 dark:bg-slate-700" label="N/A" />
      </div>

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-md p-2.5">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Each cell represents a search performed at that lat/lng point around {locationName} within a {radius} km radius.
          Brighter colors = better ranking. The center cell is the location&apos;s exact coordinates.
        </span>
      </div>
    </div>
  );
}

// ── Competitors Tab (real API data + comparison chart) ───────────────
function CompetitorsTab({
  competitors, isLoading, myAvgRank, canManage, activeLocationId,
}: {
  competitors: CompetitorRow[];
  isLoading: boolean;
  myAvgRank: number | null;
  canManage: boolean;
  activeLocationId: string | "all";
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const isAllLocations = !activeLocationId || activeLocationId === "all";

  const chartData = useMemo(() => {
    const arr: { name: string; avgRank: number; isMe: boolean }[] = [];
    if (myAvgRank && myAvgRank > 0) {
      arr.push({ name: "MyFNG (you)", avgRank: myAvgRank, isMe: true });
    }
    competitors.forEach((c) => {
      if (c.avgRank !== null && c.avgRank > 0) {
        arr.push({ name: c.businessName, avgRank: c.avgRank, isMe: false });
      }
    });
    return arr.sort((a, b) => a.avgRank - b.avgRank);
  }, [competitors, myAvgRank]);

  return (
    <div className="space-y-4">
      <CardSection
        title="Competitor Monitoring"
        description="Real competitor rankings across your tracked keywords"
        action={
          canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.success("Competitor tracking setup queued")}
            >
              <Plus className="size-3.5 mr-1.5" /> Add Competitor
            </Button>
          )
        }
      >
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : competitors.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Building2 className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            No competitors tracked {isAllLocations ? "yet" : "for this location"}.
            {canManage && <span> Click \"Add Competitor\" to set up tracking.</span>}
          </div>
        ) : (
          <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1">
            <div className="overflow-x-auto scroll-area">
              <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-8" />
                  <TableHead className="min-w-[180px]">Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Avg Rank</TableHead>
                  <TableHead className="text-center">Keywords Tracked</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((c) => {
                  const isExpanded = expanded === c.id;
                  return (
                    <Fragment key={c.id}>
                      <TableRow
                        className={cn("cursor-pointer hover:bg-accent/30", isExpanded && "bg-muted/30")}
                        onClick={() => setExpanded(isExpanded ? null : c.id)}
                      >
                        <TableCell>
                          {c.rankings.length > 0 && (
                            isExpanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="truncate max-w-[150px] sm:max-w-[200px]">{c.businessName}</div>
                              {c.locationName && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">{c.locationName}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.category ? (
                            <Badge variant="outline" className="text-[10px]">{c.category}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.avgRank !== null ? (
                            <span className={cn("font-bold tabular-nums", rankTextClass(c.avgRank))}>#{c.avgRank}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{c.rankings.length}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.isActive ? "default" : "secondary"} className="text-[10px]">
                            {c.isActive ? "Active" : "Paused"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && c.rankings.length > 0 && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={6} className="p-3">
                            <div className="rounded-md border bg-card p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Keyword Rankings
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {c.rankings.map((r, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                                    <span className="truncate">{r.keyword}</span>
                                    <span className={cn("font-bold tabular-nums ml-2", rankTextClass(r.ranking))}>
                                      #{r.ranking}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardSection>

      {/* Comparison bar chart */}
      {chartData.length > 0 && (
        <CardSection
          title="Avg Rank Comparison"
          description="Lower rank = better visibility. MyFNG vs tracked competitors."
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 32, left: 5, bottom: 5 }} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" domain={[0, "dataMax + 2"]} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={120} interval={0} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`#${v}`, "Avg Rank"]}
                />
                <Bar dataKey="avgRank" name="Avg Rank" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.isMe ? "var(--chart-1)" : "var(--chart-2)"} />
                  ))}
                  <LabelList dataKey="avgRank" position="right" formatter={(v: number) => `#${v}`} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-emerald-500" />
              <span className="text-muted-foreground">MyFNG (you)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-amber-500" />
              <span className="text-muted-foreground">Competitors</span>
            </div>
          </div>
        </CardSection>
      )}
    </div>
  );
}

// ── Location Comparison Tab ──────────────────────────────────────────
function LocationComparisonTab({
  rows, isLoading, activeLocationId,
}: {
  rows: LocationComparisonRow[];
  isLoading: boolean;
  activeLocationId: string | "all";
}) {
  const [sortKey, setSortKey] = useState<ComparisonSortKey>("seoScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase()); break;
        case "city": cmp = a.city.toLowerCase().localeCompare(b.city.toLowerCase()); break;
        case "seoScore": cmp = a.seoScore - b.seoScore; break;
        case "visibilityScore": cmp = a.visibilityScore - b.visibilityScore; break;
        case "avgRank": cmp = (a.avgRank || 99) - (b.avgRank || 99); break;
        case "keywordCount": cmp = a.keywordCount - b.keywordCount; break;
        case "top3Count": cmp = a.top3Count - b.top3Count; break;
        case "avgRating": cmp = a.avgRating - b.avgRating; break;
        case "reviewCount": cmp = a.reviewCount - b.reviewCount; break;
        case "postCount": cmp = a.postCount - b.postCount; break;
        case "responseRate": cmp = a.responseRate - b.responseRate; break;
        default: cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: ComparisonSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function exportCsv() {
    const headers = ["City", "Name", "SEO Score", "Visibility", "Avg Rank", "Keywords", "Top 3", "Rating", "Reviews", "Posts", "Response Rate"];
    const lines = [headers.join(",")];
    sorted.forEach((r) => {
      lines.push([
        `"${r.city}"`,
        `"${r.name}"`,
        r.seoScore,
        r.visibilityScore,
        r.avgRank || "",
        r.keywordCount,
        r.top3Count,
        r.avgRating || "",
        r.reviewCount,
        r.postCount,
        `${r.responseRate}%`,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-comparison-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Comparison exported");
  }

  return (
    <CardSection
      title="Location Comparison"
      description="Compare all locations by SEO and engagement metrics"
      action={
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-3.5 mr-1.5" /> Export CSV
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <ArrowUpDown className="size-8 mx-auto mb-2 text-muted-foreground/40" />
          No locations to compare.
        </div>
      ) : (
        <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1">
          <div className="overflow-x-auto scroll-area">
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <ComparisonSortHead label="City" k="city" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <ComparisonSortHead label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <ComparisonSortHead label="SEO" k="seoScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Visibility" k="visibilityScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Avg Rank" k="avgRank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Keywords" k="keywordCount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Top 3" k="top3Count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Rating" k="avgRating" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Reviews" k="reviewCount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Posts" k="postCount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <ComparisonSortHead label="Resp %" k="responseRate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const isActive = r.id === activeLocationId;
                return (
                  <TableRow key={r.id} className={cn(isActive && "bg-primary/5")}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{r.city}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {isActive && <span className="size-1.5 rounded-full bg-primary" />}
                        <span className="truncate max-w-[120px] sm:max-w-[160px]">{r.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("inline-flex items-center justify-end font-bold tabular-nums rounded px-1.5 py-0.5", scoreBg(r.seoScore))}>
                        {r.seoScore}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("inline-flex items-center justify-end font-bold tabular-nums rounded px-1.5 py-0.5", scoreBg(r.visibilityScore))}>
                        {r.visibilityScore}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.avgRank ? (
                        <span className={cn("inline-flex items-center justify-end font-bold tabular-nums rounded px-1.5 py-0.5", rankBandClass(r.avgRank))}>
                          #{r.avgRank}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.keywordCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.top3Count}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {r.avgRating ? r.avgRating.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.reviewCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.postCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.responseRate}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </div>
      )}
    </CardSection>
  );
}

function ComparisonSortHead({
  label, k, sortKey, sortDir, onSort, align = "left",
}: {
  label: string;
  k: ComparisonSortKey;
  sortKey: ComparisonSortKey;
  sortDir: SortDir;
  onSort: (k: ComparisonSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <TableHead className={cn(align === "right" && "text-right")}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-foreground transition",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

// ── Audit Tab ────────────────────────────────────────────────────────
function AuditTab({
  audits, isLoading, canManage,
}: {
  audits: SeoAuditRow[];
  isLoading: boolean;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <CardSection
      title="SEO Audits"
      description="Profile strength, missing items & recommendations per location"
      action={
        canManage && (
          <Button size="sm" variant="outline" onClick={() => toast.success("Audit queued")}>
            <ClipboardList className="size-3.5 mr-1.5" /> Run Audit
          </Button>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : audits.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <ClipboardList className="size-8 mx-auto mb-2 text-muted-foreground/40" />
          No SEO audits recorded yet.
        </div>
      ) : (
        <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1">
          <div className="overflow-x-auto scroll-area">
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8" />
                <TableHead className="min-w-[180px]">Location</TableHead>
                <TableHead className="text-right">Audit Score</TableHead>
                <TableHead className="text-right min-w-[140px]">Profile Strength</TableHead>
                <TableHead className="text-center">Missing Photos</TableHead>
                <TableHead className="text-center">Missing Services</TableHead>
                <TableHead className="text-center">Recommendations</TableHead>
                <TableHead className="text-right">Audited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits.map((a) => {
                const isExpanded = expanded === a.id;
                const hasDetails = a.recommendations.length > 0 || a.missingCategories.length > 0;
                return (
                  <Fragment key={a.id}>
                    <TableRow
                      className={cn("cursor-pointer hover:bg-accent/30", isExpanded && "bg-muted/30")}
                      onClick={() => hasDetails && setExpanded(isExpanded ? null : a.id)}
                    >
                      <TableCell>
                        {hasDetails && (
                          isExpanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <div>{a.locationName}</div>
                            {a.locationCity && <div className="text-[10px] text-muted-foreground">{a.locationCity}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("inline-flex items-center justify-end font-bold tabular-nums rounded px-1.5 py-0.5", scoreBg(a.auditScore))}>
                          {a.auditScore}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Progress value={a.profileStrength} className="w-14 h-2" />
                          <span className="text-xs tabular-nums w-9">{a.profileStrength}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {a.missingPhotos > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/30">{a.missingPhotos}</Badge>
                        ) : <CheckCircle2 className="size-3.5 text-emerald-500 mx-auto" />}
                      </TableCell>
                      <TableCell className="text-center">
                        {a.missingServices > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/30">{a.missingServices}</Badge>
                        ) : <CheckCircle2 className="size-3.5 text-emerald-500 mx-auto" />}
                      </TableCell>
                      <TableCell className="text-center">
                        {a.recommendations.length > 0 ? (
                          <Badge variant="outline" className="text-[10px]">{a.recommendations.length}</Badge>
                        ) : <CheckCircle2 className="size-3.5 text-emerald-500 mx-auto" />}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {format(parseISO(a.auditedAt), "dd MMM yyyy")}
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasDetails && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8} className="p-3">
                          <div className="rounded-md border bg-card p-3 space-y-3">
                            {a.missingCategories.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                                  Missing Categories
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {a.missingCategories.map((cat, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/30">{cat}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {a.recommendations.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                                  Recommendations
                                </div>
                                <ul className="space-y-1.5">
                                  {a.recommendations.map((rec, i) => (
                                    <li key={i} className="text-xs flex items-start gap-2">
                                      <span className="size-4 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                                        {i + 1}
                                      </span>
                                      <span>{rec}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </div>
      )}
    </CardSection>
  );
}

// ── AI Insights Tab (recommendations + monthly summary) ──────────────
function AiInsightsTab({
  locationName, canAI,
  recs, recsLoading, recsError, hasFetchedRecs, recsDisabled, onGenerateRecs,
  summary, summaryLoading, summaryError, hasFetchedSummary, onGenerateSummary,
}: {
  locationName: string;
  canAI: boolean;
  recs: string[];
  recsLoading: boolean;
  recsError: string | null;
  hasFetchedRecs: boolean;
  recsDisabled: boolean;
  onGenerateRecs: () => void;
  summary: string | null;
  summaryLoading: boolean;
  summaryError: string | null;
  hasFetchedSummary: boolean;
  onGenerateSummary: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* AI SEO Recommendations */}
      <CardSection
        title="AI SEO Recommendations"
        description={canAI ? "MiSA AI analyzes your keyword data" : "Requires AI + SEO manage permissions"}
        action={
          canAI && (
            <Button size="sm" variant="outline" onClick={onGenerateRecs} disabled={recsLoading || recsDisabled}>
              {recsLoading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Sparkles className="size-3.5 mr-1.5" />}
              {hasFetchedRecs ? "Regenerate" : "Generate"}
            </Button>
          )
        }
      >
        {!canAI ? (
          <PermissionBlocked message="You need AI + SEO manage permissions to generate recommendations." />
        ) : recsDisabled ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Info className="size-6 mx-auto mb-2 text-muted-foreground/60" />
            Select a specific location to generate AI recommendations.
          </div>
        ) : recsLoading ? (
          <RecsSkeleton />
        ) : recsError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
            {recsError}
          </div>
        ) : recs.length > 0 ? (
          <div className="space-y-3">
            {recs.map((rec, i) => (
              <div key={i} className="rounded-lg border p-3 bg-card hover:border-primary/30 transition">
                <div className="flex items-start gap-3">
                  <div className="size-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Lightbulb className="size-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Recommendation #{i + 1}
                    </div>
                    <p className="text-sm leading-relaxed">{rec}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="text-[11px] text-muted-foreground pt-1">
              Generated by MiSA AI for {locationName}.
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Sparkles className="size-7 mx-auto mb-2 text-amber-500/60" />
            Click &quot;Generate&quot; to get AI-powered SEO recommendations.
          </div>
        )}
      </CardSection>

      {/* AI Monthly Summary */}
      <CardSection
        title="AI Monthly SEO Summary"
        description={canAI ? "MiSA AI monthly recap of performance" : "Requires AI + SEO manage permissions"}
        action={
          canAI && (
            <Button size="sm" variant="outline" onClick={onGenerateSummary} disabled={summaryLoading || recsDisabled}>
              {summaryLoading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="size-3.5 mr-1.5" />}
              {hasFetchedSummary ? "Regenerate" : "Generate"}
            </Button>
          )
        }
      >
        {!canAI ? (
          <PermissionBlocked message="You need AI + SEO manage permissions to generate summaries." />
        ) : recsDisabled ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Info className="size-6 mx-auto mb-2 text-muted-foreground/60" />
            Select a specific location to generate the monthly summary.
          </div>
        ) : summaryLoading ? (
          <SummarySkeleton />
        ) : summaryError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
            {summaryError}
          </div>
        ) : summary ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <CalendarClock className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Monthly Summary</div>
                <div className="text-[10px] text-muted-foreground">{locationName} · Generated by MiSA AI</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line">{summary}</p>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <CalendarClock className="size-7 mx-auto mb-2 text-amber-500/60" />
            Click &quot;Generate&quot; to get a MiSA AI monthly SEO summary.
          </div>
        )}
      </CardSection>
    </div>
  );
}

function RecsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-7 rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-md" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2 w-48" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

function PermissionBlocked({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <CircleAlert className="size-7 mx-auto mb-2 text-amber-500/60" />
      {message}
    </div>
  );
}
