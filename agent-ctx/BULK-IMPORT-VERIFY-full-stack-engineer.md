# Task BULK-IMPORT-VERIFY — Full-Stack Engineer

## Summary
Enhanced the Add Location dialog with a Refresh button, a "Sync after import" option (with serial per-location sync progress), and an "N available to import" badge in the Locations header. Created a new `/api/locations/bulk-verify` route that supports GET (status list), POST (bulk initiate), and PATCH (bulk complete with PINs). Built a `BulkVerifyDialog` component with Initiate + Complete PIN tabs that surfaces the verification state of every location in the agency and lets users act on a batch. Also added a single-location Verify Now + View History flow inside the existing location-detail Google Profile card.

## Files Created
- `src/app/api/locations/bulk-verify/route.ts` — NEW
  - **GET** `?locationIds=loc1,loc2,...` — returns per-location verification state (verified/unverified/pending + `pendingVerifications[]`, `canInitiate`, `canComplete`, plus `linked/configured/connected` flags). Uses `scopeLocationIds` so branch managers only see their own locations. Paces Google `listVerifications` calls at 200 ms apart to stay under the 10 QPS quota. Reconciles local `verificationState` against Google's `COMPLETED` flag.
  - **POST** `{ action: "initiate", locationIds[], method, input }` — bulk-initiates verification. Per-method input validated up front (mailerContactName / phoneNumber / emailAddress). Per-location: skips already-verified / no-GBP-linked, gates via `requireClientAuth(id, "profile.update")`, calls `listVerifications` to detect existing PENDING (skip), then `initiateVerification`. Returns `{ initiated, failed, skipped }`. Logs `bulk.verify_initiated` + per-location `location.verify_initiated`.
  - **PATCH** `{ pins: [{ locationId, pin }] }` — bulk-completes pending verifications. Per-location: `requireClientAuth`, `listVerifications` to find most-recent PENDING, `completeVerification`. Returns `{ completed, failed }`. Logs `bulk.verify_completed` + per-location `location.verify_completed`.

## Files Modified
- `src/components/views/locations-view.tsx`
  - **AddLocationDialog**: extracted `fetchGmbLocations(isRefresh)` async function (callable from the new Refresh button or `useEffect` on open). Added "Refresh" button next to Select All / Deselect All. Added "Refresh list" CTA inside the "all already imported" empty state. Added a "Sync after import" Checkbox (default ON) — when checked, after the import POST succeeds, runs a serial full-sync loop with live progress label ("Syncing 2 of 5 — MyFNG Thane…") and best-effort error swallowing per location. Invalidates `["available-gmb-locations"]` after import so the header badge updates.
  - **LocationsView** header: added `useQuery(["available-gmb-locations"])` with 60 s `refetchInterval`, gated on `canManage`. Renders an "N available" badge on the Add Location button when `status === "connected" && available > 0`; otherwise hidden. Added a "Bulk Verify" button (outline variant, ShieldCheck icon) gated on `canManage` that opens `BulkVerifyDialog`.
  - **BulkVerifyDialog** (NEW, ~570 lines): two-tab dialog. **Initiate tab** — table of all locations with status badges (Verified / Pending / Unverified / Not linked), only `canInitiate` rows are selectable; "Select all unverified" + "Clear" helpers; method Select (ADDRESS / PHONE_CALL / SMS / EMAIL) + per-method Input; per-method validation; "Initiate Verification for N Locations" button; live progress + result card with success/failed/skipped badges. **Complete PIN tab** — table of `canComplete` locations with a per-row 6-digit PIN Input; only non-empty PINs are submitted; result card. **Refresh** button at the top auto-refetches verification status and re-renders the table. Pacing info shown in the loading state.
  - **BulkActionResultCard** (NEW) — small reusable Card that surfaces per-location success/failure/skip from a bulk action.
  - **BusinessInfoTab** Google Profile card: when the location is not verified and the user has `locations.manage`, renders `LocationVerifyActions` (Verify now + View history buttons). When verified, renders just `LocationVerifyHistoryButton`. Both wired to small dialogs.
  - **LocationVerifyActions** / **LocationVerifyHistoryButton** (NEW): small inline button clusters.
  - **SingleVerifyDialog** (NEW): method-select + per-method input → POST `/api/locations/[id]/verify`. When the location has a PENDING verification, switches to a "complete with PIN" panel (Select for which verification record + PIN input → PATCH). Same empty-state cascade (not linked / not configured / not connected) as the backend route. After successful complete, invalidates `["locations"]` + `["location-detail", locationId]`.
  - **VerificationHistoryDialog** (NEW): lists every verification Google has on file (COMPLETED / PENDING / FAILED) with method, badge, initiation time, and PIN expiry hint.

## Key Decisions
1. **Per-location `requireClientAuth(id, "profile.update")` gate** — initiating a verification causes Google to dispatch a postcard/SMS/call/email to the business; completing one mutates the location's verification state on Google. Both are profile-modifying actions, so the same scope used by the locations PUT gate (and the existing single-location verify route) applies. Failing the gate skips the location (failed[] bucket with a clear reason) rather than aborting the whole bulk job — agencies manage a mix of self-managed and client-managed locations.
2. **200 ms pacing between Google calls** — the 10 QPS quota is shared across every bulk operation in the app. `withRetry` already handles 429s with exponential backoff, but a small proactive `sleep(200)` keeps us comfortably under quota and avoids burning retry budget for no reason.
3. **Three-bucket response for POST** (`initiated` / `failed` / `skipped`) — distinguishes "tried and failed" from "didn't try because pre-conditions weren't met" so the user knows whether to retry, request client auth, or just wait for the postcard.
4. **Serial sync-after-import loop** (not parallel) — keeps Google QPS usage predictable and the UX informative (progress label ticks up 1-by-1 with the location name). Best-effort: a sync failure on a freshly-imported location doesn't fail the whole import.
5. **`available` badge hidden when 0** — task spec: "If the count is 0 or the API returns not_configured/not_connected, hide the badge." Implementation: only render when `status === "connected" && available > 0`.
6. **`BulkVerifyDialog` opens with all location IDs** — fetches status for every visible location in one bulk GET. With only 4 seed locations the 200 ms pacing means ~800 ms of loading; for larger fleets the loading copy mentions pacing explicitly so the user knows why it takes a moment.
7. **Reconciliation of `verificationState`** — the GET handler upgrades `verificationState` to "verified" if Google reports a `COMPLETED` verification even when our cached DB state hasn't caught up. Prevents the UI from showing "Unverified" on a location Google already considers verified.
8. **Single-location verify UX** — reused the existing `/api/locations/[id]/verify` GET/POST/PATCH routes (no backend changes needed for that part). The SingleVerifyDialog auto-detects PENDING verifications and shows the complete-with-PIN panel inline; the initiate form is hidden until those are cleared.
9. **No new permissions introduced** — POST/PATCH gated on `locations.manage` (super_admin only — same as the single verify route), GET on `locations.view`. The Bulk Verify button is only rendered when `canManage`.

## Verification
- `bun run lint` → 0 errors, 0 warnings ✅
- `bunx tsc --noEmit` → 0 errors ✅
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/locations/bulk-verify` → **401** (unauth) ✅
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/locations/bulk-verify?locationIds=` → **401** (unauth) ✅
- `curl -s -X POST http://localhost:3000/api/locations/bulk-verify -H "Content-Type: application/json" -d '{}'` → **401** (unauth) ✅
- `curl -s -X PATCH http://localhost:3000/api/locations/bulk-verify -H "Content-Type: application/json" -d '{"pins":[]}'` → **401** (unauth) ✅
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health` → **200** ✅
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → **200** ✅ (page compiles + renders)
- Dev log: only the pre-existing `[next-auth][warn][NEXTAUTH_URL]` warning (unrelated to this task). No errors, no exceptions, no compile warnings.

## Patterns Reused From Previous Agents
- `requireClientAuth(locationId, "profile.update")` discriminated-union gate (from P1-D-BACKEND, also used by P2-B-VERIFY)
- `scopeLocationIds(user)` + `can(role, perm)` for branch-manager scope + RBAC (from every locations route)
- `withRetry`-wrapped Google service functions (`listVerifications`, `initiateVerification`, `completeVerification`) from P2-B-VERIFY
- Empty-state cascade (`linked` / `configured` / `connected` flags → 200 with helpful message rather than 4xx) from P2-B-VERIFY's single-location verify route
- `logAudit({ action, entity, entityId, newValue })` from `@/lib/session`
- `api` helper from `@/lib/api-client` for typed envelope unwrapping
- shadcn/ui Dialog / Tabs / Table / Badge / Checkbox / Input / Select / Button (all already imported in the file)
- `sonner`'s `toast` for notifications (matches every other view in the codebase)
- TanStack Query `useQuery` + `useQueryClient` for data fetching and cache invalidation

## Patterns Introduced For Future Agents
- **Bulk Google operation pacing**: 200 ms `sleep()` between per-location Google API calls inside a serial `for` loop. Useful template for any future "loop over N locations and call Google" feature (bulk media upload, bulk post publish, etc.).
- **Three-bucket bulk-action response shape** (`initiated` / `failed` / `skipped`) — surfaces pre-condition skips distinctly from hard failures so the UI can render an actionable result card.
- **`BulkActionResultCard`** component — reusable results display for any future bulk action (bulk sync, bulk archive could adopt it).
- **Auto-refresh after bulk action**: the BulkVerifyDialog's `handleInitiate` / `handleComplete` both call `fetchStatus(true)` after a successful response so the table immediately reflects the new state (e.g. unverified → pending) without the user having to click Refresh.
- **`historyTick` pattern** in `SingleVerifyDialog` — bumps a counter into the TanStack Query key to force a refetch after a mutation when you don't want to invalidate the whole query cache.
