"use client";

import { useState, useMemo, useRef, lazy, Suspense, Fragment, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import { contentTabToPath, type ContentTab } from "@/lib/routes";
import { PostsView } from "@/components/views/posts-view";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { STAT_ACCENT_STYLES } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Phone,
  Grid3X3,
  Globe,
  CalendarCheck,
  UtensilsCrossed,
  Settings2,
  CalendarDays,
  Clock,
  Image,
  ImageIcon,
  Video,
  Palette,
  MessageCircle,
  Share2,
  Wrench,
  Package,
  FileText,
  HelpCircle,
  StickyNote,
  Bot,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Lock,
  Tag,
  Plus,
  Search,
  History,
  ShoppingBag,
  Megaphone,
  Gift,
  Calendar,
  ArrowRightLeft,
  LayoutDashboard,
  Download,
  Upload,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CONTENT_FIELD_META, BULK_UPDATE_SECTIONS, UPCOMING_HOLIDAYS, type ContentFieldKey, type RiskLevel, type ImpactLevel } from "@/lib/content-update-fields";
import type { LocationWithStats } from "@/lib/types";
import { ContentUpdateDialog } from "@/components/content/content-update-dialog";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { LayoutToggle, type LayoutMode } from "@/components/shared/layout-toggle";
import { NumberedPagination } from "@/components/shared/numbered-pagination";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldStat {
  missing: number;
  ids: string[];
  avgCount?: number;
  avgWords?: number;
  total?: number;
}

interface ContentStats {
  totalLocations: number;
  coreInfo: {
    phone: FieldStat;
    primaryCategory: FieldStat;
    additionalCategories: FieldStat;
    businessStatus: FieldStat;
    websiteLink: FieldStat;
    appointmentLink: FieldStat;
    menuLink: FieldStat;
    attributes: FieldStat;
    openingDate: FieldStat;
    openingHours: FieldStat;
    specialHours: FieldStat;
    photos: FieldStat;
    coverPhoto: FieldStat;
    videos: FieldStat;
    businessLogo: FieldStat;
    chatLink: FieldStat;
    socialLinks: FieldStat;
    foodOrdering: FieldStat;
  };
  content: {
    services: FieldStat;
    products: FieldStat;
    description: FieldStat;
    qna: FieldStat;
    posts: FieldStat;
  };
  automation: {
    autoReply: FieldStat;
    profileProtection: FieldStat;
  };
}

interface UpdateHistoryEntry {
  id: string;
  date: string;
  updateType: string;
  details: string;
  locationsAffected: number;
  status: "completed" | "partial" | "failed";
  updatedBy: string;
}

const PHOTO_CATEGORY_LABELS: Record<string, string> = {
  LOGO: "Business Logo",
  PROFILE: "Business Logo",
  COVER: "Cover Photo",
  INTERIOR: "Interior Photo",
  EXTERIOR: "Exterior Photo",
  PRODUCT: "Product Photo",
  TEAM: "Team Photo",
  FOOD_AND_DRINK: "Food & Drink Photo",
  MENU: "Menu Photo",
  AT_WORK: "At Work Photo",
  COMMON_AREA: "Common Area Photo",
  ROOMS: "Rooms Photo",
  LANDSCAPE: "Landscape Photo",
};

function parseAuditPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function truncateText(text: string, max = 90): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function fieldLabel(field: string): string {
  const meta = CONTENT_FIELD_META[field as ContentFieldKey];
  if (meta) return meta.label;
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatAuditHistoryEntry(
  log: { id: string; action: string; entityId?: string | null; newValue?: unknown; status?: string; userName?: string | null; createdAt: string },
  locationNameById: Map<string, string>,
): UpdateHistoryEntry {
  const data = parseAuditPayload(log.newValue);
  const updatedBy = log.userName ?? "System";

  if (log.action === "content.sync_photos") {
    const created = Number(data?.photosCreated ?? 0);
    const updated = Number(data?.photosUpdated ?? 0);
    const locCount = Array.isArray(data?.locationIds) ? data.locationIds.length : 0;
    return {
      id: log.id,
      date: log.createdAt,
      updateType: "Photos synced from Google",
      details: `${created + updated} photo(s) refreshed across ${locCount || "all"} listing(s)`,
      locationsAffected: locCount || 1,
      status: "completed",
      updatedBy,
    };
  }

  if (log.action === "content.bulk_update") {
    const field = String(data?.field ?? log.entityId ?? "content");
    const updated = Number(data?.updated ?? 0);
    const failed = Number(data?.failed ?? 0);
    const locationIds = Array.isArray(data?.locationIds) ? (data.locationIds as string[]) : [];
    const payload = (data?.payload as Record<string, unknown> | undefined) ?? {};
    const value = typeof payload.value === "string" ? payload.value.trim() : "";

    let details = "";
    if (field === "socialLinks") {
      details = "Social profile links updated";
    } else if (field === "services" && value) {
      const count = value.split(",").filter(Boolean).length;
      details = count > 1 ? `${count} services added` : truncateText(value);
    } else if (field === "additionalCategories" && value) {
      details = truncateText(value);
    } else if (value) {
      details = truncateText(value);
    } else if (updated > 0) {
      details = `${updated} listing${updated === 1 ? "" : "s"} updated`;
    }

    const status: UpdateHistoryEntry["status"] =
      log.status === "failed" || (failed > 0 && updated === 0)
        ? "failed"
        : failed > 0
          ? "partial"
          : "completed";

    return {
      id: log.id,
      date: log.createdAt,
      updateType: fieldLabel(field),
      details,
      locationsAffected: locationIds.length || updated || 1,
      status,
      updatedBy,
    };
  }

  if (log.action.startsWith("media.upload")) {
    const fileName = String(data?.fileName ?? "Photo");
    const category = data?.category ? String(data.category) : "";
    const photoLabel = category ? (PHOTO_CATEGORY_LABELS[category] ?? fieldLabel(category)) : "Photo";
    const locationId = data?.locationId ? String(data.locationId) : "";
    const locLabel = locationNameById.get(locationId);
    const error = data?.error ? String(data.error) : "";

    let updateType = photoLabel;
    if (log.action === "media.upload.google") updateType = `${photoLabel} → Google`;
    else if (log.action === "media.upload.google_failed") updateType = `${photoLabel} (Google failed)`;
    else if (log.action === "media.upload.google_blocked") updateType = `${photoLabel} (local only)`;

    const details = [fileName, locLabel, error ? truncateText(error, 60) : ""].filter(Boolean).join(" · ");

    return {
      id: log.id,
      date: log.createdAt,
      updateType,
      details,
      locationsAffected: 1,
      status: log.action.includes("failed") || log.status === "failed" ? "failed" : "completed",
      updatedBy,
    };
  }

  if (log.action === "google.sync") {
    const synced = Number(data?.synced ?? 1);
    return {
      id: log.id,
      date: log.createdAt,
      updateType: "Google Profile Sync",
      details: synced > 1 ? `${synced} profiles synced from Google` : "Profile synced from Google",
      locationsAffected: synced,
      status: "completed",
      updatedBy,
    };
  }

  return {
    id: log.id,
    date: log.createdAt,
    updateType: fieldLabel(log.action.split(".").pop() ?? log.action),
    details: log.action.replace(/\./g, " · "),
    locationsAffected: 1,
    status: log.status === "failed" ? "failed" : "completed",
    updatedBy,
  };
}

interface ProductEntry {
  id: string;
  locationId: string;
  locationName: string;
  image: string | null;
  name: string;
  description: string | null;
  category: string;
  price: number | null;
  landingUrl: string | null;
  googleEditId: string | null;
  special: boolean;
  listings: number;
}

type RiskLevelLocal = RiskLevel;
type ImpactLevelLocal = ImpactLevel;

const FIELD_ICON_MAP: Record<ContentFieldKey, LucideIcon> = {
  phone: Phone,
  primaryCategory: Tag,
  additionalCategories: Grid3X3,
  businessStatus: AlertTriangle,
  websiteLink: Globe,
  appointmentLink: CalendarCheck,
  menuLink: UtensilsCrossed,
  attributes: Settings2,
  openingDate: CalendarDays,
  openingHours: Clock,
  specialHours: Calendar,
  photos: Image,
  coverPhoto: ImageIcon,
  videos: Video,
  businessLogo: Palette,
  chatLink: MessageCircle,
  socialLinks: Share2,
  services: Wrench,
  products: Package,
  description: FileText,
  qna: HelpCircle,
  posts: StickyNote,
  autoReply: Bot,
  profileProtection: Shield,
  foodOrdering: UtensilsCrossed,
};

const EMPTY_STAT: FieldStat = { missing: 0, ids: [] };

function apiFieldToKey(field: string): ContentFieldKey | null {
  const map: Record<string, ContentFieldKey> = {
    phone: "phone",
    categories: "additionalCategories",
    primaryCategory: "primaryCategory",
    businessStatus: "businessStatus",
    website: "websiteLink",
    appointment: "appointmentLink",
    menu: "menuLink",
    attributes: "attributes",
    openingDate: "openingDate",
    hours: "openingHours",
    specialHours: "specialHours",
    photos: "photos",
    coverPhoto: "coverPhoto",
    videos: "videos",
    logo: "businessLogo",
    chatLink: "chatLink",
    socialLinks: "socialLinks",
    foodOrdering: "foodOrdering",
    services: "services",
    products: "products",
    description: "description",
    qna: "qna",
    posts: "posts",
    autoReply: "autoReply",
    profileProtection: "profileProtection",
  };
  return map[field] ?? null;
}

function getFieldStat(stats: ContentStats, key: ContentFieldKey): FieldStat {
  if (key in stats.coreInfo) return stats.coreInfo[key as keyof typeof stats.coreInfo];
  if (key in stats.content) return stats.content[key as keyof typeof stats.content];
  if (key in stats.automation) return stats.automation[key as keyof typeof stats.automation];
  return EMPTY_STAT;
}

const DASHBOARD_TILES: { key: ContentFieldKey; label: string }[] = [
  { key: "phone", label: "Phone Number" },
  { key: "additionalCategories", label: "Add. Categories" },
  { key: "websiteLink", label: "Website Link" },
  { key: "appointmentLink", label: "Appointment Link" },
  { key: "menuLink", label: "Menu Link" },
  { key: "attributes", label: "Attributes" },
  { key: "openingDate", label: "Opening Date" },
  { key: "openingHours", label: "Opening Hours" },
  { key: "businessStatus", label: "Business Status" },
  { key: "photos", label: "Photos" },
  { key: "coverPhoto", label: "Cover Photo" },
  { key: "videos", label: "Videos" },
  { key: "businessLogo", label: "Business Logo" },
  { key: "chatLink", label: "Chat Link" },
  { key: "socialLinks", label: "Social Links" },
  { key: "services", label: "Services" },
  { key: "products", label: "Products" },
  { key: "description", label: "Description" },
  { key: "qna", label: "Q&A" },
  { key: "posts", label: "Posts" },
  { key: "autoReply", label: "Auto Reply" },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevelLocal, string> = {
  very_high: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
  very_low: "bg-slate-100 text-slate-600 border-slate-200",
};

const RISK_LABELS: Record<RiskLevelLocal, string> = {
  very_high: "Very High",
  high: "High",
  medium: "Medium",
  low: "Low",
  very_low: "Very Low",
};

const IMPACT_COLORS: Record<ImpactLevelLocal, string> = {
  very_high: "bg-green-100 text-green-700 border-green-200",
  high: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-orange-100 text-orange-700 border-orange-200",
  very_low: "bg-slate-100 text-slate-600 border-slate-200",
};

const IMPACT_LABELS: Record<ImpactLevelLocal, string> = {
  very_high: "Very High",
  high: "High",
  medium: "Medium",
  low: "Low",
  very_low: "Very Low",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function ContentUpdatesView({ initialTab = "dashboard" }: { initialTab?: ContentTab }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  function handleTabChange(tab: string) {
    const next = tab as ContentTab;
    setActiveTab(next);
    router.push(contentTabToPath(next));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Content"
        description="Posts, products & content completeness across all listings"
        icon={Layers}
        accent="cyan"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="size-3.5" />
            Content Dashboard
          </TabsTrigger>
          <TabsTrigger value="bulk-products">
            <Package className="size-3.5" />
            Products
          </TabsTrigger>
          <TabsTrigger value="posts">
            <Megaphone className="size-3.5" />
            Google Posts
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-3.5" />
            Update History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <ContentDashboard onNavigateTab={handleTabChange} />
        </TabsContent>
        <TabsContent value="bulk-products">
          <BulkProductTab onNavigateToPost={() => { handleTabChange("posts"); }} />
        </TabsContent>
        <TabsContent value="posts">
          <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4">
            <PostsView />
          </div>
        </TabsContent>
        <TabsContent value="history">
          <UpdateHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Sub-tab 1: Dashboard ─────────────────────────────────────────────────────

function ContentDashboard({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const queryClient = useQueryClient();
  const { data: locations, isLoading: locsLoading } = useQuery<LocationWithStats[]>({
    queryKey: ["locations"],
    queryFn: () => api<LocationWithStats[]>("/api/locations"),
  });
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [updateField, setUpdateField] = useState<ContentFieldKey | null>(null);
  const [updateMissingIds, setUpdateMissingIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updateSearch, setUpdateSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const contentUpdatesUrl = useMemo(() => {
    if (selectedLocationIds.length === 0) return "/api/content-updates";
    return `/api/content-updates?locationIds=${selectedLocationIds.join(",")}`;
  }, [selectedLocationIds]);

  const { data: apiData, isLoading: apiLoading, refetch } = useQuery<any>({
    queryKey: ["content-updates", selectedLocationIds],
    queryFn: () => api(contentUpdatesUrl),
  });

  const scopedLocations = useMemo(() => {
    if (!locations) return [];
    if (selectedLocationIds.length === 0) return locations;
    return locations.filter((l) => selectedLocationIds.includes(l.id));
  }, [locations, selectedLocationIds]);

  const selectedListingLabel = useMemo(() => {
    if (selectedLocationIds.length === 0) return "All listings";
    if (selectedLocationIds.length === 1) {
      return locations?.find((l) => l.id === selectedLocationIds[0])?.name ?? "1 listing";
    }
    return `${selectedLocationIds.length} listings selected`;
  }, [selectedLocationIds, locations]);

  const isLoading = locsLoading || apiLoading;

  const stats = useMemo<ContentStats | null>(() => {
    if (apiData?.coreInfo) {
      const coreInfo: ContentStats["coreInfo"] = {
        phone: EMPTY_STAT,
        primaryCategory: EMPTY_STAT,
        additionalCategories: EMPTY_STAT,
        businessStatus: EMPTY_STAT,
        websiteLink: EMPTY_STAT,
        appointmentLink: EMPTY_STAT,
        menuLink: EMPTY_STAT,
        attributes: EMPTY_STAT,
        openingDate: EMPTY_STAT,
        openingHours: EMPTY_STAT,
        specialHours: EMPTY_STAT,
        photos: EMPTY_STAT,
        coverPhoto: EMPTY_STAT,
        videos: EMPTY_STAT,
        businessLogo: EMPTY_STAT,
        chatLink: EMPTY_STAT,
        socialLinks: EMPTY_STAT,
        foodOrdering: EMPTY_STAT,
      };
      const content: ContentStats["content"] = {
        services: EMPTY_STAT,
        products: EMPTY_STAT,
        description: EMPTY_STAT,
        qna: EMPTY_STAT,
        posts: EMPTY_STAT,
      };
      const automation: ContentStats["automation"] = {
        autoReply: EMPTY_STAT,
        profileProtection: EMPTY_STAT,
      };

      const applyItems = (items: any[], target: Record<string, FieldStat>) => {
        items.forEach((item: any) => {
          const key = apiFieldToKey(item.field);
          if (!key) return;
          target[key] = {
            missing: item.missing,
            ids: item.missingLocationIds || [],
            avgCount: item.avgCount,
            avgWords: item.avgWords,
            total: item.total ?? apiData.totalLocations,
          };
        });
      };

      applyItems(apiData.coreInfo, coreInfo as unknown as Record<string, FieldStat>);
      applyItems(apiData.content, content as unknown as Record<string, FieldStat>);
      applyItems(apiData.automation, automation as unknown as Record<string, FieldStat>);

      return { totalLocations: apiData.totalLocations, coreInfo, content, automation };
    }
    return null;
  }, [apiData]);

  const listingCount = scopedLocations.length || stats?.totalLocations || 0;
  const isSingleListing = listingCount === 1;

  const filteredSections = useMemo(() => {
    const q = updateSearch.trim().toLowerCase();
    if (!q) return BULK_UPDATE_SECTIONS;
    return BULK_UPDATE_SECTIONS.map((section) => ({
      ...section,
      cards: section.cards.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          CONTENT_FIELD_META[c.fieldKey].label.toLowerCase().includes(q),
      ),
    })).filter((s) => s.cards.length > 0);
  }, [updateSearch]);

  const sortedDashboardTiles = useMemo(() => {
    if (!stats) return DASHBOARD_TILES;
    return [...DASHBOARD_TILES].sort((a, b) => {
      const statA = getFieldStat(stats, a.key);
      const statB = getFieldStat(stats, b.key);
      if (statA.missing !== statB.missing) return statB.missing - statA.missing;
      return a.label.localeCompare(b.label);
    });
  }, [stats]);

  const missingTileCount = useMemo(
    () => (stats ? sortedDashboardTiles.filter((t) => getFieldStat(stats, t.key).missing > 0).length : 0),
    [stats, sortedDashboardTiles],
  );
  const completeTileCount = sortedDashboardTiles.length - missingTileCount;

  const lastContentUpdate = useMemo(() => {
    const dates = scopedLocations
      .map((l) => l.lastSyncedAt)
      .filter(Boolean)
      .map((d) => new Date(d!).getTime());
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates));
  }, [scopedLocations]);

  const handleRefreshContent = async () => {
    setRefreshing(true);
    try {
      const syncBody =
        selectedLocationIds.length > 0
          ? { locationIds: selectedLocationIds }
          : {};
      const syncRes = await api<{
        photosCreated: number;
        photosUpdated: number;
        errors: string[];
      }>("/api/content-updates/sync", {
        method: "POST",
        body: JSON.stringify(syncBody),
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      const total = (syncRes.photosCreated ?? 0) + (syncRes.photosUpdated ?? 0);
      if (syncRes.errors?.length) {
        toast.warning(`Synced ${total} photo(s). ${syncRes.errors.length} location(s) had errors.`);
      } else {
        toast.success(total > 0 ? `Synced ${total} photo(s) from Google` : "Content stats are up to date");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to sync content from Google");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshListings = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
    await refetch();
    setRefreshing(false);
    toast.success("Listings refreshed");
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-4 mt-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const handleCardClick = (key: ContentFieldKey, missingIds: string[]) => {
    if (key === "posts") {
      onNavigateTab?.("posts");
      return;
    }
    if (key === "products") {
      onNavigateTab?.("bulk-products");
      return;
    }
    setUpdateField(key);
    setUpdateMissingIds(missingIds);
    setDialogOpen(true);
  };

  const selectedListingName = selectedListingLabel;

  return (
    <div className="space-y-6 mt-4">
      {/* Header bar */}
      <div className="rounded-xl border bg-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <h2 className="text-lg font-semibold">Content Dashboard</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate max-w-md">
              <span className="font-medium text-foreground">Viewing:</span> {selectedListingName}
            </span>
            <span>
              <span className="font-medium text-foreground">Listings:</span> {listingCount}
            </span>
            <span>
              <span className="font-medium text-foreground">Last Content Update:</span>{" "}
              {lastContentUpdate
                ? lastContentUpdate.toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Not synced yet — click Refresh Content"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <LocationMultiSelect
            locations={locations}
            selectedIds={selectedLocationIds}
            onChange={setSelectedLocationIds}
            className="min-w-[200px] max-w-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
            onClick={handleRefreshContent}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh Content
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
            onClick={handleRefreshListings}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh Listings
          </Button>
        </div>
      </div>

      {updateMissingIds.length > 0 && dialogOpen && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between">
          <span className="text-sm text-blue-700 font-medium">
            {updateMissingIds.length} listing{updateMissingIds.length > 1 ? "s" : ""} missing{" "}
            {updateField ? CONTENT_FIELD_META[updateField]?.label : "this field"}
          </span>
        </div>
      )}

      {dialogOpen && updateField && (
        <ContentUpdateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          fieldKey={updateField}
          locations={scopedLocations}
          preselectedIds={
            selectedLocationIds.length === 1
              ? selectedLocationIds
              : updateMissingIds.length === 1
                ? updateMissingIds
                : undefined
          }
          missingIds={updateMissingIds}
          totalLocations={listingCount}
          onNavigateTab={(tab) => onNavigateTab?.(tab)}
        />
      )}

      {/* All fields — single grid, strength sorted (missing first) */}
      <div className="rounded-xl border p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            {isSingleListing ? (
              <>Content fields for <span className="text-primary">this listing</span></>
            ) : (
              <>
                All Content Fields for{" "}
                <span className="text-primary">
                  {listingCount} listing{listingCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
              {missingTileCount} need attention
            </Badge>
            <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">
              {completeTileCount} complete
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {sortedDashboardTiles.map((card) => {
            const data = getFieldStat(stats, card.key);
            return (
              <StatusCard
                key={card.key}
                icon={FIELD_ICON_MAP[card.key]}
                label={card.label}
                data={data}
                totalLocations={listingCount}
                singleListing={isSingleListing}
                onClick={() => handleCardClick(card.key, data.ids)}
              />
            );
          })}
        </div>
      </div>

      {/* Profile Protection — separate security section */}
      <ProfileProtectionPanel
        data={getFieldStat(stats, "profileProtection")}
        totalLocations={listingCount}
        onManage={() =>
          handleCardClick(
            "profileProtection",
            getFieldStat(stats, "profileProtection").ids,
          )
        }
      />

      {/* Search + bulk update cards */}
      <div className="space-y-4 pt-2">
        <div>
          <label className="text-sm font-semibold mb-2 block">Search Updates</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search updates…"
              value={updateSearch}
              onChange={(e) => setUpdateSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {filteredSections.map((section) => (
          <UpdateCardSection
            key={section.id}
            title={`${section.title} for ${listingCount} listing${listingCount !== 1 ? "s" : ""}`}
            cards={section.cards}
            onCardClick={(fieldKey) => {
              const data = getFieldStat(stats, fieldKey);
              handleCardClick(fieldKey, data.ids);
            }}
          />
        ))}

        {/* Upcoming holidays row */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Set Special Hours for Upcoming Holidays
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {UPCOMING_HOLIDAYS.map((holiday) => (
              <button
                key={holiday.name}
                type="button"
                onClick={() => handleCardClick("specialHours", getFieldStat(stats, "specialHours").ids)}
                className="shrink-0 rounded-xl border bg-card p-4 min-w-[180px] text-left hover:shadow-md hover:border-primary/30 transition-all"
              >
                <p className="text-sm font-semibold">{holiday.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{holiday.date}</p>
                <Badge variant="outline" className="mt-2 text-[10px] text-amber-700 border-amber-200 bg-amber-50">
                  Coming in {holiday.daysUntil} day{holiday.daysUntil > 1 ? "s" : ""}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-tab 2: Update History ────────────────────────────────────────────────

function UpdateHistoryTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const { data: locations } = useLocations();

  const { data: auditLogs, isLoading } = useQuery<any[]>({
    queryKey: ["audit-logs", "content"],
    queryFn: () => api<any[]>("/api/audit-logs?limit=200"),
  });

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    locations?.forEach((loc) => map.set(loc.id, `${loc.name}, ${loc.city}`));
    return map;
  }, [locations]);

  const history = useMemo<UpdateHistoryEntry[]>(() => {
    if (!auditLogs) return [];
    return auditLogs
      .filter((log) =>
        log.action?.startsWith("content.") ||
        log.action?.startsWith("media.upload") ||
        log.action?.startsWith("google.sync"),
      )
      .map((log) => formatAuditHistoryEntry(log, locationNameById));
  }, [auditLogs, locationNameById]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return history.filter((h) => {
      if (statusFilter !== "all" && h.status !== statusFilter) return false;
      if (q && !`${h.updateType} ${h.details} ${h.updatedBy}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [history, statusFilter, searchTerm]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const statusBadge = (status: UpdateHistoryEntry["status"]) => {
    const map = {
      completed: "bg-green-100 text-green-700 border-green-200",
      partial: "bg-amber-100 text-amber-700 border-amber-200",
      failed: "bg-red-100 text-red-700 border-red-200",
    };
    return (
      <Badge variant="outline" className={cn("text-[11px] capitalize", map[status])}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Update History</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search updates..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Download className="size-3.5" /> Export
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">What changed</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Locations</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Updated By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-muted-foreground">
                      Loading update history…
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-muted-foreground">
                      No updates found
                    </td>
                  </tr>
                ) : (
                  paginated.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-accent/30 transition">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(entry.date).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{entry.updateType}</div>
                        {entry.details ? (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.details}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary" className="text-xs">
                          {entry.locationsAffected}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(entry.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.updatedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <NumberedPagination
        page={page}
        totalPages={Math.max(1, totalPages)}
        totalItems={filtered.length}
        perPage={perPage}
        onPageChange={setPage}
        itemLabel="updates"
        pageBase={1}
        hideWhenSinglePage
      />
    </div>
  );
}

function ProductRow({
  product,
  onDelete,
  onEdit,
}: {
  product: ProductEntry;
  onDelete: (id: string) => void;
  onEdit: (product: ProductEntry) => void;
}) {
  return (
    <tr className="border-b last:border-0 hover:bg-accent/30 transition">
      <td className="px-4 py-3">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            referrerPolicy="no-referrer"
            className="size-10 rounded-md object-cover bg-muted"
          />
        ) : (
          <div className="size-10 rounded-md bg-muted flex items-center justify-center">
            <Package className="size-4 text-muted-foreground" />
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium">{product.name}</div>
        {product.description && (
          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 max-w-[280px]">
            {product.description}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-[140px]">{product.locationName}</span>
      </td>
      <td className="px-4 py-3">
        <Badge variant="secondary" className="text-xs">{product.category}</Badge>
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">
        {product.price ? `₹${product.price.toLocaleString("en-IN")}` : "—"}
      </td>
      <td className="px-4 py-3 text-center">
        {product.special ? (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Special</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant="outline" className="text-xs">{product.listings}</Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onEdit(product)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-rose-500 hover:text-rose-700" onClick={() => onDelete(product.id)}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

type ProductSyncRowStatus = "pending" | "syncing" | "done" | "error";

interface ProductSyncProgressState {
  active: boolean;
  currentIndex: number;
  total: number;
  rows: Array<{
    locationId: string;
    name: string;
    status: ProductSyncRowStatus;
    synced: number;
    error?: string;
  }>;
}

function cleanSyncError(msg: string): string {
  return msg.replace(/^[a-z0-9]{20,}:\s*/i, "").trim();
}

function ProductSyncProgressPanel({ progress }: { progress: ProductSyncProgressState }) {
  const doneCount = progress.rows.filter((r) => r.status === "done" || r.status === "error").length;
  const pct = progress.total > 0 ? Math.round((doneCount / progress.total) * 100) : 0;
  const current = progress.rows[progress.currentIndex];
  const totalImported = progress.rows.reduce((sum, r) => sum + r.synced, 0);

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900">
              {progress.active ? "Refreshing products from Google…" : "Product refresh complete"}
            </p>
            <p className="text-xs text-blue-700/80 mt-0.5 truncate">
              {progress.active && current?.status === "syncing"
                ? `Now refreshing: ${current.name} (${progress.currentIndex + 1}/${progress.total})`
                : `${doneCount}/${progress.total} listings processed · ${totalImported} product(s) imported`}
            </p>
          </div>
          {progress.active ? (
            <Loader2 className="size-4 shrink-0 text-blue-600 animate-spin mt-0.5" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-green-600 mt-0.5" />
          )}
        </div>
        <Progress value={pct} className="h-2 bg-blue-100" />
        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {progress.rows.map((row) => (
            <div key={row.locationId} className="flex items-start gap-2 text-xs">
              {row.status === "syncing" ? (
                <Loader2 className="size-3.5 shrink-0 text-blue-600 animate-spin mt-0.5" />
              ) : row.status === "done" ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-green-600 mt-0.5" />
              ) : row.status === "error" ? (
                <AlertTriangle className="size-3.5 shrink-0 text-amber-600 mt-0.5" />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/30 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <span className={cn(
                  "font-medium",
                  row.status === "syncing" && "text-blue-800",
                  row.status === "done" && "text-foreground",
                  row.status === "error" && "text-amber-800",
                  row.status === "pending" && "text-muted-foreground",
                )}>
                  {row.name}
                </span>
                {row.status === "done" && row.synced > 0 && (
                  <span className="text-muted-foreground ml-1.5">· {row.synced} imported</span>
                )}
                {row.status === "done" && row.synced === 0 && (
                  <span className="text-muted-foreground ml-1.5">· no new products</span>
                )}
                {row.error && (
                  <p className="text-[10px] text-amber-700 line-clamp-2 mt-0.5">{cleanSyncError(row.error)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductCard({
  product,
  onDelete,
  onEdit,
}: {
  product: ProductEntry;
  onDelete: (id: string) => void;
  onEdit: (product: ProductEntry) => void;
}) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="font-medium text-sm line-clamp-2">{product.name}</div>
        <div className="text-[11px] text-muted-foreground line-clamp-1">{product.locationName}</div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-[10px]">{product.category}</Badge>
          <span className="text-sm font-semibold tabular-nums">
            {product.price ? `₹${product.price.toLocaleString("en-IN")}` : "—"}
          </span>
        </div>
        <div className="flex gap-1 pt-1">
          <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => onEdit(product)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-500" onClick={() => onDelete(product.id)}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BulkProductTab({ onNavigateToPost }: { onNavigateToPost?: (type?: string) => void }) {
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [productLayout, setProductLayout] = useState<LayoutMode>("list");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductEntry | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", price: "", category: "", imageUrl: "", landingUrl: "" });
  const [newProduct, setNewProduct] = useState({ locationId: "", name: "", description: "", price: "", category: "", imageUrl: "" });
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { data: locations } = useLocations();

  const { data: googleIntegration } = useQuery<{
    googleConnected?: boolean;
    profiles?: Array<{ locationId: string; locationName: string; profileName: string }>;
  }>({
    queryKey: ["google-integration"],
    queryFn: () => api("/api/google-integration"),
    staleTime: 60_000,
  });

  const productsQueryKey = useMemo(
    () => ["products", selectedLocationIds.join(",") || "all"],
    [selectedLocationIds],
  );

  const productsApiUrl = useMemo(() => {
    if (selectedLocationIds.length === 0) return "/api/products?limit=500";
    return `/api/products?limit=500&locationIds=${selectedLocationIds.join(",")}`;
  }, [selectedLocationIds]);

  const { data: apiProducts } = useQuery<any[]>({
    queryKey: productsQueryKey,
    queryFn: () => api(productsApiUrl),
  });

  const selectedListingLabel = useMemo(() => {
    if (selectedLocationIds.length === 0) return "All listings";
    if (selectedLocationIds.length === 1) {
      return locations?.find((l) => l.id === selectedLocationIds[0])?.name ?? "1 listing";
    }
    return `${selectedLocationIds.length} listings selected`;
  }, [selectedLocationIds, locations]);

  const scopedLocationCount = useMemo(() => {
    if (selectedLocationIds.length === 0) return locations?.length ?? 0;
    return selectedLocationIds.length;
  }, [selectedLocationIds, locations]);

  async function handleAddProduct() {
    if (!newProduct.locationId || !newProduct.name) {
      toast.error("Location and product name are required");
      return;
    }
    setSaving(true);
    try {
      await api("/api/products", { method: "POST", body: JSON.stringify(newProduct) });
      toast.success("Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      setAddDialogOpen(false);
      setNewProduct({ locationId: "", name: "", description: "", price: "", category: "", imageUrl: "" });
    } catch (e: any) {
      toast.error(e.message || "Failed to add product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct(id: string) {
    try {
      await api(`/api/products?id=${id}`, { method: "DELETE" });
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  function openEditProduct(product: ProductEntry) {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      description: product.description || "",
      price: product.price != null ? String(product.price) : "",
      category: product.category || "",
      imageUrl: product.image || "",
      landingUrl: product.landingUrl || "",
    });
    setEditDialogOpen(true);
  }

  async function handleSaveProduct() {
    if (!editingProduct) return;
    setSaving(true);
    try {
      const res = await api<{
        googleSynced?: boolean;
        googleSyncError?: string;
      }>(`/api/products/${editingProduct.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          category: editForm.category || null,
          price: editForm.price ? parseFloat(editForm.price) : null,
          imageUrl: editForm.imageUrl || null,
          landingUrl: editForm.landingUrl || null,
        }),
      });
      if (res.googleSynced) {
        toast.success("Product saved and published to Google");
      } else if (res.googleSyncError) {
        toast.warning(`Saved in MyFNG. Google publish pending — ${res.googleSyncError}`, { duration: 9000 });
      } else {
        toast.success("Product saved");
      }
      setEditDialogOpen(false);
      setEditingProduct(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ProductSyncProgressState | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSyncProducts() {
    const profiles = googleIntegration?.profiles ?? [];
    const targets = selectedLocationIds.length > 0
      ? profiles.filter((p) => selectedLocationIds.includes(p.locationId))
      : profiles;

    if (targets.length === 0) {
      toast.error("No Google-linked listings to sync. Go to More → Google → Connect first.");
      return;
    }

    setSyncing(true);
    setSyncProgress({
      active: true,
      currentIndex: 0,
      total: targets.length,
      rows: targets.map((p) => ({
        locationId: p.locationId,
        name: p.locationName || p.profileName,
        status: "pending" as const,
        synced: 0,
      })),
    });

    let totalSynced = 0;
    const errors: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setSyncProgress((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: i,
              rows: prev.rows.map((r, idx) =>
                idx === i ? { ...r, status: "syncing" } : r,
              ),
            }
          : prev,
      );

      try {
        const res = await api<{
          synced: number;
          fromCatalog: number;
          fromPosts: number;
          errors: string[];
        }>("/api/products/sync", {
          method: "POST",
          body: JSON.stringify({ locationIds: [target.locationId] }),
        });

        totalSynced += res.synced ?? 0;
        const err = res.errors?.[0];
        if (err) errors.push(err);

        setSyncProgress((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r, idx) =>
                  idx === i
                    ? {
                        ...r,
                        status: err && (res.synced ?? 0) === 0 ? "error" : "done",
                        synced: res.synced ?? 0,
                        error: err ? cleanSyncError(err) : undefined,
                      }
                    : r,
                ),
              }
            : prev,
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Sync failed";
        errors.push(message);
        setSyncProgress((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r, idx) =>
                  idx === i ? { ...r, status: "error", error: message } : r,
                ),
              }
            : prev,
        );
      }

      await qc.invalidateQueries({ queryKey: ["products"] });
    }

    setSyncProgress((prev) => (prev ? { ...prev, active: false, currentIndex: targets.length } : prev));
    setSyncing(false);

    if (totalSynced > 0) {
      toast.success(`Imported ${totalSynced} product(s) from ${targets.length} listing(s)`);
    } else if (errors[0]) {
      toast.info(cleanSyncError(errors[0]), { duration: 10000 });
    } else {
      toast.info("Refresh finished — no new products found. Your existing products are still in the list.");
    }

    window.setTimeout(() => setSyncProgress(null), 12000);
  }

  async function handleImportCsv(file: File) {
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/products/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Import failed");
      toast.success(`Imported ${json.data?.imported ?? 0} products`);
      if (json.data?.errors?.length) {
        toast.warning(`${json.data.errors.length} row(s) skipped — check format`);
      }
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function downloadCsvTemplate() {
    const template =
      "locationName,name,category,description,price,currency,imageUrl\n" +
      "My FNG - Multi Brand Car Garage & Repairs at Majiwada, Thane West,Left Fender Paint,Denting & Painting Service,Professional denting and painting,,INR,\n" +
      "My FNG - Multi Brand Car Garage & Repairs at Majiwada, Thane West,3M Wax Polishing,Car Detailing Service,Premium wax polish,,INR,\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gmb-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const products: ProductEntry[] = useMemo(() => {
    if (!apiProducts) return [];
    return apiProducts.map((p: any) => ({
      id: p.id,
      locationId: p.locationId,
      locationName: p.locationName || "Unknown",
      image: p.imageUrl || null,
      name: p.name,
      description: p.description || null,
      category: p.category || "Uncategorized",
      price: p.price,
      landingUrl: p.landingUrl || null,
      googleEditId: p.googleEditId || null,
      special: false,
      listings: 1,
    }));
  }, [apiProducts]);

  const productsByLocation = useMemo(() => {
    const map = new Map<string, ProductEntry[]>();
    for (const p of products) {
      const key = p.locationId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase())) return false;
      return true;
    });
  }, [products, categoryFilter, productSearch]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);

  const postCards: { icon: LucideIcon; title: string; description: string; color: string; postType?: string }[] = [
    { icon: Megaphone, title: "Post Updates", description: "Create new what's new posts across listings", color: "text-blue-600 bg-blue-100", postType: "whats_new" },
    { icon: Gift, title: "Offers & Deals", description: "Publish promotional offers to all profiles", color: "text-purple-600 bg-purple-100", postType: "offer" },
    { icon: Calendar, title: "Event Updates", description: "Schedule event posts for upcoming occasions", color: "text-amber-600 bg-amber-100", postType: "event" },
    { icon: ArrowRightLeft, title: "Product to Post", description: "Convert products into Google Posts automatically", color: "text-emerald-600 bg-emerald-100" },
  ];

  const addCards: { icon: LucideIcon; title: string; description: string; color: string }[] = [
    { icon: Plus, title: "Add Products", description: "Bulk add products across multiple listings", color: "text-blue-600 bg-blue-100" },
    { icon: ShoppingBag, title: "Add Inventory", description: "Update product stock & availability", color: "text-teal-600 bg-teal-100" },
    { icon: Wrench, title: "Add Services", description: "Add or update services across listings", color: "text-violet-600 bg-violet-100" },
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* Location scope bar */}
      <div className="rounded-xl border bg-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg font-semibold">Products by listing</h2>
          <p className="text-xs text-muted-foreground truncate">
            Viewing: <span className="font-medium text-foreground">{selectedListingLabel}</span>
            {" · "}
            {scopedLocationCount} listing{scopedLocationCount !== 1 ? "s" : ""}
          </p>
        </div>
        <LocationMultiSelect
          locations={locations}
          selectedIds={selectedLocationIds}
          onChange={setSelectedLocationIds}
          className="min-w-[200px] max-w-xs"
        />
      </div>

      {/* Create & Update Posts section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Create & Update Posts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {postCards.map((card) => (
            <ActionCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              description={card.description}
              color={card.color}
              onClick={() => onNavigateToPost?.(card.postType)}
            />
          ))}
        </div>
      </div>

      {/* Products */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Products & Services</h2>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleSyncProducts} disabled={syncing || importing}>
              <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
              {syncing && syncProgress
                ? `Refreshing ${Math.min(syncProgress.currentIndex + 1, syncProgress.total)}/${syncProgress.total}…`
                : syncing
                  ? "Refreshing..."
                  : "Refresh from Google"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={importing || syncing}>
              <Upload className={cn("size-3", importing && "animate-pulse")} />
              {importing ? "Importing..." : "Import CSV"}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={downloadCsvTemplate}>
              <Download className="size-3" />
              Template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportCsv(file);
              }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-8 h-8 w-48 text-sm"
                disabled={syncing}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={syncing}>
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <LayoutToggle value={productLayout} onChange={setProductLayout} />
          </div>
        </div>

        {syncProgress && <ProductSyncProgressPanel progress={syncProgress} />}

        <div className="flex gap-4">
          <Card className="flex-1">
            <CardContent className={productLayout === "grid" ? "p-4" : "p-0"}>
              {filteredProducts.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  No products found{selectedLocationIds.length ? " for selected listings" : ""}
                </div>
              ) : productLayout === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onDelete={handleDeleteProduct}
                      onEdit={openEditProduct}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Image</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product Details</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Listing</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Special</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Listings</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLocationIds.length === 0 && productsByLocation.size > 1 ? (
                        [...productsByLocation.entries()].map(([locId, locProducts]) => {
                          const locName = locProducts[0]?.locationName || locId;
                          const visible = locProducts.filter((p) => {
                            if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
                            if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase())) return false;
                            return true;
                          });
                          if (visible.length === 0) return null;
                          return (
                            <Fragment key={locId}>
                              <tr className="bg-muted/30">
                                <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {locName} ({visible.length})
                                </td>
                              </tr>
                              {visible.map((product) => (
                                <ProductRow key={product.id} product={product} onDelete={handleDeleteProduct} onEdit={openEditProduct} />
                              ))}
                            </Fragment>
                          );
                        })
                      ) : (
                        filteredProducts.map((product) => (
                          <ProductRow key={product.id} product={product} onDelete={handleDeleteProduct} onEdit={openEditProduct} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Stats Sidebar */}
          <div className="hidden lg:block w-64 shrink-0 space-y-3">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="text-sm font-semibold">Product Stats</h4>
                <div className="space-y-2">
                  <StatRow label="Total Products" value={filteredProducts.length} />
                  <StatRow label="Categories" value={categories.length} />
                  <StatRow label="With Pricing" value={filteredProducts.filter((p) => p.price).length} />
                  <StatRow label="Special Items" value={filteredProducts.filter((p) => p.special).length} />
                  <StatRow label="Listings" value={selectedLocationIds.length || productsByLocation.size || scopedLocationCount} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <h4 className="text-sm font-semibold">Category Breakdown</h4>
                {categories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{cat}</span>
                    <span className="font-medium tabular-nums">
                      {filteredProducts.filter((p) => p.category === cat).length}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Products section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Add Products</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ActionCard
            icon={Plus}
            title="Add Products"
            description="Add products to your business listings"
            color="text-blue-600 bg-blue-100"
            onClick={() => setAddDialogOpen(true)}
          />
          {addCards.slice(1).map((card) => (
            <ActionCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              description={card.description}
              color={card.color}
            />
          ))}
        </div>
      </div>

      {/* Add Product Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Add a product to your business listing</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Location *</label>
              <Select value={newProduct.locationId} onValueChange={(v) => setNewProduct({ ...newProduct, locationId: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {(locations ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name} — {l.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Product Name *</label>
              <Input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="e.g. Full Car Service" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Description</label>
              <Textarea value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} placeholder="Describe the product or service..." className="text-sm min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Price (₹)</label>
                <Input type="number" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="0" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Category</label>
                <Input value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} placeholder="e.g. Services" className="h-9 text-sm" />
              </div>
            </div>
            <Button className="w-full" onClick={handleAddProduct} disabled={saving}>
              {saving ? "Adding..." : "Add Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product Details</DialogTitle>
            <DialogDescription>
              Changes save in MyFNG and publish to Google in the background.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Product Name *</label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Category</label>
                <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Product Price (INR)</label>
                <Input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} placeholder="1800" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Description</label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="text-sm min-h-[140px]"
                  placeholder="Service description shown on Google..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">{editForm.description.length} characters</p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Product URL (optional)</label>
                <Input value={editForm.landingUrl} onChange={(e) => setEditForm({ ...editForm, landingUrl: e.target.value })} placeholder="https://myfng.in/..." className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium block">Product Image</label>
              {editForm.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editForm.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full aspect-square rounded-lg object-cover bg-muted border" />
              ) : (
                <div className="w-full aspect-square rounded-lg bg-muted border flex items-center justify-center">
                  <Package className="size-8 text-muted-foreground" />
                </div>
              )}
              <Input value={editForm.imageUrl} onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })} placeholder="Image URL" className="h-8 text-xs" />
            </div>
          </div>
          <Button className="w-full mt-2" onClick={handleSaveProduct} disabled={saving || !editForm.name.trim()}>
            {saving ? "Saving & publishing..." : "Save Product"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared Sub-components ────────────────────────────────────────────────────

function ProfileProtectionPanel({
  data,
  totalLocations,
  onManage,
}: {
  data: FieldStat;
  totalLocations: number;
  onManage: () => void;
}) {
  const protectedCount = Math.max(0, totalLocations - data.missing);
  const pct = totalLocations > 0 ? Math.round((protectedCount / totalLocations) * 100) : 0;
  const allProtected = data.missing === 0;
  const theme = STAT_ACCENT_STYLES.cyan;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 shadow-sm",
        "bg-gradient-to-r",
        theme.gradient,
      )}
    >
      <div className="absolute top-0 right-0 size-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 size-32 rounded-full bg-cyan-400/10 blur-2xl pointer-events-none" />

      <div className="relative p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div
            className={cn(
              "size-14 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md",
              theme.iconBg,
            )}
          >
            <Shield className="size-7" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                Profile Protection
              </h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-medium",
                  allProtected
                    ? "text-green-700 border-green-200 bg-green-50"
                    : "text-amber-700 border-amber-200 bg-amber-50",
                )}
              >
                {allProtected ? "All Locked" : "Action Required"}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl">
              Prevent unauthorized edits to your Google Business Profile. Lock critical fields
              like name, address, phone & categories across all listings.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 lg:gap-5 shrink-0">
          <div className="flex items-center gap-5 sm:gap-6 px-5 py-3.5 rounded-xl bg-card/90 border border-border/60 shadow-sm backdrop-blur-sm">
            <div className="text-center min-w-[52px]">
              <p className="text-2xl font-bold tabular-nums text-green-600">{protectedCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Protected</p>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="text-center min-w-[52px]">
              <p className={cn("text-2xl font-bold tabular-nums", data.missing > 0 ? "text-red-600" : "text-muted-foreground")}>
                {data.missing}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Unprotected</p>
            </div>
            <div className="h-10 w-px bg-border hidden sm:block" />
            <div className="text-center min-w-[52px] hidden sm:block">
              <p className="text-2xl font-bold tabular-nums text-primary">{pct}%</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Coverage</p>
            </div>
          </div>

          <Button type="button" onClick={onManage} className="h-11 px-6 font-semibold shadow-sm shrink-0">
            <Lock className="size-4 mr-2" />
            Manage Profile Lock
          </Button>
        </div>
      </div>

      {!allProtected && data.missing > 0 && (
        <div className="relative mx-5 sm:mx-6 mb-5 sm:mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            {data.missing} of {totalLocations} profiles are not protected — review and enable lock.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  data,
  totalLocations,
  singleListing = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  data: FieldStat;
  totalLocations: number;
  singleListing?: boolean;
  onClick: () => void;
}) {
  const isMissing = data.missing > 0;
  const completeCount = Math.max(0, totalLocations - data.missing);
  const strengthPct = totalLocations > 0 ? Math.round((completeCount / totalLocations) * 100) : 100;
  const avgLabel =
    data.avgWords != null
      ? singleListing
        ? `${data.avgWords} words`
        : `${data.avgWords} Avg. Words`
      : data.avgCount != null
        ? singleListing
          ? data.avgCount === 0
            ? null
            : `${data.avgCount} on profile`
          : `${data.avgCount} Avg.`
        : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 flex flex-col items-center text-center gap-1.5 min-h-[104px] justify-center w-full transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isMissing
          ? "border-red-200 bg-red-50/90 hover:bg-red-50 hover:border-red-300 hover:shadow-md"
          : "border-green-200 bg-green-50/90 hover:bg-green-50 hover:border-green-300 hover:shadow-md",
      )}
    >
      <Icon className={cn("size-4", isMissing ? "text-red-600" : "text-green-600")} />
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
      {isMissing ? (
        <>
          <span className="inline-flex items-center gap-1 text-[11px] text-red-700 font-bold tabular-nums">
            <AlertTriangle className="size-3 shrink-0" />
            {singleListing ? "Missing" : `${data.missing} Missing`}
          </span>
          {!singleListing && (
            <span className="text-[10px] text-red-600/80 tabular-nums">
              {completeCount}/{totalLocations} profiles OK
            </span>
          )}
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1 text-[11px] text-green-700 font-semibold">
            <CheckCircle2 className="size-3 shrink-0" />
            {singleListing ? "Complete" : "All Complete"}
          </span>
          {!singleListing && (
            <span className="text-[10px] text-green-600/80 tabular-nums">
              {totalLocations}/{totalLocations} profiles · {strengthPct}%
            </span>
          )}
        </>
      )}
      {avgLabel && !isMissing && (
        <span className="text-[10px] text-muted-foreground tabular-nums">{avgLabel}</span>
      )}
    </button>
  );
}

function UpdateCardSection({
  title,
  cards,
  onCardClick,
}: {
  title: string;
  cards: import("@/lib/content-update-fields").BulkUpdateCard[];
  onCardClick: (fieldKey: ContentFieldKey) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = FIELD_ICON_MAP[card.fieldKey];
          return (
            <Card
              key={card.title}
              className={cn(
                "transition-shadow",
                card.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:shadow-md cursor-pointer",
              )}
              onClick={() => !card.disabled && onCardClick(card.fieldKey)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium leading-tight">{card.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                      {card.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-[10px]", RISK_COLORS[card.risk])}>
                    Risk: {RISK_LABELS[card.risk]}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px]", IMPACT_COLORS[card.impact])}>
                    Ranking Impact: {IMPACT_LABELS[card.impact]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  color,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group" onClick={onClick}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn("size-10 rounded-lg flex items-center justify-center shrink-0", color)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">{title}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
