"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { useLocations } from "@/hooks/use-locations";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { LayoutToggle, type LayoutMode } from "@/components/shared/layout-toggle";
import { NumberedPagination } from "@/components/shared/numbered-pagination";
import { PostStatusBadge } from "@/components/shared/badges";
import { appendLocationIdsToParams } from "@/lib/location-filter";
import {
  DurationFilter,
  type DurationValue,
  type DurationCustomRange,
} from "@/components/shared/duration-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  FileText, Newspaper, Tag, CalendarDays, Info, Plus, MoreVertical,
  Send, CalendarClock, Pencil, Trash2, Sparkles, ArrowRight, CheckCircle2,
  Clock, Wand2, ExternalLink, MapPin, Loader2, Search,
  Phone, Globe, Mail, CalendarCheck, Eye,
  Archive, BarChart3, X, AlertTriangle, Megaphone, Layers, TrendingUp,
  CheckCheck, List as ListIcon, Calendar as CalendarIcon, Inbox, Repeat,
} from "lucide-react";
import { PostsCalendar } from "@/components/views/posts-calendar";
import { PublishingQueue } from "@/components/views/posts-queue";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import type { PostWithLocation, PostType } from "@/lib/types";
import {
  computeNextWeeklyOccurrence,
  formatWeeklyRecurrence,
  WEEKDAY_OPTIONS,
} from "@/lib/post-recurrence";

/* ---------- Static metadata ---------- */

type StatusFilter = "all" | "published" | "scheduled" | "draft";
type TypeFilter = "all" | PostType;
type PostSort = "newest" | "oldest" | "location" | "type";
type PublishMode = "single" | "multiple" | "all";

const POSTS_PER_PAGE = 15;
type AiTone = "professional" | "friendly" | "promotional" | "informative" | "urgent";

interface TypeMeta {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tint: string;
  chartColor: string;
}

const TYPE_META: Record<PostType, TypeMeta> = {
  whats_new: { icon: Newspaper,    label: "What's New", tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", chartColor: "var(--chart-1)" },
  offer:     { icon: Tag,          label: "Offer",      tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400",      chartColor: "var(--chart-2)" },
  event:     { icon: CalendarDays, label: "Event",      tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400",        chartColor: "var(--chart-3)" },
  update:    { icon: Newspaper,    label: "Update",     tint: "bg-slate-500/10 text-slate-600 dark:text-slate-300",     chartColor: "var(--chart-4)" },
};

interface CtaMeta {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
}

const CTA_OPTIONS: CtaMeta[] = [
  { value: "none",           label: "None",           icon: X,             tint: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  { value: "book",           label: "Book",           icon: CalendarCheck, tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { value: "order",          label: "Order online",   icon: Globe,         tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "shop",           label: "Buy",            icon: Tag,           tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "learn_more",     label: "Learn more",     icon: ArrowRight,    tint: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  { value: "sign_up",        label: "Sign up",        icon: Mail,          tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { value: "call",           label: "Call now",        icon: Phone,         tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
];

const CTA_LABEL: Record<string, string> = Object.fromEntries(
  CTA_OPTIONS.map((c) => [c.value, c.label]),
);
const CTA_META_BY_VALUE: Record<string, CtaMeta> = Object.fromEntries(
  CTA_OPTIONS.map((c) => [c.value, c]),
);

const TONE_OPTIONS: { value: AiTone; label: string; hint: string }[] = [
  { value: "professional", label: "Professional", hint: "Polished, business-like tone" },
  { value: "friendly",     label: "Friendly",     hint: "Warm, approachable, conversational" },
  { value: "promotional",  label: "Promotional",  hint: "Sales-driven, urgency to act now" },
  { value: "informative",  label: "Informative",  hint: "Factual, clear, educational" },
  { value: "urgent",       label: "Urgent",       hint: "Time-sensitive, limited-time framing" },
];

interface PostsStats {
  total: number;
  drafts: number;
  scheduled: number;
  published: number;
  failed: number;
  todayPublished: number;
  aiDrafts: number;
  successRate: number;
  upcoming: { id: string; title: string; content?: string; type: PostType; locationName: string; locationCity: string; scheduledAt: string | null }[];
  typeDistribution: { type: PostType; count: number }[];
  topPerforming: { id: string; title: string; content?: string; type: PostType; locationName: string; locationCity: string; publishedAt: string | null }[];
  byLocation: { locationId: string; locationName: string; city: string; count: number }[];
}

/* ---------- Helpers ---------- */

function postTypeLabel(t: string): string {
  return TYPE_META[t as PostType]?.label ?? t;
}

function postTypeMeta(t: string): TypeMeta {
  return TYPE_META[t as PostType] ?? TYPE_META.whats_new;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return null;
  }
}

function scheduleLabel(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
    if (isTomorrow(d)) return `Tomorrow, ${format(d, "h:mm a")}`;
    return format(d, "d MMM yyyy, h:mm a");
  } catch {
    return "";
  }
}

function fullDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "d MMM yyyy, h:mm a");
  } catch {
    return "";
  }
}

function applyPostClientFilters(
  list: PostWithLocation[],
  typeFilter: TypeFilter,
  search: string,
): PostWithLocation[] {
  let result = list;
  if (typeFilter !== "all") result = result.filter((p) => p.type === typeFilter);
  const q = search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.locationName.toLowerCase().includes(q),
    );
  }
  return result;
}

function sortPosts(list: PostWithLocation[], sort: PostSort): PostWithLocation[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "location":
        return a.locationName.localeCompare(b.locationName);
      case "type":
        return a.type.localeCompare(b.type);
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

/* ---------- Main view ---------- */

export function PostsView() {
  const user = useUser();
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const qc = useQueryClient();
  const { data: locations } = useLocations();

  const canManage = can(user.role, "posts.manage");

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<PostSort>("newest");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingPost, setEditingPost] = React.useState<PostWithLocation | null>(null);
  const [deletingPost, setDeletingPost] = React.useState<PostWithLocation | null>(null);
  const [showAnalytics, setShowAnalytics] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<"list" | "calendar" | "queue" | "history">("list");
  const [displayLayout, setDisplayLayout] = React.useState<LayoutMode>("grid");
  const [page, setPage] = React.useState(0);
  const [presetScheduledAt, setPresetScheduledAt] = React.useState<Date | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkScheduleOpen, setBulkScheduleOpen] = React.useState(false);
  const [bulkScheduleDate, setBulkScheduleDate] = React.useState<Date | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const params = new URLSearchParams();
  appendLocationIdsToParams(params, selectedLocationIds);
  if (statusFilter !== "all") params.set("status", statusFilter);
  params.set("limit", "500");

  const { data: posts, isLoading } = useQuery<PostWithLocation[]>({
    queryKey: ["posts", selectedLocationIds, statusFilter],
    queryFn: () => api<PostWithLocation[]>(`/api/posts?${params.toString()}`),
  });

  const allPosts = posts ?? [];

  const statsParams = new URLSearchParams();
  appendLocationIdsToParams(statsParams, selectedLocationIds);
  const { data: postsStats, isLoading: statsLoading } = useQuery<PostsStats>({
    queryKey: ["posts-stats", selectedLocationIds],
    queryFn: () => api<PostsStats>(`/api/posts/stats?${statsParams.toString()}`),
  });

  // Local computed stats fallback (used by filter tab count)
  const { data: allPostsData } = useQuery<PostWithLocation[]>({
    queryKey: ["posts", selectedLocationIds, "all"],
    queryFn: () => {
      const p = new URLSearchParams();
      appendLocationIdsToParams(p, selectedLocationIds);
      p.set("limit", "500");
      return api<PostWithLocation[]>(`/api/posts?${p.toString()}`);
    },
  });
  const statsSource = allPostsData ?? allPosts;

  const localStats = React.useMemo(() => {
    const published = statsSource.filter((p) => p.status === "published").length;
    const scheduled = statsSource.filter((p) => p.status === "scheduled").length;
    const drafts = statsSource.filter((p) => p.status === "draft").length;
    const aiGenerated = statsSource.filter((p) => p.source === "ai").length;
    return { published, scheduled, drafts, aiGenerated };
  }, [statsSource]);

  const filtered = React.useMemo(() => {
    const list = applyPostClientFilters(allPosts, typeFilter, search);
    return sortPosts(list, sort);
  }, [allPosts, typeFilter, search, sort]);

  React.useEffect(() => {
    setPage(0);
  }, [statusFilter, typeFilter, selectedLocationIds, displayLayout, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);

  React.useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const pagedPosts = React.useMemo(
    () => filtered.slice(currentPage * POSTS_PER_PAGE, (currentPage + 1) * POSTS_PER_PAGE),
    [filtered, currentPage],
  );

  // Posts for calendar view (scheduled + published, with optional type filter)
  const calendarPosts = React.useMemo(() => {
    let list = (allPostsData ?? []).filter(
      (p) => p.status === "scheduled" || p.status === "published",
    );
    list = applyPostClientFilters(list, typeFilter, search);
    return sortPosts(list, sort);
  }, [allPostsData, typeFilter, search, sort]);

  // Posts for queue view (scheduled + failed)
  const queuePosts = React.useMemo(() => {
    let list = (allPostsData ?? []).filter(
      (p) => p.status === "scheduled" || p.status === "failed",
    );
    list = applyPostClientFilters(list, typeFilter, search);
    return sortPosts(list, sort);
  }, [allPostsData, typeFilter, search, sort]);

  const historyPosts = React.useMemo(() => {
    let list = (allPostsData ?? allPosts).filter((p) => p.status === "published");
    list = applyPostClientFilters(list, typeFilter, search);
    return sortPosts(list, sort);
  }, [allPostsData, allPosts, typeFilter, search, sort]);

  // Stable per-location color dots (used when "All locations" is selected)
  const locationColorMap = React.useMemo(() => {
    const palette = [
      "bg-emerald-500", "bg-amber-500", "bg-teal-500", "bg-rose-500",
      "bg-violet-500", "bg-cyan-500", "bg-orange-500", "bg-lime-500",
      "bg-fuchsia-500", "bg-sky-500", "bg-pink-500", "bg-yellow-500",
    ];
    const map = new Map<string, string>();
    (locations ?? []).forEach((l, i) => {
      map.set(l.id, palette[i % palette.length]);
    });
    return map;
  }, [locations]);

  const showLocationDots = selectedLocationIds.length !== 1;

  const [presetType, setPresetType] = React.useState<string | undefined>(undefined);

  function openCreate() {
    setEditingPost(null);
    setPresetScheduledAt(null);
    setPresetType(undefined);
    setEditorOpen(true);
  }
  function openCreateWithType(type: string) {
    setEditingPost(null);
    setPresetScheduledAt(null);
    setPresetType(type);
    setEditorOpen(true);
  }
  function openCreateWithDate(date: Date) {
    setEditingPost(null);
    setPresetScheduledAt(date);
    setEditorOpen(true);
  }
  function openEdit(p: PostWithLocation) {
    setEditingPost(p);
    setPresetScheduledAt(null);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditingPost(null);
    setPresetScheduledAt(null);
    setPresetType(undefined);
  }

  async function publishNow(p: PostWithLocation) {
    try {
      toast.loading("Publishing to Google…", { id: `pub-${p.id}` });
      await api(`/api/posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success("Post published to Google Business Profile", { id: `pub-${p.id}` });
    } catch (e: any) {
      toast.error(e?.message || "Failed to publish", { id: `pub-${p.id}` });
    }
  }

  async function deletePost(p: PostWithLocation) {
    try {
      toast.loading("Deleting post…", { id: `del-${p.id}` });
      await api(`/api/posts/${p.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success("Post deleted", { id: `del-${p.id}` });
      setDeletingPost(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete", { id: `del-${p.id}` });
    }
  }

  function handleSaved() {
    // Force immediate refetch (not just invalidation) so calendar/list/queue
    // update instantly after save. invalidateQueries marks stale but the
    // refetch might not fire immediately if staleTime hasn't elapsed.
    qc.refetchQueries({ queryKey: ["posts"] });
    qc.refetchQueries({ queryKey: ["posts-stats"] });
    closeEditor();
  }

  /* ---- Bulk operations ---- */

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = pagedPosts.map((p) => p.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkPublish() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    try {
      toast.loading(`Publishing ${ids.length} posts…`, { id: "bulk-pub" });
      const r = await api<{ updated: number }>(`/api/posts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "publish", postIds: ids }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success(`Published ${r.updated} posts`, { id: "bulk-pub" });
      clearSelection();
    } catch (e: any) {
      toast.error(e?.message || "Bulk publish failed", { id: "bulk-pub" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkScheduleApply() {
    if (!bulkScheduleDate || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    try {
      toast.loading(`Scheduling ${ids.length} posts…`, { id: "bulk-sch" });
      const r = await api<{ updated: number }>(`/api/posts/bulk`, {
        method: "POST",
        body: JSON.stringify({
          action: "schedule",
          postIds: ids,
          scheduledAt: bulkScheduleDate.toISOString(),
        }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success(`Scheduled ${r.updated} posts for ${scheduleLabel(bulkScheduleDate.toISOString())}`, { id: "bulk-sch" });
      setBulkScheduleOpen(false);
      setBulkScheduleDate(null);
      clearSelection();
    } catch (e: any) {
      toast.error(e?.message || "Bulk schedule failed", { id: "bulk-sch" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkArchive() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    try {
      toast.loading(`Archiving ${ids.length} posts…`, { id: "bulk-arc" });
      const r = await api<{ updated: number }>(`/api/posts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "archive", postIds: ids }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success(`Archived ${r.updated} posts`, { id: "bulk-arc" });
      clearSelection();
    } catch (e: any) {
      toast.error(e?.message || "Bulk archive failed", { id: "bulk-arc" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    try {
      toast.loading(`Deleting ${ids.length} post(s)…`, { id: "bulk-del" });
      const r = await api<{ deleted: number }>(`/api/posts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "delete", postIds: ids }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success(`Deleted ${r.deleted} post(s)`, { id: "bulk-del" });
      clearSelection();
    } catch (e: any) {
      toast.error(e?.message || "Bulk delete failed", { id: "bulk-del" });
    } finally {
      setBulkBusy(false);
    }
  }

  const selectedCount = selectedIds.size;
  const selectedDraftsCount = filtered.filter(
    (p) => selectedIds.has(p.id) && p.status === "draft",
  ).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Google Posts"
        description="Create, schedule & publish posts to Google Business Profile"
        icon={FileText}
        actions={
          <>
            <Button
              size="sm"
              variant={showAnalytics ? "default" : "outline"}
              onClick={() => setShowAnalytics((v) => !v)}
            >
              <BarChart3 className="size-3.5 mr-1.5" />
              Analytics
            </Button>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-3.5 mr-1.5" /> New post
              </Button>
            )}
          </>
        }
      />

      {/* Analytics Dashboard (toggleable) */}
      {showAnalytics && (
        <AnalyticsDashboard stats={postsStats} isLoading={statsLoading} />
      )}

      {/* Compact stat row (always visible) */}
      {!showAnalytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          ) : (
            <>
              <StatCard label="Published"    value={localStats.published}   icon={CheckCircle2} accent="emerald" hint="Live on Google" />
              <StatCard label="Scheduled"    value={localStats.scheduled}   icon={CalendarClock} accent="amber"   hint="Queued for later" />
              <StatCard label="Drafts"       value={localStats.drafts}      icon={FileText}     accent="slate"   hint="Not yet published" />
              <StatCard label="AI-Generated" value={localStats.aiGenerated} icon={Sparkles}     accent="amber"   hint="By MiSA AI" />
            </>
          )}
        </div>
      )}

      {/* View mode + filter bar (locations-style) */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => { if (v) setViewMode(v as "list" | "calendar" | "queue" | "history"); }}
            variant="outline"
            size="default"
            aria-label="View mode"
            className="w-full sm:w-auto overflow-x-auto"
          >
            <ToggleGroupItem value="list" aria-label="Posts browser" className="shrink-0 px-4 gap-2 h-9">
              <ListIcon className="size-3.5 shrink-0" />
              <span className="text-xs">Browse</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" aria-label="Calendar view" className="shrink-0 px-4 gap-2 h-9">
              <CalendarIcon className="size-3.5 shrink-0" />
              <span className="text-xs">Calendar</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="queue" aria-label="Publishing queue" className="shrink-0 px-4 gap-2 h-9">
              <Inbox className="size-3.5 shrink-0" />
              <span className="text-xs">Queue</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="history" aria-label="Past history" className="shrink-0 px-4 gap-2 h-9">
              <Clock className="size-3.5 shrink-0" />
              <span className="text-xs">History</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1">
            <div className="flex flex-1 min-w-0 gap-2">
              <LocationMultiSelect
                locations={locations}
                selectedIds={selectedLocationIds}
                onChange={setSelectedLocationIds}
                className="w-full sm:w-[200px] shrink-0"
              />
              <div className="relative flex-1 min-w-0">
                <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Search by post title, content, or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Search posts"
                />
              </div>
            </div>

            {viewMode === "list" && (
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <TabsList className="w-full lg:w-auto">
                  <TabsTrigger value="all">
                    All
                    {statsSource.length > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                        {statsSource.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="published">Published</TabsTrigger>
                  <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                  <TabsTrigger value="draft">Drafts</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <SelectTrigger size="sm" className="w-full sm:w-[150px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="whats_new">What&apos;s New</SelectItem>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground hidden sm:inline">Sort by</span>
              <Select value={sort} onValueChange={(v) => setSort(v as PostSort)}>
                <SelectTrigger size="sm" className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="type">Post type</SelectItem>
                </SelectContent>
              </Select>
              {viewMode === "list" && (
                <LayoutToggle value={displayLayout} onChange={setDisplayLayout} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result count */}
      {viewMode === "list" && !isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between -mt-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {canManage && (
              <Checkbox
                checked={
                  pagedPosts.length > 0 &&
                  pagedPosts.every((p) => selectedIds.has(p.id))
                }
                onCheckedChange={toggleSelectAll}
                aria-label="Select all posts on this page"
              />
            )}
            <span>
              Showing{" "}
              <span className="font-medium text-foreground">
                {currentPage * POSTS_PER_PAGE + 1}–{Math.min((currentPage + 1) * POSTS_PER_PAGE, filtered.length)}
              </span>
              {" "}of{" "}
              <span className="font-medium text-foreground">{filtered.length}</span>
              {filtered.length !== statsSource.length && (
                <> (filtered from {statsSource.length})</>
              )}{" "}
              post{filtered.length === 1 ? "" : "s"}
              {selectedCount > 0 && (
                <span className="ml-1 text-primary font-medium">· {selectedCount} selected</span>
              )}
            </span>
          </div>
          {(search || typeFilter !== "all" || statusFilter !== "all" || selectedLocationIds.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setStatusFilter("all");
                setSelectedLocationIds([]);
                setSort("newest");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <>
          {/* Bulk action bar */}
          {canManage && selectedCount > 0 && (
            <BulkActionBar
              selectedCount={selectedCount}
              selectedDraftsCount={selectedDraftsCount}
              busy={bulkBusy}
              onPublish={bulkPublish}
              onSchedule={() => setBulkScheduleOpen(true)}
              onArchive={bulkArchive}
              onDelete={bulkDelete}
              onClear={clearSelection}
            />
          )}

          {/* Posts grid / list */}
          {isLoading ? (
            <PostsGridSkeleton layout={displayLayout} />
          ) : filtered.length === 0 ? (
            <EmptyState
              canManage={canManage}
              onCreate={openCreate}
              hasFilters={Boolean(search || typeFilter !== "all" || statusFilter !== "all" || selectedLocationIds.length > 0)}
              onClearFilters={() => {
                setSearch("");
                setTypeFilter("all");
                setStatusFilter("all");
                setSelectedLocationIds([]);
                setSort("newest");
              }}
            />
          ) : (
            <>
              {displayLayout === "list" ? (
                <div className="space-y-2 pb-2">
                  {pagedPosts.map((p) => (
                    <PostCard
                      key={p.id}
                      layout="list"
                      post={p}
                      canManage={canManage}
                      selected={selectedIds.has(p.id)}
                      onToggleSelect={toggleSelected}
                      onPublish={publishNow}
                      onEdit={openEdit}
                      onDelete={setDeletingPost}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-2">
                  {pagedPosts.map((p) => (
                    <PostCard
                      key={p.id}
                      layout="grid"
                      post={p}
                      canManage={canManage}
                      selected={selectedIds.has(p.id)}
                      onToggleSelect={toggleSelected}
                      onPublish={publishNow}
                      onEdit={openEdit}
                      onDelete={setDeletingPost}
                    />
                  ))}
                </div>
              )}

              <NumberedPagination
                page={currentPage}
                totalPages={totalPages}
                totalItems={filtered.length}
                perPage={POSTS_PER_PAGE}
                onPageChange={setPage}
                itemLabel="posts"
              />
            </>
          )}
        </>
      )}

      {/* Calendar view */}
      {viewMode === "calendar" && (
        <PostsCalendar
          posts={calendarPosts}
          isLoading={isLoading || !allPostsData}
          showLocationDots={showLocationDots}
          locationColorByLocationId={(id) => locationColorMap.get(id)}
          onPostClick={openEdit}
          onNewPostOnDate={openCreateWithDate}
        />
      )}

      {/* Publishing queue view */}
      {viewMode === "queue" && (
        <PublishingQueue
          posts={queuePosts}
          isLoading={isLoading || !allPostsData}
          canManage={canManage}
          onEdit={openEdit}
          onClick={openEdit}
        />
      )}

      {/* Past History view */}
      {viewMode === "history" && (
        <PastHistoryTable
          posts={historyPosts}
          isLoading={isLoading}
          onEdit={openEdit}
        />
      )}

      {/* Editor dialog */}
      <PostEditorDialog
        open={editorOpen}
        onOpenChange={(o) => (o ? setEditorOpen(true) : closeEditor())}
        post={editingPost}
        locations={locations ?? []}
        defaultLocationId={selectedLocationIds.length === 1 ? selectedLocationIds[0] : undefined}
        defaultScheduledAt={presetScheduledAt}
        defaultType={presetType}
        onSaved={handleSaved}
      />

      {/* Bulk schedule dialog */}
      <Dialog open={bulkScheduleOpen} onOpenChange={(o) => { setBulkScheduleOpen(o); if (!o) setBulkScheduleDate(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule {selectedCount} posts</DialogTitle>
            <DialogDescription>
              Pick a date &amp; time. Only drafts will be moved to the scheduled queue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarClock className="size-4 mr-2 text-amber-500" />
                  {bulkScheduleDate ? scheduleLabel(bulkScheduleDate.toISOString()) : "Pick a date & time"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={bulkScheduleDate ?? undefined}
                  onSelect={(d) => d && setBulkScheduleDate(d)}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={bulkScheduleDate ? format(bulkScheduleDate, "HH:mm") : "10:00"}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                const d = bulkScheduleDate ? new Date(bulkScheduleDate) : new Date();
                d.setHours(h, m, 0, 0);
                setBulkScheduleDate(d);
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkScheduleOpen(false)}>Cancel</Button>
            <Button onClick={bulkScheduleApply} disabled={!bulkScheduleDate || bulkBusy}>
              {bulkBusy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="size-3.5 mr-1.5" />}
              Schedule {selectedCount} posts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingPost} onOpenChange={(o) => !o && setDeletingPost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPost && (
                <>
                  This will permanently delete <span className="font-medium text-foreground">“{deletingPost.title || deletingPost.content?.slice(0, 40) || "this post"}”</span>.
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deletingPost && deletePost(deletingPost)}
            >
              <Trash2 className="size-3.5 mr-1.5" /> Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Analytics Dashboard ---------- */

function AnalyticsDashboard({ stats, isLoading }: { stats?: PostsStats; isLoading: boolean }) {
  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const typeData = (["whats_new", "offer", "event"] as PostType[]).map((t) => ({
    type: t,
    label: TYPE_META[t].label,
    count: stats.typeDistribution.find((d) => d.type === t)?.count ?? 0,
    color: TYPE_META[t].chartColor,
  }));

  const byLocationData = stats.byLocation.slice(0, 10).map((l) => ({
    name: l.locationName,
    city: l.city,
    count: l.count,
  }));
  const maxLoc = Math.max(1, ...byLocationData.map((d) => d.count));

  return (
    <div className="space-y-4">
      {/* Stat row: 8 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Posts"      value={stats.total}          icon={FileText}        accent="emerald" hint="All posts" />
        <StatCard label="Drafts"           value={stats.drafts}         icon={FileText}        accent="slate"   hint="Not yet published" />
        <StatCard label="Scheduled"        value={stats.scheduled}      icon={CalendarClock}   accent="amber"   hint="Queued for later" />
        <StatCard label="Published Today"  value={stats.todayPublished} icon={CalendarCheck}   accent="emerald" hint="Went live today" />
        <StatCard label="Published"        value={stats.published}      icon={CheckCircle2}    accent="emerald" hint="Live on Google" />
        <StatCard label="Failed"           value={stats.failed}         icon={AlertTriangle}   accent="rose"    hint="Publish failures" />
        <StatCard label="AI Drafts"        value={stats.aiDrafts}       icon={Sparkles}        accent="amber"   hint="Pending AI drafts" />
        <StatCard label="Success Rate"     value={`${stats.successRate}%`} icon={TrendingUp}    accent="teal"    hint="Publish success" />
      </div>

      {/* 4-card grid: upcoming, type distribution, top performing, by location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Scheduled Posts */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="size-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <CalendarClock className="size-3.5" />
                </span>
                Upcoming Scheduled
              </CardTitle>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                Next 7 days
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {stats.upcoming.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <CalendarClock className="size-6 mx-auto mb-2 opacity-40" />
                No posts scheduled in the next 7 days.
              </div>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto scroll-area pr-1">
                {stats.upcoming.map((p) => {
                  const m = postTypeMeta(p.type);
                  const Ic = m.icon;
                  return (
                    <li key={p.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors">
                      <span className={cn("size-7 rounded-md flex items-center justify-center shrink-0", m.tint)}>
                        <Ic className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium line-clamp-1">{p.title || p.content?.slice(0, 60) || "Untitled post"}</div>
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="size-2.5 shrink-0" />
                          {p.locationName} — {p.locationCity}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {relativeTime(p.scheduledAt)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{scheduleLabel(p.scheduledAt)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Post Type Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="size-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <PieChart className="size-3.5" />
              </span>
              Post Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {typeData.every((d) => d.count === 0) ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <PieChart className="size-6 mx-auto mb-2 opacity-40" />
                No posts yet.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeData}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={32}
                        outerRadius={56}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {typeData.map((d) => (
                          <Cell key={d.type} fill={d.color} />
                        ))}
                      </Pie>
                      <RTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                          background: "hsl(var(--popover))",
                          color: "hsl(var(--popover-foreground))",
                        }}
                        formatter={(v: any) => [`${v} posts`, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5 min-w-0">
                  {typeData.map((d) => {
                    const m = TYPE_META[d.type];
                    const Ic = m.icon;
                    const pct = stats.total > 0 ? Math.round((d.count / stats.total) * 100) : 0;
                    return (
                      <li key={d.type} className="flex items-center gap-2 text-xs">
                        <span className={cn("size-5 rounded-md flex items-center justify-center shrink-0", m.tint)}>
                          <Ic className="size-3" />
                        </span>
                        <span className="flex-1 truncate">{d.label}</span>
                        <span className="tabular-nums font-medium">{d.count}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Performing Posts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="size-7 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <TrendingUp className="size-3.5" />
              </span>
              Top Performing Posts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {stats.topPerforming.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <TrendingUp className="size-6 mx-auto mb-2 opacity-40" />
                No published posts yet.
              </div>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto scroll-area pr-1">
                {stats.topPerforming.map((p, idx) => {
                  const m = postTypeMeta(p.type);
                  const Ic = m.icon;
                  return (
                    <li key={p.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors">
                      <span className="text-xs font-bold text-muted-foreground tabular-nums w-4 shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className={cn("size-7 rounded-md flex items-center justify-center shrink-0", m.tint)}>
                        <Ic className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium line-clamp-1">{p.title || p.content?.slice(0, 60) || "Untitled post"}</div>
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="size-2.5 shrink-0" />
                          {p.locationName} — {p.locationCity}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          {relativeTime(p.publishedAt)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Posts by Location */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="size-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <MapPin className="size-3.5" />
                </span>
                Posts by Location
              </CardTitle>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                Top {Math.min(10, byLocationData.length)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {byLocationData.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <MapPin className="size-6 mx-auto mb-2 opacity-40" />
                No location data.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={byLocationData}
                    layout="vertical"
                    margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      domain={[0, Math.ceil(maxLoc * 1.15)]}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={120}
                      tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                    />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                      formatter={(v: any) => [`${v} posts`, ""]}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--chart-1)"
                      radius={[0, 4, 4, 0]}
                      barSize={14}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Bulk Action Bar ---------- */

function BulkActionBar({
  selectedCount, selectedDraftsCount, busy,
  onPublish, onSchedule, onArchive, onDelete, onClear,
}: {
  selectedCount: number;
  selectedDraftsCount: number;
  busy: boolean;
  onPublish: () => void;
  onSchedule: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card/95 backdrop-blur shadow-sm">
      <div className="flex items-center gap-2 mr-1">
        <span className="inline-flex items-center justify-center size-7 rounded-md bg-primary/10 text-primary text-xs font-semibold tabular-nums">
          {selectedCount}
        </span>
        <span className="text-sm font-medium">
          {selectedCount === 1 ? "post selected" : "posts selected"}
        </span>
      </div>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <Button size="sm" variant="outline" onClick={onPublish} disabled={busy}>
        <Send className="size-3.5 mr-1.5 text-emerald-500" /> Publish
      </Button>
      <Button size="sm" variant="outline" onClick={onSchedule} disabled={busy}>
        <CalendarClock className="size-3.5 mr-1.5 text-amber-500" /> Schedule
      </Button>
      <Button size="sm" variant="outline" onClick={onArchive} disabled={busy}>
        <Archive className="size-3.5 mr-1.5 text-slate-500" /> Archive
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onDelete}
        disabled={busy}
        className="border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
        title={`Delete ${selectedCount} post(s)`}
      >
        <Trash2 className="size-3.5 mr-1.5" /> Delete
        {selectedDraftsCount > 0 && (
          <span className="ml-1 text-[10px] tabular-nums opacity-80">({selectedDraftsCount})</span>
        )}
      </Button>
      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          <X className="size-3.5 mr-1.5" /> Clear
        </Button>
      </div>
    </div>
  );
}

/* ---------- Post card ---------- */

function PostCard({
  post, canManage, selected, onToggleSelect,
  onPublish, onEdit, onDelete, layout = "grid",
}: {
  post: PostWithLocation;
  canManage: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onPublish: (p: PostWithLocation) => void;
  onEdit: (p: PostWithLocation) => void;
  onDelete: (p: PostWithLocation) => void;
  layout?: "grid" | "list";
}) {
  const meta = postTypeMeta(post.type);
  const Icon = meta.icon;
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState<Date | null>(
    post.scheduledAt ? new Date(post.scheduledAt) : null,
  );
  const [scheduling, setScheduling] = React.useState(false);
  const qc = useQueryClient();

  const relPublished = relativeTime(post.publishedAt);
  const relScheduled = relativeTime(post.scheduledAt);
  const relCreated = relativeTime(post.createdAt);

  const ctaMeta = post.ctaType ? CTA_META_BY_VALUE[post.ctaType] : undefined;
  const CtaIcon = ctaMeta?.icon;
  const isWeeklyRecurring =
    post.recurrenceType === "weekly"
    && post.recurrenceDayOfWeek != null
    && post.recurrenceTime;

  async function applySchedule() {
    if (!scheduleDate) return;
    setScheduling(true);
    try {
      await api(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "scheduled", scheduledAt: scheduleDate.toISOString() }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success(`Scheduled for ${scheduleLabel(scheduleDate.toISOString())}`);
      setScheduleOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  }

  const actionsMenu = canManage ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 opacity-60 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {(post.status === "draft" || post.status === "scheduled" || post.status === "failed") && (
          <DropdownMenuItem onClick={() => onPublish(post)}>
            <Send className="size-3.5 mr-2 text-emerald-500" /> Publish now
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
          <CalendarClock className="size-3.5 mr-2 text-amber-500" /> Schedule…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(post)}>
          <Pencil className="size-3.5 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-rose-600 dark:text-rose-400 focus:text-rose-700"
          onClick={() => onDelete(post)}
        >
          <Trash2 className="size-3.5 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const scheduleDialog = (
    <Dialog open={scheduleOpen} onOpenChange={(o) => setScheduleOpen(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            Pick when this post should go live on Google Business Profile.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarClock className="size-4 mr-2 text-amber-500" />
                {scheduleDate ? scheduleLabel(scheduleDate.toISOString()) : "Pick a date & time"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={scheduleDate ?? undefined}
                onSelect={(d) => d && setScheduleDate(d)}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
          <Input
            type="time"
            value={scheduleDate ? format(scheduleDate, "HH:mm") : "10:00"}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              const d = scheduleDate ? new Date(scheduleDate) : new Date();
              d.setHours(h, m, 0, 0);
              setScheduleDate(d);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
          <Button onClick={applySchedule} disabled={!scheduleDate || scheduling}>
            {scheduling ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="size-3.5 mr-1.5" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (layout === "list") {
    return (
      <Card className={cn(
        "group relative hover:shadow-md transition-shadow overflow-hidden",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}>
        <div className="flex flex-row">
          {canManage && (
            <div className="flex items-center justify-center px-3 border-r bg-muted/20 shrink-0">
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect(post.id)}
                aria-label={`Select post ${post.title}`}
              />
            </div>
          )}

          <div className="sm:w-40 md:w-48 shrink-0 bg-muted border-r">
            {post.imageUrl ? (
              <img
                src={post.imageUrl}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-36 sm:h-full sm:min-h-[112px] object-cover"
                onError={(e) => {
                  e.currentTarget.parentElement?.classList.add("hidden");
                }}
              />
            ) : (
              <div className="flex h-28 sm:h-full sm:min-h-[112px] items-center justify-center">
                <span className={cn("size-10 rounded-lg flex items-center justify-center", meta.tint)}>
                  <Icon className="size-5" />
                </span>
              </div>
            )}
          </div>

          <CardContent className="flex-1 p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3 min-w-0">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  {meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                  <MapPin className="size-2.5 shrink-0" />
                  {post.locationName}
                </span>
              </div>
              {post.title && post.type !== "whats_new" && (
                <h3 className="font-semibold text-sm leading-snug line-clamp-1">{post.title}</h3>
              )}
              <p className={cn(
                "text-xs line-clamp-2 leading-relaxed",
                !post.title || post.type === "whats_new" ? "font-medium text-foreground" : "text-muted-foreground",
              )}>
                {post.content || "No content"}
              </p>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <PostStatusBadge status={post.status} />
                  {isWeeklyRecurring && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-0.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 font-medium">
                      <Repeat className="size-2.5" />
                      {formatWeeklyRecurrence(post.recurrenceDayOfWeek!, post.recurrenceTime!)}
                    </Badge>
                  )}
                {post.source === "ai" && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium">
                    <Sparkles className="size-2.5" />
                    MiSA AI
                  </Badge>
                )}
                {ctaMeta && CtaIcon && (
                  <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 font-normal gap-0.5 border-l-2", ctaMeta.tint)}>
                    <CtaIcon className="size-2.5" />
                    {ctaMeta.label}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between lg:justify-end gap-2 shrink-0 lg:w-44 lg:flex-col lg:items-end">
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                {post.status === "published" && relPublished ? (
                  <>
                    <CheckCircle2 className="size-2.5 text-emerald-500 shrink-0" />
                    <span className="truncate">Published {relPublished}</span>
                  </>
                ) : post.status === "scheduled" && relScheduled ? (
                  <>
                    <Clock className="size-2.5 text-amber-500 shrink-0" />
                    <span className="truncate">Goes live {relScheduled}</span>
                  </>
                ) : (
                  <>
                    <Clock className="size-2.5 shrink-0" />
                    <span className="truncate">Created {relCreated}</span>
                  </>
                )}
              </span>
              {actionsMenu}
            </div>
          </CardContent>
        </div>
        {scheduleDialog}
      </Card>
    );
  }

  return (
    <Card className={cn(
      "group relative hover:shadow-md transition-shadow overflow-hidden",
      selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
    )}>
      {post.imageUrl && (
        <div className="aspect-[16/10] w-full overflow-hidden bg-muted border-b">
          <img
            src={post.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.parentElement?.classList.add("hidden");
            }}
          />
        </div>
      )}
      <CardContent className="p-4 space-y-3">
        {/* Header: checkbox + type + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {canManage && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect(post.id)}
                aria-label={`Select post ${post.title}`}
                className="mt-0.5"
              />
            )}
            <span className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", meta.tint)}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {meta.label}
              </div>
              <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="size-2.5" />
                {post.locationName}
              </div>
            </div>
          </div>

          {actionsMenu}
        </div>

        {/* Title — only for Offer/Event; Update posts show content directly */}
        {post.title && post.type !== "whats_new" && (
          <h3 className="font-semibold text-sm leading-snug line-clamp-1">{post.title}</h3>
        )}

        {/* Content preview */}
        <p className={cn("text-xs text-muted-foreground line-clamp-3 leading-relaxed", !post.title || post.type === "whats_new" ? "font-medium text-foreground" : "")}>
          {post.content || "No content"}
        </p>

        {/* Status + AI badge + CTA badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <PostStatusBadge status={post.status} />
          {isWeeklyRecurring && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-0.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 font-medium">
              <Repeat className="size-2.5" />
              {formatWeeklyRecurrence(post.recurrenceDayOfWeek!, post.recurrenceTime!)}
            </Badge>
          )}
          {post.source === "ai" && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 gap-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium"
            >
              <Sparkles className="size-2.5" />
              MiSA AI
            </Badge>
          )}
          {ctaMeta && CtaIcon && (
            <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 font-normal gap-0.5 border-l-2", ctaMeta.tint)}>
              <CtaIcon className="size-2.5" />
              {ctaMeta.label}
            </Badge>
          )}
        </div>

        {/* Footer: time + CTA */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 min-w-0 truncate">
            {post.status === "published" && relPublished ? (
              <>
                <CheckCircle2 className="size-2.5 text-emerald-500 shrink-0" />
                <span className="truncate">Published {relPublished}</span>
              </>
            ) : post.status === "scheduled" && relScheduled ? (
              <>
                <Clock className="size-2.5 text-amber-500 shrink-0" />
                <span className="truncate">Goes live {relScheduled}</span>
              </>
            ) : (
              <>
                <Clock className="size-2.5 shrink-0" />
                <span className="truncate">Created {relCreated}</span>
              </>
            )}
          </span>
          {post.ctaUrl && (
            <a
              href={post.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-2.5" /> Link
            </a>
          )}
        </div>
      </CardContent>

      {scheduleDialog}
    </Card>
  );
}

/* ---------- Empty state ---------- */

function EmptyState({
  canManage,
  onCreate,
  hasFilters,
  onClearFilters,
}: {
  canManage: boolean;
  onCreate: () => void;
  hasFilters?: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-12 flex flex-col items-center justify-center text-center">
        <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <Sparkles className="size-7 text-amber-500" />
        </div>
        <h3 className="text-base font-semibold">
          {hasFilters ? "No posts found" : "No posts yet"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {hasFilters
            ? "Try adjusting your search or filters to find what you're looking for."
            : "Create your first post or let MiSA AI generate one. Posts help your locations stay visible and engage customers on Google Search & Maps."}
        </p>
        {hasFilters && onClearFilters && (
          <Button variant="outline" className="mt-4" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        {canManage && !hasFilters && (
          <Button className="mt-4" size="sm" onClick={onCreate}>
            <Plus className="size-3.5 mr-1.5" /> New post
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Skeleton ---------- */

function PostsGridSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  if (layout === "list") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <div className="flex flex-row">
              <Skeleton className="w-10 shrink-0 rounded-none" />
              <Skeleton className="h-28 sm:h-auto sm:w-40 sm:min-h-[112px] rounded-none shrink-0" />
              <CardContent className="flex-1 p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-2 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Post editor dialog ---------- */

type EditorStatus = "draft" | "scheduled" | "published";
type ScheduleMode = "once" | "weekly";

interface EditorState {
  locationId: string;
  type: PostType;
  title: string;
  content: string;
  ctaType: string;
  ctaUrl: string;
  imageUrl: string;
  imageFile: File | null;
  status: EditorStatus;
  scheduleMode: ScheduleMode;
  scheduledAt: Date | null;
  recurrenceDayOfWeek: number;
  recurrenceTime: string;
  source: "manual" | "ai" | "google";
  tone: AiTone;
  publishMode: PublishMode;
  selectedLocationIds: string[];
  internalNotes: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  couponCode: string;
  redeemUrl: string;
  offerTerms: string;
}

function buildSchedulePayload(state: EditorState) {
  if (state.status !== "scheduled") {
    return {
      scheduledAt: null as string | null,
      recurrenceType: null as string | null,
      recurrenceDayOfWeek: null as number | null,
      recurrenceTime: null as string | null,
    };
  }
  if (state.scheduleMode === "weekly") {
    return {
      recurrenceType: "weekly" as const,
      recurrenceDayOfWeek: state.recurrenceDayOfWeek,
      recurrenceTime: state.recurrenceTime,
      scheduledAt: computeNextWeeklyOccurrence(
        state.recurrenceDayOfWeek,
        state.recurrenceTime,
      ).toISOString(),
    };
  }
  return {
    recurrenceType: null,
    recurrenceDayOfWeek: null,
    recurrenceTime: null,
    scheduledAt: state.scheduledAt?.toISOString() ?? null,
  };
}

function editorStateFromPost(
  post: PostWithLocation | null,
  opts: {
    defaultLocationId?: string;
    defaultScheduledAt?: Date | null;
    defaultType?: string;
    locations: { id: string }[];
    isEdit: boolean;
  },
): EditorState {
  const isWeekly = post?.recurrenceType === "weekly";
  return {
    locationId: post?.locationId ?? opts.defaultLocationId ?? opts.locations[0]?.id ?? "",
    type: (post?.type ?? opts.defaultType ?? "whats_new") as PostType,
    title: post?.title ?? "",
    content: post?.content ?? "",
    ctaType: post?.ctaType ?? "none",
    ctaUrl: post?.ctaUrl ?? "",
    imageUrl: post?.imageUrl ?? "",
    imageFile: null,
    status: (post?.status === "published"
      ? "published"
      : post?.status === "scheduled"
        ? "scheduled"
        : (!opts.isEdit && opts.defaultScheduledAt ? "scheduled" : "draft")) as EditorStatus,
    scheduleMode: isWeekly ? "weekly" : "once",
    scheduledAt: post?.scheduledAt
      ? new Date(post.scheduledAt)
      : (!opts.isEdit && opts.defaultScheduledAt ? opts.defaultScheduledAt : null),
    recurrenceDayOfWeek: post?.recurrenceDayOfWeek ?? 3,
    recurrenceTime: post?.recurrenceTime ?? "10:00",
    source: (post?.source ?? "manual") as "manual" | "ai" | "google",
    tone: "professional",
    publishMode: "single",
    selectedLocationIds: [],
    internalNotes: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    couponCode: "",
    redeemUrl: "",
    offerTerms: "",
  };
}

function PostEditorDialog({
  open, onOpenChange, post, locations, defaultLocationId, defaultScheduledAt, defaultType, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post: PostWithLocation | null;
  locations: { id: string; name: string; city: string; status?: string; phone?: string | null }[];
  defaultLocationId?: string;
  defaultScheduledAt?: Date | null;
  defaultType?: string;
  onSaved: () => void;
}) {
  const isEdit = !!post;
  const activeLocations = React.useMemo(() => locations, [locations]);
  const allActiveIds = React.useMemo(
    () => locations.filter((l) => l.status !== "paused").map((l) => l.id),
    [locations],
  );

  const [state, setState] = React.useState<EditorState>(() =>
    editorStateFromPost(post, {
      defaultLocationId,
      defaultScheduledAt,
      defaultType,
      locations,
      isEdit,
    }),
  );

  // Reset when opening
  React.useEffect(() => {
    if (open) {
      setState(editorStateFromPost(post, {
        defaultLocationId,
        defaultScheduledAt,
        defaultType,
        locations,
        isEdit,
      }));
    }
  }, [open, post, defaultLocationId, defaultScheduledAt, defaultType, locations, isEdit]);

  const [aiTopic, setAiTopic] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [multiConfirmOpen, setMultiConfirmOpen] = React.useState(false);

  const titleCount = state.title.length;
  const contentWords = state.content.trim() ? state.content.trim().split(/\s+/).length : 0;

  function update<K extends keyof EditorState>(k: K, v: EditorState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  // Resolve final list of location IDs based on publish mode (for multi-publish)
  function resolveMultiLocationIds(): string[] {
    if (state.publishMode === "all") return allActiveIds;
    if (state.publishMode === "multiple") return state.selectedLocationIds;
    return [];
  }

  async function generateWithAi() {
    if (state.publishMode === "single" && !state.locationId) {
      toast.error("Pick a location first");
      return;
    }
    if (!aiTopic.trim()) {
      toast.error("Enter a topic for MiSA AI to write about");
      return;
    }
    setAiLoading(true);
    try {
      const gen = await api<{ title: string; content: string; ctaType: string }>(
        "/api/posts",
        {
          method: "POST",
          body: JSON.stringify({
            action: "ai_generate",
            locationId: state.locationId || locations[0]?.id,
            type: state.type,
            topic: aiTopic.trim(),
            tone: state.tone,
          }),
        },
      );
      setState((s) => ({
        ...s,
        title: gen.title ?? s.title,
        content: gen.content ?? s.content,
        ctaType: gen.ctaType ?? s.ctaType,
        source: "ai",
      }));
      toast.success("MiSA AI drafted a post. Review & tweak before publishing.");
    } catch (e: any) {
      toast.error(e?.message || "MiSA AI generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  function attemptSave() {
    if ((state.type === "offer" || state.type === "event") && !state.title.trim()) { toast.error("Title is required for Offer/Event posts"); return; }
    if (!state.content.trim()) { toast.error("Content/Description is required"); return; }
    if ((state.type === "offer" || state.type === "event") && !state.startDate) { toast.error("Start date is required"); return; }
    if ((state.type === "offer" || state.type === "event") && !state.endDate) { toast.error("End date is required"); return; }
    if (state.status === "scheduled") {
      if (state.scheduleMode === "once" && !state.scheduledAt) {
        toast.error("Pick a schedule date & time");
        return;
      }
    }

    // Multi-location publish only on create
    if (!isEdit && state.publishMode !== "single") {
      const ids = resolveMultiLocationIds();
      if (state.publishMode === "multiple" && ids.length === 0) {
        toast.error("Select at least one location");
        return;
      }
      if (state.publishMode === "all" && ids.length === 0) {
        toast.error("No active locations available");
        return;
      }
      setMultiConfirmOpen(true);
      return;
    }

    if (isEdit && post) {
      // Existing single-location edit flow
      saveSingle();
    } else {
      saveSingle();
    }
  }

  async function uploadImageIfNeeded(): Promise<string | null> {
    if (!state.imageFile) return null;
    const fd = new FormData();
    fd.append("file", state.imageFile);
    fd.append("locationId", state.locationId);
    const res = await fetch("/api/media", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Image upload failed");
    return json.data?.fileUrl || null;
  }

  async function saveSingle() {
    if (state.publishMode === "single" && !state.locationId) {
      toast.error("Select a location");
      return;
    }
    setSaving(true);
    try {
      let uploadedImageUrl: string | null = null;
      if (state.imageFile) {
        uploadedImageUrl = await uploadImageIfNeeded();
      }

      if (isEdit && post) {
        await api(`/api/posts/${post.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: state.title,
            content: state.content,
            ctaType: state.ctaType || null,
            ctaUrl: state.ctaUrl || null,
            imageUrl: uploadedImageUrl || undefined,
            status: state.status,
            ...buildSchedulePayload(state),
            startDate: state.startDate || null,
            startTime: state.startTime || null,
            endDate: state.endDate || null,
            endTime: state.endTime || null,
            couponCode: state.couponCode || null,
            redeemUrl: state.redeemUrl || null,
            offerTerms: state.offerTerms || null,
          }),
        });
        toast.success(
          state.status === "published"
            ? "Post published"
            : state.status === "scheduled"
              ? (state.scheduleMode === "weekly" ? "Weekly recurring post scheduled" : "Post scheduled")
              : "Post saved",
        );
      } else {
        await api("/api/posts", {
          method: "POST",
          body: JSON.stringify({
            locationId: state.locationId,
            type: state.type,
            title: state.title,
            content: state.content,
            ctaType: state.ctaType || null,
            ctaUrl: state.ctaUrl || null,
            imageUrl: uploadedImageUrl || null,
            status: state.status,
            ...buildSchedulePayload(state),
            source: state.source,
            startDate: state.startDate || null,
            startTime: state.startTime || null,
            endDate: state.endDate || null,
            endTime: state.endTime || null,
            couponCode: state.couponCode || null,
            redeemUrl: state.redeemUrl || null,
            offerTerms: state.offerTerms || null,
          }),
        });
        toast.success(
          state.status === "published"
            ? "Post published to Google Business Profile"
            : state.status === "scheduled"
              ? (state.scheduleMode === "weekly" ? "Weekly recurring post scheduled" : "Post scheduled")
              : "Draft saved",
        );
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save post");
    } finally {
      setSaving(false);
    }
  }

  async function saveMultiLocation() {
    const locationIds = resolveMultiLocationIds();
    if (locationIds.length === 0) {
      toast.error("No locations selected");
      return;
    }
    setSaving(true);
    try {
      let uploadedImageUrl: string | null = null;
      if (state.imageFile && locationIds[0]) {
        const fd = new FormData();
        fd.append("file", state.imageFile);
        fd.append("locationId", locationIds[0]);
        const res = await fetch("/api/media", { method: "POST", body: fd });
        const json = await res.json();
        if (res.ok) uploadedImageUrl = json.data?.fileUrl || null;
      }
      const r = await api<{ created: number }>("/api/posts/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "publish-multi",
          locationIds,
          post: {
            type: state.type,
            title: state.title,
            content: state.content,
            ctaType: state.ctaType || null,
            ctaUrl: state.ctaUrl || null,
            imageUrl: uploadedImageUrl,
            status: state.status,
            source: state.source,
            ...buildSchedulePayload(state),
            startDate: state.startDate || null,
            startTime: state.startTime || null,
            endDate: state.endDate || null,
            endTime: state.endTime || null,
            couponCode: state.couponCode || null,
            redeemUrl: state.redeemUrl || null,
            offerTerms: state.offerTerms || null,
          },
        }),
      });
      toast.success(`Created ${r.created} post${r.created === 1 ? "" : "s"} across ${locationIds.length} location${locationIds.length === 1 ? "" : "s"}`);
      setMultiConfirmOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Multi-location publish failed");
    } finally {
      setSaving(false);
    }
  }

  const meta = postTypeMeta(state.type);
  const TypeIcon = meta.icon;
  const selectedTone = TONE_OPTIONS.find((t) => t.value === state.tone);

  // Count for multi-publish confirmation
  const multiLocationCount = resolveMultiLocationIds().length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[min(1100px,96vw)] p-0 gap-0 overflow-hidden flex flex-col h-full border-l shadow-2xl [&>button]:top-5 [&>button]:right-5 [&>button]:size-9 [&>button]:rounded-full [&>button]:border [&>button]:bg-background [&>button]:opacity-100"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0 text-left bg-gradient-to-r from-cyan-50/80 to-sky-50/50">
            <div className="pr-10 space-y-1">
              <SheetTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                {isEdit ? "Edit post" : "Create post"}
              </SheetTitle>
              <SheetDescription>
                {isEdit
                  ? "Update post content, CTA, or schedule."
                  : "Write a new Google Business Profile post or let MiSA AI draft one for you."}
              </SheetDescription>
            </div>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scroll-area px-6 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* Left: form */}
            <div className="space-y-4">
              {/* AI generator */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-500" />
                  <span className="text-sm font-semibold">Generate with MiSA AI</span>
                  <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                    AI
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tell MiSA the topic (e.g. “Monsoon car AC service offer”) and we&apos;ll draft title, body &amp; CTA.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
                  <Input
                    placeholder="Topic, offer or event…"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !aiLoading) generateWithAi(); }}
                    className="flex-1"
                  />
                  <Select value={state.tone} onValueChange={(v) => update("tone", v as AiTone)}>
                    <SelectTrigger className="w-full">
                      <Wand2 className="size-3.5 mr-1 text-amber-500" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="text-xs">{t.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTone && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400/80 italic">
                    {selectedTone.hint}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateWithAi}
                  disabled={aiLoading}
                  className="w-full border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  {aiLoading ? (
                    <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Wand2 className="size-3.5 mr-1.5" /> Generate with MiSA AI</>
                  )}
                </Button>
              </div>

              {/* Publish to (only on create) */}
              {!isEdit && (
                <div className="rounded-lg border bg-card p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="size-4 text-primary" />
                    <span className="text-sm font-semibold">Publish to</span>
                    <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1.5">
                      {state.publishMode === "single" ? "1 location" : state.publishMode === "multiple" ? `${state.selectedLocationIds.length} locations` : `${allActiveIds.length} active`}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { value: "single", label: "Single", icon: MapPin },
                      { value: "multiple", label: "Multiple", icon: Layers },
                      { value: "all", label: "All Active", icon: CheckCheck },
                    ] as { value: PublishMode; label: string; icon: any }[]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update("publishMode", opt.value)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 rounded-md border p-2 text-xs transition-colors",
                          state.publishMode === opt.value
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-border hover:bg-muted/50 text-muted-foreground",
                        )}
                      >
                        <opt.icon className="size-3.5" />
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Single location select */}
                  {state.publishMode === "single" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Location <span className="text-rose-500">*</span></Label>
                      <Select value={state.locationId} onValueChange={(v) => update("locationId", v)}>
                        <SelectTrigger className="w-full">
                          <MapPin className="size-3.5 mr-1 text-muted-foreground" />
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeLocations.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name} — {l.city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Multiple locations checkbox list */}
                  {state.publishMode === "multiple" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Select locations</Label>
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => update("selectedLocationIds", allActiveIds)}
                        >
                          Select all
                        </button>
                      </div>
                      <div className="max-h-44 overflow-y-auto scroll-area rounded-md border p-1">
                        {activeLocations.map((l) => {
                          const checked = state.selectedLocationIds.includes(l.id);
                          return (
                            <label
                              key={l.id}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-muted/50",
                                checked && "bg-primary/5",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  const next = checked
                                    ? state.selectedLocationIds.filter((id) => id !== l.id)
                                    : [...state.selectedLocationIds, l.id];
                                  update("selectedLocationIds", next);
                                }}
                              />
                              <span className="flex-1 truncate">{l.name}</span>
                              <span className="text-[10px] text-muted-foreground">{l.city}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* All active confirmation */}
                  {state.publishMode === "all" && (
                    <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                      <CheckCheck className="size-3.5 mt-0.5 shrink-0" />
                      <span>
                        This will create one post for each of <strong>{allActiveIds.length}</strong> active locations.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Location & type (edit mode shows location read-only) */}
              {isEdit && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Location</Label>
                    <div className="text-sm px-3 py-2 rounded-md border bg-muted/30 flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      <span className="truncate">
                        {locations.find((l) => l.id === state.locationId)?.name ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Post type <span className="text-rose-500">*</span></Label>
                    <Select value={state.type} onValueChange={(v) => {
                      update("type", v as PostType);
                      if (v === "offer") { update("ctaType", "none"); update("ctaUrl", ""); }
                    }}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_META).map(([k, m]) => (
                          <SelectItem key={k} value={k}>
                            <span className="inline-flex items-center gap-2">
                              <m.icon className="size-3.5" /> {m.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {/* Type select (create mode, multi or single) */}
              {!isEdit && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Post type <span className="text-rose-500">*</span></Label>
                  <Select value={state.type} onValueChange={(v) => {
                    update("type", v as PostType);
                    if (v === "offer") { update("ctaType", "none"); update("ctaUrl", ""); }
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([k, m]) => (
                        <SelectItem key={k} value={k}>
                          <span className="inline-flex items-center gap-2">
                            <m.icon className="size-3.5" /> {m.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Title — only for Offer & Event */}
              {(state.type === "offer" || state.type === "event") && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Title <span className="text-rose-500">*</span></Label>
                    <span className={cn("text-[10px] tabular-nums", titleCount > 58 ? "text-rose-500" : "text-muted-foreground")}>
                      {titleCount}/58
                    </span>
                  </div>
                  <Input
                    value={state.title}
                    maxLength={58}
                    onChange={(e) => update("title", e.target.value.slice(0, 58))}
                    placeholder={state.type === "offer" ? "e.g. Monsoon Sale — 30% off AC service" : "e.g. Free Car Health Checkup Camp"}
                  />
                </div>
              )}

              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Description <span className="text-rose-500">*</span></Label>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {state.content.length}/1500
                  </span>
                </div>
                <Textarea
                  value={state.content}
                  maxLength={1500}
                  onChange={(e) => update("content", e.target.value)}
                  rows={5}
                  placeholder="Write 100–180 words. Mention the offer, time window & how to redeem…"
                  className="resize-y min-h-[120px]"
                />
                <p className="text-[10px] text-muted-foreground">
                  Suggested: 100–180 words for best engagement on Google.
                </p>
              </div>

              {/* Offer / Event specific fields */}
              {(state.type === "offer" || state.type === "event") && (
                <>
                  {/* Start / End date+time */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start date <span className="text-rose-500">*</span></Label>
                      <Input type="date" value={state.startDate} onChange={(e) => update("startDate", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start time</Label>
                      <Input type="time" value={state.startTime} onChange={(e) => update("startTime", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End date <span className="text-rose-500">*</span></Label>
                      <Input type="date" value={state.endDate} onChange={(e) => update("endDate", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End time</Label>
                      <Input type="time" value={state.endTime} onChange={(e) => update("endTime", e.target.value)} />
                    </div>
                  </div>

                  {/* Offer-only: Terms, Coupon code, Redeem link */}
                  {state.type === "offer" && (
                    <div className="space-y-3 rounded-lg border border-dashed p-3 bg-amber-500/5">
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Offer details</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Coupon code</Label>
                        <Input value={state.couponCode} onChange={(e) => update("couponCode", e.target.value)} placeholder="e.g. MONSOON30" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Link to redeem offer</Label>
                        <Input value={state.redeemUrl} onChange={(e) => update("redeemUrl", e.target.value)} placeholder="https://myfng.in/offers" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Terms & conditions</Label>
                        <Textarea value={state.offerTerms} onChange={(e) => update("offerTerms", e.target.value)} rows={2} placeholder="e.g. Valid on bookings above ₹2000. Not combinable with other offers." className="resize-y min-h-[50px]" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Image upload */}
              <div className="space-y-1.5">
                <Label className="text-xs">Post Image (optional)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="flex-1"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setState((s) => ({ ...s, imageFile: file, imageUrl: URL.createObjectURL(file) }));
                      }
                    }}
                  />
                  {state.imageUrl && (
                    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
                      onClick={() => setState((s) => ({ ...s, imageFile: null, imageUrl: "" }))}>
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
                {state.imageUrl && (
                  <img src={state.imageUrl} alt="Preview" className="mt-2 rounded-lg max-h-40 object-cover border" />
                )}
              </div>

              {/* CTA — Add a button (optional) — not supported for Offer posts */}
              {state.type !== "offer" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Add a button (optional)</Label>
                <Select value={state.ctaType} onValueChange={(v) => {
                  update("ctaType", v);
                  if (v === "call") {
                    const loc = locations.find((l) => l.id === state.locationId);
                    update("ctaUrl", loc?.phone || "");
                  } else {
                    update("ctaUrl", "");
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="inline-flex items-center gap-2">
                          <o.icon className="size-3.5" /> {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              {state.type !== "offer" && state.ctaType === "call" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone number</Label>
                  <Input
                    value={state.ctaUrl || locations.find((l) => l.id === state.locationId)?.phone || ""}
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-[10px] text-muted-foreground">Customers will call this number</p>
                </div>
              )}
              {state.type !== "offer" && state.ctaType !== "none" && state.ctaType !== "call" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={state.ctaUrl}
                    onChange={(e) => update("ctaUrl", e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              )}

              {/* Status + schedule */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={state.status} onValueChange={(v) => update("status", v as EditorStatus)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Save as Draft</SelectItem>
                        <SelectItem value="scheduled">Schedule</SelectItem>
                        <SelectItem value="published">Publish now</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {state.status === "scheduled" && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Schedule type</Label>
                      <ToggleGroup
                        type="single"
                        value={state.scheduleMode}
                        onValueChange={(v) => { if (v) update("scheduleMode", v as ScheduleMode); }}
                        variant="outline"
                        size="default"
                        className="w-full sm:w-auto"
                      >
                        <ToggleGroupItem value="once" className="shrink-0 px-4 gap-2 h-9">
                          <CalendarClock className="size-3.5 shrink-0" />
                          <span className="text-xs">One-time</span>
                        </ToggleGroupItem>
                        <ToggleGroupItem value="weekly" className="shrink-0 px-4 gap-2 h-9">
                          <Repeat className="size-3.5 shrink-0" />
                          <span className="text-xs">Repeat weekly</span>
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    {state.scheduleMode === "once" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Date &amp; time</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarClock className="size-3.5 mr-1.5 text-amber-500" />
                              {state.scheduledAt ? scheduleLabel(state.scheduledAt.toISOString()) : "Pick date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={state.scheduledAt ?? undefined}
                              onSelect={(d) => {
                                if (!d) return;
                                const next = new Date(d);
                                if (state.scheduledAt) {
                                  next.setHours(state.scheduledAt.getHours(), state.scheduledAt.getMinutes(), 0, 0);
                                } else {
                                  next.setHours(10, 0, 0, 0);
                                }
                                update("scheduledAt", next);
                              }}
                              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                            />
                            <div className="p-2 border-t">
                              <Input
                                type="time"
                                value={state.scheduledAt ? format(state.scheduledAt, "HH:mm") : "10:00"}
                                onChange={(e) => {
                                  const [h, m] = e.target.value.split(":").map(Number);
                                  const d = state.scheduledAt ? new Date(state.scheduledAt) : new Date();
                                  d.setHours(h, m, 0, 0);
                                  update("scheduledAt", d);
                                }}
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Repeat on</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {WEEKDAY_OPTIONS.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                size="sm"
                                variant={state.recurrenceDayOfWeek === day.value ? "default" : "outline"}
                                className="h-8 min-w-[2.75rem] px-3"
                                onClick={() => update("recurrenceDayOfWeek", day.value)}
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Time</Label>
                          <Input
                            type="time"
                            value={state.recurrenceTime}
                            onChange={(e) => update("recurrenceTime", e.target.value)}
                            className="max-w-[180px]"
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <Repeat className="size-3.5 shrink-0 mt-0.5 text-primary" />
                          <span>
                            {formatWeeklyRecurrence(state.recurrenceDayOfWeek, state.recurrenceTime)}.
                            {" "}Next post:{" "}
                            <span className="font-medium text-foreground">
                              {scheduleLabel(
                                computeNextWeeklyOccurrence(
                                  state.recurrenceDayOfWeek,
                                  state.recurrenceTime,
                                ).toISOString(),
                              )}
                            </span>
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Internal Notes (private) */}
              <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 text-slate-500" />
                  <Label className="text-xs font-medium">Internal Notes</Label>
                  <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1.5 bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20">
                    Private
                  </Badge>
                </div>
                <Textarea
                  value={state.internalNotes}
                  onChange={(e) => update("internalNotes", e.target.value)}
                  rows={2}
                  placeholder="Notes for your team — never sent to Google."
                  className="resize-y min-h-[60px] bg-background"
                />
                <p className="text-[10px] text-muted-foreground italic">
                  Notes are private and never sent to Google Business Profile.
                </p>
              </div>
            </div>

            {/* Right: preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
                {state.source === "ai" && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                    <Sparkles className="size-2.5 mr-0.5" /> MiSA AI
                  </Badge>
                )}
              </div>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Faux Google search card */}
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {state.locationId
                          ? (locations.find((l) => l.id === state.locationId)?.name?.[0] ?? "M")
                          : state.publishMode !== "single" ? `${multiLocationCount}` : "M"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {state.publishMode === "single"
                            ? (locations.find((l) => l.id === state.locationId)?.name ?? "Select a location")
                            : state.publishMode === "multiple"
                              ? `${state.selectedLocationIds.length} locations`
                              : `${allActiveIds.length} active locations`}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {state.publishMode === "single"
                            ? (locations.find((l) => l.id === state.locationId)?.city ?? "—")
                            : state.publishMode === "multiple"
                              ? "Multi-location publish"
                              : "All active locations"}
                        </div>
                      </div>
                    </div>
                  </div>
                  {state.imageUrl && (
                    <div className="aspect-[16/10] w-full overflow-hidden bg-muted border-b">
                      <img
                        src={state.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("size-5 rounded-md flex items-center justify-center", meta.tint)}>
                        <TypeIcon className="size-3" />
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        {meta.label}
                      </span>
                    </div>
                    {(state.type === "offer" || state.type === "event") && (
                      <h4 className="text-sm font-semibold leading-snug">
                        {state.title || <span className="text-muted-foreground italic">Post title…</span>}
                      </h4>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-6 leading-relaxed whitespace-pre-wrap">
                      {state.content || <span className="italic">Your post content will appear here…</span>}
                    </p>
                    {state.ctaType && CTA_META_BY_VALUE[state.ctaType] && (
                      <div className="pt-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", CTA_META_BY_VALUE[state.ctaType].tint)}>
                          {(() => {
                            const Ic = CTA_META_BY_VALUE[state.ctaType].icon;
                            return <Ic className="size-3" />;
                          })()}
                          {CTA_LABEL[state.ctaType] ?? state.ctaType}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="text-[10px] text-muted-foreground leading-relaxed">
                This is a simulated preview of how your post will render on Google Search &amp; Maps.
                Final appearance may vary based on Google&apos;s display rules.
              </div>
            </div>
          </div>
          </div>

          <SheetFooter className="border-t px-6 py-4 shrink-0 flex-row justify-end gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={attemptSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : state.status === "published" ? (
                <><Send className="size-3.5 mr-1.5" /> Publish now</>
              ) : state.status === "scheduled" ? (
                <><CalendarClock className="size-3.5 mr-1.5" /> Schedule post</>
              ) : (
                <><FileText className="size-3.5 mr-1.5" /> Save draft</>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Multi-location publish confirmation */}
      <AlertDialog open={multiConfirmOpen} onOpenChange={setMultiConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-primary" />
              Publish to {multiLocationCount} locations?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will create <strong className="text-foreground">{multiLocationCount}</strong> {multiLocationCount === 1 ? "post" : "posts"} across <strong className="text-foreground">{multiLocationCount}</strong> {multiLocationCount === 1 ? "location" : "locations"}.
              {" "}Each location will get its own {state.status === "published" ? "published" : state.status === "scheduled" ? "scheduled" : "draft"} post with the same content &amp; CTA.
              {" "}Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                saveMultiLocation();
              }}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Creating…</>
              ) : (
                <><CheckCheck className="size-3.5 mr-1.5" /> Create {multiLocationCount} posts</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PastHistoryTable({
  posts,
  isLoading,
  onEdit,
}: {
  posts: PostWithLocation[];
  isLoading: boolean;
  onEdit: (p: PostWithLocation) => void;
}) {
  const [page, setPage] = React.useState(0);
  const [timeFilter, setTimeFilter] = React.useState<DurationValue>("30");
  const [customRange, setCustomRange] = React.useState<DurationCustomRange | null>(null);
  const perPage = 15;

  const filtered = React.useMemo(() => {
    if (timeFilter === "all") return posts;

    let from: Date | null = null;
    let to: Date | null = null;
    const now = new Date();

    if (timeFilter === "custom" && customRange?.from) {
      from = new Date(customRange.from);
      from.setHours(0, 0, 0, 0);
      if (customRange.to) {
        to = new Date(customRange.to);
        to.setHours(23, 59, 59, 999);
      }
    } else if (timeFilter === "today") {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
    } else if (timeFilter === "yesterday") {
      from = new Date(now);
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      to.setHours(23, 59, 59, 999);
    } else {
      const days = parseInt(timeFilter, 10);
      if (Number.isFinite(days)) {
        from = new Date(now);
        from.setDate(from.getDate() - days);
      }
    }

    return posts.filter((p) => {
      const d = p.publishedAt ? new Date(p.publishedAt) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [posts, timeFilter, customRange]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Previous Posts</span>
          <Badge variant="outline" className="text-xs">{filtered.length} posts</Badge>
        </div>
        <DurationFilter
          value={timeFilter}
          onChange={(v) => {
            setTimeFilter(v);
            setPage(0);
          }}
          customRange={customRange}
          onCustomRangeChange={(r) => {
            setCustomRange(r);
            setPage(0);
          }}
          className="w-[150px]"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Post Type</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Title / Content</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Location</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Published On</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Channel</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No published posts in this time period.
                </td>
              </tr>
            ) : (
              paged.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30 transition">
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {p.type === "whats_new" ? "What's New" : p.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 max-w-[250px]">
                    <span className="font-medium truncate block">{p.title || p.content?.slice(0, 60) || "Untitled"}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.locationName}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                      Google
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onEdit(p)}>
                      <Eye className="size-3 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <NumberedPagination
          page={page}
          totalPages={Math.max(1, totalPages)}
          totalItems={filtered.length}
          perPage={perPage}
          onPageChange={setPage}
          itemLabel="posts"
          hideWhenSinglePage
        />
      </div>
    </Card>
  );
}
