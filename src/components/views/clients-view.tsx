"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Users, Shield, Download, Plus, MoreVertical, CheckCircle2, XCircle,
  FileText, Lock, Building2, Mail, Phone, MapPin, ExternalLink,
  Loader2, Search, RefreshCw, KeyRound, ShieldCheck, Eye, Database,
  AlertTriangle, Trash2, Activity, Inbox,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ────────────────────────────────────────────────────────────────────────────
// Types matching the /api/clients* backend contract (Task P1-D-BACKEND)
// ────────────────────────────────────────────────────────────────────────────

type ClientStatus = "active" | "paused" | "terminated";
type AuthorizationStatus = "active" | "revoked" | "expired";

interface ClientAuthorization {
  id: string;
  clientId?: string;
  authorizedScopes?: string | null; // JSON-encoded string array (detail endpoint)
  scopes?: string[] | null; // array (list endpoint)
  status: AuthorizationStatus;
  grantedAt: string;
  revokedAt?: string | null;
  expiresAt?: string | null;
  authorizationDoc?: string | null;
  notes?: string | null;
  grantedByUserId?: string | null;
  valid?: boolean; // list endpoint includes this
}

interface ClientListItem {
  id: string;
  clientCode: string | null;
  name: string;
  legalName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: ClientStatus;
  notes: string | null;
  createdAt: string;
  // optional aggregated fields (filled by backend when available)
  locationsCount?: number;
  authorizationsCount?: number;
  locationCount?: number; // backend sends singular form
  authorizationCount?: number; // backend sends singular form
  activeAuthorization?: ClientAuthorization | null;
  authorization?: ClientAuthorization | null; // backend sends this name for active auth
  _count?: { locations?: number; authorizations?: number };
}

interface ClientLocationSummary {
  id: string;
  name: string;
  city: string;
  region: string;
  status: string;
  syncStatus: string;
  avgRating: number;
  reviewCount: number;
}

interface ClientDetailResponse {
  client: ClientListItem;
  locations: ClientLocationSummary[];
  authorizations: ClientAuthorization[];
}

// ────────────────────────────────────────────────────────────────────────────
// Static metadata
// ────────────────────────────────────────────────────────────────────────────

const SCOPES: { value: string; label: string; description: string }[] = [
  { value: "review.reply", label: "Reply to reviews", description: "Post replies to Google reviews on the client's behalf" },
  { value: "post.create", label: "Create Google Posts", description: "Publish new local posts to Business Profile" },
  { value: "post.update", label: "Edit Google Posts", description: "Modify already-published local posts" },
  { value: "post.delete", label: "Delete Google Posts", description: "Remove local posts from Business Profile" },
  { value: "profile.update", label: "Update business info", description: "Edit name, address, phone, hours, categories" },
  { value: "analytics.sync", label: "Sync analytics", description: "Pull impressions, clicks, calls and direction requests" },
  { value: "media.upload", label: "Upload photos", description: "Add new photos to the Business Profile" },
  { value: "media.delete", label: "Delete photos", description: "Remove existing photos from the Business Profile" },
];

// Default pre-checked scopes for the Grant dialog — the safe, everyday operations.
const DEFAULT_SCOPES = ["review.reply", "post.create", "analytics.sync"];

// What we access on Google Business Profile, for the transparency card.
const DATA_ACCESSED = [
  "Business Profile info — name, address, phone, hours, categories",
  "Customer reviews and existing replies",
  "Local posts (offers, events, updates)",
  "Performance analytics — search impressions, Maps views, clicks, calls, direction requests",
  "Business photos and media",
];

const HOW_WE_USE_IT = [
  "Keep business info in sync across locations",
  "Reply to reviews (manual or AI-assisted)",
  "Publish and schedule Google Posts",
  "Aggregate performance analytics into reports",
];

const SECURITY_PRACTICES = [
  "OAuth tokens encrypted at rest (AES-256-GCM)",
  "HTTPS/TLS 1.2+ for all data in transit",
  "Role-based access control (5 roles, 22 permissions)",
  "Full audit logging of every GBP write operation",
  "Per-client authorization gate before any write",
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Resolves scopes from either the JSON-string form (detail endpoint) or the
// array form (list endpoint).
function getScopes(auth: ClientAuthorization | null | undefined): string[] {
  if (!auth) return [];
  if (Array.isArray(auth.scopes)) return auth.scopes;
  return parseScopes(auth.authorizedScopes);
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function fullTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

function clientStatusBadge(s: ClientStatus) {
  const map = {
    active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    paused: { label: "Paused", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    terminated: { label: "Terminated", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  }[s];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

function authStatusBadge(s: AuthorizationStatus) {
  const map = {
    active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    revoked: { label: "Revoked", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
    expired: { label: "Expired", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  }[s];
  return <Badge variant="outline" className={cn("font-medium", map.cls)}>{map.label}</Badge>;
}

function scopeLabel(value: string): string {
  return SCOPES.find((s) => s.value === value)?.label ?? value;
}

function locationsCount(c: ClientListItem): number {
  return c.locationsCount ?? c.locationCount ?? c._count?.locations ?? 0;
}

function authorizationsCount(c: ClientListItem): number {
  return c.authorizationsCount ?? c.authorizationCount ?? c._count?.authorizations ?? 0;
}

function activeAuthFn(c: ClientListItem): ClientAuthorization | null {
  return c.activeAuthorization ?? c.authorization ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Small sub-components
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
          <Skeleton className="size-12 rounded-lg" />
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
  tone?: "emerald" | "rose" | "slate" | "amber";
  action?: React.ReactNode;
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
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

// ────────────────────────────────────────────────────────────────────────────
// Transparency Disclosure Card
// ────────────────────────────────────────────────────────────────────────────

function TransparencyCard() {
  return (
    <Card className="border-emerald-500/25 bg-emerald-500/[0.03]">
      <CardContent className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="size-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                Transparency Disclosure — Google Third-Party Policy
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                MyFNG manages Google Business Profiles on behalf of end-clients. Per Google&rsquo;s
                Third-Party Policy, every client must explicitly authorize the actions we take on
                their behalf and may request a full data export at any time.
              </p>
            </div>
          </div>
          <div className="shrink-0 lg:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              onClick={() => toast.info("Security disclosure is available in Settings → Branding & Compliance.")}
            >
              <FileText className="size-4 mr-1.5" /> Security disclosure
            </Button>
          </div>
        </div>

        <Separator className="my-4 bg-emerald-500/15" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DisclosureColumn
            icon={Database}
            tone="emerald"
            title="What data we access"
            items={DATA_ACCESSED}
          />
          <DisclosureColumn
            icon={Activity}
            tone="teal"
            title="How we use it"
            items={HOW_WE_USE_IT}
          />
          <DisclosureColumn
            icon={Lock}
            tone="amber"
            title="Security practices"
            items={SECURITY_PRACTICES}
          />
          <DisclosureColumn
            icon={Download}
            tone="slate"
            title="Data export rights"
            items={[
              "Clients may request a full data export at any time",
              "Exports are delivered as a ZIP archive",
              "Includes profile info, reviews, posts, analytics, photos metadata",
              "Available per-client from the table below",
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DisclosureColumn({
  icon: Icon, title, items, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
  tone: "emerald" | "teal" | "amber" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("size-7 rounded-md flex items-center justify-center", tones[tone])}>
          <Icon className="size-3.5" />
        </div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <CheckCircle2 className={cn("size-3 mt-0.5 shrink-0", tones[tone])} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Add Client Dialog
// ────────────────────────────────────────────────────────────────────────────

interface AddClientForm {
  name: string;
  legalName: string;
  clientCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

function AddClientDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddClientForm>({
    name: "", legalName: "", clientCode: "", contactName: "",
    contactEmail: "", contactPhone: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm({
      name: "", legalName: "", clientCode: "", contactName: "",
      contactEmail: "", contactPhone: "", notes: "",
    });
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Client display name is required.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          legalName: form.legalName.trim() || null,
          clientCode: form.clientCode.trim() || null,
          contactName: form.contactName.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      toast.success("Client created.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle>Add end-client</DialogTitle>
          <DialogDescription>
            Create a record for a new end-client. The client will appear in the
            authorization tracking list and can be linked to locations.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="client-name">Display name <span className="text-rose-500">*</span></Label>
            <Input
              id="client-name"
              placeholder="e.g. Acme Franchisee Group"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-legal">Legal entity name</Label>
            <Input
              id="client-legal"
              placeholder="Acme Franchising LLC"
              value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-code">Client code</Label>
            <Input
              id="client-code"
              placeholder="ACME-001"
              value={form.clientCode}
              onChange={(e) => setForm((f) => ({ ...f, clientCode: e.target.value }))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-contact-name">Contact name</Label>
            <Input
              id="client-contact-name"
              placeholder="Jane Doe"
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-contact-email">Contact email</Label>
            <Input
              id="client-contact-email"
              type="email"
              placeholder="jane@acme.com"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="client-contact-phone">Contact phone</Label>
            <Input
              id="client-contact-phone"
              placeholder="+1 555 010 0000"
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              rows={3}
              placeholder="Scope of engagement, contract reference, special instructions…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
            Create client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Grant Authorization Dialog
// ────────────────────────────────────────────────────────────────────────────

function GrantAuthorizationDialog({
  clientId, clientName, open, onOpenChange, onDone,
}: {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [authorizationDoc, setAuthorizationDoc] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function toggleScope(value: string) {
    setScopes((s) => s.includes(value) ? s.filter((x) => x !== value) : [...s, value]);
  }

  function reset() {
    setScopes(DEFAULT_SCOPES);
    setExpiresAt("");
    setAuthorizationDoc("");
    setNotes("");
  }

  async function handleSubmit() {
    if (scopes.length === 0) {
      toast.error("Select at least one authorized scope.");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/clients/${clientId}/authorization`, {
        method: "POST",
        body: JSON.stringify({
          authorizedScopes: scopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          authorizationDoc: authorizationDoc.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      toast.success("Authorization granted.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      onDone();
      onOpenChange(false);
      reset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to grant authorization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-[620px] max-h-[92vh] overflow-y-auto scroll-area">
        <DialogHeader>
          <DialogTitle>Grant authorization</DialogTitle>
          <DialogDescription>
            Record explicit consent from <span className="font-medium text-foreground">{clientName}</span> to act
            on their Google Business Profile. Keep the signed authorization document URL for audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Authorized scopes
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Choose what this client has authorized MyFNG to do on their behalf.
            </p>
            <div className="rounded-lg border border-border/60 divide-y divide-border/60">
              {SCOPES.map((s) => {
                const checked = scopes.includes(s.value);
                return (
                  <label
                    key={s.value}
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/40 transition"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleScope(s.value)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">{s.value}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="auth-expires">Expiry date (optional)</Label>
              <Input
                id="auth-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Leave blank for no expiry.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-doc">Authorization document URL</Label>
              <Input
                id="auth-doc"
                placeholder="https://docs.myfng.in/auth/…"
                value={authorizationDoc}
                onChange={(e) => setAuthorizationDoc(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-notes">Notes</Label>
            <Textarea
              id="auth-notes"
              rows={2}
              placeholder="e.g. Verbal authorization confirmed on phone, signed copy to follow"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <ShieldCheck className="size-4 mr-1.5" />}
            Grant authorization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Revoke Confirmation
// ────────────────────────────────────────────────────────────────────────────

function RevokeAuthorizationDialog({
  open, onOpenChange, clientId, authorizationId, clientName, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  authorizationId: string | null;
  clientName: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState(false);

  async function handleConfirm() {
    if (!authorizationId) return;
    setRevoking(true);
    try {
      await api(`/api/clients/${clientId}/authorization`, {
        method: "PATCH",
        body: JSON.stringify({
          authorizationId,
          status: "revoked",
        }),
      });
      toast.success("Authorization revoked.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      onDone();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke authorization.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-rose-500" />
            Revoke authorization?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately block all Google Business Profile write operations for
            <span className="font-medium text-foreground"> {clientName}</span>. Reviews cannot be replied
            to, posts cannot be published, and profile updates will be rejected until a new
            authorization is granted. The revoke will be recorded in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={revoking}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {revoking ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <XCircle className="size-4 mr-1.5" />}
            Revoke now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Terminate Client (DELETE) Confirmation
// ────────────────────────────────────────────────────────────────────────────

function TerminateClientDialog({
  open, onOpenChange, client, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: ClientListItem | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [terminating, setTerminating] = useState(false);

  async function handleConfirm() {
    if (!client) return;
    setTerminating(true);
    try {
      await api(`/api/clients/${client.id}`, { method: "DELETE" });
      toast.success("Client terminated.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onDone();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to terminate client.");
    } finally {
      setTerminating(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-rose-500" />
            Terminate client?
          </AlertDialogTitle>
          <AlertDialogDescription>
            You are about to terminate <span className="font-medium text-foreground">{client?.name ?? ""}</span>.
            All linked Google Business Profile write operations will be suspended. The client
            record is retained for audit history. Please ensure a data export has been offered
            to the client before terminating — this is required by Google&rsquo;s Third-Party Policy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={terminating}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={terminating}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {terminating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Trash2 className="size-4 mr-1.5" />}
            Terminate client
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Client Detail Dialog
// ────────────────────────────────────────────────────────────────────────────

function ClientDetailDialog({
  client, open, onOpenChange,
}: {
  client: ClientListItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ClientAuthorization | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<ClientDetailResponse>({
    queryKey: ["client", client?.id],
    queryFn: () => api<ClientDetailResponse>(`/api/clients/${client!.id}`),
    enabled: !!client && open,
  });

  function handleExport() {
    if (!client) return;
    toast.success("Preparing ZIP export…");
    window.open(`/api/clients/${client.id}/export`, "_blank");
  }

  if (!client) return null;

  const detail = data?.client ?? client;
  const locations = data?.locations ?? [];
  const authorizations = data?.authorizations ?? [];
  const activeAuth = authorizations.find((a) => a.status === "active");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Building2 className="size-5 text-emerald-500 shrink-0" />
                  <span className="truncate">{detail.name}</span>
                  {clientStatusBadge(detail.status)}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {detail.legalName && <span>{detail.legalName} · </span>}
                  {detail.clientCode && (
                    <span className="font-mono text-[11px]">{detail.clientCode}</span>
                  )}
                  {detail.clientCode && " · "}
                  <span>Client since {fullTime(detail.createdAt)}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Contact + actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/60 p-3 bg-card/60 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</div>
              {detail.contactName && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-3.5 text-muted-foreground" />
                  <span>{detail.contactName}</span>
                </div>
              )}
              {detail.contactEmail && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <a href={`mailto:${detail.contactEmail}`} className="text-emerald-700 dark:text-emerald-300 hover:underline">
                    {detail.contactEmail}
                  </a>
                </div>
              )}
              {detail.contactPhone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-3.5 text-muted-foreground" />
                  <span className="tabular-nums">{detail.contactPhone}</span>
                </div>
              )}
              {!detail.contactName && !detail.contactEmail && !detail.contactPhone && (
                <div className="text-xs text-muted-foreground italic">No contact info on file.</div>
              )}
            </div>

            <div className="rounded-lg border border-border/60 p-3 bg-card/60 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Authorization</div>
              {activeAuth ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="size-3.5 text-emerald-500" />
                    <span className="font-medium">Active authorization</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Granted {relativeTime(activeAuth.grantedAt)}
                    {activeAuth.expiresAt && <> · expires {relativeTime(activeAuth.expiresAt)}</>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {getScopes(activeAuth).map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className="font-mono text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                      >
                        {scopeLabel(s)}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <XCircle className="size-3.5 text-rose-500" />
                    <span className="font-medium">No active authorization</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    All GBP write operations are blocked until authorization is granted.
                  </div>
                </>
              )}
            </div>
          </div>

          {detail.notes && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                Notes
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{detail.notes}</p>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setGrantOpen(true)}>
              <KeyRound className="size-4 mr-1.5" /> Grant authorization
            </Button>
            {activeAuth && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevokeTarget(activeAuth)}
                className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
              >
                <XCircle className="size-4 mr-1.5" /> Revoke
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="size-4 mr-1.5" /> Export data (ZIP)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw className="size-4 mr-1.5" /> Refresh
            </Button>
          </div>

          <Separator />

          {/* Locations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="size-4 text-emerald-500" />
                Linked locations
                <Badge variant="secondary" className="font-mono">{locations.length}</Badge>
              </h4>
            </div>
            {isLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-xs text-rose-600 dark:text-rose-400">
                Failed to load locations.
              </div>
            ) : locations.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">
                No locations linked to this client.
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">Location</TableHead>
                      <TableHead className="h-8 text-xs">City</TableHead>
                      <TableHead className="h-8 text-xs">Status</TableHead>
                      <TableHead className="h-8 text-xs text-right">Reviews</TableHead>
                      <TableHead className="h-8 text-xs text-right">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs font-medium py-2">{l.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{l.city || "—"}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-2">{l.reviewCount}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-2">
                          {l.reviewCount > 0 ? l.avgRating.toFixed(1) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <Separator />

          {/* Authorization history */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4 text-emerald-500" />
                Authorization history
                <Badge variant="secondary" className="font-mono">{authorizations.length}</Badge>
              </h4>
            </div>
            {isLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : authorizations.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">
                No authorizations have been recorded for this client.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto scroll-area pr-1">
                {authorizations.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-lg border p-3",
                      a.status === "active"
                        ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                        : "border-border/60 bg-card/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {authStatusBadge(a.status)}
                        <span className="text-xs text-muted-foreground">
                          Granted {relativeTime(a.grantedAt)}
                        </span>
                      </div>
                      {a.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-rose-600 hover:bg-rose-500/10"
                          onClick={() => setRevokeTarget(a)}
                        >
                          <XCircle className="size-3 mr-1" /> Revoke
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {getScopes(a).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="font-mono text-[10px] bg-card border-border/60"
                        >
                          {scopeLabel(s)}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span>Granted: {fullTime(a.grantedAt)}</span>
                      {a.expiresAt && <span>Expires: {fullTime(a.expiresAt)}</span>}
                      {a.revokedAt && <span>Revoked: {fullTime(a.revokedAt)}</span>}
                    </div>
                    {a.notes && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 italic">{a.notes}</p>
                    )}
                    {a.authorizationDoc && (
                      <a
                        href={a.authorizationDoc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline mt-1.5"
                      >
                        <ExternalLink className="size-3" /> Authorization document
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <GrantAuthorizationDialog
        clientId={client.id}
        clientName={client.name}
        open={grantOpen}
        onOpenChange={setGrantOpen}
        onDone={() => refetch()}
      />

      <RevokeAuthorizationDialog
        open={!!revokeTarget}
        onOpenChange={(v) => { if (!v) setRevokeTarget(null); }}
        clientId={client.id}
        authorizationId={revokeTarget?.id ?? null}
        clientName={client.name}
        onDone={() => refetch()}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main ClientsView
// ────────────────────────────────────────────────────────────────────────────

export function ClientsView() {
  const user = useUser();
  const qc = useQueryClient();
  const canManage = can(user.role, "settings.view");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<ClientListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [terminateClient, setTerminateClient] = useState<ClientListItem | null>(null);

  const { data: clients, isLoading, isError, refetch, isFetching } = useQuery<ClientListItem[]>({
    queryKey: ["clients"],
    queryFn: () => api<ClientListItem[]>("/api/clients"),
  });

  // Pending reviews count comes from the existing dashboard summary endpoint.
  const { data: dashboard } = useQuery<{ pendingReviews?: number }>({
    queryKey: ["dashboard-summary-clients"],
    queryFn: () => api<{ pendingReviews?: number }>("/api/dashboard"),
  });

  const stats = useMemo(() => {
    const list = clients ?? [];
    const total = list.length;
    const activeAuths = list.filter((c) => activeAuthFn(c)?.status === "active").length;
    const locationsManaged = list.reduce((sum, c) => sum + locationsCount(c), 0);
    const pendingReviews = dashboard?.pendingReviews ?? 0;
    return { total, activeAuths, locationsManaged, pendingReviews };
  }, [clients, dashboard]);

  const filtered = useMemo(() => {
    const list = clients ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.legalName ?? "").toLowerCase().includes(q) ||
        (c.clientCode ?? "").toLowerCase().includes(q) ||
        (c.contactName ?? "").toLowerCase().includes(q) ||
        (c.contactEmail ?? "").toLowerCase().includes(q)
      );
    });
  }, [clients, search, statusFilter]);

  function openDetail(c: ClientListItem) {
    setDetailClient(c);
    setDetailOpen(true);
  }

  function handleExport(c: ClientListItem) {
    toast.success(`Preparing ZIP export for ${c.name}…`);
    window.open(`/api/clients/${c.id}/export`, "_blank");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="End-Clients"
        description="Authorization tracking & data export (Google Third-Party Policy compliance)"
        icon={Users}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["dashboard-summary-clients"] }); }}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="size-4 mr-1.5" /> Add client
              </Button>
            )}
          </>
        }
      />

      {/* Transparency Disclosure — always at top */}
      <TransparencyCard />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total clients"
              value={stats.total}
              icon={Users}
              accent="emerald"
              hint="Across all statuses"
            />
            <StatCard
              label="Active authorizations"
              value={stats.activeAuths}
              icon={ShieldCheck}
              accent="teal"
              hint="GBP writes allowed"
            />
            <StatCard
              label="Locations managed"
              value={stats.locationsManaged}
              icon={Building2}
              accent="amber"
              hint="Across all clients"
            />
            <StatCard
              label="Pending reviews"
              value={stats.pendingReviews}
              icon={Inbox}
              accent={stats.pendingReviews > 0 ? "rose" : "emerald"}
              hint="Rating ≤ 3, no reply"
            />
          </>
        )}
      </div>

      {/* Clients table */}
      <Card>
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 border-b border-border/60">
            <div className="relative flex-1 min-w-0">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, contact…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ClientStatus)}>
              <SelectTrigger className="h-9 w-full sm:w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table or empty/error */}
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Failed to load clients"
              description="There was an error fetching the clients list. Please retry."
              tone="rose"
              action={
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="size-4 mr-1.5" /> Retry
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={clients && clients.length > 0 ? "No matching clients" : "No clients yet"}
              description={
                clients && clients.length > 0
                  ? "Try adjusting the search or status filter."
                  : "Add your first end-client to start tracking Google Business Profile authorizations."
              }
              tone="slate"
              action={
                canManage ? (
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="size-4 mr-1.5" /> Add client
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto scroll-area">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Name</TableHead>
                    <TableHead className="min-w-[120px]">Code</TableHead>
                    <TableHead className="min-w-[180px]">Contact</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="text-right min-w-[80px]">Locations</TableHead>
                    <TableHead className="min-w-[140px]">Authorization</TableHead>
                    <TableHead className="text-right min-w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const activeAuth = activeAuthFn(c);
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => openDetail(c)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                              <Building2 className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{c.name}</div>
                              {c.legalName && (
                                <div className="text-[11px] text-muted-foreground truncate">{c.legalName}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.clientCode ? (
                            <Badge variant="outline" className="font-mono text-[10px]">{c.clientCode}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.contactName || c.contactEmail ? (
                            <div className="min-w-0">
                              {c.contactName && (
                                <div className="text-xs font-medium text-foreground truncate">{c.contactName}</div>
                              )}
                              {c.contactEmail && (
                                <div className="text-[11px] text-muted-foreground truncate">{c.contactEmail}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{clientStatusBadge(c.status)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {locationsCount(c)}
                        </TableCell>
                        <TableCell>
                          {activeAuth ? (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Active</span>
                              <span className="text-[10px] text-muted-foreground">
                                · {getScopes(activeAuth).length} scopes
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <XCircle className="size-3.5 text-rose-500 shrink-0" />
                              <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">None</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => openDetail(c)}
                            >
                              <Eye className="size-3.5 mr-1" /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => handleExport(c)}
                              title="Export data as ZIP"
                            >
                              <Download className="size-3.5" />
                              <span className="sr-only">Export ZIP</span>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                  <MoreVertical className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Actions
                                </DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openDetail(c)}>
                                  <Eye className="size-3.5 mr-2" /> View details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExport(c)}>
                                  <Download className="size-3.5 mr-2" /> Export data (ZIP)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDetailClient(c);
                                    setDetailOpen(true);
                                  }}
                                >
                                  <KeyRound className="size-3.5 mr-2" /> Manage authorization
                                </DropdownMenuItem>
                                {canManage && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setTerminateClient(c)}
                                      className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                                    >
                                      <Trash2 className="size-3.5 mr-2" /> Terminate
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Footer summary */}
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Showing <span className="font-medium text-foreground tabular-nums">{filtered.length}</span>
                {clients && filtered.length !== clients.length && (
                  <> of <span className="font-medium text-foreground tabular-nums">{clients.length}</span></>
                )} clients
              </span>
              <span className="hidden sm:inline">Click any row to view details</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => refetch()}
      />

      <ClientDetailDialog
        client={detailClient}
        open={detailOpen}
        onOpenChange={(v) => { setDetailOpen(v); if (!v) setDetailClient(null); }}
      />

      <TerminateClientDialog
        open={!!terminateClient}
        onOpenChange={(v) => { if (!v) setTerminateClient(null); }}
        client={terminateClient}
        onDone={() => refetch()}
      />
    </div>
  );
}
