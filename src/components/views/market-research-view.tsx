"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useLocations, type LocationOption } from "@/hooks/use-locations";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RatingStars } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MapPin, Trophy, TrendingUp, Lightbulb, Star, Download, Plus,
  ChevronLeft, ChevronRight, Sparkles, Pencil, Trash2, Eye,
  Search, Filter, ChevronDown, BarChart3, Target, Flame,
} from "lucide-react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Cell as RCell,
} from "recharts";
import { toast } from "sonner";

/* ---------- Types ---------- */

interface CompetitorFromAPI {
  id: string;
  businessName: string;
  category: string | null;
  address: string | null;
  locationName: string;
  locationCity: string;
  isActive: boolean;
  rating: number | null;
  reviewCount: number | null;
  photoCount: number | null;
  distance: number | null;
  rankings: { keyword: string; ranking: number; checkedAt: string }[];
  avgRank: number | null;
}

interface CompetitorCard {
  id: string;
  rank: number;
  name: string;
  isYou: boolean;
  totalReviews: number;
  avgReviewsPerListing: number;
  avgRating: number;
  shareOfVoice: number;
  city: string;
  distance: string;
}

interface CityGroup {
  city: string;
  listings: number;
  competitors: number;
}

/* ---------- Helpers ---------- */

const RANK_COLORS = [
  "bg-emerald-500", "bg-orange-500", "bg-blue-500",
  "bg-purple-500", "bg-rose-500", "bg-cyan-500",
  "bg-amber-500", "bg-indigo-500", "bg-teal-500", "bg-pink-500",
];

function getRankColor(rank: number) {
  return RANK_COLORS[(rank - 1) % RANK_COLORS.length];
}

function generateCompetitorCards(
  competitors: CompetitorFromAPI[],
  locations: LocationOption[],
  city: string,
): CompetitorCard[] {
  const locationNames = new Set(locations.map((l) => l.name.toLowerCase()));
  const cityCompetitors = city === "all"
    ? competitors
    : competitors.filter((c) => c.locationCity.toLowerCase() === city.toLowerCase());

  const totalRankSum = cityCompetitors.reduce((acc, c) => acc + (c.avgRank ?? 50), 0) || 1;

  return cityCompetitors
    .sort((a, b) => (a.avgRank ?? 50) - (b.avgRank ?? 50))
    .map((c, idx) => {
      const avgRank = c.avgRank ?? 50;
      const shareOfVoice = Math.round(((50 - Math.min(avgRank, 50)) / totalRankSum) * 100 * 10) / 10;
      return {
        id: c.id,
        rank: idx + 1,
        name: c.businessName,
        isYou: locationNames.has(c.businessName.toLowerCase()),
        totalReviews: c.reviewCount ?? 0,
        avgReviewsPerListing: c.reviewCount ?? 0,
        avgRating: c.rating ?? 0,
        shareOfVoice: Math.max(shareOfVoice, 0.5),
        city: c.locationCity,
        distance: c.distance ? `${c.distance.toFixed(1)} km` : "— km",
      };
    });
}

function downloadCSV(cards: CompetitorCard[], filename: string) {
  const headers = ["Rank", "Competitor", "Is You", "Total Reviews", "Avg Reviews/Listing", "Avg Rating", "Share of Voice %", "Distance"];
  const rows = cards.map((c) => [
    c.rank, c.name, c.isYou ? "Yes" : "No", c.totalReviews,
    c.avgReviewsPerListing, c.avgRating.toFixed(1), c.shareOfVoice.toFixed(1), c.distance,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exported successfully");
}

/* ---------- Sub-components ---------- */

function CompetitorCardItem({ card }: { card: CompetitorCard }) {
  return (
    <Card className="min-w-[240px] max-w-[260px] shrink-0 border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "size-7 rounded-full flex items-center justify-center text-xs font-bold text-white",
              getRankColor(card.rank),
            )}>
              {card.rank}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate max-w-[140px]">{card.name}</p>
              {card.isYou && (
                <Badge className="mt-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px] px-1.5 py-0">
                  You
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button className="size-6 rounded hover:bg-muted flex items-center justify-center">
              <Pencil className="size-3 text-muted-foreground" />
            </button>
            <button className="size-6 rounded hover:bg-muted flex items-center justify-center">
              <Trash2 className="size-3 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Reviews</span>
            <span className="font-medium tabular-nums">{card.totalReviews}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Reviews/Listing</span>
            <span className="font-medium tabular-nums">{card.avgReviewsPerListing}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Avg Rating</span>
            <RatingStars rating={card.avgRating} size={11} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Share of Voice</span>
            <span className="font-semibold text-primary tabular-nums">{card.shareOfVoice.toFixed(1)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankingCarousel({
  cards, cityGroups, selectedCity, onCityChange,
}: {
  cards: CompetitorCard[];
  cityGroups: CityGroup[];
  selectedCity: string;
  onCityChange: (city: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 280;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }, []);

  const activeCityGroup = cityGroups.find((g) => g.city === selectedCity);
  const locationCount = activeCityGroup?.listings ?? cityGroups.reduce((s, g) => s + g.listings, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" />
            Competitors Ranking Analysis for {locationCount} Location{locationCount !== 1 ? "s" : ""}
          </CardTitle>
          <Select value={selectedCity} onValueChange={onCityChange}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cityGroups.map((g) => (
                <SelectItem key={g.city} value={g.city}>
                  {g.city} ({g.listings} Listings, {g.competitors} Competitors)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full shadow-md"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide px-10 pb-2 scroll-smooth"
          >
            {cards.map((card) => (
              <CompetitorCardItem key={card.id} card={card} />
            ))}
            {cards.length === 0 && (
              <div className="flex items-center justify-center w-full py-12 text-muted-foreground text-sm">
                No competitor data available
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full shadow-md"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Button className="w-full bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white hover:bg-slate-800 dark:hover:bg-slate-200">
          <Plus className="size-4 mr-2" />
          Add Custom Brand Competitor
        </Button>
      </CardContent>
    </Card>
  );
}

function RankingTable({
  cards, onExport,
}: {
  cards: CompetitorCard[];
  onExport: () => void;
}) {
  const [topN, setTopN] = useState<number>(10);
  const filtered = cards.slice(0, topN);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base font-semibold">Competitors Ranking</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[5, 10, 15, 20].map((n) => (
                <Button
                  key={n}
                  variant={topN === n ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => setTopN(n)}
                >
                  Top {n}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-7" onClick={onExport}>
              <Download className="size-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Rank</TableHead>
              <TableHead>Competitor</TableHead>
              <TableHead className="text-right">Distance</TableHead>
              <TableHead className="text-right w-[200px]">Share of Voice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((card) => (
              <TableRow key={card.id}>
                <TableCell>
                  <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-bold">
                    #{card.rank}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium text-sm">{card.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <RatingStars rating={card.avgRating} size={10} />
                        <span className="text-xs text-muted-foreground">({card.totalReviews} reviews)</span>
                        {card.isYou && (
                          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px] px-1.5 py-0">
                            You
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="size-6 ml-auto shrink-0">
                      <Eye className="size-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{card.distance}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Progress value={card.shareOfVoice} className="h-2 w-20" />
                    <span className="text-xs font-medium tabular-nums w-10 text-right">
                      {card.shareOfVoice.toFixed(1)}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ShareOfVoiceGraph({ cards }: { cards: CompetitorCard[] }) {
  const [showSummary, setShowSummary] = useState(false);

  const bubbleData = cards.slice(0, 15).map((c) => ({
    name: c.name,
    rating: c.avgRating,
    reviews: c.totalReviews,
    sov: c.shareOfVoice,
    isYou: c.isYou,
  }));

  const citySOV = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    cards.forEach((c) => {
      if (!grouped[c.city]) grouped[c.city] = [];
      grouped[c.city].push(c.shareOfVoice);
    });
    return Object.entries(grouped).map(([city, vals]) => ({
      city,
      sov: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    })).sort((a, b) => b.sov - a.sov);
  }, [cards]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            Share of Voice
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              setShowSummary(true);
              toast.success("Summary generated");
            }}
          >
            <Sparkles className="size-3.5 mr-1.5" />
            Generate Share of Voice Summary
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bubble Chart */}
          <div>
            <p className="text-xs text-muted-foreground mb-3 font-medium">
              Bubble Size = Share of Voice
            </p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    type="number"
                    dataKey="rating"
                    name="Rating"
                    domain={[1, 5]}
                    label={{ value: "Rating", position: "bottom", offset: 0, fontSize: 11 }}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="reviews"
                    name="Avg. Reviews"
                    label={{ value: "Avg. Reviews", angle: -90, position: "insideLeft", offset: 0, fontSize: 11 }}
                    tick={{ fontSize: 11 }}
                  />
                  <ZAxis type="number" dataKey="sov" range={[40, 400]} name="Share of Voice" />
                  <RTooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-2.5 shadow-lg text-xs space-y-1">
                          <p className="font-semibold">{d.name}</p>
                          <p>Rating: {d.rating.toFixed(1)}</p>
                          <p>Reviews: {d.reviews}</p>
                          <p>Share of Voice: {d.sov.toFixed(1)}%</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={bubbleData}>
                    {bubbleData.map((entry, i) => (
                      <RCell
                        key={i}
                        fill={entry.isYou ? "hsl(var(--primary))" : `hsl(${(i * 37) % 360}, 60%, 55%)`}
                        fillOpacity={0.7}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* City SOV Table */}
          <div>
            <p className="text-xs text-muted-foreground mb-3 font-medium">Share of Voice by City</p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {citySOV.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Share of Voice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {citySOV.map((row) => (
                      <TableRow key={row.city}>
                        <TableCell className="font-medium text-sm">{row.city}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={cn(
                            "font-medium text-xs",
                            row.sov >= 10
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                          )}>
                            {row.sov.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  No city data available
                </div>
              )}
            </div>
          </div>
        </div>

        {showSummary && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border text-sm space-y-2">
            <p className="font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              AI-Generated Summary
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Your listings show a competitive presence across multiple cities. Focus on improving
              review count and maintaining high ratings to increase your share of voice. Locations
              with lower SOV may benefit from increased engagement and review generation campaigns.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TipsToImprove() {
  const tips = [
    {
      title: "Importance of Products",
      description: "Showcase your offerings and improve local SEO visibility. Adding products to your profile helps customers understand your services better.",
    },
    {
      title: "Competitor Comparison",
      description: "Your competitors average more product listings. Adding detailed service descriptions can differentiate your business in local search results.",
    },
    {
      title: "Special Offers & Discounts",
      description: "Attract and retain customers with regular promotions. Businesses with active offers see up to 30% more profile engagement.",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Lightbulb className="size-4 text-purple-500" />
          Tips to Improve Ranking
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tips.map((tip, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card p-4 space-y-2 hover:border-purple-500/30 transition-colors"
            >
              <div className="size-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Lightbulb className="size-4 text-purple-500" />
              </div>
              <h4 className="font-semibold text-sm">{tip.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{tip.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CompetitorHeatmap({
  cards, cityGroups,
}: {
  cards: CompetitorCard[];
  cityGroups: CityGroup[];
}) {
  const [filterCity, setFilterCity] = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("");

  const filteredCards = useMemo(() => {
    let result = cards;
    if (filterCity !== "all") {
      result = result.filter((c) => c.city.toLowerCase() === filterCity.toLowerCase());
    }
    if (filterKeyword) {
      result = result.filter((c) => c.name.toLowerCase().includes(filterKeyword.toLowerCase()));
    }
    return result;
  }, [cards, filterCity, filterKeyword]);

  const gridData = useMemo(() => {
    if (filteredCards.length === 0) return [];
    const rows = 8;
    const cols = 10;
    const cells: { row: number; col: number; intensity: number; count: number; area: string }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          row: r,
          col: c,
          intensity: 0,
          count: 0,
          area: `Area ${String.fromCharCode(65 + r)}${c + 1}`,
        });
      }
    }
    return cells;
  }, [filteredCards]);

  const getHeatColor = (intensity: number) => {
    if (intensity === 0) return "bg-slate-100 dark:bg-slate-800";
    if (intensity < 0.25) return "bg-emerald-100 dark:bg-emerald-900/40";
    if (intensity < 0.5) return "bg-amber-200 dark:bg-amber-900/40";
    if (intensity < 0.75) return "bg-orange-300 dark:bg-orange-800/50";
    return "bg-rose-400 dark:bg-rose-700/60";
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cityGroups.map((g) => (
                  <SelectItem key={g.city} value={g.city}>{g.city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search keyword..."
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                className="h-9 w-[180px] rounded-md border bg-background px-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Flame className="size-4 text-orange-500" />
              Competitor Density Heatmap
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Low</span>
              <div className="flex gap-0.5">
                <div className="size-3 rounded-sm bg-emerald-100 dark:bg-emerald-900/40" />
                <div className="size-3 rounded-sm bg-amber-200 dark:bg-amber-900/40" />
                <div className="size-3 rounded-sm bg-orange-300 dark:bg-orange-800/50" />
                <div className="size-3 rounded-sm bg-rose-400 dark:bg-rose-700/60" />
              </div>
              <span>High</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCards.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Add competitors to see density heatmap data.
            </div>
          ) : (
          <>
          <div className="overflow-x-auto">
            <div className="grid gap-1 min-w-[600px]" style={{ gridTemplateColumns: `repeat(10, 1fr)` }}>
              {gridData.map((cell, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "aspect-square rounded-md flex items-center justify-center text-[10px] font-medium transition-colors cursor-pointer hover:ring-2 hover:ring-primary/30",
                    getHeatColor(cell.intensity),
                    cell.intensity > 0.5 ? "text-white dark:text-white" : "text-foreground",
                  )}
                  title={`${cell.area}: ${cell.count} competitors`}
                >
                  {cell.count > 0 ? cell.count : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-2xl font-bold text-foreground">{filteredCards.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Competitors</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-2xl font-bold text-foreground">
                {gridData.filter((c) => c.intensity >= 0.75).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">High Density Areas</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-2xl font-bold text-foreground">
                {gridData.filter((c) => c.intensity < 0.25 && c.intensity > 0).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Low Competition Zones</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-2xl font-bold text-foreground">
                {(filteredCards.reduce((a, c) => a + c.shareOfVoice, 0) / Math.max(filteredCards.length, 1)).toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">Avg Share of Voice</p>
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Main Component ---------- */

export function MarketResearchView() {
  const { data: locations, isLoading: locsLoading } = useLocations();
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"research" | "heatmap">("research");
  const [selectedCity, setSelectedCity] = useState("all");

  const locFilterParam = selectedLocIds.length > 0 ? `?locationId=${selectedLocIds[0]}` : "";

  const { data: competitors, isLoading: compsLoading } = useQuery<CompetitorFromAPI[]>({
    queryKey: ["competitors", selectedLocIds],
    queryFn: () => api<CompetitorFromAPI[]>(`/api/competitors${locFilterParam}`),
  });

  const isLoading = locsLoading || compsLoading;

  const filterLabel = useMemo(() => {
    if (selectedLocIds.length === 0) return `${locations?.length ?? 0} Locations Selected`;
    return `${selectedLocIds.length} Location${selectedLocIds.length !== 1 ? "s" : ""} Selected`;
  }, [selectedLocIds, locations]);

  const cityGroups = useMemo((): CityGroup[] => {
    if (!locations || !competitors) return [];
    const grouped: Record<string, { listings: Set<string>; competitors: Set<string> }> = {};
    locations.forEach((loc) => {
      if (!grouped[loc.city]) grouped[loc.city] = { listings: new Set(), competitors: new Set() };
      grouped[loc.city].listings.add(loc.id);
    });
    competitors.forEach((comp) => {
      const city = comp.locationCity || "Unknown";
      if (!grouped[city]) grouped[city] = { listings: new Set(), competitors: new Set() };
      grouped[city].competitors.add(comp.id);
    });
    return Object.entries(grouped)
      .map(([city, data]) => ({
        city,
        listings: data.listings.size,
        competitors: data.competitors.size,
      }))
      .filter((g) => g.city && g.city !== "Unknown")
      .sort((a, b) => b.listings - a.listings);
  }, [locations, competitors]);

  const cards = useMemo(() => {
    if (!competitors || !locations) return [];
    return generateCompetitorCards(competitors, locations, selectedCity);
  }, [competitors, locations, selectedCity]);

  const kpiStats = useMemo(() => {
    const avgRating =
      cards.length > 0
        ? (cards.reduce((s, c) => s + c.avgRating, 0) / cards.length).toFixed(1)
        : "—";
    const avgSov =
      cards.length > 0
        ? (cards.reduce((s, c) => s + c.shareOfVoice, 0) / cards.length).toFixed(1)
        : "—";
    const yourCard = cards.find((c) => c.isYou);
    return {
      competitors: cards.length,
      cities: cityGroups.length,
      avgRating,
      avgSov: avgSov === "—" ? "—" : `${avgSov}%`,
      yourRank: yourCard?.rank ?? "—",
    };
  }, [cards, cityGroups.length]);

  function toggleLoc(id: string) {
    setSelectedLocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <PageHeader
        title="Market Research"
        description="Market analysis, share of voice & competitor heatmaps"
        icon={Target}
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <MapPin className="size-3.5 mr-1.5" />
                Selected Listings: {filterLabel}
                <ChevronDown className="size-3.5 ml-1.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <p className="text-xs font-medium text-muted-foreground mb-2">Filter by locations</p>
              <ScrollArea className="max-h-60">
                <div className="space-y-1">
                  {locations?.map((loc) => (
                    <label
                      key={loc.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedLocIds.includes(loc.id)}
                        onCheckedChange={() => toggleLoc(loc.id)}
                      />
                      <span className="text-sm truncate">{loc.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{loc.city}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              {selectedLocIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 h-7 text-xs"
                  onClick={() => setSelectedLocIds([])}
                >
                  Clear selection
                </Button>
              )}
            </PopoverContent>
          </Popover>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Competitors"
              value={kpiStats.competitors}
              icon={BarChart3}
              accent="indigo"
              hint={selectedCity === "all" ? "All cities" : selectedCity}
            />
            <StatCard
              label="Markets"
              value={kpiStats.cities}
              icon={MapPin}
              accent="emerald"
              hint="Cities tracked"
            />
            <StatCard
              label="Avg Rating"
              value={kpiStats.avgRating}
              icon={Star}
              accent="amber"
              hint="Competitor average"
            />
            <StatCard
              label="Share of Voice"
              value={kpiStats.avgSov}
              icon={Trophy}
              accent="violet"
              hint={kpiStats.yourRank !== "—" ? `Your rank #${kpiStats.yourRank}` : "Market average"}
            />
          </>
        )}
      </div>

      {/* Sub-tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "research" | "heatmap")}
      >
        <TabsList>
          <TabsTrigger value="research" className="gap-1.5">
            <TrendingUp className="size-3.5" />
            Market Research
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1.5">
            <MapPin className="size-3.5" />
            Competitor Heatmap
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      )}

      {/* Market Research Tab */}
      {!isLoading && activeTab === "research" && (
        <div className="space-y-6">
          <RankingCarousel
            cards={cards}
            cityGroups={cityGroups}
            selectedCity={selectedCity}
            onCityChange={setSelectedCity}
          />
          <RankingTable
            cards={cards}
            onExport={() => downloadCSV(cards, "competitors-ranking.csv")}
          />
          <ShareOfVoiceGraph cards={cards} />
          <TipsToImprove />
        </div>
      )}

      {/* Heatmap Tab */}
      {!isLoading && activeTab === "heatmap" && (
        <CompetitorHeatmap cards={cards} cityGroups={cityGroups} />
      )}
    </div>
  );
}
