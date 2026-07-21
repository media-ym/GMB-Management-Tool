"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  isSameDay,
  isSameWeek,
  isToday,
  isBefore,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  format,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, Newspaper, Tag, CalendarDays, Info, MapPin, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostWithLocation, PostType } from "@/lib/types";

/* ---------- Shared metadata (mirrors posts-view.tsx) ---------- */

interface TypeMeta {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tint: string;       // light bg + text
  chipBg: string;     // solid-ish chip bg
  dot: string;        // small dot color
}

const TYPE_META: Record<PostType, TypeMeta> = {
  whats_new: {
    icon: Newspaper,
    label: "What's New",
    tint: "text-teal-700 dark:text-teal-300",
    chipBg: "bg-teal-500/15 hover:bg-teal-500/25 border-teal-500/30",
    dot: "bg-teal-500",
  },
  offer: {
    icon: Tag,
    label: "Offer",
    tint: "text-emerald-700 dark:text-emerald-300",
    chipBg: "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  event: {
    icon: CalendarDays,
    label: "Event",
    tint: "text-amber-700 dark:text-amber-300",
    chipBg: "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30",
    dot: "bg-amber-500",
  },
  update: {
    icon: Info,
    label: "Update",
    tint: "text-slate-700 dark:text-slate-300",
    chipBg: "bg-slate-500/15 hover:bg-slate-500/25 border-slate-500/30",
    dot: "bg-slate-500",
  },
};

function postTypeMeta(t: string): TypeMeta {
  return TYPE_META[t as PostType] ?? TYPE_META.update;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------- Draggable post chip ---------- */

interface PostChipProps {
  post: PostWithLocation;
  onClick: (p: PostWithLocation) => void;
  showLocationDot?: boolean;
  locationColor?: string;
  compact?: boolean;
}

function DraggablePostChip({ post, onClick, showLocationDot, locationColor, compact }: PostChipProps) {
  const meta = postTypeMeta(post.type);
  const Icon = meta.icon;
  const isDraggable = post.status === "scheduled";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    disabled: !isDraggable,
    data: { post },
  });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only treat as click if not dragging (dnd-kit fires click after drop)
        e.stopPropagation();
        if (!isDragging) onClick(post);
      }}
      className={cn(
        "group/chip flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium cursor-pointer transition-colors select-none",
        meta.chipBg,
        meta.tint,
        compact ? "max-w-full" : "max-w-[calc(100%-4px)]",
        isDragging && "opacity-40",
        !isDraggable && "cursor-pointer",
      )}
      title={`${post.title || "Untitled post"} · ${post.locationName}`}
    >
      <Icon className="size-2.5 shrink-0" />
      {showLocationDot && (
        <span
          className={cn("size-1.5 rounded-full shrink-0", locationColor ?? meta.dot)}
          aria-hidden
        />
      )}
      <span className="truncate flex-1">{post.title || "Untitled"}</span>
      {!isDraggable && (
        <Lock className="size-2.5 shrink-0 opacity-50" aria-label="Published — locked" />
      )}
    </div>
  );
}

/* Static chip used inside DragOverlay */
function StaticChip({ post, locationColor }: { post: PostWithLocation; locationColor?: string }) {
  const meta = postTypeMeta(post.type);
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium shadow-lg",
        meta.chipBg,
        meta.tint,
      )}
      style={{ minWidth: 160 }}
    >
      <Icon className="size-2.5 shrink-0" />
      <span className={cn("size-1.5 rounded-full shrink-0", locationColor ?? meta.dot)} aria-hidden />
      <span className="truncate flex-1">{post.title || "Untitled"}</span>
    </div>
  );
}

/* ---------- Droppable day cell ---------- */

interface DayCellProps {
  date: Date;
  inMonth: boolean;
  posts: PostWithLocation[];
  onPostClick: (p: PostWithLocation) => void;
  onEmptyClick: (date: Date) => void;
  expandedDays: Set<string>;
  onToggleExpand: (key: string) => void;
  locationColorByLocationId: (id: string) => string | undefined;
  showLocationDots: boolean;
}

const MAX_VISIBLE_POSTS = 3;

function DayCell({
  date, inMonth, posts, onPostClick, onEmptyClick,
  expandedDays, onToggleExpand, locationColorByLocationId, showLocationDots,
}: DayCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: date.toISOString() });
  const dayKey = format(date, "yyyy-MM-dd");
  const expanded = expandedDays.has(dayKey);
  const today = isToday(date);

  const visible = expanded ? posts : posts.slice(0, MAX_VISIBLE_POSTS);
  const hiddenCount = posts.length - visible.length;

  function handleEmptyClick(e: React.MouseEvent) {
    e.stopPropagation();
    onEmptyClick(date);
  }

  const isPast = isBefore(date, new Date()) && !isToday(date);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day relative min-h-[96px] sm:min-h-[120px] border-r border-b border-border/60 p-1 flex flex-col gap-0.5 transition-colors",
        !inMonth && "bg-muted/30",
        isPast && "bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,var(--border)_4px,var(--border)_5px)] opacity-75",
        isOver && "bg-primary/10 ring-2 ring-inset ring-primary",
        today && "ring-2 ring-inset ring-emerald-500",
      )}
    >
      {/* Date label */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[10px] font-semibold tabular-nums",
            today
              ? "size-5 rounded-full bg-emerald-500 text-white flex items-center justify-center"
              : inMonth
                ? "text-foreground"
                : "text-muted-foreground/50",
          )}
        >
          {format(date, "d")}
        </span>
        <button
          type="button"
          onClick={handleEmptyClick}
          className="opacity-0 group-hover/day:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
          aria-label={`Add post on ${format(date, "MMM d, yyyy")}`}
          title="Add post on this date"
        >
          <Plus className="size-3" />
        </button>
      </div>

      {/* Posts */}
      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
        {visible.map((p) => (
          <DraggablePostChip
            key={p.id}
            post={p}
            onClick={onPostClick}
            showLocationDot={showLocationDots}
            locationColor={locationColorByLocationId(p.locationId)}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(dayKey); }}
            className="text-[10px] text-muted-foreground hover:text-primary text-left px-1 py-0.5 hover:bg-muted/40 rounded transition-colors"
          >
            {expanded ? "Show less" : `+${hiddenCount} more`}
          </button>
        )}
      </div>

      {/* Click target on empty space (still allow create when no posts) */}
      {posts.length === 0 && (
        <button
          type="button"
          onClick={handleEmptyClick}
          className="absolute inset-x-0 bottom-0 top-5 cursor-pointer"
          aria-label={`Add post on ${format(date, "MMM d, yyyy")}`}
          tabIndex={-1}
        />
      )}
    </div>
  );
}

/* ---------- Calendar Header ---------- */

type CalendarViewMode = "month" | "week";

interface CalendarHeaderProps {
  cursor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showScheduled: boolean;
  showPublished: boolean;
  onToggleScheduled: (v: boolean) => void;
  onTogglePublished: (v: boolean) => void;
  calendarViewMode: CalendarViewMode;
  onCalendarViewModeChange: (v: CalendarViewMode) => void;
}

function CalendarHeader({
  cursor, onPrev, onNext, onToday,
  showScheduled, showPublished, onToggleScheduled, onTogglePublished,
  calendarViewMode, onCalendarViewModeChange,
}: CalendarHeaderProps) {
  const headerText = calendarViewMode === "week"
    ? `${format(startOfWeek(cursor, { weekStartsOn: 0 }), "MMM d")} — ${format(endOfWeek(cursor, { weekStartsOn: 0 }), "MMM d, yyyy")}`
    : format(cursor, "MMMM yyyy");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label={calendarViewMode === "week" ? "Previous week" : "Previous month"}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-[180px] text-center">
          <div className="text-lg font-semibold tracking-tight">{headerText}</div>
        </div>
        <Button variant="outline" size="icon" onClick={onNext} aria-label={calendarViewMode === "week" ? "Next week" : "Next month"}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday} className="ml-1">
          Today
        </Button>
        <div className="ml-2 flex rounded-lg border overflow-hidden">
          <button
            onClick={() => onCalendarViewModeChange("month")}
            className={cn("px-3 py-1 text-xs font-medium transition",
              calendarViewMode === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >Month</button>
          <button
            onClick={() => onCalendarViewModeChange("week")}
            className={cn("px-3 py-1 text-xs font-medium transition border-l",
              calendarViewMode === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >Week</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(TYPE_META) as PostType[]).map((t) => {
            const m = TYPE_META[t];
            const Ic = m.icon;
            return (
              <span key={t} className="inline-flex items-center gap-1">
                <span className={cn("size-2 rounded-sm", m.dot)} />
                <Ic className="size-3" />
                {m.label}
              </span>
            );
          })}
        </div>

        <div className="h-4 w-px bg-border hidden sm:block" />

        {/* Toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <Switch
              checked={showScheduled}
              onCheckedChange={onToggleScheduled}
              aria-label="Show scheduled posts"
            />
            <span className="text-muted-foreground">Scheduled</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <Switch
              checked={showPublished}
              onCheckedChange={onTogglePublished}
              aria-label="Show published posts"
            />
            <span className="text-muted-foreground">Published</span>
          </label>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main component ---------- */

export interface PostsCalendarProps {
  posts: PostWithLocation[];
  isLoading: boolean;
  /** If true, multiple locations are visible — show colored dots. */
  showLocationDots: boolean;
  /** Map locationId → tailwind dot class. */
  locationColorByLocationId: (id: string) => string | undefined;
  onPostClick: (p: PostWithLocation) => void;
  /** Called when user clicks empty area of a day cell. */
  onNewPostOnDate: (date: Date) => void;
}

export function PostsCalendar({
  posts, isLoading, showLocationDots, locationColorByLocationId,
  onPostClick, onNewPostOnDate,
}: PostsCalendarProps) {
  const qc = useQueryClient();
  const [cursor, setCursor] = React.useState<Date>(() => startOfMonth(new Date()));
  const [showScheduled, setShowScheduled] = React.useState(true);
  const [showPublished, setShowPublished] = React.useState(true);
  const [expandedDays, setExpandedDays] = React.useState<Set<string>>(new Set());
  const [activeDragPost, setActiveDragPost] = React.useState<PostWithLocation | null>(null);
  const [rescheduling, setRescheduling] = React.useState(false);
  const [calendarViewMode, setCalendarViewMode] = React.useState<CalendarViewMode>("month");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const days = React.useMemo(() => {
    if (calendarViewMode === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 0 });
      const end = endOfWeek(cursor, { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
    }
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor, calendarViewMode]);

  // Bucket posts by yyyy-MM-dd based on scheduledAt OR publishedAt
  const postsByDay = React.useMemo(() => {
    const map = new Map<string, PostWithLocation[]>();
    for (const p of posts) {
      const iso = p.scheduledAt ?? p.publishedAt;
      if (!iso) continue;
      let d: Date;
      try { d = new Date(iso); } catch { continue; }
      if (p.status === "scheduled" && !showScheduled) continue;
      if (p.status === "published" && !showPublished) continue;
      // Only include if either is non-draft/scheduled/published visibility is fine
      if (p.status !== "scheduled" && p.status !== "published") continue;
      const key = format(d, "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    // Sort each day's posts by time
    for (const list of map.values()) {
      list.sort((a, b) => {
        const at = a.scheduledAt ?? a.publishedAt ?? "";
        const bt = b.scheduledAt ?? b.publishedAt ?? "";
        return at.localeCompare(bt);
      });
    }
    return map;
  }, [posts, showScheduled, showPublished]);

  function toggleExpand(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleDragStart(e: DragStartEvent) {
    const p = e.active.data.current?.post as PostWithLocation | undefined;
    if (p) setActiveDragPost(p);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragPost(null);
    const { active, over } = e;
    if (!over) return;
    const post = active.data.current?.post as PostWithLocation | undefined;
    if (!post) return;

    let newDate: Date;
    try { newDate = new Date(over.id as string); } catch { return; }

    // Same day → no-op
    const currentIso = post.scheduledAt ?? post.publishedAt;
    if (currentIso) {
      try {
        const current = new Date(currentIso);
        if (isSameDay(current, newDate)) return;
      } catch { /* ignore */ }
    }

    // Preserve original time of day
    const original = currentIso ? new Date(currentIso) : new Date();
    const target = setMilliseconds(
      setSeconds(setMinutes(setHours(newDate, original.getHours()), original.getMinutes()), 0),
      0,
    );

    // Don't allow scheduling into the past
    if (target.getTime() < Date.now()) {
      toast.error("Can't reschedule to a past date & time");
      return;
    }

    setRescheduling(true);
    const prevScheduledAt = post.scheduledAt;
    // Optimistic: mutate cache so the chip moves immediately
    qc.setQueryData<PostWithLocation[]>(["posts"], (old) => {
      if (!old) return old;
      return old.map((p) =>
        p.id === post.id
          ? { ...p, status: "scheduled" as const, scheduledAt: target.toISOString() }
          : p,
      );
    });

    try {
      await api(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "scheduled",
          scheduledAt: target.toISOString(),
        }),
      });
      toast.success(`Post rescheduled to ${format(target, "MMM d, yyyy, h:mm a")}`);
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
    } catch (e: unknown) {
      // Revert
      qc.setQueryData<PostWithLocation[]>(["posts"], (old) => {
        if (!old) return old;
        return old.map((p) =>
          p.id === post.id
            ? {
                ...p,
                status: post.status,
                scheduledAt: prevScheduledAt,
              }
            : p,
        );
      });
      const msg = e instanceof Error ? e.message : "Failed to reschedule";
      toast.error(msg);
    } finally {
      setRescheduling(false);
    }
  }

  function handleEmptyClick(date: Date) {
    // Default to 10:00 AM on the picked date
    const target = setMilliseconds(
      setSeconds(setMinutes(setHours(date, 10), 0), 0),
      0,
    );
    onNewPostOnDate(target);
  }

  return (
    <div className="space-y-3">
      <CalendarHeader
        cursor={cursor}
        onPrev={() => setCursor((d) => calendarViewMode === "week" ? subWeeks(d, 1) : subMonths(d, 1))}
        onNext={() => setCursor((d) => calendarViewMode === "week" ? addWeeks(d, 1) : addMonths(d, 1))}
        onToday={() => setCursor(new Date())}
        showScheduled={showScheduled}
        showPublished={showPublished}
        onToggleScheduled={setShowScheduled}
        onTogglePublished={setShowPublished}
        calendarViewMode={calendarViewMode}
        onCalendarViewModeChange={setCalendarViewMode}
      />

      {/* Hint bar */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-amber-500" />
          Scheduled posts are draggable — drop on any day to reschedule.
        </span>
        <span className="hidden sm:inline">·</span>
        <span className="inline-flex items-center gap-1">
          <Lock className="size-2.5" />
          Published posts are locked.
        </span>
        {rescheduling && (
          <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-[10px]">
            Rescheduling…
          </Badge>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center border-r border-border/60 last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-7">
                {Array.from({ length: 42 }).map((_, i) => (
                  <Skeleton key={i} className="min-h-[96px] sm:min-h-[120px] rounded-none border-r border-b border-border/60" />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragPost(null)}
              >
                <div className="grid grid-cols-7">
                  {days.map((date) => {
                    const key = format(date, "yyyy-MM-dd");
                    const dayPosts = postsByDay.get(key) ?? [];
                    return (
                      <DayCell
                        key={key}
                        date={date}
                        inMonth={isSameMonth(date, cursor)}
                        posts={dayPosts}
                        onPostClick={onPostClick}
                        onEmptyClick={handleEmptyClick}
                        expandedDays={expandedDays}
                        onToggleExpand={toggleExpand}
                        locationColorByLocationId={locationColorByLocationId}
                        showLocationDots={showLocationDots}
                      />
                    );
                  })}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activeDragPost ? (
                    <StaticChip
                      post={activeDragPost}
                      locationColor={showLocationDots ? locationColorByLocationId(activeDragPost.locationId) : undefined}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </Card>

      {/* Footer summary */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {posts.length} post{posts.length === 1 ? "" : "s"} in range
          </span>
          <span>·</span>
          <span>
            {showScheduled && showPublished
              ? "Showing scheduled + published"
              : showScheduled
                ? "Showing scheduled only"
                : showPublished
                  ? "Showing published only"
                  : "No post types selected — toggle them on above"}
          </span>
        </div>
      )}
    </div>
  );
}
