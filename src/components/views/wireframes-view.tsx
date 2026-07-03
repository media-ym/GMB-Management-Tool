"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ViewKey } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  Monitor,
  Search,
  LayoutGrid,
  Layers,
  CheckCircle2,
  PencilRuler,
  ArrowRight,
  ShieldCheck,
  LayoutDashboard,
  MapPin,
  Star,
  FileText,
  BarChart3,
  Sparkles,
  MonitorOff,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CategoryKey =
  | "auth"
  | "dashboard"
  | "locations"
  | "reviews"
  | "posts"
  | "seo"
  | "analytics"
  | "ai"
  | "admin";

type WireframeLayout =
  | "auth"
  | "kpi-grid"
  | "tabbed-content"
  | "table-list"
  | "master-detail"
  | "form-stack"
  | "photo-grid"
  | "editor-split"
  | "chat-bubbles"
  | "calendar"
  | "queue-list"
  | "sidebar-settings"
  | "health-grid"
  | "detail-tabs";

interface ScreenSpec {
  id: string;
  name: string;
  category: CategoryKey;
  description: string;
  widgets: string[];
  status: "implemented" | "wireframe";
  view?: ViewKey;
  viewLabel?: string;
  layout: WireframeLayout;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category metadata — color-coded per spec
// (Auth=slate, Dashboard=emerald, Locations=teal, Reviews=amber, Posts=rose,
//  SEO=cyan, Analytics=emerald, AI=amber, Admin=slate)
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryMeta {
  key: CategoryKey;
  label: string;
  tabLabel: string;
  icon: LucideIcon;
  badge: string;
  dot: string;
  accent: "emerald" | "amber" | "teal" | "rose" | "slate" | "cyan";
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: "auth",
    label: "Authentication",
    tabLabel: "Authentication",
    icon: ShieldCheck,
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
    dot: "bg-slate-500",
    accent: "slate",
  },
  {
    key: "dashboard",
    label: "Dashboard",
    tabLabel: "Dashboard",
    icon: LayoutDashboard,
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
    accent: "emerald",
  },
  {
    key: "locations",
    label: "Locations",
    tabLabel: "Locations",
    icon: MapPin,
    badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    dot: "bg-teal-500",
    accent: "teal",
  },
  {
    key: "reviews",
    label: "Reviews",
    tabLabel: "Reviews",
    icon: Star,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
    accent: "amber",
  },
  {
    key: "posts",
    label: "Google Posts",
    tabLabel: "Google Posts",
    icon: FileText,
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    dot: "bg-rose-500",
    accent: "rose",
  },
  {
    key: "seo",
    label: "SEO",
    tabLabel: "SEO",
    icon: Search,
    badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    dot: "bg-cyan-500",
    accent: "cyan",
  },
  {
    key: "analytics",
    label: "Analytics",
    tabLabel: "Analytics",
    icon: BarChart3,
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
    accent: "emerald",
  },
  {
    key: "ai",
    label: "AI",
    tabLabel: "AI",
    icon: Sparkles,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
    accent: "amber",
  },
  {
    key: "admin",
    label: "Admin",
    tabLabel: "Admin",
    icon: ShieldCheck,
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
    dot: "bg-slate-500",
    accent: "slate",
  },
];

const CATEGORY_MAP: Record<CategoryKey, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<CategoryKey, CategoryMeta>,
);

// ─────────────────────────────────────────────────────────────────────────────
// Screen inventory — all 52 screens from doc 17 §1
// ─────────────────────────────────────────────────────────────────────────────

const SCREENS: ScreenSpec[] = [
  // ── Authentication (3) ──────────────────────────────────────────────────────
  {
    id: "auth-login",
    name: "Login",
    category: "auth",
    description:
      "Centered auth card with brand logo, email + password fields, remember-me toggle, forgot-password link, and primary login action.",
    widgets: ["Email", "Password", "Remember Me", "Forgot Password", "Login button"],
    status: "implemented",
    viewLabel: "Login screen",
    layout: "auth",
  },
  {
    id: "auth-forgot",
    name: "Forgot Password",
    category: "auth",
    description:
      "Single-field recovery flow — email input with validation, sends a time-limited reset link to the user's inbox.",
    widgets: ["Email", "Reset Link", "Back to Login"],
    status: "wireframe",
    layout: "auth",
  },
  {
    id: "auth-reset",
    name: "Reset Password",
    category: "auth",
    description:
      "Token-validated reset form with new password + confirmation, strength meter, and save action.",
    widgets: ["New Password", "Confirm Password", "Strength Meter", "Save"],
    status: "wireframe",
    layout: "auth",
  },

  // ── Dashboard (5) ───────────────────────────────────────────────────────────
  {
    id: "dash-executive",
    name: "Executive Dashboard",
    category: "dashboard",
    description:
      "Top KPI cards (Locations, Reviews, Rating, Calls, Clicks, Directions, SEO) above trend charts, latest reviews feed, AI suggestions rail, notifications, and live sync status.",
    widgets: ["KPI Cards", "Trend Charts", "Latest Reviews", "AI Suggestions", "Notifications", "Sync Status"],
    status: "implemented",
    view: "dashboard",
    viewLabel: "Open Executive Dashboard",
    layout: "kpi-grid",
  },
  {
    id: "dash-location",
    name: "Location Dashboard",
    category: "dashboard",
    description:
      "Single-location overview — rating, review count, search views, SEO score, AI suggestions, and quick action shortcuts.",
    widgets: ["Rating", "Reviews", "Search Views", "SEO Score", "AI Suggestions", "Quick Actions"],
    status: "implemented",
    view: "dashboard",
    viewLabel: "Open Dashboard (location filter)",
    layout: "kpi-grid",
  },
  {
    id: "dash-analytics",
    name: "Analytics Dashboard",
    category: "dashboard",
    description:
      "Tabbed analytics workspace (Overview, Reviews, Performance, SEO, Reports) with engagement cards (Calls, Clicks, Directions, Searches) and time-series charts.",
    widgets: ["Tabs", "KPI Cards", "Charts", "Date Range"],
    status: "implemented",
    view: "analytics",
    viewLabel: "Open Analytics",
    layout: "tabbed-content",
  },
  {
    id: "dash-review",
    name: "Review Dashboard",
    category: "dashboard",
    description:
      "Review operations center — total reviews, average rating, response rate, rating distribution histogram, sentiment breakdown, and SLA timers.",
    widgets: ["Total Reviews", "Avg Rating", "Response Rate", "Rating Distribution", "Sentiment", "SLA"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Reviews (analytics tab)",
    layout: "kpi-grid",
  },
  {
    id: "dash-seo",
    name: "SEO Dashboard",
    category: "dashboard",
    description:
      "Local SEO command center — SEO score, visibility, profile health, keyword rankings, ranking trend chart, and pending audit recommendations.",
    widgets: ["SEO Score", "Visibility", "Profile Health", "Keyword Rankings", "Ranking Trend", "Audit"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO",
    layout: "kpi-grid",
  },

  // ── Locations (9) ───────────────────────────────────────────────────────────
  {
    id: "loc-list",
    name: "Location List",
    category: "locations",
    description:
      "Searchable, filterable location directory with add-location action and a table of Location, City, Rating, Reviews, Health, Last Sync, Status, and row actions.",
    widgets: ["Search", "Filters", "Add Location", "Table", "Actions"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations",
    layout: "table-list",
  },
  {
    id: "loc-details",
    name: "Location Details",
    category: "locations",
    description:
      "Master-detail location workspace with tabbed sections: Overview, Business Info, Hours, Services, Categories, Photos, Reviews, Posts, Analytics, SEO, and Audit.",
    widgets: ["Tabs", "Overview", "Business Info", "Hours", "Services", "Categories", "Photos", "Reviews", "Posts", "Analytics", "SEO", "Audit"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Location Details",
    layout: "detail-tabs",
  },
  {
    id: "loc-business-info",
    name: "Business Information",
    category: "locations",
    description:
      "Editable profile form — name, address, phone, website, description, categories, attributes, and appointment URL with GBP sync.",
    widgets: ["Name", "Address", "Phone", "Website", "Description", "Categories", "Attributes", "Appointment URL"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations (Business Info tab)",
    layout: "form-stack",
  },
  {
    id: "loc-hours",
    name: "Business Hours",
    category: "locations",
    description:
      "Monday–Sunday hours editor with special holiday hours and per-day open/closed toggle.",
    widgets: ["Monday–Sunday", "Holiday Hours", "Open/Closed Toggle"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations (Hours tab)",
    layout: "form-stack",
  },
  {
    id: "loc-services",
    category: "locations",
    name: "Services",
    description:
      "Service catalog — name, description, category, and enabled status with inline add/edit.",
    widgets: ["Service Name", "Description", "Category", "Status"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations (Services tab)",
    layout: "table-list",
  },
  {
    id: "loc-photos",
    name: "Photos",
    category: "locations",
    description:
      "Media grid with upload, preview lightbox, and delete. Syncs cover/interior/team photos to Google Business Profile.",
    widgets: ["Grid", "Upload", "Preview", "Delete"],
    status: "implemented",
    view: "media",
    viewLabel: "Open Media Library",
    layout: "photo-grid",
  },
  {
    id: "loc-categories",
    name: "Categories",
    category: "locations",
    description:
      "Primary category selector plus additional categories with GBP-matched suggestions.",
    widgets: ["Primary Category", "Additional Categories", "Suggestions"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations (Categories tab)",
    layout: "form-stack",
  },
  {
    id: "loc-attributes",
    name: "Attributes",
    category: "locations",
    description:
      "Key–value attribute editor (e.g. Wi-Fi, Wheelchair accessible) grouped by category.",
    widgets: ["Key–Value Pairs", "Grouped Sections", "Toggle Attributes"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations (Attributes tab)",
    layout: "form-stack",
  },
  {
    id: "loc-sync-history",
    name: "Sync History",
    category: "locations",
    description:
      "Chronological sync log with module, status, duration, and records-touched per run.",
    widgets: ["Logs", "Status", "Duration", "Records"],
    status: "implemented",
    view: "locations",
    viewLabel: "Open Locations (Timeline tab)",
    layout: "table-list",
  },

  // ── Reviews (6) ─────────────────────────────────────────────────────────────
  {
    id: "rev-inbox",
    name: "Review Inbox",
    category: "reviews",
    description:
      "Triaged review feed with search, filters (rating, sentiment, status), CSV export, and rich review cards.",
    widgets: ["Search", "Filters", "Export", "Review Cards"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Review Inbox",
    layout: "master-detail",
  },
  {
    id: "rev-details",
    name: "Review Details",
    category: "reviews",
    description:
      "Full review context — customer profile, original review, reply thread, AI suggestions, history, internal notes, and audit trail.",
    widgets: ["Customer", "Review", "Reply", "AI", "History", "Notes", "Audit"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Review Details",
    layout: "master-detail",
  },
  {
    id: "rev-reply-editor",
    name: "Reply Editor",
    category: "reviews",
    description:
      "Compose-and-publish reply surface with textarea, live preview, character count, publish, and save-draft.",
    widgets: ["Textarea", "Preview", "Publish", "Save Draft", "Character Count"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Reply Editor",
    layout: "editor-split",
  },
  {
    id: "rev-ai-reply",
    name: "AI Reply Generator",
    category: "reviews",
    description:
      "MiSA AI panel showing the original review, suggested AI reply, tone selector, regenerate, and publish action.",
    widgets: ["Original Review", "AI Suggested Reply", "Tone Selector", "Generate Again", "Publish"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open AI Reply Generator",
    layout: "editor-split",
  },
  {
    id: "rev-templates",
    name: "Templates",
    category: "reviews",
    description:
      "Reusable reply templates grouped by rating, with variable substitution and full CRUD.",
    widgets: ["List by Rating", "Variables", "Create", "Edit", "Delete"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Templates",
    layout: "master-detail",
  },
  {
    id: "rev-analytics",
    name: "Review Analytics",
    category: "reviews",
    description:
      "Review performance — stats summary, rating distribution, sentiment split, SLA compliance, and trends over time.",
    widgets: ["Stats", "Rating Distribution", "Sentiment", "SLA", "Trends"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Review Analytics",
    layout: "kpi-grid",
  },

  // ── Google Posts (6) ────────────────────────────────────────────────────────
  {
    id: "posts-list",
    name: "Posts List",
    category: "posts",
    description:
      "Posts workspace with create action, filters, calendar toggle, and a sortable posts table.",
    widgets: ["Create", "Filters", "Calendar", "Posts Table"],
    status: "implemented",
    view: "posts",
    viewLabel: "Open Posts",
    layout: "table-list",
  },
  {
    id: "post-create",
    name: "Create Post",
    category: "posts",
    description:
      "Composer with title, description, type, multi-location selector, image upload, CTA, schedule, live preview, publish, and MiSA AI assistant.",
    widgets: ["Title", "Description", "Type", "Locations", "Image", "CTA", "Schedule", "Preview", "Publish", "AI Assistant"],
    status: "implemented",
    view: "posts",
    viewLabel: "Open Post Editor",
    layout: "editor-split",
  },
  {
    id: "post-edit",
    name: "Edit Post",
    category: "posts",
    description:
      "Same composer as Create, pre-filled with an existing draft/scheduled/published post for editing and re-publishing.",
    widgets: ["Title", "Description", "Type", "Locations", "Image", "CTA", "Schedule", "Preview", "Publish", "AI Assistant"],
    status: "implemented",
    view: "posts",
    viewLabel: "Open Post Editor",
    layout: "editor-split",
  },
  {
    id: "post-media",
    name: "Media Library",
    category: "posts",
    description:
      "Centralized asset grid with upload, preview, delete, and re-use across posts and locations.",
    widgets: ["Grid", "Upload", "Preview", "Delete"],
    status: "implemented",
    view: "media",
    viewLabel: "Open Media Library",
    layout: "photo-grid",
  },
  {
    id: "post-calendar",
    name: "Calendar View",
    category: "posts",
    description:
      "Monthly calendar showing scheduled and published posts across locations with drag-to-reschedule.",
    widgets: ["Monthly Calendar", "Scheduled Posts", "Drag Reschedule", "Location Filter"],
    status: "wireframe",
    layout: "calendar",
  },
  {
    id: "post-queue",
    name: "Publishing Queue",
    category: "posts",
    description:
      "Vertical queue of pending/processing/failed posts with status, retry, and cancel actions.",
    widgets: ["Queue List", "Status", "Retry", "Cancel"],
    status: "wireframe",
    layout: "queue-list",
  },

  // ── SEO (6) ─────────────────────────────────────────────────────────────────
  {
    id: "seo-overview",
    name: "SEO Overview",
    category: "seo",
    description:
      "Top cards (SEO Score, Visibility, Health, Keywords) above ranking trend and audit charts.",
    widgets: ["SEO Score", "Visibility", "Health", "Keywords", "Charts"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO Overview",
    layout: "kpi-grid",
  },
  {
    id: "seo-keywords",
    name: "Keyword Management",
    category: "seo",
    description:
      "Searchable keyword table with add/import and per-keyword Location, Rank, Change, Status, and actions.",
    widgets: ["Search", "Add", "Import", "Table", "Actions"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO (Keywords tab)",
    layout: "table-list",
  },
  {
    id: "seo-rankings",
    name: "Keyword Rankings",
    category: "seo",
    description:
      "Per-keyword trend graph, full rank history, and movement indicators (up/down/dropped).",
    widgets: ["Trend Graph", "Rank History", "Movement"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO (Keywords + history dialog)",
    layout: "kpi-grid",
  },
  {
    id: "seo-geo-grid",
    name: "Geo Grid",
    category: "seo",
    description:
      "Map-backed grid of ranking numbers across a geographic area, with average rank and legend.",
    widgets: ["Map", "Grid", "Ranking Numbers", "Average Rank", "Legend"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO (Geo Grid tab)",
    layout: "photo-grid",
  },
  {
    id: "seo-competitors",
    name: "Competitors",
    category: "seo",
    description:
      "Competitor table — business, rating, reviews, distance, visibility, rank, and actions.",
    widgets: ["Table", "Business", "Rating", "Reviews", "Distance", "Visibility", "Rank", "Actions"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO (Competitors tab)",
    layout: "table-list",
  },
  {
    id: "seo-audit",
    name: "SEO Audit",
    category: "seo",
    description:
      "Audit list with overall score, per-issue severity, and actionable recommendations.",
    widgets: ["Audit List", "Score", "Recommendations"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO (Audit tab)",
    layout: "queue-list",
  },

  // ── Analytics (5) ───────────────────────────────────────────────────────────
  {
    id: "analytics-overview",
    name: "Overview",
    category: "analytics",
    description:
      "KPI cards, trend charts, and location comparison summary across the chosen date range.",
    widgets: ["KPI Cards", "Trend Charts", "Location Comparison"],
    status: "implemented",
    view: "analytics",
    viewLabel: "Open Analytics (Executive tab)",
    layout: "kpi-grid",
  },
  {
    id: "analytics-comparison",
    name: "Location Comparison",
    category: "analytics",
    description:
      "Side-by-side table comparing all locations across reviews, rating, search views, clicks, and calls.",
    widgets: ["Comparison Table", "Locations", "Metrics"],
    status: "implemented",
    view: "analytics",
    viewLabel: "Open Analytics + SEO (Comparison tab)",
    layout: "table-list",
  },
  {
    id: "analytics-reviews",
    name: "Review Analytics",
    category: "analytics",
    description:
      "Rating distribution, sentiment breakdown, and response metrics with trend lines.",
    widgets: ["Rating Distribution", "Sentiment", "Response Metrics"],
    status: "implemented",
    view: "analytics",
    viewLabel: "Open Analytics (Reviews tab)",
    layout: "kpi-grid",
  },
  {
    id: "analytics-performance",
    name: "Performance Metrics",
    category: "analytics",
    description:
      "Daily, weekly, and monthly performance charts for search views, calls, clicks, and directions.",
    widgets: ["Daily Charts", "Weekly Charts", "Monthly Charts"],
    status: "implemented",
    view: "analytics",
    viewLabel: "Open Analytics",
    layout: "kpi-grid",
  },
  {
    id: "analytics-reports",
    name: "Reports",
    category: "analytics",
    description:
      "Report builder — select template, generate, download (PDF/CSV), and view history.",
    widgets: ["Generate", "Select Template", "Download", "History"],
    status: "implemented",
    view: "reports",
    viewLabel: "Open Reports",
    layout: "queue-list",
  },

  // ── AI (6) ──────────────────────────────────────────────────────────────────
  {
    id: "ai-dashboard",
    name: "AI Dashboard",
    category: "ai",
    description:
      "MiSA AI hub — active suggestions, queued/running AI jobs, usage metering, and recent AI activity feed.",
    widgets: ["AI Suggestions", "AI Jobs", "AI Usage", "Recent AI Activity"],
    status: "implemented",
    view: "ai",
    viewLabel: "Open AI Dashboard",
    layout: "kpi-grid",
  },
  {
    id: "ai-suggestions",
    name: "AI Suggestions",
    category: "ai",
    description:
      "Suggestion cards with one-click Apply or Dismiss, grouped by module (reviews, posts, SEO).",
    widgets: ["Suggestion Cards", "Apply", "Dismiss"],
    status: "implemented",
    view: "ai",
    viewLabel: "Open AI + Analytics (AI tab)",
    layout: "queue-list",
  },
  {
    id: "ai-review-reply",
    name: "AI Review Reply",
    category: "ai",
    description:
      "Generate, edit, and publish AI-drafted review replies with tone controls.",
    widgets: ["Generate", "Edit", "Publish", "Tone"],
    status: "implemented",
    view: "reviews",
    viewLabel: "Open Reviews (AI draft)",
    layout: "editor-split",
  },
  {
    id: "ai-google-posts",
    name: "AI Google Posts",
    category: "ai",
    description:
      "AI-generated post drafts with tone selector, inline edit, and publish to GBP.",
    widgets: ["Generate", "Tone", "Edit", "Publish"],
    status: "implemented",
    view: "posts",
    viewLabel: "Open Posts (AI generate)",
    layout: "editor-split",
  },
  {
    id: "ai-seo",
    name: "AI SEO",
    category: "ai",
    description:
      "AI SEO recommendations with projected impact and one-click Apply to the keyword/content strategy.",
    widgets: ["Recommendations", "Impact", "Apply"],
    status: "implemented",
    view: "seo",
    viewLabel: "Open SEO (AI Insights tab)",
    layout: "queue-list",
  },
  {
    id: "ai-reports",
    name: "AI Reports",
    category: "ai",
    description:
      "Monthly AI-generated summary narrative with key wins, risks, and one-click generate.",
    widgets: ["Monthly Summary", "Generate"],
    status: "implemented",
    view: "reports",
    viewLabel: "Open Reports (AI summary)",
    layout: "editor-split",
  },

  // ── Admin (6) ───────────────────────────────────────────────────────────────
  {
    id: "admin-users",
    name: "Users",
    category: "admin",
    description:
      "Users table — Name, Role, Email, assigned Locations, Status, and row actions (edit, deactivate).",
    widgets: ["Table", "Name", "Role", "Email", "Locations", "Status", "Actions"],
    status: "implemented",
    view: "settings",
    viewLabel: "Open Settings (Users & Roles)",
    layout: "table-list",
  },
  {
    id: "admin-roles",
    name: "Roles",
    category: "admin",
    description:
      "Role list and permissions matrix (5 roles × all module actions) with inline toggles.",
    widgets: ["Role List", "Permissions Matrix"],
    status: "implemented",
    view: "settings",
    viewLabel: "Open Settings (Users & Roles)",
    layout: "table-list",
  },
  {
    id: "admin-settings",
    name: "Settings",
    category: "admin",
    description:
      "Sidebar-driven settings surface with 16 categories (General, Branding, GBP, AI, Notifications, Email, Integrations, Security, Backups, etc.).",
    widgets: ["Sidebar Layout", "16 Categories", "Forms"],
    status: "implemented",
    view: "settings",
    viewLabel: "Open Settings",
    layout: "sidebar-settings",
  },
  {
    id: "admin-notifications",
    name: "Notifications",
    category: "admin",
    description:
      "Notification center with list, read/unread filters, type filter, and archive.",
    widgets: ["List", "Read/Unread", "Type Filter", "Archive"],
    status: "implemented",
    view: "notifications",
    viewLabel: "Open Notifications",
    layout: "queue-list",
  },
  {
    id: "admin-audit-logs",
    name: "Audit Logs",
    category: "admin",
    description:
      "Immutable audit table — Timestamp, User, Action, Module, Entity, IP, Details — with filters and CSV export.",
    widgets: ["Table", "Timestamp", "User", "Action", "Module", "Entity", "IP", "Details", "Filters"],
    status: "implemented",
    view: "audit",
    viewLabel: "Open Audit Logs",
    layout: "table-list",
  },
  {
    id: "admin-system-health",
    name: "System Health",
    category: "admin",
    description:
      "Live health cards for Database, Google API, Storage, AI, Redis, SMTP, Queue, and Edge Functions.",
    widgets: ["Database", "Google API", "Storage", "AI", "Redis", "SMTP", "Queue", "Edge Functions"],
    status: "implemented",
    view: "system",
    viewLabel: "Open System Health",
    layout: "health-grid",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MiniWireframe — CSS gray-box layout previews
// ─────────────────────────────────────────────────────────────────────────────

function MiniWireframe({ layout }: { layout: WireframeLayout }) {
  const box = "rounded bg-muted-foreground/15 dark:bg-muted-foreground/25";
  const boxStrong = "rounded bg-muted-foreground/25 dark:bg-muted-foreground/35";
  const accentBox = "rounded bg-primary/30 dark:bg-primary/40";
  const amberBox = "rounded bg-amber-500/25 dark:bg-amber-500/35";

  switch (layout) {
    case "auth":
      return (
        <div className="flex h-full items-center justify-center p-3">
          <div className="w-2/3 space-y-1.5 rounded-md border border-muted-foreground/15 p-2.5">
            <div className="mx-auto h-2.5 w-1/2 rounded bg-primary/40" />
            <div className={cn(box, "h-2.5 w-full")} />
            <div className={cn(box, "h-2.5 w-full")} />
            <div className={cn(accentBox, "mt-1 h-3 w-full")} />
          </div>
        </div>
      );

    case "kpi-grid":
      return (
        <div className="flex h-full flex-col gap-1.5 p-2.5">
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn(box, "h-6")} />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-3 gap-1">
            <div className={cn(boxStrong, "col-span-2")} />
            <div className={box} />
          </div>
        </div>
      );

    case "tabbed-content":
      return (
        <div className="flex h-full flex-col gap-1.5 p-2.5">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2.5 flex-1 rounded",
                  i === 0 ? "bg-primary/40" : "bg-muted-foreground/20",
                )}
              />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-2 gap-1">
            <div className={box} />
            <div className={box} />
          </div>
        </div>
      );

    case "detail-tabs":
      return (
        <div className="flex h-full flex-col gap-1.5 p-2.5">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2.5 flex-1 rounded",
                  i === 0 ? "bg-primary/40" : "bg-muted-foreground/20",
                )}
              />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-3 gap-1">
            <div className={cn(box, "col-span-1")} />
            <div className={cn(boxStrong, "col-span-2")} />
          </div>
        </div>
      );

    case "table-list":
      return (
        <div className="flex h-full flex-col gap-1 p-2.5">
          <div className={cn(box, "h-3 w-1/2")} />
          <div className="flex flex-1 flex-col gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={cn(box, "h-3 flex-1")} />
                <div className={cn(boxStrong, "h-3 w-6")} />
              </div>
            ))}
          </div>
        </div>
      );

    case "master-detail":
      return (
        <div className="grid h-full grid-cols-5 gap-1 p-2.5">
          <div className="col-span-2 flex flex-col gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2.5 rounded",
                  i === 1 ? "bg-primary/40" : "bg-muted-foreground/20",
                )}
              />
            ))}
          </div>
          <div className={cn(boxStrong, "col-span-3")} />
        </div>
      );

    case "form-stack":
      return (
        <div className="flex h-full flex-col gap-1.5 p-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="h-1.5 w-1/4 rounded bg-muted-foreground/30" />
              <div className={cn(box, "h-2.5 w-full")} />
            </div>
          ))}
          <div className={cn(accentBox, "mt-auto h-3 w-1/3")} />
        </div>
      );

    case "photo-grid":
      return (
        <div className="grid h-full grid-cols-4 grid-rows-2 gap-1 p-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "rounded",
                i === 0 ? "bg-primary/25" : "bg-muted-foreground/20",
              )}
            />
          ))}
        </div>
      );

    case "editor-split":
      return (
        <div className="grid h-full grid-cols-2 gap-1 p-2.5">
          <div className="flex flex-col gap-1">
            <div className={cn(box, "h-2 w-full")} />
            <div className={cn(boxStrong, "flex-1")} />
            <div className={cn(accentBox, "h-2 w-1/2")} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-1/3 rounded bg-muted-foreground/30" />
            <div className={cn(box, "flex-1")} />
          </div>
        </div>
      );

    case "chat-bubbles":
      return (
        <div className="flex h-full flex-col justify-center gap-1.5 p-2.5">
          <div className="flex justify-start">
            <div className={cn(box, "h-2.5 w-2/3 rounded-lg")} />
          </div>
          <div className="flex justify-end">
            <div className={cn(amberBox, "h-2.5 w-1/2 rounded-lg")} />
          </div>
          <div className="flex justify-start">
            <div className={cn(box, "h-2.5 w-3/4 rounded-lg")} />
          </div>
        </div>
      );

    case "calendar":
      return (
        <div className="grid h-full grid-cols-7 grid-rows-4 gap-0.5 p-2.5">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "rounded-sm",
                [6, 13, 14, 21].includes(i)
                  ? "bg-primary/40"
                  : "bg-muted-foreground/15",
              )}
            />
          ))}
        </div>
      );

    case "queue-list":
      return (
        <div className="flex h-full flex-col gap-1 p-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "size-2 rounded-full",
                  i === 0
                    ? "bg-emerald-500"
                    : i === 1
                      ? "bg-amber-500"
                      : i === 2
                        ? "bg-rose-500"
                        : "bg-slate-400",
                )}
              />
              <div className={cn(box, "h-2.5 flex-1")} />
              <div className={cn(boxStrong, "h-2.5 w-6")} />
            </div>
          ))}
        </div>
      );

    case "sidebar-settings":
      return (
        <div className="grid h-full grid-cols-4 gap-1 p-2.5">
          <div className="col-span-1 flex flex-col gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2 rounded",
                  i === 0 ? "bg-primary/40" : "bg-muted-foreground/20",
                )}
              />
            ))}
          </div>
          <div className={cn(boxStrong, "col-span-3")} />
        </div>
      );

    case "health-grid":
      return (
        <div className="grid h-full grid-cols-4 grid-rows-2 gap-1 p-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded p-0.5">
              <div
                className={cn(
                  "size-1.5 rounded-full",
                  i === 5 ? "bg-rose-500" : "bg-emerald-500",
                )}
              />
              <div className={cn(box, "h-2 flex-1")} />
            </div>
          ))}
        </div>
      );

    default:
      return <div className={cn(box, "h-full w-full")} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ScreenCard
// ─────────────────────────────────────────────────────────────────────────────

function ScreenCard({ screen }: { screen: ScreenSpec }) {
  const setView = useAppStore((s) => s.setView);
  const cat = CATEGORY_MAP[screen.category];
  const CatIcon = cat.icon;
  const implemented = screen.status === "implemented";

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* Mini wireframe preview */}
      <div className="h-28 border-b bg-muted/30 dark:bg-muted/20">
        <MiniWireframe layout={screen.layout} />
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Header: name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight">{screen.name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("gap-1", cat.badge)}>
                <CatIcon className="size-3" />
                {cat.label}
              </Badge>
              {implemented ? (
                <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Implemented
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300">
                  <span className="size-1.5 rounded-full bg-slate-400" />
                  Wireframe
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Layout description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {screen.description}
        </p>

        {/* Widgets */}
        <div className="flex flex-wrap gap-1">
          {screen.widgets.map((w) => (
            <span
              key={w}
              className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {w}
            </span>
          ))}
        </div>
      </CardContent>

      <CardFooter className="border-t bg-muted/20 px-4 py-2.5">
        {implemented && screen.view ? (
          <Button
            size="sm"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setView(screen.view!)}
          >
            {screen.viewLabel ?? "Open"}
            <ArrowRight className="size-3.5" />
          </Button>
        ) : implemented ? (
          <div className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Available in-app
          </div>
        ) : (
          <div className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <PencilRuler className="size-3.5 text-slate-400" />
            Spec only — not yet built
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WireframesView
// ─────────────────────────────────────────────────────────────────────────────

export function WireframesView() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | CategoryKey>("all");
  const [mounted, setMounted] = useState(false);

  // brief mount skeleton so first paint isn't a flash of dense cards
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 120);
    return () => clearTimeout(t);
  }, []);

  const stats = useMemo(() => {
    const total = SCREENS.length;
    const categories = CATEGORIES.length;
    const implemented = SCREENS.filter((s) => s.status === "implemented").length;
    const wireframe = total - implemented;
    return { total, categories, implemented, wireframe };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SCREENS.filter((s) => {
      const matchCategory = category === "all" || s.category === category;
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.widgets.some((w) => w.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });
  }, [search, category]);

  // per-category counts for the tab badges
  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = { all: SCREENS.length };
    for (const c of CATEGORIES) {
      map[c.key] = SCREENS.filter((s) => s.category === c.key).length;
    }
    return map;
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Screen Wireframes"
        description="Complete screen specifications & layouts"
        icon={Monitor}
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search screens…"
              className="pl-8"
              aria-label="Search screens by name"
            />
          </div>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Screens"
          value={stats.total}
          icon={LayoutGrid}
          accent="emerald"
          hint="Across all modules"
        />
        <StatCard
          label="Categories"
          value={stats.categories}
          icon={Layers}
          accent="teal"
          hint="Functional groupings"
        />
        <StatCard
          label="Implemented"
          value={stats.implemented}
          icon={CheckCircle2}
          accent="emerald"
          hint="Live in the platform"
        />
        <StatCard
          label="Wireframe Only"
          value={stats.wireframe}
          icon={PencilRuler}
          accent="slate"
          hint="Spec-only screens"
        />
      </div>

      {/* Category filter */}
      <Tabs
        value={category}
        onValueChange={(v) => setCategory(v as typeof category)}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="all" className="gap-1.5">
            All
            <span className="rounded bg-muted-foreground/15 px-1.5 text-[10px] tabular-nums">
              {countsByCategory.all}
            </span>
          </TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="gap-1.5">
              <c.icon className="size-3.5" />
              {c.tabLabel}
              <span className="rounded bg-muted-foreground/15 px-1.5 text-[10px] tabular-nums">
                {countsByCategory[c.key]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Catalog grid */}
      {!mounted ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-28 w-full rounded-none" />
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <div className="flex gap-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardContent>
              <Skeleton className="h-10 w-full rounded-none" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <MonitorOff className="size-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-base font-semibold">No screens found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search term or clear the category filter.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((screen) => (
            <ScreenCard key={screen.id} screen={screen} />
          ))}
        </div>
      )}

      {/* Footer hint */}
      <p className="text-center text-xs text-muted-foreground">
        Showing {filtered.length} of {SCREENS.length} screens
        {category !== "all" && ` in ${CATEGORY_MAP[category].label}`}
        {search.trim() && ` matching “${search.trim()}”`}.
      </p>
    </div>
  );
}

export default WireframesView;
