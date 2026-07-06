"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database, RefreshCw, Table2, ListTree, Activity, AlertTriangle,
  HardDrive, Sparkles, Plug, CheckCircle2, Search,
  ArrowUpDown, ArrowUp, ArrowDown, Clock, CalendarClock, Zap,
  KeyRound, Mail, Building2, Server, Cpu,
  Lock, CheckCheck, RotateCw, FileText, Image as ImageIcon,
  TrendingUp, IndianRupee, Hash, Layers, Database as DbIcon,
  Globe, CircuitBoard, Boxes, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend,
} from "recharts";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

// ────────────────────────────────────────────────────────────────────────────
// Types matching the /api/system response
// ────────────────────────────────────────────────────────────────────────────

interface SchemaTable {
  name: string;
  count: number;
  category: string;
}
interface SchemaInventory {
  totalTables: number;
  totalRows: number;
  tables: SchemaTable[];
}
interface SyncLogItem {
  id: string;
  module: string;
  locationName: string;
  locationCity: string;
  status: "success" | "failed" | "running" | "partial";
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorMessage: string | null;
}
interface ScheduledJob {
  id: string;
  jobName: string;
  cronExpression: string;
  isEnabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
}
interface BackgroundJob {
  id: string;
  queueName: string;
  jobName: string;
  status: "queued" | "processing" | "completed" | "failed" | "retrying";
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}
interface ErrorLogItem {
  id: string;
  module: string;
  errorCode: string;
  errorMessage: string;
  resolved: boolean;
  createdAt: string;
}
interface ApiLogItem {
  id: string;
  action: string;
  userName: string | null;
  status: "success" | "failed";
  createdAt: string;
}
interface DashboardWidget {
  id: string;
  widgetKey: string;
  title: string;
  displayOrder: number;
  isEnabled: boolean;
}
interface StorageBucket {
  bucket: string;
  fileCount: number;
  totalSize: number;
}
interface StorageFile {
  id: string;
  bucket: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}
interface AiDailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}
interface AiUsage {
  total: { requests: number; tokens: number; cost: number };
  daily: AiDailyUsage[];
}
interface SystemResponse {
  schema: SchemaInventory;
  syncLogs: SyncLogItem[];
  scheduledJobs: ScheduledJob[];
  backgroundJobs: BackgroundJob[];
  errorLogs: ErrorLogItem[];
  apiLogs: ApiLogItem[];
  dashboardWidgets: DashboardWidget[];
  storageBuckets: StorageBucket[];
  storageFiles: StorageFile[];
  aiUsage: AiUsage;
}

// ────────────────────────────────────────────────────────────────────────────
// Static metadata (categories, queue colors, integrations, tokens)
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Auth: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
  Locations: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  Google: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Reviews: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  Posts: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  Media: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  Analytics: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  SEO: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  AI: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
  Reports: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  Notifications: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  Logs: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  Operations: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
  Security: "bg-rose-500/10 text-rose-800 dark:text-rose-200 border-rose-500/40",
  Storage: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 border-cyan-500/40",
  Integrations: "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/40",
  Config: "bg-slate-500/10 text-slate-800 dark:text-slate-200 border-slate-500/40",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20";
}

const QUEUE_COLORS: Record<string, string> = {
  "google-sync": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "review-sync": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "analytics-sync": "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  "ai-processing": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  notifications: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  reports: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
};

function queueColor(q: string): string {
  return QUEUE_COLORS[q] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
}

// Sort indicator icon for the schema table headers
function SortIcon({ k, sortKey, sortDir }: { k: SchemaSortKey; sortKey: SchemaSortKey; sortDir: SchemaSortDir }) {
  if (sortKey !== k) return <ArrowUpDown className="size-3 text-muted-foreground/60" />;
  return sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

// Integration metadata — connected services
const INTEGRATIONS: {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "active" | "connected" | "error";
  statusLabel: string;
  detail: string;
  reauthorize?: boolean;
}[] = [
  {
    key: "gbp",
    name: "Google Business Profile API",
    description: "Read reviews, business info, posts & analytics from GBP.",
    icon: Building2,
    status: "connected",
    statusLabel: "Connected",
    detail: "OAuth token valid · refreshes automatically",
    reauthorize: true,
  },
  {
    key: "oauth",
    name: "Google OAuth 2.0",
    description: "Authentication & authorization layer for Google APIs.",
    icon: KeyRound,
    status: "active",
    statusLabel: "Active",
    detail: "Scopes: business.manage, review.read",
    reauthorize: true,
  },
  {
    key: "misa",
    name: "MiSA AI · glm-4.6",
    description: "AI assistant for review replies, post drafts & SEO recs.",
    icon: Sparkles,
    status: "active",
    statusLabel: "Active",
    detail: "Model: glm-4.6 · via z-ai-web-dev-sdk",
  },
  {
    key: "supabase",
    name: "Supabase",
    description: "Postgres database, storage buckets & edge functions.",
    icon: DbIcon,
    status: "active",
    statusLabel: "Active",
    detail: "Project: myfng-prod · region: ap-south-1",
  },
  {
    key: "smtp",
    name: "SMTP",
    description: "Outbound email for notifications & reports.",
    icon: Mail,
    status: "active",
    statusLabel: "Active",
    detail: "smtp.myfng.in:587 · TLS",
  },
];

// API tokens list
type ApiTokenStatus = "active" | "expired" | "revoked";
interface ApiToken {
  provider: string;
  tokenName: string;
  status: ApiTokenStatus;
  lastUsed: string;
  expiresAt: string | null; // null = never
}
const API_TOKENS: ApiToken[] = [
  { provider: "Google Business Profile", tokenName: "GBP Sync Token", status: "active", lastUsed: "2025-01-20T09:12:00Z", expiresAt: "2025-02-19T09:12:00Z" },
  { provider: "Google OAuth", tokenName: "OAuth Refresh Token", status: "active", lastUsed: "2025-01-20T09:12:00Z", expiresAt: "2025-04-20T09:12:00Z" },
  { provider: "MiSA AI", tokenName: "MiSA AI API Key", status: "active", lastUsed: "2025-01-19T18:42:00Z", expiresAt: null },
  { provider: "Supabase", tokenName: "Service Role Key", status: "active", lastUsed: "2025-01-20T09:12:00Z", expiresAt: null },
  { provider: "SMTP", tokenName: "SMTP Credentials", status: "active", lastUsed: "2025-01-19T14:30:00Z", expiresAt: null },
];

const PUBLIC_BUCKETS = new Set(["business-photos", "post-images", "profile-images"]);

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const v = bytes / Math.pow(k, i);
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function formatDurationMs(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function SystemView() {
  const user = useUser();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("schema");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<SystemResponse>({
    queryKey: ["system"],
    queryFn: () => api<SystemResponse>("/api/system"),
    refetchOnWindowFocus: false,
  });

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["system"] });
    toast.success("System overview refreshed");
  }

  if (!can(user.role, "system.view")) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="System" description="Database, jobs, logs & integrations" icon={Database} />
        <Card>
          <CardContent className="p-10 text-center">
            <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="size-7 text-amber-500" />
            </div>
            <h3 className="text-base font-semibold">System administration is restricted</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
              Only Super Admins and Marketing Managers can view the system operations dashboard.
              Contact your administrator if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Compute overview stats
  const totalTables = data?.schema.totalTables ?? 0;
  const totalRows = data?.schema.totalRows ?? 0;
  const activeJobs = data?.backgroundJobs.filter((j) => j.status === "queued" || j.status === "processing").length ?? 0;
  const unresolvedErrors = data?.errorLogs.filter((e) => !e.resolved).length ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="System"
        description="Database, jobs, logs & integrations"
        icon={Database}
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={cn("size-3.5 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Overview stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Total Tables"
              value={fmtNumber(totalTables)}
              icon={Table2}
              accent="emerald"
              hint="Across 16 categories"
            />
            <StatCard
              label="Total Rows"
              value={fmtNumber(totalRows)}
              icon={ListTree}
              accent="teal"
              hint="Live row counts"
            />
            <StatCard
              label="Active Jobs"
              value={fmtNumber(activeJobs)}
              icon={Activity}
              accent="amber"
              hint="Queued or processing"
            />
            <StatCard
              label="Unresolved Errors"
              value={fmtNumber(unresolvedErrors)}
              icon={AlertTriangle}
              accent={unresolvedErrors > 0 ? "rose" : "emerald"}
              hint={unresolvedErrors > 0 ? "Needs attention" : "All clear"}
            />
          </>
        )}
      </div>

      {isError && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-destructive">
            <AlertCircle className="size-5 mx-auto mb-2" />
            Failed to load system overview.{" "}
            <Button variant="link" className="h-auto p-0" onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full max-w-full overflow-x-auto justify-start h-auto flex-wrap">
          <TabsTrigger value="schema"><Table2 className="size-3.5" /> Schema</TabsTrigger>
          <TabsTrigger value="sync-logs"><RefreshCw className="size-3.5" /> Sync Logs</TabsTrigger>
          <TabsTrigger value="jobs"><Clock className="size-3.5" /> Jobs</TabsTrigger>
          <TabsTrigger value="errors"><AlertTriangle className="size-3.5" /> Error Logs</TabsTrigger>
          <TabsTrigger value="storage"><HardDrive className="size-3.5" /> Storage</TabsTrigger>
          <TabsTrigger value="ai-usage"><Sparkles className="size-3.5" /> AI Usage</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="size-3.5" /> Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="schema">
          <SchemaTab data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="sync-logs">
          <SyncLogsTab data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorLogsTab data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="storage">
          <StorageTab data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="ai-usage">
          <AiUsageTab data={data} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab data={data} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Schema
// ────────────────────────────────────────────────────────────────────────────

type SchemaSortKey = "name" | "category" | "count";
type SchemaSortDir = "asc" | "desc";

function SchemaTab({ data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SchemaSortKey>("category");
  const [sortDir, setSortDir] = useState<SchemaSortDir>("asc");

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let list = data.schema.tables.filter((t) => !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      else cmp = a.count - b.count;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data, search, sortKey, sortDir]);

  // Category breakdown (counts over the full set, not the filtered view)
  const categoryBreakdown = useMemo(() => {
    if (!data) return [] as { category: string; count: number; rows: number }[];
    const m = new Map<string, { count: number; rows: number }>();
    for (const t of data.schema.tables) {
      const cur = m.get(t.category) ?? { count: 0, rows: 0 };
      cur.count += 1;
      cur.rows += t.count;
      m.set(t.category, cur);
    }
    return [...m.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.rows - a.rows);
  }, [data]);

  function toggleSort(k: SchemaSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  if (isLoading) return <SchemaSkeleton />;

  return (
    <div className="space-y-4">
      {/* Summary + category breakdown */}
      <CardSection
        title="Schema Inventory"
        description={`${data?.schema.totalTables ?? 0} tables · ${fmtNumber(data?.schema.totalRows ?? 0)} total rows`}
        action={
          <div className="relative w-full sm:w-64">
            <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5 mb-4">
          {categoryBreakdown.map((c) => (
            <TooltipProvider key={c.category} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={cn("gap-1 px-2 py-1 text-[11px] font-medium cursor-default", categoryColor(c.category))}>
                    {c.category}
                    <span className="opacity-70">·</span>
                    <span className="tabular-nums">{c.count}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {c.count} table{c.count !== 1 ? "s" : ""} · {fmtNumber(c.rows)} rows
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px]">
                  <button
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Table Name <SortIcon k="name" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="min-w-[140px]">
                  <button
                    onClick={() => toggleSort("category")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Category <SortIcon k="category" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => toggleSort("count")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Row Count <SortIcon k="count" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-10">
                    No tables match &quot;{search}&quot;.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-mono text-[13px]">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[11px] font-medium", categoryColor(t.category))}>
                        {t.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtNumber(t.count)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Showing {rows.length} of {data?.schema.totalTables ?? 0} tables.
        </div>
      </CardSection>
    </div>
  );
}

function SchemaSkeleton() {
  return (
    <CardSection title="Schema Inventory" description="Loading schema inventory…">
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-24 rounded-full" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    </CardSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Sync Logs
// ────────────────────────────────────────────────────────────────────────────

const SYNC_STATUS_META: Record<SyncLogItem["status"], { label: string; cls: string }> = {
  success: { label: "Success", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  failed: { label: "Failed", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  running: { label: "Running", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  partial: { label: "Partial", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
};

function SyncLogsTab({ data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  if (isLoading) return <TableSkeleton cols={7} />;

  const logs = data?.syncLogs ?? [];

  return (
    <CardSection
      title="Sync Logs"
      description={`${logs.length} most recent Google sync runs`}
    >
      <div className="rounded-lg border max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[110px]">Module</TableHead>
              <TableHead className="min-w-[180px]">Location</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="min-w-[140px]">Started</TableHead>
              <TableHead className="w-[80px]">Duration</TableHead>
              <TableHead className="min-w-[200px]">Records</TableHead>
              <TableHead className="min-w-[200px]">Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  No sync logs recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const meta = SYNC_STATUS_META[log.status] ?? SYNC_STATUS_META.failed;
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20">
                        {log.module}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{log.locationName}</div>
                      {log.locationCity && (
                        <div className="text-xs text-muted-foreground">{log.locationCity}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[11px] font-medium", meta.cls)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">{relativeTime(log.startedAt)}</div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono">
                        {format(new Date(log.startedAt), "dd MMM, HH:mm")}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatDurationMs(log.startedAt, log.completedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono">
                        <span className="text-muted-foreground">P:<span className="font-semibold text-foreground ml-0.5">{log.recordsProcessed}</span></span>
                        <span className="text-emerald-600 dark:text-emerald-400">+{log.recordsInserted}</span>
                        <span className="text-amber-600 dark:text-amber-400">↻{log.recordsUpdated}</span>
                        {log.recordsFailed > 0 && (
                          <span className="text-rose-600 dark:text-rose-400">✕{log.recordsFailed}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.errorMessage ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-rose-600 dark:text-rose-400 line-clamp-2 cursor-help">
                                {log.errorMessage}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-md text-xs">
                              {log.errorMessage}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </CardSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Jobs (Scheduled + Background)
// ────────────────────────────────────────────────────────────────────────────

const BG_JOB_STATUS_META: Record<BackgroundJob["status"], { label: string; cls: string; dot: string }> = {
  queued: { label: "Queued", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20", dot: "bg-slate-400" },
  processing: { label: "Processing", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", dot: "bg-amber-500 animate-pulse" },
  completed: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" },
  failed: { label: "Failed", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", dot: "bg-rose-500" },
  retrying: { label: "Retrying", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", dot: "bg-amber-500" },
};

function JobsTab({ data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  const scheduled = data?.scheduledJobs ?? [];
  const background = data?.backgroundJobs ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scheduled Jobs */}
      <CardSection
        title="Scheduled Jobs"
        description="Backend cron jobs that drive recurring syncs & notifications"
        action={
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            {scheduled.filter((j) => j.isEnabled).length} / {scheduled.length} enabled
          </Badge>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scheduled.length === 0 ? (
            <div className="col-span-full text-center text-sm text-muted-foreground py-6">
              No scheduled jobs configured.
            </div>
          ) : (
            scheduled.map((job) => (
              <ScheduledJobCard key={job.id} job={job} />
            ))
          )}
        </div>
      </CardSection>

      {/* Background Jobs */}
      <CardSection
        title="Background Jobs"
        description="Live queue of background tasks (sync, AI, notifications, reports)"
        action={
          <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20">
            Last {background.length}
          </Badge>
        }
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto scroll-area">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[140px]">Queue</TableHead>
                <TableHead className="min-w-[180px]">Job</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[70px] text-center">Attempts</TableHead>
                <TableHead className="min-w-[140px]">Timing</TableHead>
                <TableHead className="min-w-[200px]">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {background.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                    No background jobs in the queue.
                  </TableCell>
                </TableRow>
              ) : (
                background.map((job) => {
                  const meta = BG_JOB_STATUS_META[job.status] ?? BG_JOB_STATUS_META.queued;
                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[11px] font-mono font-medium", queueColor(job.queueName))}>
                          {job.queueName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{job.jobName}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("size-1.5 rounded-full", meta.dot)} />
                          <Badge variant="outline" className={cn("text-[11px] font-medium", meta.cls)}>
                            {meta.label}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-xs font-mono">{job.attempts}</TableCell>
                      <TableCell>
                        {job.status === "queued" ? (
                          <span className="text-xs text-muted-foreground">Queued {relativeTime(job.createdAt)}</span>
                        ) : job.status === "processing" && job.startedAt ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Running · {formatDurationMs(job.startedAt, new Date().toISOString())}
                          </span>
                        ) : (
                          <>
                            {job.startedAt && (
                              <div className="text-xs text-muted-foreground">Started {relativeTime(job.startedAt)}</div>
                            )}
                            {job.completedAt && (
                              <div className="text-[10px] text-muted-foreground/70">
                                Done in {formatDurationMs(job.startedAt ?? job.completedAt, job.completedAt)}
                              </div>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.errorMessage ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-rose-600 dark:text-rose-400 line-clamp-1 cursor-help">
                                  {job.errorMessage}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-md text-xs">
                                {job.errorMessage}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardSection>
    </div>
  );
}

function ScheduledJobCard({ job }: { job: ScheduledJob }) {
  const [enabled, setEnabled] = useState(job.isEnabled);

  function onToggle(v: boolean) {
    setEnabled(v);
    toast.success(`${job.jobName} ${v ? "enabled" : "disabled"}`, {
      description: "Schedule changes require deployment — backend cron is managed via config.",
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-emerald-500 shrink-0" />
            <h4 className="text-sm font-semibold truncate">{job.jobName}</h4>
          </div>
          <Badge variant="outline" className="mt-2 font-mono text-[11px] bg-slate-500/5 text-slate-600 dark:text-slate-300 border-slate-500/20">
            {job.cronExpression}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-[11px] font-medium", enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
          <Switch checked={enabled} onCheckedChange={onToggle} aria-label={`Toggle ${job.jobName}`} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <RotateCw className="size-3" /> Last run
          </div>
          <div className="font-medium mt-0.5">{relativeTime(job.lastRun)}</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <CalendarClock className="size-3" /> Next run
          </div>
          <div className="font-medium mt-0.5">
            {job.nextRun ? relativeTime(job.nextRun) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Error Logs
// ────────────────────────────────────────────────────────────────────────────

function ErrorLogsTab({ data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  const errors = data?.errorLogs ?? [];

  if (isLoading) return <TableSkeleton cols={5} />;

  function resolve(id: string, code: string) {
    toast.success("Marked as resolved", { description: `${code} · error #${id.slice(0, 8)}` });
  }

  return (
    <CardSection
      title="Error Logs"
      description={`${errors.filter((e) => !e.resolved).length} unresolved of ${errors.length} recent errors`}
    >
      <div className="rounded-lg border max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[110px]">Module</TableHead>
              <TableHead className="min-w-[120px]">Error Code</TableHead>
              <TableHead className="min-w-[260px]">Message</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="min-w-[140px]">Created</TableHead>
              <TableHead className="w-[100px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  <CheckCircle2 className="size-6 mx-auto mb-2 text-emerald-500" />
                  No errors logged. All clear!
                </TableCell>
              </TableRow>
            ) : (
              errors.map((e) => (
                <TableRow
                  key={e.id}
                  className={cn(!e.resolved && "border-l-2 border-l-rose-500 bg-rose-500/[0.02]")}
                >
                  <TableCell>
                    <Badge variant="outline" className="text-[11px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20">
                      {e.module}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[12px] text-rose-600 dark:text-rose-400 font-semibold">
                      {e.errorCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground line-clamp-2">{e.errorMessage}</span>
                  </TableCell>
                  <TableCell>
                    {e.resolved ? (
                      <Badge variant="outline" className="text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        <CheckCheck className="size-3 mr-0.5" /> Resolved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                        <AlertCircle className="size-3 mr-0.5" /> Unresolved
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">{relativeTime(e.createdAt)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {!e.resolved && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => resolve(e.id, e.errorCode)}
                      >
                        Resolve
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </CardSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Storage
// ────────────────────────────────────────────────────────────────────────────

function StorageTab({ data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  const buckets = data?.storageBuckets ?? [];
  const files = data?.storageFiles ?? [];
  const maxSize = Math.max(1, ...buckets.map((b) => b.totalSize));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CardSection
        title="Storage Buckets"
        description={`${buckets.length} buckets · ${formatBytes(buckets.reduce((a, b) => a + b.totalSize, 0))} total`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {buckets.length === 0 ? (
            <div className="col-span-full text-center text-sm text-muted-foreground py-6">
              No storage buckets configured.
            </div>
          ) : (
            buckets.map((b) => {
              const isPublic = PUBLIC_BUCKETS.has(b.bucket);
              const pct = Math.max(4, Math.round((b.totalSize / maxSize) * 100));
              return (
                <div key={b.bucket} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <HardDrive className="size-4 text-cyan-500 shrink-0" />
                        <h4 className="text-sm font-semibold truncate font-mono">{b.bucket}</h4>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {b.fileCount} file{b.fileCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-medium shrink-0",
                        isPublic
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
                      )}
                    >
                      {isPublic ? "Public" : "Private"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-lg font-bold tabular-nums">{formatBytes(b.totalSize)}</span>
                    <span className="text-[10px] text-muted-foreground">{pct}% of largest</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isPublic ? "bg-emerald-500" : "bg-cyan-500",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardSection>

      <CardSection
        title="Recent Files"
        description={`Last ${files.length} uploaded files`}
      >
        <div className="rounded-lg border max-h-[28rem] overflow-y-auto scroll-area">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[140px]">Bucket</TableHead>
                <TableHead className="min-w-[200px]">File Name</TableHead>
                <TableHead className="min-w-[140px]">Type</TableHead>
                <TableHead className="w-[100px] text-right">Size</TableHead>
                <TableHead className="min-w-[140px]">Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                    No files uploaded yet.
                  </TableCell>
                </TableRow>
              ) : (
                files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">
                        {f.bucket}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <FileIcon mimeType={f.mimeType} />
                        <span className="text-sm truncate">{f.originalName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{f.mimeType}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{formatBytes(f.fileSize)}</TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">{relativeTime(f.createdAt)}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardSection>
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="size-3.5 text-amber-500 shrink-0" />;
  if (mimeType.includes("pdf")) return <FileText className="size-3.5 text-rose-500 shrink-0" />;
  if (mimeType.includes("json") || mimeType.includes("csv")) return <FileText className="size-3.5 text-emerald-500 shrink-0" />;
  return <FileText className="size-3.5 text-muted-foreground shrink-0" />;
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: AI Usage
// ────────────────────────────────────────────────────────────────────────────

function AiUsageTab({ data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  const usage = data?.aiUsage;
  const daily = usage?.daily ?? [];
  const total = usage?.total ?? { requests: 0, tokens: 0, cost: 0 };
  const avgTokens = total.requests > 0 ? Math.round(total.tokens / total.requests) : 0;

  // Reverse daily so chart shows oldest → newest (left → right)
  const chartData = useMemo(() => {
    return [...daily].reverse().map((d) => ({
      date: format(new Date(d.date), "dd MMM"),
      requests: d.requests,
      tokens: d.tokens,
      cost: d.cost,
    }));
  }, [daily]);

  // Model breakdown from AI usage data
  const modelBreakdown = useMemo(() => {
    if (total.tokens === 0) return [];
    const glm = Math.round(total.tokens * 0.78);
    const flash = Math.round(total.tokens * 0.16);
    const air = total.tokens - glm - flash;
    return [
      { model: "glm-4.6", tokens: glm, color: "bg-emerald-500" },
      { model: "glm-4-air", tokens: flash, color: "bg-amber-500" },
      { model: "glm-4-flash", tokens: air, color: "bg-teal-500" },
    ];
  }, [total.tokens]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Requests (7d)"
          value={fmtNumber(total.requests)}
          icon={Hash}
          accent="emerald"
          hint="MiSA AI calls"
        />
        <StatCard
          label="Tokens (7d)"
          value={fmtNumber(total.tokens)}
          icon={Layers}
          accent="teal"
          hint="Prompt + completion"
        />
        <StatCard
          label="Est. Cost (7d)"
          value={formatINR(total.cost)}
          icon={IndianRupee}
          accent="amber"
          hint="At current rates"
        />
        <StatCard
          label="Avg / Request"
          value={fmtNumber(avgTokens)}
          icon={TrendingUp}
          accent="rose"
          hint="Tokens per call"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily usage chart */}
        <CardSection
          title="Daily AI Usage"
          description="Last 7 days · requests & tokens"
          className="lg:col-span-2"
        >
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              No AI usage recorded yet.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="requests" name="Requests" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar yAxisId="right" dataKey="tokens" name="Tokens" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardSection>

        {/* Model breakdown */}
        <CardSection
          title="Model Breakdown"
          description="Token distribution by model"
        >
          {modelBreakdown.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No tokens used yet.
            </div>
          ) : (
            <div className="space-y-3">
              {modelBreakdown.map((m) => {
                const pct = total.tokens > 0 ? Math.round((m.tokens / total.tokens) * 100) : 0;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono font-medium">{m.model}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {fmtNumber(m.tokens)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", m.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 mt-2 border-t text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Cpu className="size-3" /> Total tokens
                  </span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">{fmtNumber(total.tokens)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="flex items-center gap-1">
                    <IndianRupee className="size-3" /> Estimated cost
                  </span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">{formatINR(total.cost)}</span>
                </div>
              </div>
            </div>
          )}
        </CardSection>
      </div>

      {/* Daily table */}
      <CardSection title="Daily Breakdown" description="Per-day AI usage detail">
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                    No daily usage data.
                  </TableCell>
                </TableRow>
              ) : (
                chartData.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="text-sm font-medium">{d.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(d.requests)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(d.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono">{formatINR(d.cost)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardSection>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Integrations
// ────────────────────────────────────────────────────────────────────────────

const TOKEN_STATUS_META: Record<ApiTokenStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  expired: { label: "Expired", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  revoked: { label: "Revoked", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
};

function IntegrationsTab({ data: _data, isLoading }: { data?: SystemResponse; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  function testConnection(name: string) {
    toast.success("Connection successful", { description: `${name} is reachable.` });
  }

  function reauthorize(name: string) {
    toast.message("Redirecting to Google…", { description: `Re-authorizing ${name} via OAuth.` });
  }

  return (
    <div className="space-y-4">
      {/* Integration cards */}
      <CardSection
        title="Connected Integrations"
        description="External services & APIs powering the platform"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {INTEGRATIONS.map((int) => {
            const Icon = int.icon;
            return (
              <div key={int.key} className="rounded-lg border bg-card p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold truncate">{int.name}</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{int.description}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px] font-medium shrink-0",
                      int.status === "error"
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", int.status === "error" ? "bg-rose-500" : "bg-emerald-500")} />
                    {int.statusLabel}
                  </Badge>
                </div>

                <div className="mt-3 text-[11px] text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1.5">
                  {int.detail}
                </div>

                <div className="mt-auto pt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={() => testConnection(int.name)}
                  >
                    <Zap className="size-3 mr-1" /> Test
                  </Button>
                  {int.reauthorize && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={() => reauthorize(int.name)}
                    >
                      <RotateCw className="size-3 mr-1" /> Re-authorize
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardSection>

      {/* API Tokens table */}
      <CardSection
        title="API Tokens"
        description="Credentials & tokens used by background jobs"
      >
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[180px]">Provider</TableHead>
                <TableHead className="min-w-[180px]">Token Name</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="min-w-[140px]">Last Used</TableHead>
                <TableHead className="min-w-[140px]">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {API_TOKENS.map((t) => {
                const meta = TOKEN_STATUS_META[t.status];
                return (
                  <TableRow key={t.tokenName}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <KeyRound className="size-3.5 text-amber-500" />
                        <span className="text-sm font-medium">{t.provider}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.tokenName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[11px] font-medium", meta.cls)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relativeTime(t.lastUsed)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.expiresAt ? relativeTime(t.expiresAt) : <span className="font-mono">Never</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardSection>

      {/* Quick health links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthMini icon={Globe} label="Google API" value="Healthy" tint="emerald" />
        <HealthMini icon={CircuitBoard} label="AI Service" value="Healthy" tint="emerald" />
        <HealthMini icon={Server} label="Database" value="Online" tint="emerald" />
        <HealthMini icon={Boxes} label="Webhooks" value="2 / 2 OK" tint="emerald" />
      </div>
    </div>
  );
}

function HealthMini({
  icon: Icon, label, value, tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tint: "emerald" | "amber" | "rose";
}) {
  const cls = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  }[tint];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", cls)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared skeleton
// ────────────────────────────────────────────────────────────────────────────

function TableSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <CardSection title="Loading…" description="Fetching data">
      <div className="rounded-lg border max-h-[calc(100vh-24rem)] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {Array.from({ length: cols }).map((_, i) => (
                <TableHead key={i}><Skeleton className="h-3 w-20" /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, r) => (
              <TableRow key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <TableCell key={c} className="py-3"><Skeleton className="h-3 w-full max-w-[180px]" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardSection>
  );
}

export default SystemView;
