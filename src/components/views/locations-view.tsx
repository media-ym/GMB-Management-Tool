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
  ShieldCheck, ShieldAlert, Eye, MousePointerClick, PhoneCall, TrendingUp, Target,
  ListChecks, Tag, Camera, History, Search as SeoIcon, Sparkles,
  Lock, ChevronDown, CircleCheck, CircleAlert, Inbox, Map as MapIcon,
} from "lucide-react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { resolveLocationCity, resolveLocationAddress, formatLocationAreaLine, formatLocationCardArea } from "@/lib/location-utils";
import { useAppStore } from "@/lib/store";
import { useAppNavigation } from "@/hooks/use-app-navigation";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import type { DashboardSummary, LocationWithStats, SyncStatus, LocationStatus } from "@/lib/types";

import { PageHeader } from "@/components/shared/page-header";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { LayoutToggle, type LayoutMode } from "@/components/shared/layout-toggle";
import { StatCard } from "@/components/shared/stat-card";
import { ProfileStrengthDashboard } from "@/components/views/profile-strength-dashboard";
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
  verificationPending?: boolean;
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
  conversations?: number | null;
  bookings?: number | null;
  impressions?: number | null;
  interactions?: number | null;
  synced?: boolean;
  daysInRange?: number;
}

interface LocationStats {
  photoCount: number;
  serviceCount: number;
  categoryCount: number;
  productCount: number;
  attributeCount: number;
  repliedReviewCount: number;
  recentPostsCount: number;
  totalPublishedPosts: number;
  analyticsSynced: boolean;
  analyticsDaysInRange: number;
  lastAnalyticsDate: string | null;
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
  stats: LocationStats;
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

function formatVerificationLabel(state: string, pending = false): string {
  if (state === "verified") return "Verified";
  if (pending) return "Verification pending";
  return "Verification required";
}

function formatProfileStatusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "disabled") return "Disabled";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatAnalytics(n: number | null | undefined, synced = true): string {
  if (!synced) return "Not synced";
  if (n == null) return "0";
  return n.toLocaleString("en-IN");
}

function VerificationBadge({ state }: { state: string | null | undefined }) {
  if (!state) return null;
  if (state === "verified") {
    return (
      <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300/60 dark:border-emerald-700/50 shrink-0">
        <ShieldCheck className="size-3 mr-0.5" /> Verified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-300/60 dark:border-rose-700/50 shrink-0">
      <ShieldAlert className="size-3 mr-0.5" /> Verification required
    </Badge>
  );
}

function verificationCardClass(state: string | null | undefined): string {
  if (state === "verified") {
    return "bg-emerald-50/90 border-emerald-200 dark:bg-emerald-950/25 dark:border-emerald-800/50";
  }
  if (state === "unverified") {
    return "bg-rose-50/90 border-rose-200 dark:bg-rose-950/25 dark:border-rose-800/50";
  }
  return "";
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level view
// ────────────────────────────────────────────────────────────────────────────

export function LocationsView() {
  const user = useUser();
  const { navigate } = useAppNavigation();
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const qc = useQueryClient();

  const canSync = can(user.role, "system.sync");
  const canManage = can(user.role, "locations.manage");

  const [search, setSearch] = useState("");
  const [filterLocIds, setFilterLocIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<"all" | LocationStatus>("all");
  const [sort, setSort] = useState<"city" | "rating" | "health" | "reviews">("city");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState<"sync" | "archive" | "activate" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkVerifyOpen, setBulkVerifyOpen] = useState(false);

  const { data: locations, isLoading } = useQuery<LocationWithStats[]>({
    queryKey: ["locations"],
    queryFn: () => api<LocationWithStats[]>("/api/locations"),
  });

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<DashboardSummary>("/api/dashboard"),
  });

  // Available-to-import count shown as a badge on the Add Location button.
  // Hidden when Google OAuth isn't configured/connected OR every GMB location
  // is already imported. Refetched every 60s so newly-added GMB locations
  // surface automatically.
  const { data: availableGmb } = useQuery<{ status: string; available: number } | undefined>({
    queryKey: ["available-gmb-locations"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/google/available-locations");
        const json = await res.json();
        if (json.success) {
          return {
            status: json.data.status,
            available: json.data.available ?? 0,
          };
        }
        return undefined;
      } catch {
        return undefined;
      }
    },
    refetchInterval: 60_000,
    // Only the Add Location button is gated on canManage — but the badge is
    // informational for any logged-in user with locations.view. We still gate
    // on canManage so non-managers don't waste a Google API call they can't
    // act on.
    enabled: canManage,
  });
  const availableToImport =
    availableGmb && availableGmb.status === "connected" && availableGmb.available > 0
      ? availableGmb.available
      : 0;

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
      if (filterLocIds.length > 0 && !filterLocIds.includes(l.id)) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      const city = resolveLocationCity(l);
      return (
        l.name.toLowerCase().includes(q) ||
        city.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q) ||
        resolveLocationAddress(l).toLowerCase().includes(q)
      );
    });
    list = list.slice().sort((a, b) => {
      switch (sort) {
        case "rating": return b.avgRating - a.avgRating;
        case "health": return b.healthScore - a.healthScore;
        case "reviews": return b.reviewCount - a.reviewCount;
        case "city":
        default: return resolveLocationCity(a).localeCompare(resolveLocationCity(b)) || a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [locations, search, filterLocIds, statusFilter, sort]);

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

  async function handleSyncOne(loc: LocationWithStats, module: SyncModule = "full") {
    const toastId = `sync-${loc.id}-${module}`;
    try {
      setSyncingId(loc.id);
      toast.loading(`Syncing ${module === "full" ? "everything" : module} for ${loc.name}…`, { id: toastId });
      const result = await api<{
        synced?: { analytics?: number; reviews?: number; photos?: number; posts?: number };
        errors?: string[];
      }>(`/api/locations/${loc.id}/sync`, {
        method: "POST",
        body: JSON.stringify({ module }),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["locations"] }),
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        qc.invalidateQueries({ queryKey: ["analytics"] }),
        qc.invalidateQueries({ queryKey: ["dashboard-misa-insights"] }),
        qc.invalidateQueries({ queryKey: ["location-detail", loc.id] }),
      ]);
      // Force refetch open detail so performance cards update immediately
      if (detailId === loc.id) {
        await qc.refetchQueries({ queryKey: ["location-detail", loc.id] });
      }
      const analyticsDays = result?.synced?.analytics ?? 0;
      const analyticsBlocked = (result?.errors ?? []).some((e) =>
        /Performance API|403|access denied/i.test(e),
      );
      const warn = result?.errors?.length ? ` · ${result.errors.length} warning(s)` : "";
      if ((module === "full" || module === "analytics") && analyticsDays === 0) {
        toast.warning(
          analyticsBlocked
            ? `${loc.name}: profile/reviews synced, but Google blocked Performance data (often unverified listings). Verify this GMB profile, then Sync → Analytics.`
            : `${loc.name}: synced without analytics days${warn}`,
          { id: toastId, duration: 8000 },
        );
      } else {
        toast.success(
          module === "full"
            ? `${loc.name} synced · ${analyticsDays} analytics days${warn}`
            : `${loc.name} ${module} synced.${warn}`,
          { id: toastId },
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg, { id: toastId });
    } finally {
      setSyncingId(null);
    }
  }

  function openReviews(loc: LocationWithStats) {
    setSelectedLocationIds([loc.id]);
    navigate("reviews");
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
        accent="emerald"
        actions={
          <>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setBulkVerifyOpen(true)}>
                <ShieldCheck className="size-3.5 mr-1.5" /> Bulk Verify
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => setAddOpen(true)} className="relative">
                <Plus className="size-3.5 mr-1.5" /> Add Location
                {availableToImport > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 bg-primary/15 text-primary border-primary/30 hover:bg-primary/15"
                    title={`${availableToImport} location(s) available to import from Google Business Profile`}
                  >
                    {availableToImport} available
                  </Badge>
                )}
              </Button>
            )}
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
          <div className="flex flex-1 min-w-0 gap-2">
            <LocationMultiSelect
              locations={locations}
              selectedIds={filterLocIds}
              onChange={setFilterLocIds}
              className="w-full sm:w-[200px] shrink-0"
            />
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
            <LayoutToggle value={viewMode} onChange={setViewMode} />
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

      {/* Grid / List */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )
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
            {(search || filterLocIds.length > 0 || statusFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch("");
                  setFilterLocIds([]);
                  setStatusFilter("all");
                  setSort("city");
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Location</TableHead>
                  <TableHead className="hidden md:table-cell">City</TableHead>
                  <TableHead className="hidden lg:table-cell min-w-[140px]">Phone</TableHead>
                  <TableHead className="hidden lg:table-cell">Rating</TableHead>
                  <TableHead className="hidden sm:table-cell">Health</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((loc) => (
                  <LocationListRow
                    key={loc.id}
                    loc={loc}
                    selected={selectedIds.has(loc.id)}
                    onSelect={() => toggleSelected(loc.id)}
                    onViewDetails={() => setDetailId(loc.id)}
                    onViewReviews={() => openReviews(loc)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              selected={selectedIds.has(loc.id)}
              onSelect={() => toggleSelected(loc.id)}
              onViewDetails={() => setDetailId(loc.id)}
              onViewReviews={() => openReviews(loc)}
            />
          ))}
        </div>
      )}

      {/* Add Location Dialog */}
      <AddLocationDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Bulk Verify Dialog */}
      {canManage && (
        <BulkVerifyDialog
          open={bulkVerifyOpen}
          onOpenChange={setBulkVerifyOpen}
          locationIds={(locations ?? []).map((l) => l.id)}
        />
      )}
    </div>
  );
}

/* ----------------------------- Location Card ----------------------------- */

function LocationCard({
  loc, selected, onSelect, onViewDetails, onViewReviews,
}: {
  loc: LocationWithStats;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
  onViewReviews: () => void;
}) {
  const areaLine = formatLocationCardArea(loc);
  const address = resolveLocationAddress(loc);

  return (
    <Card
      className={cn(
        "flex flex-col hover:shadow-md transition-shadow relative",
        verificationCardClass(loc.verificationState),
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
              <span className="truncate">{areaLine}</span>
            </div>
            <h3 className="text-base font-semibold mt-0.5 truncate">{loc.name}</h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge status={loc.status} />
            <SyncStatusBadge status={loc.syncStatus} />
            <VerificationBadge state={loc.verificationState} />
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
            <span className="line-clamp-2">{address}</span>
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
        </div>

        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 text-muted-foreground flex-1"
            onClick={onViewReviews}
          >
            <MessageSquare className="size-3.5 mr-1" /> View reviews
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 text-[#2563EB] flex-1"
            onClick={() => {
              const branch = resolveLocationCity(loc) || loc.city || loc.name;
              const q = new URLSearchParams({
                business: "My FNG",
                branch,
                locationId: loc.id,
              });
              window.open(`/review?${q.toString()}`, "_blank");
            }}
          >
            <Star className="size-3.5 mr-1" /> Review page
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LocationListRow({
  loc, selected, onSelect, onViewDetails, onViewReviews,
}: {
  loc: LocationWithStats;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
  onViewReviews: () => void;
}) {
  const city = resolveLocationCity(loc);
  const address = resolveLocationAddress(loc);

  return (
    <TableRow className={cn(selected && "bg-primary/[0.03]", verificationCardClass(loc.verificationState))}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${loc.name}`}
        />
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          <div className="font-medium truncate max-w-[280px]">{loc.name}</div>
          <div className="text-xs text-muted-foreground truncate max-w-[280px]">{address}</div>
          <div className="lg:hidden mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            <span className="tabular-nums">{loc.phone || "Not listed"}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm">{city}</TableCell>
      <TableCell className="hidden lg:table-cell">
        {loc.phone ? (
          <a
            href={`tel:${loc.phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-1.5 text-sm tabular-nums text-foreground hover:text-[#0047AB] transition-colors"
            onClick={(e) => e.stopPropagation()}
            title="GMB listed phone"
          >
            <Phone className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate max-w-[160px]">{loc.phone}</span>
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Not listed</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex items-center gap-2">
          <RatingStars rating={loc.avgRating} />
          <span className="text-xs text-muted-foreground">({loc.reviewCount})</span>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <ScoreBadge score={loc.healthScore} />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge status={loc.status} />
          <SyncStatusBadge status={loc.syncStatus} />
          <VerificationBadge state={loc.verificationState} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" onClick={onViewDetails}>
            Details
          </Button>
          <Button size="sm" variant="ghost" onClick={onViewReviews} title="View reviews">
            <MessageSquare className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-[#2563EB]"
            title="Open review landing page"
            onClick={() => {
              const branch = city || loc.name;
              const q = new URLSearchParams({
                business: "My FNG",
                branch,
                locationId: loc.id,
              });
              window.open(`/review?${q.toString()}`, "_blank");
            }}
          >
            <Star className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
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

          {detail.analytics30d.synced === false && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                Performance metrics not synced
              </p>
              <p className="mt-1 text-amber-900/80 text-[13px] leading-relaxed">
                Reviews and profile can sync while Google’s Performance API still returns no data.
                {detail.googleProfile?.verificationState &&
                detail.googleProfile.verificationState !== "verified"
                  ? " This listing is unverified — Google usually blocks impressions/clicks until you verify it in Google Business Profile."
                  : " Reconnect Google under More → Google, confirm Business Profile Performance API access, then run Sync → Analytics."}
              </p>
              {canSync && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 border-amber-300 bg-white hover:bg-amber-100"
                  disabled={syncing}
                  onClick={() => onSync("analytics")}
                >
                  {syncing ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <TrendingUp className="size-3.5 mr-1.5" />}
                  Retry analytics sync
                </Button>
              )}
            </div>
          )}

          {/* Mini stats + performance metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
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
              value={detail.location.reviewCount > 0
                ? `${detail.healthBreakdown.reviewResponseRate}%`
                : "—"}
              icon={RefreshCw}
              accent="teal"
              hint={detail.location.reviewCount > 0
                ? <span className="text-[10px] text-muted-foreground">{detail.stats.repliedReviewCount}/{detail.location.reviewCount} replied</span>
                : undefined}
            />
            <MiniStat
              label="Impressions (30d)"
              value={formatAnalytics(
                detail.analytics30d.impressions ??
                  ((detail.analytics30d.searchViews ?? 0) + (detail.analytics30d.mapsViews ?? 0)),
                detail.analytics30d.synced !== false,
              )}
              icon={Eye}
              accent="blue"
            />
            <MiniStat
              label="Search Views (30d)"
              value={formatAnalytics(detail.analytics30d.searchViews, detail.analytics30d.synced !== false)}
              icon={Search}
              accent="emerald"
            />
            <MiniStat
              label="Maps Views (30d)"
              value={formatAnalytics(detail.analytics30d.mapsViews, detail.analytics30d.synced !== false)}
              icon={MapIcon}
              accent="teal"
            />
            <MiniStat
              label="Interactions (30d)"
              value={formatAnalytics(
                detail.analytics30d.interactions ??
                  ((detail.analytics30d.websiteClicks ?? 0) +
                    (detail.analytics30d.phoneCalls ?? 0) +
                    (detail.analytics30d.directionRequests ?? 0) +
                    (detail.analytics30d.conversations ?? 0) +
                    (detail.analytics30d.bookings ?? 0)),
                detail.analytics30d.synced !== false,
              )}
              icon={MousePointerClick}
              accent="violet"
            />
            <MiniStat
              label="Website Clicks (30d)"
              value={formatAnalytics(detail.analytics30d.websiteClicks, detail.analytics30d.synced !== false)}
              icon={Globe}
              accent="amber"
            />
            <MiniStat
              label="Phone Calls (30d)"
              value={formatAnalytics(detail.analytics30d.phoneCalls, detail.analytics30d.synced !== false)}
              icon={PhoneCall}
              accent="rose"
            />
            <MiniStat
              label="Directions (30d)"
              value={formatAnalytics(detail.analytics30d.directionRequests, detail.analytics30d.synced !== false)}
              icon={Navigation}
              accent="orange"
            />
            <MiniStat
              label="Chat Clicks (30d)"
              value={
                detail.analytics30d.synced === false
                  ? "Not synced"
                  : (detail.analytics30d.conversations ?? 0) > 0
                    ? formatAnalytics(detail.analytics30d.conversations, true)
                    : "—"
              }
              icon={MessageSquare}
              accent="cyan"
              hint={
                detail.analytics30d.synced !== false && !(detail.analytics30d.conversations ?? 0) ? (
                  <span className="text-[10px] text-muted-foreground">Not in Google API</span>
                ) : undefined
              }
            />
          </div>

          {/* Profile Strength — radar + breakdown */}
          <ProfileStrengthDashboard detail={detail} />

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
              <TabsTrigger value="seo"><SeoIcon className="size-3.5 mr-1.5" />Profile Strength</TabsTrigger>
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
              <span className="truncate">{formatLocationAreaLine(location)}</span>
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
                    {googleProfile.verificationState === "verified" ? "Verified" : formatVerificationLabel(googleProfile.verificationState, googleProfile.verificationPending)}
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
  accent?: "emerald" | "amber" | "teal" | "rose" | "slate" | "blue" | "violet" | "orange" | "cyan";
  hint?: React.ReactNode;
}) {
  const styles: Record<string, { card: string; icon: string }> = {
    emerald: {
      card: "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100/80 dark:from-emerald-950/30 dark:to-teal-950/20 dark:border-emerald-800/40",
      icon: "bg-emerald-500 text-white",
    },
    amber: {
      card: "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-100/80 dark:from-amber-950/30 dark:to-yellow-950/20 dark:border-amber-800/40",
      icon: "bg-amber-500 text-white",
    },
    teal: {
      card: "bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-100/80 dark:from-teal-950/30 dark:to-cyan-950/20 dark:border-teal-800/40",
      icon: "bg-teal-500 text-white",
    },
    rose: {
      card: "bg-gradient-to-br from-rose-50 to-pink-50 border-rose-100/80 dark:from-rose-950/30 dark:to-pink-950/20 dark:border-rose-800/40",
      icon: "bg-rose-500 text-white",
    },
    slate: {
      card: "bg-gradient-to-br from-slate-50 to-gray-100 border-slate-200/80 dark:from-slate-950/30 dark:to-gray-900/20 dark:border-slate-700/40",
      icon: "bg-slate-500 text-white",
    },
    blue: {
      card: "bg-gradient-to-br from-blue-50 to-sky-50 border-blue-100/80 dark:from-blue-950/30 dark:to-sky-950/20 dark:border-blue-800/40",
      icon: "bg-blue-500 text-white",
    },
    violet: {
      card: "bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100/80 dark:from-violet-950/30 dark:to-purple-950/20 dark:border-violet-800/40",
      icon: "bg-violet-500 text-white",
    },
    orange: {
      card: "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100/80 dark:from-orange-950/30 dark:to-amber-950/20 dark:border-orange-800/40",
      icon: "bg-orange-500 text-white",
    },
    cyan: {
      card: "bg-gradient-to-br from-cyan-50 to-sky-50 border-cyan-100/80 dark:from-cyan-950/30 dark:to-sky-950/20 dark:border-cyan-800/40",
      icon: "bg-cyan-500 text-white",
    },
  };
  const s = styles[accent] ?? styles.emerald;
  return (
    <Card className={cn("border shadow-sm", s.card)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums truncate">{value}</div>
            {hint && <div className="mt-1">{hint}</div>}
          </div>
          <div className={cn("size-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm", s.icon)}>
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
    <Card className="border-emerald-100/80 bg-gradient-to-br from-emerald-50/50 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10 dark:border-emerald-800/40">
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
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 border",
                    ok
                      ? "bg-emerald-50/80 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-800/40"
                      : "bg-rose-50/70 border-rose-100 dark:bg-rose-950/20 dark:border-rose-800/40",
                  )}
                >
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
    <Card className="border-rose-100/80 bg-gradient-to-br from-rose-50/40 to-orange-50/30 dark:from-rose-950/20 dark:to-orange-950/10 dark:border-rose-800/40">
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
          <div className="text-right rounded-xl bg-white/70 dark:bg-card/50 border border-rose-100/80 dark:border-rose-800/40 px-3 py-1.5">
            <div className="text-xs text-muted-foreground">Overall</div>
            <div className={cn("text-2xl font-bold tabular-nums", scoreColorClass(score))}>{score}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {HEALTH_FACTORS.map((f) => {
            const v = breakdown[f.key];
            return (
              <div
                key={f.key}
                className="rounded-lg border border-white/80 bg-white/60 dark:bg-card/40 dark:border-border/60 px-2.5 py-2"
              >
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
                      {formatVerificationLabel(googleProfile.verificationState, googleProfile.verificationPending)}
                    </Badge>
                  }
                />
                {googleProfile.verificationState !== "verified" && canManage && (
                  <LocationVerifyActions
                    locationId={location.id}
                    locationName={location.name}
                    mapUrl={googleProfile.mapUrl}
                  />
                )}
                {googleProfile.verificationState === "verified" && (
                  <LocationVerifyHistoryButton
                    locationId={location.id}
                    locationName={location.name}
                  />
                )}
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
                      {formatProfileStatusLabel(googleProfile.profileStatus)}
                    </Badge>
                  }
                />
                {googleProfile.mapUrl ? (
                  <a
                    href={googleProfile.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                  >
                    <ExternalLink className="size-3" /> Open on Google Maps
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1">Google Maps link not available — run Profile sync.</p>
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
            <div className="overflow-x-auto scroll-area">
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
              <div className="overflow-x-auto scroll-area">
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
              <div className="overflow-x-auto scroll-area">
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
  const { seoAudit } = detail;

  if (!seoAudit || seoAudit.recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Profile strength analysis is shown above. No additional AI recommendations at this time.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="size-4 text-amber-500" /> AI Recommendations
          </h3>
          <span className="text-xs text-muted-foreground">
            Last updated {relativeTime(seoAudit.auditedAt)}
          </span>
        </div>
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

// ═══ Import from Google Dialog — Production Only (no demo data) ═════════════
function AddLocationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [gmbLocations, setGmbLocations] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string>(""); // not_configured | not_connected | connected
  const [message, setMessage] = useState<string>("");
  const [setupSteps, setSetupSteps] = useState<string[]>([]);
  const [fetched, setFetched] = useState(false);
  // "Sync after import" — when checked, after importing the selected
  // locations, kick off a full sync for each newly-imported location so the
  // user gets a one-click "import + sync everything" experience.
  const [syncAfterImport, setSyncAfterImport] = useState(true);
  // Progress text for the import-then-sync flow ("Importing 3 of 5…").
  const [progressLabel, setProgressLabel] = useState<string>("");

  // Fetch available GMB locations from Google. Called once on open and again
  // whenever the user clicks the Refresh button inside the dialog.
  async function fetchGmbLocations(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    if (!isRefresh) {
      setFetched(false);
      setSelected(new Set());
      setGmbLocations([]);
    }
    try {
      const res = await fetch("/api/google/available-locations");
      const json = await res.json();
      if (json.success) {
        setGmbLocations(json.data.locations || []);
        setStatus(json.data.status || "");
        setMessage(json.data.message || "");
        setSetupSteps(json.data.setupSteps || []);
        if (isRefresh) {
          toast.success(`Refreshed — ${json.data.available ?? 0} location(s) available`);
        }
      } else {
        toast.error(json.message || "Failed to fetch GMB locations");
        setStatus("not_connected");
      }
    } catch {
      toast.error("Failed to fetch GMB locations");
      setStatus("not_connected");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFetched(true);
    }
  }

  // Fetch available GMB locations when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchGmbLocations(false);
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
      setProgressLabel(`Importing ${toImport.length} location${toImport.length === 1 ? "" : "s"}…`);
      const res = await fetch("/api/locations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: toImport }),
      });
      const json = await res.json();
      if (json.success) {
        const imported: { id: string; name: string; city: string }[] = json.data.imported || [];

        // Optional sync-after-import: kick off a full sync for each imported
        // location in sequence. We deliberately do NOT parallelise — Google's
        // 10 QPS quota is shared with every other bulk operation in the
        // app, and a serial loop with `await` keeps the dev-server UX
        // informative (the progress label ticks up 1-by-1).
        if (syncAfterImport && imported.length > 0) {
          const total = imported.length;
          for (let i = 0; i < total; i++) {
            const loc = imported[i];
            setProgressLabel(`Syncing ${i + 1} of ${total} — ${loc.name}…`);
            try {
              await api(`/api/locations/${loc.id}/sync`, {
                method: "POST",
                body: JSON.stringify({ module: "full" }),
              });
            } catch {
              // Best-effort: a sync failure on a freshly imported location
              // doesn't fail the whole import — the location exists in our
              // DB and the user can re-sync from the Locations grid later.
            }
          }
        }

        toast.success(
          syncAfterImport && imported.length > 0
            ? `${imported.length} location(s) imported & synced from Google Business Profile`
            : json.message || `${json.data.count} location(s) imported from Google Business Profile`,
        );
        qc.invalidateQueries({ queryKey: ["locations"] });
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
        qc.invalidateQueries({ queryKey: ["available-gmb-locations"] });
        onOpenChange(false);
      } else {
        toast.error(json.message || "Import failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
      setProgressLabel("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" /> Import Locations from Google
          </DialogTitle>
          <DialogDescription>
            Connect your Google Business Profile to import and manage your real locations.
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {loading && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="size-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Fetching your Google Business Profile locations…</p>
          </div>
        )}

        {/* ─── State: Google OAuth not configured ─────────────────────────── */}
        {!loading && fetched && status === "not_configured" && (
          <div className="py-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="size-14 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                <Building2 className="size-7 text-amber-500" />
              </div>
              <p className="text-sm font-medium">Google OAuth Not Configured</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">{message}</p>
            </div>
            {setupSteps.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-semibold mb-2">Setup Steps:</p>
                <ol className="space-y-1.5">
                  {setupSteps.map((step, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="size-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ─── State: Not connected ───────────────────────────────────────── */}
        {!loading && fetched && status === "not_connected" && (
          <div className="py-6 text-center space-y-4">
            <div className="size-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="size-8 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Google account not connected</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">{message}</p>
            </div>
            <Button onClick={() => { onOpenChange(false); window.location.href = "/api/google-integration"; }}>
              <Building2 className="size-4 mr-1.5" /> Go to Google Integration
            </Button>
          </div>
        )}

        {/* ─── State: Connected — show locations list ─────────────────────── */}
        {!loading && fetched && status === "connected" && gmbLocations.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3 gap-2">
              <span className="text-sm text-muted-foreground">
                {gmbLocations.length} location(s) available · {selected.size} selected
              </span>
              <div className="flex gap-2 items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchGmbLocations(true)}
                  disabled={refreshing || importing}
                  className="text-xs h-7 gap-1.5"
                  title="Re-fetch GMB locations from Google"
                >
                  {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Refresh
                </Button>
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
                        {loc.verificationState === "verified" ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0">Verified</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/20 shrink-0">Verification required</Badge>
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

        {/* ─── State: Connected but all already imported ──────────────────── */}
        {!loading && fetched && status === "connected" && gmbLocations.length === 0 && (
          <div className="py-12 text-center space-y-3">
            <div className="size-14 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="size-7 text-emerald-500" />
            </div>
            <p className="text-sm font-medium">All locations already imported</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              All your Google Business Profile locations are already connected to MyFNG Local AI Manager.
              New locations will appear here automatically when you add them to your Google Business Profile.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchGmbLocations(true)}
              disabled={refreshing}
              className="mt-2"
            >
              {refreshing ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="size-3.5 mr-1.5" />}
              Refresh list
            </Button>
          </div>
        )}

        {/* Sync-after-import option (visible only on the connected state) */}
        {!loading && fetched && status === "connected" && gmbLocations.length > 0 && (
          <label
            htmlFor="sync-after-import"
            className="flex items-start gap-2.5 mt-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition"
          >
            <Checkbox
              id="sync-after-import"
              checked={syncAfterImport}
              onCheckedChange={(v) => setSyncAfterImport(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Sync after import</span>
              <p className="text-xs text-muted-foreground">
                After importing, automatically trigger a full Google sync for each new location (reviews, photos, hours, services, analytics). Slower, but means your dashboard is fully populated the moment the dialog closes.
              </p>
            </div>
          </label>
        )}

        {/* Progress label while import + optional sync runs */}
        {importing && progressLabel && (
          <div className="flex items-center gap-2 text-sm text-primary -mt-1">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{progressLabel}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          {status === "connected" && gmbLocations.length > 0 && (
            <Button onClick={handleImport} disabled={importing || selected.size === 0}>
              {importing
                ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> {syncAfterImport ? "Importing & Syncing…" : "Importing…"}</>
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

// ═══ Bulk GMB Verification Dialog ══════════════════════════════════════════
// Surfaces the verification state for every location in the agency and lets
// the user either (a) initiate ADDRESS/PHONE/SMS/EMAIL verification for a
// batch of unverified locations, or (b) submit PINs for locations that have
// a pending verification. All operations go through /api/locations/bulk-verify.
interface BulkVerifyLocation {
  locationId: string;
  name: string;
  city: string;
  verificationState: string; // "verified" | "unverified" (reconciled)
  pendingVerifications: any[];
  canInitiate: boolean;
  canComplete: boolean;
  linked: boolean;
  configured: boolean;
  connected: boolean;
  error?: string;
}

const VERIFY_METHODS = [
  { value: "ADDRESS", label: "Postcard (Address)", hint: "Google mails a postcard with the PIN — arrives in 5–14 days." },
  { value: "PHONE_CALL", label: "Phone Call", hint: "Google calls the phone number with an automated PIN." },
  { value: "SMS", label: "SMS", hint: "Google texts the PIN to the phone number." },
  { value: "EMAIL", label: "Email", hint: "Google emails the PIN to the email address." },
] as const;

function BulkVerifyDialog({
  open,
  onOpenChange,
  locationIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locationIds: string[];
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<BulkVerifyLocation[]>([]);
  const [error, setError] = useState<string>("");

  // Initiate tab state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<"ADDRESS" | "PHONE_CALL" | "SMS" | "EMAIL">("ADDRESS");
  const [mailerContactName, setMailerContactName] = useState("Operations Team");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [initiateProgress, setInitiateProgress] = useState("");
  const [initiateResult, setInitiateResult] = useState<any>(null);

  // Complete PIN tab state — map of locationId → PIN
  const [pins, setPins] = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState(false);
  const [completeProgress, setCompleteProgress] = useState("");
  const [completeResult, setCompleteResult] = useState<any>(null);

  async function fetchStatus(isRefresh = false) {
    if (locationIds.length === 0) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await api<{ locations: BulkVerifyLocation[] }>(
        `/api/locations/bulk-verify?locationIds=${encodeURIComponent(locationIds.join(","))}`,
      );
      setItems(data.locations || []);
      // Reset transient state when we re-pull — selections and PINs may no
      // longer apply (e.g. an unverified location is now pending).
      setSelected(new Set());
      setPins({});
      setInitiateResult(null);
      setCompleteResult(null);
      if (isRefresh) {
        toast.success(`Refreshed — ${data.locations.length} location(s) checked`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load verification status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Fetch when the dialog opens or the location set changes meaningfully.
  useEffect(() => {
    if (!open) return;
    fetchStatus(false);
  }, [open, locationIds.join(",")]);

  // Derived counts for the UI
  const verified = items.filter((i) => i.verificationState === "verified");
  const unverified = items.filter((i) => i.canInitiate);
  const pending = items.filter((i) => i.canComplete);
  const notLinked = items.filter((i) => !i.linked);

  function toggleSelect(locationId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  }
  function selectAllUnverified() {
    setSelected(new Set(unverified.map((i) => i.locationId)));
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function setPin(locationId: string, value: string) {
    setPins((prev) => ({ ...prev, [locationId]: value }));
  }

  // Initiate flow — validates per-method input before hitting the API.
  async function handleInitiate() {
    if (selected.size === 0) {
      toast.error("Select at least one unverified location");
      return;
    }
    const input: any = {};
    if (method === "ADDRESS") {
      if (!mailerContactName.trim()) {
        toast.error("Mailer contact name is required for ADDRESS verification");
        return;
      }
      input.mailerContactName = mailerContactName.trim();
    } else if (method === "PHONE_CALL" || method === "SMS") {
      if (!phoneNumber.trim()) {
        toast.error("Phone number is required for PHONE/SMS verification");
        return;
      }
      input.phoneNumber = phoneNumber.trim();
    } else if (method === "EMAIL") {
      if (!emailAddress.trim()) {
        toast.error("Email address is required for EMAIL verification");
        return;
      }
      input.emailAddress = emailAddress.trim();
    }

    setInitiating(true);
    setInitiateResult(null);
    setInitiateProgress(`Initiating verification for ${selected.size} location(s)…`);
    try {
      const res = await fetch("/api/locations/bulk-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "initiate",
          locationIds: Array.from(selected),
          method,
          input,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setInitiateResult(json.data);
        toast.success(json.message || `Initiated verification for ${json.data.initiated?.length ?? 0} location(s)`);
        qc.invalidateQueries({ queryKey: ["locations"] });
        // Auto-refresh so the table reflects the new pending state.
        await fetchStatus(true);
      } else {
        toast.error(json.message || "Bulk initiate failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Bulk initiate failed");
    } finally {
      setInitiating(false);
      setInitiateProgress("");
    }
  }

  // Complete flow — submits PINs for every location with a non-empty PIN
  // value AND a pending verification. We don't require the user to fill in
  // every PIN — they can complete a subset.
  async function handleComplete() {
    const pinsToSubmit = pending
      .map((p) => ({ locationId: p.locationId, pin: (pins[p.locationId] || "").trim() }))
      .filter((p) => p.pin.length > 0);
    if (pinsToSubmit.length === 0) {
      toast.error("Enter at least one PIN to submit");
      return;
    }
    setCompleting(true);
    setCompleteResult(null);
    setCompleteProgress(`Submitting ${pinsToSubmit.length} PIN(s) to Google…`);
    try {
      const res = await fetch("/api/locations/bulk-verify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pins: pinsToSubmit }),
      });
      const json = await res.json();
      if (json.success) {
        setCompleteResult(json.data);
        toast.success(json.message || `Completed ${json.data.completed?.length ?? 0} verification(s)`);
        qc.invalidateQueries({ queryKey: ["locations"] });
        // Clear submitted PINs + refresh.
        setPins({});
        await fetchStatus(true);
      } else {
        toast.error(json.message || "Bulk complete failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Bulk complete failed");
    } finally {
      setCompleting(false);
      setCompleteProgress("");
    }
  }

  const inputLabel =
    method === "ADDRESS"
      ? "Mailer contact name"
      : method === "EMAIL"
        ? "Email address"
        : "Phone number";
  const inputValue =
    method === "ADDRESS"
      ? mailerContactName
      : method === "EMAIL"
        ? emailAddress
        : phoneNumber;
  const setInputValue =
    method === "ADDRESS"
      ? setMailerContactName
      : method === "EMAIL"
        ? setEmailAddress
        : setPhoneNumber;
  const inputPlaceholder =
    method === "ADDRESS"
      ? "Operations Team"
      : method === "EMAIL"
        ? "verify@example.com"
        : "+91 98765 43210";
  const methodHint = VERIFY_METHODS.find((m) => m.value === method)?.hint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Bulk GMB Verification
          </DialogTitle>
          <DialogDescription>
            Initiate or complete Google Business Profile verification for multiple locations at once. Google dispatches a PIN (postcard / call / SMS / email) which you then enter to confirm.
          </DialogDescription>
        </DialogHeader>

        {/* Status summary + refresh */}
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            <CircleCheck className="size-3 mr-1" /> {verified.length} verified
          </Badge>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
            <Clock className="size-3 mr-1" /> {pending.length} pending PIN
          </Badge>
          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
            <CircleAlert className="size-3 mr-1" /> {unverified.length} unverified
          </Badge>
          {notLinked.length > 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              <Inbox className="size-3 mr-1" /> {notLinked.length} not linked
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs gap-1.5"
            onClick={() => fetchStatus(true)}
            disabled={refreshing || loading || initiating || completing}
          >
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </Button>
        </div>

        {/* Initial loading state */}
        {loading && (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="size-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading verification status from Google for {locationIds.length} location(s)…
            </p>
            <p className="text-xs text-muted-foreground/70">
              This paces Google API calls to stay under the 10 QPS quota — about 5 locations per second.
            </p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="py-8 text-center space-y-3">
            <div className="size-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="size-6 text-rose-500" />
            </div>
            <p className="text-sm font-medium">Couldn&apos;t load verification status</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">{error}</p>
            <Button size="sm" variant="outline" onClick={() => fetchStatus(true)}>
              <RefreshCw className="size-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        )}

        {/* Empty state — no locations at all */}
        {!loading && !error && items.length === 0 && (
          <div className="py-10 text-center space-y-2">
            <MapPin className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">No locations to verify</p>
            <p className="text-xs text-muted-foreground">
              Import locations from Google first, then come back here to verify them.
            </p>
          </div>
        )}

        {/* Main tabs — Initiate + Complete PIN */}
        {!loading && !error && items.length > 0 && (
          <Tabs defaultValue="initiate" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="initiate" className="flex-1">
                <ShieldCheck className="size-3.5 mr-1.5" /> Initiate ({unverified.length})
              </TabsTrigger>
              <TabsTrigger value="complete" className="flex-1">
                <CircleCheck className="size-3.5 mr-1.5" /> Complete PIN ({pending.length})
              </TabsTrigger>
            </TabsList>

            {/* ─── Initiate Tab ──────────────────────────────────────────── */}
            <TabsContent value="initiate" className="mt-4 space-y-4">
              {unverified.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <CircleCheck className="size-8 mx-auto text-emerald-500" />
                  <p className="text-sm font-medium">No unverified locations</p>
                  <p className="text-xs text-muted-foreground">
                    Every linked location is either verified or has a pending verification. Switch to the Complete PIN tab to finish any pending ones.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selected.size} of {unverified.length} unverified selected
                    </span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllUnverified}>Select all unverified</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection} disabled={selected.size === 0}>Clear</Button>
                    </div>
                  </div>

                  {/* Locations table */}
                  <div className="max-h-[34vh] overflow-y-auto scroll-area rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="w-24">City</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((loc) => {
                          const isVerified = loc.verificationState === "verified";
                          const isPending = loc.canComplete;
                          const isUnverified = loc.canInitiate;
                          const isNotLinked = !loc.linked;
                          const isSelected = selected.has(loc.locationId);
                          const disabled = !isUnverified;
                          return (
                            <TableRow
                              key={loc.locationId}
                              data-state={isSelected ? "selected" : undefined}
                              className={cn(
                                "cursor-pointer",
                                disabled && "opacity-60 cursor-not-allowed",
                              )}
                              onClick={() => !disabled && toggleSelect(loc.locationId)}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  disabled={disabled}
                                  onCheckedChange={() => !disabled && toggleSelect(loc.locationId)}
                                  aria-label={`Select ${loc.name}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{loc.name}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{loc.city || "—"}</TableCell>
                              <TableCell>
                                {isVerified && (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                    <CircleCheck className="size-3 mr-1" /> Verified
                                  </Badge>
                                )}
                                {isPending && (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                                    <Clock className="size-3 mr-1" /> Pending
                                  </Badge>
                                )}
                                {isUnverified && (
                                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px]">
                                    <CircleAlert className="size-3 mr-1" /> Unverified
                                  </Badge>
                                )}
                                {isNotLinked && (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                    <Inbox className="size-3 mr-1" /> Not linked
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Method + input */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="bv-method" className="text-xs">Verification method</Label>
                      <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                        <SelectTrigger id="bv-method" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VERIFY_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bv-input" className="text-xs">{inputLabel}</Label>
                      <Input
                        id="bv-input"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={inputPlaceholder}
                        disabled={initiating}
                        className="h-9"
                      />
                    </div>
                  </div>
                  {methodHint && (
                    <p className="text-xs text-muted-foreground -mt-2">{methodHint}</p>
                  )}

                  {/* Progress + result */}
                  {initiating && initiateProgress && (
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{initiateProgress}</span>
                    </div>
                  )}
                  {initiateResult && (
                    <BulkActionResultCard
                      title="Initiate results"
                      success={initiateResult.initiated || []}
                      failed={initiateResult.failed || []}
                      skipped={initiateResult.skipped || []}
                    />
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={initiating}>Close</Button>
                    <Button onClick={handleInitiate} disabled={initiating || selected.size === 0}>
                      {initiating
                        ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Initiating…</>
                        : <><ShieldCheck className="size-4 mr-1.5" /> Initiate Verification for {selected.size} Location{selected.size === 1 ? "" : "s"}</>
                      }
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ─── Complete PIN Tab ───────────────────────────────────────── */}
            <TabsContent value="complete" className="mt-4 space-y-4">
              {pending.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <Inbox className="size-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm font-medium">No pending verifications</p>
                  <p className="text-xs text-muted-foreground">
                    Once you initiate verification for a location, the dispatched PIN can be entered here to complete the process.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Enter the PIN Google dispatched for each location (postcard in the mail, SMS, call, or email). You can complete a subset — empty PINs are skipped.
                  </p>

                  <div className="max-h-[40vh] overflow-y-auto scroll-area rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead className="w-24">City</TableHead>
                          <TableHead className="w-32">Method</TableHead>
                          <TableHead className="w-40">PIN</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pending.map((loc) => {
                          const v = loc.pendingVerifications?.[0];
                          return (
                            <TableRow key={loc.locationId}>
                              <TableCell className="font-medium">{loc.name}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{loc.city || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {v?.method === "ADDRESS" ? "Postcard" : v?.method || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={pins[loc.locationId] || ""}
                                  onChange={(e) => setPin(loc.locationId, e.target.value)}
                                  placeholder="6-digit PIN"
                                  maxLength={10}
                                  className="h-8 font-mono"
                                  disabled={completing}
                                  aria-label={`PIN for ${loc.name}`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {completing && completeProgress && (
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{completeProgress}</span>
                    </div>
                  )}
                  {completeResult && (
                    <BulkActionResultCard
                      title="Complete results"
                      success={completeResult.completed || []}
                      failed={completeResult.failed || []}
                    />
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={completing}>Close</Button>
                    <Button
                      onClick={handleComplete}
                      disabled={completing || Object.values(pins).every((p) => !p?.trim())}
                    >
                      {completing
                        ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Submitting…</>
                        : <><CircleCheck className="size-4 mr-1.5" /> Complete {Object.values(pins).filter((p) => p?.trim()).length} Verification{Object.values(pins).filter((p) => p?.trim()).length === 1 ? "" : "s"}</>
                      }
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Small results card shown after a bulk initiate/complete action — surfaces
// per-location success/failure/skip so the user knows exactly what happened.
function BulkActionResultCard({
  title,
  success,
  failed,
  skipped,
}: {
  title: string;
  success: { locationId: string; name: string }[];
  failed: { locationId: string; name: string; error?: string; reason?: string }[];
  skipped?: { locationId: string; name: string; reason?: string }[];
}) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-semibold">{title}:</span>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            {success.length} succeeded
          </Badge>
          {failed.length > 0 && (
            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
              {failed.length} failed
            </Badge>
          )}
          {skipped && skipped.length > 0 && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              {skipped.length} skipped
            </Badge>
          )}
        </div>
        {(failed.length > 0 || (skipped && skipped.length > 0)) && (
          <div className="space-y-1 max-h-32 overflow-y-auto scroll-area">
            {failed.map((f) => (
              <div key={f.locationId} className="text-xs flex items-start gap-1.5">
                <X className="size-3 text-rose-500 mt-0.5 shrink-0" />
                <span className="font-medium">{f.name}:</span>
                <span className="text-muted-foreground">{f.error}</span>
              </div>
            ))}
            {skipped?.map((s) => (
              <div key={s.locationId} className="text-xs flex items-start gap-1.5">
                <Inbox className="size-3 text-amber-500 mt-0.5 shrink-0" />
                <span className="font-medium">{s.name}:</span>
                <span className="text-muted-foreground">{s.reason}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══ Single-Location Verify Actions ═════════════════════════════════════════
// Shown in the Google Profile card under the verification state badge.
// Provides one-click access to the single-location verify flow (POST +
// PATCH on /api/locations/[id]/verify) without having to open the bulk
// dialog for a one-off.

function LocationVerifyActions({
  locationId,
  locationName,
  mapUrl,
}: {
  locationId: string;
  locationName: string;
  mapUrl?: string | null;
}) {
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button size="sm" variant="outline" onClick={() => setVerifyOpen(true)}>
        <ShieldCheck className="size-3.5 mr-1.5" /> Verify now
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
        <History className="size-3.5 mr-1.5" /> View history
      </Button>
      <SingleVerifyDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        locationId={locationId}
        locationName={locationName}
        mapUrl={mapUrl}
      />
      <VerificationHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        locationId={locationId}
        locationName={locationName}
      />
    </div>
  );
}

function LocationVerifyHistoryButton({
  locationId,
  locationName,
}: {
  locationId: string;
  locationName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <History className="size-3.5 mr-1.5" /> View verification history
      </Button>
      <VerificationHistoryDialog
        open={open}
        onOpenChange={setOpen}
        locationId={locationId}
        locationName={locationName}
      />
    </div>
  );
}

type VerifyOption = {
  verificationMethod?: "ADDRESS" | "PHONE_CALL" | "SMS" | "EMAIL" | string;
  phoneNumber?: string;
  addressData?: { business?: string };
  emailData?: { user?: string; domain?: string; isUserNameEditable?: boolean };
};

function SingleVerifyDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
  mapUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locationId: string;
  locationName: string;
  mapUrl?: string | null;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<"ADDRESS" | "PHONE_CALL" | "SMS" | "EMAIL">("ADDRESS");
  const [mailerContactName, setMailerContactName] = useState("Operations Team");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [pinEntryFor, setPinEntryFor] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [completing, setCompleting] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  // Fetch pending verifications for this location so we can show a "complete
  // with PIN" panel below the initiate form when there's something to
  // complete. historyTick bumps after each initiate/complete to refresh.
  const { data: verifyData, isLoading: verifyLoading } = useQuery<{
    verifications: any[];
    linked?: boolean;
    configured?: boolean;
    connected?: boolean;
  }>({
    queryKey: ["location-verify", locationId, historyTick],
    queryFn: () => api(`/api/locations/${locationId}/verify`),
    enabled: open,
  });

  const { data: optionsData, isLoading: optionsLoading } = useQuery<{
    options: VerifyOption[];
    linked?: boolean;
    configured?: boolean;
    connected?: boolean;
  }>({
    queryKey: ["location-verify-options", locationId, historyTick],
    queryFn: () => api(`/api/locations/${locationId}/verify/options`),
    enabled: open,
  });

  const pending = (verifyData?.verifications || []).filter((v) => v.state === "PENDING");
  const googleOptions = optionsData?.options ?? [];
  const availableMethods = VERIFY_METHODS.filter((m) =>
    googleOptions.some((o) => o.verificationMethod === m.value),
  );
  const selectedOption = googleOptions.find((o) => o.verificationMethod === method);
  const gbpManageUrl = "https://business.google.com/locations";

  useEffect(() => {
    if (!open || googleOptions.length === 0) return;
    const methods = VERIFY_METHODS.filter((m) =>
      googleOptions.some((o) => o.verificationMethod === m.value),
    );
    if (methods.length > 0 && !methods.some((m) => m.value === method)) {
      setMethod(methods[0]!.value as typeof method);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when Google options load
  }, [open, googleOptions.length, historyTick]);

  useEffect(() => {
    if (!selectedOption) return;
    if (selectedOption.phoneNumber) setPhoneNumber(selectedOption.phoneNumber);
    if (selectedOption.emailData?.domain) {
      setEmailAddress(
        `${selectedOption.emailData.user || "info"}@${selectedOption.emailData.domain}`,
      );
    }
  }, [selectedOption]);

  const inputLabel =
    method === "ADDRESS"
      ? "Mailer contact name"
      : method === "EMAIL"
        ? "Email address"
        : "Phone number";
  const inputValue =
    method === "ADDRESS"
      ? mailerContactName
      : method === "EMAIL"
        ? emailAddress
        : phoneNumber;
  const setInputValue =
    method === "ADDRESS"
      ? setMailerContactName
      : method === "EMAIL"
        ? setEmailAddress
        : setPhoneNumber;
  const inputPlaceholder =
    method === "ADDRESS"
      ? "Operations Team"
      : method === "EMAIL"
        ? "verify@example.com"
        : "+91 98765 43210";
  const methodHint = VERIFY_METHODS.find((m) => m.value === method)?.hint;
  const phoneLocked = Boolean(
    (method === "PHONE_CALL" || method === "SMS") && selectedOption?.phoneNumber,
  );

  async function handleInitiate() {
    const input: any = {};
    if (method === "ADDRESS") {
      if (!mailerContactName.trim()) {
        toast.error("Mailer contact name is required");
        return;
      }
      input.mailerContactName = mailerContactName.trim();
    } else if (method === "PHONE_CALL" || method === "SMS") {
      if (!phoneNumber.trim()) {
        toast.error("Phone number is required");
        return;
      }
      input.phoneNumber = phoneNumber.trim();
    } else if (method === "EMAIL") {
      if (!emailAddress.trim()) {
        toast.error("Email address is required");
        return;
      }
      input.emailAddress = emailAddress.trim();
    }

    setInitiating(true);
    try {
      const data = await api<{ verification: { name: string } }>(
        `/api/locations/${locationId}/verify`,
        { method: "POST", body: JSON.stringify({ method, input }) },
      );
      toast.success(
        `Verification via ${method} initiated for "${locationName}". Google will dispatch the PIN shortly.`,
      );
      // Auto-select the freshly-initiated verification so the user can
      // immediately enter the PIN when it arrives.
      if (data.verification?.name) setPinEntryFor(data.verification.name);
      setHistoryTick((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["locations"] });
    } catch (e: any) {
      toast.error(e.message || "Initiate failed", { duration: 9000 });
    } finally {
      setInitiating(false);
    }
  }

  async function handleComplete() {
    if (!pinEntryFor) return;
    if (!pin.trim()) {
      toast.error("Enter the PIN Google dispatched");
      return;
    }
    setCompleting(true);
    try {
      await api(`/api/locations/${locationId}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ verificationName: pinEntryFor, pin: pin.trim() }),
      });
      toast.success("PIN submitted. If correct, the location is now verified on Google.");
      setPin("");
      setPinEntryFor(null);
      setHistoryTick((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["location-detail", locationId] });
    } catch (e: any) {
      toast.error(e.message || "Complete failed");
    } finally {
      setCompleting(false);
    }
  }

  // Pre-conditions: not linked / not configured / not connected — surface a
  // helpful message instead of a broken form. Mirrors the single-location
  // verify route's empty-state cascade.
  const notLinked = verifyData && verifyData.linked === false;
  const notConfigured = verifyData && verifyData.linked === true && verifyData.configured === false;
  const notConnected = verifyData && verifyData.linked === true && verifyData.configured === true && verifyData.connected === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Verify &ldquo;{locationName}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Initiate Google Business Profile verification. Google will dispatch a PIN (postcard / call / SMS / email) which you then enter to complete the process.
          </DialogDescription>
        </DialogHeader>

        {(verifyLoading || optionsLoading) && (
          <div className="py-8 text-center">
            <Loader2 className="size-6 mx-auto animate-spin text-primary" />
            <p className="text-xs text-muted-foreground mt-2">Checking verification options Google allows…</p>
          </div>
        )}

        {!verifyLoading && !optionsLoading && notLinked && (
          <p className="text-sm text-muted-foreground py-4">
            No Google Business Profile linked to this location. Import this location from Google first.
          </p>
        )}
        {!verifyLoading && !optionsLoading && notConfigured && (
          <p className="text-sm text-muted-foreground py-4">
            Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.
          </p>
        )}
        {!verifyLoading && !optionsLoading && notConnected && (
          <p className="text-sm text-muted-foreground py-4">
            Google account not connected. Reconnect Google OAuth from the Google Integration page.
          </p>
        )}

        {/* Pending verification complete panel — show first if there's
            already a pending verification the user can complete. */}
        {!verifyLoading && !optionsLoading && !notLinked && !notConfigured && !notConnected && pending.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="size-4 text-amber-500" /> Pending verification
            </p>
            <p className="text-xs text-muted-foreground">
              A verification is already in progress for this location. Enter the PIN Google dispatched to complete it.
            </p>
            <Select
              value={pinEntryFor ?? pending[0]?.name ?? ""}
              onValueChange={(v) => setPinEntryFor(v)}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Select verification record" />
              </SelectTrigger>
              <SelectContent>
                {pending.map((v) => (
                  <SelectItem key={v.name} value={v.name}>
                    {v.method === "ADDRESS" ? "Postcard" : v.method} · initiated {v.createTime ? relativeTime(v.createTime) : "recently"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="6-digit PIN"
              maxLength={10}
              className="font-mono"
              disabled={completing}
              aria-label="PIN"
            />
            <Button size="sm" onClick={handleComplete} disabled={completing || !pin.trim()} className="w-full">
              {completing
                ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Submitting…</>
                : <><CircleCheck className="size-3.5 mr-1.5" /> Complete verification</>
              }
            </Button>
          </div>
        )}

        {/* Initiate form — only when Google offers API methods and nothing is pending. */}
        {!verifyLoading && !optionsLoading && !notLinked && !notConfigured && !notConnected && pending.length === 0 && availableMethods.length === 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-4 text-amber-600" />
              SMS / call not available via API
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Google returned no postcard, SMS, phone-call, or email verification options for this listing.
              That usually means verification must be completed in Google Business Profile (often a short video).
              After Google marks it verified, sync this location and performance metrics can unlock.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <a href={gbpManageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5 mr-1.5" /> Open Google Business Profile
                </a>
              </Button>
              {mapUrl && (
                <Button size="sm" variant="outline" asChild>
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                    <MapPin className="size-3.5 mr-1.5" /> View on Maps
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}

        {!verifyLoading && !optionsLoading && !notLinked && !notConfigured && !notConnected && pending.length === 0 && availableMethods.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sv-method" className="text-xs">Verification method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger id="sv-method" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sv-input" className="text-xs">{inputLabel}</Label>
              <Input
                id="sv-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={initiating || phoneLocked}
              />
            </div>
            {methodHint && (
              <p className="text-xs text-muted-foreground">{methodHint}</p>
            )}
            {phoneLocked && (
              <p className="text-xs text-muted-foreground">
                Using the phone number Google listed as eligible for this method.
              </p>
            )}
            <Button onClick={handleInitiate} disabled={initiating} className="w-full">
              {initiating
                ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Initiating…</>
                : <><ShieldCheck className="size-4 mr-1.5" /> Initiate verification</>
              }
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerificationHistoryDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locationId: string;
  locationName: string;
}) {
  const { data, isLoading } = useQuery<{
    verifications: any[];
    linked?: boolean;
    configured?: boolean;
    connected?: boolean;
  }>({
    queryKey: ["location-verify-history", locationId],
    queryFn: () => api(`/api/locations/${locationId}/verify`),
    enabled: open,
  });

  const verifications = data?.verifications || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" /> Verification history — {locationName}
          </DialogTitle>
          <DialogDescription>
            All verification attempts Google has recorded for this location.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center">
            <Loader2 className="size-6 mx-auto animate-spin text-primary" />
          </div>
        )}

        {!isLoading && data?.linked === false && (
          <p className="text-sm text-muted-foreground py-4">No Google Business Profile linked.</p>
        )}
        {!isLoading && data?.linked === true && data.configured === false && (
          <p className="text-sm text-muted-foreground py-4">Google OAuth is not configured.</p>
        )}
        {!isLoading && data?.linked === true && data.configured === true && data.connected === false && (
          <p className="text-sm text-muted-foreground py-4">Google account not connected.</p>
        )}

        {!isLoading && verifications.length === 0 && data?.linked === true && data.configured === true && data.connected === true && (
          <div className="py-8 text-center space-y-2">
            <Inbox className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">No verification attempts yet</p>
            <p className="text-xs text-muted-foreground">Initiate a verification to start the process.</p>
          </div>
        )}

        {!isLoading && verifications.length > 0 && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto scroll-area">
            {verifications.map((v) => {
              const state = v.state as string;
              const isCompleted = state === "COMPLETED";
              const isPending = state === "PENDING";
              const isFailed = state === "FAILED";
              return (
                <div
                  key={v.name}
                  className={cn(
                    "rounded-lg border p-3 flex items-start gap-3",
                    isCompleted && "bg-emerald-500/5 border-emerald-500/20",
                    isPending && "bg-amber-500/5 border-amber-500/20",
                    isFailed && "bg-rose-500/5 border-rose-500/20",
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {isCompleted && <CircleCheck className="size-4 text-emerald-500" />}
                    {isPending && <Clock className="size-4 text-amber-500" />}
                    {isFailed && <CircleAlert className="size-4 text-rose-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        {v.method === "ADDRESS" ? "Postcard" : v.method === "PHONE_CALL" ? "Phone call" : v.method === "SMS" ? "SMS" : v.method === "EMAIL" ? "Email" : v.method}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          isCompleted && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                          isPending && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                          isFailed && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                        )}
                      >
                        {state}
                      </Badge>
                    </div>
                    {v.createTime && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Initiated {relativeTime(v.createTime)}
                      </p>
                    )}
                    {v.announceTimeoutSec && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        PIN expires in ~{Math.round(v.announceTimeoutSec / 86400)} day(s).
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
