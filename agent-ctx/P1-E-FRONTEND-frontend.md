# Task P1-E-FRONTEND — Clients View (Frontend)

**Agent:** Frontend Engineer
**Task:** Build a new "Clients" view for the MyFNG Local AI Manager with authorization management, data export (ZIP), and transparency disclosure — for Google Third-Party Policy compliance.

## Files Touched

### Created
- `src/components/views/clients-view.tsx` — the main Clients view (~1510 LOC, single client component with 6 sub-components)

### Modified
- `src/lib/types.ts` — added `"clients"` to `ViewKey` union (placed after `"settings"`)
- `src/lib/permissions.ts` — added `clients: "settings.view"` to the `canAccessView` map
- `src/components/app-shell.tsx` — added `{ key: "clients", label: "Clients" }` to `NAV` (after settings) and added `clients` entry to `PAGE_TITLES` (`title: "End-Clients"`, `subtitle: "Authorization tracking & data export (Google compliance)"`)
- `src/components/view-router.tsx` — imported `ClientsView` and added `case "clients": return <ClientsView />;`

## View Architecture

The view is structured as one parent component (`ClientsView`) plus 6 sub-components kept in the same file (matching the established pattern in `locations-view.tsx` and `google-integration-view.tsx`):

1. **`TransparencyCard`** — always-visible emerald-tinted disclosure card at the top
2. **`AddClientDialog`** — 7-field form for creating a new client
3. **`GrantAuthorizationDialog`** — scope checkboxes + expiry + doc URL + notes
4. **`RevokeAuthorizationDialog`** — confirmation AlertDialog (rose-tinted)
5. **`TerminateClientDialog`** — confirmation AlertDialog (rose-tinted, includes Google Policy reminder)
6. **`ClientDetailDialog`** — full client info + locations table + authorization history + actions

Plus two tiny helpers: `StatCardSkeleton` and `EmptyState`.

## Key Decisions

- **sonner `toast` over `useToast`**: All existing views (`locations-view`, `settings-view`, `google-integration-view`, `system-view`, `notifications-view`) use sonner. The task brief listed both options but also said "Follow existing patterns" — went with sonner for consistency.
- **Pending reviews stat** sourced from existing `/api/dashboard` endpoint (returns `pendingReviews` for current user's location scope) — no new endpoint needed. Defensive `dashboard?.pendingReviews ?? 0`.
- **Defensive list shape**: `locationsCount(c)` and `authorizationsCount(c)` helpers support both top-level `locationsCount`/`authorizationsCount` fields AND Prisma's `_count.locations`/`_count.authorizations` — lets the parallel backend (P1-D-BACKEND) return either shape without frontend changes.
- **`parseScopes()`** safely JSON-parses the `authorizedScopes` string (try/catch + array filter) — never throws on malformed/null data.
- **Export ZIP**: `window.open('/api/clients/{id}/export', '_blank')` per task brief — same-origin Next.js API route, no `XTransformPort` needed.
- **Default pre-checked scopes** for the Grant dialog: `review.reply`, `post.create`, `analytics.sync` — the safe, everyday operations. The full 8-scope set is available but unchecked — encourages least-privilege defaults.
- **TerminateClientDialog** includes an explicit Google Policy reminder to offer data export first — surfaces the §C.2 compliance requirement at the moment of termination.

## UI/UX

- **Mobile responsive**: stats grid (2 cols mobile → 4 cols lg), table wrapped in `overflow-x-auto scroll-area`, dialogs `max-h-[92vh] overflow-y-auto scroll-area`, toolbar stacks vertically on mobile
- **MyFNG emerald brand palette only** (no indigo/blue): emerald for primary actions, teal/amber/slate/rose for status differentiation
- **All actions have loading spinners** (`Loader2` with `animate-spin`) and sonner toasts for success/error feedback
- **Empty/error states** with appropriate tone + Retry button
- **Authorization history** is scrollable (`max-h-64 overflow-y-auto scroll-area`) inside the detail dialog

## API Contract (assumed — for backend P1-D-BACKEND)

- `GET /api/clients` → `ClientListItem[]` (supports optional `locationsCount`/`authorizationsCount` and `activeAuthorization` aggregated fields)
- `POST /api/clients` → `Client` (body: name, legalName?, clientCode?, contactName?, contactEmail?, contactPhone?, notes?)
- `GET /api/clients/[id]` → `{ client, locations[], authorizations[] }`
- `PATCH /api/clients/[id]` → `Client` (not used in v1 of this view)
- `DELETE /api/clients/[id]` → success envelope
- `GET /api/clients/[id]/export` → ZIP file (binary stream; frontend uses `window.open`)
- `POST /api/clients/[id]/authorization` → `ClientAuthorization` (body: authorizedScopes[], expiresAt?, authorizationDoc?, notes?)
- `PATCH /api/clients/[id]/authorization` → `ClientAuthorization` (body: authorizationId, status: "revoked")

## Verification

- `bun run lint` — 0 errors, 0 warnings
- `curl http://localhost:3000/` — HTTP 200, no compile errors in `dev.log`
- Sidebar "More" menu shows "Clients" for roles with `settings.view` permission (super_admin + marketing_manager per MATRIX in `permissions.ts`)
- View gracefully handles missing `/api/clients` endpoints (P1-D-BACKEND is in parallel) — TanStack Query returns `isError` → EmptyState with Retry button. Once backend lands, no frontend changes needed.
