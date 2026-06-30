"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Search, Sparkles, Lightbulb, RefreshCw, Hash, Trophy, Target,
  TrendingUp, TrendingDown, Minus, MapPin, Compass, Building2,
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, Crown, Info,
} from "lucide-react";
import type { GeoGridPoint, LocationWithStats } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────
interface SeoKeyword {
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
  keywords: SeoKeyword[];
  overview: SeoOverview;
}

type SortKey = "keyword" | "city" | "avgRank" | "topRank";
type SortDir = "asc" | "desc";

// ── Rank → color helpers ─────────────────────────────────────────────
function rankColor(rank: number): { bg: string; text: string; label: string } {
  if (!rank || rank <= 0) return { bg: "bg-slate-300 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-300", label: "Not ranked" };
  if (rank <= 3) return { bg: "bg-emerald-500", text: "text-white", label: "Top 3" };
  if (rank <= 10) return { bg: "bg-amber-500", text: "text-white", label: "Top 10" };
  if (rank <= 20) return { bg: "bg-orange-500", text: "text-white", label: "Top 20" };
  return { bg: "bg-rose-500", text: "text-white", label: "21+" };
}

function rankColorSoft(rank: number): string {
  if (!rank || rank <= 0) return "bg-slate-200 dark:bg-slate-700";
  if (rank <= 3) return "bg-emerald-500";
  if (rank <= 10) return "bg-amber-500";
  if (rank <= 20) return "bg-orange-500";
  return "bg-rose-500";
}

function rankTextClass(rank: number): string {
  if (!rank || rank <= 0) return "text-slate-500";
  if (rank <= 3) return "text-emerald-600 dark:text-emerald-400";
  if (rank <= 10) return "text-amber-600 dark:text-amber-400";
  if (rank <= 20) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

// Deterministic mock trend from a keyword string (seed data has no trend series)
function mockTrend(keyword: string): { delta: number; dir: "up" | "down" | "flat" } {
  let h = 0;
  for (let i = 0; i < keyword.length; i++) h = (h * 31 + keyword.charCodeAt(i)) >>> 0;
  const v = (h % 7) - 3; // -3..+3
  return { delta: Math.abs(v), dir: v > 0 ? "up" : v < 0 ? "down" : "flat" };
}

// ── Build a normalized 5x5 display grid from a flat list of GeoGridPoints ─
interface GridCell {
  lat: number;
  lng: number;
  rank: number;
  row: number; // 0 = north (top)
  col: number; // 0 = west (left)
}

function buildGrid(points: GeoGridPoint[]): GridCell[] {
  if (!points || points.length === 0) return [];
  const lats = Array.from(new Set(points.map((p) => p.lat))).sort((a, b) => b - a); // desc (N→S)
  const lngs = Array.from(new Set(points.map((p) => p.lng))).sort((a, b) => a - b); // asc (W→E)
  return points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    rank: p.rank,
    row: lats.indexOf(p.lat),
    col: lngs.indexOf(p.lng),
  }));
}

// ── Main view ────────────────────────────────────────────────────────
export function SeoView() {
  const user = useUser();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const canManage = can(user.role, "seo.manage");

  const { data: locations } = useLocations();

  // SEO data
  const seoQuery = useQuery<SeoResponse>({
    queryKey: ["seo", activeLocationId],
    queryFn: () => {
      const url = activeLocationId && activeLocationId !== "all"
        ? `/api/seo?locationId=${encodeURIComponent(activeLocationId)}`
        : "/api/seo";
      return api<SeoResponse>(url);
    },
  });

  // Locations for health/visibility lookup
  const locQuery = useQuery<LocationWithStats[]>({
    queryKey: ["locations", "stats"],
    queryFn: () => api<LocationWithStats[]>("/api/locations"),
  });

  const keywords = seoQuery.data?.keywords ?? [];
  const overview = seoQuery.data?.overview;
  const isLoading = seoQuery.isLoading;

  // Selected keyword for the geo-grid
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);

  // Auto-pick first keyword when data loads / location changes
  useEffect(() => {
    if (keywords.length > 0) {
      if (!selectedKeywordId || !keywords.find((k) => k.id === selectedKeywordId)) {
        // Pick the keyword with the best avgRank by default
        const best = [...keywords].sort((a, b) => (a.avgRank || 99) - (b.avgRank || 99))[0];
        setSelectedKeywordId(best.id);
      }
    } else {
      setSelectedKeywordId(null);
    }
  }, [seoQuery.data, keywords, selectedKeywordId]);

  const selectedKeyword = useMemo(
    () => keywords.find((k) => k.id === selectedKeywordId) ?? null,
    [keywords, selectedKeywordId],
  );

  // Health & visibility for the selected location (or avg of all visible)
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

  // AI recommendations state (lifted so the header button + panel share it)
  const [recs, setRecs] = useState<string[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const recsDisabled = !activeLocationId || activeLocationId === "all";

  async function fetchRecs() {
    if (recsDisabled) return;
    setRecsLoading(true);
    setRecsError(null);
    setHasFetched(true);
    try {
      const res = await api<{ recommendations: string[] }>("/api/ai", {
        method: "POST",
        body: JSON.stringify({ action: "seo", locationId: activeLocationId }),
      });
      setRecs(res.recommendations ?? []);
      toast.success("MiSA AI recommendations ready");
      // Scroll the panel into view
      requestAnimationFrame(() => {
        document.getElementById("seo-ai-recs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e: any) {
      setRecsError(e.message || "Failed to fetch recommendations");
      toast.error(e.message || "Failed to fetch recommendations");
    } finally {
      setRecsLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Local SEO"
        description="Track keyword rankings & geo-grid visibility"
        icon={Search}
        actions={
          <>
            <Select
              value={activeLocationId}
              onValueChange={(v) => setActiveLocationId(v as any)}
            >
              <SelectTrigger size="sm" className="w-[200px]">
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
                onClick={fetchRecs}
                disabled={recsLoading || recsDisabled}
                title={recsDisabled ? "Select a specific location to generate recommendations" : undefined}
              >
                {recsLoading ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                Get AI Recommendations
              </Button>
            )}
          </>
        }
      />

      {/* Empty state */}
      {!isLoading && keywords.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Overview stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {isLoading || !overview ? (
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

          {/* Geo-grid + Health/Visibility */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardSection
              title="Geo-Grid Ranking"
              description={selectedKeyword ? `Keyword: ${selectedKeyword.keyword}` : "Select a keyword"}
              className="lg:col-span-2"
              action={
                keywords.length > 0 && (
                  <Select
                    value={selectedKeywordId ?? undefined}
                    onValueChange={setSelectedKeywordId}
                  >
                    <SelectTrigger size="sm" className="w-[220px]">
                      <SelectValue placeholder="Select keyword" />
                    </SelectTrigger>
                    <SelectContent>
                      {keywords.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.keyword}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            >
              {isLoading ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Skeleton className="h-[340px] w-full max-w-md" />
                </div>
              ) : selectedKeyword ? (
                <GeoGrid keyword={selectedKeyword} locationName={selectedLocationName} />
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No keyword selected.
                </div>
              )}
            </CardSection>

            {/* Health & Visibility + quick legend */}
            <div className="space-y-4">
              <CardSection
                title="Health & Visibility"
                description={selectedLocationName}
              >
                {isLoading || healthScore === null || visibilityScore === null ? (
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
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[11px]">
                    <LegendItem color="bg-emerald-500" label="1 – 3" />
                    <LegendItem color="bg-amber-500" label="4 – 10" />
                    <LegendItem color="bg-orange-500" label="11 – 20" />
                    <LegendItem color="bg-rose-500" label="21+" />
                    <LegendItem color="bg-slate-300 dark:bg-slate-700" label="Not ranked" />
                  </div>
                </div>
              </CardSection>
            </div>
          </div>

          {/* Keyword rankings table */}
          <CardSection
            title="Keyword Rankings"
            description="Click a row to view its geo-grid. Click column headers to sort."
            action={<Badge variant="outline" className="text-xs">{keywords.length} keywords</Badge>}
          >
            <KeywordTable
              keywords={keywords}
              isLoading={isLoading}
              selectedKeywordId={selectedKeywordId}
              onSelect={setSelectedKeywordId}
            />
          </CardSection>

          {/* AI Recommendations + Competitors */}
          <div id="seo-ai-recs" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AiRecommendationsPanel
              locationName={selectedLocationName}
              canManage={canManage}
              recs={recs}
              loading={recsLoading}
              error={recsError}
              hasFetched={hasFetched}
              disabled={recsDisabled}
              onGenerate={fetchRecs}
            />
            <CompetitorMonitoring selectedKeyword={selectedKeyword} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Geo-grid heatmap (centerpiece) ───────────────────────────────────
function GeoGrid({ keyword, locationName }: { keyword: SeoKeyword; locationName: string }) {
  const cells = useMemo(() => buildGrid(keyword.grid), [keyword.grid]);

  if (cells.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No geo-grid data available for this keyword.
      </div>
    );
  }

  // Determine grid size (assume square)
  const size = Math.max(
    ...cells.map((c) => c.row + 1),
    ...cells.map((c) => c.col + 1),
  );

  // Build 2D array [row][col]
  const grid: (GridCell | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
  cells.forEach((c) => {
    grid[c.row][c.col] = c;
  });

  // Compute summary stats
  const ranked = cells.filter((c) => c.rank > 0);
  const top3 = ranked.filter((c) => c.rank <= 3).length;
  const top10 = ranked.filter((c) => c.rank <= 10).length;
  const avg = ranked.length
    ? Math.round((ranked.reduce((s, c) => s + c.rank, 0) / ranked.length) * 10) / 10
    : 0;

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">
            {locationName} · {keyword.city}
          </div>
          <div className="text-base font-semibold">
            Geo-Grid Ranking — <span className="text-primary">{keyword.keyword}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MiniStat label="Avg" value={avg ? `#${avg}` : "—"} />
          <MiniStat label="Top 3" value={`${top3}/${ranked.length || cells.length}`} />
          <MiniStat label="Top 10" value={`${top10}/${ranked.length || cells.length}`} />
        </div>
      </div>

      {/* The grid */}
      <div className="flex justify-center">
        <div className="flex items-stretch gap-2">
          {/* Y-axis label (N/S) */}
          <div className="flex flex-col items-center justify-between py-1">
            <span className="text-[10px] font-medium text-muted-foreground">N</span>
            <Compass className="size-3 text-muted-foreground/60" />
            <span className="text-[10px] font-medium text-muted-foreground">S</span>
          </div>

          <div>
            {/* Top labels (W/E) */}
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">W</span>
              <span className="text-[10px] text-muted-foreground/70">lat ↓ / lng →</span>
              <span className="text-[10px] font-medium text-muted-foreground">E</span>
            </div>

            {/* The 5x5 grid */}
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
            >
              {grid.flat().map((cell, idx) => {
                if (!cell) {
                  return (
                    <div
                      key={idx}
                      className="size-12 sm:size-14 rounded-md bg-muted/40 border border-dashed"
                    />
                  );
                }
                const c = rankColor(cell.rank);
                return (
                  <div
                    key={idx}
                    title={`Rank #${cell.rank || "—"} · lat ${cell.lat.toFixed(4)}, lng ${cell.lng.toFixed(4)}`}
                    className={cn(
                      "size-12 sm:size-14 rounded-md flex items-center justify-center text-sm font-bold tabular-nums shadow-sm transition-transform hover:scale-105 cursor-default",
                      c.bg, c.text,
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

      {/* Mobile legend */}
      <div className="flex items-center justify-center gap-3 flex-wrap text-[11px] sm:hidden">
        <LegendItem color="bg-emerald-500" label="1–3" />
        <LegendItem color="bg-amber-500" label="4–10" />
        <LegendItem color="bg-orange-500" label="11–20" />
        <LegendItem color="bg-rose-500" label="21+" />
        <LegendItem color="bg-slate-300 dark:bg-slate-700" label="N/A" />
      </div>

      {/* Helper note */}
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-md p-2.5">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Each cell represents a search performed at that lat/lng point around {locationName}.
          Brighter colors = better ranking. The center cell is the location&apos;s exact coordinates.
        </span>
      </div>
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

// ── Keyword table ────────────────────────────────────────────────────
function KeywordTable({
  keywords, isLoading, selectedKeywordId, onSelect,
}: {
  keywords: SeoKeyword[];
  isLoading: boolean;
  selectedKeywordId: string | null;
  onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("avgRank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const arr = [...keywords];
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "keyword": av = a.keyword.toLowerCase(); bv = b.keyword.toLowerCase(); break;
        case "city": av = a.city.toLowerCase(); bv = b.city.toLowerCase(); break;
        case "avgRank": av = a.avgRank || 99; bv = b.avgRank || 99; break;
        case "topRank": av = a.topRank ?? 99; bv = b.topRank ?? 99; break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [keywords, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "keyword" || key === "city" ? "asc" : "asc");
    }
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (keywords.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No keywords tracked yet.
      </div>
    );
  }

  return (
    <div className="max-h-[28rem] overflow-y-auto scroll-area -mx-1">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <SortableHead label="Keyword" k="keyword" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="min-w-[180px]" />
            <SortableHead label="City" k="city" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHead label="Avg Rank" k="avgRank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
            <SortableHead label="Top Rank" k="topRank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
            <TableHead className="text-center">Grid Preview</TableHead>
            <TableHead className="text-right">Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((k) => {
            const isSelected = k.id === selectedKeywordId;
            const trend = mockTrend(k.keyword);
            return (
              <TableRow
                key={k.id}
                onClick={() => onSelect(k.id)}
                className={cn(
                  "cursor-pointer",
                  isSelected && "bg-primary/5",
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {isSelected && <span className="size-1.5 rounded-full bg-primary" />}
                    <span className="truncate max-w-[220px]">{k.keyword}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{k.city}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn("font-bold tabular-nums", rankTextClass(k.avgRank))}>
                    {k.avgRank ? `#${k.avgRank}` : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {k.topRank ? (
                    <span className={cn("font-semibold tabular-nums", rankTextClass(k.topRank))}>
                      #{k.topRank}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <MiniGrid points={k.grid} />
                </TableCell>
                <TableCell className="text-right">
                  <TrendBadge delta={trend.delta} dir={trend.dir} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableHead({
  label, k, sortKey, sortDir, onSort, align = "left", className,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
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

function MiniGrid({ points }: { points: GeoGridPoint[] }) {
  const cells = useMemo(() => buildGrid(points).slice(0, 25), [points]);
  if (cells.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const size = Math.max(
    ...cells.map((c) => c.row + 1),
    ...cells.map((c) => c.col + 1),
  );
  const grid: (GridCell | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
  cells.forEach((c) => { grid[c.row][c.col] = c; });

  return (
    <div
      className="inline-grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
    >
      {grid.flat().map((cell, idx) => (
        <div
          key={idx}
          title={cell ? `Rank #${cell.rank || "—"}` : "No data"}
          className={cn(
            "size-2 rounded-[2px]",
            cell ? rankColorSoft(cell.rank) : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function TrendBadge({ delta, dir }: { delta: number; dir: "up" | "down" | "flat" }) {
  if (dir === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" /> 0
      </span>
    );
  }
  // For rank: "up" trend (improvement) = green arrow up; "down" = red arrow down
  const isGood = dir === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isGood ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {isGood ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {delta}
    </span>
  );
}

// ── AI Recommendations ───────────────────────────────────────────────
function AiRecommendationsPanel({
  locationName, canManage, recs, loading, error, hasFetched, disabled, onGenerate,
}: {
  locationName: string;
  canManage: boolean;
  recs: string[];
  loading: boolean;
  error: string | null;
  hasFetched: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <CardSection
      title="AI SEO Recommendations"
      description={canManage ? "MiSA AI analyzes keyword data to suggest improvements" : "View-only — ask a manager to generate"}
      className="lg:col-span-2"
      action={
        canManage && (
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={loading || disabled}>
            {loading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="size-3.5 mr-1.5" />}
            {hasFetched ? "Regenerate" : "Generate"}
          </Button>
        )
      }
    >
      {disabled ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Info className="size-6 mx-auto mb-2 text-muted-foreground/60" />
          Select a specific location above to generate AI recommendations.
        </div>
      ) : loading ? (
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
      ) : error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      ) : recs.length > 0 ? (
        <div className="space-y-3">
          {recs.map((rec, i) => (
            <div key={i} className="rounded-lg border p-4 bg-card hover:border-primary/30 transition">
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
          {canManage
            ? "Click \"Get AI Recommendations\" above (or \"Generate\") to get 5 AI-powered SEO recommendations based on this location's keyword data."
            : "No recommendations yet. Ask a Marketing Manager or Super Admin to generate."}
        </div>
      )}
    </CardSection>
  );
}

// ── Competitor monitoring (mock) ─────────────────────────────────────
const MOCK_COMPETITORS = [
  { name: "Livspace", avgRank: 2.5, change: -0.4 },
  { name: "HomeLane", avgRank: 3.2, change: 0.2 },
  { name: "Pepperfry", avgRank: 6.8, change: -0.1 },
  { name: "Urban Ladder", avgRank: 9.4, change: 0.6 },
];

function CompetitorMonitoring({ selectedKeyword }: { selectedKeyword: SeoKeyword | null }) {
  const myRank = selectedKeyword?.avgRank ?? 0;
  const competitors = useMemo(() => {
    const base = [...MOCK_COMPETITORS];
    if (myRank > 0) {
      base.unshift({ name: "MyFNG (you)", avgRank: myRank, change: 0 });
    }
    return base.sort((a, b) => a.avgRank - b.avgRank);
  }, [myRank]);

  const maxRank = Math.max(...competitors.map((c) => c.avgRank), 15);

  return (
    <CardSection
      title="Competitor Monitoring"
      description={selectedKeyword ? `For: ${selectedKeyword.keyword}` : "Select a keyword"}
      action={<Badge variant="outline" className="text-[10px]">Mock data</Badge>}
    >
      <div className="space-y-3">
        {competitors.map((c) => {
          const isMe = c.name.startsWith("MyFNG");
          const pct = Math.min(100, (c.avgRank / maxRank) * 100);
          // Lower rank = better. Bar fills from right (better) to left.
          const fillPct = 100 - pct;
          const rankCls = c.avgRank <= 3 ? "bg-emerald-500" : c.avgRank <= 10 ? "bg-amber-500" : c.avgRank <= 20 ? "bg-orange-500" : "bg-rose-500";
          return (
            <div key={c.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isMe ? (
                    <Crown className="size-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn("font-medium truncate", isMe && "text-primary")}>{c.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn("font-bold tabular-nums", rankTextClass(c.avgRank))}>#{c.avgRank}</span>
                  {!isMe && c.change !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center text-[10px] tabular-nums",
                        c.change < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {c.change < 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
                      {Math.abs(c.change)}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", isMe ? "bg-primary" : rankCls)}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Mock competitor data for illustration. Connect a real rank-tracking integration
          (e.g. Local Falcon, BrightLocal) to populate live competitor rankings.
        </span>
      </div>
    </CardSection>
  );
}

// ── Empty state ──────────────────────────────────────────────────────
function EmptyState() {
  const setView = useAppStore((s) => s.setView);
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <div className="size-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
          <Search className="size-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No keywords tracked yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Once keywords are added for your locations, you&apos;ll see ranking data,
          a 5×5 geo-grid heatmap, and AI recommendations here.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
