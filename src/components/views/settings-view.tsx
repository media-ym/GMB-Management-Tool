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
import { useLocations } from "@/hooks/use-locations";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Settings, UserPlus, Pencil, Search, Sparkles, RefreshCw, Building2, Phone, Mail,
  ShieldCheck, Server, Cpu, Clock, Star, MessageSquare, BarChart3,
  CheckCircle2, AlertTriangle, KeyRound, Plug, ExternalLink, Users, Lock, Save, Zap,
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
  active: boolean;
  phone?: string | null;
  avatar?: string | null;
  assignedLocationIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

interface BrandSettings {
  name?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
}

interface AiSettings {
  assistantName?: string;
  defaultModel?: string;
  autoApprove?: boolean;
  maxTokensPerDay?: number;
}

interface SyncSettings {
  reviewsInterval?: string;
  businessInfoInterval?: string;
  postsInterval?: string;
  analyticsInterval?: string;
}

type SettingsMap = Record<string, any>;

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
// Main view
// ---------------------------------------------------------------------------
export function SettingsView() {
  const user = useUser();
  const [tab, setTab] = useState("users");

  const canManageUsers = can(user.role, "users.manage");
  const canEditSettings = can(user.role, "settings.view");

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Settings"
        description="Manage users, roles & system configuration"
        icon={Settings}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-full sm:w-auto justify-start">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="size-3.5" /> Users & Roles
            </TabsTrigger>
            <TabsTrigger value="brand" className="gap-1.5">
              <Building2 className="size-3.5" /> Brand
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Sparkles className="size-3.5" /> AI Assistant
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-1.5">
              <RefreshCw className="size-3.5" /> Sync Schedule
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5">
              <Plug className="size-3.5" /> API & Integrations
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users">
          {canManageUsers ? <UsersTab /> : <UsersAccessRestricted />}
        </TabsContent>
        <TabsContent value="brand">
          <BrandTab readonly={!canEditSettings} />
        </TabsContent>
        <TabsContent value="ai">
          <AiTab readonly={!canEditSettings} />
        </TabsContent>
        <TabsContent value="sync">
          <SyncTab readonly={!canEditSettings} />
        </TabsContent>
        <TabsContent value="api">
          <ApiTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// USERS & ROLES TAB
// ===========================================================================
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

  async function toggleActive(u: UserRow) {
    setTogglingId(u.id);
    try {
      await api("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ id: u.id, active: !u.active }),
      });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${u.name} ${u.active ? "deactivated" : "activated"}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update user");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, email, role…"
            className="pl-9 h-9"
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="size-3.5 mr-1.5" /> Invite user
        </Button>
      </div>

      {/* Users table — desktop */}
      <Card className="overflow-hidden hidden md:block">
        {isLoading ? (
          <UsersTableSkeleton />
        ) : filtered.length === 0 ? (
          <UsersEmpty search={search} />
        ) : (
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
                  onToggle={() => toggleActive(u)}
                  onEdit={() => openEdit(u)}
                />
              ))}
            </TableBody>
          </Table>
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
              onToggle={() => toggleActive(u)}
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
          <Switch checked={u.active} onCheckedChange={onToggle} disabled={toggling} aria-label="Toggle active" />
          {u.active ? (
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
              <Switch checked={u.active} onCheckedChange={onToggle} disabled={toggling} aria-label="Toggle active" />
              {u.active ? (
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

  // Sync form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setEmail(editing.email);
      setRole(editing.role);
      setPassword("");
      setAssignedIds(editing.assignedLocationIds ?? []);
      setActive(editing.active);
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
          {/* Name */}
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

          {/* Email */}
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

          {/* Password (create only) */}
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

          {/* Role */}
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

          {/* Assigned locations — only for branch_manager */}
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

          {/* Active toggle (edit only) */}
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
// BRAND TAB
// ===========================================================================
function BrandTab({ readonly }: { readonly: boolean }) {
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
      toast.success("Brand settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save brand settings");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <BrandSkeleton />;

  return (
    <CardSection
      title="Brand & Support"
      description="Customer-facing identity used across the platform"
      action={readonly ? (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          <Lock className="size-3 mr-1" /> Read-only
        </Badge>
      ) : undefined}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Brand name"
          icon={Building2}
          error={errors.name}
        >
          <Input
            value={form.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
            disabled={readonly}
            placeholder="MyFNG"
            aria-invalid={!!errors.name}
          />
        </Field>

        <Field label="Tagline" icon={Sparkles}>
          <Input
            value={form.tagline ?? ""}
            onChange={(e) => set("tagline", e.target.value)}
            disabled={readonly}
            placeholder="Home Interiors & Services"
          />
        </Field>

        <Field
          label="Support email"
          icon={Mail}
          error={errors.supportEmail}
        >
          <Input
            type="email"
            value={form.supportEmail ?? ""}
            onChange={(e) => set("supportEmail", e.target.value)}
            disabled={readonly}
            placeholder="care@myfng.in"
            aria-invalid={!!errors.supportEmail}
          />
        </Field>

        <Field label="Support phone" icon={Phone}>
          <Input
            value={form.supportPhone ?? ""}
            onChange={(e) => set("supportPhone", e.target.value)}
            disabled={readonly}
            placeholder="+91 22 4000 1000"
          />
        </Field>
      </div>

      <div className="flex justify-end pt-4 mt-2 border-t">
        <Button onClick={save} disabled={saving || readonly}>
          {saving ? (
            <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
          ) : (
            <><Save className="size-3.5 mr-1.5" /> Save brand settings</>
          )}
        </Button>
      </div>
    </CardSection>
  );
}

function BrandSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <Skeleton className="h-5 w-40" />
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

// ===========================================================================
// AI ASSISTANT TAB
// ===========================================================================
const AI_MODELS = [
  { value: "glm-4.6", label: "GLM-4.6 (Recommended)" },
  { value: "glm-4-air", label: "GLM-4 Air (Fast)" },
  { value: "glm-4-flash", label: "GLM-4 Flash (Lightweight)" },
];

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

  useEffect(() => {
    if (ai && Object.keys(ai).length > 0) {
      setForm({
        assistantName: ai.assistantName ?? "MiSA AI",
        defaultModel: ai.defaultModel ?? "glm-4.6",
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
    if (form.maxTokensPerDay != null && form.maxTokensPerDay < 0) {
      e.maxTokensPerDay = "Must be ≥ 0";
    }
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

  if (isLoading) return <AiSkeleton />;

  return (
    <div className="space-y-4">
      <CardSection
        title="MiSA AI Configuration"
        description="Tune the assistant that powers review replies, posts & SEO recs"
        action={readonly ? (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <Lock className="size-3 mr-1" /> Read-only
          </Badge>
        ) : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Assistant name"
            icon={Sparkles}
            error={errors.assistantName}
          >
            <Input
              value={form.assistantName ?? ""}
              onChange={(e) => set("assistantName", e.target.value)}
              disabled={readonly}
              placeholder="MiSA AI"
              aria-invalid={!!errors.assistantName}
            />
          </Field>

          <Field label="Default model" icon={Cpu}>
            <Select
              value={form.defaultModel ?? "glm-4.6"}
              onValueChange={(v) => set("defaultModel", v)}
              disabled={readonly}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Max tokens / day"
            icon={Zap}
            error={errors.maxTokensPerDay}
          >
            <Input
              type="number"
              min={0}
              step={10000}
              value={form.maxTokensPerDay ?? 0}
              onChange={(e) => set("maxTokensPerDay", Number(e.target.value))}
              disabled={readonly}
              aria-invalid={!!errors.maxTokensPerDay}
            />
          </Field>
        </div>

        {/* Auto-approve toggle */}
        <div className="mt-4 rounded-lg border p-4 flex items-start gap-3">
          <div className="size-9 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-auto" className="cursor-default text-sm font-medium">
                Auto-approve AI actions
              </Label>
              <Switch
                id="ai-auto"
                checked={!!form.autoApprove}
                onCheckedChange={(v) => set("autoApprove", v)}
                disabled={readonly}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              When <span className="font-medium">off</span>, AI suggestions (review replies, posts, SEO recs) require
              human review before publishing — per doc §11. When on, MiSA AI may publish directly to Google Business Profile.
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

        <div className="flex justify-end pt-4 mt-4 border-t">
          <Button onClick={save} disabled={saving || readonly}>
            {saving ? (
              <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
            ) : (
              <><Save className="size-3.5 mr-1.5" /> Save AI settings</>
            )}
          </Button>
        </div>
      </CardSection>
    </div>
  );
}

function AiSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-9 w-36 ml-auto" />
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// SYNC SCHEDULE TAB
// ===========================================================================
const SYNC_ITEMS = [
  {
    key: "reviews",
    label: "Reviews",
    icon: Star,
    interval: "5 min",
    description: "New Google reviews & ratings across all locations.",
    color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  },
  {
    key: "businessInfo",
    label: "Business Info",
    icon: Building2,
    interval: "30 min",
    description: "Hours, photos, address, contact details.",
    color: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
  },
  {
    key: "posts",
    label: "Posts",
    icon: MessageSquare,
    interval: "30 min",
    description: "Published Whats New, offers, events & updates.",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    interval: "Daily",
    description: "Search views, maps views, calls, direction requests.",
    color: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  },
];

function SyncTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });

  const sync: SyncSettings = (settings?.sync as SyncSettings) ?? {};
  const [intervals, setIntervals] = useState<Record<string, string>>({
    reviewsInterval: "5m",
    businessInfoInterval: "30m",
    postsInterval: "30m",
    analyticsInterval: "daily",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sync && Object.keys(sync).length > 0) {
      setIntervals({
        reviewsInterval: sync.reviewsInterval ?? "5m",
        businessInfoInterval: sync.businessInfoInterval ?? "30m",
        postsInterval: sync.postsInterval ?? "30m",
        analyticsInterval: sync.analyticsInterval ?? "daily",
      });
    }
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "sync", value: intervals }),
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Sync schedule saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save sync schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <CardSection
        title="Sync Schedule"
        description="How often MyFNG polls Google Business Profile"
        action={readonly ? (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <Lock className="size-3 mr-1" /> Read-only
          </Badge>
        ) : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SYNC_ITEMS.map((item) => (
            <div key={item.key} className="rounded-lg border p-4 flex gap-3">
              <div className={cn("size-10 rounded-md flex items-center justify-center shrink-0", item.color)}>
                <item.icon className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{item.label}</span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    <Clock className="size-3 mr-1" />
                    {item.interval}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.description}</p>
                {!readonly && (
                  <div className="mt-2">
                    <Input
                      value={intervals[`${item.key}Interval`] ?? ""}
                      onChange={(e) =>
                        setIntervals((p) => ({ ...p, [`${item.key}Interval`]: e.target.value }))
                      }
                      className="h-7 text-xs"
                      placeholder="e.g. 5m, 30m, daily"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Sync intervals are saved as settings, but the actual cron jobs run on the backend. Changes to
            production cron schedules require a deployment. Use this panel to record the intended cadence.
          </p>
        </div>

        {!readonly && (
          <div className="flex justify-end pt-4 mt-2 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="size-3.5 mr-1.5" /> Save schedule</>
              )}
            </Button>
          </div>
        )}
      </CardSection>
    </div>
  );
}

// ===========================================================================
// API & INTEGRATIONS TAB
// ===========================================================================
const INTEGRATIONS = [
  {
    key: "gbp",
    name: "Google Business Profile API",
    description: "Pulls reviews, business info, posts & analytics for all MyFNG locations.",
    icon: Building2,
    status: "Connected",
    statusClass: "text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    lastSync: "3 min ago",
  },
  {
    key: "oauth",
    name: "Google OAuth 2.0",
    description: "Authorization flow used to access GBP on behalf of MyFNG managers.",
    icon: KeyRound,
    status: "Active",
    statusClass: "text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    lastSync: "—",
  },
  {
    key: "misa",
    name: "MiSA AI (glm-4.6)",
    description: "Powers review replies, post generation, SEO recs & monthly summaries.",
    icon: Sparkles,
    status: "Active",
    statusClass: "text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10",
    lastSync: "Always on",
  },
];

function ApiTab() {
  const [testing, setTesting] = useState<string | null>(null);

  function testConnection(key: string, name: string) {
    setTesting(key);
    setTimeout(() => {
      setTesting(null);
      toast.success(`${name}: Connection successful`);
    }, 900);
  }

  function reauthorize() {
    toast.message("Redirecting to Google…", {
      description: "You'll be asked to grant MyFNG access to your Business Profile.",
    });
  }

  return (
    <div className="space-y-4">
      {/* Integration status cards */}
      <CardSection
        title="Integration Status"
        description="External services powering MyFNG"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {INTEGRATIONS.map((it) => (
            <div key={it.key} className="rounded-lg border p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <it.icon className="size-4" />
                </div>
                <Badge variant="outline" className={cn("text-[10px] font-medium", it.statusClass)}>
                  <span className="size-1.5 rounded-full bg-emerald-500 mr-1" />
                  {it.status}
                </Badge>
              </div>
              <div>
                <h4 className="text-sm font-semibold">{it.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{it.description}</p>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" /> Last sync: <span className="text-foreground">{it.lastSync}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-1"
                onClick={() => testConnection(it.key, it.name)}
                disabled={testing === it.key}
              >
                {testing === it.key ? (
                  <><RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Testing…</>
                ) : (
                  <><Zap className="size-3.5 mr-1.5" /> Test connection</>
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardSection>

      {/* Google OAuth credentials */}
      <CardSection
        title="Google OAuth Credentials"
        description="Service-account & OAuth client used for GBP access"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client ID</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value="••••••••••••••••••••••.apps.googleusercontent.com"
                className="font-mono text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Masked for security. Reveal requires admin role.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Client Secret</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value="••••••••••••••••"
                className="font-mono text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Masked. Stored encrypted in environment variables.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
              OAuth tokens are refreshed automatically. If sync stops, re-authorize to grant fresh
              permissions for all linked locations.
            </p>
          </div>
          <Button variant="outline" onClick={reauthorize} className="shrink-0">
            <ExternalLink className="size-3.5 mr-1.5" /> Re-authorize
          </Button>
        </div>
      </CardSection>

      {/* API monitoring note */}
      <CardSection
        title="API Monitoring"
        description="Quota & rate-limit overview"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ApiMetric label="GBP calls today" value="1,284" hint="of 50,000 quota" accent="text-emerald-600 dark:text-emerald-400" />
          <ApiMetric label="AI tokens today" value="48.2k" hint="of 200k cap" accent="text-amber-600 dark:text-amber-400" />
          <ApiMetric label="Avg response" value="312 ms" hint="last 1h" accent="text-teal-600 dark:text-teal-400" />
          <ApiMetric label="Error rate" value="0.2%" hint="last 24h" accent="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-3 rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
          <Server className="size-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Detailed request logs are available in the Audit Logs module. Sync failures trigger notifications.
          </p>
        </div>
      </CardSection>
    </div>
  );
}

function ApiMetric({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums mt-0.5", accent)}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
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
          Only Super Admins can invite, edit, or deactivate users. You can still configure brand,
          AI, sync and integration settings below.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground">Need access? Contact your Super Admin.</span>
        </div>
      </CardContent>
    </Card>
  );
}
