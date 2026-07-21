import type { ViewKey } from "@/lib/types";

/** Approved app permalinks — single source of truth */
export const VIEW_PATHS: Partial<Record<ViewKey, string>> = {
  dashboard: "/dashboard",
  locations: "/locations",
  reviews: "/reviews",
  "content-updates": "/content/dashboard",
  directories: "/directories",
  keywords: "/keywords",
  competitors: "/competitors",
  "market-research": "/market-research",
  analytics: "/analytics",
  seo: "/seo",
  ai: "/ai",
  media: "/media",
  reports: "/reports",
  google: "/google",
  notifications: "/alerts",
  audit: "/audit",
  system: "/system",
  "api-docs": "/api-docs",
  "openapi-spec": "/openapi",
  "google-api-mapping": "/api-map",
  "google-billing": "/api-billing",
  settings: "/settings",
  clients: "/clients",
  posts: "/content/posts",
};

export type ContentTab = "posts" | "dashboard" | "bulk-products" | "history";

export const CONTENT_TAB_PATHS: Record<ContentTab, string> = {
  posts: "/content/posts",
  dashboard: "/content/dashboard",
  "bulk-products": "/content/products",
  history: "/content/history",
};

export function viewToPath(view: ViewKey): string {
  return VIEW_PATHS[view] ?? "/dashboard";
}

export function pathToView(pathname: string): ViewKey | null {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (path.startsWith("/content/")) return "content-updates";
  if (path === "/content") return "content-updates";

  for (const [view, href] of Object.entries(VIEW_PATHS) as [ViewKey, string][]) {
    if (href === path) return view;
  }
  return null;
}

export function pathToContentTab(pathname: string): ContentTab | null {
  const path = pathname.split("?")[0].replace(/\/$/, "");
  for (const [tab, href] of Object.entries(CONTENT_TAB_PATHS) as [ContentTab, string][]) {
    if (href === path) return tab;
  }
  if (path === "/content") return "dashboard";
  return null;
}

export function contentTabToPath(tab: string): string {
  return CONTENT_TAB_PATHS[tab as ContentTab] ?? "/content/dashboard";
}

/** All navigable paths for command palette / search */
export const ALL_APP_PATHS = [
  ...new Set([
    ...Object.values(VIEW_PATHS),
    ...Object.values(CONTENT_TAB_PATHS),
  ]),
].sort();
