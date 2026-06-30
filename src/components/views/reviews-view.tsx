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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "replied" | "ignored";
type SentimentFilter = "all" | "positive" | "neutral" | "negative";
type RatingFilter = "all" | "5" | "4" | "3" | "low";

const AVATAR_COLORS = [
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-slate-500/15 text-slate-700 dark:text-slate-300",
];

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

const MAX_REPLY = 4096;

export function ReviewsView() {
  const user = useUser();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const qc = useQueryClient();

  const canReply = can(user.role, "reviews.reply");
  const canAiReply = can(user.role, "reviews.ai_reply");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [search, setSearch] = useState("");

  // reply editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");

  const { data: locations } = useLocations();

  // Build reviews query URL from active filters
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

  // Client-side search across author / text / location
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

  // Stats — computed from fetched set (pre-search) so card counts don't jitter while typing
  const stats = useMemo(() => {
    const list = reviews ?? [];
    const total = list.length;
    const pending = list.filter((r) => r.replyStatus === "pending").length;
    const negative = list.filter((r) => r.rating <= 2).length;
    const avg = total > 0 ? list.reduce((s, r) => s + r.rating, 0) / total : 0;
    return { total, pending, negative, avg };
  }, [reviews]);

  // Mutations
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
      toast.success("Review marked as ignored");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to ignore review";
      toast.error(msg);
    },
  });

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

  async function handleAiDraft(review: ReviewWithLocation) {
    setActiveReviewId(review.id);
    setAiLoadingId(review.id);
    try {
      const { reply } = await aiDraftMut.mutateAsync(review.id);
      setDrafts((d) => ({ ...d, [review.id]: reply }));
      setEditorText(reply);
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
              <SelectTrigger size="sm" className="min-w-[180px]">
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
            <Button size="sm" onClick={handleSync}>
              <RefreshCw className="size-3.5 mr-1.5" /> Sync
            </Button>
          </>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Reviews"
              value={stats.total}
              icon={Star}
              accent="emerald"
              hint="In current filter"
            />
            <StatCard
              label="Pending Reply"
              value={stats.pending}
              icon={MessageSquare}
              accent="amber"
              hint="Awaiting response"
            />
            <StatCard
              label="Avg Rating"
              value={stats.avg.toFixed(2)}
              icon={Star}
              accent="teal"
              hint="0–5 scale"
            />
            <StatCard
              label="Negative Reviews"
              value={stats.negative}
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
                <SelectTrigger size="sm" className="min-w-[140px]">
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

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search reviews…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 min-w-[180px] h-9"
                  aria-label="Search reviews by author, text, or location"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviews list (independently scrollable) */}
      <div className="max-h-[calc(100vh-20rem)] overflow-y-auto scroll-area pr-1 -mr-1">
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

      {/* Reply editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
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
              <p className="text-muted-foreground italic line-clamp-4">
                &ldquo;{activeReview.text}&rdquo;
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              placeholder="Write a thoughtful, on-brand reply…"
              className="min-h-[140px] resize-y"
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

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={publishMut.isPending}
            >
              Save draft
            </Button>
            <Button
              onClick={handlePublish}
              disabled={
                publishMut.isPending || editorText.trim().length < 3
              }
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
    </div>
  );
}

// ---------- subcomponents ----------

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
  const hasReply =
    !!review.replyText && review.replyStatus === "replied";
  const isLong = review.text.length > 180;

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
