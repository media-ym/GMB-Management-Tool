# Task 9-b — Enhance Analytics View (doc 11)

**Agent:** full-stack-developer (Enhance Analytics View)
**File:** `/home/z/my-project/src/components/views/analytics-view.tsx`
**Goal:** Restructure the existing Analytics view into a multi-tab dashboard with Executive / Marketing / Location / Reviews / SEO / Posts / AI / Operations dashboards, AI insights, enhanced location comparison table, CSV export, expanded date range options, and performance alerts.

## Work Log

### Pre-flight
- Read `worklog.md` to understand foundation (Task 0-foundation): emerald/amber brand, single-route SPA via Zustand `useAppStore`, React Context `useUser()` for current user, TanStack Query + `api()` envelope wrapper, `can(role, permission)` RBAC matrix from `permissions.ts`. Existing Task 9-api-routes confirmed the four new endpoints are already in place (`/api/dashboard/executive`, `/api/analytics/ai-insights`, `/api/analytics/location-comparison`, `/api/analytics/export`).
- Inspected existing `analytics-view.tsx` (613 LOC, single client component): KPI row, AreaChart trend, PieChart engagement, horizontal BarChart top locations, Funnel, sortable per-location table.
- Verified shared infra APIs:
  - `PageHeader` accepts `icon`, `description`, `actions`.
  - `CardSection` accepts `title/description/action/children/className`.
  - `StatCard` props: `label/value/icon/delta/deltaLabel/hint/accent` (5 accents: emerald/amber/teal/rose/slate).
  - `RatingStars` + `ScoreBadge` from shared/badges (ScoreBadge auto-colors by tier ≥75/≥50/<50).
  - `useUser()` returns `SessionUser` synchronously.
  - `useAppStore()` exposes `activeLocationId`, `setActiveLocationId`, `setView`.
- Confirmed API response shapes by reading each route file:
  - `/api/dashboard/executive` → `{ kpis, ratingDistribution, topPerforming, needsAttention, allLocations }` (gated on `dashboard.view`).
  - `/api/analytics/ai-insights` → `{ insights, summary }` (gated on `analytics.view`).
  - `/api/analytics/location-comparison?days=` → array of 13-column comparison rows (gated on `analytics.view`).
  - `/api/analytics/export?locationId=&days=` → CSV stream (gated on `analytics.view`).
  - `/api/system` → `{ syncLogs, backgroundJobs, errorLogs, aiUsage, ... }` (gated on `settings.view` OR `audit.view`).

### Implementation
- Rewrote `analytics-view.tsx` (~1300 LOC) as a single client component with a top-level `Tabs` switcher.
- **PageHeader** gains:
  - Location `Select` (existing, persists to `useAppStore.activeLocationId`).
  - Date Range `Select` with 7 options: Today, Yesterday, Last 7 Days, Last 30 Days, Last 90 Days, This Month, Last Month → `days` computed via `dateRangeToDays()` (Today/Yesterday→1/2, This Month→current day-of-month, Last Month→days in prev month).
  - "Export CSV" outline button (gated on `analytics.view`) → `window.open('/api/analytics/export?locationId=…&days=…')`.
  - "Refresh" outline button → invalidates all 5 query keys (`analytics`, `dashboard-executive`, `ai-insights`, `location-comparison`, `system-overview`).
- **5 TanStack Queries** running in parallel:
  - `["analytics", activeLocationId, days]` → existing `/api/analytics`.
  - `["dashboard-executive"]` → `/api/dashboard/executive`.
  - `["ai-insights"]` → `/api/analytics/ai-insights`.
  - `["location-comparison", days]` → `/api/analytics/location-comparison?days=`.
  - `["system-overview"]` → `/api/system` (only enabled when `canSystem = settings.view || audit.view`).
- **8 Dashboard Tabs** (filtered by permission; Operations hidden if user lacks `settings.view` AND `audit.view`):
  1. **Executive** (default) — 10-KPI StatCard row (Active Locations, Total Reviews, Avg Rating, Search Views, Website Clicks, Phone Calls, Direction Requests, Published Posts, Avg Health Score, Avg SEO Score) + Performance Alerts banner (rose/amber card listing critical+warning insights with action buttons) + Search/Maps trend AreaChart + Engagement PieChart + AI Insights grid (with critical/warnings/successes summary badges) + Top Performing Locations list (ranked 1-5 with crown + rating + ScoreBadge) + Locations Requiring Attention list (rose-accent) + Rating Distribution horizontal bars (5★→1★ color-coded) + Conversion Funnel + Location Comparison table (sortable, 11 columns) + collapsible Per-location breakdown table (existing, kept) + Top Locations horizontal bar chart.
  2. **Marketing** — Published Posts / Scheduled / AI-Generated / Response Rate StatCards + Engagement PieChart + Search Views trend AreaChart + Top Locations bar + Content & Reputation Insights grid (filtered insights).
  3. **Location** — Single-location deep dive with location `Select` (writes to `setActiveLocationId` so existing query refetches), 8 StatCards (Search/Maps/Clicks/Calls/Directions/Engagement Total/Conversion Rate/Data Points with deltas), Daily Trend AreaChart, Conversion Funnel.
  4. **Reviews** — Total Reviews / Avg Rating / Response Rate / Negative Reviews StatCards + Rating Distribution bars + Sentiment Breakdown card (Positive/Neutral/Negative rows with proportional progress bars) + Reputation Insights grid.
  5. **SEO** — Avg SEO Score / Avg Health Score / Total Locations / Sync Errors StatCards + Visibility Score by Location horizontal BarChart + Locations with SEO Issues list (visibility OR SEO <70, amber-accent, with ScoreBadges) + SEO Insights grid.
  6. **Posts** — Total/Published/Scheduled/Drafts/AI-Generated StatCards + Post Status Distribution donut PieChart + Content Insights list.
  7. **AI** — 4 summary StatCards (Total/Critical/Warnings/Successes) + full AI Insights grid (Refresh button) + AI Usage Stats card (Total Requests / Tokens / Est. Cost) from `/api/system` when permitted.
  8. **Operations** — Total Locations / Sync Errors / Pending Reviews / Avg Health Score StatCards + Sync Insights grid + Sync Status summary card (Successful/Failed/Running counts) + Recent Sync Logs list (8 most recent, color-coded status badge, relative time, records processed/failed) + Recent Errors list (8 most recent, rose-accent) + Background Jobs list (8 most recent, color-coded status).

### Insight cards
- Reusable `InsightCard` component with `compact` mode for tight lists.
- Type-based icon + border color: critical=rose AlertTriangle, warning=amber AlertCircle, success=emerald CheckCircle2, info=teal Info.
- Impact Badge color-coded: high=rose, medium=amber, low=slate.
- Action button (e.g., "View SEO", "Create Post", "View Reviews") routes via `actionToView()` → `setView()`.

### Location Comparison Table
- Reusable `LocationComparisonTable` component: 11 sortable columns (Location, Rating, Reviews, Resp %, Search, Clicks, Calls, Directions, Posts, SEO, Visibility).
- Rating cell color-coded (≥4.5 emerald, ≥4.0 amber, <4.0 rose).
- SEO Score and Visibility Score use `ScoreBadge` (auto-tiered coloring).
- `max-h-96 overflow-y-auto scroll-area` with sticky header.
- Sortable via `ComparisonSortableHead` helper.

### Performance Alerts (doc 11 §20)
- Banner card at top of Executive tab (amber-accent) when there are critical+warning insights.
- Lists top 4 alerts with icon + title + description + action button.
- Summary line: "X critical · Y warnings".

### Permission gating
- All tabs visible to any user with `analytics.view`.
- Export CSV button gated on `analytics.view`.
- Operations tab + AI Usage Stats card gated on `canSystem = settings.view || audit.view` (matches the actual `/api/system` route guard). Branch managers (no settings.view/audit.view) don't see Operations tab.
- Viewer role: sees all 7 non-Operations tabs and can export. No mutations.

### Style rules respected
- Palette strictly emerald/amber/teal/rose/slate/orange-400/cyan — NO indigo/blue.
- Charts use `var(--chart-1..5)` (with hex fallbacks only for gradient stops).
- AI insight card borders: rose/amber/emerald/teal by type.
- Impact badges: rose/amber/slate by impact.
- Card padding `p-4`/`p-5`, gaps `gap-3`/`gap-4`.
- Long lists use `.scroll-area` class with `max-h-72`/`max-h-80`/`max-h-96` and `overflow-y-auto`.
- Mobile responsive: 2-col KPI grid on mobile → 3-col on md → 5-col on xl; tabs list horizontally scrollable on mobile.

### Lint & type-check
- `bunx eslint src/components/views/analytics-view.tsx --max-warnings 0` → EXIT 0 (0 errors, 0 warnings).
- `bunx tsc --noEmit` → 0 errors in `analytics-view.tsx` (all TS errors shown are in sibling files: `dashboard-view.tsx`, `api/reports/route.ts`, `api/dashboard/executive/route.ts`, `examples/`, `skills/` — explicitly out of scope per task instructions).
- `bun run lint` → EXIT 0 (the only project-wide warning is in `seo-view.tsx`, a sibling agent's unused eslint-disable — out of scope).
- Did NOT touch any other file. Did NOT start the dev server (it was already running, serving 200s on `/api/analytics` and other routes).

## Stage Summary
- File: `/home/z/my-project/src/components/views/analytics-view.tsx` (~1300 LOC, single self-contained client component).
- Exports `AnalyticsView` (matches the existing import in `src/components/view-router.tsx`).
- All doc 11 §3 dashboard types implemented as Tabs: Executive (default, comprehensive with KPIs + alerts + insights + top performers + needs attention + rating distribution + comparison + funnel + per-location table + bar chart), Marketing, Location (deep dive), Reviews, SEO, Posts, AI, Operations.
- AI Insights section is the centerpiece of Executive tab: full insight grid sorted by impact, summary badges (critical/warnings/successes), Performance Alerts banner above the trend chart.
- Location Comparison table is sortable on 11 columns, color-codes Rating/SEO/Visibility scores, sticky header, scrollable.
- CSV Export via `window.open('/api/analytics/export?...')`.
- Date range expanded from 3 → 7 options (Today/Yesterday/7d/30d/90d/This Month/Last Month).
- Refresh button invalidates all 5 dashboard query keys.
- AI tab pulls AI usage stats (requests/tokens/cost) from `/api/system` when permitted.
- Operations tab pulls sync logs/errors/background jobs from `/api/system` when permitted.
- RBAC enforced: `analytics.view` gates everything; `settings.view` OR `audit.view` gates Operations tab + AI Usage Stats.
- Palette: emerald/amber/teal/rose/slate/orange-400/cyan only. Zero indigo/blue.
- Lint: PASS. Type-check: PASS for this file. Ready for orchestrator end-to-end verification.
