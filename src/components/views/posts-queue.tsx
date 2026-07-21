"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow } from "date-fns";
import {
  Clock, AlertCircle, RotateCcw, X, CheckCircle2, CalendarClock,
  Pencil, Loader2, Newspaper, Tag, CalendarDays, Info, MapPin, Zap, Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { PostWithLocation, PostType } from "@/lib/types";
import { formatWeeklyRecurrence } from "@/lib/post-recurrence";

/* ---------- Metadata (mirrors posts-view.tsx) ---------- */

interface TypeMeta {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tint: string;
}

const TYPE_META: Record<PostType, TypeMeta> = {
  whats_new: { icon: Newspaper,    label: "What's New", tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  offer:     { icon: Tag,          label: "Offer",      tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  event:     { icon: CalendarDays, label: "Event",      tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  update:    { icon: Info,         label: "Update",     tint: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

function postTypeMeta(t: string): TypeMeta {
  return TYPE_META[t as PostType] ?? TYPE_META.update;
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

/* ---------- Countdown hook ---------- */

function useCountdown(targetIso: string | null): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000); // tick every 30s
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return "";
  try {
    const target = new Date(targetIso).getTime();
    const diff = target - now;
    if (diff <= 0) return "due now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMin = mins % 60;
    if (hours < 24) return `in ${hours}h ${remMin}m`;
    const days = Math.floor(hours / 24);
    const remHr = hours % 24;
    return `in ${days}d ${remHr}h`;
  } catch {
    return "";
  }
}

/* ---------- Reschedule dialog ---------- */

function RescheduleDialog({
  open, onOpenChange, post, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post: PostWithLocation | null;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = React.useState<Date | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && post) {
      setDate(post.scheduledAt ? new Date(post.scheduledAt) : new Date());
    }
  }, [open, post]);

  async function apply() {
    if (!post || !date) return;
    setSaving(true);
    try {
      await api(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "scheduled",
          scheduledAt: date.toISOString(),
        }),
      });
      toast.success(`Rescheduled for ${scheduleLabel(date.toISOString())}`);
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reschedule";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule post</DialogTitle>
          <DialogDescription>
            Pick a new date &amp; time for this scheduled post.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarClock className="size-4 mr-2 text-amber-500" />
                {date ? scheduleLabel(date.toISOString()) : "Pick a date & time"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date ?? undefined}
                onSelect={(d) => d && setDate(d)}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
          <Input
            type="time"
            value={date ? format(date, "HH:mm") : "10:00"}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              const d = date ? new Date(date) : new Date();
              d.setHours(h, m, 0, 0);
              setDate(d);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={apply} disabled={!date || saving}>
            {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="size-3.5 mr-1.5" />}
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Queue post card ---------- */

interface QueueCardProps {
  post: PostWithLocation;
  canManage: boolean;
  busyAction: string | null;
  onPublish: (p: PostWithLocation) => void;
  onCancel: (p: PostWithLocation) => void;
  onReschedule: (p: PostWithLocation) => void;
  onEdit: (p: PostWithLocation) => void;
  onClick: (p: PostWithLocation) => void;
}

function QueueCard({
  post, canManage, busyAction,
  onPublish, onCancel, onReschedule, onEdit, onClick,
}: QueueCardProps) {
  const meta = postTypeMeta(post.type);
  const Icon = meta.icon;
  const countdown = useCountdown(post.scheduledAt);
  const isPending = post.status === "scheduled";
  const isFailed = post.status === "failed";
  const isWeeklyRecurring =
    post.recurrenceType === "weekly"
    && post.recurrenceDayOfWeek != null
    && post.recurrenceTime;

  return (
    <Card
      className={cn(
        "group transition-shadow hover:shadow-md cursor-pointer",
        isFailed && "border-rose-500/40",
        isPending && "border-amber-500/30",
      )}
      onClick={() => onClick(post)}
    >
      <CardContent className="p-3 space-y-2">
        {post.imageUrl && (
          <div className="aspect-[16/9] w-full overflow-hidden rounded-md bg-muted">
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
        {/* Header row */}
        <div className="flex items-start gap-2">
          <span className={cn("size-7 rounded-md flex items-center justify-center shrink-0", meta.tint)}>
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold line-clamp-1 leading-tight">
              {post.title || "Untitled post"}
            </h4>
            <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <MapPin className="size-2.5 shrink-0" />
              {post.locationName}
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] py-0 px-1.5 shrink-0",
              isPending && "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
              isFailed && "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
            )}
          >
            {isPending ? "Scheduled" : "Failed"}
          </Badge>
        </div>

        {/* Content preview */}
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
          {post.content}
        </p>

        {/* Status-specific info */}
        {isPending && isWeeklyRecurring && (
          <Badge variant="outline" className="text-[9px] py-0 px-1.5 gap-0.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 w-fit">
            <Repeat className="size-2.5" />
            {formatWeeklyRecurrence(post.recurrenceDayOfWeek!, post.recurrenceTime!)}
          </Badge>
        )}
        {isPending && post.scheduledAt && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <Clock className="size-3 text-amber-500 shrink-0" />
            <span className="text-muted-foreground">
              Publishes <span className="font-medium text-amber-700 dark:text-amber-300">{countdown}</span>
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground truncate">{scheduleLabel(post.scheduledAt)}</span>
          </div>
        )}
        {isFailed && (
          <div className="flex items-start gap-1.5 text-[10px] bg-rose-500/5 border border-rose-500/15 rounded px-1.5 py-1">
            <AlertCircle className="size-3 text-rose-500 shrink-0 mt-0.5" />
            <span className="text-rose-700 dark:text-rose-300 line-clamp-2">
              Publish to Google failed. Click retry to attempt again.
            </span>
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex flex-wrap items-center gap-1 pt-1 border-t">
            {isPending && (
              <>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                  disabled={busyAction !== null}
                  onClick={(e) => { e.stopPropagation(); onPublish(post); }}
                >
                  {busyAction === `pub-${post.id}` ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Zap className="size-3 mr-1" />
                  )}
                  Publish now
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  disabled={busyAction !== null}
                  onClick={(e) => { e.stopPropagation(); onReschedule(post); }}
                >
                  <CalendarClock className="size-3 mr-1" />
                  Reschedule
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                  disabled={busyAction !== null}
                  onClick={(e) => { e.stopPropagation(); onCancel(post); }}
                >
                  {busyAction === `cancel-${post.id}` ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <X className="size-3 mr-1" />
                  )}
                  Cancel
                </Button>
              </>
            )}
            {isFailed && (
              <>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                  disabled={busyAction !== null}
                  onClick={(e) => { e.stopPropagation(); onPublish(post); }}
                >
                  {busyAction === `pub-${post.id}` ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3 mr-1" />
                  )}
                  Retry
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] hover:bg-muted"
                  disabled={busyAction !== null}
                  onClick={(e) => { e.stopPropagation(); onEdit(post); }}
                >
                  <Pencil className="size-3 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                  disabled={busyAction !== null}
                  onClick={(e) => { e.stopPropagation(); onCancel(post); }}
                >
                  {busyAction === `cancel-${post.id}` ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <X className="size-3 mr-1" />
                  )}
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Column shell ---------- */

interface ColumnProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "amber" | "rose" | "slate";
  count: number;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  isLoading?: boolean;
  skeletonCount?: number;
}

function QueueColumn({
  title, icon: Icon, accent, count, hint, children, isLoading, skeletonCount = 3,
}: ColumnProps) {
  const accentMap = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    rose:  "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  } as const;

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 px-1">
        <span className={cn("size-7 rounded-md flex items-center justify-center shrink-0", accentMap[accent])}>
          <Icon className="size-3.5" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 tabular-nums", accentMap[accent])}>
          {count}
        </Badge>
      </div>

      {hint && (
        <div className="text-[10px] text-muted-foreground px-1">{hint}</div>
      )}

      <div className="flex flex-col gap-2 min-h-[120px]">
        {isLoading ? (
          Array.from({ length: skeletonCount }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ---------- Empty state ---------- */

function ColumnEmptyState({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="rounded-lg border border-dashed py-8 px-4 flex flex-col items-center justify-center text-center">
      <Icon className="size-6 text-muted-foreground/40 mb-2" />
      <p className="text-[11px] text-muted-foreground">{message}</p>
    </div>
  );
}

/* ---------- Main queue ---------- */

export interface PublishingQueueProps {
  posts: PostWithLocation[];
  isLoading: boolean;
  canManage: boolean;
  onEdit: (p: PostWithLocation) => void;
  onClick: (p: PostWithLocation) => void;
}

export function PublishingQueue({
  posts, isLoading, canManage, onEdit, onClick,
}: PublishingQueueProps) {
  const qc = useQueryClient();
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [reschedulePost, setReschedulePost] = React.useState<PostWithLocation | null>(null);

  // Auto-refresh every 30 seconds
  React.useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
    }, 30000);
    return () => clearInterval(id);
  }, [qc]);

  const pending = React.useMemo(
    () => posts
      .filter((p) => p.status === "scheduled")
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")),
    [posts],
  );
  const failed = React.useMemo(
    () => posts.filter((p) => p.status === "failed"),
    [posts],
  );

  async function publishPost(p: PostWithLocation) {
    setBusyAction(`pub-${p.id}`);
    try {
      toast.loading(p.status === "failed" ? "Retrying publish to Google…" : "Publishing to Google…", { id: `pub-${p.id}` });
      await api(`/api/posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success("Post published to Google Business Profile", { id: `pub-${p.id}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to publish";
      toast.error(msg, { id: `pub-${p.id}` });
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelPost(p: PostWithLocation) {
    setBusyAction(`cancel-${p.id}`);
    try {
      toast.loading("Moving to draft…", { id: `cancel-${p.id}` });
      await api(`/api/posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "draft", scheduledAt: null }),
      });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      toast.success("Post moved to drafts", { id: `cancel-${p.id}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to cancel";
      toast.error(msg, { id: `cancel-${p.id}` });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          Auto-refreshes every 30s
        </span>
        <span>·</span>
        <span>
          {pending.length} pending · {failed.length} failed
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pending column */}
        <QueueColumn
          title="Pending"
          icon={Clock}
          accent="amber"
          count={pending.length}
          isLoading={isLoading}
          hint="Scheduled posts waiting to publish at their target time."
        >
          {!isLoading && pending.length === 0 ? (
            <ColumnEmptyState icon={CheckCircle2} message="No pending posts — you're all caught up." />
          ) : (
            pending.map((p) => (
              <QueueCard
                key={p.id}
                post={p}
                canManage={canManage}
                busyAction={busyAction}
                onPublish={publishPost}
                onCancel={cancelPost}
                onReschedule={setReschedulePost}
                onEdit={onEdit}
                onClick={onClick}
              />
            ))
          )}
        </QueueColumn>

        {/* Processing column */}
        <QueueColumn
          title="Processing"
          icon={Loader2}
          accent="slate"
          count={0}
          isLoading={false}
          hint={
            <span>
              Posts publish instantly to Google Business Profile — there&apos;s no
              async processing queue. Failed publishes show up in the Failed column
              where you can retry them.
            </span>
          }
        >
          <ColumnEmptyState icon={Loader2} message="No posts in processing — publishes complete synchronously." />
        </QueueColumn>

        {/* Failed column */}
        <QueueColumn
          title="Failed"
          icon={AlertCircle}
          accent="rose"
          count={failed.length}
          isLoading={isLoading}
          hint="Posts that failed to publish to Google. Edit & retry, or cancel back to draft."
        >
          {!isLoading && failed.length === 0 ? (
            <ColumnEmptyState icon={CheckCircle2} message="No failed publishes — everything went through." />
          ) : (
            failed.map((p) => (
              <QueueCard
                key={p.id}
                post={p}
                canManage={canManage}
                busyAction={busyAction}
                onPublish={publishPost}
                onCancel={cancelPost}
                onReschedule={setReschedulePost}
                onEdit={onEdit}
                onClick={onClick}
              />
            ))
          )}
        </QueueColumn>
      </div>

      <RescheduleDialog
        open={!!reschedulePost}
        onOpenChange={(o) => !o && setReschedulePost(null)}
        post={reschedulePost}
        onSaved={() => {/* invalidations happen inside */}}
      />
    </div>
  );
}
