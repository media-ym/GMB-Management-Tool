"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  SyncStatusBadge,
  RatingStars,
} from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plug, RefreshCw, CheckCircle2, AlertTriangle, Link2Off, ShieldCheck,
  Building2, Star, MapPin, ExternalLink, Loader2, Clock, KeyRound,
  Copy, Check, Globe, Server, Activity, CircleCheck, CircleAlert,
  CalendarClock, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

// ────────────────────────────────────────────────────────────────────────────
// Types matching /api/google-integration response
// ────────────────────────────────────────────────────────────────────────────

type OauthStatus = "connected" | "token_expired" | "disconnected" | "not_configured";
type VerificationState = "verified" | "unverified" | "pending";
type ProfileStatus = "active" | "suspended" | "disabled";
type SyncStatus = "synced" | "syncing" | "pending" | "error";
type ApiHealth = "healthy" | "degraded";

interface OauthState {
  status: OauthStatus;
  connectedEmail: string | null;
  tokenExpiry: string | null;
  scopes: string[];
  lastConnectedAt: string | null;
  redirectUri: string | null;
}
interface ConnectedAccount {
  id: string;
  email: string;
  googleUserId: string;
  status: string;
  tokenExpiry: string | null;
  scopes: string[];
  profileCount: number;
  createdAt: string;
}
interface GbpProfile {
  id: string;
  googleLocationId: string;
  profileName: string;
  primaryCategory: string;
  averageRating: number;
  totalReviews: number;
  verificationState: VerificationState;
  profileStatus: ProfileStatus;
  mapUrl: string;
  locationName: string;
  locationCity: string;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
}
interface SyncSummary {
  connectedProfiles: number;
  verifiedProfiles: number;
  activeProfiles: number;
  syncErrors: number;
  apiHealth: ApiHealth;
}
interface SyncErrorRow {
  id: string;
  module: string;
  locationName: string;
  status: "failed" | "partial" | "success" | "running";
  errorMessage: string | null;
  startedAt: string;
}
interface ApiErrorRow {
  id: string;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
}
interface GoogleIntegrationResponse {
  oauth: OauthState;
  accounts: ConnectedAccount[];
  profiles: GbpProfile[];
  summary: SyncSummary;
  recentSyncErrors: SyncErrorRow[];
  apiErrors: ApiErrorRow[];
}

// ────────────────────────────────────────────────────────────────────────────
// Static metadata
// ────────────────────────────────────────────────────────────────────────────

const REQUESTED_SCOPES: { label: string; scope: string }[] = [
  { label: "Business Profile (manage)", scope: "https://www.googleapis.com/auth/business.manage" },
  { label: "OpenID Connect", scope: "openid" },
  { label: "Email", scope: "https://www.googleapis.com/auth/userinfo.email" },
  { label: "Profile", scope: "https://www.googleapis.com/auth/userinfo.profile" },
];

const SYNC_SCHEDULE: { module: string; schedule: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { module: "Reviews",       schedule: "Every 5 minutes",  icon: Star },
  { module: "Business Info", schedule: "Every 30 minutes", icon: Building2 },
  { module: "Analytics",     schedule: "Daily",            icon: Activity },
  { module: "Photos",        schedule: "Daily",            icon: MapPin },
  { module: "Categories",    schedule: "Daily",            icon: Server },
  { module: "Services",      schedule: "Daily",            icon: Globe },
];

const REQUIRED_APIS: { name: string; description: string }[] = [
  { name: "Business Profile Business Information API", description: "Business info, categories, services & photos" },
  { name: "Business Profile Performance API",          description: "Search impressions, customer actions & queries" },
  { name: "Business Profile APIs",                     description: "Reviews, posts & location management" },
  { name: "Google OAuth",                              description: "Authentication & token refresh" },
  { name: "Google People API",                         description: "Account profile & verified email" },
];

const AUTHORIZED_ORIGINS: { origin: string; env: string }[] = [
  { origin: "http://localhost:3000", env: "Development" },
  { origin: "https://staging.myfng.in", env: "Staging" },
  { origin: "https://app.myfng.in", env: "Production" },
];

const REDIRECT_URI = "/auth/google/callback";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function fullTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

function scopeLabel(scope: string): string {
  const found = REQUESTED_SCOPES.find((s) => s.scope === scope);
  return found?.label ?? scope.replace(/^https:\/\/www\.googleapis\.com\/auth\/business\./, "").replace(/^https:\/\/www\.googleapis\.com\/auth\/userinfo\./, "userinfo.").replace(/^https:\/\/www\.googleapis\.com\/auth\//, "");
}

function tokenProgress(expiryIso: string | null): { pct: number; totalMs: number; remainingMs: number } {
  if (!expiryIso) return { pct: 0, totalMs: 0, remainingMs: 0 };
  const now = Date.now();
  const expiry = new Date(expiryIso).getTime();
  // assume access tokens are issued with a 1h lifetime
  const totalMs = 60 * 60 * 1000;
  const remainingMs = expiry - now;
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  return { pct, totalMs, remainingMs };
}

function verificationBadge(v: VerificationState) {
  const map = {
    verified:   { label: "Verified",   cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    unverified: { label: "Unverified", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    pending:    { label: "Pending",    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  }[v];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

function profileStatusBadge(s: ProfileStatus) {
  const map = {
    active:    { label: "Active",    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    suspended: { label: "Suspended", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
    disabled:  { label: "Disabled",  cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  }[s];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components (kept inside this file)
// ────────────────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
          <Skeleton className="size-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon, title, description, tone = "emerald", action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: "emerald" | "rose" | "slate";
  action?: React.ReactNode;
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  };
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className={cn("size-14 rounded-full flex items-center justify-center mb-3", tones[tone])}>
        <Icon className="size-7" />
      </div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onCopy}
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// OAuth connection hero card
// ────────────────────────────────────────────────────────────────────────────

function OauthConnectionCard({
  oauth, canSync, onConnect, onDisconnect, connecting, disconnecting,
}: {
  oauth: OauthState;
  canSync: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting: boolean;
  disconnecting: boolean;
}) {
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  // CONNECTED ──────────────────────────────────────────────────────────────
  if (oauth.status === "connected") {
    const { pct, remainingMs } = tokenProgress(oauth.tokenExpiry);
    const remainingMin = Math.max(0, Math.round(remainingMs / 60000));
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="size-12 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="size-6" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-emerald-700 dark:text-emerald-400">Connected</h3>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium">
                      <CircleCheck className="size-3 mr-1" /> Active
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Signed in as <span className="font-medium text-foreground">{oauth.connectedEmail ?? "—"}</span>
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-emerald-500/20 bg-card/60 p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Token expires</div>
                    <div className="text-sm font-semibold mt-0.5 tabular-nums">
                      {relativeTime(oauth.tokenExpiry)}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Progress
                            value={pct}
                            className="mt-2 h-1.5 bg-emerald-500/15 [&>[data-slot=progress-indicator]]:bg-emerald-500"
                          />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          ~{remainingMin} min remaining · {fullTime(oauth.tokenExpiry)}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-card/60 p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Last connected</div>
                    <div className="text-sm font-semibold mt-0.5">
                      {relativeTime(oauth.lastConnectedAt)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fullTime(oauth.lastConnectedAt)}
                    </div>
                  </div>
                </div>

                {oauth.scopes.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Authorized scopes</div>
                    <div className="flex flex-wrap gap-1.5">
                      {oauth.scopes.map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="font-mono text-[10px] bg-card/60 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        >
                          {scopeLabel(s)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {canSync && (
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  variant="outline"
                  className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={disconnecting}
                >
                  {disconnecting ? <Loader2 className="size-4 animate-spin" /> : <Link2Off className="size-4" />}
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // TOKEN_EXPIRED ──────────────────────────────────────────────────────────
  if (oauth.status === "token_expired") {
    return (
      <>
        <Card className="border-amber-500/40 bg-amber-500/[0.05]">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-amber-700 dark:text-amber-400">Token expired</h3>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium">
                      Re-authorization required
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    The access token for <span className="font-medium text-foreground">{oauth.connectedEmail ?? "your account"}</span> has expired.
                    Re-authorize to resume syncing reviews, posts & analytics.
                  </p>
                </div>
              </div>
              {canSync && (
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  onClick={() => onConnect()}
                  disabled={connecting}
                >
                  {connecting ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  Re-authorize Google
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // NOT CONFIGURED ─────────────────────────────────────────────────────────
  if (oauth.status === "not_configured") {
    return (
      <Card className="border-amber-500/30 bg-amber-500/[0.04]">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <KeyRound className="size-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-amber-700 dark:text-amber-400">Google OAuth Not Configured</h3>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                  Add <code className="font-mono bg-muted/50 px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="font-mono bg-muted/50 px-1 rounded">GOOGLE_CLIENT_SECRET</code> to your <code className="font-mono bg-muted/50 px-1 rounded">.env</code> file to enable real Google Business Profile connection.
                </p>
                <div className="mt-2 rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                  <p className="font-semibold">Setup Steps:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                    <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" className="text-primary underline">Google Cloud Console</a></li>
                    <li>Create a project and enable Google Business Profile API</li>
                    <li>Create OAuth 2.0 credentials (Web Application)</li>
                    <li>Add redirect URI: <code className="font-mono">{oauth.redirectUri}</code></li>
                    <li>Copy Client ID and Secret to your .env file</li>
                    <li>Restart the server</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // DISCONNECTED ───────────────────────────────────────────────────────────
  return (
    <>
      <Card className="border-slate-500/30 bg-slate-500/[0.04]">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Plug className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Not connected</h3>
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 font-medium">
                    No Google account linked
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Connect a Google Business Profile account to sync reviews, posts, analytics & business info across all locations.
                </p>
              </div>
            </div>
            {canSync ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                onClick={() => onConnect()}
                disabled={connecting}
              >
                {connecting ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                Connect Google Business Profile
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" disabled>
                        <Lock className="size-4" /> Connect
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Requires system.sync permission
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Link2Off className="size-5 text-rose-500" />
              Disconnect Google account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the OAuth token for <span className="font-medium text-foreground">{oauth.connectedEmail ?? "the connected account"}</span>.
              All scheduled syncs will pause until you re-authorize. Existing reviews, posts & analytics data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => onDisconnect()}
            >
              {disconnecting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main view
// ────────────────────────────────────────────────────────────────────────────

export function GoogleIntegrationView() {
  const user = useUser();
  const qc = useQueryClient();
  const canSync = can(user.role, "system.sync");

  const [activeTab, setActiveTab] = useState("profiles");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncingLocationId, setSyncingLocationId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<GoogleIntegrationResponse>({
    queryKey: ["google-integration"],
    queryFn: () => api<GoogleIntegrationResponse>("/api/google-integration"),
    refetchOnWindowFocus: false,
  });

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["google-integration"] });
    toast.success("Google Integration refreshed");
  }

  async function handleConnect() {
    if (!canSync) return;
    setConnecting(true);
    const tid = toast.loading("Redirecting to Google…");
    try {
      const res = await fetch("/api/google-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const json = await res.json();
      if (json.success && json.data?.authUrl) {
        // Redirect to real Google OAuth consent screen
        toast.success("Redirecting to Google for authentication…", { id: tid });
        window.location.href = json.data.authUrl;
      } else {
        toast.error(json.message || "Failed to connect — Google OAuth not configured", { id: tid });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect", { id: tid });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!canSync) return;
    setDisconnecting(true);
    const tid = toast.loading("Disconnecting…");
    try {
      await api("/api/google-integration", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect" }),
      });
      toast.success("Google account disconnected", { id: tid });
      qc.invalidateQueries({ queryKey: ["google-integration"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect", { id: tid });
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSync(locationId?: string) {
    if (!canSync) return;
    const tid = toast.loading(locationId ? "Syncing profile…" : "Syncing all profiles…");
    if (locationId) setSyncingLocationId(locationId);
    else setSyncingAll(true);
    try {
      const res = await api<{ synced: number }>("/api/google-integration", {
        method: "POST",
        body: JSON.stringify({ action: "sync", locationId }),
      });
      toast.success(`Synced ${res.synced} location(s) from Google`, { id: tid });
      qc.invalidateQueries({ queryKey: ["google-integration"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed", { id: tid });
    } finally {
      setSyncingLocationId(null);
      setSyncingAll(false);
    }
  }

  const oauth = data?.oauth;
  const summary = data?.summary;
  const profiles = data?.profiles ?? [];
  const syncErrors = data?.recentSyncErrors ?? [];
  const apiErrors = data?.apiErrors ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Google Integration"
        description="OAuth, sync & API status for Google Business Profile"
        icon={Plug}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* OAuth Connection hero card */}
      {isLoading || !oauth ? (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <Skeleton className="size-12 rounded-xl" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <OauthConnectionCard
          oauth={oauth}
          canSync={canSync}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          connecting={connecting}
          disconnecting={disconnecting}
        />
      )}

      {/* Sync health stat row + API health badge */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sync Health</h2>
          {summary && (
            <Badge
              variant="outline"
              className={cn(
                "font-medium",
                summary.apiHealth === "healthy"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
              )}
            >
              <CircleCheck className={cn("size-3 mr-1", summary.apiHealth === "healthy" ? "text-emerald-500" : "text-amber-500")} />
              API {summary.apiHealth === "healthy" ? "Healthy" : "Degraded"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading || !summary ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard
                label="Connected Profiles"
                value={summary.connectedProfiles}
                icon={Building2}
                accent="emerald"
                hint="GBP profiles linked"
              />
              <StatCard
                label="Verified Profiles"
                value={summary.verifiedProfiles}
                icon={ShieldCheck}
                accent="teal"
                hint="Google-verified listings"
              />
              <StatCard
                label="Active Profiles"
                value={summary.activeProfiles}
                icon={CircleCheck}
                accent="emerald"
                hint="Status: active"
              />
              <StatCard
                label="Sync Errors"
                value={summary.syncErrors}
                icon={CircleAlert}
                accent={summary.syncErrors > 0 ? "rose" : "emerald"}
                hint={summary.syncErrors > 0 ? "Recent failures" : "All clear"}
              />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full max-w-full overflow-x-auto justify-start h-auto flex-wrap">
          <TabsTrigger value="profiles"><Building2 className="size-3.5" /> Profiles</TabsTrigger>
          <TabsTrigger value="sync-logs"><RefreshCw className="size-3.5" /> Sync Logs</TabsTrigger>
          <TabsTrigger value="api-errors"><CircleAlert className="size-3.5" /> API Errors</TabsTrigger>
          <TabsTrigger value="configuration"><Server className="size-3.5" /> Configuration</TabsTrigger>
        </TabsList>

        {/* ── Profiles tab ─────────────────────────────────────────────────── */}
        <TabsContent value="profiles">
          <CardSection
            title="Google Business Profiles"
            description={`${profiles.length} profile${profiles.length === 1 ? "" : "s"} linked to this account`}
            action={
              canSync && profiles.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync()}
                  disabled={syncingAll}
                >
                  {syncingAll ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Sync all
                </Button>
              ) : undefined
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : isError ? (
              <EmptyState
                icon={CircleAlert}
                title="Couldn't load profiles"
                description="There was a problem fetching your Google Business Profiles."
                tone="rose"
                action={<Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>}
              />
            ) : profiles.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No Google Business Profiles linked"
                description="Once you connect a Google account with Business Profile access, your locations will appear here."
                tone="slate"
              />
            ) : (
              <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1 px-1">
                <div className="overflow-x-auto scroll-area">
                  <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="min-w-[200px]">Profile</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead className="text-right">Reviews</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sync</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium text-sm leading-tight">{p.profileName}</div>
                          <div className="font-mono text-[10px] text-muted-foreground mt-0.5 break-all">
                            {p.googleLocationId}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{p.locationName || "—"}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="size-3" />
                            {p.locationCity || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.primaryCategory || "—"}</TableCell>
                        <TableCell>
                          {p.totalReviews > 0 ? (
                            <RatingStars rating={p.averageRating} size={12} />
                          ) : (
                            <span className="text-xs text-muted-foreground">No ratings</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{p.totalReviews}</TableCell>
                        <TableCell>{verificationBadge(p.verificationState)}</TableCell>
                        <TableCell>{profileStatusBadge(p.profileStatus)}</TableCell>
                        <TableCell><SyncStatusBadge status={p.syncStatus} /></TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground cursor-default">
                                  {relativeTime(p.lastSyncedAt)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {fullTime(p.lastSyncedAt)}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canSync && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                disabled={syncingLocationId === p.id || syncingAll}
                                onClick={() => handleSync(p.id)}
                              >
                                {syncingLocationId === p.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="size-3.5" />
                                )}
                                <span className="ml-1 hidden sm:inline">Sync</span>
                              </Button>
                            )}
                            {p.mapUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                asChild
                              >
                                <a href={p.mapUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="size-3.5" />
                                  <span className="sr-only">View on Maps</span>
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardSection>
        </TabsContent>

        {/* ── Sync Logs tab ────────────────────────────────────────────────── */}
        <TabsContent value="sync-logs">
          <CardSection
            title="Recent Sync Errors"
            description={`${syncErrors.length} failed or partial sync${syncErrors.length === 1 ? "" : "s"} in the recent window`}
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : syncErrors.length === 0 ? (
              <EmptyState
                icon={CircleCheck}
                title="All syncs healthy"
                description="No recent sync failures across any of your Google Business Profile modules."
                tone="emerald"
              />
            ) : (
              <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1 px-1">
                <div className="overflow-x-auto scroll-area">
                  <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-[260px]">Error Message</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncErrors.map((s) => {
                      const isFailed = s.status === "failed";
                      const statusMap = {
                        failed:  { label: "Failed",  cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
                        partial: { label: "Partial", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                        running: { label: "Running", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                        success: { label: "Success", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                      }[s.status];
                      return (
                        <TableRow
                          key={s.id}
                          className={isFailed ? "border-l-2 border-l-rose-500 bg-rose-500/[0.03]" : ""}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px] bg-card"
                            >
                              {s.module}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{s.locationName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("font-medium", statusMap.cls)}>
                              {statusMap.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground line-clamp-2 cursor-default">
                                    {s.errorMessage || "No error details"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-md text-xs whitespace-pre-wrap">
                                  {s.errorMessage || "No error details"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground cursor-default">
                                    {relativeTime(s.startedAt)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  {fullTime(s.startedAt)}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardSection>
        </TabsContent>

        {/* ── API Errors tab ───────────────────────────────────────────────── */}
        <TabsContent value="api-errors">
          <CardSection
            title="Google API Errors"
            description={`${apiErrors.length} unresolved Google API error${apiErrors.length === 1 ? "" : "s"}`}
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : apiErrors.length === 0 ? (
              <EmptyState
                icon={CircleCheck}
                title="No API errors"
                description="All Google API requests in the recent window have completed successfully."
                tone="emerald"
              />
            ) : (
              <div className="max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area -mx-1 px-1">
                <div className="overflow-x-auto scroll-area">
                  <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="min-w-[160px]">Error Code</TableHead>
                      <TableHead className="min-w-[320px]">Message</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiErrors.map((e) => (
                      <TableRow key={e.id} className="border-l-2 border-l-rose-500 bg-rose-500/[0.03]">
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          >
                            {e.errorCode}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-foreground line-clamp-2 cursor-default">
                                  {e.errorMessage}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-md text-xs whitespace-pre-wrap">
                                {e.errorMessage}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground cursor-default">
                                  {relativeTime(e.createdAt)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {fullTime(e.createdAt)}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardSection>
        </TabsContent>

        {/* ── Configuration tab ────────────────────────────────────────────── */}
        <TabsContent value="configuration">
          <div className="space-y-4">
            {/* Sync schedule */}
            <CardSection
              title="Sync Schedule"
              description="How often MyFNG polls each Google Business Profile module"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SYNC_SCHEDULE.map((s) => (
                  <div
                    key={s.module}
                    className="rounded-lg border bg-card/60 p-4 flex items-start gap-3"
                  >
                    <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <s.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{s.module}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="size-3" />
                        {s.schedule}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardSection>

            {/* Required Google APIs */}
            <CardSection
              title="Required Google APIs"
              description="Google Cloud APIs that must be enabled for the project"
            >
              <div className="space-y-2">
                {REQUIRED_APIS.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card/60 p-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Server className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.description}</div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium shrink-0"
                    >
                      <CircleCheck className="size-3 mr-1" />
                      Enabled
                    </Badge>
                  </div>
                ))}
              </div>
            </CardSection>

            {/* OAuth redirect URI + authorized origins */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CardSection
                title="OAuth Redirect URI"
                description="Configure this exact URI in Google Cloud Console → APIs & Services → Credentials"
              >
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-xs text-foreground break-all">
                      {REDIRECT_URI}
                    </code>
                    <CopyButton value={REDIRECT_URI} />
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                    <KeyRound className="size-3" />
                    Full redirect path relative to your MyFNG origin
                  </div>
                </div>
              </CardSection>

              <CardSection
                title="Authorized JavaScript Origins"
                description="Allowed origins for browser-based Google API requests"
              >
                <div className="space-y-2">
                  {AUTHORIZED_ORIGINS.map((o) => (
                    <div
                      key={o.origin}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-card/60 p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-foreground break-all">{o.origin}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Globe className="size-3" />
                          {o.env}
                        </div>
                      </div>
                      <CopyButton value={o.origin} />
                    </div>
                  ))}
                </div>
              </CardSection>
            </div>

            {/* Helpful note */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CalendarClock className="size-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Token refresh policy:</span>{" "}
                    Access tokens expire after 1 hour and are auto-refreshed using the stored refresh token.
                    If the refresh token is revoked (e.g. user changes password or disconnects from Google),
                    re-authorization is required. Sync jobs for the affected account will pause until then.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GoogleIntegrationView;
