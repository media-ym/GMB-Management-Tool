"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppNavigation } from "@/hooks/use-app-navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bell, Star, RefreshCw, Sparkles, TrendingUp, Server,
  CheckCircle2, CheckCheck, AlertTriangle, ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { NotificationItem, ViewKey } from "@/lib/types";

type Tab = "all" | "unread" | "critical";
type TypeFilter = "all" | "review" | "sync" | "ai_alert" | "ranking" | "system" | "manual";

const TYPE_META: Record<
  NotificationItem["type"],
  { icon: React.ComponentType<{ className?: string }>; label: string; tint: string }
> = {
  review:    { icon: Star,        label: "Reviews",   tint: "bg-amber-500/10  text-amber-600  dark:text-amber-400"  },
  sync:      { icon: RefreshCw,   label: "Sync",      tint: "bg-slate-500/10  text-slate-600  dark:text-slate-300"  },
  ai_alert:  { icon: Sparkles,    label: "AI Alerts", tint: "bg-amber-500/10  text-amber-600  dark:text-amber-400"  },
  ranking:   { icon: TrendingUp,  label: "Ranking",   tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  system:    { icon: Server,      label: "System",    tint: "bg-slate-500/10  text-slate-600  dark:text-slate-300"  },
  manual:    { icon: Bell,        label: "Manual",    tint: "bg-primary/10    text-primary" },
};

const SEVERITY_META: Record<
  NotificationItem["severity"],
  { dot: string; badge: string; border: string; bg: string; label: string }
> = {
  critical: {
    dot: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    border: "border-l-rose-500",
    bg: "bg-rose-500/[0.04]",
    label: "Critical",
  },
  warning: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    border: "border-l-amber-500",
    bg: "bg-amber-500/[0.04]",
    label: "Warning",
  },
  success: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    border: "border-l-emerald-500",
    bg: "bg-emerald-500/[0.04]",
    label: "Success",
  },
  info: {
    dot: "bg-slate-400",
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
    border: "border-l-slate-400",
    bg: "bg-slate-500/[0.03]",
    label: "Info",
  },
};

const VALID_VIEWS: ViewKey[] = [
  "dashboard", "locations", "reviews", "posts", "analytics", "seo",
  "ai", "notifications", "audit", "settings",
];

export function NotificationsView() {
  const { navigate } = useAppNavigation();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const { data: notifications, isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => api<NotificationItem[]>("/api/notifications"),
  });

  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.read).length,
    [notifications],
  );
  const criticalCount = useMemo(
    () => (notifications ?? []).filter((n) => n.severity === "critical").length,
    [notifications],
  );

  const filtered = useMemo(() => {
    let list = notifications ?? [];
    if (tab === "unread") list = list.filter((n) => !n.read);
    if (tab === "critical") list = list.filter((n) => n.severity === "critical");
    if (typeFilter !== "all") list = list.filter((n) => n.type === typeFilter);
    return list;
  }, [notifications, tab, typeFilter]);

  async function markAllRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await api("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Marked ${unreadCount} notification${unreadCount === 1 ? "" : "s"} as read`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark notifications as read");
    } finally {
      setMarkingAll(false);
    }
  }

  async function markRead(n: NotificationItem) {
    if (n.read) {
      openNotificationLink(n.link);
      return;
    }
    setMarkingId(n.id);
    try {
      await api(`/api/notifications/${n.id}`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      openNotificationLink(n.link);
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark notification");
    } finally {
      setMarkingId(null);
    }
  }

  function openNotificationLink(link: string | null) {
    if (!link) return;
    if (VALID_VIEWS.includes(link as ViewKey)) {
      navigate(link as ViewKey);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Notifications"
        description="Alerts & activity across your locations"
        icon={Bell}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
          >
            <CheckCheck className="size-3.5 mr-1.5" />
            {markingAll ? "Marking…" : "Mark all read"}
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-1.5">
              All
              {(notifications?.length ?? 0) > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {notifications!.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread" className="gap-1.5">
              Unread
              {unreadCount > 0 && (
                <Badge
                  variant="default"
                  className="ml-0.5 h-4 min-w-4 px-1 text-[10px] tabular-nums"
                >
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="critical" className="gap-1.5">
              Critical
              {criticalCount > 0 && (
                <span className="size-1.5 rounded-full bg-rose-500" />
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger size="sm" className="w-full sm:w-[180px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="review">Reviews</SelectItem>
            <SelectItem value="sync">Sync</SelectItem>
            <SelectItem value="ranking">Ranking</SelectItem>
            <SelectItem value="ai_alert">AI Alerts</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notifications list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <NotificationSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto scroll-area divide-y">
            {filtered.map((n) => {
              const typeMeta = TYPE_META[n.type as NotificationItem["type"]] ?? TYPE_META.manual;
              const sevMeta = SEVERITY_META[n.severity];
              const Icon = typeMeta.icon;
              const isMarking = markingId === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  disabled={isMarking}
                  className={cn(
                    "group flex w-full items-start gap-3 sm:gap-4 px-4 py-3.5 min-h-[56px] text-left transition-colors",
                    "hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/40",
                    "border-l-2",
                    !n.read ? cn(sevMeta.border, sevMeta.bg) : "border-l-transparent",
                  )}
                >
                  {/* Type icon */}
                  <div
                    className={cn(
                      "size-9 rounded-lg flex items-center justify-center shrink-0",
                      typeMeta.tint,
                    )}
                  >
                    <Icon className="size-4" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {!n.read && (
                          <span
                            className={cn("size-2 rounded-full shrink-0", sevMeta.dot)}
                            aria-label="unread"
                          />
                        )}
                        <p
                          className={cn(
                            "text-sm truncate",
                            !n.read ? "font-semibold" : "font-medium text-muted-foreground",
                          )}
                        >
                          {n.title}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    <p
                      className={cn(
                        "text-xs mt-1 line-clamp-2 leading-relaxed",
                        "text-muted-foreground",
                      )}
                    >
                      {n.message}
                    </p>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] py-0 px-1.5", sevMeta.badge)}
                      >
                        {sevMeta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                        {typeMeta.label}
                      </Badge>
                      {n.link && (
                        <span className="text-[10px] text-primary inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          Open <ArrowUpRight className="size-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Read checkmark */}
                  {n.read ? (
                    <CheckCircle2 className="size-4 text-muted-foreground/40 shrink-0 mt-1" />
                  ) : (
                    isMarking && (
                      <RefreshCw className="size-4 text-muted-foreground animate-spin shrink-0 mt-1" />
                    )
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Footer hint */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} notification{filtered.length === 1 ? "" : "s"}
          {tab === "unread" && unreadCount > 0 && ` · ${unreadCount} unread total`}
        </p>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const isFiltered = tab !== "all";
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="size-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
        <CheckCircle2 className="size-7 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold">
        {isFiltered ? "Nothing here" : "You're all caught up"}
      </h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        {isFiltered
          ? "No notifications match the current filter. Try switching tabs or clearing the type filter."
          : "No unread notifications. New reviews, sync events, and AI alerts will show up here."}
      </p>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 sm:gap-4 px-4 py-3.5 min-h-[56px]">
          <Skeleton className="size-9 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
