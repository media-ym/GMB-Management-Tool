"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  MapPin, RefreshCw, Search, Building2, Activity, HeartPulse,
  AlertTriangle, Phone, Globe, Star, Clock, Navigation, ArrowRight,
  MessageSquare, Loader2, MapPinned, FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import type { DashboardSummary, LocationWithStats } from "@/lib/types";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  RatingStars, StatusBadge, SyncStatusBadge, ScoreBadge,
} from "@/components/shared/badges";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type StatusFilter = "all" | "active" | "paused" | "error";
type SortKey = "city" | "rating" | "health" | "reviews";

// Mock services & hours — kept consistent across all locations
const MOCK_SERVICES = [
  "Modular Kitchens", "Home Interiors", "Wardrobes & Storage",
  "Modular Furniture", "Renovation", "Free Site Visit",
];

const MOCK_HOURS = [
  { day: "Mon – Fri", time: "10:00 AM – 8:00 PM" },
  { day: "Saturday", time: "10:00 AM – 9:00 PM" },
  { day: "Sunday", time: "11:00 AM – 6:00 PM" },
];

export function LocationsView() {
  const user = useUser();
  const setView = useAppStore((s) => s.setView);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("city");
  const [drawerLocationId, setDrawerLocationId] = useState<string | null>(null);

  const canSync = can(user.role, "system.sync");

  const { data: locations, isLoading } = useQuery<LocationWithStats[]>({
    queryKey: ["locations"],
    queryFn: () => api<LocationWithStats[]>("/api/locations"),
  });

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<DashboardSummary>("/api/dashboard"),
  });

  const filtered = useMemo(() => {
    if (!locations) return [];
    const q = search.trim().toLowerCase();
    let list = locations.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q)
      );
    });
    list = list.slice().sort((a, b) => {
      switch (sort) {
        case "rating": return b.avgRating - a.avgRating;
        case "health": return b.healthScore - a.healthScore;
        case "reviews": return b.reviewCount - a.reviewCount;
        case "city":
        default:
          return a.city.localeCompare(b.city) || a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [locations, search, status, sort]);

  const avgHealth = useMemo(() => {
    if (!locations || locations.length === 0) return 0;
    return Math.round(locations.reduce((a, l) => a + l.healthScore, 0) / locations.length);
  }, [locations]);

  const syncErrors = useMemo(
    () => (locations ?? []).filter((l) => l.syncStatus === "error").length,
    [locations],
  );

  const activeCount = useMemo(
    () => (locations ?? []).filter((l) => l.status === "active").length,
    [locations],
  );

  const drawerLocation = useMemo(
    () => (locations ?? []).find((l) => l.id === drawerLocationId) ?? null,
    [locations, drawerLocationId],
  );

  async function handleSyncAll() {
    try {
      toast.loading("Triggering Google sync for all locations…", { id: "sync-all" });
      await api("/api/dashboard", { method: "POST", body: JSON.stringify({}) });
      await qc.invalidateQueries({ queryKey: ["locations"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Sync complete — all locations updated.", { id: "sync-all" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg, { id: "sync-all" });
    }
  }

  async function handleSyncOne(loc: LocationWithStats) {
    try {
      toast.loading(`Syncing ${loc.name}…`, { id: `sync-${loc.id}` });
      await api("/api/dashboard", {
        method: "POST",
        body: JSON.stringify({ locationId: loc.id }),
      });
      await qc.invalidateQueries({ queryKey: ["locations"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success(`${loc.name} synced.`, { id: `sync-${loc.id}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg, { id: `sync-${loc.id}` });
    }
  }

  function openReviews(loc: LocationWithStats) {
    setActiveLocationId(loc.id);
    setView("reviews");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Locations"
        description="Manage all MyFNG Google Business Profiles across cities"
        icon={MapPin}
        actions={
          canSync ? (
            <Button size="sm" onClick={handleSyncAll} disabled={isLoading}>
              <RefreshCw className="size-3.5 mr-1.5" /> Sync all
            </Button>
          ) : null
        }
      />

      {/* Summary stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading || !locations ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Locations"
              value={locations.length}
              icon={Building2}
              hint={`${activeCount} active`}
              accent="emerald"
            />
            <StatCard
              label="Active"
              value={activeCount}
              icon={Activity}
              hint={`${locations.length - activeCount} paused / error`}
              accent="teal"
            />
            <StatCard
              label="Avg Health Score"
              value={avgHealth}
              icon={HeartPulse}
              hint="Across all locations"
              accent="amber"
            />
            <StatCard
              label="Sync Errors"
              value={syncErrors}
              icon={AlertTriangle}
              hint={syncErrors === 0 ? "All healthy" : "Needs attention"}
              accent={syncErrors > 0 ? "rose" : "emerald"}
            />
          </>
        )}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              placeholder="Search by location name or city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search locations"
            />
          </div>

          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="paused">Paused</TabsTrigger>
              <TabsTrigger value="error">Error</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Sort by</span>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="city">City</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="reviews">Reviews</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Result count */}
      <div className="flex items-center justify-between -mt-2">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filtered.length}</span>
          {filtered.length !== (locations?.length ?? 0) && (
            <> of <span className="font-medium text-foreground">{locations?.length ?? 0}</span></>
          )} location{(locations?.length ?? 0) === 1 ? "" : "s"}
        </p>
        {summary && (
          <p className="text-xs text-muted-foreground hidden sm:block">
            Last sync run:{" "}
            <span className="font-medium">
              {locations?.[0]?.lastSyncedAt
                ? formatDistanceToNow(new Date(locations[0].lastSyncedAt), { addSuffix: true })
                : "never"}
            </span>
          </p>
        )}
      </div>

      {/* Grid view */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <MapPin className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">No locations found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {locations && locations.length > 0
                ? "Try adjusting your search or filters to find what you're looking for."
                : "No locations are assigned to your account. Contact your administrator if this seems wrong."}
            </p>
            {(search || status !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setSort("city");
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              canSync={canSync}
              onSync={() => handleSyncOne(loc)}
              onViewDetails={() => setDrawerLocationId(loc.id)}
            />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet
        open={drawerLocationId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerLocationId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md md:max-w-lg overflow-y-auto scroll-area"
        >
          {drawerLocation ? (
            <LocationDrawer
              loc={drawerLocation}
              canSync={canSync}
              onSync={() => handleSyncOne(drawerLocation)}
              onViewReviews={() => openReviews(drawerLocation)}
            />
          ) : (
            <div className="p-6">
              <Skeleton className="h-8 w-1/2 mb-4" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ----------------------------- Location Card ----------------------------- */

function LocationCard({
  loc, canSync, onSync, onViewDetails,
}: {
  loc: LocationWithStats;
  canSync: boolean;
  onSync: () => void;
  onViewDetails: () => void;
}) {
  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        {/* Header: name + city */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{loc.city}, {loc.region}</span>
            </div>
            <h3 className="text-base font-semibold mt-0.5 truncate">{loc.name}</h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge status={loc.status} />
            <SyncStatusBadge status={loc.syncStatus} />
          </div>
        </div>

        {/* Rating + reviews */}
        <div className="flex items-center justify-between">
          <RatingStars rating={loc.avgRating} />
          <span className="text-xs text-muted-foreground">
            {loc.reviewCount.toLocaleString("en-IN")} review{loc.reviewCount === 1 ? "" : "s"}
          </span>
        </div>

        {/* Score pills */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Health</div>
            <div className="mt-1 flex items-center gap-1.5">
              <HeartPulse className="size-3.5 text-muted-foreground" />
              <ScoreBadge score={loc.healthScore} />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Visibility</div>
            <div className="mt-1 flex items-center gap-1.5">
              <Navigation className="size-3.5 text-muted-foreground" />
              <ScoreBadge score={loc.visibilityScore} />
            </div>
          </div>
        </div>

        {/* Address + phone */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-start gap-1.5">
            <Building2 className="size-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{loc.address}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" />
            <span>{loc.phone ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" />
            <span>
              {loc.lastSyncedAt
                ? `Synced ${formatDistanceToNow(new Date(loc.lastSyncedAt), { addSuffix: true })}`
                : "Never synced"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onViewDetails}
          >
            View details <ArrowRight className="size-3.5 ml-1" />
          </Button>
          {canSync && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onSync}
              disabled={loc.syncStatus === "syncing"}
            >
              {loc.syncStatus === "syncing" ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5 mr-1" />
              )}
              Sync
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Location Drawer ----------------------------- */

function LocationDrawer({
  loc, canSync, onSync, onViewReviews,
}: {
  loc: LocationWithStats;
  canSync: boolean;
  onSync: () => void;
  onViewReviews: () => void;
}) {
  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <MapPin className="size-3.5" />
          <span>{loc.city}, {loc.region}</span>
        </div>
        <SheetTitle className="text-xl">{loc.name}</SheetTitle>
        <SheetDescription className="sr-only">
          Full details for {loc.name} located in {loc.city}.
        </SheetDescription>
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge status={loc.status} />
          <SyncStatusBadge status={loc.syncStatus} />
        </div>
      </SheetHeader>

      <div className="px-6 pb-6 space-y-5 flex-1">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Rating</div>
            <div className="mt-1.5"><RatingStars rating={loc.avgRating} size={16} /></div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Reviews</div>
            <div className="mt-1 text-lg font-bold tabular-nums">
              {loc.reviewCount.toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        {/* Health & Visibility breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <HeartPulse className="size-4 text-emerald-500" /> Health & Visibility
          </h4>
          <ScoreRow
            label="Health Score"
            score={loc.healthScore}
            description="Profile completeness, accuracy, and freshness"
          />
          <ScoreRow
            label="Visibility Score"
            score={loc.visibilityScore}
            description="Local search ranking and discovery reach"
          />
        </div>

        <Separator />

        {/* Contact info */}
        <div className="space-y-2.5">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="size-4 text-muted-foreground" /> Profile Details
          </h4>
          <DetailRow icon={Building2} label="Address" value={loc.address} />
          <DetailRow icon={Phone} label="Phone" value={loc.phone ?? "—"} />
          <DetailRow
            icon={Globe}
            label="Website"
            value={
              loc.website ? (
                <a
                  href={loc.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {loc.website.replace(/^https?:\/\//, "")}
                  <ArrowRight className="size-3" />
                </a>
              ) : (
                "—"
              )
            }
          />
          <DetailRow
            icon={MapPinned}
            label="Coordinates"
            value={
              loc.latitude != null && loc.longitude != null
                ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
                : "—"
            }
          />
          <DetailRow
            icon={Clock}
            label="Last Synced"
            value={
              loc.lastSyncedAt
                ? formatDistanceToNow(new Date(loc.lastSyncedAt), { addSuffix: true })
                : "Never synced"
            }
          />
        </div>

        <Separator />

        {/* Services */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Services Offered</h4>
          <div className="flex flex-wrap gap-1.5">
            {MOCK_SERVICES.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        </div>

        {/* Business hours */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Business Hours</h4>
          <div className="max-h-40 overflow-y-auto scroll-area rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Day</TableHead>
                  <TableHead className="h-8 text-xs">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_HOURS.map((h) => (
                  <TableRow key={h.day}>
                    <TableCell className="py-2 text-xs font-medium">{h.day}</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{h.time}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 pt-2">
          <Button className="w-full" onClick={onViewReviews}>
            <MessageSquare className="size-4 mr-1.5" /> View reviews
            <ArrowRight className="size-3.5 ml-1" />
          </Button>
          {canSync && (
            <Button
              variant="outline"
              className="w-full"
              onClick={onSync}
              disabled={loc.syncStatus === "syncing"}
            >
              {loc.syncStatus === "syncing" ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="size-4 mr-1.5" />
              )}
              Sync this location
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/* ----------------------------- Small helpers ----------------------------- */

function ScoreRow({
  label, score, description,
}: {
  label: string;
  score: number;
  description?: string;
}) {
  const color =
    score >= 75 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-rose-500";
  const indicatorClass =
    score >= 75
      ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
      : score >= 50
        ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
        : "[&>[data-slot=progress-indicator]]:bg-rose-500";
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("text-sm font-bold tabular-nums", color)}>{score}/100</span>
      </div>
      <Progress value={score} className={cn("mt-2 h-2 bg-muted", indicatorClass)} />
      {description && (
        <p className="text-[11px] text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}

function DetailRow({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm mt-0.5 break-words">{value}</div>
      </div>
    </div>
  );
}
