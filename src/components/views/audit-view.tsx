"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ScrollText, Search, Download, ChevronRight, ChevronDown,
  LogIn, LogOut, MessageSquareReply, EyeOff, FilePlus2, Send, FileEdit,
  Trash2, CalendarClock, Sparkles, RefreshCw, Settings, UserPlus, UserCog,
  ShieldCheck, ShieldAlert, Users, Activity, XCircle, CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import type { AuditLogItem } from "@/lib/types";

// ---- Category metadata ----------------------------------------------------

type Category = "auth" | "review" | "post" | "ai" | "sync" | "settings" | "user";

const CATEGORY_META: Record<Category, {
  label: string;
  badge: string; // tailwind classes for badge
  icon: React.ComponentType<{ className?: string }>;
}> = {
  auth: { label: "Auth", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20", icon: LogIn },
  review: { label: "Review", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: MessageSquareReply },
  post: { label: "Post", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: FileEdit },
  ai: { label: "AI", badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20", icon: Sparkles },
  sync: { label: "Sync", badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20", icon: RefreshCw },
  settings: { label: "Settings", badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", icon: Settings },
  user: { label: "User", badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", icon: UserCog },
};

const ACTION_TO_CATEGORY: Record<string, Category> = {
  login: "auth",
  logout: "auth",
  "review.reply": "review",
  "review.ignore": "review",
  "post.create": "post",
  "post.publish": "post",
  "post.update": "post",
  "post.delete": "post",
  "post.scheduled": "post",
  "ai.generate": "ai",
  "sync.run": "sync",
  "settings.update": "settings",
  "user.create": "user",
  "user.update": "user",
};

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  "review.reply": "Review Reply",
  "review.ignore": "Review Ignored",
  "post.create": "Post Created",
  "post.publish": "Post Published",
  "post.update": "Post Updated",
  "post.delete": "Post Deleted",
  "post.scheduled": "Post Scheduled",
  "ai.generate": "AI Generation",
  "sync.run": "Sync Run",
  "settings.update": "Settings Updated",
  "user.create": "User Created",
  "user.update": "User Updated",
};

const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  login: LogIn,
  logout: LogOut,
  "review.reply": MessageSquareReply,
  "review.ignore": EyeOff,
  "post.create": FilePlus2,
  "post.publish": Send,
  "post.update": FileEdit,
  "post.delete": Trash2,
  "post.scheduled": CalendarClock,
  "ai.generate": Sparkles,
  "sync.run": RefreshCw,
  "settings.update": Settings,
  "user.create": UserPlus,
  "user.update": UserCog,
};

function categoryOf(action: string): Category {
  return ACTION_TO_CATEGORY[action] ?? "settings";
}

function initials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---- Component ------------------------------------------------------------

type StatusFilter = "all" | "success" | "failed";

export function AuditView() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action filter is applied server-side (API supports it); status + search client-side.
  const { data, isLoading, isError, refetch } = useQuery<AuditLogItem[]>({
    queryKey: ["audit-logs", actionFilter],
    queryFn: () => {
      const qs = actionFilter !== "all" ? `?action=${encodeURIComponent(actionFilter)}&limit=500` : "?limit=500";
      return api<AuditLogItem[]>(`/api/audit-logs${qs}`);
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = data.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.userName ?? ""} ${r.entity ?? ""} ${r.action} ${r.entityId ?? ""} ${r.ip ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    const sorted = [...filtered].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
    return sorted;
  }, [data, statusFilter, search, sortDir]);

  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { total: 0, success: 0, failed: 0, successRate: 0, uniqueUsers: 0 };
    }
    const success = data.filter((d) => d.status === "success").length;
    const failed = data.filter((d) => d.status === "failed").length;
    const users = new Set(data.filter((d) => d.userName).map((d) => d.userName));
    return {
      total: data.length,
      success,
      failed,
      successRate: Math.round((success / data.length) * 100),
      uniqueUsers: users.size,
    };
  }, [data]);

  function exportCsv() {
    try {
      const headers = ["Time (ISO)", "Time (Local)", "User", "Action", "Entity", "Entity ID", "Status", "IP", "Details"];
      const escape = (v: string | null | undefined) => {
        if (v == null) return "";
        const s = String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push([
          escape(r.createdAt),
          escape(format(new Date(r.createdAt), "yyyy-MM-dd HH:mm:ss")),
          escape(r.userName),
          escape(ACTION_LABELS[r.action] ?? r.action),
          escape(r.entity),
          escape(r.entityId),
          escape(r.status),
          escape(r.ip),
          escape(r.newValue),
        ].join(","));
      }
      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} audit entries to CSV.`);
    } catch (e: any) {
      toast.error(e?.message || "CSV export failed.");
    }
  }

  function toggleSort() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Audit Logs"
        description="Immutable record of all critical actions"
        icon={ScrollText}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-3.5 mr-1.5" /> Export CSV
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatMini
              icon={Activity}
              accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              label="Total Events"
              value={stats.total}
            />
            <StatMini
              icon={CheckCircle2}
              accent="bg-teal-500/10 text-teal-600 dark:text-teal-400"
              label="Success Rate"
              value={`${stats.successRate}%`}
              hint={`${stats.success} succeeded`}
            />
            <StatMini
              icon={XCircle}
              accent="bg-rose-500/10 text-rose-600 dark:text-rose-400"
              label="Failed Events"
              value={stats.failed}
            />
            <StatMini
              icon={Users}
              accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              label="Unique Users"
              value={stats.uniqueUsers}
            />
          </>
        )}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px]" size="sm">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Auth</SelectLabel>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="logout">Logout</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Reviews</SelectLabel>
                    <SelectItem value="review.reply">Reply</SelectItem>
                    <SelectItem value="review.ignore">Ignore</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Posts</SelectLabel>
                    <SelectItem value="post.create">Create</SelectItem>
                    <SelectItem value="post.publish">Publish</SelectItem>
                    <SelectItem value="post.update">Update</SelectItem>
                    <SelectItem value="post.delete">Delete</SelectItem>
                    <SelectItem value="post.scheduled">Scheduled</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>AI</SelectLabel>
                    <SelectItem value="ai.generate">Generate</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>System</SelectLabel>
                    <SelectItem value="sync.run">Sync run</SelectItem>
                    <SelectItem value="settings.update">Settings update</SelectItem>
                    <SelectItem value="user.create">User create</SelectItem>
                    <SelectItem value="user.update">User update</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[150px]" size="sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-[200px]">
                <Search className="size-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search user, entity, IP…"
                  className="pl-8 h-9"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Success
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-500" /> Failed
              </span>
              {rows.length > 0 && (
                <Badge variant="outline" className="ml-1 tabular-nums">{rows.length} shown</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table / cards */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isError ? (
            <div className="p-10 text-center">
              <ShieldAlert className="size-10 mx-auto text-rose-500 mb-3" />
              <p className="text-sm font-medium">Couldn&apos;t load audit logs.</p>
              <p className="text-xs text-muted-foreground mt-1">You may not have permission, or the server is unreachable.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                <RefreshCw className="size-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          ) : isLoading ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <ScrollText className="size-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">No audit entries match your filters.</p>
              <p className="text-xs text-muted-foreground mt-1">Try clearing the search or selecting “All actions”.</p>
              {(actionFilter !== "all" || statusFilter !== "all" || search) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setActionFilter("all");
                    setStatusFilter("all");
                    setSearch("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <div className="max-h-[calc(100vh-18rem)] overflow-y-auto scroll-area">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[160px]">
                          <button
                            onClick={toggleSort}
                            className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                          >
                            Time
                            <ChevronDown
                              className={cn("size-3 transition-transform", sortDir === "asc" && "rotate-180")}
                            />
                          </button>
                        </TableHead>
                        <TableHead className="min-w-[140px]">User</TableHead>
                        <TableHead className="min-w-[150px]">Action</TableHead>
                        <TableHead className="min-w-[180px]">Entity</TableHead>
                        <TableHead className="w-[90px]">Status</TableHead>
                        <TableHead className="w-[120px]">IP</TableHead>
                        <TableHead className="w-[60px] text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const cat = categoryOf(r.action);
                        const meta = CATEGORY_META[cat];
                        const ActIcon = ACTION_ICON[r.action] ?? meta.icon;
                        const expanded = expandedId === r.id;
                        const hasDetails = !!r.newValue;
                        return (
                          <Fragment key={r.id}>
                            <TableRow
                              className={cn(
                                "min-h-[48px] cursor-pointer",
                                r.status === "failed" && "bg-rose-500/[0.04] hover:bg-rose-500/[0.07]",
                              )}
                              onClick={() => hasDetails && setExpandedId(expanded ? null : r.id)}
                            >
                              <TableCell className="py-2.5">
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap cursor-help">
                                        {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {format(new Date(r.createdAt), "PPpp")}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="py-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="size-6 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                                    {initials(r.userName)}
                                  </span>
                                  <span className="text-xs font-medium truncate max-w-[120px]">
                                    {r.userName ?? "System"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5">
                                <Badge variant="outline" className={cn("gap-1 font-medium", meta.badge)}>
                                  <ActIcon className="size-3" />
                                  {ACTION_LABELS[r.action] ?? r.action}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2.5">
                                {r.entity ? (
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-xs font-medium truncate">{r.entity}</span>
                                    {r.entityId && (
                                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[160px]">
                                        {r.entityId}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5">
                                {r.status === "success" ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs">
                                    <span className="size-2 rounded-full bg-emerald-500" />
                                    <span className="text-muted-foreground">OK</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs">
                                    <span className="size-2 rounded-full bg-rose-500" />
                                    <span className="text-rose-600 dark:text-rose-400 font-medium">Failed</span>
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5">
                                {r.ip ? (
                                  <span className="font-mono text-xs">{r.ip}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                {hasDetails ? (
                                  <span className="inline-flex items-center justify-center size-6 rounded-md hover:bg-accent text-muted-foreground">
                                    <ChevronDown
                                      className={cn("size-4 transition-transform", expanded && "rotate-180")}
                                    />
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                            {expanded && hasDetails && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell colSpan={7} className="p-4">
                                  <DetailsBlock value={r.newValue!} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mobile stacked cards */}
              <div className="md:hidden divide-y max-h-[calc(100vh-18rem)] overflow-y-auto scroll-area">
                {rows.map((r) => {
                  const cat = categoryOf(r.action);
                  const meta = CATEGORY_META[cat];
                  const ActIcon = ACTION_ICON[r.action] ?? meta.icon;
                  const expanded = expandedId === r.id;
                  const hasDetails = !!r.newValue;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "p-4 min-h-[48px]",
                        r.status === "failed" && "bg-rose-500/[0.04]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                            {initials(r.userName)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{r.userName ?? "System"}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-medium shrink-0",
                            r.status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          <span className={cn("size-2 rounded-full", r.status === "success" ? "bg-emerald-500" : "bg-rose-500")} />
                          {r.status === "success" ? "Success" : "Failed"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("gap-1 font-medium", meta.badge)}>
                          <ActIcon className="size-3" />
                          {ACTION_LABELS[r.action] ?? r.action}
                        </Badge>
                        {r.entity && (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {r.entity}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="text-muted-foreground">Entity ID</div>
                          <div className="font-mono truncate">{r.entityId ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">IP</div>
                          <div className="font-mono">{r.ip ?? "—"}</div>
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {format(new Date(r.createdAt), "PPpp")}
                      </div>

                      {hasDetails && (
                        <button
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                        >
                          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
                          {expanded ? "Hide details" : "Show details"}
                        </button>
                      )}
                      {expanded && hasDetails && (
                        <div className="mt-2">
                          <DetailsBlock value={r.newValue!} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Sub-components -------------------------------------------------------

function StatMini({
  icon: Icon, accent, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", accent)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailsBlock({ value }: { value: string }) {
  let pretty = value;
  try {
    const parsed = JSON.parse(value);
    pretty = JSON.stringify(parsed, null, 2);
  } catch {
    // not JSON, show raw
  }
  return (
    <div className="rounded-lg border bg-background/60">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <ShieldCheck className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Change details</span>
      </div>
      <pre className="p-3 text-[11px] font-mono overflow-x-auto scroll-area max-h-64 whitespace-pre-wrap break-words">
        {pretty}
      </pre>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="max-h-[calc(100vh-18rem)] overflow-y-auto scroll-area">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[160px]">Time</TableHead>
            <TableHead className="min-w-[140px]">User</TableHead>
            <TableHead className="min-w-[150px]">Action</TableHead>
            <TableHead className="min-w-[180px]">Entity</TableHead>
            <TableHead className="w-[90px]">Status</TableHead>
            <TableHead className="w-[120px]">IP</TableHead>
            <TableHead className="w-[60px] text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={i} className="min-h-[48px]">
              <TableCell className="py-3"><Skeleton className="h-3 w-24" /></TableCell>
              <TableCell className="py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </TableCell>
              <TableCell className="py-3"><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
              <TableCell className="py-3">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2 w-28" />
                </div>
              </TableCell>
              <TableCell className="py-3"><Skeleton className="h-3 w-12" /></TableCell>
              <TableCell className="py-3"><Skeleton className="h-3 w-20 font-mono" /></TableCell>
              <TableCell className="py-3 text-right"><Skeleton className="size-5 rounded-md ml-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default AuditView;
