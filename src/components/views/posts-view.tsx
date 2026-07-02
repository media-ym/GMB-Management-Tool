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
import { PostStatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  FileText, Newspaper, Tag, CalendarDays, Info, Plus, MoreVertical,
  Send, CalendarClock, Pencil, Trash2, Sparkles, ArrowRight, CheckCircle2,
  Clock, Wand2, ExternalLink, MapPin, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import type { PostWithLocation, PostType } from "@/lib/types";

/* ---------- Static metadata ---------- */

type StatusFilter = "all" | "published" | "scheduled" | "draft";
type TypeFilter = "all" | PostType;

interface TypeMeta {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tint: string;
}

const TYPE_META: Record<PostType, TypeMeta> = {
  whats_new: { icon: Newspaper,   label: "What's New", tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  offer:     { icon: Tag,         label: "Offer",      tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  event:     { icon: CalendarDays,label: "Event",      tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  update:    { icon: Info,        label: "Update",     tint: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

const CTA_OPTIONS = [
  { value: "book",       label: "Book" },
  { value: "order",      label: "Order" },
  { value: "sign_up",    label: "Sign up" },
  { value: "call",       label: "Call" },
  { value: "learn_more", label: "Learn more" },
] as const;

const CTA_LABEL: Record<string, string> = {
  book: "Book",
  order: "Order",
  sign_up: "Sign up",
  call: "Call",
  learn_more: "Learn more",
};

/* ---------- Helpers ---------- */

function postTypeLabel(t: string): string {
  return TYPE_META[t as PostType]?.label ?? t;
}

function postTypeMeta(t: string): TypeMeta {
  return TYPE_META[t as PostType] ?? TYPE_META.update;
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

/* ---------- Main view ---------- */

export function PostsView() {
  const user = useUser();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const qc = useQueryClient();
  const { data: locations } = useLocations();

  const canManage = can(user.role, "posts.manage");

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingPost, setEditingPost] = React.useState<PostWithLocation | null>(null);
  const [deletingPost, setDeletingPost] = React.useState<PostWithLocation | null>(null);

  // Build query params
  const params = new URLSearchParams();
  if (activeLocationId && activeLocationId !== "all") params.set("locationId", activeLocationId);
  if (statusFilter !== "all") params.set("status", statusFilter);
  params.set("limit", "500");

  const { data: posts, isLoading } = useQuery<PostWithLocation[]>({
    queryKey: ["posts", activeLocationId, statusFilter],
    queryFn: () => api<PostWithLocation[]>(`/api/posts?${params.toString()}`),
  });

  const allPosts = posts ?? [];

  // Compute stats from a fuller dataset when possible.
  // We re-fetch unfiltered counts only if user is filtering so the stat row reflects totals.
  const { data: allPostsData } = useQuery<PostWithLocation[]>({
    queryKey: ["posts", activeLocationId, "all"],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activeLocationId && activeLocationId !== "all") p.set("locationId", activeLocationId);
      p.set("limit", "500");
      return api<PostWithLocation[]>(`/api/posts?${p.toString()}`);
    },
  });
  const statsSource = allPostsData ?? allPosts;

  const stats = React.useMemo(() => {
    const published = statsSource.filter((p) => p.status === "published").length;
    const scheduled = statsSource.filter((p) => p.status === "scheduled").length;
    const drafts = statsSource.filter((p) => p.status === "draft").length;
    const aiGenerated = statsSource.filter((p) => p.source === "ai").length;
    return { published, scheduled, drafts, aiGenerated };
  }, [statsSource]);

  const filtered = React.useMemo(() => {
    let list = allPosts;
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    return list;
  }, [allPosts, typeFilter]);

  function openCreate() {
    setEditingPost(null);
    setEditorOpen(true);
  }
  function openEdit(p: PostWithLocation) {
    setEditingPost(p);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditingPost(null);
  }

  async function publishNow(p: PostWithLocation) {
    try {
      toast.loading("Publishing to Google…", { id: `pub-${p.id}` });
      await api(`/api/posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
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
      toast.success("Post deleted", { id: `del-${p.id}` });
      setDeletingPost(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete", { id: `del-${p.id}` });
    }
  }

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ["posts"] });
    closeEditor();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Google Posts"
        description="Create, schedule & publish posts to Google Business Profile"
        icon={FileText}
        actions={
          <>
            <Select value={activeLocationId} onValueChange={(v) => setActiveLocationId(v as any)}>
              <SelectTrigger size="sm" className="w-full sm:w-[200px]">
                <MapPin className="size-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} — {l.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-3.5 mr-1.5" /> New post
              </Button>
            )}
          </>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Published"    value={stats.published}   icon={CheckCircle2} accent="emerald" hint="Live on Google" />
            <StatCard label="Scheduled"    value={stats.scheduled}   icon={CalendarClock} accent="amber"   hint="Queued for later" />
            <StatCard label="Drafts"       value={stats.drafts}      icon={FileText}     accent="slate"   hint="Not yet published" />
            <StatCard label="AI-Generated" value={stats.aiGenerated} icon={Sparkles}     accent="amber"   hint="By MiSA AI" />
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
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

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger size="sm" className="w-full sm:w-[180px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="whats_new">What's New</SelectItem>
            <SelectItem value="offer">Offer</SelectItem>
            <SelectItem value="event">Event</SelectItem>
            <SelectItem value="update">Update</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Posts grid */}
      {isLoading ? (
        <PostsGridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState canManage={canManage} onCreate={openCreate} />
      ) : (
        <div className="max-h-[calc(100vh-22rem)] overflow-y-auto scroll-area pr-0.5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-2">
            {filtered.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                canManage={canManage}
                onPublish={publishNow}
                onEdit={openEdit}
                onDelete={setDeletingPost}
              />
            ))}
          </div>
        </div>
      )}

      {/* Editor dialog */}
      <PostEditorDialog
        open={editorOpen}
        onOpenChange={(o) => (o ? setEditorOpen(true) : closeEditor())}
        post={editingPost}
        locations={locations ?? []}
        defaultLocationId={activeLocationId !== "all" ? activeLocationId : undefined}
        onSaved={handleSaved}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deletingPost} onOpenChange={(o) => !o && setDeletingPost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPost && (
                <>
                  This will permanently delete <span className="font-medium text-foreground">"{deletingPost.title}"</span>.
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

/* ---------- Post card ---------- */

function PostCard({
  post, canManage, onPublish, onEdit, onDelete,
}: {
  post: PostWithLocation;
  canManage: boolean;
  onPublish: (p: PostWithLocation) => void;
  onEdit: (p: PostWithLocation) => void;
  onDelete: (p: PostWithLocation) => void;
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

  async function applySchedule() {
    if (!scheduleDate) return;
    setScheduling(true);
    try {
      await api(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "scheduled", scheduledAt: scheduleDate.toISOString() }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`Scheduled for ${scheduleLabel(scheduleDate.toISOString())}`);
      setScheduleOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <Card className="group relative hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Header: type + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
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

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 -mt-1 -mr-1 opacity-60 group-hover:opacity-100 transition-opacity">
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
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm leading-snug line-clamp-1">{post.title || "Untitled post"}</h3>

        {/* Content preview */}
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {post.content}
        </p>

        {/* Status + AI badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <PostStatusBadge status={post.status} />
          {post.source === "ai" && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 gap-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium"
            >
              <Sparkles className="size-2.5" />
              MiSA AI
            </Badge>
          )}
          {post.ctaType && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
              <ArrowRight className="size-2.5 mr-0.5" />
              {CTA_LABEL[post.ctaType] ?? post.ctaType}
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

      {/* Schedule popover */}
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
              Schedule post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- Empty state ---------- */

function EmptyState({ canManage, onCreate }: { canManage: boolean; onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="p-12 flex flex-col items-center justify-center text-center">
        <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <Sparkles className="size-7 text-amber-500" />
        </div>
        <h3 className="text-base font-semibold">No posts yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Create your first post or let MiSA AI generate one. Posts help your locations stay
          visible and engage customers on Google Search & Maps.
        </p>
        {canManage && (
          <Button className="mt-4" size="sm" onClick={onCreate}>
            <Plus className="size-3.5 mr-1.5" /> New post
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Skeleton ---------- */

function PostsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

interface EditorState {
  locationId: string;
  type: PostType;
  title: string;
  content: string;
  ctaType: string;
  ctaUrl: string;
  status: EditorStatus;
  scheduledAt: Date | null;
  source: "manual" | "ai";
}

function PostEditorDialog({
  open, onOpenChange, post, locations, defaultLocationId, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post: PostWithLocation | null;
  locations: { id: string; name: string; city: string }[];
  defaultLocationId?: string;
  onSaved: () => void;
}) {
  const isEdit = !!post;

  const [state, setState] = React.useState<EditorState>(() => ({
    locationId: post?.locationId ?? defaultLocationId ?? locations[0]?.id ?? "",
    type: post?.type ?? "whats_new",
    title: post?.title ?? "",
    content: post?.content ?? "",
    ctaType: post?.ctaType ?? "learn_more",
    ctaUrl: post?.ctaUrl ?? "",
    status: (post?.status === "published" ? "published" : post?.status === "scheduled" ? "scheduled" : "draft") as EditorStatus,
    scheduledAt: post?.scheduledAt ? new Date(post.scheduledAt) : null,
    source: post?.source ?? "manual",
  }));

  // Reset when opening
  React.useEffect(() => {
    if (open) {
      setState({
        locationId: post?.locationId ?? defaultLocationId ?? locations[0]?.id ?? "",
        type: post?.type ?? "whats_new",
        title: post?.title ?? "",
        content: post?.content ?? "",
        ctaType: post?.ctaType ?? "learn_more",
        ctaUrl: post?.ctaUrl ?? "",
        status: (post?.status === "published" ? "published" : post?.status === "scheduled" ? "scheduled" : "draft") as EditorStatus,
        scheduledAt: post?.scheduledAt ? new Date(post.scheduledAt) : null,
        source: post?.source ?? "manual",
      });
    }
  }, [open, post, defaultLocationId, locations]);

  const [aiTopic, setAiTopic] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const titleCount = state.title.length;
  const contentWords = state.content.trim() ? state.content.trim().split(/\s+/).length : 0;

  function update<K extends keyof EditorState>(k: K, v: EditorState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function generateWithAi() {
    if (!state.locationId) {
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
            locationId: state.locationId,
            type: state.type,
            topic: aiTopic.trim(),
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

  async function save() {
    if (!state.locationId) { toast.error("Select a location"); return; }
    if (!state.title.trim()) { toast.error("Title is required"); return; }
    if (!state.content.trim()) { toast.error("Content is required"); return; }
    if (state.status === "scheduled" && !state.scheduledAt) {
      toast.error("Pick a schedule date & time");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && post) {
        await api(`/api/posts/${post.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: state.title,
            content: state.content,
            ctaType: state.ctaType || null,
            ctaUrl: state.ctaUrl || null,
            status: state.status,
            scheduledAt: state.status === "scheduled" ? state.scheduledAt?.toISOString() : null,
          }),
        });
        toast.success(state.status === "published" ? "Post published" : state.status === "scheduled" ? "Post scheduled" : "Post saved");
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
            status: state.status,
            scheduledAt: state.status === "scheduled" ? state.scheduledAt?.toISOString() : null,
            source: state.source,
          }),
        });
        toast.success(state.status === "published" ? "Post published to Google Business Profile" : state.status === "scheduled" ? "Post scheduled" : "Draft saved");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save post");
    } finally {
      setSaving(false);
    }
  }

  const meta = postTypeMeta(state.type);
  const TypeIcon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            {isEdit ? "Edit post" : "Create post"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update post content, CTA, or schedule."
              : "Write a new Google Business Profile post or let MiSA AI draft one for you."}
          </DialogDescription>
        </DialogHeader>

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
                Tell MiSA the topic (e.g. "Monsoon modular kitchen offer") and we&apos;ll draft title, body & CTA.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Topic, offer or event…"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !aiLoading) generateWithAi(); }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateWithAi}
                  disabled={aiLoading}
                  className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  {aiLoading ? (
                    <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Wand2 className="size-3.5 mr-1.5" /> Generate</>
                  )}
                </Button>
              </div>
            </div>

            {/* Location & type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Location <span className="text-rose-500">*</span></Label>
                <Select value={state.locationId} onValueChange={(v) => update("locationId", v)}>
                  <SelectTrigger className="w-full">
                    <MapPin className="size-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name} — {l.city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Post type <span className="text-rose-500">*</span></Label>
                <Select value={state.type} onValueChange={(v) => update("type", v as PostType)}>
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

            {/* Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Title <span className="text-rose-500">*</span></Label>
                <span className={cn("text-[10px] tabular-nums", titleCount > 60 ? "text-rose-500" : "text-muted-foreground")}>
                  {titleCount}/60
                </span>
              </div>
              <Input
                value={state.title}
                maxLength={80}
                onChange={(e) => update("title", e.target.value.slice(0, 60))}
                placeholder="e.g. Monsoon Sale — Up to 30% off modular kitchens"
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Content <span className="text-rose-500">*</span></Label>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {contentWords} words · {state.content.length} chars
                </span>
              </div>
              <Textarea
                value={state.content}
                onChange={(e) => update("content", e.target.value)}
                rows={5}
                placeholder="Write 100–180 words. Mention the offer, time window & how to redeem…"
                className="resize-y min-h-[120px]"
              />
              <p className="text-[10px] text-muted-foreground">
                Suggested: 100–180 words for best engagement on Google.
              </p>
            </div>

            {/* CTA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Call-to-action</Label>
                <Select value={state.ctaType} onValueChange={(v) => update("ctaType", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CTA URL / Phone</Label>
                <Input
                  value={state.ctaUrl}
                  onChange={(e) => update("ctaUrl", e.target.value)}
                  placeholder={state.ctaType === "call" ? "+91 98765 43210" : "https://…"}
                />
              </div>
            </div>

            {/* Status + schedule */}
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
              {state.status === "scheduled" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Schedule date & time</Label>
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
              )}
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
                        : "M"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {locations.find((l) => l.id === state.locationId)?.name ?? "Select a location"}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {locations.find((l) => l.id === state.locationId)?.city ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("size-5 rounded-md flex items-center justify-center", meta.tint)}>
                      <TypeIcon className="size-3" />
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {meta.label}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold leading-snug">
                    {state.title || <span className="text-muted-foreground italic">Post title…</span>}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-6 leading-relaxed whitespace-pre-wrap">
                    {state.content || <span className="italic">Your post content will appear here…</span>}
                  </p>
                  {state.ctaType && (
                    <div className="pt-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-medium">
                        {CTA_LABEL[state.ctaType] ?? state.ctaType}
                        <ArrowRight className="size-3" />
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="text-[10px] text-muted-foreground leading-relaxed">
              This is a simulated preview of how your post will render on Google Search & Maps.
              Final appearance may vary based on Google&apos;s display rules.
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


