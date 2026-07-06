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
  | "users.manage"
  | "system.sync"
  | "system.view";

const FULL: Permission[] = [
  "dashboard.view", "locations.view", "locations.manage",
  "reviews.view", "reviews.reply", "reviews.ai_reply",
  "posts.view", "posts.manage",
  "analytics.view",
  "seo.view", "seo.manage",
  "ai.use",
  "media.view", "media.manage",
  "reports.view", "reports.generate",
  "notifications.view", "audit.view",
  "settings.view", "users.manage", "system.sync", "system.view",
];

const MATRIX: Record<Role, Permission[]> = {
  super_admin: FULL,
  marketing_manager: [
    "dashboard.view", "locations.view",
    "reviews.view", "reviews.reply", "reviews.ai_reply",
    "posts.view", "posts.manage",
    "analytics.view",
    "seo.view", "seo.manage",
    "ai.use",
    "media.view", "media.manage",
    "reports.view", "reports.generate",
    "notifications.view", "audit.view",
    "settings.view", "system.sync", "system.view",
  ],
  branch_manager: [
    "dashboard.view", "locations.view",
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
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

// Nav visibility helper
export function canAccessView(role: Role | undefined, view: string): boolean {
  if (!role) return false;
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
    "roadmap": "dashboard.view",
    "design-system": "dashboard.view",
    "wireframes": "dashboard.view",
    settings: "settings.view",
  };
  const perm = map[view];
  return perm ? can(role, perm) : false;
}
