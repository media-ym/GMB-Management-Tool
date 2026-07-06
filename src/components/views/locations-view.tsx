"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  MapPin, RefreshCw, Search, Building2, Activity, HeartPulse,
  AlertTriangle, Phone, Globe, Star, Clock, Navigation, ArrowRight,
  ArrowLeft, MessageSquare, Loader2, MapPinned, FileText, MoreVertical,
  ExternalLink, Pencil, Check, X, Plus, Image as ImageIcon, CalendarClock,
  ShieldCheck, Eye, MousePointerClick, PhoneCall, TrendingUp, Target,
  ListChecks, Tag, Camera, History, Search as SeoIcon, Sparkles,
  Lock, ChevronDown, CircleCheck, CircleAlert, Inbox,
} from "lucide-react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import type { DashboardSummary, LocationWithStats, SyncStatus, LocationStatus } from "@/lib/types";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  RatingStars, StatusBadge, SyncStatusBadge, ScoreBadge,
} from "@/components/shared/badges";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ────────────────────────────────────────────────────────────────────────────
// Types matching /api/locations/[id] response
// ────────────────────────────────────────────────────────────────────────────

type SyncModule = "full" | "reviews" | "posts" | "profile" | "analytics" | "photos";

interface LocationDetailLocation {
  id: string;
  locationCode: string;
  name: string;
  city: string;
  region: string;
  state: string;
  pincode: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  status: LocationStatus;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  avgRating: number;
  reviewCount: number;
  healthScore: number;
  visibilityScore: number;
  createdAt: string;
  updatedAt: string;
}

interface GoogleProfile {
  id: string;
  googleLocationId: string;
  profileName: string;
  primaryCategory: string | null;
  additionalCategories: string[];
  averageRating: number;
  totalReviews: number;
  verificationState: string;
  profileStatus: string;
  mapUrl: string | null;
  businessInfo: {
    description: string | null;
    website: string | null;
    appointmentUrl: string | null;
  } | null;
}

interface CategoryRow { id: string; name: string; isPrimary: boolean; }
interface ServiceRow {
  id: string; name: string; description: string | null;
  category: string | null; status: string;
}
interface ProductRow {
  id: string; name: string; description: string | null;
  category: string | null; price: number | null; currency: string;
  imageUrl: string | null; status: string;
}
interface AttributeRow { id: string; name: string; value: string | null; }
interface HourRow {
  id: string; dayOfWeek: number; openTime: string | null;
  closeTime: string | null; isClosed: boolean;
}
interface SpecialHourRow {
  id: string; date: string; openTime: string | null;
  closeTime: string | null; isClosed: boolean;
}
interface PhotoRow {
  id: string; imageUrl: string; thumbnailUrl: string | null;
  source: string; createdAt: string;
}
interface TimelineRow {
  type: string; title: string; subtitle: string; timestamp: string;
}

interface CompletenessChecklist {
  businessName: boolean; phone: boolean; website: boolean;
  description: boolean; categories: boolean; services: boolean;
  photos: boolean; businessHours: boolean; attributes: boolean;
  verified: boolean;
}
interface Completeness { score: number; checklist: CompletenessChecklist; }

interface HealthBreakdown {
  googleRating: number;
  reviewResponseRate: number;
  profileCompleteness: number;
  photos: number;
  businessHoursAccuracy: number;
  servicesAdded: number;
  recentPosts: number;
  seoScore: number;
}

interface Analytics30d {
  searchViews: number | null;
  mapsViews: number | null;
  websiteClicks: number | null;
  phoneCalls: number | null;
  directionRequests: number | null;
}

interface SeoAudit {
  auditScore: number;
  profileStrength: number;
  missingPhotos: number;
  missingServices: number;
  recommendations: string[];
  auditedAt: string;
}

interface LocationDetailResponse {
  location: LocationDetailLocation;
  googleProfile: GoogleProfile | null;
  categories: CategoryRow[];
  services: ServiceRow[];
  products: ProductRow[];
  attributes: AttributeRow[];
  hours: HourRow[];
  specialHours: SpecialHourRow[];
  photos: PhotoRow[];
  completeness: Completeness;
  healthBreakdown: HealthBreakdown;
  timeline: TimelineRow[];
  analytics30d: Analytics30d;
  seoAudit: SeoAudit | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Static metadata
// ────────────────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const COMPLETENESS_ITEMS: { key: keyof CompletenessChecklist; label: string }[] = [
  { key: "businessName", label: "Business Name" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "description", label: "Description" },
  { key: "categories", label: "Categories" },
  { key: "services", label: "Services" },
  { key: "photos", label: "Photos" },
  { key: "businessHours", label: "Business Hours" },
  { key: "attributes", label: "Attributes" },
  { key: "verified", label: "Verified" },
];

const HEALTH_FACTORS: { key: keyof HealthBreakdown; label: string }[] = [
  { key: "googleRating", label: "Google Rating" },
  { key: "reviewResponseRate", label: "Review Response Rate" },
  { key: "profileCompleteness", label: "Profile Completeness" },
  { key: "photos", label: "Photos" },
  { key: "businessHoursAccuracy", label: "Business Hours Accuracy" },
  { key: "servicesAdded", label: "Services Added" },
  { key: "recentPosts", label: "Recent Posts" },
  { key: "seoScore", label: "SEO Score" },
];

const SYNC_MODULES: { value: SyncModule; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "full", label: "Full Sync", icon: RefreshCw },
  { value: "reviews", label: "Reviews", icon: MessageSquare },
  { value: "posts", label: "Posts", icon: FileText },
  { value: "profile", label: "Profile", icon: Building2 },
  { value: "analytics", label: "Analytics", icon: TrendingUp },
  { value: "photos", label: "Photos", icon: ImageIcon },
];

const TIMELINE_META: Record<string, { color: string; dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  review: { color: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", icon: Star },
  post: { color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", icon: FileText },
  sync: { color: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500", icon: RefreshCw },
  default: { color: "text-slate-600 dark:text-slate-400", dot: "bg-slate-500", icon: Activity },
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return "—"; }
}

function fullTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "d MMM yyyy, h:mm a"); }
  catch { return "—"; }
}

function scoreColor(score: number): string {
  if (score >= 75) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#f43f5e";
}

function scoreColorClass(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function progressIndicatorClass(score: number): string {
  if (score >= 75) return "[&>[data-slot=progress-indicator]]:bg-emerald-500";
  if (score >= 50) return "[&>[data-slot=progress-indicator]]:bg-amber-500";
  return "[&>[data-slot=progress-indicator]]:bg-rose-500";
}

function currencySymbol(code: string): string {
  return code === "INR" ? "₹" : code === "USD" ? "$" : code === "EUR" ? "€" : code + " ";
}

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return "—";
  try {
    return currencySymbol(currency) + price.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  } catch {
    return String(price);
  }
}

function formatAnalytics(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("en-IN");
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level view
// ────────────────────────────────────────────────────────────────────────────

export function LocationsView() {
  const user = useUser();
  const setView = useAppStore((s) => s.setView);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const qc = useQueryClient();

  const canSync = can(user.role, "system.sync");
  const canManage = can(user.role, "locations.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LocationStatus>("all");
  const [sort, setSort] = useState<"city" | "rating" | "health" | "reviews">("city");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState<"sync" | "archive" | "activate" | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: locations, isLoading } = useQuery<LocationWithStats[]>({
    queryKey: ["locations"],
    queryFn: () => api<LocationWithStats[]>("/api/locations"),
  });

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<DashboardSummary>("/api/dashboard"),
  });

  // Reset detail when locations list refetches & detail no longer exists
  useEffect(() => {
    if (detailId && locations && !locations.some((l) => l.id === detailId)) {
      setDetailId(null);
    }
  }, [detailId, locations]);

  const filtered = useMemo(() => {
    if (!locations) return [];
    const q = search.trim().toLowerCase();
    let list = locations.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
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
        default: return a.city.localeCompare(b.city) || a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [locations, search, statusFilter, sort]);

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

  async function handleSyncOne(loc: LocationWithStats, module: SyncModule = "full") {
    const toastId = `sync-${loc.id}-${module}`;
    try {
      setSyncingId(loc.id);
      toast.loading(`Syncing ${module === "full" ? "everything" : module} for ${loc.name}…`, { id: toastId });
      await api(`/api/locations/${loc.id}/sync`, {
        method: "POST",
        body: JSON.stringify({ module }),
      });
      await qc.invalidateQueries({ queryKey: ["locations"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      if (detailId === loc.id) await qc.invalidateQueries({ queryKey: ["location-detail", loc.id] });
      toast.success(`${loc.name} ${module === "full" ? "synced" : `${module} synced`}.`, { id: toastId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg, { id: toastId });
    } finally {
      setSyncingId(null);
    }
  }

  function openReviews(loc: LocationWithStats) {
    setActiveLocationId(loc.id);
    setView("reviews");
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!filtered) return;
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulk(action: "sync" | "archive" | "activate") {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const labels = {
      sync: "Syncing",
      archive: "Archiving",
      activate: "Activating",
    } as const;
    try {
      setBulkRunning(action);
      toast.loading(`${labels[action]} ${ids.length} location${ids.length === 1 ? "" : "s"}…`, { id: "bulk-locations" });
      await api("/api/locations/bulk", {
        method: "POST",
        body: JSON.stringify({ action, locationIds: ids }),
      });
      await qc.invalidateQueries({ queryKey: ["locations"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success(`Done — ${ids.length} location${ids.length === 1 ? "" : "s"} ${action === "sync" ? "synced" : action === "archive" ? "archived" : "activated"}.`, { id: "bulk-locations" });
      clearSelection();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Bulk action failed";
      toast.error(msg, { id: "bulk-locations" });
    } finally {
      setBulkRunning(null);
    }
  }

  // ─── Detail view ──────────────────────────────────────────────────────────
  if (detailId) {
    const loc = (locations ?? []).find((l) => l.id === detailId) ?? null;
    return (
      <LocationDetail
        locationId={detailId}
        fallbackLoc={loc}
        canSync={canSync}
        canManage={canManage}
        syncing={syncingId === detailId}
        onBack={() => setDetailId(null)}
        onSync={(module) => loc ? handleSyncOne(loc, module) : undefined}
        onViewReviews={() => loc ? openReviews(loc) : undefined}
      />
    );
  }

  // ─── Grid view ────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Locations"
        description="Manage all MyFNG Google Business Profiles across cities"
        icon={MapPin}
        actions={
          <>
            {canManage && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5 mr-1.5" /> Add Location
              </Button>
            )}
            {canSync ? (
              <Button size="sm" variant="outline" onClick={handleSyncAll} disabled={isLoading}>
                <RefreshCw className="size-3.5 mr-1.5" /> Sync all
              </Button>
            ) : null}
          </>
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums">
                {selectedIds.size}
              </span>
              <span>selected</span>
            </div>
            <Separator orientation="vertical" className="hidden sm:block h-6" />
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {canSync && (
                <Button
                  size="sm" variant="secondary"
                  onClick={() => handleBulk("sync")}
                  disabled={bulkRunning !== null}
                >
                  {bulkRunning === "sync" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="size-3.5 mr-1.5" />}
                  Sync selected
                </Button>
              )}
              {canManage && (
                <>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleBulk("archive")}
                    disabled={bulkRunning !== null}
                  >
                    {bulkRunning === "archive" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <AlertTriangle className="size-3.5 mr-1.5" />}
                    Archive selected
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleBulk("activate")}
                    disabled={bulkRunning !== null}
                  >
                    {bulkRunning === "activate" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <CircleCheck className="size-3.5 mr-1.5" />}
                    Activate selected
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkRunning !== null}>
                <X className="size-3.5 mr-1.5" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | LocationStatus)}>
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="paused">Paused</TabsTrigger>
              <TabsTrigger value="error">Error</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Sort by</span>
            <Select value={sort} onValueChange={(v) => setSort(v as "city" | "rating" | "health" | "reviews")}>
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
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {filtered.length > 0 && (
            <Checkbox
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all visible locations"
            />
          )}
          <span>
            Showing <span className="font-medium text-foreground">{filtered.length}</span>
            {filtered.length !== (locations?.length ?? 0) && (
              <> of <span className="font-medium text-foreground">{locations?.length ?? 0}</span></>
            )} location{(locations?.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
        {summary && (
          <p className="text-xs text-muted-foreground hidden sm:block">
            Last sync run:{" "}
            <span className="font-medium">
              {locations?.[0]?.lastSyncedAt
                ? relativeTime(locations[0].lastSyncedAt)
                : "never"}
            </span>
          </p>
        )}
      </div>

      {/* Grid */}
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
            {(search || statusFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
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
              canManage={canManage}
              selected={selectedIds.has(loc.id)}
              onSelect={() => toggleSelected(loc.id)}
              syncing={syncingId === loc.id}
              onSync={() => handleSyncOne(loc, "full")}
              onViewDetails={() => setDetailId(loc.id)}
              onViewReviews={() => openReviews(loc)}
            />
          ))}
        </div>
      )}

      {/* Add Location Dialog */}
      <AddLocationDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

/* ----------------------------- Location Card ----------------------------- */

function LocationCard({
  loc, canSync, canManage, selected, onSelect, syncing, onSync, onViewDetails, onViewReviews,
}: {
  loc: LocationWithStats;
  canSync: boolean;
  canManage: boolean;
  selected: boolean;
  onSelect: () => void;
  syncing: boolean;
  onSync: () => void;
  onViewDetails: () => void;
  onViewReviews: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col hover:shadow-md transition-shadow relative",
        selected && "border-primary ring-1 ring-primary/30",
      )}
    >
      {/* Selection checkbox — top-left corner */}
      <div className="absolute top-3 left-3 z-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${loc.name}`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        {/* Header: name + city */}
        <div className="flex items-start justify-between gap-2 pl-6">
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
                ? `Synced ${relativeTime(loc.lastSyncedAt)}`
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
              disabled={syncing || loc.syncStatus === "syncing"}
            >
              {syncing || loc.syncStatus === "syncing" ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5 mr-1" />
              )}
              Sync
            </Button>
          )}
        </div>

        {/* Secondary action: jump to reviews (compact) */}
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-7 text-muted-foreground"
          onClick={onViewReviews}
        >
          <MessageSquare className="size-3.5 mr-1" /> View reviews
        </Button>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Location Detail ----------------------------- */

function LocationDetail({
  locationId, fallbackLoc, canSync, canManage, syncing, onBack, onSync, onViewReviews,
}: {
  locationId: string;
  fallbackLoc: LocationWithStats | null;
  canSync: boolean;
  canManage: boolean;
  syncing: boolean;
  onBack: () => void;
  onSync: (module: SyncModule) => void;
  onViewReviews: () => void;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: detail, isLoading, isError, refetch } = useQuery<LocationDetailResponse>({
    queryKey: ["location-detail", locationId],
    queryFn: () => api<LocationDetailResponse>(`/api/locations/${locationId}`),
    enabled: !!locationId,
  });

  // Quick-fail UI
  if (isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1.5" /> Back to locations
        </Button>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto size-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
              <AlertTriangle className="size-6 text-rose-500" />
            </div>
            <h3 className="text-base font-semibold">Couldn&apos;t load location details</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Something went wrong fetching this location. Try again.
            </p>
            <Button size="sm" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="size-4 mr-1.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4 mr-1.5" /> Back to locations
        </Button>
      </div>

      {isLoading || !detail ? (
        <LocationDetailSkeleton />
      ) : (
        <>
          {/* Header card */}
          <LocationDetailHeader
            detail={detail}
            canSync={canSync}
            canManage={canManage}
            syncing={syncing}
            onSync={onSync}
            onEdit={() => setEditOpen(true)}
          />

          {/* Mini stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStat
              label="Reviews"
              value={detail.location.reviewCount.toLocaleString("en-IN")}
              icon={MessageSquare}
              accent="emerald"
            />
            <MiniStat
              label="Avg Rating"
              value={detail.location.avgRating.toFixed(1)}
              icon={Star}
              accent="amber"
              hint={<RatingStars rating={detail.location.avgRating} size={12} showValue={false} />}
            />
            <MiniStat
              label="Response Rate"
              value={`${detail.healthBreakdown.reviewResponseRate}%`}
              icon={RefreshCw}
              accent="teal"
            />
            <MiniStat
              label="Search Views (30d)"
              value={formatAnalytics(detail.analytics30d.searchViews)}
              icon={Eye}
              accent="emerald"
            />
            <MiniStat
              label="Website Clicks (30d)"
              value={formatAnalytics(detail.analytics30d.websiteClicks)}
              icon={MousePointerClick}
              accent="amber"
            />
            <MiniStat
              label="Phone Calls (30d)"
              value={formatAnalytics(detail.analytics30d.phoneCalls)}
              icon={PhoneCall}
              accent="rose"
            />
          </div>

          {/* Completeness + Health breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ProfileCompletenessCard completeness={detail.completeness} />
            <HealthBreakdownCard
              score={detail.location.healthScore}
              breakdown={detail.healthBreakdown}
            />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="business" className="space-y-4">
            <TabsList className="w-full lg:w-auto overflow-x-auto justify-start h-auto flex-wrap">
              <TabsTrigger value="business"><Building2 className="size-3.5 mr-1.5" />Business Info</TabsTrigger>
              <TabsTrigger value="hours"><Clock className="size-3.5 mr-1.5" />Hours</TabsTrigger>
              <TabsTrigger value="services"><ListChecks className="size-3.5 mr-1.5" />Services</TabsTrigger>
              <TabsTrigger value="photos"><Camera className="size-3.5 mr-1.5" />Photos</TabsTrigger>
              <TabsTrigger value="timeline"><History className="size-3.5 mr-1.5" />Timeline</TabsTrigger>
              <TabsTrigger value="seo"><SeoIcon className="size-3.5 mr-1.5" />SEO Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="business" className="mt-0">
              <BusinessInfoTab detail={detail} canManage={canManage} />
            </TabsContent>
            <TabsContent value="hours" className="mt-0">
              <HoursTab detail={detail} canManage={canManage} />
            </TabsContent>
            <TabsContent value="services" className="mt-0">
              <ServicesTab detail={detail} />
            </TabsContent>
            <TabsContent value="photos" className="mt-0">
              <PhotosTab detail={detail} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <TimelineTab timeline={detail.timeline} />
            </TabsContent>
            <TabsContent value="seo" className="mt-0">
              <SeoAuditTab detail={detail} />
            </TabsContent>
          </Tabs>

          {/* Reviews CTA at bottom */}
          <Card className="bg-primary/[0.03] border-primary/20">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageSquare className="size-4 text-primary" /> View & reply to reviews
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detail.location.reviewCount.toLocaleString("en-IN")} total reviews · avg {detail.location.avgRating.toFixed(1)} stars
                </p>
              </div>
              <Button size="sm" onClick={onViewReviews}>
                Open reviews <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit dialog */}
      {detail && (
        <EditLocationDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          detail={detail}
          canManage={canManage}
          onSaved={() => qc.invalidateQueries({ queryKey: ["location-detail", locationId] })}
        />
      )}

      {/* Fallback to base list for legacy refresh */}
      {!detail && fallbackLoc && (
        <p className="sr-only">Loading detail for {fallbackLoc.name}</p>
      )}
    </div>
  );
}

/* ----------------------------- Detail Header ----------------------------- */

function LocationDetailHeader({
  detail, canSync, canManage, syncing, onSync, onEdit,
}: {
  detail: LocationDetailResponse;
  canSync: boolean;
  canManage: boolean;
  syncing: boolean;
  onSync: (module: SyncModule) => void;
  onEdit: () => void;
}) {
  const { location, googleProfile } = detail;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              <span className="truncate">{location.city}, {location.region}, {location.state}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-mono">{location.locationCode}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1 break-words">
              {location.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge status={location.status} />
              <SyncStatusBadge status={location.syncStatus} />
              {location.lastSyncedAt && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        Synced {relativeTime(location.lastSyncedAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{fullTime(location.lastSyncedAt)}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Score badges */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <RatingStars rating={location.avgRating} size={16} />
              <Separator orientation="vertical" className="h-4" />
              <div className="inline-flex items-center gap-1 text-xs">
                <HeartPulse className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Health:</span>
                <span className={cn("font-semibold", scoreColorClass(location.healthScore))}>{location.healthScore}/100</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="inline-flex items-center gap-1 text-xs">
                <Navigation className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Visibility:</span>
                <span className={cn("font-semibold", scoreColorClass(location.visibilityScore))}>{location.visibilityScore}/100</span>
              </div>
              {googleProfile && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    googleProfile.verificationState === "verified"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  )}>
                    <ShieldCheck className="size-3 mr-1" />
                    {googleProfile.verificationState === "verified" ? "Verified" : "Unverified"}
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canSync && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={syncing}>
                    {syncing ? (
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5 mr-1.5" />
                    )}
                    Sync
                    <ChevronDown className="size-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Sync module</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SYNC_MODULES.map((m) => (
                    <DropdownMenuItem
                      key={m.value}
                      onSelect={() => { setMenuOpen(false); onSync(m.value); }}
                    >
                      <m.icon className="size-4 mr-2 text-muted-foreground" />
                      {m.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canManage && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="size-3.5 mr-1.5" /> Edit
              </Button>
            )}

            {googleProfile?.mapUrl && (
              <Button
                size="sm"
                variant="outline"
                asChild
              >
                <a href={googleProfile.mapUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5 mr-1.5" /> View on Maps
                </a>
              </Button>
            )}

            {/* Mobile-friendly overflow menu for non-permitted actions */}
            {!canSync && !canManage && !googleProfile?.mapUrl && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled>
                    <Lock className="size-4 mr-2 text-muted-foreground" /> No actions available
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Mini Stat ----------------------------- */

function MiniStat({
  label, value, icon: Icon, accent = "emerald", hint,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "emerald" | "amber" | "teal" | "rose" | "slate";
  hint?: React.ReactNode;
}) {
  const cls: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  };
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums truncate">{value}</div>
            {hint && <div className="mt-1">{hint}</div>}
          </div>
          <div className={cn("size-8 rounded-md flex items-center justify-center shrink-0", cls[accent])}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Score Ring (radial) ----------------------------- */

function ScoreRing({ value, label, size = 120 }: { value: number; label?: string; size?: number }) {
  const color = scoreColor(value);
  const data = [{ name: "score", value, fill: color }];
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative w-full" style={{ height: size * 0.78 }}>
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
          <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      {label && <div className="text-xs font-medium text-muted-foreground -mt-1">{label}</div>}
    </div>
  );
}

/* ----------------------------- Profile Completeness ----------------------------- */

function ProfileCompletenessCard({ completeness }: { completeness: Completeness }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <ListChecks className="size-4 text-emerald-500" /> Profile Completeness
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google Business Profile optimization checklist
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
          <div className="flex justify-center">
            <ScoreRing value={completeness.score} label="Completeness" size={130} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {COMPLETENESS_ITEMS.map((item) => {
              const ok = completeness.checklist[item.key];
              return (
                <div key={item.key} className="flex items-center gap-2 text-sm">
                  <span className={cn(
                    "inline-flex items-center justify-center size-4 rounded-full shrink-0",
                    ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  )}>
                    {ok ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  <span className={cn(ok ? "text-foreground" : "text-muted-foreground line-through")}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Health Breakdown ----------------------------- */

function HealthBreakdownCard({
  score, breakdown,
}: {
  score: number;
  breakdown: HealthBreakdown;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <HeartPulse className="size-4 text-rose-500" /> Health Score Breakdown
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              8 factors that determine profile health
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Overall</div>
            <div className={cn("text-2xl font-bold tabular-nums", scoreColorClass(score))}>{score}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {HEALTH_FACTORS.map((f) => {
            const v = breakdown[f.key];
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground/80">{f.label}</span>
                  <span className={cn("font-semibold tabular-nums", scoreColorClass(v))}>{v}%</span>
                </div>
                <Progress value={v} className={cn("h-1.5 bg-muted", progressIndicatorClass(v))} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Business Info Tab ----------------------------- */

function BusinessInfoTab({ detail, canManage }: { detail: LocationDetailResponse; canManage: boolean }) {
  const qc = useQueryClient();
  const { location, googleProfile, categories, attributes } = detail;

  const [description, setDescription] = useState(googleProfile?.businessInfo?.description ?? "");
  const [phone, setPhone] = useState(location.phone ?? "");
  const [website, setWebsite] = useState(location.website ?? "");
  const [appointmentUrl, setAppointmentUrl] = useState(googleProfile?.businessInfo?.appointmentUrl ?? "");
  const [address, setAddress] = useState(location.address ?? "");
  const [saving, setSaving] = useState(false);

  // Re-sync local form state if upstream detail changes (e.g. after invalidation)
  useEffect(() => {
    setDescription(googleProfile?.businessInfo?.description ?? "");
    setPhone(location.phone ?? "");
    setWebsite(location.website ?? "");
    setAppointmentUrl(googleProfile?.businessInfo?.appointmentUrl ?? "");
    setAddress(location.address ?? "");
  }, [googleProfile, location]);

  const dirty = (
    description !== (googleProfile?.businessInfo?.description ?? "") ||
    phone !== (location.phone ?? "") ||
    website !== (location.website ?? "") ||
    appointmentUrl !== (googleProfile?.businessInfo?.appointmentUrl ?? "") ||
    address !== (location.address ?? "")
  );

  async function handleSave() {
    try {
      setSaving(true);
      toast.loading("Saving business info…", { id: "save-biz" });
      await api(`/api/locations/${location.id}`, {
        method: "PUT",
        body: JSON.stringify({
          phone,
          website,
          address,
          businessInfo: {
            description,
            website,
            appointmentUrl,
          },
        }),
      });
      await qc.invalidateQueries({ queryKey: ["location-detail", location.id] });
      await qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Business info saved. Changes will sync to Google.", { id: "save-biz" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg, { id: "save-biz" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Editable form */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Business Information</h3>
            {canManage ? (
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Check className="size-3.5 mr-1.5" />}
                Save Changes
              </Button>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <Lock className="size-3 mr-1" /> Read-only
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="biz-desc" className="text-xs">Description</Label>
            <Textarea
              id="biz-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canManage || saving}
              rows={4}
              placeholder="Describe your business in 750 characters or less…"
              className="resize-y"
            />
            <p className="text-[11px] text-muted-foreground">{description.length}/750 characters</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="biz-phone" className="text-xs">Phone</Label>
              <Input
                id="biz-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canManage || saving}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-website" className="text-xs">Website</Label>
              <Input
                id="biz-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                disabled={!canManage || saving}
                placeholder="https://example.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="biz-appt" className="text-xs">Appointment URL</Label>
            <Input
              id="biz-appt"
              value={appointmentUrl}
              onChange={(e) => setAppointmentUrl(e.target.value)}
              disabled={!canManage || saving}
              placeholder="https://example.com/book"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="biz-addr" className="text-xs">Address</Label>
            <Textarea
              id="biz-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canManage || saving}
              rows={2}
              placeholder="Street address, city, state, pincode"
              className="resize-y"
            />
          </div>
        </CardContent>
      </Card>

      {/* Google profile + categories + attributes */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Globe className="size-4 text-teal-500" /> Google Profile
            </h3>
            {googleProfile ? (
              <div className="space-y-2.5 text-sm">
                <DetailRow icon={Building2} label="Profile Name" value={googleProfile.profileName} />
                <DetailRow
                  icon={MapPin}
                  label="Google Location ID"
                  value={<span className="font-mono text-xs">{googleProfile.googleLocationId}</span>}
                />
                <DetailRow
                  icon={Tag}
                  label="Primary Category"
                  value={googleProfile.primaryCategory ?? "—"}
                />
                <DetailRow
                  icon={ShieldCheck}
                  label="Verification"
                  value={
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      googleProfile.verificationState === "verified"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    )}>
                      {googleProfile.verificationState}
                    </Badge>
                  }
                />
                <DetailRow
                  icon={Activity}
                  label="Profile Status"
                  value={
                    <Badge variant="outline" className={cn(
                      "text-xs capitalize",
                      googleProfile.profileStatus === "active"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                    )}>
                      {googleProfile.profileStatus}
                    </Badge>
                  }
                />
                {googleProfile.mapUrl && (
                  <a
                    href={googleProfile.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                  >
                    <ExternalLink className="size-3" /> Open on Google Maps
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No Google Business Profile linked.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h3 className="text-sm font-semibold">Categories</h3>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">No categories set.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Badge
                    key={c.id}
                    variant={c.isPrimary ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {c.isPrimary && <Star className="size-3 mr-1 fill-current" />}
                    {c.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h3 className="text-sm font-semibold">Attributes</h3>
            {attributes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attributes set.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-area pr-1">
                {attributes.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-muted-foreground truncate">{a.name}</span>
                    <span className="font-medium text-right truncate">{a.value ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------- Hours Tab ----------------------------- */

function HoursTab({ detail, canManage }: { detail: LocationDetailResponse; canManage: boolean }) {
  const qc = useQueryClient();
  const { location, hours, specialHours } = detail;

  // Build a 7-row editable table. dayOfWeek: 0=Mon .. 6=Sun (per API)
  const [rows, setRows] = useState(() => buildHourRows(hours));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(buildHourRows(hours));
    setDirty(false);
  }, [hours]);

  function updateRow(idx: number, patch: Partial<{ openTime: string; closeTime: string; isClosed: boolean }>) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    setDirty(true);
  }

  async function handleSave() {
    try {
      setSaving(true);
      toast.loading("Saving business hours…", { id: "save-hours" });
      await api(`/api/locations/${location.id}`, {
        method: "PUT",
        body: JSON.stringify({
          hours: rows.map((r) => ({
            dayOfWeek: r.dayOfWeek,
            openTime: r.isClosed ? null : (r.openTime || null),
            closeTime: r.isClosed ? null : (r.closeTime || null),
            isClosed: r.isClosed,
          })),
        }),
      });
      await qc.invalidateQueries({ queryKey: ["location-detail", location.id] });
      toast.success("Business hours saved. Will sync to Google.", { id: "save-hours" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg, { id: "save-hours" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Regular Business Hours</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set opening hours for each day of the week
              </p>
            </div>
            {canManage ? (
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Check className="size-3.5 mr-1.5" />}
                Save Hours
              </Button>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <Lock className="size-3 mr-1" /> Read-only
              </Badge>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32 text-xs">Day</TableHead>
                  <TableHead className="w-32 text-xs">Open</TableHead>
                  <TableHead className="w-32 text-xs">Close</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={r.dayOfWeek}>
                    <TableCell className="py-2 text-sm font-medium">{DAY_LABELS[r.dayOfWeek]}</TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="time"
                        value={r.openTime ?? ""}
                        onChange={(e) => updateRow(idx, { openTime: e.target.value })}
                        disabled={!canManage || saving || r.isClosed}
                        className="h-8 text-xs w-32"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="time"
                        value={r.closeTime ?? ""}
                        onChange={(e) => updateRow(idx, { closeTime: e.target.value })}
                        disabled={!canManage || saving || r.isClosed}
                        className="h-8 text-xs w-32"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!r.isClosed}
                          onCheckedChange={(checked) => updateRow(idx, { isClosed: !checked })}
                          disabled={!canManage || saving}
                          aria-label={`Open ${DAY_LABELS[r.dayOfWeek]}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {r.isClosed ? "Closed" : "Open"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: cards */}
          <div className="sm:hidden space-y-2">
            {rows.map((r, idx) => (
              <div key={r.dayOfWeek} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{DAY_LABELS[r.dayOfWeek]}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!r.isClosed}
                      onCheckedChange={(checked) => updateRow(idx, { isClosed: !checked })}
                      disabled={!canManage || saving}
                      aria-label={`Open ${DAY_LABELS[r.dayOfWeek]}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {r.isClosed ? "Closed" : "Open"}
                    </span>
                  </div>
                </div>
                {!r.isClosed && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Open</Label>
                      <Input
                        type="time"
                        value={r.openTime ?? ""}
                        onChange={(e) => updateRow(idx, { openTime: e.target.value })}
                        disabled={!canManage || saving}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Close</Label>
                      <Input
                        type="time"
                        value={r.closeTime ?? ""}
                        onChange={(e) => updateRow(idx, { closeTime: e.target.value })}
                        disabled={!canManage || saving}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Special hours */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <CalendarClock className="size-4 text-amber-500" /> Special Hours
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Holiday hours &amp; exceptions
              </p>
            </div>
            <Badge variant="outline" className="text-xs">{specialHours.length}</Badge>
          </div>
          {specialHours.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No special hours configured.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Hours</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specialHours.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="py-2 text-sm font-medium">
                        {(() => { try { return format(parseISO(s.date), "d MMM yyyy"); } catch { return s.date; } })()}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {s.isClosed ? "—" : `${s.openTime ?? "—"} – ${s.closeTime ?? "—"}`}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          s.isClosed
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        )}>
                          {s.isClosed ? "Closed" : "Open"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function buildHourRows(hours: HourRow[]): { dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean }[] {
  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));
  return DAY_LABELS.map((_, day) => {
    const h = byDay.get(day);
    return {
      dayOfWeek: day,
      openTime: h?.openTime ?? null,
      closeTime: h?.closeTime ?? null,
      isClosed: h?.isClosed ?? false,
    };
  });
}

/* ----------------------------- Services Tab ----------------------------- */

function ServicesTab({ detail }: { detail: LocationDetailResponse }) {
  const { services, products } = detail;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <ListChecks className="size-4 text-emerald-500" /> Services
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {services.length} service{services.length === 1 ? "" : "s"} offered
              </p>
            </div>
            <Button
              size="sm" variant="outline"
              onClick={() => toast.info("Add Service — coming soon. Use the Google Business Profile dashboard to add services.")}
            >
              <Plus className="size-3.5 mr-1.5" /> Add Service
            </Button>
          </div>
          {services.length === 0 ? (
            <EmptyRow icon={Inbox} message="No services configured." />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scroll-area pr-1">
              {services.map((s) => (
                <div key={s.id} className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{s.name}</span>
                      <Badge variant="outline" className={cn(
                        "text-[10px] capitalize",
                        s.status === "active"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
                      )}>
                        {s.status}
                      </Badge>
                    </div>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                    )}
                    {s.category && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <Tag className="size-3 inline mr-1" />
                        {s.category}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Tag className="size-4 text-amber-500" /> Products
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {products.length} product{products.length === 1 ? "" : "s"} listed
              </p>
            </div>
          </div>
          {products.length === 0 ? (
            <EmptyRow icon={Inbox} message="No products configured." />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Category</TableHead>
                    <TableHead className="text-xs text-right">Price</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="size-8 rounded object-cover bg-muted"
                            />
                          ) : (
                            <div className="size-8 rounded bg-muted flex items-center justify-center">
                              <ImageIcon className="size-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            {p.description && (
                              <div className="text-[11px] text-muted-foreground line-clamp-1">{p.description}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground hidden sm:table-cell">
                        {p.category ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-right font-medium tabular-nums">
                        {formatPrice(p.price, p.currency)}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={cn(
                          "text-[10px] capitalize",
                          p.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
                        )}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------------------------- Photos Tab ----------------------------- */

function PhotosTab({ detail }: { detail: LocationDetailResponse }) {
  const { photos } = detail;
  const lastUpdated = photos[0]?.createdAt ?? null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Camera className="size-4 text-teal-500" /> Business Photos
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
              {lastUpdated && (
                <> · last updated {relativeTime(lastUpdated)}</>
              )}
            </p>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => toast.info("Upload queued — photo will sync to Google Business Profile.")}
          >
            <Plus className="size-3.5 mr-1.5" /> Upload Photo
          </Button>
        </div>

        {photos.length === 0 ? (
          <EmptyRow icon={ImageIcon} message="No photos uploaded yet." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted">
                <img
                  src={p.thumbnailUrl || p.imageUrl}
                  alt={`Business photo ${p.id}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-2 left-2">
                  <Badge variant="outline" className={cn(
                    "text-[10px] capitalize backdrop-blur-sm bg-background/80",
                    p.source === "google" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                    p.source === "ai" && "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    p.source === "manual" && "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
                  )}>
                    {p.source}
                  </Badge>
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white/90">
                    {(() => { try { return format(parseISO(p.createdAt), "d MMM yyyy"); } catch { return ""; } })()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Timeline Tab ----------------------------- */

function TimelineTab({ timeline }: { timeline: TimelineRow[] }) {
  if (timeline.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <History className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">No recent activity</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Reviews, posts and sync events will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-4">
          <History className="size-4 text-emerald-500" /> Recent Activity
        </h3>
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-4">
            {timeline.map((t, i) => {
              const meta = TIMELINE_META[t.type] ?? TIMELINE_META.default;
              const Icon = meta.icon;
              return (
                <div key={`${i}-${t.timestamp}`} className="relative">
                  {/* Dot */}
                  <div className={cn(
                    "absolute -left-[22px] top-1 size-3.5 rounded-full ring-4 ring-background",
                    meta.dot
                  )} />
                  <div className="flex items-start gap-2">
                    <Icon className={cn("size-4 shrink-0 mt-0.5", meta.color)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      {t.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{t.subtitle}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {(() => {
                          try { return relativeTime(t.timestamp); }
                          catch { return t.timestamp; }
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- SEO Audit Tab ----------------------------- */

function SeoAuditTab({ detail }: { detail: LocationDetailResponse }) {
  const { seoAudit, completeness } = detail;

  if (!seoAudit) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <SeoIcon className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">No SEO audit yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-4">
            Run an audit to get profile strength scoring, missing content recommendations, and SEO improvement tips.
          </p>
          <Button size="sm" onClick={() => toast.info("SEO audit queued — results will appear here when ready.")}>
            <Sparkles className="size-3.5 mr-1.5" /> Run New Audit
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Target className="size-4 text-emerald-500" /> SEO Audit Results
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last audited {relativeTime(seoAudit.auditedAt)}
              </p>
            </div>
            <Button
              size="sm" variant="outline"
              onClick={() => toast.info("SEO audit queued — results will refresh when ready.")}
            >
              <Sparkles className="size-3.5 mr-1.5" /> Run New Audit
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 flex flex-col items-center">
              <ScoreRing value={seoAudit.auditScore} label="Audit Score" size={130} />
            </div>
            <div className="rounded-lg border p-4 flex flex-col items-center">
              <ScoreRing value={seoAudit.profileStrength} label="Profile Strength" size={130} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Missing Photos</div>
              <div className={cn(
                "mt-1 text-xl font-bold tabular-nums",
                seoAudit.missingPhotos > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {seoAudit.missingPhotos}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Missing Services</div>
              <div className={cn(
                "mt-1 text-xl font-bold tabular-nums",
                seoAudit.missingServices > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {seoAudit.missingServices}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Completeness</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{completeness.score}%</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommendations</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{seoAudit.recommendations.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {seoAudit.recommendations.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="size-4 text-amber-500" /> Recommendations
            </h3>
            <ul className="space-y-2">
              {seoAudit.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="inline-flex items-center justify-center size-5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-semibold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground/90">{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------- Edit Location Dialog ----------------------------- */

function EditLocationDialog({
  open, onOpenChange, detail, canManage, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: LocationDetailResponse;
  canManage: boolean;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { location } = detail;
  const [name, setName] = useState(location.name);
  const [phone, setPhone] = useState(location.phone ?? "");
  const [email, setEmail] = useState(location.email ?? "");
  const [website, setWebsite] = useState(location.website ?? "");
  const [address, setAddress] = useState(location.address ?? "");
  const [status, setStatus] = useState<LocationStatus>(location.status);
  const [saving, setSaving] = useState(false);

  // Re-sync when dialog opens
  useEffect(() => {
    if (open) {
      setName(location.name);
      setPhone(location.phone ?? "");
      setEmail(location.email ?? "");
      setWebsite(location.website ?? "");
      setAddress(location.address ?? "");
      setStatus(location.status);
    }
  }, [open, location]);

  async function handleSave() {
    try {
      setSaving(true);
      toast.loading("Saving location…", { id: "edit-loc" });
      await api(`/api/locations/${location.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name, phone, email, website, address, status,
        }),
      });
      await onSaved();
      await qc.invalidateQueries({ queryKey: ["locations"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Location updated. Changes will sync to Google.", { id: "edit-loc" });
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg, { id: "edit-loc" });
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Location</DialogTitle>
          <DialogDescription>
            Update the details for {location.name}. Changes will sync to Google Business Profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto scroll-area pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name" className="text-xs">Location Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone" className="text-xs">Phone</Label>
              <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-xs">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-website" className="text-xs">Website</Label>
            <Input id="edit-website" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-address" className="text-xs">Address</Label>
            <Textarea id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} disabled={saving} className="resize-y" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-status" className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LocationStatus)} disabled={saving}>
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Check className="size-3.5 mr-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Detail Skeleton ----------------------------- */

function LocationDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 rounded-md w-full max-w-2xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

/* ----------------------------- Small shared helpers ----------------------------- */

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

// ═══ Import from Google Dialog ═══════════════════════════════════════════
function AddLocationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [gmbLocations, setGmbLocations] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(true);
  const [mode, setMode] = useState<string>("mock");
  const [fetched, setFetched] = useState(false);

  // Fetch available GMB locations when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFetched(false);
    setSelected(new Set());
    fetch("/api/google/available-locations")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setGmbLocations(json.data.locations || []);
          setConnected(json.data.connected);
          setMode(json.data.mode || "mock");
        } else {
          toast.error(json.message || "Failed to fetch GMB locations");
          setGmbLocations([]);
          setConnected(false);
        }
      })
      .catch((e) => {
        toast.error("Failed to fetch GMB locations");
        setConnected(false);
      })
      .finally(() => {
        setLoading(false);
        setFetched(true);
      });
  }, [open]);

  function toggleSelect(googleLocationId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(googleLocationId)) next.delete(googleLocationId);
      else next.add(googleLocationId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(gmbLocations.map((l) => l.googleLocationId)));
  }
  function deselectAll() {
    setSelected(new Set());
  }

  async function handleImport() {
    if (selected.size === 0) {
      toast.error("Select at least one location to import");
      return;
    }
    setImporting(true);
    try {
      const toImport = gmbLocations.filter((l) => selected.has(l.googleLocationId));
      const res = await fetch("/api/locations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: toImport }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || `${json.data.count} location(s) imported from Google Business Profile`);
        qc.invalidateQueries({ queryKey: ["locations"] });
        onOpenChange(false);
      } else {
        toast.error(json.message || "Import failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ─── Not connected state ────────────────────────────────────────────────
  if (fetched && !connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" /> Connect Google Business Profile
            </DialogTitle>
            <DialogDescription>
              To add locations, you need to connect your Google Business Profile account first.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="size-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="size-8 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Google account not connected</p>
              <p className="text-xs text-muted-foreground">
                Click the button below to authenticate with Google and import your Business Profile locations.
              </p>
            </div>
            <Button onClick={() => { onOpenChange(false); window.location.href = "/api/google/callback?mock=true"; }}>
              <Building2 className="size-4 mr-1.5" /> Connect Google Business Profile
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" /> Import Locations from Google
          </DialogTitle>
          <DialogDescription>
            {mode === "mock"
              ? "Demo mode — showing sample GMB locations. Configure GOOGLE_CLIENT_ID in .env to fetch real profiles."
              : "Select Google Business Profile locations to import into MyFNG Local AI Manager."}
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {loading && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="size-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Fetching your Google Business Profile locations…</p>
          </div>
        )}

        {/* Locations list */}
        {!loading && fetched && gmbLocations.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                {gmbLocations.length} location(s) available · {selected.size} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Select All</Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs h-7">Deselect All</Button>
              </div>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto scroll-area pr-1">
              {gmbLocations.map((loc) => {
                const isSelected = selected.has(loc.googleLocationId);
                return (
                  <button
                    key={loc.googleLocationId}
                    onClick={() => toggleSelect(loc.googleLocationId)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition flex items-start gap-3",
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30",
                    )}
                  >
                    <Checkbox checked={isSelected} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{loc.name}</span>
                        {loc.verificationState === "verified" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0">Verified</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{loc.address || loc.city}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        {loc.city && <span>{loc.city}</span>}
                        {loc.phone && <span>· {loc.phone}</span>}
                        {loc.totalReviews > 0 && (
                          <span className="flex items-center gap-0.5">
                            · <Star className="size-3 fill-amber-400 text-amber-400" /> {loc.averageRating} ({loc.totalReviews})
                          </span>
                        )}
                        {loc.primaryCategory && <span>· {loc.primaryCategory}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state — all already imported */}
        {!loading && fetched && gmbLocations.length === 0 && connected && (
          <div className="py-12 text-center space-y-3">
            <div className="size-14 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="size-7 text-emerald-500" />
            </div>
            <p className="text-sm font-medium">All locations already imported</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              All your Google Business Profile locations are already connected to MyFNG Local AI Manager.
              New locations will appear here automatically when you add them to your Google Business Profile.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          {gmbLocations.length > 0 && (
            <Button onClick={handleImport} disabled={importing || selected.size === 0}>
              {importing
                ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Importing…</>
                : <><Plus className="size-4 mr-1.5" /> Import {selected.size > 0 ? `(${selected.size})` : ""} Location{selected.size !== 1 ? "s" : ""}</>
              }
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRow({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="text-center py-8 text-sm text-muted-foreground">
      <Icon className="size-6 mx-auto mb-2 opacity-50" />
      {message}
    </div>
  );
}
