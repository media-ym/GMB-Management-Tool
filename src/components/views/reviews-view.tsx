"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { useLocations } from "@/hooks/use-locations";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { DurationFilter, getDurationLabel, type DurationValue, type DurationCustomRange } from "@/components/shared/duration-filter";
import { LayoutToggle, type LayoutMode } from "@/components/shared/layout-toggle";
import { NumberedPagination } from "@/components/shared/numbered-pagination";
import { RatingStars, SentimentBadge } from "@/components/shared/badges";
import type { ReviewWithLocation, ReviewChangeWithLocation } from "@/lib/types";
import { appendLocationIdsToParams, appendDurationToParams } from "@/lib/location-filter";
import type { NpsBreakdown } from "@/lib/location-filter";
import {
  mergeAutoReplyConfig,
  substituteReviewReplyTemplate,
  autoReplyCharLimit,
  type AutoReplyConfig,
  type AutoReplyReviewType,
} from "@/lib/auto-reply";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronDown,
  Cpu,
} from "lucide-react";
import {
  AUTO_MODEL_ID,
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODELS,
  getOpenRouterModelLabel,
  type OpenRouterModel,
} from "@/lib/openrouter-models";

const MISA_MODEL_STORAGE_KEY = "myfng-misa-model";
const MISA_MODEL_OPTIONS: OpenRouterModel[] = [
  {
    id: AUTO_MODEL_ID,
    label: "Auto (best available)",
    provider: "OpenRouter",
    free: true,
  },
  ...OPENROUTER_MODELS,
];
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ============================================================================
// Types
// ============================================================================

type StatusFilter = "all" | "pending" | "replied" | "ignored";
type SentimentFilter = "all" | "positive" | "neutral" | "negative";
type RatingFilter = "all" | "5" | "4" | "3" | "low";
type ViewTab = "inbox" | "analytics" | "deleted-edited" | "auto-replies";
type EditorPanelTab = "templates" | "notes";

interface ReviewStats {
  total: number;
  pending: number;
  pendingAll?: number;
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
  nps: NpsBreakdown;
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

// Template variable substitution (client preview — server re-substitutes on publish)
function applyTemplate(
  tpl: string,
  review: ReviewWithLocation,
  managerName: string,
): string {
  return substituteReviewReplyTemplate(tpl, {
    customerName: review.authorName,
    businessName: review.locationName,
    category: "Auto Service",
    address: review.locationCity,
    area: review.locationCity,
    city: review.locationCity,
    managerName,
    rating: review.rating,
  });
}

/** Pick the best active template for one-click reply on a review card. */
function resolveQuickReplyTemplate(
  rating: number,
  templates: ReplyTemplate[] | undefined,
  autoReply?: AutoReplyConfig | null,
): string | null {
  const active = (templates ?? []).filter((t) => t.isActive);
  const exact = active.find((t) => t.rating === rating);
  if (exact?.template.trim()) return exact.template;

  if (
    autoReply?.enabled &&
    autoReply.mode === "manual" &&
    autoReply.template.trim() &&
    autoReply.selectedRatings.includes(rating)
  ) {
    return autoReply.template;
  }

  const nearest = active
    .filter((t) => t.rating <= rating && t.template.trim())
    .sort((a, b) => b.rating - a.rating)[0];
  return nearest?.template ?? null;
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
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const qc = useQueryClient();

  const canReply = can(user.role, "reviews.reply");
  const canAiReply = can(user.role, "reviews.ai_reply");
  const canView = can(user.role, "reviews.view");

  const [viewTab, setViewTab] = useState<ViewTab>("inbox");
  const [analyticsDays, setAnalyticsDays] = useState<DurationValue>("all");
  const [customDurationRange, setCustomDurationRange] = useState<DurationCustomRange | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sentimentFilter, setSentimentFilter] =
    useState<SentimentFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [search, setSearch] = useState("");
  const [displayLayout, setDisplayLayout] = useState<LayoutMode>("grid");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  // reply editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [quickTemplateLoadingId, setQuickTemplateLoadingId] = useState<string | null>(null);
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
  const [bulkReplyBusy, setBulkReplyBusy] = useState(false);
  const [editorText, setEditorText] = useState("");
  // editor side panel tab
  const [editorPanel, setEditorPanel] = useState<EditorPanelTab>("templates");
  const [misaModel, setMisaModel] = useState(DEFAULT_OPENROUTER_MODEL);

  // manage templates dialog
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  const { data: locations } = useLocations();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MISA_MODEL_STORAGE_KEY);
      if (saved && MISA_MODEL_OPTIONS.some((m) => m.id === saved)) {
        setMisaModel(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MISA_MODEL_STORAGE_KEY, misaModel);
    } catch {
      /* ignore */
    }
  }, [misaModel]);

  function appendReviewDurationParams(params: URLSearchParams) {
    appendDurationToParams(params, analyticsDays, customDurationRange);
  }

  // Reviews query
  const reviewsUrl = useMemo(() => {
    const params = new URLSearchParams();
    appendLocationIdsToParams(params, selectedLocationIds);
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
    } else     if (ratingFilter === "low") {
      params.set("minRating", "1");
      params.set("maxRating", "2");
    }
    if (analyticsDays !== "all" || customDurationRange?.from) {
      appendReviewDurationParams(params);
    }
    params.set("limit", "500");
    return `/api/reviews?${params.toString()}`;
  }, [selectedLocationIds, statusFilter, sentimentFilter, ratingFilter, analyticsDays, customDurationRange]);

  const { data: reviews, isLoading } = useQuery<ReviewWithLocation[]>({
    queryKey: ["reviews", reviewsUrl],
    queryFn: () => api<ReviewWithLocation[]>(reviewsUrl),
  });

  const statsUrl = useMemo(() => {
    const params = new URLSearchParams();
    appendLocationIdsToParams(params, selectedLocationIds);
    appendReviewDurationParams(params);
    return `/api/reviews/stats?${params.toString()}`;
  }, [selectedLocationIds, analyticsDays, customDurationRange]);

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

  const { data: autoReplyConfig } = useQuery<AutoReplyConfig>({
    queryKey: ["review-auto-reply"],
    queryFn: () => api<AutoReplyConfig>("/api/reviews/auto-reply"),
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

  // Reset page when filters/search change
  useEffect(() => {
    setPage(0);
  }, [
    statusFilter,
    sentimentFilter,
    ratingFilter,
    search,
    selectedLocationIds,
    analyticsDays,
    customDurationRange,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedReviews = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage, PAGE_SIZE]);

  // Inbox KPIs: prefer live /api/reviews/stats (true DB totals).
  // Previously this used the fetched list length (capped at limit) which under-counted.
  const inboxStats = useMemo(() => {
    if (stats) {
      return {
        total: stats.total,
        pending: stats.pendingAll ?? stats.pending,
        negative: stats.negative,
        avg: stats.avgRating,
        fromApi: true as const,
      };
    }
    const list = reviews ?? [];
    const total = list.length;
    const pending = list.filter((r) => r.replyStatus === "pending").length;
    const negative = list.filter((r) => r.rating <= 2).length;
    const avg = total > 0 ? list.reduce((s, r) => s + r.rating, 0) / total : 0;
    return { total, pending, negative, avg, fromApi: false as const };
  }, [stats, reviews]);

  // ---- Mutations ----
  const aiDraftMut = useMutation({
    mutationFn: ({ id, model }: { id: string; model: string }) => {
      const params = new URLSearchParams({ ai: "1", model });
      return api<{ reply: string; model?: string }>(
        `/api/reviews/${id}/reply?${params.toString()}`,
      );
    },
  });

  const publishMut = useMutation({
    mutationFn: ({
      id,
      replyText,
      replySource,
    }: {
      id: string;
      replyText: string;
      replySource?: "manual" | "template";
    }) =>
      api(`/api/reviews/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ replyText, replySource }),
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

  const deleteReplyMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/reviews/${id}/reply`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews-stats"] });
      toast.success("Reply deleted from Google Business Profile");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to delete reply";
      toast.error(msg);
    },
  });

  const bulkTemplateReplyMut = useMutation({
    mutationFn: (reviewIds: string[]) =>
      api<{ replied: number; skipped: number; errors: string[] }>("/api/reviews/bulk-reply", {
        method: "POST",
        body: JSON.stringify({ reviewIds }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews-stats"] });
      setSelectedReviewIds(new Set());
      if (data.replied > 0) {
        toast.success(`Template reply sent to ${data.replied} review(s)`);
      } else {
        toast.error("No reviews were replied — check templates for each star rating");
      }
      if (data.errors?.length) {
        toast.error(data.errors.slice(0, 2).join(" · "));
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Bulk reply failed");
    },
  });

  const runAutoReplyMut = useMutation({
    mutationFn: () =>
      api<{ replied: number; remaining: number; errors: string[] }>("/api/reviews/auto-reply/run", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews-stats"] });
      if (data.replied > 0) {
        toast.success(
          `Auto-replied to ${data.replied} pending review(s)${data.remaining ? ` · ${data.remaining} still pending` : ""}`,
        );
      } else {
        toast.info("No pending reviews matched your auto-reply rules");
      }
      if (data.errors?.length) {
        toast.error(data.errors.slice(0, 2).join(" · "));
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Auto-reply run failed");
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
      toast.loading("Starting Google sync…", { id: "sync-rev" });
      const result = await api<{ started?: boolean; alreadyRunning?: boolean; locations?: number }>(
        "/api/dashboard",
        { method: "POST", body: JSON.stringify({}) },
      );
      qc.invalidateQueries();
      qc.invalidateQueries({ queryKey: ["review-changes"] });
      if (result.alreadyRunning) {
        toast.info("Sync already running — refresh in a few minutes.", { id: "sync-rev" });
      } else {
        toast.success(
          `Sync started for ${result.locations ?? "all"} location(s). Refresh in a few minutes.`,
          { id: "sync-rev", duration: 6000 },
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      toast.error(msg, { id: "sync-rev" });
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    appendLocationIdsToParams(params, selectedLocationIds);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
    appendReviewDurationParams(params);
    const url = `/api/reviews/export?${params.toString()}`;
    window.open(url, "_blank");
    toast.success("Preparing CSV download…");
  }

  function handleAnalyticsExport() {
    const params = new URLSearchParams();
    appendLocationIdsToParams(params, selectedLocationIds);
    if (analyticsDays !== "all" || customDurationRange?.from) {
      appendReviewDurationParams(params);
    }
    window.open(`/api/reviews/export?${params.toString()}`, "_blank");
    toast.success("Preparing analytics CSV…");
  }

  async function handleAiDraft(review: ReviewWithLocation, modelOverride?: string) {
    const model = modelOverride || misaModel;
    if (modelOverride) setMisaModel(modelOverride);
    setActiveReviewId(review.id);
    setAiLoadingId(review.id);
    try {
      const { reply } = await aiDraftMut.mutateAsync({ id: review.id, model });
      setDrafts((d) => ({ ...d, [review.id]: reply }));
      setEditorText(reply);
      setEditorPanel("templates");
      setEditorOpen(true);
      toast.success(`MiSA AI draft ready · ${getOpenRouterModelLabel(model)}`);
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
    if (!activeReviewId || !activeReview) return;
    if (editorText.trim().length < 3) {
      toast.error("Reply must be at least 3 characters");
      return;
    }
    const filled = substituteReviewReplyTemplate(editorText.trim(), {
      customerName: activeReview.authorName,
      businessName: activeReview.locationName,
      category: "Auto Service",
      address: activeReview.locationCity,
      area: activeReview.locationCity,
      city: activeReview.locationCity,
      managerName: user.name,
      rating: activeReview.rating,
    });
    publishMut.mutate({ id: activeReviewId, replyText: filled });
  }

  function handleIgnore(id: string) {
    ignoreMut.mutate(id);
  }

  async function handleQuickTemplateReply(review: ReviewWithLocation) {
    const tplText = resolveQuickReplyTemplate(
      review.rating,
      templates,
      autoReplyConfig,
    );
    if (!tplText) {
      toast.error(
        `No active template for ${review.rating}★ reviews. Set one up in Auto Replies or Templates.`,
      );
      return;
    }
    const filled = applyTemplate(tplText, review, user.name);
    if (filled.trim().length < 3) {
      toast.error("Template reply is too short");
      return;
    }
    setQuickTemplateLoadingId(review.id);
    try {
      await publishMut.mutateAsync({
        id: review.id,
        replyText: filled,
        replySource: "template",
      });
    } catch {
      /* publishMut handles toast */
    } finally {
      setQuickTemplateLoadingId(null);
    }
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

  const pendingOnPage = useMemo(
    () => pagedReviews.filter((r) => r.replyStatus === "pending"),
    [pagedReviews],
  );
  const selectedCount = selectedReviewIds.size;
  const allPendingPageSelected =
    pendingOnPage.length > 0 && pendingOnPage.every((r) => selectedReviewIds.has(r.id));

  function toggleSelectReview(id: string, checked: boolean) {
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllPendingOnPage(checked: boolean) {
    if (!checked) {
      setSelectedReviewIds((prev) => {
        const next = new Set(prev);
        pendingOnPage.forEach((r) => next.delete(r.id));
        return next;
      });
      return;
    }
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      pendingOnPage.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function clearReviewSelection() {
    setSelectedReviewIds(new Set());
  }

  async function handleBulkTemplateReply() {
    if (selectedReviewIds.size === 0) return;
    setBulkReplyBusy(true);
    try {
      await bulkTemplateReplyMut.mutateAsync([...selectedReviewIds]);
    } finally {
      setBulkReplyBusy(false);
    }
  }

  function handleReplyAllPending() {
    runAutoReplyMut.mutate();
  }

  const activeReview =
    reviews?.find((r) => r.id === activeReviewId) ?? null;
  const hasActiveFilters =
    statusFilter !== "all" ||
    sentimentFilter !== "all" ||
    ratingFilter !== "all" ||
    analyticsDays !== "all" ||
    !!customDurationRange?.from ||
    !!search.trim();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Reviews"
        description="Sync, monitor & reply to Google Business Profile reviews"
        icon={Star}
        accent="amber"
        actions={
          <>
            <DurationFilter
              value={analyticsDays}
              onChange={setAnalyticsDays}
              customRange={customDurationRange}
              onCustomRangeChange={setCustomDurationRange}
            />
            <LocationMultiSelect
              locations={locations}
              selectedIds={selectedLocationIds}
              onChange={setSelectedLocationIds}
            />
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
          <TabsTrigger value="deleted-edited">
            <Trash2 className="size-3.5 mr-1.5" /> Deleted & Edited
          </TabsTrigger>
          <TabsTrigger value="auto-replies">
            <Zap className="size-3.5 mr-1.5" /> Auto Replies
          </TabsTrigger>
        </TabsList>

        {/* INBOX TAB */}
        <TabsContent value="inbox" className="space-y-4">
          {/* Compact stat row (kept from existing) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {isLoading && !stats ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
            ) : (
              <>
                <StatCard
                  label="Total Reviews"
                  value={inboxStats.total}
                  icon={Star}
                  accent="emerald"
                  hint={inboxStats.fromApi ? "All synced reviews (live DB)" : "Loaded list only"}
                />
                <StatCard
                  label="Pending Reply"
                  value={inboxStats.pending}
                  icon={MessageSquare}
                  accent="amber"
                  hint="Awaiting response"
                />
                <StatCard
                  label="Avg Rating"
                  value={inboxStats.avg.toFixed(2)}
                  icon={Star}
                  accent="teal"
                  hint="0–5 scale"
                />
                <StatCard
                  label="Negative Reviews"
                  value={inboxStats.negative}
                  icon={Ban}
                  accent="rose"
                  hint="Rating ≤ 2 stars"
                />
              </>
            )}
          </div>
          {stats && reviews && reviews.length < stats.total && statusFilter === "all" && !search.trim() && (
            <p className="text-xs text-muted-foreground -mt-2">
              Showing latest {reviews.length} of {stats.total} reviews in the inbox list. Totals above are the full database count.
            </p>
          )}

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

                  <LayoutToggle value={displayLayout} onChange={setDisplayLayout} />

                  {canReply && inboxStats.pending > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReplyAllPending}
                      disabled={runAutoReplyMut.isPending}
                      className="border-teal-500/40 text-teal-700 dark:text-teal-400"
                    >
                      {runAutoReplyMut.isPending ? (
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Zap className="size-3.5 mr-1.5" />
                      )}
                      Reply all pending
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {canReply && selectedCount > 0 && (
            <Card className="border-teal-500/30 bg-teal-500/5">
              <CardContent className="p-3 flex flex-wrap items-center gap-2 justify-between">
                <span className="text-sm font-medium">
                  {selectedCount} pending review{selectedCount === 1 ? "" : "s"} selected
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleBulkTemplateReply}
                    disabled={bulkReplyBusy || bulkTemplateReplyMut.isPending}
                  >
                    {(bulkReplyBusy || bulkTemplateReplyMut.isPending) ? (
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Zap className="size-3.5 mr-1.5" />
                    )}
                    Apply template to selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearReviewSelection}>
                    Clear selection
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!isLoading && filtered.length > 0 && canReply && pendingOnPage.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground -mt-1">
              <Checkbox
                checked={allPendingPageSelected}
                onCheckedChange={(v) => toggleSelectAllPendingOnPage(!!v)}
                aria-label="Select all pending reviews on this page"
              />
              <span>
                Select pending on this page
                {selectedCount > 0 && (
                  <span className="ml-1 text-primary font-medium">· {selectedCount} selected</span>
                )}
              </span>
            </div>
          )}

          {/* Reviews list / grid (independently scrollable) */}
          <div className="max-h-[calc(100vh-26rem)] overflow-y-auto scroll-area pr-1 -mr-1 space-y-3">
            {isLoading ? (
              displayLayout === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Skeleton key={i} className="h-56 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              )
            ) : filtered.length === 0 ? (
              <EmptyState hasFilters={hasActiveFilters} />
            ) : (
              <>
                <div
                  className={cn(
                    displayLayout === "grid"
                      ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
                      : "flex flex-col gap-2",
                  )}
                >
                  {pagedReviews.map((r) => (
                    <ReviewCard
                      key={r.id}
                      review={r}
                      layout={displayLayout}
                      canReply={canReply}
                      canAiReply={canAiReply}
                      aiLoading={aiLoadingId === r.id}
                      quickTemplateLoading={quickTemplateLoadingId === r.id}
                      hasQuickTemplate={
                        !!resolveQuickReplyTemplate(r.rating, templates, autoReplyConfig)
                      }
                      selected={selectedReviewIds.has(r.id)}
                      onSelectChange={
                        r.replyStatus === "pending" && canReply
                          ? (checked) => toggleSelectReview(r.id, checked)
                          : undefined
                      }
                      onQuickTemplate={() => handleQuickTemplateReply(r)}
                      onAiDraft={(model) => handleAiDraft(r, model)}
                      misaModel={misaModel}
                      onReply={() => handleOpenEditor(r)}
                      onIgnore={() => handleIgnore(r.id)}
                      ignoring={
                        ignoreMut.isPending && ignoreMut.variables === r.id
                      }
                      onDeleteReply={() => deleteReplyMut.mutate(r.id)}
                      deletingReply={
                        deleteReplyMut.isPending && deleteReplyMut.variables === r.id
                      }
                    />
                  ))}
                </div>
                <NumberedPagination
                  page={safePage}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  perPage={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="reviews"
                  sticky
                />
              </>
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
            <AnalyticsDashboard
              stats={stats}
              daysFilter={analyticsDays}
              customRange={customDurationRange}
              onExport={handleAnalyticsExport}
              canExport={canView}
            />
          )}
        </TabsContent>

        {/* DELETED & EDITED REVIEWS TAB */}
        <TabsContent value="deleted-edited" className="space-y-4">
          <DeletedEditedReviews
            daysFilter={analyticsDays}
            customRange={customDurationRange}
          />
        </TabsContent>

        {/* AUTO REPLIES TAB */}
        <TabsContent value="auto-replies" className="space-y-4">
          <AutoRepliesConfig onRunPending={() => runAutoReplyMut.mutate()} runPendingBusy={runAutoReplyMut.isPending} />
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

function AnalyticsDashboard({
  stats,
  daysFilter,
  customRange,
  onExport,
  canExport,
}: {
  stats: ReviewStats;
  daysFilter: DurationValue;
  customRange?: DurationCustomRange | null;
  onExport: () => void;
  canExport: boolean;
}) {
  const periodHint = getDurationLabel(daysFilter, customRange);

  return (
    <div className="space-y-4">
      {/* Rating + NPS overview (reference layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RatingOverviewCard stats={stats} periodHint={periodHint} />
        <NpsScoreCard
          stats={stats}
          onExport={canExport ? onExport : undefined}
        />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Reviews"
          value={stats.total}
          icon={Star}
          accent="emerald"
          hint={periodHint}
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
        <ReviewTrendCard trend={stats.trend} daysFilter={daysFilter} customRange={customRange} />
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

      {/* Review summary + topics — single row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Review Summary</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Text Reviews</span>
                <span className="font-semibold">{stats.total - (stats.sentimentCounts.neutral ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Rating Only</span>
                <span className="font-semibold">{stats.sentimentCounts.neutral ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Replied</span>
                <span className="font-semibold text-emerald-600">{stats.replied} ({stats.responseRate}%)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Not Replied</span>
                <span className="font-semibold text-rose-600">{stats.pending}</span>
              </div>
            </div>
          </CardContent>
        </Card>
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

function RatingOverviewCard({
  stats,
  periodHint,
}: {
  stats: ReviewStats;
  periodHint: string;
}) {
  const sorted = [...stats.ratingDistribution].sort((a, b) => b.rating - a.rating);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Rating</h3>
          </div>
          <Badge variant="secondary" className="text-[10px] font-normal">
            Total Reviews {stats.total}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl font-bold tabular-nums">{stats.avgRating.toFixed(2)}</span>
          <RatingStars rating={Math.round(stats.avgRating)} size={16} />
        </div>
        <div className="space-y-2">
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
              <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden relative">
                <div
                  className={cn("h-full rounded-md", RATING_BAR_COLORS[d.rating])}
                  style={{ width: `${Math.max(d.percentage, d.count > 0 ? 4 : 0)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium tabular-nums">
                  {d.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">{periodHint}</p>
      </CardContent>
    </Card>
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

function ReviewTrendCard({
  trend,
  daysFilter,
  customRange,
}: {
  trend: ReviewStats["trend"];
  daysFilter: DurationValue;
  customRange?: DurationCustomRange | null;
}) {
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
            <h3 className="text-sm font-semibold">
              {daysFilter === "custom"
                ? `${getDurationLabel(daysFilter, customRange)} Trend`
                : daysFilter === "all"
                  ? "30-Day Review Trend"
                  : `${daysFilter}-Day Review Trend`}
            </h3>
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
// Subcomponents — ReviewCard, Pagination, SlaBadge, ReplyStatusBadge, EmptyState
// ============================================================================

function ReviewCardActions({
  review,
  canReply,
  canAiReply,
  aiLoading,
  quickTemplateLoading,
  hasQuickTemplate,
  onQuickTemplate,
  onAiDraft,
  misaModel,
  onReply,
  onIgnore,
  ignoring,
  onDeleteReply,
  deletingReply,
  compact,
}: {
  review: ReviewWithLocation;
  canReply: boolean;
  canAiReply: boolean;
  aiLoading: boolean;
  quickTemplateLoading: boolean;
  hasQuickTemplate: boolean;
  onQuickTemplate: () => void;
  onReply: () => void;
  onAiDraft: (model?: string) => void;
  misaModel: string;
  onIgnore: () => void;
  ignoring: boolean;
  onDeleteReply: () => void;
  deletingReply: boolean;
  compact?: boolean;
}) {
  if (!canReply) return null;
  const hasReply = !!review.replyText && review.replyStatus === "replied";
  const btn = compact ? "h-8 px-2.5 text-xs" : "min-h-11";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", !compact && "pt-1 border-t gap-2")}>
      {hasReply && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onDeleteReply}
          disabled={deletingReply}
          className={cn(btn, "text-rose-600 hover:text-rose-700 hover:bg-rose-500/10")}
        >
          {deletingReply ? (
            <Loader2 className="size-3.5 mr-1 animate-spin" />
          ) : (
            <Trash2 className="size-3.5 mr-1" />
          )}
          {compact ? "Delete" : "Delete reply"}
        </Button>
      )}
      {canAiReply && (
        <div className="inline-flex items-stretch rounded-md shadow-xs">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAiDraft(misaModel)}
            disabled={aiLoading}
            className={cn(
              btn,
              "rounded-r-none border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
            )}
          >
            {aiLoading ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" /> MiSA…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1" /> {compact ? "MiSA" : "MiSA AI draft"}
              </>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={aiLoading}
                className={cn(
                  compact ? "h-8 px-1.5" : "min-h-11 px-2",
                  "rounded-l-none border-l-0 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
                )}
                aria-label="Choose MiSA AI model"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                <Cpu className="size-3.5" /> OpenRouter model
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MISA_MODEL_OPTIONS.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => onAiDraft(m.id)}
                  className="text-xs"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {m.label}
                      {m.id === misaModel ? " · selected" : ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {m.provider}{m.free ? " · free" : ""}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {!hasReply && review.replyStatus === "pending" && (
        <Button
          size="sm"
          variant="outline"
          onClick={onQuickTemplate}
          disabled={quickTemplateLoading || !hasQuickTemplate}
          title={
            hasQuickTemplate
              ? `Send ${review.rating}★ template reply to Google`
              : `No active template for ${review.rating}★ reviews`
          }
          className={cn(
            btn,
            "border-teal-500/40 text-teal-700 dark:text-teal-400 hover:bg-teal-500/10 disabled:opacity-50",
          )}
        >
          {quickTemplateLoading ? (
            <Loader2 className="size-3.5 mr-1 animate-spin" />
          ) : (
            <Zap className="size-3.5 mr-1" />
          )}
          {compact ? "Template" : "Quick template reply"}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onReply} className={btn}>
        <MessageSquare className="size-3.5 mr-1" />
        {hasReply ? "Edit" : "Reply"}
      </Button>
      {review.replyStatus !== "ignored" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onIgnore}
          disabled={ignoring}
          className={cn(btn, "ml-auto text-muted-foreground hover:text-rose-600")}
        >
          {ignoring ? (
            <Loader2 className="size-3.5 mr-1 animate-spin" />
          ) : (
            <EyeOff className="size-3.5 mr-1" />
          )}
          Ignore
        </Button>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  layout = "grid",
  canReply,
  canAiReply,
  aiLoading,
  quickTemplateLoading,
  hasQuickTemplate,
  selected = false,
  onSelectChange,
  onQuickTemplate,
  onAiDraft,
  misaModel,
  onReply,
  onIgnore,
  ignoring,
  onDeleteReply,
  deletingReply,
}: {
  review: ReviewWithLocation;
  layout?: LayoutMode;
  canReply: boolean;
  canAiReply: boolean;
  aiLoading: boolean;
  quickTemplateLoading: boolean;
  hasQuickTemplate: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
  onQuickTemplate: () => void;
  onReply: () => void;
  onAiDraft: (model?: string) => void;
  misaModel: string;
  onIgnore: () => void;
  ignoring: boolean;
  onDeleteReply: () => void;
  deletingReply: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNegative = review.rating <= 2;
  const hasReply = !!review.replyText && review.replyStatus === "replied";
  const isLong = review.text.length > 180;
  const isPending = review.replyStatus === "pending";
  const sla = isPending
    ? computeSla(review.createdAt, review.rating)
    : null;

  const selectBox = onSelectChange ? (
    <Checkbox
      checked={selected}
      onCheckedChange={(v) => onSelectChange(!!v)}
      aria-label={`Select review from ${review.authorName}`}
      className="mt-1 shrink-0"
    />
  ) : null;

  const actions = (
    <ReviewCardActions
      review={review}
      canReply={canReply}
      canAiReply={canAiReply}
      aiLoading={aiLoading}
      quickTemplateLoading={quickTemplateLoading}
      hasQuickTemplate={hasQuickTemplate}
      onQuickTemplate={onQuickTemplate}
      onAiDraft={onAiDraft}
      misaModel={misaModel}
      onReply={onReply}
      onIgnore={onIgnore}
      ignoring={ignoring}
      onDeleteReply={onDeleteReply}
      deletingReply={deletingReply}
      compact={layout === "list"}
    />
  );

  if (layout === "list") {
    return (
      <Card
        className={cn(
          "p-0 overflow-hidden transition-shadow hover:shadow-md",
          isNegative && "border-l-4 border-l-rose-500",
        )}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-start gap-3">
            <div className="flex items-start gap-3 min-w-0 lg:w-[220px] shrink-0">
              {selectBox}
              <Avatar className="size-9">
                {review.authorPhoto && (
                  <AvatarImage src={review.authorPhoto} alt={review.authorName} />
                )}
                <AvatarFallback className={colorFor(review.authorName)}>
                  {initials(review.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{review.authorName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {review.locationName} · {review.locationCity}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <RatingStars rating={review.rating} size={14} />
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm leading-relaxed text-foreground/90 line-clamp-2 whitespace-pre-line">
                {review.text}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <SentimentBadge sentiment={review.sentiment} />
                <ReplyStatusBadge status={review.replyStatus} source={review.replySource} />
                {sla && (
                  <SlaBadge
                    status={sla.status}
                    target={sla.targetLabel}
                    remainingMs={sla.remainingMs}
                  />
                )}
                {hasReply && review.replyText && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                    Reply: {review.replyText}
                  </span>
                )}
              </div>
            </div>

            <div className="lg:max-w-[420px] shrink-0">{actions}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "p-0 overflow-hidden transition-shadow hover:shadow-md h-full",
        isNegative && "border-l-4 border-l-rose-500",
      )}
    >
      <CardContent className="p-4 space-y-3 flex flex-col h-full">
        <div className="flex items-start gap-3">
          {selectBox}
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

        <div className="flex-1">
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

        {hasReply && review.replyText && (
          <div className="rounded-lg bg-muted/40 border border-muted p-3">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">
                {review.replySource === "ai"
                  ? "Replied by MiSA AI"
                  : review.replySource === "template"
                    ? "Replied with template"
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

        {actions}
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
          : source === "template"
            ? " · Template"
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

function NpsScoreCard({
  stats,
  onExport,
}: {
  stats: ReviewStats;
  onExport?: () => void;
}) {
  const nps = stats.nps;
  const segments = [
    { name: "Promoters", value: nps.promoters, color: "#22c55e" },
    { name: "Passives", value: nps.passives, color: "#94a3b8" },
    { name: "Detractors", value: nps.detractors, color: "#ef4444" },
  ].filter((d) => d.value > 0);
  const donutData =
    segments.length > 0 ? segments : [{ name: "Empty", value: 1, color: "#e2e8f0" }];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">NPS Score</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-normal">
              Total Reviews {stats.total}
            </Badge>
            {onExport && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onExport}>
                <Download className="size-3 mr-1" /> Export CSV
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative size-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={52}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-bold tabular-nums">
              {nps.score.toFixed(2)}{" "}
              <span className="text-base font-semibold text-muted-foreground">NPS</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t">
          <NpsBreakdownItem
            label="Promoters"
            pct={nps.promoterPct}
            color="bg-emerald-500"
            textColor="text-emerald-600"
          />
          <NpsBreakdownItem
            label="Passives"
            pct={nps.passivePct}
            color="bg-slate-400"
            textColor="text-slate-600"
          />
          <NpsBreakdownItem
            label="Detractors"
            pct={nps.detractorPct}
            color="bg-rose-500"
            textColor="text-rose-600"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function NpsBreakdownItem({
  label,
  pct,
  color,
  textColor,
}: {
  label: string;
  pct: number;
  color: string;
  textColor: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
        <span className={cn("size-2 rounded-full", color)} />
        {label}
      </div>
      <div className={cn("text-sm font-bold tabular-nums", textColor)}>{pct}%</div>
    </div>
  );
}

function DeletedEditedReviews({
  daysFilter,
  customRange,
}: {
  daysFilter: DurationValue;
  customRange?: DurationCustomRange | null;
}) {
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const [subTab, setSubTab] = useState<"deleted" | "edited">("deleted");

  const changesUrl = useMemo(() => {
    const params = new URLSearchParams();
    appendLocationIdsToParams(params, selectedLocationIds);
    appendDurationToParams(params, daysFilter, customRange);
    return `/api/reviews/changes?${params.toString()}`;
  }, [selectedLocationIds, daysFilter, customRange]);

  const { data, isLoading } = useQuery<{
    items: ReviewChangeWithLocation[];
    deletedCount: number;
    editedCount: number;
  }>({
    queryKey: ["review-changes", changesUrl],
    queryFn: () =>
      api<{ items: ReviewChangeWithLocation[]; deletedCount: number; editedCount: number }>(
        changesUrl,
      ),
  });

  const deletedItems = useMemo(
    () => data?.items.filter((i) => i.changeType === "deleted") ?? [],
    [data],
  );
  const editedItems = useMemo(
    () => data?.items.filter((i) => i.changeType === "edited") ?? [],
    [data],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Deleted & Edited Reviews</h3>
        <Badge variant="outline" className="text-xs">Beta</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card
          className={cn(
            "cursor-pointer transition",
            subTab === "deleted" ? "ring-2 ring-rose-500/40" : "hover:ring-2 hover:ring-rose-500/30",
          )}
          onClick={() => setSubTab("deleted")}
        >
          <CardContent className="p-5 text-center">
            <Trash2 className="size-6 text-rose-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-rose-600 tabular-nums">
              {isLoading ? "—" : data?.deletedCount ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Deleted Reviews</div>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "cursor-pointer transition",
            subTab === "edited" ? "ring-2 ring-blue-500/40" : "hover:ring-2 hover:ring-blue-500/30",
          )}
          onClick={() => setSubTab("edited")}
        >
          <CardContent className="p-5 text-center">
            <Pencil className="size-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600 tabular-nums">
              {isLoading ? "—" : data?.editedCount ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Edited Reviews</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "deleted" | "edited")}>
        <TabsList>
          <TabsTrigger value="deleted" className="text-xs">Deleted Reviews</TabsTrigger>
          <TabsTrigger value="edited" className="text-xs">Edited Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="deleted">
          <ReviewChangeList
            items={deletedItems}
            isLoading={isLoading}
            emptyIcon={Trash2}
            emptyTitle="No Deleted Reviews Detected"
            emptyText="When a review is deleted from Google, it will be tracked here after the next sync."
            mode="deleted"
          />
        </TabsContent>

        <TabsContent value="edited">
          <ReviewChangeList
            items={editedItems}
            isLoading={isLoading}
            emptyIcon={Pencil}
            emptyTitle="No Edited Reviews Detected"
            emptyText="When a reviewer edits their review on Google, changes appear here after the next sync."
            mode="edited"
          />
        </TabsContent>
      </Tabs>

      <Card className="border-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-blue-700 dark:text-blue-400">How This Works</div>
              <p className="text-xs text-muted-foreground mt-1">
                Deleted and edited reviews are detected during each sync by comparing the current Google reviews with previously synced data.
                Run Sync regularly to detect changes accurately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewChangeList({
  items,
  isLoading,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyText,
  mode,
}: {
  items: ReviewChangeWithLocation[];
  isLoading: boolean;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
  mode: "deleted" | "edited";
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <EmptyIcon className="size-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-sm font-semibold">{emptyTitle}</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{emptyText}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {items.map((item) => (
          <div key={item.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{item.authorName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.locationName} · {item.locationCity}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {formatDistanceToNow(parseISO(item.detectedAt), { addSuffix: true })}
              </Badge>
            </div>
            {mode === "deleted" ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <RatingStars rating={item.previousRating ?? 0} size={12} />
                  <span className="text-xs text-muted-foreground">before deletion</span>
                </div>
                {item.previousText ? (
                  <p className="text-muted-foreground italic line-clamp-3">&ldquo;{item.previousText}&rdquo;</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Rating-only review</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-rose-500/5 p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase text-rose-600 mb-1">Before</p>
                  <RatingStars rating={item.previousRating ?? 0} size={12} />
                  <p className="text-muted-foreground italic mt-1 line-clamp-3 text-xs">
                    {item.previousText || "Rating only"}
                  </p>
                </div>
                <div className="rounded-lg border bg-emerald-500/5 p-3 text-sm">
                  <p className="text-[10px] font-semibold uppercase text-emerald-600 mb-1">After</p>
                  <RatingStars rating={item.newRating ?? 0} size={12} />
                  <p className="text-muted-foreground italic mt-1 line-clamp-3 text-xs">
                    {item.newText || "Rating only"}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AutoRepliesConfig({
  onRunPending,
  runPendingBusy = false,
}: {
  onRunPending?: () => void;
  runPendingBusy?: boolean;
}) {
  const user = useUser();
  const qc = useQueryClient();
  const { data: locations } = useLocations();
  const canReply = can(user.role, "reviews.reply");
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode] = useState<"manual" | "ai" | "history">("manual");
  const [config, setConfig] = useState<AutoReplyConfig>(() => mergeAutoReplyConfig(null));
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleText, setSampleText] = useState("");

  const { data: savedConfig, isLoading: configLoading } = useQuery<AutoReplyConfig>({
    queryKey: ["review-auto-reply"],
    queryFn: () => api<AutoReplyConfig>("/api/reviews/auto-reply"),
  });

  useEffect(() => {
    if (savedConfig) setConfig(savedConfig);
  }, [savedConfig]);

  const { data: templates } = useQuery<ReplyTemplate[]>({
    queryKey: ["reply-templates"],
    queryFn: () => api<ReplyTemplate[]>("/api/reviews/templates"),
  });

  const saveMut = useMutation({
    mutationFn: (payload: AutoReplyConfig) =>
      api<AutoReplyConfig>("/api/reviews/auto-reply", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      setConfig(data);
      qc.invalidateQueries({ queryKey: ["review-auto-reply"] });
      qc.invalidateQueries({ queryKey: ["reply-templates"] });
      qc.invalidateQueries({ queryKey: ["review-templates"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews-stats"] });
      const backlog = (data as AutoReplyConfig & { backlogResult?: { replied?: number } }).backlogResult;
      if (backlog?.replied && backlog.replied > 0) {
        toast.success(`Auto reply saved · replied to ${backlog.replied} pending review(s)`);
      } else {
        toast.success("Auto reply settings saved");
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to save auto reply");
    },
  });

  function patchConfig(partial: Partial<AutoReplyConfig>) {
    setConfig((prev) => ({ ...prev, ...partial }));
  }

  function toggleRating(r: number) {
    setConfig((prev) => ({
      ...prev,
      selectedRatings: prev.selectedRatings.includes(r)
        ? prev.selectedRatings.filter((x) => x !== r)
        : [...prev.selectedRatings, r],
    }));
  }

  function toggleReviewType(type: AutoReplyReviewType) {
    setConfig((prev) => ({
      ...prev,
      reviewTypes: prev.reviewTypes.includes(type)
        ? prev.reviewTypes.filter((t) => t !== type)
        : [...prev.reviewTypes, type],
    }));
  }

  function insertVariable(tag: string) {
    const token = `{{${tag}}}`;
    const el = templateRef.current;
    if (!el) {
      patchConfig({ template: config.template + token });
      return;
    }
    const start = el.selectionStart ?? config.template.length;
    const end = el.selectionEnd ?? start;
    const next = config.template.slice(0, start) + token + config.template.slice(end);
    patchConfig({ template: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function buildSampleReply() {
    const loc = locations?.[0];
    let text = substituteReviewReplyTemplate(config.template, {
      businessName: loc?.name ?? "My FNG",
      category: "Auto Service",
      address: loc?.city ?? "",
      area: loc?.city ?? "Mumbai",
      customerName: "Rajesh Kumar",
      phone: loc?.phone ?? "+91 98765 43210",
      managerName: user.name,
      city: loc?.city ?? "Mumbai",
      rating: 5,
    });
    if (config.advanced.addRegards && !/regards/i.test(text)) {
      text += `\n\nRegards,\n${config.advanced.supportName || loc?.name || "My FNG Team"}`;
    }
    if (config.advanced.addSupportFooter) {
      const parts = [
        config.advanced.supportEmail,
        config.advanced.supportPhone,
        config.advanced.supportLink,
      ].filter(Boolean);
      if (parts.length) text += `\n\nSupport: ${parts.join(" · ")}`;
    }
    if (config.addEmoji && !/[\u{1F300}-\u{1FAFF}]/u.test(text)) {
      text += " 🙏";
    }
    const limit = autoReplyCharLimit(config.replyLength);
    if (text.length > limit) text = text.slice(0, limit - 3) + "...";
    setSampleText(text);
    setSampleOpen(true);
  }

  function handleSave() {
    if (!canReply) {
      toast.error("You don't have permission to save auto replies");
      return;
    }
    if (config.enabled && mode === "manual" && !config.template.trim()) {
      toast.error("Please write a reply template before saving");
      return;
    }
    if (config.selectedRatings.length === 0) {
      toast.error("Select at least one star rating");
      return;
    }
    saveMut.mutate({ ...config, mode: mode === "ai" ? "ai" : "manual" });
  }

  function handleStopAll() {
    saveMut.mutate({ ...config, enabled: false });
  }

  const wordCount = config.template.trim() ? config.template.trim().split(/\s+/).length : 0;
  const charCount = config.template.length;
  const charLimit = autoReplyCharLimit(config.replyLength);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Set Auto Reply</h3>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => patchConfig({ enabled })}
              disabled={!canReply}
            />
            <span className="text-xs text-muted-foreground">{config.enabled ? "ON" : "OFF"}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={buildSampleReply}
          disabled={!config.template.trim()}
        >
          <Sparkles className="size-3.5" /> AI Generate Sample Reply
        </Button>
      </div>

      {configLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="manual" className="text-xs">Manual</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs">With AI</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">Template History</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium mb-2 block">Source</label>
                <Badge variant="outline" className="text-xs">Google</Badge>
              </div>

              <div>
                <label className="text-xs font-medium mb-2 block">Rating Filter</label>
                <div className="flex flex-wrap gap-2">
                  {[5, 4, 3, 2, 1].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRating(r)}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition",
                        config.selectedRatings.includes(r)
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : "bg-muted border-transparent text-muted-foreground",
                      )}
                    >
                      {r} <Star className="size-3 fill-current" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-2 block">Review Type</label>
                <div className="flex gap-2">
                  {(["text", "no_text"] as const).map((type) => (
                    <Badge
                      key={type}
                      variant="outline"
                      className={cn(
                        "cursor-pointer",
                        config.reviewTypes.includes(type) && "bg-primary/10 border-primary text-primary",
                      )}
                      onClick={() => toggleReviewType(type)}
                    >
                      {type === "text" ? "Text" : "No Text"}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-2 block">Reply Template</label>
                <div className="rounded-lg border bg-muted/30 p-3 min-h-[120px]">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {["BusinessName", "Category", "Address", "Area", "CustomerName", "Phone"].map((tag) => (
                      <Button
                        key={tag}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => insertVariable(tag)}
                      >
                        {`{{${tag}}}`}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    ref={templateRef}
                    value={config.template}
                    onChange={(e) => patchConfig({ template: e.target.value })}
                    placeholder="Write your auto reply template here..."
                    className="min-h-[120px] bg-transparent border-0 p-0 resize-y focus-visible:ring-0"
                    disabled={!canReply}
                  />
                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>
                      Word Count: {wordCount} | Character Count: {charCount}
                      {charCount > charLimit && (
                        <span className="text-rose-500 ml-1">(exceeds {charLimit} limit)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-2 block">Select Length</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patchConfig({ replyLength: "short" })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                      config.replyLength === "short"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-muted",
                    )}
                  >
                    Short - 400 Chars
                  </button>
                  <button
                    type="button"
                    onClick={() => patchConfig({ replyLength: "long" })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                      config.replyLength === "long"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-muted",
                    )}
                  >
                    Long - 1500 Chars
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Add Emoji</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patchConfig({ addEmoji: true })}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border",
                      config.addEmoji ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-muted",
                    )}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => patchConfig({ addEmoji: false })}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border",
                      !config.addEmoji ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-muted",
                    )}
                  >
                    No
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 dark:border-blue-900/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Advance Settings</span>
                  <Switch
                    checked={config.advanced.addSupportFooter || config.advanced.addRegards || !!config.advanced.supportName}
                    onCheckedChange={(open) => {
                      if (!open) {
                        patchConfig({
                          advanced: {
                            ...config.advanced,
                            addSupportFooter: false,
                            addRegards: false,
                          },
                        });
                      }
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={buildSampleReply}
                  disabled={!config.template.trim()}
                >
                  Generate Sample Reply
                </Button>
              </div>
              <div className="mt-4 space-y-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium mb-1 block">Support Brand Name</label>
                    <Input
                      value={config.advanced.supportName}
                      onChange={(e) =>
                        patchConfig({ advanced: { ...config.advanced, supportName: e.target.value } })
                      }
                      placeholder="e.g. MyFNG"
                      className="h-8 text-xs"
                      disabled={!canReply}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium mb-1 block">Support Email Address</label>
                    <Input
                      value={config.advanced.supportEmail}
                      onChange={(e) =>
                        patchConfig({ advanced: { ...config.advanced, supportEmail: e.target.value } })
                      }
                      placeholder="support@example.com"
                      className="h-8 text-xs"
                      disabled={!canReply}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium mb-1 block">Support Phone No.</label>
                    <Input
                      value={config.advanced.supportPhone}
                      onChange={(e) =>
                        patchConfig({ advanced: { ...config.advanced, supportPhone: e.target.value } })
                      }
                      placeholder="+91..."
                      className="h-8 text-xs"
                      disabled={!canReply}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium mb-1 block">Support Link</label>
                    <Input
                      value={config.advanced.supportLink}
                      onChange={(e) =>
                        patchConfig({ advanced: { ...config.advanced, supportLink: e.target.value } })
                      }
                      placeholder="https://..."
                      className="h-8 text-xs"
                      disabled={!canReply}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5">
                    <Switch
                      className="scale-75"
                      checked={config.advanced.addSupportFooter}
                      onCheckedChange={(addSupportFooter) =>
                        patchConfig({ advanced: { ...config.advanced, addSupportFooter } })
                      }
                      disabled={!canReply}
                    />
                    Add Support details in Reply Footer
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Switch
                      className="scale-75"
                      checked={config.advanced.addRegards}
                      onCheckedChange={(addRegards) =>
                        patchConfig({ advanced: { ...config.advanced, addRegards } })
                      }
                      disabled={!canReply}
                    />
                    Add Regards in Reply
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-900 text-white"
              onClick={handleSave}
              disabled={!canReply || saveMut.isPending}
            >
              {saveMut.isPending ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                "Save & reply to pending"
              )}
            </Button>
            {onRunPending && (
              <Button
                variant="outline"
                className="gap-1.5 border-teal-500/40 text-teal-700 dark:text-teal-400"
                onClick={onRunPending}
                disabled={!canReply || !config.enabled || runPendingBusy}
              >
                {runPendingBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5" />
                )}
                Reply to pending now
              </Button>
            )}
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={handleStopAll}
              disabled={!canReply || saveMut.isPending}
            >
              <Ban className="size-3.5" /> Stop All Review Auto Reply
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Saving with auto-reply ON applies your per-star templates to all matching pending reviews.
            New reviews also auto-reply after sync when enabled.
          </p>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardContent className="p-8 text-center">
              <Sparkles className="size-10 text-amber-500 mx-auto mb-3" />
              <h4 className="text-sm font-semibold">AI-Powered Auto Replies</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                MiSA AI analyzes each review&apos;s sentiment, keywords, and context to generate personalized replies automatically.
              </p>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => {
                  patchConfig({ enabled: true, mode: "ai" });
                  setMode("ai");
                  saveMut.mutate({ ...config, enabled: true, mode: "ai" });
                }}
                disabled={!canReply || saveMut.isPending}
              >
                <Sparkles className="size-3.5 mr-1.5" /> Enable AI Auto Reply
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Pre-Written Templates</h4>
          </div>
          {templates && templates.length > 0 ? (
            <div className="grid gap-3">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{t.title}</span>
                        <Badge variant="outline" className="text-[10px]">{t.rating} star</Badge>
                        {!t.isActive && (
                          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.template}</p>
                    <div className="text-[10px] text-muted-foreground mt-2">
                      Template Type: {t.language === "manual" ? "Manual Reply" : "AI Reply"} | Created:{" "}
                      {safeFormatDate(t.createdAt, "MMM d, yyyy")}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="size-10 text-muted-foreground mx-auto mb-3" />
                <h4 className="text-sm font-semibold">No Templates Yet</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Save auto replies from the Manual tab to create templates here.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      )}

      <Dialog open={sampleOpen} onOpenChange={setSampleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sample Auto Reply</DialogTitle>
            <DialogDescription>Preview with sample customer and location data</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{sampleText}</div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/50">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-purple-500" /> Tips to Improve Ranking
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: "Sentimental Auto-Reply", desc: "AI-generated auto replies based on sentiment and keywords to provide relevant responses." },
              { title: "Addition of Keywords", desc: "Add relevant keywords in auto-replies to improve your profile ranking on Google Maps." },
              { title: "Support Details in Auto Reply", desc: "Include escalation email and support number for creating support tickets." },
              { title: "Impact on Profile Strength", desc: "Review replies help with escalations. Rating has 30% impact on ranking." },
            ].map(tip => (
              <div key={tip.title} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold">{tip.title}</div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tip.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

