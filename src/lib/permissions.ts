import type { Role } from "./types";

// Permission matrix — derived from architecture doc §53 (Role Matrix)
export type Permission =
  | "dashboard.view"
  | "locations.view"
  | "locations.manage"
  | "reviews.view"
  | "reviews.reply"
  | "reviews.ai_reply"
  | "posts.view"
  | "posts.manage"
  | "analytics.view"
  | "seo.view"
  | "seo.manage"
  | "ai.use"
  | "media.view"
  | "media.manage"
  | "reports.view"
  | "reports.generate"
  | "notifications.view"
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  | "users.manage"
  | "system.sync"
  | "system.view";

export type BuiltinRole =
  | "super_admin"
  | "marketing_manager"
  | "branch_manager"
  | "customer_support"
  | "viewer"
  | "client_portal";

export const PERMISSION_CATALOG: {
  key: Permission;
  label: string;
  group: string;
  description: string;
}[] = [
  { key: "dashboard.view", label: "View Dashboard", group: "Dashboard", description: "See overview KPIs and charts" },
  { key: "locations.view", label: "View Locations", group: "Locations", description: "Browse GBP listings" },
  { key: "locations.manage", label: "Manage Locations", group: "Locations", description: "Edit profiles, sync, hours" },
  { key: "reviews.view", label: "View Reviews", group: "Reviews", description: "Read customer reviews" },
  { key: "reviews.reply", label: "Reply to Reviews", group: "Reviews", description: "Post review replies" },
  { key: "reviews.ai_reply", label: "AI Review Replies", group: "Reviews", description: "Generate replies with MiSA AI" },
  { key: "posts.view", label: "View Posts", group: "Content", description: "Browse Google posts" },
  { key: "posts.manage", label: "Manage Posts", group: "Content", description: "Create, schedule, publish posts" },
  { key: "analytics.view", label: "View Analytics", group: "Analytics", description: "Search / Maps insights" },
  { key: "seo.view", label: "View Local SEO", group: "SEO", description: "Keywords, competitors, rankings" },
  { key: "seo.manage", label: "Manage Local SEO", group: "SEO", description: "Track keywords, run planner" },
  { key: "ai.use", label: "Use MiSA AI", group: "AI", description: "Chat and AI tools" },
  { key: "media.view", label: "View Media", group: "Media", description: "Browse media library" },
  { key: "media.manage", label: "Manage Media", group: "Media", description: "Upload / delete media" },
  { key: "reports.view", label: "View Reports", group: "Reports", description: "Open report pages" },
  { key: "reports.generate", label: "Generate Reports", group: "Reports", description: "Export / generate reports" },
  { key: "notifications.view", label: "View Notifications", group: "System", description: "In-app notification center" },
  { key: "audit.view", label: "View Audit Log", group: "System", description: "Activity / audit history" },
  { key: "settings.view", label: "View Settings", group: "Admin", description: "Open settings panel" },
  { key: "settings.manage", label: "Manage Settings", group: "Admin", description: "Change system settings" },
  { key: "users.manage", label: "Manage Users & Roles", group: "Admin", description: "Invite users, edit roles" },
  { key: "system.sync", label: "Run Sync", group: "Admin", description: "Trigger Google sync jobs" },
  { key: "system.view", label: "View System Health", group: "Admin", description: "Jobs, errors, health checks" },
];

const FULL: Permission[] = PERMISSION_CATALOG.map((p) => p.key);

/** Builtin matrix (ignores DB RBAC overrides). Used to refresh stale portal perms. */
export function builtinPermissions(role: BuiltinRole): Permission[] {
  return [...(MATRIX[role] ?? [])];
}

const MATRIX: Record<BuiltinRole, Permission[]> = {
  super_admin: FULL,
  marketing_manager: [
    "dashboard.view", "locations.view", "locations.manage",
    "reviews.view", "reviews.reply", "reviews.ai_reply",
    "posts.view", "posts.manage",
    "analytics.view",
    "seo.view", "seo.manage",
    "ai.use",
    "media.view", "media.manage",
    "reports.view", "reports.generate",
    "notifications.view", "audit.view",
    "settings.view", "settings.manage", "system.sync", "system.view",
  ],
  branch_manager: [
    "dashboard.view", "locations.view", "locations.manage",
    "reviews.view", "reviews.reply", "reviews.ai_reply",
    "posts.view", "posts.manage",
    "analytics.view",
    "seo.view",
    "ai.use",
    "media.view", "media.manage",
    "reports.view",
    "notifications.view",
  ],
  customer_support: [
    "dashboard.view",
    "reviews.view", "reviews.reply", "reviews.ai_reply",
    "ai.use",
    "notifications.view",
  ],
  viewer: [
    "dashboard.view", "locations.view",
    "reviews.view", "posts.view", "analytics.view", "seo.view",
    "media.view", "reports.view",
    "notifications.view", "audit.view",
  ],
  // Same product surface as branch_manager (+ SEO manage + settings view for nav parity).
  // Data is scoped to Location.clientId via session.assignedLocationIds.
  // No users.manage / system.view / audit — those stay MyFNG-staff only.
  client_portal: [
    "dashboard.view",
    "locations.view", "locations.manage",
    "reviews.view", "reviews.reply", "reviews.ai_reply",
    "posts.view", "posts.manage",
    "analytics.view",
    "seo.view", "seo.manage",
    "ai.use",
    "media.view", "media.manage",
    "reports.view", "reports.generate",
    "notifications.view",
    "settings.view",
    "system.sync",
  ],
};

export const BUILTIN_ROLE_DEFS: Omit<RbacRoleDef, "permissions" | "system">[] = [
  { value: "super_admin", label: "Super Admin", description: "Full access to every module and setting." },
  { value: "marketing_manager", label: "Marketing Manager", description: "Reviews, Posts, Analytics, AI. No user management." },
  { value: "branch_manager", label: "Branch Manager", description: "Assigned locations, reviews, posts. No global settings." },
  { value: "customer_support", label: "Customer Support", description: "Reviews and AI replies only." },
  { value: "viewer", label: "Viewer", description: "Read-only access to dashboard and reports." },
  { value: "client_portal", label: "Client Portal", description: "End-client: full workspace scoped to their own GBP locations." },
];

export interface RbacRoleDef {
  value: string;
  label: string;
  description: string;
  permissions: Permission[];
  system: boolean;
}

/** Runtime map of role → permissions (includes custom + overrides). */
let rbacRoleMap: Record<string, Permission[]> = { ...MATRIX };
let rbacLabelMap: Record<string, string> = Object.fromEntries(
  BUILTIN_ROLE_DEFS.map((r) => [r.value, r.label]),
);

export function setRbacRoleMap(roles: RbacRoleDef[]) {
  const next: Record<string, Permission[]> = { ...MATRIX };
  const labels: Record<string, string> = Object.fromEntries(
    BUILTIN_ROLE_DEFS.map((r) => [r.value, r.label]),
  );
  for (const r of roles) {
    next[r.value] = r.permissions;
    labels[r.value] = r.label;
  }
  rbacRoleMap = next;
  rbacLabelMap = labels;
}

export function permissionsForRole(role: string): Permission[] {
  if (rbacRoleMap[role]) return rbacRoleMap[role];
  return MATRIX[role as BuiltinRole] ?? [];
}

export function roleDisplayLabel(role: string): string {
  return rbacLabelMap[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return permissionsForRole(role).includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return permissionsForRole(role);
}

export function userCan(
  user: { role: Role; permissions?: Permission[] } | null | undefined,
  permission: Permission,
): boolean {
  if (!user) return false;
  if (user.permissions?.length) return user.permissions.includes(permission);
  return can(user.role, permission);
}

// Nav visibility helper
export function canAccessView(role: Role | undefined, view: string, permissions?: Permission[]): boolean {
  if (!role) return false;
  // End-clients never see agency admin surfaces
  if (role === "client_portal") {
    const blocked = new Set([
      "clients", "audit", "system", "google-billing",
      "api-docs", "openapi-spec", "google-api-mapping",
    ]);
    if (blocked.has(view)) return false;
  }
  const map: Record<string, Permission> = {
    dashboard: "dashboard.view",
    locations: "locations.view",
    reviews: "reviews.view",
    posts: "posts.view",
    analytics: "analytics.view",
    seo: "seo.view",
    ai: "ai.use",
    media: "media.view",
    reports: "reports.view",
    google: "locations.view",
    notifications: "notifications.view",
    audit: "audit.view",
    system: "system.view",
    "api-docs": "dashboard.view",
    "openapi-spec": "dashboard.view",
    "google-api-mapping": "dashboard.view",
    "google-billing": "system.view",
    settings: "settings.view",
    clients: "settings.view",
    "content-updates": "locations.view",
    "directories": "locations.view",
    "keywords": "seo.view",
    "competitors": "seo.view",
    "market-research": "seo.view",
  };
  const perm = map[view];
  if (!perm) return false;
  if (permissions?.length) return permissions.includes(perm);
  return can(role, perm);
}
