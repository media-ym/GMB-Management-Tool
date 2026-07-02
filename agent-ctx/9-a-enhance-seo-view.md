# Task 9-a — Enhance SEO View (full-stack-developer)

## Scope
Enhance existing `src/components/views/seo-view.tsx` per doc 10 — keyword CRUD, rank history with trend graph, configurable geo-grid (3×3/5×5/7×7 + 1/3/5/10 km), real competitor monitoring with comparison chart, location comparison table with CSV export, SEO audit details with expandable recommendations, AI monthly SEO summary.

## Inputs reviewed
- `worklog.md` — 49 Prisma models, 14 nav modules, established conventions (emerald/amber brand, NO indigo/blue; single-route SPA via `useAppStore`; React Context user via `useUser()`; TanStack Query + `api()` envelope; shared `PageHeader`/`StatCard`/`badges`; `can()` RBAC; `scroll-area` class for sticky scrollable lists).
- Existing `src/components/views/seo-view.tsx` (983 LOC) — had: 4-card overview, geo-grid heatmap, keyword table (without CRUD), AI recs panel, mock competitors panel.
- New API routes (verified exact response shapes):
  - `GET /api/seo/keywords?locationId=` → `KeywordRow[]` with `currentRank/previousRank/bestRank/worstRank/rankChange/rankHistory/trackingCount`
  - `POST /api/seo/keywords` + `PUT/DELETE /api/seo/keywords/[id]`
  - `POST /api/seo/refresh` (triggers rank refresh)
  - `GET /api/seo/geo-grid?locationId=&keywordId=&size=&radius=` → configurable grid + summary
  - `GET /api/seo/location-comparison` → 11-column comparison data
  - `GET /api/seo-audits?locationId=` → audits with profile strength, missing items, recommendations
  - `GET /api/competitors?locationId=` → real competitors with per-keyword rankings
  - `POST /api/ai` action=`seo` (recs) + action=`summary` (monthly summary)
- Shared components: `PageHeader`/`CardSection`, `StatCard`, full shadcn/ui set (Tabs, ToggleGroup, Dialog, AlertDialog, Select, Progress, Table, Input, Label, Badge, Button, Skeleton).
- `permissions.ts` — `seo.view`, `seo.manage`, `ai.use` matrix.

## What was built
1. **PageHeader actions**: location Select (existing) + "Refresh Rankings" outline button (gated on `seo.manage`) + "AI Recommendations" primary button (gated on `ai.use + seo.manage`) + "AI Monthly Summary" outline button. All buttons show Loader2 spinner during async + toast on success/error.
2. **Overview stat row** (kept): 4 StatCards — Total Keywords (Hash/emerald), Avg Rank (TrendingUp/amber), Top 3 Positions (Trophy/emerald), Top 10 Positions (Target/teal).
3. **Health & Visibility card** (kept): single CardSection with 2 ScoreRing radial gauges (color-coded: green≥75, amber 50-74, rose<50) + 5-item rank color legend.
4. **6-tab layout** via shadcn Tabs:
   - **Keywords tab**: CardSection with toolbar (Search input + "Add Keyword" button). Sortable table (Keyword/City/Current/Previous/Best/Worst/Change/Trend/Actions) with 6 sort keys. Rank change badge: green ArrowUp (improved, rankChange>0), red ArrowDown (dropped), gray Minus (no change). Trend column shows mini LineChart sparkline (Y-axis reversed, colored by direction). Actions per row: View History (opens dialog), Edit (opens dialog), Delete (AlertDialog confirm). Clicking a row selects keyword for geo-grid. `max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area`.
   - **Geo Grid tab**: ToggleGroup for size (3×3/5×5/7×7) + Select for radius (1/3/5/10 km) + Select for keyword. Renders configurable GeoGridHeatmap with N/S/E/W axis labels, font-mono rank numbers in colored cells (1-3=emerald, 4-10=amber, 11-20=orange, 21+=rose, 0=slate), MiniStat summary (avg/top3/top10), legend, helper note. Cell size scales with grid size. Disabled state when "All locations" selected.
   - **Competitors tab**: Real data from /api/competitors. Table with expandable rows showing per-keyword rankings on expand. Comparison horizontal BarChart (MyFNG vs competitors by avg rank, emerald for you, amber for competitors, LabelList showing #rank). "Add Competitor" button → toast "Competitor tracking setup queued".
   - **Location Comparison tab**: Sortable table of all locations by 11 columns (City, Name, SEO, Visibility, Avg Rank, Keywords, Top 3, Rating, Reviews, Posts, Resp %). Color-coded badges: SEO/Visibility scores (green≥75, amber 50-74, rose<50), Avg Rank (green≤3, amber 4-10, orange 11-20, rose 21+). "Export CSV" button generates client-side CSV blob with date-stamped filename.
   - **Audit tab**: SEO audits list with expandable rows. Columns: Location, Audit Score (color-coded), Profile Strength (Progress bar + %), Missing Photos (amber badge or green CheckCircle2), Missing Services (same), Recommendations count, Audited date. Expand reveals missing categories as badges + numbered recommendations list. "Run Audit" button → toast "Audit queued".
   - **AI Insights tab**: 2-column grid with (1) AI SEO Recommendations panel (existing recs UI with regenerate button, 5 Lightbulb-styled cards) + (2) AI Monthly SEO Summary panel (new, CalendarClock-styled amber-accented card showing summary text in whitespace-pre-line format). Both show loading skeletons during AI generation, error states in rose alert boxes, empty states with icons. Permission-gated on `canAI`.
5. **Rank History Dialog** (sm:max-w-2xl): 4 StatTiles (Current/Best/Worst/Average) at top, 72px-height LineChart with X=date (dd MMM), Y=rank REVERSED (domain=[0, maxRank+2]), ReferenceLine at y=3 (Top 3, amber dashed) and y=10 (Top 10, rose dashed), tooltip "#X Rank". Footer note explains inverted Y-axis + tracking count.
6. **KeywordFormDialog** (Add/Edit): controlled Dialog that initializes form state in onOpenChange handler (not useEffect) to avoid react-hooks/set-state-in-effect lint rule. Fields: keyword (Input, required), location (Select with "No specific location" option), city (Input), state (Input default "Maharashtra").
7. **AlertDialog delete confirm**: rose-styled AlertDialogAction with Loader2 spinner while submitting.

## Permission gating
- Keyword CRUD (Add/Edit/Delete) + Refresh rankings + Run Audit + Add Competitor → `can(user.role, 'seo.manage')` (super_admin, marketing_manager).
- AI recommendations/summary → `can(user.role, 'ai.use')` AND `can(user.role, 'seo.manage')`.
- Other reads (geo-grid, comparison, competitors read, audit read) → `seo.view` (view-level gate).

## Tech notes
- Two parallel queries for keywords: `seoQuery` (existing `/api/seo` endpoint for overview stats — keeps "working" overview) + `keywordsQuery` (new `/api/seo/keywords` endpoint with detailed rank stats for the keyword table).
- Geo-grid query runs lazily inside `GeoGridTab` component, enabled only when locationId AND gridKeywordId are set.
- All mutations invalidate `["seo"]` + `["seo-audits"]` + `["competitors"]` query keys to keep all tabs in sync.
- Form state initialization in dialog `onOpenChange` (event handler — safe per lint rule) instead of `useEffect`.
- MiniSparkline + RankHistoryDialog use Y-axis `reversed` so rank #1 appears at top.
- All charts use `var(--chart-1)` through `var(--chart-5)` (emerald/amber/teal/rose/cyan) for theme consistency.
- No `any` types; explicit `KeywordSortKey`/`ComparisonSortKey`/`TabKey`/`SortDir` unions.
- All catch blocks use `e instanceof Error` for typed error messages.

## Verification
- `cd /home/z/my-project && bun run lint 2>&1 | tail -30` → 0 errors, 0 warnings (after removing unused Card import + unused eslint-disable comment).
- `bunx tsc --noEmit` → 0 errors in seo-view.tsx (all errors shown are in unrelated files: api routes, dashboard-view, examples/, skills/ — explicitly out of scope).

## File
- `/home/z/my-project/src/components/views/seo-view.tsx` (~1300 LOC, single self-contained client component).
- Exports named `SeoView` (matches the import already wired in `src/components/view-router.tsx`).
