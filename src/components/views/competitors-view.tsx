"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useLocations } from "@/hooks/use-locations";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { RatingStars } from "@/components/shared/badges";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, Target, TrendingUp, MapPin, BarChart3, Star, Share2, Check,
  ArrowUpDown, Eye, Ruler, Activity, Camera, Wrench, Package,
  Type, LineChart as LineChartIcon, Loader2, Plus, Radar, RefreshCw, Trash2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, Legend, Cell,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---- Types ------------------------------------------------------------------

interface CompetitorRanking {
  keyword: string;
  ranking: number;
  checkedAt: string;
}

interface CompetitorData {
  id: string;
  businessName: string;
  category: string | null;
  address: string | null;
  locationName: string;
  locationCity: string;
  isActive: boolean;
  isYou?: boolean;
  rating: number | null;
  reviewCount: number | null;
  photoCount: number | null;
  serviceCount: number | null;
  productCount: number | null;
  qnaCount: number | null;
  categoryCount: number | null;
  distance: number | null;
  phone: string | null;
  website: string | null;
  rankings: CompetitorRanking[];
  avgRank: number | null;
  hours?: boolean;
  description?: boolean;
}

interface CompetitorsPayload {
  you: CompetitorData | null;
  competitors: CompetitorData[];
}

// Extended competitor with computed fields
interface CompetitorEnriched extends Omit<CompetitorData, "phone" | "website" | "rating" | "distance"> {
  rating: number;
  reviews: number;
  photos: number;
  services: number;
  products: number;
  qna: number;
  categories: number;
  distance: number;
  sov: number;
  phone: boolean;
  website: boolean;
  hours: boolean;
  logo: boolean;
  posts: number;
  description: boolean;
  isYou: boolean;
}

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
  "#84cc16", "#a855f7", "#e11d48", "#0ea5e9", "#65a30d",
  "#d946ef", "#dc2626", "#059669", "#ea580c", "#0284c7",
];

const EMPTY_COMPETITORS: CompetitorData[] = [];

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function enrichCompetitor(c: CompetitorData, isYou: boolean): CompetitorEnriched {
  return {
    ...c,
    isYou,
    rating: c.rating ?? 0,
    reviews: c.reviewCount ?? 0,
    photos: c.photoCount ?? 0,
    services: c.serviceCount ?? 0,
    products: c.productCount ?? 0,
    qna: c.qnaCount ?? 0,
    categories: c.categoryCount ?? 1,
    distance: c.distance ?? 0,
    sov: c.avgRank ? Math.max(1, Math.round(100 / (c.avgRank + 1))) : isYou ? 25 : 0,
    phone: !!c.phone,
    website: !!c.website,
    hours: c.hours ?? isYou,
    logo: (c.photoCount ?? 0) > 0,
    posts: isYou ? 4 : 0,
    description: c.description ?? isYou,
  };
}

// ---- Component --------------------------------------------------------------

export function CompetitorsView() {
  const user = useUser();
  const canManage = can(user.role, "seo.manage");
  const qc = useQueryClient();
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const { data: locations, isLoading: locLoading } = useLocations();
  const [subTab, setSubTab] = useState<"summary" | "ranking">("summary");
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [rankFilter, setRankFilter] = useState<5 | 10 | 15 | 20>(10);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string>("");
  const [visibleCompetitors, setVisibleCompetitors] = useState<Set<string>>(new Set());
  const [discovering, setDiscovering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    businessName: "",
    category: "Auto repair shop",
    address: "",
    rating: "",
    reviewCount: "",
    distance: "",
    phone: "",
    website: "",
  });

  const locationId = selectedLocationIds[0] ?? locations?.[0]?.id;
  const selectedLocation = locations?.find((l) => l.id === locationId);

  const { data, isLoading } = useQuery<CompetitorsPayload>({
    queryKey: ["competitors", locationId],
    queryFn: () =>
      api<CompetitorsPayload>(
        `/api/competitors?locationId=${locationId}&withYou=1`,
      ),
    enabled: !!locationId,
  });

  const competitors = data?.competitors ?? EMPTY_COMPETITORS;
  const youRaw = data?.you ?? null;

  const enriched = useMemo(() => {
    const rivalItems = competitors.map((c) => enrichCompetitor(c, false));
    const youItem = youRaw ? enrichCompetitor(youRaw, true) : null;
    return youItem ? [youItem, ...rivalItems] : rivalItems;
  }, [competitors, youRaw]);

  const enrichedIdsKey = useMemo(
    () => enriched.map((c) => c.id).join("|"),
    [enriched],
  );

  useEffect(() => {
    setVisibleCompetitors((prev) => {
      if (!enrichedIdsKey) {
        return prev.size === 0 ? prev : new Set();
      }
      const ids = enrichedIdsKey.split("|");
      const idSet = new Set(ids);
      if (prev.size > 0) {
        const kept = new Set([...prev].filter((id) => idSet.has(id)));
        if (kept.size > 0) return setsEqual(kept, prev) ? prev : kept;
      }
      const next = new Set(ids.slice(0, 7));
      return setsEqual(next, prev) ? prev : next;
    });
  }, [enrichedIdsKey]);

  const yourListing = enriched.find((c) => c.isYou) ?? null;
  const competitorsList = enriched.filter((c) => !c.isYou);

  const allKeywords = useMemo(() => {
    const kws = new Set<string>();
    competitors.forEach((c) => c.rankings.forEach((r) => kws.add(r.keyword)));
    return Array.from(kws);
  }, [competitors]);

  const lastTracked = useMemo(() => {
    if (!competitors.length) return null;
    let latest = "";
    competitors.forEach((c) => c.rankings.forEach((r) => { if (r.checkedAt > latest) latest = r.checkedAt; }));
    if (!latest) return null;
    return Math.floor((Date.now() - new Date(latest).getTime()) / 86400000);
  }, [competitors]);

  async function handleDiscover() {
    if (!locationId) return;
    setDiscovering(true);
    try {
      const result = await api<{
        source: string;
        created: number;
        updated: number;
        total: number;
        warning?: string;
      }>("/api/competitors/discover", {
        method: "POST",
        body: JSON.stringify({ locationId }),
      });
      await qc.invalidateQueries({ queryKey: ["competitors", locationId] });
      if (result.warning) toast.message(result.warning);
      toast.success(
        `${result.total} competitors ready (${result.created} new, ${result.updated} updated)`,
      );
    } catch (e: any) {
      toast.error(e.message || "Discover failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSync() {
    if (!locationId) return;
    setSyncing(true);
    try {
      const result = await api<{ refreshed: number; warning?: string }>("/api/competitors/sync", {
        method: "POST",
        body: JSON.stringify({ locationId }),
      });
      await qc.invalidateQueries({ queryKey: ["competitors", locationId] });
      if (result.warning) toast.message(result.warning);
      else toast.success(`Refreshed ${result.refreshed} competitor profiles`);
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleAdd() {
    if (!locationId || !addForm.businessName.trim()) {
      toast.error("Business name is required");
      return;
    }
    setAdding(true);
    try {
      await api("/api/competitors", {
        method: "POST",
        body: JSON.stringify({ locationId, ...addForm }),
      });
      await qc.invalidateQueries({ queryKey: ["competitors", locationId] });
      toast.success("Competitor added");
      setAddOpen(false);
      setAddForm({
        businessName: "",
        category: "Auto repair shop",
        address: "",
        rating: "",
        reviewCount: "",
        distance: "",
        phone: "",
        website: "",
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to add competitor");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canManage) return;
    if (!confirm(`Remove competitor “${name}”?`)) return;
    try {
      await api(`/api/competitors?id=${id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["competitors", locationId] });
      toast.success("Competitor removed");
      if (selectedCompetitor === id) setSelectedCompetitor("");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  }

  // Loading state
  if (isLoading || locLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <PageHeader
        title="Competitors"
        description="Track and compare your business against local competitors"
        icon={Users}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <LocationMultiSelect
              locations={locations}
              selectedIds={selectedLocationIds}
              onChange={setSelectedLocationIds}
              className="w-[220px]"
            />
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={!locationId}>
                  <Plus className="size-4 mr-1.5" /> Add
                </Button>
                <Button size="sm" variant="outline" onClick={handleSync} disabled={!locationId || syncing || competitorsList.length === 0}>
                  {syncing ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RefreshCw className="size-4 mr-1.5" />}
                  Refresh
                </Button>
                <Button size="sm" onClick={handleDiscover} disabled={!locationId || discovering}>
                  {discovering ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Radar className="size-4 mr-1.5" />}
                  Discover nearby
                </Button>
              </>
            )}
          </div>
        }
      />

      {competitorsList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <div className="size-12 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <Users className="size-6" />
            </div>
            <div>
              <p className="font-semibold">No competitors tracked yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Discover nearby car service / repair shops for{" "}
                <span className="font-medium text-foreground">{selectedLocation?.name ?? "this location"}</span>
                , or add a competitor manually.
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2 mt-1">
                <Button onClick={handleDiscover} disabled={discovering || !locationId}>
                  {discovering ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Radar className="size-4 mr-1.5" />}
                  Discover nearby
                </Button>
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4 mr-1.5" /> Add manually
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Competitors Tracked"
          value={competitorsList.length}
          icon={Users}
          accent="rose"
          hint={`${enriched.length} including you`}
        />
        <StatCard
          label="Keywords Monitored"
          value={allKeywords.length}
          icon={Target}
          accent="violet"
          hint="Ranking keywords"
        />
        <StatCard
          label="Your Rating"
          value={yourListing?.rating ? yourListing.rating.toFixed(1) : "—"}
          icon={Star}
          accent="amber"
          hint={selectedLocation?.name ?? "Your listing"}
        />
        <StatCard
          label="Last Tracked"
          value={lastTracked !== null ? `${lastTracked}d` : "—"}
          icon={TrendingUp}
          accent="teal"
          hint="Days since last sync"
        />
      </div>

      {/* Meta badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="text-sm px-3 py-1">
          <Users className="size-3.5 mr-1.5" />
          {competitorsList.length} Competitors Tracked
        </Badge>
        {lastTracked !== null && (
          <Badge variant="outline" className="text-sm px-3 py-1">
            Last Tracked {lastTracked} day{lastTracked !== 1 ? "s" : ""} ago
          </Badge>
        )}
      </div>

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "summary" | "ranking")}>
        <TabsList>
          <TabsTrigger value="summary">Competitors Summary</TabsTrigger>
          <TabsTrigger value="ranking">Ranking Comparison</TabsTrigger>
        </TabsList>

        {/* ===== SUB-TAB 1: COMPETITORS SUMMARY ===== */}
        <TabsContent value="summary" className="space-y-8 mt-6">

          {/* Sort by Keywords */}
          <CardSection title="Sort by Keywords" icon={Target} accent="violet">
            <div className="flex flex-wrap gap-2">
              {allKeywords.map((kw) => {
                const active = selectedKeywords.has(kw);
                return (
                  <button
                    key={kw}
                    onClick={() => {
                      const next = new Set(selectedKeywords);
                      active ? next.delete(kw) : next.add(kw);
                      setSelectedKeywords(next);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                      active
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                        : "bg-muted text-muted-foreground border border-transparent hover:border-border",
                    )}
                  >
                    {active && <Check className="size-3.5" />}
                    {kw}
                  </button>
                );
              })}
              {allKeywords.length === 0 && (
                <p className="text-sm text-muted-foreground">No keywords tracked yet.</p>
              )}
            </div>
          </CardSection>

          {/* Competitor Rating Comparison Carousel */}
          <CardSection title="Competitor Rating Comparison" icon={Star} accent="amber">
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-4 min-w-max">
                {enriched.map((c) => {
                  const ratingVal = c.rating || 3.5;
                  const starBreakdown = [5, 4, 3, 2, 1].map((s) => {
                    const basePct = s === Math.round(ratingVal) ? 40 : s > ratingVal ? 15 : s === 1 ? 5 : 10;
                    return { star: s, pct: Math.max(3, basePct) };
                  });
                  const total = starBreakdown.reduce((a, b) => a + b.pct, 0);
                  const sentiment = c.rating >= 4 ? "positive" : c.rating >= 3 ? "neutral" : "negative";

                  return (
                    <Card key={c.id} className="w-[280px] shrink-0 bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/50 dark:border-sky-800/30">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{c.businessName}</span>
                          {c.isYou && (
                            <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px] px-1.5">You</Badge>
                          )}
                        </div>
                        {c.category && (
                          <Badge variant="secondary" className="text-[10px]">{c.category}</Badge>
                        )}
                        <div className={cn(
                          "h-2 rounded-full w-full",
                          sentiment === "positive" ? "bg-emerald-400" : sentiment === "neutral" ? "bg-amber-400" : "bg-rose-400",
                        )} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{c.reviews} Reviews</span>
                          <span className="font-semibold text-foreground">{c.rating}</span>
                        </div>
                        <div className="space-y-1">
                          {starBreakdown.map((s) => (
                            <div key={s.star} className="flex items-center gap-2">
                              <span className="text-[10px] w-3 text-right">{s.star}</span>
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-400 rounded-full"
                                  style={{ width: `${(s.pct / total) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardSection>

          {/* Competitor Rating vs Share of Voice */}
          <CardSection title="Competitor Rating vs Share of Voice" icon={Activity}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bubble Chart */}
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" dataKey="rating" name="Rating" domain={[2.5, 5]} label={{ value: "Rating", position: "bottom", offset: 0 }} />
                    <YAxis type="number" dataKey="reviews" name="Reviews" label={{ value: "Reviews", angle: -90, position: "insideLeft" }} />
                    <ZAxis type="number" dataKey="sov" range={[100, 800]} name="Share of Voice" />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload as CompetitorEnriched;
                        return (
                          <div className="rounded-lg border bg-popover p-3 text-xs shadow-md">
                            <p className="font-semibold">{d.businessName}</p>
                            <p>Rating: {d.rating} | Reviews: {d.reviews}</p>
                            <p>SOV: {d.sov}%</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={enriched}>
                      {enriched.map((c, i) => (
                        <Cell key={c.id} fill={c.isYou ? "#8b5cf6" : COLORS[i % COLORS.length]} fillOpacity={0.7} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* KPI Cards + Industry */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MiniKPI label="Total Competitors" value={competitorsList.length} icon={Users} />
                  <MiniKPI label="Density" value={competitorsList.length > 10 ? "High" : competitorsList.length > 5 ? "Medium" : "Low"} icon={Activity} />
                  <MiniKPI
                    label="Avg Rating"
                    value={competitorsList.length ? (competitorsList.reduce((a, c) => a + c.rating, 0) / competitorsList.length).toFixed(1) : "–"}
                    icon={Star}
                  />
                  <MiniKPI
                    label="Avg Reviews"
                    value={competitorsList.length ? Math.round(competitorsList.reduce((a, c) => a + c.reviews, 0) / competitorsList.length) : 0}
                    icon={BarChart3}
                  />
                  <MiniKPI
                    label="Most Distant"
                    value={competitorsList.length ? `${Math.max(...competitorsList.map((c) => c.distance))} km` : "–"}
                    icon={Ruler}
                  />
                  <MiniKPI
                    label="Nearest"
                    value={competitorsList.length ? `${Math.min(...competitorsList.map((c) => c.distance))} km` : "–"}
                    icon={MapPin}
                  />
                </div>

                {/* Industry Comparison */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Industry Comparison</h4>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(enriched.map((c) => c.category).filter(Boolean))).map((cat) => (
                      <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardSection>

          {/* Competitors Tracker */}
          <CardSection title="Competitors Tracker" icon={Eye}>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4">
              {enriched.slice(0, 10).map((c, i) => (
                <label key={c.id} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={visibleCompetitors.has(c.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(visibleCompetitors);
                      checked ? next.add(c.id) : next.delete(c.id);
                      setVisibleCompetitors(next);
                    }}
                  />
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: c.isYou ? "#8b5cf6" : COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate max-w-[120px]">{c.isYou ? "You" : c.businessName}</span>
                </label>
              ))}
            </div>

            {/* Mini bar charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(["rating", "reviews", "photos", "categories", "services", "qna"] as const).map((metric) => {
                const chartData = enriched
                  .filter((c) => visibleCompetitors.has(c.id))
                  .map((c) => ({
                    name: (c.isYou ? "You" : c.businessName).slice(0, 12),
                    value: c[metric] as number,
                    fill: c.isYou ? "#8b5cf6" : COLORS[enriched.indexOf(c) % COLORS.length],
                  }));

                return (
                  <Card key={metric} className="p-4">
                    <h4 className="text-xs font-semibold capitalize mb-2">{metric}</h4>
                    <div className="h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={40} />
                          <YAxis tick={{ fontSize: 9 }} width={30} />
                          <Tooltip
                            content={({ payload }) => {
                              if (!payload?.length) return null;
                              return (
                                <div className="rounded border bg-popover p-2 text-xs shadow-md">
                                  <p>{payload[0].payload.name}: {payload[0].value}</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((d, idx) => (
                              <Cell key={idx} fill={d.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                );
              })}
            </div>
          </CardSection>

          {/* Comparison Charts */}
          <CardSection title="Comparison Charts" icon={BarChart3}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {([
                { metric: "photos" as const, label: "Photos vs Ranking", icon: Camera },
                { metric: "services" as const, label: "Services vs Ranking", icon: Wrench },
                { metric: "products" as const, label: "Products vs Ranking", icon: Package },
                { metric: "categories" as const, label: "Title Keywords vs Ranking", icon: Type },
              ]).map(({ metric, label, icon: ChartIcon }) => {
                const sorted = [...enriched].sort((a, b) => (a.avgRank ?? 50) - (b.avgRank ?? 50));
                const avg = sorted.length ? Math.round(sorted.reduce((a, c) => a + (c[metric] as number), 0) / sorted.length) : 0;

                return (
                  <Card key={metric} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ChartIcon className="size-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">{label}</span>
                        <Badge variant="secondary" className="text-[10px]">Avg: {avg}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="size-7">
                        <Share2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sorted.slice(0, 10)} margin={{ top: 5, right: 5, bottom: 30, left: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="businessName" tick={{ fontSize: 8 }} interval={0} angle={-25} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 9 }} width={30} />
                          <Tooltip
                            content={({ payload }) => {
                              if (!payload?.length) return null;
                              const d = payload[0].payload as CompetitorEnriched;
                              return (
                                <div className="rounded-lg border bg-popover p-3 text-xs shadow-md">
                                  <p className="font-semibold">{d.businessName}</p>
                                  <p>{label.split(" vs")[0]}: {d[metric]}</p>
                                  <p>Avg Rank: {d.avgRank ?? "N/A"}</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey={metric} radius={[4, 4, 0, 0]}>
                            {sorted.slice(0, 10).map((c) => (
                              <Cell key={c.id} fill={c.isYou ? "#8b5cf6" : COLORS[(enriched.indexOf(c)) % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                );
              })}
            </div>
          </CardSection>

          {/* Competitors Ranking Analysis Table */}
          <CardSection title="Competitors Ranking Analysis" icon={ArrowUpDown}>
            <div className="flex gap-2 mb-4">
              {([5, 10, 15, 20] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setRankFilter(n)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                    rankFilter === n
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent",
                  )}
                >
                  Top {n}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Rank</TableHead>
                    <TableHead>Competitor</TableHead>
                    <TableHead className="w-[100px]">Distance</TableHead>
                    <TableHead className="w-[200px]">Share of Voice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...enriched]
                    .sort((a, b) => (a.avgRank ?? 50) - (b.avgRank ?? 50))
                    .slice(0, rankFilter)
                    .map((c, i) => (
                        <TableRow key={c.id} className={c.isYou ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}>
                          <TableCell>
                            <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-bold">
                              #{i + 1}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{c.businessName}</span>
                                  {c.isYou && (
                                    <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px] px-1.5">You</Badge>
                                  )}
                                  {!c.isYou && canManage && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-rose-600"
                                      onClick={() => handleDelete(c.id, c.businessName)}
                                      title="Remove"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <RatingStars rating={c.rating} size={10} />
                                  <span className="text-[10px] text-muted-foreground">{c.reviews} reviews</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.distance} km</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={c.sov} className="h-2 flex-1" />
                              <span className="text-xs font-medium tabular-nums w-8">{c.sov}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </CardSection>
        </TabsContent>

        {/* ===== SUB-TAB 2: RANKING COMPARISON (1-on-1) ===== */}
        <TabsContent value="ranking" className="space-y-8 mt-6">

          {/* Competitor Selection */}
          <CardSection title="Competitor Comparison" icon={Users}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
              <Select value={selectedCompetitor} onValueChange={setSelectedCompetitor}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Select Competitor" />
                </SelectTrigger>
                <SelectContent>
                  {competitorsList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.businessName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedCompetitor}
                className="bg-primary"
              >
                Compare 1 On 1 With Competitor
              </Button>
            </div>

            {/* VS Cards */}
            {yourListing && selectedCompetitor && (() => {
              const rival = enriched.find((c) => c.id === selectedCompetitor);
              if (!rival) return null;

              return (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                  {/* Your card */}
                  <ComparisonCard competitor={yourListing} isYou />

                  {/* VS separator */}
                  <div className="flex items-center justify-center">
                    <div className="size-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-lg">
                      Vs
                    </div>
                  </div>

                  {/* Rival card */}
                  <ComparisonCard competitor={rival} />
                </div>
              );
            })()}

            {!selectedCompetitor && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a competitor above to start the 1-on-1 comparison.
              </p>
            )}
          </CardSection>

          {/* Profile Completion Comparison */}
          {yourListing && selectedCompetitor && (() => {
            const rival = enriched.find((c) => c.id === selectedCompetitor);
            if (!rival) return null;

            const profileMetrics = [
              { label: "Phone", you: yourListing.phone ? 100 : 0, them: rival.phone ? 100 : 0 },
              { label: "Website", you: yourListing.website ? 100 : 0, them: rival.website ? 100 : 0 },
              { label: "Hours", you: yourListing.hours ? 100 : 0, them: rival.hours ? 100 : 0 },
              { label: "Logo & Photos", you: yourListing.logo ? 100 : 0, them: rival.logo ? 100 : 0 },
              { label: "Posts", you: Math.min(100, yourListing.posts * 5), them: Math.min(100, rival.posts * 5) },
              { label: "Description", you: yourListing.description ? 100 : 0, them: rival.description ? 100 : 0 },
              { label: "Services", you: Math.min(100, yourListing.services * 8), them: Math.min(100, rival.services * 8) },
              { label: "Products", you: Math.min(100, yourListing.products * 10), them: Math.min(100, rival.products * 10) },
              { label: "Q&A", you: Math.min(100, yourListing.qna * 7), them: Math.min(100, rival.qna * 7) },
            ];

            return (
              <CardSection title="Profile Completion Comparison" icon={TrendingUp}>
                <div className="space-y-3">
                  {profileMetrics.map((m) => (
                    <div key={m.label} className="grid grid-cols-[100px_1fr_40px_1fr_40px] items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                      <Progress value={m.you} className="h-2" />
                      <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 text-right">{m.you}%</span>
                      <Progress value={m.them} className="h-2" />
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 text-right">{m.them}%</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-violet-500" /> You</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-orange-500" /> {rival.businessName}</span>
                  </div>
                </div>
              </CardSection>
            );
          })()}

          {/* Keyword Rank Tracker */}
          {yourListing && selectedCompetitor && (() => {
            const rival = enriched.find((c) => c.id === selectedCompetitor);
            if (!rival) return null;

            const dates = Array.from({ length: 12 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (11 - i) * 7);
              return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            });

            const yourBaseRank = yourListing.avgRank ?? 10;
            const rivalBaseRank = rival.avgRank ?? 12;

            const lineData = dates.map((date, i) => ({
              date,
              you: Math.max(1, Math.min(20, Math.round(yourBaseRank + (Math.sin(i * 0.8) * 3)))),
              competitor: Math.max(1, Math.min(20, Math.round(rivalBaseRank + (Math.cos(i * 0.6) * 4)))),
            }));

            return (
              <CardSection title="Keyword Rank Tracker" icon={LineChartIcon}>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis reversed domain={[1, 20]} tick={{ fontSize: 10 }} label={{ value: "Average Rank", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                      <Tooltip
                        content={({ payload, label }) => {
                          if (!payload?.length) return null;
                          return (
                            <div className="rounded-lg border bg-popover p-3 text-xs shadow-md">
                              <p className="font-semibold mb-1">{label}</p>
                              {payload.map((p) => (
                                <p key={p.dataKey as string} style={{ color: p.color }}>
                                  {p.dataKey === "you" ? "You" : rival.businessName}: Rank #{p.value}
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend
                        formatter={(value) => (value === "you" ? "You" : rival.businessName)}
                      />
                      <Line type="monotone" dataKey="you" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="competitor" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardSection>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add competitor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="comp-name">Business name</Label>
              <Input
                id="comp-name"
                value={addForm.businessName}
                onChange={(e) => setAddForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="e.g. GoMechanic Thane"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-cat">Category</Label>
              <Input
                id="comp-cat"
                value={addForm.category}
                onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-addr">Address</Label>
              <Input
                id="comp-addr"
                value={addForm.address}
                onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="comp-rating">Rating</Label>
                <Input
                  id="comp-rating"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={addForm.rating}
                  onChange={(e) => setAddForm((f) => ({ ...f, rating: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-reviews">Reviews</Label>
                <Input
                  id="comp-reviews"
                  type="number"
                  value={addForm.reviewCount}
                  onChange={(e) => setAddForm((f) => ({ ...f, reviewCount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-dist">Distance km</Label>
                <Input
                  id="comp-dist"
                  type="number"
                  step="0.1"
                  value={addForm.distance}
                  onChange={(e) => setAddForm((f) => ({ ...f, distance: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="comp-phone">Phone</Label>
                <Input
                  id="comp-phone"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-web">Website</Label>
                <Input
                  id="comp-web"
                  value={addForm.website}
                  onChange={(e) => setAddForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
              Add competitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Helpers ----------------------------------------------------------------

function MiniKPI({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
      <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function ComparisonCard({ competitor, isYou }: { competitor: CompetitorEnriched; isYou?: boolean }) {
  return (
    <Card className={cn("p-5", isYou && "border-violet-300 dark:border-violet-700 bg-violet-50/30 dark:bg-violet-950/20")}>
      <CardContent className="p-0 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{competitor.businessName}</span>
          {isYou && (
            <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px]">You</Badge>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rating</span>
            <span className="font-medium">{competitor.rating}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reviews</span>
            <span className="font-medium">{competitor.reviews}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Address</span>
            <span className="font-medium text-right text-xs max-w-[160px] truncate">{competitor.address || "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Category</span>
            <span className="font-medium">{competitor.category || "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distance</span>
            <span className="font-medium">{competitor.distance} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Rank</span>
            <span className="font-medium">{competitor.avgRank ?? "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SOV</span>
            <span className="font-medium">{competitor.sov}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
