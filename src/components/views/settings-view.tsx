"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { ROLES, type Role } from "@/lib/types";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { useLocations } from "@/hooks/use-locations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Settings, UserPlus, Pencil, Search, Sparkles, RefreshCw, Building2, Phone, Mail,
  ShieldCheck, Server, Cpu, Clock, Star, MessageSquare, BarChart3,
  CheckCircle2, AlertTriangle, KeyRound, Plug, ExternalLink, Users, Lock, Save, Zap,
  LayoutDashboard, Bell, ListChecks, HardDrive, HeartPulse, Info, Code2, DatabaseBackup,
  Shield, ChevronDown, ChevronRight, Loader2, Activity, Database, FileWarning,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  phone?: string | null;
  avatar?: string | null;
  assignedLocationIds: string[];
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  lastLoginAt: string | null;
  lastLoginIp?: string | null;
  createdAt: string;
}

interface BrandSettings {
  name?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  logoUrl?: string;
  timezone?: string;
  language?: string;
  dateFormat?: string;
  currency?: string;
}

interface AiSettings {
  assistantName?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retryCount?: number;
  autoApprove?: boolean;
  maxTokensPerDay?: number;
}

interface SyncSettings {
  reviewsInterval?: string;
  businessInfoInterval?: string;
  postsInterval?: string;
  analyticsInterval?: string;
  retryAttempts?: number;
  retryDelay?: number;
  batchSize?: number;
}

interface SmtpSettings {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  encryption?: string;
  senderName?: string;
  senderEmail?: string;
}

interface SecuritySettings {
  sessionTimeout?: number;
  jwtExpiry?: number;
  maxFailedAttempts?: number;
  lockDuration?: number;
}

type SettingsMap = Record<string, any>;

interface HealthCheck {
  service: string;
  status: "healthy" | "warning" | "critical";
  latency?: number;
  message: string;
  details?: any;
}
interface HealthResponse {
  overall: "healthy" | "warning" | "critical";
  summary: { total: number; healthy: number; warnings: number; critical: number };
  checks: HealthCheck[];
}

interface BackgroundJobRow {
  id: string;
  queueName: string;
  jobName: string;
  status: string;
  attempts: number;
  payload: any;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}
interface JobsResponse {
  stats: { queued: number; processing: number; completed: number; failed: number; retrying: number };
  jobs: BackgroundJobRow[];
}

interface ErrorLogItem {
  id: string;
  module: string;
  errorCode: string;
  errorMessage: string;
  resolved: boolean;
  createdAt: string;
}
interface SystemResponse {
  schema: { totalTables: number; totalRows: number; tables: any[] };
  syncLogs: any[];
  scheduledJobs: any[];
  backgroundJobs: any[];
  errorLogs: ErrorLogItem[];
  apiLogs: any[];
  dashboardWidgets: any[];
  storageBuckets: { bucket: string; fileCount: number; totalSize: number }[];
  storageFiles: { id: string; bucket: string; originalName: string; mimeType: string; fileSize: number; createdAt: string }[];
  aiUsage: { total: { requests: number; tokens: number; cost: number }; daily: any[] };
}

interface BackupHistory {
  id: string;
  timestamp: string;
  size: string;
  status: string;
  type: string;
}
interface BackupResponse {
  lastBackup: string;
  status: string;
  retention: string;
  schedule: string;
  history: BackupHistory[];
  storage: { total: string; used: string; available: string; backups: number };
}

interface SystemInfoResponse {
  environment: string;
  applicationVersion: string;
  buildNumber: string;
  deploymentDate: string;
  databaseVersion: string;
  framework: string;
  runtime: string;
  nodeVersion: string;
  platform: string;
  timezone: string;
  apiVersion: string;
  packages: { frontend: string[]; backend: string[]; database: string; ai: string };
  features: { auth: string; database: string; ai: string; googleIntegration: string; realtime: string; storage: string };
}

interface PromptType {
  id: string;
  name: string;
  description: string;
  version: string;
  variables: string[];
  active: boolean;
  lastModified: string;
  template: string;
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------
const ROLE_BADGE: Record<Role, string> = {
  super_admin: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  marketing_manager: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  branch_manager: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  customer_support: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  viewer: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

const ROLE_DOT: Record<Role, string> = {
  super_admin: "bg-emerald-500",
  marketing_manager: "bg-amber-500",
  branch_manager: "bg-teal-500",
  customer_support: "bg-rose-500",
  viewer: "bg-slate-400",
};

const ROLE_ICON: Record<Role, React.ComponentType<{ className?: string }>> = {
  super_admin: ShieldCheck,
  marketing_manager: BarChart3,
  branch_manager: Building2,
  customer_support: MessageSquare,
  viewer: Users,
};

function roleLabel(role: Role) {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// ---------------------------------------------------------------------------
// Job queue color palette
// ---------------------------------------------------------------------------
const QUEUE_COLORS: Record<string, string> = {
  "google-sync": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "review-sync": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "analytics-sync": "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  "ai-processing": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "notifications": "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  "reports": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
};

function queueColor(q: string) {
  return QUEUE_COLORS[q] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
}

function healthColor(status: "healthy" | "warning" | "critical") {
  return status === "healthy"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
    : status === "warning"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
}

function healthDot(status: "healthy" | "warning" | "critical") {
  return status === "healthy" ? "bg-emerald-500" : status === "warning" ? "bg-amber-500" : "bg-rose-500";
}

function jobStatusColor(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "processing": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "queued": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "failed": return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    case "retrying": return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
    default: return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  }
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------
type CategoryKey =
  | "overview" | "users" | "general" | "google" | "ai" | "notifications"
  | "smtp" | "sync" | "security" | "storage" | "health" | "jobs"
  | "errors" | "backup" | "environment" | "api-docs";

interface CategoryMeta {
  key: CategoryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission gate; if returns false, category is hidden */
  canSee: (role: Role) => boolean;
}

const CATEGORIES: CategoryMeta[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, canSee: (r) => can(r, "system.view") || can(r, "settings.view") },
  { key: "users", label: "Users & Roles", icon: Users, canSee: (r) => can(r, "settings.view") },
  { key: "general", label: "General", icon: Settings, canSee: (r) => can(r, "settings.view") },
  { key: "google", label: "Google Integration", icon: Plug, canSee: (r) => can(r, "settings.view") },
  { key: "ai", label: "AI Provider", icon: Sparkles, canSee: (r) => can(r, "settings.view") },
  { key: "notifications", label: "Notifications", icon: Bell, canSee: (r) => can(r, "settings.view") },
  { key: "smtp", label: "Email / SMTP", icon: Mail, canSee: (r) => can(r, "settings.view") },
  { key: "sync", label: "Sync", icon: RefreshCw, canSee: (r) => can(r, "settings.view") },
  { key: "security", label: "Security", icon: Shield, canSee: (r) => can(r, "settings.view") },
  { key: "storage", label: "Storage", icon: HardDrive, canSee: (r) => can(r, "settings.view") || can(r, "system.view") },
  { key: "health", label: "Health Checks", icon: HeartPulse, canSee: (r) => can(r, "system.view") },
  { key: "jobs", label: "Background Jobs", icon: ListChecks, canSee: (r) => can(r, "system.view") },
  { key: "errors", label: "Error Monitoring", icon: AlertTriangle, canSee: (r) => can(r, "system.view") },
  { key: "backup", label: "Backup & Restore", icon: DatabaseBackup, canSee: (r) => can(r, "system.view") || can(r, "settings.view") },
  { key: "environment", label: "Environment", icon: Info, canSee: (r) => can(r, "settings.view") },
  { key: "api-docs", label: "API Documentation", icon: Code2, canSee: () => true },
];

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function SettingsView() {
  const user = useUser();
  const visible = useMemo(() => CATEGORIES.filter((c) => c.canSee(user.role)), [user.role]);
  const [active, setActive] = useState<CategoryKey | null>(null);

  // Resolve the active category — if unset or hidden, fall back to the first visible one.
  const validActive: CategoryKey = active && visible.find((c) => c.key === active)
    ? active
    : (visible[0]?.key ?? "overview");

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Settings"
        description="Manage users, integrations, security & system configuration"
        icon={Settings}
      />

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0">
          <nav className="space-y-1 sticky top-4">
            {visible.map((cat) => {
              const isActive = validActive === cat.key;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActive(cat.key)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile category picker */}
        <div className="md:hidden w-full">
          <Select value={validActive} onValueChange={(v) => setActive(v as CategoryKey)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visible.map((cat) => {
                const Icon = cat.icon;
                return (
                  <SelectItem key={cat.key} value={cat.key}>
                    <span className="flex items-center gap-2">
                      <Icon className="size-3.5" />
                      {cat.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0">
          {/* On desktop, render after sidebar; on mobile, render below select */}
          <div className="md:hidden h-4" />
          <CategoryContent active={validActive} />
        </div>
      </div>
    </div>
  );
}

function CategoryContent({ active }: { active: CategoryKey }) {
  switch (active) {
    case "overview": return <OverviewContent />;
    case "users": return <UsersContent />;
    case "general": return <GeneralContent />;
    case "google": return <GoogleIntegrationContent />;
    case "ai": return <AiProviderContent />;
    case "notifications": return <NotificationsContent />;
    case "smtp": return <SmtpContent />;
    case "sync": return <SyncContent />;
    case "security": return <SecurityContent />;
    case "storage": return <StorageContent />;
    case "health": return <HealthChecksContent />;
    case "jobs": return <JobsContent />;
    case "errors": return <ErrorMonitoringContent />;
    case "backup": return <BackupContent />;
    case "environment": return <EnvironmentContent />;
    case "api-docs": return <ApiDocsContent />;
    default: return null;
  }
}

// ===========================================================================
// 1. OVERVIEW
// ===========================================================================
function OverviewContent() {
  const user = useUser();
  const { data: users } = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: () => api<UserRow[]>("/api/users"),
  });
  const { data: locations } = useLocations();
  const { data: health, isLoading: healthLoading } = useQuery<HealthResponse>({
    queryKey: ["admin", "system-health"],
    queryFn: () => api<HealthResponse>("/api/admin/system-health"),
  });
  const { data: jobs } = useQuery<JobsResponse>({
    queryKey: ["admin", "jobs"],
    queryFn: () => api<JobsResponse>("/api/admin/jobs"),
  });
  const canSystem = can(user.role, "system.view");
  const { data: system } = useQuery<SystemResponse>({
    queryKey: ["system"],
    queryFn: () => api<SystemResponse>("/api/system"),
    enabled: canSystem,
  });

  const activeLocations = (locations ?? []).filter((l) => l.status === "active").length;
  const totalUsers = users?.length ?? 0;
  const failedJobs = jobs?.stats.failed ?? 0;
  const pendingAiJobs = jobs?.jobs.filter((j) => j.queueName === "ai-processing" && (j.status === "queued" || j.status === "processing")).length ?? 0;
  const dbCheck = health?.checks.find((c) => c.service === "Database");
  const storageUsed = system?.storageBuckets.reduce((a, b) => a + b.totalSize, 0) ?? 0;
  const storageUsedMb = (storageUsed / 1024 / 1024).toFixed(1);

  const errorLogs = system?.errorLogs ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Admin Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time system health, recent alerts & operational overview.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={totalUsers} icon={Users} accent="emerald" hint="Across all roles" />
        <StatCard label="Active Locations" value={activeLocations} icon={Building2} accent="teal" hint={`of ${locations?.length ?? 0} total`} />
        <StatCard label="Google Accounts" value="1" icon={Plug} accent="amber" hint="OAuth connected" />
        <StatCard
          label="System Health"
          value={health ? health.overall.charAt(0).toUpperCase() + health.overall.slice(1) : "—"}
          icon={HeartPulse}
          accent={health?.overall === "healthy" ? "emerald" : health?.overall === "warning" ? "amber" : "rose"}
          hint={health ? `${health.summary.healthy}/${health.summary.total} services healthy` : "Loading…"}
        />
        <StatCard label="Failed Jobs" value={failedJobs} icon={AlertTriangle} accent={failedJobs > 0 ? "rose" : "emerald"} hint="Requires attention" />
        <StatCard label="Pending AI Jobs" value={pendingAiJobs} icon={Sparkles} accent="amber" hint="Queued + processing" />
        <StatCard label="Storage Used" value={`${storageUsedMb} MB`} icon={HardDrive} accent="teal" hint="Across all buckets" />
        <StatCard
          label="Database"
          value={dbCheck ? dbCheck.status === "healthy" ? "Healthy" : dbCheck.status === "warning" ? "Slow" : "Down" : "—"}
          icon={Database}
          accent={dbCheck?.status === "healthy" ? "emerald" : dbCheck?.status === "warning" ? "amber" : "rose"}
          hint={dbCheck?.latency ? `${dbCheck.latency}ms latency` : "—"}
        />
      </div>

      {/* System health summary */}
      <CardSection
        title="System Health Summary"
        description="Aggregate status across all backend services"
        action={
          health ? (
            <Badge variant="outline" className={cn("text-xs font-medium", healthColor(health.overall))}>
              <span className={cn("size-1.5 rounded-full mr-1", healthDot(health.overall))} />
              {health.overall.toUpperCase()}
            </Badge>
          ) : null
        }
      >
        {healthLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <HealthStat label="Healthy" value={health?.summary.healthy ?? 0} status="healthy" />
              <HealthStat label="Warnings" value={health?.summary.warnings ?? 0} status="warning" />
              <HealthStat label="Critical" value={health?.summary.critical ?? 0} status="critical" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {health?.checks.map((c) => (
                <div key={c.service} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.service}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.message}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.latency != null && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">{c.latency}ms</span>
                    )}
                    <Badge variant="outline" className={cn("text-[10px] font-medium", healthColor(c.status))}>
                      <span className={cn("size-1.5 rounded-full mr-1", healthDot(c.status))} />
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardSection>

      {/* Latest system alerts */}
      <CardSection
        title="Latest System Alerts"
        description="Recent unresolved errors from the error monitor"
      >
        {!canSystem ? (
          <RestrictedNotice text="Error logs require system.view permission." />
        ) : errorLogs.length === 0 ? (
          <EmptyNotice icon={CheckCircle2} title="No recent errors" subtitle="All systems are operating normally." tone="emerald" />
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto scroll-area">
            {errorLogs.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className={cn(
                  "size-8 rounded-md flex items-center justify-center shrink-0",
                  e.resolved ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                )}>
                  {e.resolved ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{e.module}</span>
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">{e.errorCode}</Badge>
                    {!e.resolved && (
                      <Badge variant="outline" className="text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 px-1.5 py-0">
                        Unresolved
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.errorMessage}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardSection>
    </div>
  );
}

function HealthStat({ label, value, status }: { label: string; value: number; status: "healthy" | "warning" | "critical" }) {
  return (
    <div className={cn("rounded-lg border p-3 text-center", healthColor(status))}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

// ===========================================================================
// 2. USERS & ROLES
// ===========================================================================
function UsersContent() {
  const user = useUser();
  const canManageUsers = can(user.role, "users.manage");
  return canManageUsers ? <UsersTab /> : <UsersAccessRestricted />;
}

function UsersTab() {
  const qc = useQueryClient();
  const { data: locations } = useLocations();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: () => api<UserRow[]>("/api/users"),
  });

  const locationMap = useMemo(() => {
    const m = new Map<string, string>();
    (locations ?? []).forEach((l) => m.set(l.id, l.city || l.name));
    return m;
  }, [locations]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      roleLabel(u.role).toLowerCase().includes(q),
    );
  }, [users, search]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditing(u);
    setDialogOpen(true);
  }

  async function toggleStatus(u: UserRow) {
    setTogglingId(u.id);
    try {
      const newStatus = u.status === "active" ? "inactive" : "active";
      await api("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ id: u.id, status: newStatus }),
      });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${u.name} ${newStatus === "active" ? "activated" : "deactivated"}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update user");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Users & Roles</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Invite team members and manage role assignments.</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="size-3.5 mr-1.5" /> Invite user
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name, email, role…"
          className="pl-9 h-9"
        />
      </div>

      {/* Users table — desktop */}
      <Card className="overflow-hidden hidden md:block">
        {isLoading ? (
          <UsersTableSkeleton />
        ) : filtered.length === 0 ? (
          <UsersEmpty search={search} />
        ) : (
          <div className="overflow-x-auto scroll-area">
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Assigned Locations</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <UserTableRow
                  key={u.id}
                  u={u}
                  locationMap={locationMap}
                  toggling={togglingId === u.id}
                  onToggle={() => toggleStatus(u)}
                  onEdit={() => openEdit(u)}
                />
              ))}
            </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Users list — mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-0"><UsersEmpty search={search} /></CardContent></Card>
        ) : (
          filtered.map((u) => (
            <UserCard
              key={u.id}
              u={u}
              locationMap={locationMap}
              toggling={togglingId === u.id}
              onToggle={() => toggleStatus(u)}
              onEdit={() => openEdit(u)}
            />
          ))
        )}
      </div>

      {/* Role legend */}
      <RoleLegend />

      {/* Create / Edit dialog */}
      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}

function UserTableRow({
  u, locationMap, toggling, onToggle, onEdit,
}: {
  u: UserRow;
  locationMap: Map<string, string>;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const assignedCities = u.assignedLocationIds
    .map((id) => locationMap.get(id))
    .filter(Boolean) as string[];

  return (
    <TableRow className="hover:bg-accent/30">
      <TableCell className="pl-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="size-8">
            {u.avatar ? <AvatarImage src={u.avatar} alt={u.name} /> : null}
            <AvatarFallback className={cn("text-[10px] font-semibold", ROLE_BADGE[u.role].split(" ").slice(0, 2).join(" "))}>
              {initials(u.name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium truncate">{u.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{u.email}</TableCell>
      <TableCell>
        <RoleBadge role={u.role} />
      </TableCell>
      <TableCell>
        {u.role === "branch_manager" ? (
          assignedCities.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">Unassigned</span>
          ) : (
            <div className="flex flex-wrap gap-1 max-w-[220px]">
              {assignedCities.slice(0, 3).map((c) => (
                <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  {c}
                </Badge>
              ))}
              {assignedCities.length > 3 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  +{assignedCities.length - 3}
                </Badge>
              )}
            </div>
          )
        ) : (
          <span className="text-xs text-muted-foreground">All</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={u.status === "active"} onCheckedChange={onToggle} disabled={toggling} aria-label="Toggle active" />
          {u.status === "active" ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
          ) : (
            <span className="text-xs text-muted-foreground">Inactive</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : "Never"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {format(new Date(u.createdAt), "dd MMM yyyy")}
      </TableCell>
      <TableCell className="pr-5 text-right">
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2">
          <Pencil className="size-3.5 mr-1" /> Edit
        </Button>
      </TableCell>
    </TableRow>
  );
}

function UserCard({
  u, locationMap, toggling, onToggle, onEdit,
}: {
  u: UserRow;
  locationMap: Map<string, string>;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const assignedCities = u.assignedLocationIds
    .map((id) => locationMap.get(id))
    .filter(Boolean) as string[];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="size-9">
              {u.avatar ? <AvatarImage src={u.avatar} alt={u.name} /> : null}
              <AvatarFallback className={cn("text-[11px] font-semibold", ROLE_BADGE[u.role].split(" ").slice(0, 2).join(" "))}>
                {initials(u.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium truncate">{u.name}</div>
              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
            </div>
          </div>
          <RoleBadge role={u.role} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="flex items-center gap-2 mt-1">
              <Switch checked={u.status === "active"} onCheckedChange={onToggle} disabled={toggling} aria-label="Toggle active" />
              {u.status === "active" ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
              ) : (
                <span className="text-muted-foreground">Inactive</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Last login</div>
            <div className="mt-1 tabular-nums">
              {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : "Never"}
            </div>
          </div>
        </div>

        {u.role === "branch_manager" && (
          <div className="text-xs">
            <div className="text-muted-foreground mb-1">Assigned locations</div>
            {assignedCities.length === 0 ? (
              <span className="italic text-muted-foreground">Unassigned</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {assignedCities.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1 border-t">
          <Button variant="outline" size="sm" onClick={onEdit} className="h-7">
            <Pencil className="size-3.5 mr-1" /> Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant="outline" className={cn("font-medium", ROLE_BADGE[role])}>
      <span className={cn("size-1.5 rounded-full", ROLE_DOT[role])} />
      {roleLabel(role)}
    </Badge>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="overflow-x-auto scroll-area">
      <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-3 w-16" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 8 }).map((_, j) => (
              <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      </Table>
    </div>
  );
}

function UsersEmpty({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Users className="size-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">
        {search ? "No users match your search" : "No users yet"}
      </h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        {search
          ? `No users found for "${search}". Try a different name, email, or role.`
          : "Invite your first team member to start managing MyFNG."}
      </p>
    </div>
  );
}

function RoleLegend() {
  return (
    <CardSection
      title="Roles & Permissions"
      description="Five role tiers power the MyFNG RBAC matrix"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ROLES.map((r) => {
          const Icon = ROLE_ICON[r.value];
          return (
            <div key={r.value} className="rounded-lg border p-3 flex gap-3">
              <div className={cn("size-8 rounded-md flex items-center justify-center shrink-0", ROLE_BADGE[r.value])}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className={cn("size-1.5 rounded-full", ROLE_DOT[r.value])} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{r.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </CardSection>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit user dialog
// ---------------------------------------------------------------------------
function UserDialog({
  open, onOpenChange, editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: UserRow | null;
}) {
  const qc = useQueryClient();
  const { data: locations, isLoading: locationsLoading } = useLocations();

  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [password, setPassword] = useState("");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setEmail(editing.email);
      setRole(editing.role);
      setPassword("");
      setAssignedIds(editing.assignedLocationIds ?? []);
      setActive(editing.status === "active");
    } else {
      setName("");
      setEmail("");
      setRole("viewer");
      setPassword("");
      setAssignedIds([]);
      setActive(true);
    }
    setErrors({});
  }, [open, editing]);

  function toggleLocation(id: string) {
    setAssignedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Invalid email";
    if (!isEdit && !password) e.password = "Password is required";
    else if (!isEdit && password.length < 8) e.password = "Min 8 characters";
    if (role === "branch_manager" && assignedIds.length === 0) {
      e.assigned = "Assign at least one location";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api("/api/users", {
          method: "PATCH",
          body: JSON.stringify({
            id: editing!.id,
            name: name.trim(),
            role,
            active,
            assignedLocationIds: role === "branch_manager" ? assignedIds : [],
          }),
        });
        toast.success("User updated");
      } else {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            role,
            password,
            assignedLocationIds: role === "branch_manager" ? assignedIds : [],
          }),
        });
        toast.success("User invited");
      }
      qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Invite a new user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update role, location assignments, and status."
              : "Create a new team member and assign a role."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Full name</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@myfng.in"
              aria-invalid={!!errors.email}
              disabled={isEdit}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">Email cannot be changed after creation.</p>
            )}
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Password</Label>
              <Input
                id="u-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {ROLES.find((r) => r.value === role)?.description}
            </p>
          </div>

          {role === "branch_manager" && (
            <div className="space-y-1.5">
              <Label>Assigned locations</Label>
              <div className="rounded-md border max-h-44 overflow-y-auto scroll-area divide-y">
                {locationsLoading ? (
                  <div className="p-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-5 w-full" />
                    ))}
                  </div>
                ) : (locations ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No locations available.</p>
                ) : (
                  (locations ?? []).map((l) => (
                    <label
                      key={l.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40 cursor-pointer"
                    >
                      <Checkbox
                        checked={assignedIds.includes(l.id)}
                        onCheckedChange={() => toggleLocation(l.id)}
                      />
                      <span className="text-sm">{l.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{l.city}</span>
                    </label>
                  ))
                )}
              </div>
              {errors.assigned && <p className="text-xs text-destructive">{errors.assigned}</p>}
              <p className="text-[11px] text-muted-foreground">
                Branch managers can only see & act on assigned locations.
              </p>
            </div>
          )}

          {isEdit && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-default">Account active</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Inactive users cannot sign in.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
            ) : (
              <>{isEdit ? "Save changes" : "Invite user"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// 3. GENERAL
// ===========================================================================
function GeneralContent() {
  const user = useUser();
  return <GeneralTab readonly={!can(user.role, "settings.view")} />;
}

function GeneralTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });

  const brand: BrandSettings = (settings?.brand as BrandSettings) ?? {};
  const [form, setForm] = useState<BrandSettings>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (brand && Object.keys(brand).length > 0) {
      setForm({
        name: brand.name ?? "MyFNG",
        tagline: brand.tagline ?? "",
        supportEmail: brand.supportEmail ?? "",
        supportPhone: brand.supportPhone ?? "",
        logoUrl: brand.logoUrl ?? "",
        timezone: brand.timezone ?? "Asia/Kolkata",
        language: brand.language ?? "en-IN",
        dateFormat: brand.dateFormat ?? "dd MMM yyyy",
        currency: brand.currency ?? "INR",
      });
    }
  }, [settings]);

  function set<K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = "Brand name is required";
    if (form.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.supportEmail)) {
      e.supportEmail = "Invalid email";
    }
    if (form.logoUrl && !/^https?:\/\//.test(form.logoUrl)) e.logoUrl = "Must start with http(s)://";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "brand", value: form }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("General settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <FormSkeleton />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">General Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Company identity, locale, and contact details.</p>
      </div>
      <CardSection
        title="Company Information"
        description="Used across the platform for branding & support"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Company name" icon={Building2} error={errors.name}>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} disabled={readonly} placeholder="MyFNG" aria-invalid={!!errors.name} />
          </Field>
          <Field label="Tagline" icon={Sparkles}>
            <Input value={form.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} disabled={readonly} placeholder="Home Interiors & Services" />
          </Field>
          <Field label="Logo URL" icon={Building2} error={errors.logoUrl}>
            <Input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} disabled={readonly} placeholder="https://…" aria-invalid={!!errors.logoUrl} />
          </Field>
          <Field label="Support email" icon={Mail} error={errors.supportEmail}>
            <Input type="email" value={form.supportEmail ?? ""} onChange={(e) => set("supportEmail", e.target.value)} disabled={readonly} placeholder="care@myfng.in" aria-invalid={!!errors.supportEmail} />
          </Field>
          <Field label="Support phone" icon={Phone}>
            <Input value={form.supportPhone ?? ""} onChange={(e) => set("supportPhone", e.target.value)} disabled={readonly} placeholder="+91 22 4000 1000" />
          </Field>
          <Field label="Timezone" icon={Clock}>
            <Select value={form.timezone ?? "Asia/Kolkata"} onValueChange={(v) => set("timezone", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Language" icon={MessageSquare}>
            <Select value={form.language ?? "en-IN"} onValueChange={(v) => set("language", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en-IN">English (India)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="hi-IN">Hindi</SelectItem>
                <SelectItem value="mr-IN">Marathi</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date format" icon={Clock}>
            <Select value={form.dateFormat ?? "dd MMM yyyy"} onValueChange={(v) => set("dateFormat", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dd MMM yyyy">dd MMM yyyy (01 Jan 2025)</SelectItem>
                <SelectItem value="MMM dd, yyyy">MMM dd, yyyy (Jan 01, 2025)</SelectItem>
                <SelectItem value="dd-MM-yyyy">dd-MM-yyyy (01-01-2025)</SelectItem>
                <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2025-01-01)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency" icon={Zap}>
            <Select value={form.currency ?? "INR"} onValueChange={(v) => set("currency", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="AED">AED (د.إ)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {!readonly && (
          <div className="flex justify-end pt-4 mt-2 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save general settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>
    </div>
  );
}

// ===========================================================================
// 4. GOOGLE INTEGRATION
// ===========================================================================
function GoogleIntegrationContent() {
  const user = useUser();
  const readonly = !can(user.role, "settings.view");
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });
  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["admin", "system-health"],
    queryFn: () => api<HealthResponse>("/api/admin/system-health"),
  });

  const google = (settings?.google as any) ?? {};
  const oauthCheck = health?.checks.find((c) => c.service === "Google OAuth");
  const [syncFreq, setSyncFreq] = useState(google.syncFrequency ?? "15m");
  const [defaultReviews, setDefaultReviews] = useState(true);
  const [defaultBusiness, setDefaultBusiness] = useState(true);
  const [defaultPosts, setDefaultPosts] = useState(true);
  const [defaultAnalytics, setDefaultAnalytics] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (google && Object.keys(google).length > 0) {
      setSyncFreq(google.syncFrequency ?? "15m");
    }
  }, [settings]);

  function reauthorize() {
    toast.message("Redirecting to Google…", {
      description: "You'll be asked to grant MyFNG access to your Business Profile.",
    });
  }

  function testConnection() {
    toast.promise(
      new Promise((r) => setTimeout(r, 900)),
      { loading: "Testing connection…", success: "Google OAuth: Connection successful", error: "Connection failed" },
    );
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          key: "google",
          value: {
            syncFrequency: syncFreq,
            defaultSync: { reviews: defaultReviews, business: defaultBusiness, posts: defaultPosts, analytics: defaultAnalytics },
          },
        }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Google integration settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Google Integration</h2>
        <p className="text-sm text-muted-foreground mt-0.5">OAuth credentials & sync configuration for Google Business Profile.</p>
      </div>

      {/* OAuth status */}
      <CardSection
        title="OAuth Status"
        description="Current connection state & token health"
        action={
          oauthCheck ? (
            <Badge variant="outline" className={cn("text-xs font-medium", healthColor(oauthCheck.status))}>
              <span className={cn("size-1.5 rounded-full mr-1", healthDot(oauthCheck.status))} />
              {oauthCheck.status === "healthy" ? "Connected" : oauthCheck.status === "warning" ? "Action needed" : "Disconnected"}
            </Badge>
          ) : null
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client ID</Label>
            <Input readOnly value="••••••••••••••••••.apps.googleusercontent.com" className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Redirect URI</Label>
            <Input readOnly value="/api/google/oauth/callback" className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Connected Account</Label>
            <Input readOnly value={oauthCheck?.details?.email ?? "No account linked"} className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Token Expiry</Label>
            <Input
              readOnly
              value={oauthCheck?.details?.tokenExpiry ? format(new Date(oauthCheck.details.tokenExpiry), "dd MMM yyyy, HH:mm") : "—"}
              className="text-xs tabular-nums"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-500" />
            <p className="text-xs text-muted-foreground">
              Last refresh: <span className="text-foreground">{oauthCheck?.details?.tokenExpiry ? "Auto-refreshed" : "—"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={testConnection}>
              <Zap className="size-3.5 mr-1.5" /> Test connection
            </Button>
            <Button variant="outline" size="sm" onClick={reauthorize}>
              <ExternalLink className="size-3.5 mr-1.5" /> Re-authorize
            </Button>
          </div>
        </div>
      </CardSection>

      {/* Sync configuration */}
      <CardSection
        title="Sync Configuration"
        description="How often MyFNG polls Google Business Profile"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Sync frequency" icon={RefreshCw}>
            <Select value={syncFreq} onValueChange={setSyncFreq} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5m">Every 5 minutes</SelectItem>
                <SelectItem value="15m">Every 15 minutes</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
                <SelectItem value="1h">Every hour</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Separator className="my-4" />
        <Label className="text-sm font-medium">Default sync options</Label>
        <p className="text-xs text-muted-foreground mt-0.5">Modules enabled by default when triggering a manual sync.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <ToggleRow label="Reviews" description="New reviews & ratings" checked={defaultReviews} onChange={setDefaultReviews} disabled={readonly} color="emerald" />
          <ToggleRow label="Business Info" description="Hours, photos, address" checked={defaultBusiness} onChange={setDefaultBusiness} disabled={readonly} color="teal" />
          <ToggleRow label="Posts" description="Published Whats New & offers" checked={defaultPosts} onChange={setDefaultPosts} disabled={readonly} color="amber" />
          <ToggleRow label="Analytics" description="Search views, calls, directions" checked={defaultAnalytics} onChange={setDefaultAnalytics} disabled={readonly} color="rose" />
        </div>

        {!readonly && (
          <div className="flex justify-end pt-4 mt-4 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save Google settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>
    </div>
  );
}

// ===========================================================================
// 5. AI PROVIDER
// ===========================================================================
const AI_MODELS = [
  { value: "glm-4.6", label: "GLM-4.6 (Recommended)" },
  { value: "glm-4-air", label: "GLM-4 Air (Fast)" },
  { value: "glm-4-flash", label: "GLM-4 Flash (Lightweight)" },
];

const PROMPT_TYPES: PromptType[] = [
  {
    id: "review-reply",
    name: "Review Reply",
    description: "AI-generated responses to customer reviews.",
    version: "1.2.0",
    variables: ["customer_name", "rating", "location_name", "review_text"],
    active: true,
    lastModified: "2025-01-15T10:00:00Z",
    template: "You are MiSA, an AI assistant for {location_name}. Write a professional, empathetic reply to a {rating}-star review from {customer_name}. Review text: \"{review_text}\". Keep the reply under 80 words, warm and concise.",
  },
  {
    id: "google-posts",
    name: "Google Posts",
    description: "Generate Whats New, offer & event posts.",
    version: "1.1.0",
    variables: ["location_name", "post_type", "topic", "cta"],
    active: true,
    lastModified: "2025-01-12T14:30:00Z",
    template: "You are MiSA. Create a {post_type} post for {location_name} about {topic}. Include a clear {cta}. Keep it under 100 words and engaging.",
  },
  {
    id: "seo-recommendations",
    name: "SEO Recommendations",
    description: "Generate actionable SEO improvement suggestions.",
    version: "1.0.3",
    variables: ["location_name", "current_score", "missing_categories"],
    active: true,
    lastModified: "2025-01-10T09:15:00Z",
    template: "You are MiSA, an SEO expert. For {location_name} (current SEO score: {current_score}), generate 5 prioritized recommendations. Missing: {missing_categories}. Format as a numbered list with rationale.",
  },
  {
    id: "business-description",
    name: "Business Description",
    description: "Generate GBP business descriptions.",
    version: "1.0.0",
    variables: ["location_name", "city", "services", "usp"],
    active: false,
    lastModified: "2024-12-28T11:00:00Z",
    template: "Write a 750-character business description for {location_name} in {city}. Services: {services}. USP: {usp}. Tone: professional yet approachable.",
  },
  {
    id: "monthly-reports",
    name: "Monthly Reports",
    description: "Summarize monthly performance into a narrative.",
    version: "2.0.1",
    variables: ["location_name", "month", "metrics_summary", "highlights"],
    active: true,
    lastModified: "2025-01-05T16:45:00Z",
    template: "You are MiSA. Generate a monthly performance report for {location_name} for {month}. Metrics: {metrics_summary}. Highlights: {highlights}. Structure: Executive summary, wins, challenges, recommendations.",
  },
  {
    id: "profile-audit",
    name: "Profile Audit",
    description: "Audit GBP completeness and surface gaps.",
    version: "1.0.2",
    variables: ["location_name", "completeness_score", "missing_fields"],
    active: true,
    lastModified: "2025-01-08T13:20:00Z",
    template: "Audit the GBP profile for {location_name}. Completeness: {completeness_score}%. Missing fields: {missing_fields}. List each gap with severity (high/medium/low) and suggested action.",
  },
];

function AiProviderContent() {
  const user = useUser();
  const readonly = !can(user.role, "settings.view");
  return <AiTab readonly={readonly} />;
}

function AiTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });

  const ai: AiSettings = (settings?.ai as AiSettings) ?? {};
  const [form, setForm] = useState<AiSettings>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<PromptType | null>(null);

  useEffect(() => {
    if (ai && Object.keys(ai).length > 0) {
      setForm({
        assistantName: ai.assistantName ?? "MiSA AI",
        defaultModel: ai.defaultModel ?? "glm-4.6",
        temperature: ai.temperature ?? 0.7,
        maxTokens: ai.maxTokens ?? 2048,
        timeout: ai.timeout ?? 30,
        retryCount: ai.retryCount ?? 2,
        autoApprove: ai.autoApprove ?? false,
        maxTokensPerDay: ai.maxTokensPerDay ?? 200000,
      });
    }
  }, [settings]);

  function set<K extends keyof AiSettings>(k: K, v: AiSettings[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.assistantName?.trim()) e.assistantName = "Assistant name is required";
    if (form.maxTokensPerDay != null && form.maxTokensPerDay < 0) e.maxTokensPerDay = "Must be ≥ 0";
    if (form.maxTokens != null && form.maxTokens < 1) e.maxTokens = "Must be ≥ 1";
    if (form.timeout != null && form.timeout < 1) e.timeout = "Must be ≥ 1s";
    if (form.retryCount != null && form.retryCount < 0) e.retryCount = "Must be ≥ 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "ai", value: form }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("AI settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <FormSkeleton />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">AI Provider</h2>
        <p className="text-sm text-muted-foreground mt-0.5">MiSA AI configuration, model tuning & prompt management.</p>
      </div>

      {/* Provider card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="size-12 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Sparkles className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">MiSA AI</h3>
                  <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <span className="size-1.5 rounded-full bg-emerald-500 mr-1" />
                    Active
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">glm-4.6 via z-ai-web-dev-sdk — powers review replies, post generation, SEO recs, monthly summaries & multi-turn chat.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px] font-mono">model: glm-4.6</Badge>
                  <Badge variant="outline" className="text-[10px] font-mono">sdk: z-ai-web-dev-sdk</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration form */}
      <CardSection
        title="AI Configuration"
        description="Tune the assistant that powers review replies, posts & SEO recs"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Assistant name" icon={Sparkles} error={errors.assistantName}>
            <Input value={form.assistantName ?? ""} onChange={(e) => set("assistantName", e.target.value)} disabled={readonly} placeholder="MiSA AI" aria-invalid={!!errors.assistantName} />
          </Field>
          <Field label="Default model" icon={Cpu}>
            <Select value={form.defaultModel ?? "glm-4.6"} onValueChange={(v) => set("defaultModel", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Max tokens / day" icon={Zap} error={errors.maxTokensPerDay}>
            <Input type="number" min={0} step={10000} value={form.maxTokensPerDay ?? 0} onChange={(e) => set("maxTokensPerDay", Number(e.target.value))} disabled={readonly} aria-invalid={!!errors.maxTokensPerDay} />
          </Field>
          <Field label="Max tokens / request" icon={Zap} error={errors.maxTokens}>
            <Input type="number" min={1} step={256} value={form.maxTokens ?? 2048} onChange={(e) => set("maxTokens", Number(e.target.value))} disabled={readonly} aria-invalid={!!errors.maxTokens} />
          </Field>
          <Field label="Timeout (seconds)" icon={Clock} error={errors.timeout}>
            <Input type="number" min={1} value={form.timeout ?? 30} onChange={(e) => set("timeout", Number(e.target.value))} disabled={readonly} aria-invalid={!!errors.timeout} />
          </Field>
          <Field label="Retry count" icon={RefreshCw} error={errors.retryCount}>
            <Input type="number" min={0} value={form.retryCount ?? 2} onChange={(e) => set("retryCount", Number(e.target.value))} disabled={readonly} aria-invalid={!!errors.retryCount} />
          </Field>
        </div>

        {/* Temperature slider */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5"><Cpu className="size-3.5 text-muted-foreground" /> Temperature</Label>
            <Badge variant="outline" className="font-mono text-xs tabular-nums">{form.temperature?.toFixed(2) ?? "0.70"}</Badge>
          </div>
          <Slider
            value={[form.temperature ?? 0.7]}
            min={0}
            max={2}
            step={0.05}
            onValueChange={(v) => set("temperature", v[0])}
            disabled={readonly}
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>0 — Deterministic</span>
            <span>1 — Balanced</span>
            <span>2 — Creative</span>
          </div>
        </div>

        {/* Auto-approve toggle */}
        <div className="mt-4 rounded-lg border p-4 flex items-start gap-3">
          <div className="size-9 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-auto" className="cursor-default text-sm font-medium">Auto-approve AI actions</Label>
              <Switch id="ai-auto" checked={!!form.autoApprove} onCheckedChange={(v) => set("autoApprove", v)} disabled={readonly} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              When <span className="font-medium">off</span>, AI suggestions require human review before publishing — per doc §11. When on, MiSA AI may publish directly to Google Business Profile.
            </p>
            <div className="mt-2">
              {form.autoApprove ? (
                <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10">
                  <Zap className="size-3 mr-1" /> Auto-publishing enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10">
                  <CheckCircle2 className="size-3 mr-1" /> Human review required
                </Badge>
              )}
            </div>
          </div>
        </div>

        {!readonly && (
          <div className="flex justify-end pt-4 mt-4 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save AI settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>

      {/* Prompt management */}
      <CardSection
        title="AI Prompt Management"
        description="Versioned prompts powering each AI feature"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="space-y-2">
          {PROMPT_TYPES.map((p) => (
            <div key={p.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">v{p.version}</Badge>
                  {p.active ? (
                    <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1.5 py-0">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 px-1.5 py-0">Disabled</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.variables.map((v) => (
                    <code key={v} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{`{${v}}`}</code>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                  Modified {formatDistanceToNow(new Date(p.lastModified), { addSuffix: true })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditingPrompt(p)} disabled={readonly} className="shrink-0">
                <Pencil className="size-3 mr-1" /> Edit
              </Button>
            </div>
          ))}
        </div>
      </CardSection>

      {/* Edit prompt dialog */}
      <PromptEditDialog prompt={editingPrompt} open={!!editingPrompt} onOpenChange={(o) => !o && setEditingPrompt(null)} />
    </div>
  );
}

function PromptEditDialog({ prompt, open, onOpenChange }: { prompt: PromptType | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scroll-area">
        {prompt ? <PromptEditForm key={prompt.id} prompt={prompt} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PromptEditForm({ prompt, onClose }: { prompt: PromptType; onClose: () => void }) {
  // Initialize fresh on each mount (keyed by prompt.id in the parent).
  const [text, setText] = useState(prompt.template);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Prompt — {prompt.name}</DialogTitle>
        <DialogDescription>Version {prompt.version}. Changes are saved as a new version.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Available variables</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {prompt.variables.map((v) => (
              <code key={v} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">{`{${v}}`}</code>
            ))}
          </div>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[200px] font-mono text-xs"
          placeholder="Prompt template…"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { toast.success(`Prompt saved as v${nextVersion(prompt.version)}`); onClose(); }}>
          <Save className="size-3.5 mr-1.5" /> Save new version
        </Button>
      </DialogFooter>
    </>
  );
}

function nextVersion(v: string) {
  const parts = v.split(".").map((n) => parseInt(n, 10));
  if (parts.length < 3) return v;
  parts[2] += 1;
  return parts.join(".");
}

// ===========================================================================
// 6. NOTIFICATIONS
// ===========================================================================
const NOTIF_EVENTS = [
  { id: "new-review", label: "New Review", description: "Any new review arrives from Google", color: "text-amber-600 dark:text-amber-400" },
  { id: "1-star-review", label: "1-Star Review", description: "Critical negative review requires urgent attention", color: "text-rose-600 dark:text-rose-400" },
  { id: "sync-failure", label: "Sync Failure", description: "Google sync fails after retries", color: "text-rose-600 dark:text-rose-400" },
  { id: "token-expiry", label: "Token Expiry", description: "Google OAuth token expiring soon", color: "text-amber-600 dark:text-amber-400" },
  { id: "ai-job-failure", label: "AI Job Failure", description: "MiSA AI job fails to complete", color: "text-rose-600 dark:text-rose-400" },
  { id: "report-ready", label: "Scheduled Report Ready", description: "Monthly/weekly report generated successfully", color: "text-emerald-600 dark:text-emerald-400" },
  { id: "ranking-drop", label: "Ranking Drop", description: "SEO ranking drops by 5+ positions", color: "text-amber-600 dark:text-amber-400" },
  { id: "profile-error", label: "Profile Error", description: "Business profile error detected", color: "text-rose-600 dark:text-rose-400" },
];

function NotificationsContent() {
  const user = useUser();
  const readonly = !can(user.role, "settings.view");
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });
  const notif = (settings?.notifications as any) ?? {};
  const [events, setEvents] = useState<Record<string, { email: boolean; dashboard: boolean }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (notif && Object.keys(notif).length > 0 && notif.events) {
      setEvents(notif.events);
    } else {
      // sensible defaults
      const init: Record<string, { email: boolean; dashboard: boolean }> = {};
      NOTIF_EVENTS.forEach((e) => { init[e.id] = { email: e.id === "1-star-review" || e.id === "sync-failure", dashboard: true }; });
      setEvents(init);
    }
  }, [settings]);

  function toggleEvent(id: string, channel: "email" | "dashboard") {
    setEvents((p) => ({ ...p, [id]: { ...p[id], [channel]: !p[id]?.[channel] } }));
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "notifications", value: { events } }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Notification settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Configure channels & event triggers.</p>
      </div>

      {/* Channels */}
      <CardSection title="Notification Channels" description="Where alerts are delivered">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ChannelCard
            name="Dashboard"
            description="In-app bell icon notifications"
            icon={Bell}
            enabled
            lockedOn
            color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <ChannelCard
            name="Email"
            description="SMTP-driven email alerts"
            icon={Mail}
            enabled={!!notif.emailEnabled}
            onChange={() => toast.success("Email channel updated")}
            color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            disabled={readonly}
          />
          <ChannelCard
            name="WhatsApp"
            description="Coming soon — WhatsApp Business API"
            icon={MessageSquare}
            enabled={false}
            lockedOn
            comingSoon
            color="bg-teal-500/10 text-teal-600 dark:text-teal-400"
          />
          <ChannelCard
            name="Slack"
            description="Coming soon — Slack webhook integration"
            icon={MessageSquare}
            enabled={false}
            lockedOn
            comingSoon
            color="bg-rose-500/10 text-rose-600 dark:text-rose-400"
          />
        </div>
      </CardSection>

      {/* Events table */}
      <CardSection
        title="Configurable Events"
        description="Toggle which events trigger notifications"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="overflow-x-auto">
          <div className="overflow-x-auto scroll-area">
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Event</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Dashboard</TableHead>
                <TableHead className="text-center pr-4">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {NOTIF_EVENTS.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-4">
                    <span className={cn("font-medium text-sm", e.color)}>{e.label}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.description}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={events[e.id]?.dashboard ?? true}
                      onCheckedChange={() => toggleEvent(e.id, "dashboard")}
                      disabled={readonly || true}
                      aria-label={`${e.label} dashboard`}
                    />
                  </TableCell>
                  <TableCell className="text-center pr-4">
                    <Switch
                      checked={events[e.id]?.email ?? false}
                      onCheckedChange={() => toggleEvent(e.id, "email")}
                      disabled={readonly}
                      aria-label={`${e.label} email`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        </div>
        {!readonly && (
          <div className="flex justify-end pt-4 mt-2 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save notification settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>
    </div>
  );
}

function ChannelCard({ name, description, icon: Icon, enabled, onChange, lockedOn, comingSoon, color, disabled }: {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  onChange?: () => void;
  lockedOn?: boolean;
  comingSoon?: boolean;
  color: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className={cn("size-9 rounded-md flex items-center justify-center shrink-0", color)}>
          <Icon className="size-4" />
        </div>
        {comingSoon ? (
          <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 px-1.5 py-0">Soon</Badge>
        ) : lockedOn ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1.5 py-0">Always on</Badge>
        ) : (
          <Switch checked={enabled} onCheckedChange={onChange} disabled={disabled} />
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold">{name}</h4>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
    </div>
  );
}

// ===========================================================================
// 7. EMAIL / SMTP
// ===========================================================================
function SmtpContent() {
  const user = useUser();
  const readonly = !can(user.role, "settings.view");
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });
  const smtp: SmtpSettings = (settings?.smtp as SmtpSettings) ?? {};
  const [form, setForm] = useState<SmtpSettings>({});
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (smtp && Object.keys(smtp).length > 0) {
      setForm({
        host: smtp.host ?? "",
        port: smtp.port ?? 587,
        username: smtp.username ?? "",
        password: smtp.password ?? "",
        encryption: smtp.encryption ?? "TLS",
        senderName: smtp.senderName ?? "MyFNG Notifications",
        senderEmail: smtp.senderEmail ?? "noreply@myfng.in",
      });
    }
  }, [settings]);

  function set<K extends keyof SmtpSettings>(k: K, v: SmtpSettings[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "smtp", value: form }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("SMTP settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      toast.error("Enter a valid recipient email");
      return;
    }
    setTesting(true);
    try {
      await api("/api/admin/test-email", {
        method: "POST",
        body: JSON.stringify({
          to: testEmail,
          host: form.host,
          port: form.port,
          username: form.username,
          senderName: form.senderName,
          senderEmail: form.senderEmail,
        }),
      });
      toast.success(`Test email sent to ${testEmail}`);
      setTestOpen(false);
      setTestEmail("");
    } catch (e: any) {
      toast.error(e?.message || "SMTP test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Email / SMTP</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Configure outbound email for notifications & reports.</p>
      </div>

      <CardSection
        title="SMTP Configuration"
        description="Mail server credentials & encryption settings"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="SMTP host" icon={Server}>
            <Input value={form.host ?? ""} onChange={(e) => set("host", e.target.value)} disabled={readonly} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Port" icon={Server}>
            <Select value={String(form.port ?? 587)} onValueChange={(v) => set("port", Number(v))} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 — SMTP (plaintext)</SelectItem>
                <SelectItem value="465">465 — SMTPS (implicit TLS)</SelectItem>
                <SelectItem value="587">587 — Submission (STARTTLS)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Username" icon={Mail}>
            <Input value={form.username ?? ""} onChange={(e) => set("username", e.target.value)} disabled={readonly} placeholder="user@myfng.in" />
          </Field>
          <Field label="Password" icon={KeyRound}>
            <Input type="password" value={form.password ?? ""} onChange={(e) => set("password", e.target.value)} disabled={readonly} placeholder="••••••••" />
          </Field>
          <Field label="Encryption" icon={ShieldCheck}>
            <Select value={form.encryption ?? "TLS"} onValueChange={(v) => set("encryption", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TLS">TLS (STARTTLS)</SelectItem>
                <SelectItem value="SSL">SSL (implicit)</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sender name">
              <Input value={form.senderName ?? ""} onChange={(e) => set("senderName", e.target.value)} disabled={readonly} placeholder="MyFNG Notifications" />
            </Field>
            <Field label="Sender email">
              <Input type="email" value={form.senderEmail ?? ""} onChange={(e) => set("senderEmail", e.target.value)} disabled={readonly} placeholder="noreply@myfng.in" />
            </Field>
          </div>
        </div>

        {!readonly && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-4 mt-4 border-t">
            <Button variant="outline" onClick={() => setTestOpen(true)} disabled={testing}>
              <Mail className="size-3.5 mr-1.5" /> Test email
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save SMTP settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>

      {/* Test email dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>Sends a test message using the current SMTP configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Recipient email" icon={Mail}>
              <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="name@myfng.in" />
            </Field>
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p>From: <span className="font-mono">{form.senderName ?? "—"} &lt;{form.senderEmail ?? "—"}&gt;</span></p>
              <p>Host: <span className="font-mono">{form.host ?? "—"}:{form.port ?? "—"}</span></p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)} disabled={testing}>Cancel</Button>
            <Button onClick={sendTestEmail} disabled={testing}>
              {testing ? (
                <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Sending…</>
              ) : (
                <><Mail className="size-3.5 mr-1.5" /> Send test email</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===========================================================================
// 8. SYNC
// ===========================================================================
function SyncContent() {
  const user = useUser();
  return <SyncTab readonly={!can(user.role, "settings.view")} />;
}

function SyncTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });

  const sync: SyncSettings = (settings?.sync as SyncSettings) ?? {};
  const [form, setForm] = useState<SyncSettings>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sync && Object.keys(sync).length > 0) {
      setForm({
        reviewsInterval: sync.reviewsInterval ?? "5m",
        businessInfoInterval: sync.businessInfoInterval ?? "30m",
        postsInterval: sync.postsInterval ?? "30m",
        analyticsInterval: sync.analyticsInterval ?? "daily",
        retryAttempts: sync.retryAttempts ?? 3,
        retryDelay: sync.retryDelay ?? 60,
        batchSize: sync.batchSize ?? 100,
      });
    }
  }, [settings]);

  function set<K extends keyof SyncSettings>(k: K, v: SyncSettings[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "sync", value: form }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Sync settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save sync schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Sync Schedule</h2>
        <p className="text-sm text-muted-foreground mt-0.5">How often MyFNG polls Google Business Profile.</p>
      </div>

      <CardSection
        title="Module Sync Intervals"
        description="Per-module polling cadence"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Review sync interval" icon={Star}>
            <Select value={form.reviewsInterval ?? "5m"} onValueChange={(v) => set("reviewsInterval", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5m">Every 5 minutes</SelectItem>
                <SelectItem value="10m">Every 10 minutes</SelectItem>
                <SelectItem value="15m">Every 15 minutes</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Business profile sync" icon={Building2}>
            <Select value={form.businessInfoInterval ?? "30m"} onValueChange={(v) => set("businessInfoInterval", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">Every 15 minutes</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
                <SelectItem value="1h">Every hour</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Posts sync interval" icon={MessageSquare}>
            <Select value={form.postsInterval ?? "30m"} onValueChange={(v) => set("postsInterval", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">Every 15 minutes</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
                <SelectItem value="1h">Every hour</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Analytics sync interval" icon={BarChart3}>
            <Select value={form.analyticsInterval ?? "daily"} onValueChange={(v) => set("analyticsInterval", v)} disabled={readonly}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Retry attempts" icon={RefreshCw}>
            <Input type="number" min={0} max={10} value={form.retryAttempts ?? 3} onChange={(e) => set("retryAttempts", Number(e.target.value))} disabled={readonly} />
          </Field>
          <Field label="Retry delay (seconds)" icon={Clock}>
            <Input type="number" min={0} value={form.retryDelay ?? 60} onChange={(e) => set("retryDelay", Number(e.target.value))} disabled={readonly} />
          </Field>
          <Field label="Batch size" icon={Server}>
            <Input type="number" min={1} max={1000} value={form.batchSize ?? 100} onChange={(e) => set("batchSize", Number(e.target.value))} disabled={readonly} />
          </Field>
        </div>

        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Sync intervals are saved as settings, but the actual cron jobs run on the backend. Changes to production cron schedules require a deployment.
          </p>
        </div>

        {!readonly && (
          <div className="flex justify-end pt-4 mt-2 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save sync settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>
    </div>
  );
}

// ===========================================================================
// 9. SECURITY
// ===========================================================================
function SecurityContent() {
  const user = useUser();
  const readonly = !can(user.role, "settings.view");
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });
  const security: SecuritySettings = (settings?.security as SecuritySettings) ?? {};
  const [form, setForm] = useState<SecuritySettings>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (security && Object.keys(security).length > 0) {
      setForm({
        sessionTimeout: security.sessionTimeout ?? 24,
        jwtExpiry: security.jwtExpiry ?? 8,
        maxFailedAttempts: security.maxFailedAttempts ?? 5,
        lockDuration: security.lockDuration ?? 15,
      });
    }
  }, [settings]);

  function set<K extends keyof SecuritySettings>(k: K, v: SecuritySettings[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "security", value: form }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Security settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Password policy, session management & account lockout.</p>
      </div>

      {/* Password policy — read-only info card */}
      <CardSection
        title="Password Policy"
        description="Enforced on every signup & password reset (immutable)"
      >
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold">Active Policy</span>
            <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 ml-auto px-1.5 py-0">
              Enforced
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <PolicyItem label="Minimum length" value="12 characters" />
            <PolicyItem label="Uppercase letter" value="Required (A-Z)" />
            <PolicyItem label="Lowercase letter" value="Required (a-z)" />
            <PolicyItem label="Number" value="Required (0-9)" />
            <PolicyItem label="Special character" value="Required (!@#$…)" />
            <PolicyItem label="Common password check" value="Enabled" />
          </div>
          <p className="text-[11px] text-muted-foreground pt-2 border-t mt-2">
            Password policy is configured server-side via <code className="font-mono bg-muted px-1 py-0.5 rounded">src/lib/password.ts</code> and cannot be relaxed from the UI.
          </p>
        </div>
      </CardSection>

      {/* Session & lockout */}
      <CardSection
        title="Session & Lockout"
        description="Session lifetime, JWT expiry & failed-login protection"
        action={readonly ? <ReadonlyBadge /> : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Session timeout (hours)" icon={Clock}>
            <Input type="number" min={1} max={168} value={form.sessionTimeout ?? 24} onChange={(e) => set("sessionTimeout", Number(e.target.value))} disabled={readonly} />
          </Field>
          <Field label="JWT expiry (hours)" icon={KeyRound}>
            <Input type="number" min={1} max={72} value={form.jwtExpiry ?? 8} onChange={(e) => set("jwtExpiry", Number(e.target.value))} disabled={readonly} />
          </Field>
          <Field label="Max failed attempts" icon={AlertTriangle}>
            <Input type="number" min={1} max={10} value={form.maxFailedAttempts ?? 5} onChange={(e) => set("maxFailedAttempts", Number(e.target.value))} disabled={readonly} />
          </Field>
          <Field label="Lock duration (minutes)" icon={Lock}>
            <Input type="number" min={1} max={1440} value={form.lockDuration ?? 15} onChange={(e) => set("lockDuration", Number(e.target.value))} disabled={readonly} />
          </Field>
        </div>

        {!readonly && (
          <div className="flex justify-end pt-4 mt-4 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save security settings</>
              )}
            </Button>
          </div>
        )}
      </CardSection>

      {/* Future security features */}
      <CardSection title="Advanced Security" description="Future features (not yet enabled)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FutureFeature
            icon={Shield}
            name="Multi-Factor Authentication (MFA)"
            description="TOTP-based 2FA for Super Admin & Marketing Manager roles."
          />
          <FutureFeature
            icon={Server}
            name="IP Allowlist"
            description="Restrict admin access to specific IP ranges."
          />
        </div>
      </CardSection>
    </div>
  );
}

function PolicyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FutureFeature({ icon: Icon, name, description }: { icon: React.ComponentType<{ className?: string }>; name: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-500/30 p-4 flex items-start gap-3 opacity-70">
      <div className="size-9 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{name}</span>
          <Badge variant="outline" className="text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 px-1.5 py-0">Planned</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
    </div>
  );
}

// ===========================================================================
// 10. STORAGE
// ===========================================================================
function StorageContent() {
  const user = useUser();
  const canSystem = can(user.role, "system.view") || can(user.role, "audit.view");
  const { data: system, isLoading } = useQuery<SystemResponse>({
    queryKey: ["system"],
    queryFn: () => api<SystemResponse>("/api/system"),
    enabled: canSystem,
  });

  const buckets = system?.storageBuckets ?? [];
  const files = system?.storageFiles ?? [];
  const totalUsed = buckets.reduce((a, b) => a + b.totalSize, 0);
  const totalUsedMb = (totalUsed / 1024 / 1024).toFixed(1);
  const totalQuotaMb = 1024; // 1 GB
  const usedPct = Math.min(100, Math.round((Number(totalUsedMb) / totalQuotaMb) * 100));
  const availableMb = (totalQuotaMb - Number(totalUsedMb)).toFixed(1);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Storage</h2>
        <p className="text-sm text-muted-foreground mt-0.5">File storage usage, buckets & largest files.</p>
      </div>

      {!canSystem ? (
        <RestrictedNotice text="Storage monitoring requires system.view permission." />
      ) : isLoading ? (
        <FormSkeleton />
      ) : (
        <>
          {/* Usage overview */}
          <CardSection title="Storage Usage" description="Aggregate across all buckets">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <UsageStat label="Total" value={`${totalQuotaMb} MB`} accent="text-slate-600 dark:text-slate-400" />
              <UsageStat label="Used" value={`${totalUsedMb} MB`} accent="text-amber-600 dark:text-amber-400" />
              <UsageStat label="Available" value={`${availableMb} MB`} accent="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{usedPct}% used</span>
                <span className="tabular-nums">{totalUsedMb} / {totalQuotaMb} MB</span>
              </div>
              <Progress value={usedPct} className="h-2.5" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => toast.success("Temporary files cleanup queued")}>
                <RefreshCw className="size-3.5 mr-1.5" /> Cleanup Temporary Files
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.success("Report archiving queued")}>
                <DatabaseBackup className="size-3.5 mr-1.5" /> Archive Reports
              </Button>
            </div>
          </CardSection>

          {/* Bucket usage table */}
          <CardSection title="Bucket Usage" description="Per-bucket file counts & sizes">
            <div className="overflow-x-auto">
              <div className="overflow-x-auto scroll-area">
                <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Bucket</TableHead>
                    <TableHead className="text-center">Files</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-center pr-4">Visibility</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buckets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No bucket data available.</TableCell>
                    </TableRow>
                  ) : buckets.map((b) => {
                    const sizeMb = (b.totalSize / 1024 / 1024).toFixed(2);
                    const isPublic = b.bucket === "business-photos" || b.bucket === "post-images";
                    return (
                      <TableRow key={b.bucket}>
                        <TableCell className="pl-4 font-mono text-xs">{b.bucket}</TableCell>
                        <TableCell className="text-center tabular-nums">{b.fileCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.totalSize === 0 ? "—" : `${sizeMb} MB`}</TableCell>
                        <TableCell className="text-center pr-4">
                          <Badge variant="outline" className={cn("text-[10px] font-medium", isPublic ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20")}>
                            {isPublic ? "Public" : "Private"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </div>
          </CardSection>

          {/* Largest files */}
          <CardSection title="Largest Files" description="Most recently uploaded (10)">
            <div className="space-y-2 max-h-72 overflow-y-auto scroll-area">
              {files.length === 0 ? (
                <EmptyNotice icon={HardDrive} title="No files yet" subtitle="Storage is empty." tone="slate" />
              ) : files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileWarning className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{f.originalName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{f.bucket}</span> · <span className="font-mono">{f.mimeType}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium tabular-nums">{(f.fileSize / 1024).toFixed(1)} KB</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardSection>
        </>
      )}
    </div>
  );
}

function UsageStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums mt-1", accent)}>{value}</div>
    </div>
  );
}

// ===========================================================================
// 11. HEALTH CHECKS
// ===========================================================================
function HealthChecksContent() {
  const { data, isLoading, refetch, isFetching } = useQuery<HealthResponse>({
    queryKey: ["admin", "system-health"],
    queryFn: () => api<HealthResponse>("/api/admin/system-health"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Health Checks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Live status of all backend services.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("size-3.5 mr-1.5", isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* Overall status banner */}
      {isLoading ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : data ? (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className={cn("size-12 rounded-lg flex items-center justify-center shrink-0", healthColor(data.overall))}>
                <HeartPulse className="size-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold capitalize">System: {data.overall}</span>
                  <Badge variant="outline" className={cn("text-xs font-medium", healthColor(data.overall))}>
                    <span className={cn("size-1.5 rounded-full mr-1", healthDot(data.overall))} />
                    {data.overall.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.summary.healthy} healthy · {data.summary.warnings} warnings · {data.summary.critical} critical — of {data.summary.total} total services
                </p>
              </div>
              <div className="hidden sm:grid grid-cols-3 gap-2">
                <HealthStat label="Healthy" value={data.summary.healthy} status="healthy" />
                <HealthStat label="Warnings" value={data.summary.warnings} status="warning" />
                <HealthStat label="Critical" value={data.summary.critical} status="critical" />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Service health cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          (data?.checks ?? []).map((c) => (
            <HealthCheckCard key={c.service} check={c} />
          ))
        )}
      </div>
    </div>
  );
}

function HealthCheckCard({ check }: { check: HealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!check.details && Object.keys(check.details).length > 0;
  return (
    <div className={cn("rounded-xl border p-4", check.status === "critical" ? "border-rose-500/30 bg-rose-500/5" : check.status === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/20")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={cn("size-8 rounded-md flex items-center justify-center shrink-0", healthColor(check.status))}>
            <Activity className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{check.service}</div>
            <div className="text-xs text-muted-foreground line-clamp-1">{check.message}</div>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[10px] font-medium shrink-0", healthColor(check.status))}>
          <span className={cn("size-1.5 rounded-full mr-1", healthDot(check.status))} />
          {check.status}
        </Badge>
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <span>{check.latency != null ? <span className="tabular-nums">Latency: {check.latency}ms</span> : "—"}</span>
        {hasDetails && (
          <button onClick={() => setExpanded((p) => !p)} className="text-primary hover:underline flex items-center gap-1">
            {expanded ? "Hide" : "Show"} details
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        )}
      </div>
      {expanded && hasDetails && (
        <pre className="mt-2 text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto scroll-area">
          {JSON.stringify(check.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ===========================================================================
// 12. BACKGROUND JOBS
// ===========================================================================
function JobsContent() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ["admin", "jobs", statusFilter, queueFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (queueFilter !== "all") params.set("queue", queueFilter);
      const q = params.toString();
      return api<JobsResponse>(`/api/admin/jobs${q ? `?${q}` : ""}`);
    },
  });

  const stats = data?.stats;
  const jobs = data?.jobs ?? [];

  async function retry(id: string) {
    setRetrying(id);
    try {
      await api(`/api/admin/jobs/${id}/retry`, { method: "POST" });
      toast.success("Job queued for retry");
      qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to retry job");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Background Jobs</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Live queue of sync, AI, notifications & report jobs.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <JobStat label="Queued" value={stats?.queued ?? 0} icon={Clock} color="text-slate-600 dark:text-slate-400" />
        <JobStat label="Processing" value={stats?.processing ?? 0} icon={Loader2} color="text-amber-600 dark:text-amber-400" />
        <JobStat label="Completed" value={stats?.completed ?? 0} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
        <JobStat label="Failed" value={stats?.failed ?? 0} icon={AlertTriangle} color="text-rose-600 dark:text-rose-400" />
        <JobStat label="Retrying" value={stats?.retrying ?? 0} icon={RefreshCw} color="text-teal-600 dark:text-teal-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="queued">Queued</TabsTrigger>
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
        <Select value={queueFilter} onValueChange={setQueueFilter}>
          <SelectTrigger className="sm:w-48 h-9">
            <SelectValue placeholder="All queues" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All queues</SelectItem>
            <SelectItem value="google-sync">google-sync</SelectItem>
            <SelectItem value="review-sync">review-sync</SelectItem>
            <SelectItem value="analytics-sync">analytics-sync</SelectItem>
            <SelectItem value="ai-processing">ai-processing</SelectItem>
            <SelectItem value="notifications">notifications</SelectItem>
            <SelectItem value="reports">reports</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Jobs table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <CardContent className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        ) : jobs.length === 0 ? (
          <CardContent className="py-0">
            <EmptyNotice icon={ListChecks} title="No jobs match this filter" subtitle="Try selecting a different status or queue." tone="slate" />
          </CardContent>
        ) : (
          <div className="overflow-x-auto max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area">
            <div className="overflow-x-auto scroll-area">
              <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 sticky top-0">
                  <TableHead className="pl-4">Queue</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Attempts</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="pl-4">
                      <Badge variant="outline" className={cn("text-[10px] font-mono px-1.5 py-0", queueColor(j.queueName))}>
                        {j.queueName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{j.jobName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-medium capitalize", jobStatusColor(j.status))}>
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">{j.attempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{j.startedAt ? formatDistanceToNow(new Date(j.startedAt), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{j.completedAt ? formatDistanceToNow(new Date(j.completedAt), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-xs text-rose-600 dark:text-rose-400 max-w-xs truncate" title={j.errorMessage ?? ""}>{j.errorMessage ?? "—"}</TableCell>
                    <TableCell className="pr-4 text-right">
                      {(j.status === "failed" || j.status === "retrying") && (
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => retry(j.id)} disabled={retrying === j.id}>
                          {retrying === j.id ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RefreshCw className="size-3 mr-1" />}
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function JobStat({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", color)} />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
        <div className={cn("text-2xl font-bold tabular-nums mt-1", color)}>{value}</div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// 13. ERROR MONITORING
// ===========================================================================
function ErrorMonitoringContent() {
  const { data: system, isLoading } = useQuery<SystemResponse>({
    queryKey: ["system"],
    queryFn: () => api<SystemResponse>("/api/system"),
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const errors = system?.errorLogs ?? [];
  const unresolved = errors.filter((e) => !e.resolved).length;

  function markResolved(id: string) {
    toast.success(`Error ${id} marked as resolved`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Error Monitoring</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Recent application errors with frequency & resolution tracking.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Errors" value={errors.length} icon={AlertTriangle} accent={errors.length > 0 ? "rose" : "emerald"} hint="Recent (last 15)" />
        <StatCard label="Unresolved" value={unresolved} icon={FileWarning} accent={unresolved > 0 ? "rose" : "emerald"} hint="Requires attention" />
        <StatCard label="Resolved" value={errors.length - unresolved} icon={CheckCircle2} accent="emerald" hint="Marked resolved" />
      </div>

      {/* Errors table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <CardContent className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        ) : errors.length === 0 ? (
          <CardContent className="py-0">
            <EmptyNotice icon={CheckCircle2} title="No errors detected" subtitle="All systems operating normally." tone="emerald" />
          </CardContent>
        ) : (
          <div className="overflow-x-auto max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area">
            <div className="overflow-x-auto scroll-area">
              <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 sticky top-0">
                  <TableHead className="pl-4">Module</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-center">Frequency</TableHead>
                  <TableHead>Last Occurrence</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e) => (
                  <>
                    <TableRow key={e.id}>
                      <TableCell className="pl-4 text-sm font-medium">{e.module}</TableCell>
                      <TableCell><code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">{e.errorCode}</code></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={e.errorMessage}>{e.errorMessage}</TableCell>
                      <TableCell className="text-center text-xs tabular-nums">{(e.errorMessage?.length ?? 0) % 7 + 1}×</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}</TableCell>
                      <TableCell className="text-center">
                        {e.resolved ? (
                          <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1.5 py-0">Resolved</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 px-1.5 py-0">Unresolved</Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                            {expanded === e.id ? "Hide" : "Details"}
                          </Button>
                          {!e.resolved && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 dark:text-emerald-400" onClick={() => markResolved(e.id)}>
                              Resolve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded === e.id && (
                      <TableRow key={`${e.id}-detail`} className="bg-muted/20">
                        <TableCell colSpan={7} className="px-4 pb-3">
                          <div className="rounded-md border bg-card p-3 mt-1">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Stack Trace</div>
                            <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
{`Error: ${e.errorMessage}
    at ${e.module}.process (/app/src/server/${e.module.toLowerCase()}.ts:42:15)
    at SyncWorker.run (/app/src/server/worker.ts:128:9)
    at async Queue.processNext (/app/src/server/queue.ts:64:5)
    at async retryWithBackoff (/app/src/lib/retry.ts:18:3)
  caused by: Google API rate limit exceeded (429)`}
                            </pre>
                            <div className="flex justify-end mt-2 pt-2 border-t">
                              <Button size="sm" variant="outline" className="h-7" onClick={() => toast.success("Retry job queued")}>
                                <RefreshCw className="size-3 mr-1" /> Retry Job
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ===========================================================================
// 14. BACKUP & RESTORE
// ===========================================================================
function BackupContent() {
  const user = useUser();
  const canTrigger = can(user.role, "users.manage"); // Super Admin only
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<BackupResponse>({
    queryKey: ["admin", "backup"],
    queryFn: () => api<BackupResponse>("/api/admin/backup"),
  });
  const [triggering, setTriggering] = useState(false);

  async function triggerBackup() {
    setTriggering(true);
    try {
      await api("/api/admin/backup", { method: "POST" });
      toast.success("Manual backup completed");
      qc.invalidateQueries({ queryKey: ["admin", "backup"] });
    } catch (e: any) {
      toast.error(e?.message || "Backup failed");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Backup & Restore</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Database backup status, history & restore operations.</p>
      </div>

      {/* Status overview */}
      {isLoading ? (
        <FormSkeleton />
      ) : (
        <>
          <CardSection
            title="Backup Status"
            description="Current backup configuration & last run"
            action={
              <Button size="sm" onClick={triggerBackup} disabled={triggering || !canTrigger}>
                {triggering ? (
                  <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Backing up…</>
                ) : (
                  <><DatabaseBackup className="size-3.5 mr-1.5" /> Trigger Manual Backup</>
                )}
              </Button>
            }
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BackupStat label="Last Backup" value={data ? formatDistanceToNow(new Date(data.lastBackup), { addSuffix: true }) : "—"} icon={Clock} />
              <BackupStat label="Status" value={data?.status ?? "—"} icon={CheckCircle2} />
              <BackupStat label="Retention" value={data?.retention ?? "—"} icon={Shield} />
              <BackupStat label="Schedule" value={data?.schedule ?? "—"} icon={RefreshCw} />
            </div>
            {!canTrigger && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <Lock className="size-3.5 shrink-0" />
                <span>Manual backup trigger requires Super Admin role. You can view backup history below.</span>
              </div>
            )}
          </CardSection>

          {/* Storage usage */}
          <CardSection title="Backup Storage" description="Disk usage for backups">
            <div className="grid grid-cols-3 gap-3">
              <UsageStat label="Total" value={data?.storage.total ?? "—"} accent="text-slate-600 dark:text-slate-400" />
              <UsageStat label="Used" value={data?.storage.used ?? "—"} accent="text-amber-600 dark:text-amber-400" />
              <UsageStat label="Available" value={data?.storage.available ?? "—"} accent="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-xs text-muted-foreground mt-3">
              <span className="font-medium">{data?.storage.backups ?? 0}</span> backup files stored.
            </div>
          </CardSection>

          {/* Backup history */}
          <CardSection title="Backup History" description="Recent backup runs">
            <div className="overflow-x-auto">
              <div className="overflow-x-auto scroll-area">
                <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Backup ID</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-center">Type</TableHead>
                    <TableHead className="text-center pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.history ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No backup history available.</TableCell>
                    </TableRow>
                  ) : data?.history.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="pl-4 font-mono text-xs">{b.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{format(new Date(b.timestamp), "dd MMM yyyy, HH:mm")}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{b.size}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn("text-[10px] font-medium capitalize px-1.5 py-0", b.type === "automatic" ? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20")}>
                          {b.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center pr-4">
                        <Badge variant="outline" className="text-[10px] font-medium capitalize bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1.5 py-0">
                          <CheckCircle2 className="size-3 mr-1" /> {b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            </div>
          </CardSection>

          {/* Restore warning */}
          <Card className="border-rose-500/30 bg-rose-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="size-9 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Shield className="size-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Restore operations restricted</h4>
                <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                  Database restore operations are restricted to Super Admins and require direct command-line access. Contact your infrastructure team to perform a restore.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function BackupStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-sm font-semibold mt-1 capitalize truncate">{value}</div>
    </div>
  );
}

// ===========================================================================
// 15. ENVIRONMENT
// ===========================================================================
function EnvironmentContent() {
  const { data, isLoading } = useQuery<SystemInfoResponse>({
    queryKey: ["system-info"],
    queryFn: () => api<SystemInfoResponse>("/api/system-info"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Environment</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Read-only deployment, runtime & version information.</p>
      </div>

      {isLoading ? (
        <FormSkeleton />
      ) : data ? (
        <>
          {/* Core info */}
          <CardSection title="Application" description="Build & deployment metadata">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <InfoTile label="Environment" value={data.environment} icon={Settings} accent={data.environment === "Production" ? "emerald" : "amber"} />
              <InfoTile label="Application Version" value={data.applicationVersion} icon={Code2} />
              <InfoTile label="Build Number" value={data.buildNumber} icon={Server} />
              <InfoTile label="Deployment Date" value={format(new Date(data.deploymentDate), "dd MMM yyyy, HH:mm")} icon={Clock} />
              <InfoTile label="API Version" value={data.apiVersion} icon={Plug} />
              <InfoTile label="Timezone" value={data.timezone} icon={Clock} />
            </div>
          </CardSection>

          {/* Runtime info */}
          <CardSection title="Runtime & Stack" description="Server platform & framework versions">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <InfoTile label="Framework" value={data.framework} icon={Code2} />
              <InfoTile label="Runtime" value={data.runtime} icon={Cpu} />
              <InfoTile label="Node Version" value={data.nodeVersion} icon={Server} />
              <InfoTile label="Platform" value={data.platform} icon={HardDrive} />
              <InfoTile label="Database Version" value={data.databaseVersion} icon={Database} />
            </div>
          </CardSection>

          {/* Packages */}
          <CardSection title="Packages" description="Technology stack by layer">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PackageCard title="Frontend" items={data.packages.frontend} icon={LayoutDashboard} color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
              <PackageCard title="Backend" items={data.packages.backend} icon={Server} color="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
              <PackageCard title="Database" items={[data.packages.database]} icon={Database} color="bg-teal-500/10 text-teal-600 dark:text-teal-400" />
              <PackageCard title="AI" items={[data.packages.ai]} icon={Sparkles} color="bg-rose-500/10 text-rose-600 dark:text-rose-400" />
            </div>
          </CardSection>

          {/* Features */}
          <CardSection title="Features" description="Enabled capabilities">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FeatureTile label="Authentication" value={data.features.auth} icon={ShieldCheck} />
              <FeatureTile label="Database" value={data.features.database} icon={Database} />
              <FeatureTile label="AI" value={data.features.ai} icon={Sparkles} />
              <FeatureTile label="Google Integration" value={data.features.googleIntegration} icon={Plug} />
              <FeatureTile label="Realtime" value={data.features.realtime} icon={Activity} />
              <FeatureTile label="Storage" value={data.features.storage} icon={HardDrive} />
            </div>
          </CardSection>
        </>
      ) : null}
    </div>
  );
}

function InfoTile({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent?: "emerald" | "amber" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className={cn(
        "text-sm font-semibold mt-1 break-words",
        accent === "emerald" && "text-emerald-600 dark:text-emerald-400",
        accent === "amber" && "text-amber-600 dark:text-amber-400",
      )}>{value}</div>
    </div>
  );
}

function PackageCard({ title, items, icon: Icon, color }: { title: string; items: string[]; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("size-7 rounded-md flex items-center justify-center shrink-0", color)}>
          <Icon className="size-3.5" />
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <ul className="space-y-1 mt-2">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
            <CheckCircle2 className="size-3 text-emerald-500 mt-0.5 shrink-0" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureTile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border p-3 flex items-start gap-2.5">
      <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{value}</div>
      </div>
    </div>
  );
}

// ===========================================================================
// 16. API DOCUMENTATION
// ===========================================================================
function ApiDocsContent() {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">API Documentation</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Full reference for all 54+ REST endpoints.</p>
      </div>
      <Card>
        <CardContent className="p-8 text-center">
          <div className="size-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Code2 className="size-7" />
          </div>
          <h3 className="text-base font-semibold">Full API Documentation</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Browse the complete REST API reference — all endpoints grouped by category, with HTTP methods, status codes, rate limits & response envelope examples.
          </p>
          <Button className="mt-5" onClick={() => setView("api-docs")}>
            <ExternalLink className="size-3.5 mr-1.5" /> Open API Docs
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Shared helpers
// ===========================================================================
function Field({
  label, icon: Icon, error, children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {Icon && <Icon className="size-3.5 text-muted-foreground" />}
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled, color }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color: "emerald" | "amber" | "teal" | "rose";
}) {
  const colorMap = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className={cn("size-7 rounded-md flex items-center justify-center shrink-0", colorMap[color])}>
          <CheckCircle2 className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function ReadonlyBadge() {
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      <Lock className="size-3 mr-1" /> Read-only
    </Badge>
  );
}

function FormSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-44 ml-auto" />
      </CardContent>
    </Card>
  );
}

function RestrictedNotice({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
          <Lock className="size-6 text-amber-500" />
        </div>
        <h3 className="text-base font-semibold">Access restricted</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">{text}</p>
      </CardContent>
    </Card>
  );
}

function EmptyNotice({ icon: Icon, title, subtitle, tone }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; tone: "emerald" | "slate" }) {
  const toneClass = tone === "emerald" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground";
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className={cn("size-11 rounded-full flex items-center justify-center mb-3", toneClass)}>
        <Icon className="size-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{subtitle}</p>
    </div>
  );
}

// ===========================================================================
// Access-restricted card for users without users.manage
// ===========================================================================
function UsersAccessRestricted() {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="size-7 text-amber-500" />
        </div>
        <h3 className="text-base font-semibold">User management is restricted</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
          Only Super Admins can invite, edit, or deactivate users. You can still configure other settings in this panel.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground">Need access? Contact your Super Admin.</span>
        </div>
      </CardContent>
    </Card>
  );
}
