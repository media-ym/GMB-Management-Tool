"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { useLocations } from "@/hooks/use-locations";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RatingStars, SentimentBadge } from "@/components/shared/badges";
import type { ReviewWithLocation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { LucideIcon } from "lucide-react";
import {
  Star,
  RefreshCw,
  Search,
  Sparkles,
  Send,
  EyeOff,
  Inbox,
  Loader2,
  MessageSquare,
  CheckCircle2,
  Ban,
  BarChart3,
  Clock,
  Download,
  FileText,
  StickyNote,
  Plus,
  Pencil,
  Trash2,
  Lock,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Timer,
  Zap,
  TrendingUp,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";

// ============================================================================
// Types
// ============================================================================

type StatusFilter = "all" | "pending" | "replied" | "ignored";
type SentimentFilter = "all" | "positive" | "neutral" | "negative";
type RatingFilter = "all" | "5" | "4" | "3" | "low";
type ViewTab = "inbox" | "analytics";
type EditorPanelTab = "templates" | "notes";

interface ReviewStats {
  total: number;
  pending: number;
  negative: number;
  positive: number;
  replied: number;
  todayReviews: number;
  avgRating: number;
  responseRate: number;
  avgResponseTimeHours: number;
  slaCompliance: {
    negative: { total: number; compliant: number; rate: number; target: string };
    positive: { total: number; compliant: number; rate: number; target: string };
  };
  ratingDistribution: { rating: number; count: number; percentage: number }[];
  trend: { date: string; count: number; positive: number; negative: number }[];
  topComplaints: { topic: string; count: number }[];
  topAppreciation: { topic: string; count: number }[];
  sentimentCounts: { positive: number; neutral: number; negative: number };
  aiSuggestedCount: number;
}

interface ReplyTemplate {
  id: string;
  title: string;
  rating: number;
  template: string;
  language: string;
  isActive: boolean;
  createdAt: string;
}

interface ReviewNote {
  id: string;
  text: string;
  createdAt: string;
}

// ============================================================================
// Constants & helpers
// ============================================================================

const AVATAR_COLORS = [
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-slate-500/15 text-slate-700 dark:text-slate-300",
];

const MAX_REPLY = 4096;

// Rating distribution bar colors per spec
const RATING_BAR_COLORS: Record<number, string> = {
  5: "bg-emerald-500",
  4: "bg-teal-500",
  3: "bg-amber-500",
  2: "bg-orange-400",
  1: "bg-rose-500",
};

const RATING_LABEL_COLORS: Record<number, string> = {
  5: "text-emerald-600 dark:text-emerald-400",
  4: "text-teal-600 dark:text-teal-400",
  3: "text-amber-600 dark:text-amber-400",
  2: "text-orange-500 dark:text-orange-400",
  1: "text-rose-600 dark:text-rose-400",
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// SLA computation — 2h for negative (rating ≤ 2), 24h for positive (rating ≥ 3)
function computeSla(createdAt: string, rating: number) {
  const created = new Date(createdAt).getTime();
  const elapsedMs = Date.now() - created;
  const isNegative = rating <= 2;
  const targetMs = isNegative ? 2 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const targetLabel = isNegative ? "2h" : "24h";
  let status: "within" | "approaching" | "overdue";
  if (elapsedMs > targetMs) status = "overdue";
  else if (elapsedMs >= targetMs * 0.75) status = "approaching";
  else status = "within";
  return {
    targetLabel,
    targetMs,
    elapsedMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    status,
  };
}

// Template variable substitution
function applyTemplate(
  tpl: string,
  review: ReviewWithLocation,
  managerName: string,
): string {
  return tpl
    .replace(/\{\{customer_name\}\}/g, review.authorName)
    .replace(/\{\{location_name\}\}/g, review.locationName)
    .replace(/\{\{manager_name\}\}/g, managerName)
    .replace(/\{\{city\}\}/g, review.locationCity)
    .replace(/\{\{rating\}\}/g, String(review.rating));
}

// Highlight {{variables}} in template preview
function highlightVariables(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => {
    if (/^\{\{[^}]+\}\}$/.test(p)) {
      return (
        <span
          key={i}
          className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-400"
        >
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function safeFormatDate(iso: string, fmt: string) {
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return iso;
    return format(d, fmt);
  } catch {
    return iso;
  }
}

function safeRelativeTime(iso: string) {
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "recently";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "recently";
  }
}

// ============================================================================
// Main ReviewsView
// ============================================================================

export function ReviewsView() {
  const user = useUser();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const qc = useQueryClient();

  const canReply = can(user.role, "reviews.reply");
  const canAiReply = can(user.role, "reviews.ai_reply");
  const canView = can(user.role, "reviews.view");

  const [viewTab, setViewTab] = useState<ViewTab>("inbox");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sentimentFilter, setSentimentFilter] =
    useState<SentimentFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [search, setSearch] = useState("");

  // reply editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  // editor side panel tab
  const [editorPanel, setEditorPanel] = useState<EditorPanelTab>("templates");

  // manage templates dialog
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  const { data: locations } = useLocations();

  // Reviews query
  const reviewsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activeLocationId && activeLocationId !== "all")
      params.set("locationId", activeLocationId);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
    if (ratingFilter === "5") {
      params.set("minRating", "5");
      params.set("maxRating", "5");
    } else if (ratingFilter === "4") {
      params.set("minRating", "4");
      params.set("maxRating", "4");
    } else if (ratingFilter === "3") {
      params.set("minRating", "3");
      params.set("maxRating", "3");
    } else if (ratingFilter === "low") {
      params.set("minRating", "1");
      params.set("maxRating", "2");
    }
    params.set("limit", "200");
    return `/api/reviews?${params.toString()}`;
  }, [activeLocationId, statusFilter, sentimentFilter, ratingFilter]);

  const { data: reviews, isLoading } = useQuery<ReviewWithLocation[]>({
    queryKey: ["reviews", reviewsUrl],
    queryFn: () => api<ReviewWithLocation[]>(reviewsUrl),
  });

  // Stats query (always fetch — used by analytics tab)
  const statsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activeLocationId && activeLocationId !== "all")
      params.set("locationId", activeLocationId);
    return `/api/reviews/stats?${params.toString()}`;
  }, [activeLocationId]);

  const { data: stats, isLoading: statsLoading } = useQuery<ReviewStats>({
    queryKey: ["reviews-stats", statsUrl],
    queryFn: () => api<ReviewStats>(statsUrl),
  });

  // Templates query
  const { data: templates, isLoading: templatesLoading } = useQuery<
    ReplyTemplate[]
  >({
    queryKey: ["review-templates"],
    queryFn: () => api<ReplyTemplate[]>("/api/review-templates"),
  });

  // Notes for active review
  const notesUrl = activeReviewId
    ? `/api/reviews/${activeReviewId}/notes`
    : null;
  const { data: notes, isLoading: notesLoading } = useQuery<ReviewNote[]>({
    queryKey: ["review-notes", activeReviewId],
    queryFn: () => api<ReviewNote[]>(notesUrl ?? ""),
    enabled: !!notesUrl,
  });

  // Client-side search
  const filtered = useMemo(() => {
    if (!reviews) return [];
    if (!search.trim()) return reviews;
    const q = search.toLowerCase();
    return reviews.filter(
      (r) =>
        r.authorName.toLowerCase().includes(q) ||
        r.text.toLowerCase().includes(q) ||
        r.locationName.toLowerCase().includes(q) ||
        r.locationCity.toLowerCase().includes(q),
    );
  }, [reviews, search]);

  // Client-side fallback stats (computed from fetched set, pre-search)
  const clientStats = useMemo(() => {
    const list = reviews ?? [];
    const total = list.length;
    const pending = list.filter((r) => r.replyStatus === "pending").length;
    const negative = list.filter((r) => r.rating <= 2).length;
    const avg = total > 0 ? list.reduce((s, r) => s + r.rating, 0) / total : 0;
    return { total, pending, negative, avg };
  }, [reviews]);

  // ---- Mutations ----
  const aiDraftMut = useMutation({
    mutationFn: (id: string) =>
      api<{ reply: string }>(`/api/reviews/${id}/reply`),
  });

  const publishMut = useMutation({
    mutationFn: ({ id, replyText }: { id: string; replyText: string }) =>
      api(`/api/reviews/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ replyText }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews-stats"] });
      toast.success("Reply published to Google Business Profile");
      setEditorOpen(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to publish reply";
      toast.error(msg);
    },
  });

  const ignoreMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/reviews/${id}/reply`, {
        method: "PATCH",
        body: JSON.stringify({ action: "ignore" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews-stats"] });
      toast.success("Review marked as ignored");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to ignore review";
      toast.error(msg);
    },
  });

  const addNoteMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api<{ id: string; text: string }>(`/api/reviews/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-notes", activeReviewId] });
      toast.success("Internal note added");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to add note";
      toast.error(msg);
    },
  });

  const createTplMut = useMutation({
    mutationFn: (body: {
      title: string;
      rating: number;
      template: string;
      language: string;
    }) =>
      api<{ id: string }>("/api/review-templates", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-templates"] });
      toast.success("Template created");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to create template";
      toast.error(msg);
    },
  });

  const updateTplMut = useMutation({
    mutationFn: (body: {
      id: string;
      title?: string;
      rating?: number;
      template?: string;
      language?: string;
      isActive?: boolean;
    }) =>
      api(`/api/review-templates`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-templates"] });
      toast.success("Template updated");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to update template";
      toast.error(msg);
    },
  });

  const deleteTplMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/review-templates?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to delete template";
      toast.error(msg);
    },
  });

  // ---- Handlers ----
  async function handleSync() {
    try {
      toast.loading("Triggering Google sync…", { id: "sync-rev" });
      await api("/api/dashboard", { method: "POST", body: JSON.stringify({}) });
      qc.invalidateQueries();
      toast.success("Sync complete.", { id: "sync-rev" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg, { id: "sync-rev" });
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (activeLocationId && activeLocationId !== "all")
      params.set("locationId", activeLocationId);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
    const url = `/api/reviews/export?${params.toString()}`;
    window.open(url, "_blank");
    toast.success("Preparing CSV download…");
  }

  async function handleAiDraft(review: ReviewWithLocation) {
    setActiveReviewId(review.id);
    setAiLoadingId(review.id);
    try {
      const { reply } = await aiDraftMut.mutateAsync(review.id);
      setDrafts((d) => ({ ...d, [review.id]: reply }));
      setEditorText(reply);
      setEditorPanel("templates");
      setEditorOpen(true);
      toast.success("MiSA AI draft ready");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AI draft failed";
      toast.error(msg);
    } finally {
      setAiLoadingId(null);
    }
  }

  function handleOpenEditor(review: ReviewWithLocation) {
    setActiveReviewId(review.id);
    const existing = drafts[review.id] ?? review.replyText ?? "";
    setEditorText(existing);
    setEditorPanel("templates");
    setEditorOpen(true);
  }

  function handleSaveDraft() {
    if (!activeReviewId) return;
    setDrafts((d) => ({ ...d, [activeReviewId]: editorText }));
    setEditorOpen(false);
    toast.info("Draft saved locally");
  }

  function handlePublish() {
    if (!activeReviewId) return;
    if (editorText.trim().length < 3) {
      toast.error("Reply must be at least 3 characters");
      return;
    }
    publishMut.mutate({ id: activeReviewId, replyText: editorText.trim() });
  }

  function handleIgnore(id: string) {
    ignoreMut.mutate(id);
  }

  function handleUseTemplate(tpl: ReplyTemplate) {
    if (!activeReview) return;
    const filled = applyTemplate(tpl.template, activeReview, user.name);
    setEditorText(filled);
    toast.success(`Applied template: ${tpl.title}`);
  }

  function handleAddNote(text: string) {
    if (!activeReviewId) return;
    if (text.trim().length < 1) return;
    addNoteMut.mutate({ id: activeReviewId, text: text.trim() });
  }

  const activeReview =
    reviews?.find((r) => r.id === activeReviewId) ?? null;
  const hasActiveFilters =
    statusFilter !== "all" ||
    sentimentFilter !== "all" ||
    ratingFilter !== "all" ||
    !!search.trim();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Reviews"
        description="Sync, monitor & reply to Google Business Profile reviews"
        icon={Star}
        actions={
          <>
            <Select
              value={activeLocationId}
              onValueChange={(v) => setActiveLocationId(v as string | "all")}
            >
              <SelectTrigger size="sm" className="min-w-[140px] w-full sm:w-auto">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {l.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canView && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                aria-label="Export reviews as CSV"
              >
                <Download className="size-3.5 mr-1.5" /> <span className="hidden sm:inline">Export</span> CSV
              </Button>
            )}
            <Button size="sm" onClick={handleSync}>
              <RefreshCw className="size-3.5 mr-1.5" /> Sync
            </Button>
          </>
        }
      />

      {/* Top-level tabs: Inbox | Analytics */}
      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
        <TabsList>
          <TabsTrigger value="inbox">
            <Inbox className="size-3.5 mr-1.5" /> Inbox
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="size-3.5 mr-1.5" /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* INBOX TAB */}
        <TabsContent value="inbox" className="space-y-4">
          {/* Compact stat row (kept from existing) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
            ) : (
              <>
                <StatCard
                  label="Total Reviews"
                  value={clientStats.total}
                  icon={Star}
                  accent="emerald"
                  hint="In current filter"
                />
                <StatCard
                  label="Pending Reply"
                  value={clientStats.pending}
                  icon={MessageSquare}
                  accent="amber"
                  hint="Awaiting response"
                />
                <StatCard
                  label="Avg Rating"
                  value={clientStats.avg.toFixed(2)}
                  icon={Star}
                  accent="teal"
                  hint="0–5 scale"
                />
                <StatCard
                  label="Negative Reviews"
                  value={clientStats.negative}
                  icon={Ban}
                  accent="rose"
                  hint="Rating ≤ 2 stars"
                />
              </>
            )}
          </div>

          {/* Filter bar */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Tabs
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                >
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="replied">Replied</TabsTrigger>
                    <TabsTrigger value="ignored">Ignored</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={sentimentFilter}
                    onValueChange={(v) =>
                      setSentimentFilter(v as SentimentFilter)
                    }
                  >
                    <SelectTrigger size="sm" className="min-w-[120px] w-full sm:w-auto">
                      <SelectValue placeholder="Sentiment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sentiment</SelectItem>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                    </SelectContent>
                  </Select>

                  <ToggleGroup
                    type="single"
                    value={ratingFilter}
                    onValueChange={(v) =>
                      setRatingFilter((v as RatingFilter) || "all")
                    }
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="all" className="min-h-9 px-3">
                      All
                    </ToggleGroupItem>
                    <ToggleGroupItem value="5" className="min-h-9 px-3">
                      5★
                    </ToggleGroupItem>
                    <ToggleGroupItem value="4" className="min-h-9 px-3">
                      4★
                    </ToggleGroupItem>
                    <ToggleGroupItem value="3" className="min-h-9 px-3">
                      3★
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="low"
                      className="min-h-9 px-3 text-rose-600 dark:text-rose-400"
                    >
                      1–2★
                    </ToggleGroupItem>
                  </ToggleGroup>

                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search reviews…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 min-w-[120px] sm:min-w-[180px] h-9"
                      aria-label="Search reviews by author, text, or location"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reviews list (independently scrollable) */}
          <div className="max-h-[calc(100vh-26rem)] overflow-y-auto scroll-area pr-1 -mr-1">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState hasFilters={hasActiveFilters} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filtered.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    canReply={canReply}
                    canAiReply={canAiReply}
                    aiLoading={aiLoadingId === r.id}
                    onAiDraft={() => handleAiDraft(r)}
                    onReply={() => handleOpenEditor(r)}
                    onIgnore={() => handleIgnore(r.id)}
                    ignoring={
                      ignoreMut.isPending && ignoreMut.variables === r.id
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="space-y-4">
          {statsLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            </div>
          ) : !stats ? (
            <EmptyState hasFilters={false} />
          ) : (
            <AnalyticsDashboard stats={stats} />
          )}
        </TabsContent>
      </Tabs>

      {/* Reply editor dialog — enhanced with Templates + Internal Notes side panel */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-5 text-primary" />
              Reply to review
            </DialogTitle>
            <DialogDescription>
              {activeReview ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    Replying to{" "}
                    <span className="font-medium text-foreground">
                      {activeReview.authorName}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    · <RatingStars rating={activeReview.rating} size={12} />
                  </span>
                  {drafts[activeReview.id] && (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                    >
                      <Sparkles className="size-3 mr-1" /> Draft
                    </Badge>
                  )}
                </span>
              ) : (
                "Compose your reply"
              )}
            </DialogDescription>
          </DialogHeader>

          {activeReview && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground italic line-clamp-3">
                &ldquo;{activeReview.text}&rdquo;
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            {/* Editor column */}
            <div className="space-y-2 order-1">
              <Textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder="Write a thoughtful, on-brand reply…"
                className="min-h-[160px] sm:min-h-[260px] resize-y"
                maxLength={MAX_REPLY}
                aria-label="Reply text"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3 text-amber-500" />
                  MiSA AI drafts are suggestions — review before publishing.
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    editorText.length > MAX_REPLY && "text-rose-500",
                  )}
                >
                  {editorText.length} / {MAX_REPLY}
                </span>
              </div>
            </div>

            {/* Side panel: Templates + Notes */}
            <div className="rounded-lg border bg-card">
              <Tabs
                value={editorPanel}
                onValueChange={(v) => setEditorPanel(v as EditorPanelTab)}
              >
                <div className="px-3 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="templates" className="flex-1">
                      <FileText className="size-3.5 mr-1.5" /> Templates
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="flex-1">
                      <StickyNote className="size-3.5 mr-1.5" /> Notes
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="templates" className="mt-0">
                  <TemplatesPanel
                    templates={templates}
                    isLoading={templatesLoading}
                    canManage={canReply}
                    onUse={handleUseTemplate}
                    onManage={() => setManageTemplatesOpen(true)}
                  />
                </TabsContent>
                <TabsContent value="notes" className="mt-0">
                  <InternalNotesPanel
                    notes={notes}
                    isLoading={notesLoading}
                    canAdd={canReply}
                    onAdd={handleAddNote}
                    adding={addNoteMut.isPending}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="w-full sm:w-auto">Cancel</Button>
            </DialogClose>
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={publishMut.isPending}
              className="w-full sm:w-auto"
            >
              Save draft
            </Button>
            <Button
              onClick={handlePublish}
              disabled={
                publishMut.isPending || editorText.trim().length < 3
              }
              className="w-full sm:w-auto"
            >
              {publishMut.isPending ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />{" "}
                  Publishing…
                </>
              ) : (
                <>
                  <Send className="size-3.5 mr-1.5" /> Publish to Google
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage templates dialog */}
      <ManageTemplatesDialog
        open={manageTemplatesOpen}
        onOpenChange={setManageTemplatesOpen}
        templates={templates}
        isLoading={templatesLoading}
        canManage={canReply}
        onCreate={(body) => createTplMut.mutate(body)}
        onUpdate={(body) => updateTplMut.mutate(body)}
        onDelete={(id) => deleteTplMut.mutate(id)}
        creating={createTplMut.isPending}
        updating={updateTplMut.isPending}
        deleting={deleteTplMut.isPending}
      />
    </div>
  );
}

// ============================================================================
// Analytics Dashboard
// ============================================================================

function AnalyticsDashboard({ stats }: { stats: ReviewStats }) {
  return (
    <div className="space-y-4">
      {/* Enhanced stat row (8 cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Reviews"
          value={stats.total}
          icon={Star}
          accent="emerald"
          hint="All time"
        />
        <StatCard
          label="Avg Rating"
          value={stats.avgRating.toFixed(2)}
          icon={Star}
          accent="teal"
          hint="0–5 scale"
        />
        <StatCard
          label="Pending Replies"
          value={stats.pending}
          icon={MessageSquare}
          accent="amber"
          hint="Awaiting response"
        />
        <StatCard
          label="Today's Reviews"
          value={stats.todayReviews}
          icon={TrendingUp}
          accent="emerald"
          hint="New today"
        />
        <StatCard
          label="Negative Reviews"
          value={stats.negative}
          icon={Ban}
          accent="rose"
          hint="Rating ≤ 2 stars"
        />
        <StatCard
          label="Response Rate"
          value={`${stats.responseRate}%`}
          icon={CheckCircle2}
          accent="emerald"
          hint="Replied / total"
        />
        <StatCard
          label="Avg Response Time"
          value={`${stats.avgResponseTimeHours}h`}
          icon={Clock}
          accent="amber"
          hint="Across all replies"
        />
        <StatCard
          label="AI Suggested"
          value={stats.aiSuggestedCount}
          icon={Zap}
          accent="teal"
          hint="Replies drafted by MiSA"
        />
      </div>

      {/* Charts row 1 — distribution + trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RatingDistributionCard
          distribution={stats.ratingDistribution}
          total={stats.total}
        />
        <ReviewTrendCard trend={stats.trend} />
      </div>

      {/* Charts row 2 — SLA + sentiment + response health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SlaComplianceCard sla={stats.slaCompliance} />
        <SentimentDistributionCard counts={stats.sentimentCounts} />
        <ResponseHealthCard
          responseRate={stats.responseRate}
          avgResponseTimeHours={stats.avgResponseTimeHours}
          replied={stats.replied}
          total={stats.total}
        />
      </div>

      {/* Topics row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopTopicsCard
          title="Top Complaints"
          icon={ThumbsDown}
          accent="rose"
          topics={stats.topComplaints}
          emptyText="No complaint topics detected yet"
        />
        <TopTopicsCard
          title="Top Appreciation"
          icon={ThumbsUp}
          accent="emerald"
          topics={stats.topAppreciation}
          emptyText="No appreciation topics detected yet"
        />
      </div>
    </div>
  );
}

function RatingDistributionCard({
  distribution,
  total,
}: {
  distribution: ReviewStats["ratingDistribution"];
  total: number;
}) {
  const sorted = [...distribution].sort((a, b) => b.rating - a.rating);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Rating Distribution</h3>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total} total
          </span>
        </div>
        <div className="space-y-2.5">
          {sorted.map((d) => (
            <div key={d.rating} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex items-center gap-1 w-12 text-xs font-semibold shrink-0",
                  RATING_LABEL_COLORS[d.rating],
                )}
              >
                {d.rating}
                <Star className="size-3 fill-current" />
              </div>
              <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-md transition-all duration-500",
                    RATING_BAR_COLORS[d.rating],
                  )}
                  style={{
                    width: `${Math.max(d.percentage, d.count > 0 ? 5 : 0)}%`,
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-medium text-foreground/80 tabular-nums">
                  {d.count} · {d.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewTrendCard({ trend }: { trend: ReviewStats["trend"] }) {
  const data = useMemo(
    () =>
      trend.map((t) => ({
        ...t,
        label: safeFormatDate(t.date, "MMM d"),
      })),
    [trend],
  );

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">30-Day Review Trend</h3>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500" /> Positive
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-rose-500" /> Negative
            </span>
          </div>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 5, right: 5, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--chart-4)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--chart-4)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={4}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
              />
              <RTooltip
                contentStyle={{
                  backgroundColor: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ fontWeight: 600, fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="positive"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#posGrad)"
                name="Positive"
              />
              <Area
                type="monotone"
                dataKey="negative"
                stroke="var(--chart-4)"
                strokeWidth={2}
                fill="url(#negGrad)"
                name="Negative"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function SlaComplianceCard({
  sla,
}: {
  sla: ReviewStats["slaCompliance"];
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Timer className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">SLA Compliance</h3>
        </div>
        <div className="space-y-5">
          <SlaRow
            label="Negative Reviews"
            target={sla.negative.target}
            compliant={sla.negative.compliant}
            total={sla.negative.total}
            rate={sla.negative.rate}
          />
          <SlaRow
            label="Positive Reviews"
            target={sla.positive.target}
            compliant={sla.positive.compliant}
            total={sla.positive.total}
            rate={sla.positive.rate}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SlaRow({
  label,
  target,
  compliant,
  total,
  rate,
}: {
  label: string;
  target: string;
  compliant: number;
  total: number;
  rate: number;
}) {
  const tone: "emerald" | "amber" | "rose" =
    rate >= 80 ? "emerald" : rate >= 50 ? "amber" : "rose";
  const toneCls = {
    emerald: {
      bar: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      badge:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    },
    amber: {
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      badge:
        "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    },
    rose: {
      bar: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      badge:
        "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    },
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{label}</span>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-medium shrink-0", toneCls.badge)}
          >
            Target: {target}
          </Badge>
        </div>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums shrink-0",
            toneCls.text,
          )}
        >
          {rate}%
        </span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            toneCls.bar,
          )}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {compliant} of {total} compliant
        </span>
        <span>
          {total === 0 ? (
            "No data"
          ) : rate >= 80 ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3" /> On track
            </span>
          ) : rate >= 50 ? (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="size-3" /> Needs attention
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="size-3" /> Critical
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function SentimentDistributionCard({
  counts,
}: {
  counts: ReviewStats["sentimentCounts"];
}) {
  const total = counts.positive + counts.neutral + counts.negative || 1;
  const rows = [
    {
      label: "Positive",
      count: counts.positive,
      color: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      icon: ThumbsUp,
    },
    {
      label: "Neutral",
      count: counts.neutral,
      color: "bg-slate-400",
      text: "text-slate-600 dark:text-slate-400",
      icon: MessageSquare,
    },
    {
      label: "Negative",
      count: counts.negative,
      color: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      icon: ThumbsDown,
    },
  ];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Sentiment Distribution</h3>
        </div>
        {/* Stacked bar */}
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted mb-4">
          {rows.map(
            (r) =>
              r.count > 0 && (
                <div
                  key={r.label}
                  className={cn("h-full", r.color)}
                  style={{ width: `${(r.count / total) * 100}%` }}
                  title={`${r.label}: ${r.count}`}
                />
              ),
          )}
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => {
            const Icon = r.icon;
            const pct = Math.round((r.count / total) * 100);
            return (
              <div key={r.label} className="flex items-center gap-3">
                <Icon className={cn("size-4 shrink-0", r.text)} />
                <span className="text-sm font-medium flex-1">{r.label}</span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums shrink-0",
                    r.text,
                  )}
                >
                  {r.count}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums w-10 text-right shrink-0">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResponseHealthCard({
  responseRate,
  avgResponseTimeHours,
  replied,
  total,
}: {
  responseRate: number;
  avgResponseTimeHours: number;
  replied: number;
  total: number;
}) {
  const tone: "emerald" | "amber" | "rose" =
    responseRate >= 80 ? "emerald" : responseRate >= 50 ? "amber" : "rose";
  const toneText = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  }[tone];
  const toneBar = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Response Health</h3>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">
                Response Rate
              </span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  toneText,
                )}
              >
                {responseRate}%
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  toneBar,
                )}
                style={{ width: `${Math.min(responseRate, 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              {replied} of {total} reviews replied
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              Avg Response Time
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {avgResponseTimeHours}h
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TopTopicsCard({
  title,
  icon: Icon,
  accent,
  topics,
  emptyText,
}: {
  title: string;
  icon: LucideIcon;
  accent: "rose" | "emerald";
  topics: { topic: string; count: number }[];
  emptyText: string;
}) {
  const accentCls =
    accent === "rose"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  const iconCls = accent === "rose" ? "text-rose-500" : "text-emerald-500";
  const barCls = accent === "rose" ? "bg-rose-500" : "bg-emerald-500";
  const maxCount = Math.max(...topics.map((t) => t.count), 1);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon className={cn("size-4", iconCls)} />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {topics.length === 0 ? (
          <div className="py-8 text-center">
            <Icon className={cn("size-8 mx-auto mb-2 opacity-30", iconCls)} />
            <p className="text-xs text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto scroll-area pr-1 -mr-1 space-y-2">
            {topics.map((t, i) => (
              <div
                key={t.topic + i}
                className="flex items-center gap-3"
              >
                <span className="text-sm font-medium flex-1 truncate">
                  {t.topic}
                </span>
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden shrink-0">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      barCls,
                    )}
                    style={{ width: `${(t.count / maxCount) * 100}%` }}
                  />
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] tabular-nums min-w-[2rem] justify-center shrink-0",
                    accentCls,
                  )}
                >
                  {t.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Templates Panel (in editor dialog)
// ============================================================================

function TemplatesPanel({
  templates,
  isLoading,
  canManage,
  onUse,
  onManage,
}: {
  templates: ReplyTemplate[] | undefined;
  isLoading: boolean;
  canManage: boolean;
  onUse: (tpl: ReplyTemplate) => void;
  onManage: () => void;
}) {
  const active = useMemo(
    () => (templates ?? []).filter((t) => t.isActive),
    [templates],
  );
  const grouped = useMemo(() => {
    const g: Record<number, ReplyTemplate[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const t of active) g[t.rating]?.push(t);
    return g;
  }, [active]);

  return (
    <div className="p-3 space-y-3 max-h-[340px] overflow-y-auto scroll-area">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          Variables:{" "}
          <code className="font-mono text-amber-600 dark:text-amber-400">
            {"{{customer_name}} {{location_name}} {{manager_name}}"}
          </code>
        </span>
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs shrink-0"
            onClick={onManage}
          >
            <Plus className="size-3 mr-1" /> Manage
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="py-6 text-center">
          <FileText className="size-7 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            No active templates yet.
          </p>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={onManage}
            >
              <Plus className="size-3 mr-1" /> Create template
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => {
            const list = grouped[rating] ?? [];
            if (list.length === 0) return null;
            return (
              <div key={rating}>
                <div
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-semibold mb-1.5",
                    RATING_LABEL_COLORS[rating],
                  )}
                >
                  {rating}
                  <Star className="size-3 fill-current" /> star templates
                </div>
                <div className="space-y-2">
                  {list.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-md border p-2.5 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-medium truncate min-w-0">
                          {t.title}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] shrink-0"
                          onClick={() => onUse(t)}
                        >
                          Use
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                        {highlightVariables(t.template)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Internal Notes Panel (in editor dialog)
// ============================================================================

function InternalNotesPanel({
  notes,
  isLoading,
  canAdd,
  onAdd,
  adding,
}: {
  notes: ReviewNote[] | undefined;
  isLoading: boolean;
  canAdd: boolean;
  onAdd: (text: string) => void;
  adding: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div className="p-3 max-h-[340px] flex flex-col">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] text-amber-700 dark:text-amber-400">
        <Lock className="size-3 shrink-0" />
        <span>Private — never sent to Google</span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-area space-y-2 mb-3 pr-1 -mr-1">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))
        ) : !notes || notes.length === 0 ? (
          <div className="py-6 text-center">
            <StickyNote className="size-7 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No internal notes yet.
            </p>
          </div>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="rounded-md border bg-muted/30 p-2.5"
            >
              <p className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">
                {n.text}
              </p>
              <div className="text-[10px] text-muted-foreground mt-1.5">
                {safeRelativeTime(n.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
      {canAdd && (
        <div className="space-y-2 border-t pt-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add an internal note…"
            className="min-h-[60px] text-xs resize-y"
            maxLength={500}
            aria-label="Add internal note"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {text.length} / 500
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              disabled={adding || text.trim().length < 1}
              onClick={() => {
                onAdd(text);
                setText("");
              }}
            >
              {adding ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <Plus className="size-3 mr-1" />
              )}
              Add note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Manage Templates Dialog
// ============================================================================

type TemplateFormIntent =
  | { mode: "new" }
  | { mode: "edit"; template: ReplyTemplate };

function ManageTemplatesDialog({
  open,
  onOpenChange,
  templates,
  isLoading,
  canManage,
  onCreate,
  onUpdate,
  onDelete,
  creating,
  updating,
  deleting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: ReplyTemplate[] | undefined;
  isLoading: boolean;
  canManage: boolean;
  onCreate: (body: {
    title: string;
    rating: number;
    template: string;
    language: string;
  }) => void;
  onUpdate: (body: {
    id: string;
    title?: string;
    rating?: number;
    template?: string;
    language?: string;
    isActive?: boolean;
  }) => void;
  onDelete: (id: string) => void;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}) {
  const [formIntent, setFormIntent] = useState<TemplateFormIntent | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Reset form intent on close — safe inside event handler
      setFormIntent(null);
    }
  }

  function handleSubmit(values: {
    title: string;
    rating: number;
    template: string;
    language: string;
  }) {
    if (formIntent?.mode === "edit") {
      onUpdate({ id: formIntent.template.id, ...values });
    } else {
      onCreate(values);
    }
    setFormIntent(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Reply Templates
          </DialogTitle>
          <DialogDescription>
            Manage reusable reply templates by rating. Variables:{" "}
            <code className="font-mono text-amber-600 dark:text-amber-400">
              {"{{customer_name}}, {{location_name}}, {{manager_name}}, {{city}}, {{rating}}"}
            </code>
          </DialogDescription>
        </DialogHeader>

        {!canManage ? (
          <div className="py-8 text-center">
            <Lock className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              You don&apos;t have permission to manage templates.
            </p>
          </div>
        ) : formIntent ? (
          <TemplateForm
            key={formIntent.mode === "edit" ? formIntent.template.id : "new"}
            intent={formIntent}
            submitting={creating || updating}
            onSubmit={handleSubmit}
            onCancel={() => setFormIntent(null)}
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground tabular-nums">
                {templates?.length ?? 0} templates
              </span>
              <Button
                size="sm"
                onClick={() => setFormIntent({ mode: "new" })}
              >
                <Plus className="size-3.5 mr-1" /> New template
              </Button>
            </div>
            <div className="max-h-[420px] overflow-y-auto scroll-area pr-1 -mr-1">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-md" />
                  ))}
                </div>
              ) : !templates || templates.length === 0 ? (
                <div className="py-10 text-center">
                  <FileText className="size-9 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No templates yet.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setFormIntent({ mode: "new" })}
                  >
                    <Plus className="size-3.5 mr-1" /> Create your first template
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-md border p-3",
                        !t.isActive && "opacity-60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {t.title}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] shrink-0",
                                RATING_LABEL_COLORS[t.rating],
                              )}
                            >
                              {t.rating}★
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] shrink-0"
                            >
                              {t.language || "en"}
                            </Badge>
                            {!t.isActive && (
                              <Badge
                                variant="outline"
                                className="text-[10px] shrink-0 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
                              >
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch
                            checked={t.isActive}
                            onCheckedChange={(v) =>
                              onUpdate({ id: t.id, isActive: v })
                            }
                            disabled={updating}
                            aria-label="Toggle active"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() =>
                              setFormIntent({ mode: "edit", template: t })
                            }
                            aria-label="Edit template"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                            onClick={() => onDelete(t.id)}
                            disabled={deleting}
                            aria-label="Delete template"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {highlightVariables(t.template)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Form component — owns its own state, resets on each mount via key prop
function TemplateForm({
  intent,
  submitting,
  onSubmit,
  onCancel,
}: {
  intent: TemplateFormIntent;
  submitting: boolean;
  onSubmit: (values: {
    title: string;
    rating: number;
    template: string;
    language: string;
  }) => void;
  onCancel: () => void;
}) {
  const isEdit = intent.mode === "edit";
  const initial = isEdit
    ? {
        title: intent.template.title,
        rating: String(intent.template.rating),
        language: intent.template.language || "en",
        template: intent.template.template,
      }
    : { title: "", rating: "5", language: "en", template: "" };

  const [fTitle, setFTitle] = useState(initial.title);
  const [fRating, setFRating] = useState(initial.rating);
  const [fLanguage, setFLanguage] = useState(initial.language);
  const [fTemplate, setFTemplate] = useState(initial.template);

  function handleSubmit() {
    if (fTitle.trim().length < 1 || fTemplate.trim().length < 1) {
      toast.error("Title and template are required");
      return;
    }
    onSubmit({
      title: fTitle.trim(),
      rating: Number(fRating),
      template: fTemplate.trim(),
      language: fLanguage.trim() || "en",
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Title</label>
          <Input
            value={fTitle}
            onChange={(e) => setFTitle(e.target.value)}
            placeholder="e.g. Apology for delayed service"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Rating</label>
            <Select value={fRating} onValueChange={setFRating}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r} ★
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Language</label>
            <Input
              value={fLanguage}
              onChange={(e) => setFLanguage(e.target.value)}
              placeholder="en"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium">Template body</label>
        <Textarea
          value={fTemplate}
          onChange={(e) => setFTemplate(e.target.value)}
          placeholder={
            "Hi {{customer_name}}, thank you for sharing your experience at {{location_name}}…"
          }
          className="min-h-[140px] resize-y"
          maxLength={2000}
        />
        <div className="text-[10px] text-muted-foreground">
          Tip: use variables to personalize the reply at insert time.
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting && (
            <Loader2 className="size-3.5 mr-1 animate-spin" />
          )}
          {isEdit ? "Update template" : "Create template"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Subcomponents — ReviewCard, SlaBadge, ReplyStatusBadge, EmptyState
// ============================================================================

function ReviewCard({
  review,
  canReply,
  canAiReply,
  aiLoading,
  onAiDraft,
  onReply,
  onIgnore,
  ignoring,
}: {
  review: ReviewWithLocation;
  canReply: boolean;
  canAiReply: boolean;
  aiLoading: boolean;
  onReply: () => void;
  onAiDraft: () => void;
  onIgnore: () => void;
  ignoring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNegative = review.rating <= 2;
  const hasReply = !!review.replyText && review.replyStatus === "replied";
  const isLong = review.text.length > 180;
  const isPending = review.replyStatus === "pending";
  const sla = isPending
    ? computeSla(review.createdAt, review.rating)
    : null;

  return (
    <Card
      className={cn(
        "p-0 overflow-hidden transition-shadow hover:shadow-md",
        isNegative && "border-l-4 border-l-rose-500",
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* header */}
        <div className="flex items-start gap-3">
          <Avatar className="size-10">
            {review.authorPhoto && (
              <AvatarImage src={review.authorPhoto} alt={review.authorName} />
            )}
            <AvatarFallback className={colorFor(review.authorName)}>
              {initials(review.authorName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {review.authorName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {review.locationName} · {review.locationCity}
                </div>
              </div>
              <RatingStars rating={review.rating} size={16} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {formatDistanceToNow(new Date(review.createdAt), {
                addSuffix: true,
              })}
            </div>
          </div>
        </div>

        {/* review text */}
        <div>
          <p
            className={cn(
              "text-sm leading-relaxed text-foreground/90 whitespace-pre-line",
              !expanded && "line-clamp-4",
            )}
          >
            {review.text}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* tags */}
        <div className="flex flex-wrap items-center gap-2">
          <SentimentBadge sentiment={review.sentiment} />
          <ReplyStatusBadge
            status={review.replyStatus}
            source={review.replySource}
          />
          {sla && (
            <SlaBadge
              status={sla.status}
              target={sla.targetLabel}
              remainingMs={sla.remainingMs}
            />
          )}
        </div>

        {/* existing reply */}
        {hasReply && review.replyText && (
          <div className="rounded-lg bg-muted/40 border border-muted p-3">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">
                {review.replySource === "ai"
                  ? "Replied by MiSA AI"
                  : "Replied manually"}
              </span>
              {review.replySource === "ai" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                >
                  <Sparkles className="size-2.5 mr-0.5" /> AI
                </Badge>
              )}
              {review.repliedAt && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(review.repliedAt), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
              {review.replyText}
            </p>
          </div>
        )}

        {/* actions */}
        {canReply && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            {canAiReply && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAiDraft}
                disabled={aiLoading}
                className="min-h-11 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" /> MiSA
                    AI…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 mr-1.5" /> MiSA AI draft
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onReply}
              className="min-h-11"
            >
              <MessageSquare className="size-3.5 mr-1.5" />{" "}
              {hasReply ? "Edit reply" : "Reply"}
            </Button>
            {review.replyStatus !== "ignored" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onIgnore}
                disabled={ignoring}
                className="min-h-11 ml-auto text-muted-foreground hover:text-rose-600"
              >
                {ignoring ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <EyeOff className="size-3.5 mr-1.5" />
                )}
                Ignore
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SlaBadge({
  status,
  target,
  remainingMs,
}: {
  status: "within" | "approaching" | "overdue";
  target: string;
  remainingMs: number;
}) {
  const styles = {
    overdue:
      "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
    approaching:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    within:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  };
  const hoursLeft = Math.ceil(remainingMs / (60 * 60 * 1000));
  const labels = {
    overdue: "overdue",
    approaching: "due soon",
    within: hoursLeft > 0 ? `${hoursLeft}h left` : "due",
  };
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium", styles[status])}
    >
      <Clock className="size-3 mr-0.5" />
      SLA: {target} · {labels[status]}
    </Badge>
  );
}

function ReplyStatusBadge({
  status,
  source,
}: {
  status: ReviewWithLocation["replyStatus"];
  source: ReviewWithLocation["replySource"];
}) {
  if (status === "replied") {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      >
        <CheckCircle2 className="size-3 mr-1" />
        Replied
        {source === "ai"
          ? " · AI"
          : source === "manual"
            ? " · Manual"
            : ""}
      </Badge>
    );
  }
  if (status === "ignored") {
    return (
      <Badge
        variant="outline"
        className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
      >
        <EyeOff className="size-3 mr-1" /> Ignored
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
    >
      <MessageSquare className="size-3 mr-1" /> Pending
    </Badge>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="p-12 text-center">
        <div className="mx-auto size-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="size-7 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold">
          {hasFilters ? "No reviews match your filters" : "No reviews yet"}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          {hasFilters
            ? "Try adjusting the status, sentiment, rating, or search filters to find what you're looking for."
            : "Reviews will appear here once they sync from Google Business Profile. Hit Sync to fetch the latest."}
        </p>
      </CardContent>
    </Card>
  );
}
