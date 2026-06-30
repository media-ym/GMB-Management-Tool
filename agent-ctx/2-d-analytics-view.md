# Task 2-d — Analytics View (full-stack-developer)

## Scope
Build `src/components/views/analytics-view.tsx` — Performance Analytics module for MyFNG Local AI Manager.

## Inputs reviewed
- `worklog.md` — foundation complete; emerald/amber brand; single-route SPA via `useAppStore`.
- `src/app/api/analytics/route.ts` — endpoint returns `{ series, perLocation, totals }`.
- `src/lib/types.ts` — `AnalyticsPoint` shape.
- `src/components/shared/page-header.tsx` — `PageHeader` + `CardSection`.
- `src/components/shared/stat-card.tsx` — `StatCard` with `accent` (emerald/amber/teal/rose/slate).
- `src/components/views/dashboard-view.tsx` — used as the canonical pattern for charts, queries, tooltips, gradients.
- `src/app/globals.css` — `--chart-1..5` already defined (emerald/amber/teal/rose/cyan).

## What was built
1. **PageHeader** — title "Analytics", description, `BarChart3` icon, two Select actions:
   - Location filter wired to `useAppStore.activeLocationId` (persists across views).
   - Date range 7/30/90 days (`days` query param).
2. **KPI stat row** — 5 StatCards for Search Views / Maps Views / Website Clicks / Phone Calls / Direction Requests. Delta computed by splitting series into halves. Icons: Search, Map, MousePointerClick, Phone, Navigation. Accents cycle through emerald/amber/teal/rose/emerald.
3. **Main trend chart** (2/3 width, 280px) — AreaChart with gradients for searchViews + mapsViews over time. Legend + Tooltip with brand contentStyle. Y-axis formatted with `fmt()` (k/M).
4. **Engagement chart** (1/3 width, 240px) — PieChart (donut) of websiteClicks + phoneCalls + directionRequests. Cells colored by `--chart-3/4/5`. LabelList outside with fmt formatting.
5. **Per-location comparison** (2/3 width, 300px) — Horizontal BarChart of top 10 locations by searchViews, city on Y-axis, emerald gradient bar fill, right-aligned value LabelList.
6. **Conversion funnel** (1/3 width) — Custom funnel: 5 stacked horizontal progress bars (Search → Maps → Clicks → Calls → Directions), each showing count + % of previous step + width proportional to first step. Footer shows overall discovery→engagement conversion.
7. **Collapsible data table** — shadcn Table inside a Collapsible. Sortable columns (Location/Search/Maps/Clicks/Calls/Directions/Total) with `SortableHead` helper showing ↑/↓ or swap icon. Sticky header, max-h-96 with custom scroll-area styling.
8. **Loading skeletons** for KPI row, each chart area, and the table — sized to match.
9. **Empty state** for both `isError` and `hasData === false`.
10. All charts use `ResponsiveContainer width="100%" height="100%"` inside fixed-height parents.

## Tech notes
- TanStack Query: `queryKey: ["analytics", activeLocationId, days]`, `staleTime: 30s`.
- All colors via `var(--chart-N)` CSS vars (and matching hex fallbacks for gradient stops which need actual color values).
- No `any` types; explicit `MetricKey`/`SortKey` unions.
- Tooltip style constant shared across charts.
- No indigo/blue used.

## Verification
- `bunx eslint src/components/views/analytics-view.tsx` → 0 errors, 0 warnings.
- `bunx tsc --noEmit` → 0 errors in this file.
- `bun run lint` shows only 1 pre-existing error in `app-shell.tsx` (NOT my file — per task instructions, do not touch other files).

## File
- `/home/z/my-project/src/components/views/analytics-view.tsx`
