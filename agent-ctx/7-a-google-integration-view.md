# Task 7-a — Google Integration View

Agent: full-stack-developer (Google Integration View)
Task: Build the Google Business Profile Integration view with OAuth, sync & API health.

## Context

- View module for the 14th nav item ("google") added by orchestrator in Task 6-auth-google.
- ViewRouter already imports `GoogleIntegrationView` from `@/components/views/google-integration-view` and renders it on `case "google":`.
- API contract verified at `src/app/api/google-integration/route.ts`:
  - GET → `{ oauth, accounts, profiles, summary, recentSyncErrors, apiErrors }`
  - POST body `{ action: "connect" | "disconnect" | "sync", email?, locationId? }` — gated server-side on `can(user.role, 'system.sync')`.

## Work Log

- Read worklog.md (foundation §0 + view-agent stages 2-a..2-i + verification §3 + schema §4 + media §5-a + reports §5-b + system §5-c + auth-google §6) to confirm established conventions.
- Inspected shared components: `PageHeader`/`CardSection`, `StatCard` (5 accents incl. emerald/amber/teal/rose/slate), `SyncStatusBadge`/`RatingStars` (used), badges component shape, alert-dialog + dialog exports, progress bar `[data-slot=progress-indicator]` color override pattern, scroll-area CSS class.
- Inspected API contract (route returns the exact shape the task brief describes — verified field-by-field).
- Inspected `lib/permissions.ts` — `system.sync` granted to super_admin + marketing_manager only; `locations.view` is the gate for the GET route.
- Inspected `lib/user-context.ts` — `useUser()` returns `SessionUser` (always populated synchronously via React Context).
- Inspected sibling views (`notifications-view.tsx`, `system-view.tsx`) for the established patterns: TanStack Query + `api()` envelope unwrapper, `qc.invalidateQueries`, sonner toast loading/success/error with stable IDs, `formatDistanceToNow` + `format` for relative + absolute time, sticky table headers inside `max-h-[calc(100vh-Xrem)] overflow-y-auto scroll-area`, `TooltipProvider` wrapping each tooltip trigger, emerald/amber/teal/rose/slate/cyan palette only.

### File: `/home/z/my-project/src/components/views/google-integration-view.tsx` (~1280 LOC, single client component)

- **PageHeader**: title "Google Integration", description "OAuth, sync & API status for Google Business Profile", icon `Plug`, action = "Refresh" outline button (invalidates `["google-integration"]` query + toast).
- **OAuth Connection Card** (hero, 3 states):
  - *connected* → emerald-tinted Card. Left column: emerald ShieldCheck tile + "Connected" heading + Active badge + signed-in email; sub-grid with "Token expires" (relative time + emerald Progress bar showing time remaining, with Tooltip showing ~min remaining + full datetime) and "Last connected" (relative + absolute). Scopes rendered as monospace emerald-tinted badges (label mapped via `scopeLabel()`). Right column (only when `canSync`): rose-outline "Disconnect" button that opens an AlertDialog confirmation.
  - *token_expired* → amber-tinted Card. Amber AlertTriangle tile + "Token expired" heading + "Re-authorization required" badge + explanation. Amber "Re-authorize Google" button opens the ConsentDialog.
  - *disconnected* → slate-tinted Card. Slate Plug tile + "Not connected" heading + "No Google account linked" badge. Emerald "Connect Google Business Profile" button opens the ConsentDialog (or a tooltip-disabled Lock button when `canSync` is false).
- **ConsentDialog** (mock Google OAuth screen): centered header with a small emerald Globe chip + "Sign in with Google" label, DialogTitle "MyFNG Local AI Manager wants to access your Google Account", email Input (prefilled `gmb@myfng.in`), a bordered box listing the 6 requested scopes (Business Profile, Business Information, Business Manage, OpenID, Email, Profile) each with a green check + human label + monospace scope URL, plus a tiny disclaimer noting it's a simulated screen. Footer Cancel + emerald "Allow". While `allowing` is true the dialog can't be dismissed. On "Allow" → calls `onConnect(email)` which POSTs `{ action: "connect", email }` to `/api/google-integration`.
- **AlertDialog (disconnect confirmation)**: rose-tinted action button, explains token revocation + paused syncs + data preservation.
- **Sync Health stat row**: 4 StatCards — Connected Profiles (emerald), Verified Profiles (teal), Active Profiles (emerald), Sync Errors (rose when >0 else emerald). Above the row: "Sync Health" label + API Health badge (emerald "API Healthy" / amber "API Degraded" with CircleCheck icon).
- **Tabs**: Profiles | Sync Logs | API Errors | Configuration (TabsList with `overflow-x-auto justify-start h-auto flex-wrap` for mobile).

#### Tab: Profiles
- CardSection "Google Business Profiles" with profile-count subtitle + a "Sync all" outline button (gated on `canSync`, hidden when 0 profiles).
- Table columns: Profile (name + monospace googleLocationId) | Location (name + city with MapPin) | Category | Rating (RatingStars size 12, or "No ratings" when 0 reviews) | Reviews (tabular-nums right-aligned) | Verification (verified=emerald, unverified=amber, pending=slate) | Status (active=emerald, suspended=rose, disabled=slate) | Sync (SyncStatusBadge) | Last Synced (relative w/ Tooltip absolute) | Actions (per-row "Sync" ghost button with spinner when syncing that ID, plus "View on Maps" external-link button when mapUrl present).
- Container: `max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area` with sticky TableHeader.
- States: loading → 5 skeleton rows; isError → rose EmptyState with Retry; empty → slate EmptyState "No Google Business Profiles linked".

#### Tab: Sync Logs
- CardSection "Recent Sync Errors" with count subtitle.
- Table columns: Module (mono badge) | Location | Status (Failed=rose, Partial/Running=amber, Success=emerald) | Error Message (line-clamp-2 + Tooltip full) | Started (relative w/ Tooltip absolute).
- Failed rows get `border-l-2 border-l-rose-500 bg-rose-500/[0.03]` accent.
- Container: `max-h-[calc(100vh-24rem)] overflow-y-auto scroll-area` with sticky header.
- Empty state: emerald CircleCheck "All syncs healthy".

#### Tab: API Errors
- CardSection "Google API Errors" with count subtitle.
- Table columns: Error Code (mono rose badge) | Message (line-clamp-2 + Tooltip full) | Created (relative w/ Tooltip absolute).
- All rows get rose left-border + bg tint.
- Empty state: emerald CircleCheck "No API errors".

#### Tab: Configuration
- **Sync Schedule** CardSection: 6 cards (Reviews every 5min, Business Info every 30min, Analytics daily, Photos daily, Categories daily, Services daily) — each card with emerald icon chip + module name + Clock-prefixed schedule. Responsive 1/2/3-col grid.
- **Required Google APIs** CardSection: 5 API cards (Business Profile Business Information API, Business Profile Performance API, Business Profile APIs, Google OAuth, Google People API) — each with emerald Server icon + name + description + emerald "Enabled" badge with CircleCheck.
- Two-column grid (lg): **OAuth Redirect URI** card showing `/auth/google/callback` in a bordered code box with a CopyButton; **Authorized JavaScript Origins** card listing 3 origins (localhost:3000 dev, staging.myfng.in, app.myfng.in) each with env label and per-row CopyButton.
- Footer note Card: amber CalendarClock icon + token refresh policy explanation.

### Helpers
- `relativeTime(iso)`, `fullTime(iso)` — date formatting with try/catch fallbacks.
- `scopeLabel(scope)` — maps raw Google scope URLs to human labels (Business Profile, Business Information, Business Manage, openid, Email, Profile) with sensible fallback for unknowns.
- `tokenProgress(expiryIso)` — computes a 0-100 percentage based on a 1h access-token lifetime, returns `{ pct, totalMs, remainingMs }`.
- `verificationBadge(v)` and `profileStatusBadge(s)` — color-coded outline Badges.
- `EmptyState` — reusable component with icon + title + description + tone (emerald/rose/slate) + optional action.
- `StatCardSkeleton` — mimics StatCard layout for loading.
- `CopyButton` — uses `navigator.clipboard.writeText` with copied check state + toast feedback.

### Permission gating
- All Connect/Disconnect/Sync-all/per-profile Sync buttons gated on `can(user.role, 'system.sync')` (super_admin + marketing_manager only). When the user lacks the permission, the disconnected-state Connect button is replaced with a Tooltip-disabled Lock button.
- The GET endpoint is gated server-side on `locations.view` (defensive — view-router also gates `google` view on `locations.view`).

### Mutations
- All three actions (connect, disconnect, sync) use the same `api()` envelope-aware wrapper and POST to `/api/google-integration` with `JSON.stringify({ action, ... })`.
- Each mutation: toast.loading → toast.success/error (with stable ID), then `qc.invalidateQueries({ queryKey: ["google-integration"] })`.
- Per-profile Sync tracks `syncingLocationId` state to show a spinner on the specific row's button; "Sync all" tracks `syncingAll` state to disable every per-row button + show spinner on the header button.

### Style rules respected
- Palette: emerald (primary, connected, verified, active, healthy), amber (token expired, AI accent, sync schedule), teal (verified stat), rose (errors, suspended, disconnect), slate (disconnected, pending, disabled). Zero indigo/blue.
- Removed an inline Google "G" SVG (had Google's actual blue) — replaced with a neutral emerald Globe chip to keep the brand rules strict.
- Card padding `p-4`/`p-5`, gaps `gap-3`/`gap-4`. Monospace for `googleLocationId`, scope URLs, redirect URIs, module names, error codes.
- Sticky table headers, custom scrollbars via `.scroll-area` class.
- Mobile responsive: PageHeader stacks, OAuth card stacks (icon + content + actions), stat grid 2/4 cols, tabs wrap, tables scroll horizontally if needed, action buttons hide text on mobile (only icons remain).

## Lint status

- `bunx eslint src/components/views/google-integration-view.tsx --max-warnings 0` → **0 errors, 0 warnings, exit 0**.
- `bunx tsc --noEmit` → no errors mentioning `google-integration-view`.
- `bun run lint` (project-wide) → 1 pre-existing error in `src/app/api/activity-logs/route.ts` (the `@next/next/no-assign-module-variable` rule on a `const module = ...` declaration). This file belongs to the orchestrator (Task 6-auth-google) — explicitly out of scope per task instructions ("Do NOT touch other files"). My file is clean.

## Stage Summary

- File: `/home/z/my-project/src/components/views/google-integration-view.tsx` (~1280 LOC, single self-contained client component).
- Exports named `GoogleIntegrationView` (matches the import already wired in `src/components/view-router.tsx` line 14, case "google": return `<GoogleIntegrationView />` line 53).
- API integration: GET `/api/google-integration` via TanStack Query (key `["google-integration"]`); POST via the same `api()` wrapper for connect / disconnect / sync. Refresh button + post-mutation invalidation all target the same key.
- All spec requirements met: PageHeader w/ Refresh; OAuth Connection hero card with 3 states (connected/token_expired/disconnected) + scopes as badges + token-expiry Progress bar + AlertDialog disconnect confirmation; mock Google consent dialog with all 6 requested scopes + Cancel/Allow; 4-card Sync Health stat row + API Health badge; 4 tabs (Profiles / Sync Logs / API Errors / Configuration) with full tables + empty states + sticky scrollable headers; Configuration tab with sync schedule (6 modules), required Google APIs (5 enabled), copyable redirect URI + 3 authorized origins.
- RBAC enforced: Connect/Disconnect/Sync visible only to `system.sync` roles; viewer/customer_support/branch_manager see read-only UI.
- Palette strictly emerald/amber/teal/rose/slate. Zero indigo/blue.
- Did NOT touch any other file. Did NOT start the dev server.
