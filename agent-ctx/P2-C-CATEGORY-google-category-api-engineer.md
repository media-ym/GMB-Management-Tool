# P2-C-CATEGORY — Google Category API Engineer

## Task
Fix the category patch bug: `updateGoogleBusinessProfile()` was sending
`categories.primaryCategory: { displayName: "..." }` but Google requires
`{ categoryId: "gcid:..." }`. Added a category lookup function and fixed
the patch path.

## Work Log
- Read worklog AUDIT-1, P0-FIX-1, P1-B-GS sections for platform context
  (token encryption, withRetry rate-limiting, sanitizeGoogleError, auth gate
  pattern in PUT /api/locations/[id]).
- Read the existing `updateGoogleBusinessProfile` function in
  `src/lib/google-service.ts` — confirmed the bug at the
  `if (updates.categories)` block: it built
  `primaryCategory: { displayName: ... }` instead of
  `primaryCategory: { categoryId: ... }`.
- Read `src/lib/google-rate-limit.ts` to understand the `withRetry<T>` contract
  (operation must return `{ ok, status, retryAfter?, body: () => Promise<string> }`;
  `withRetry` returns the parsed JSON as `T`).
- Audited all callers of `updateGoogleBusinessProfile` — only
  `PUT /api/locations/[id]` builds the payload, and it never sent categories
  before. No other caller relied on the old `categories` signature.

### Changes
1. **`src/lib/google-service.ts`**
   - Added `searchGoogleCategories(accessToken, searchTerm, regionCode, languageCode)`
     — calls `GET {GBP_API_BASE}/categories:search`, returns
     `{ categoryId, displayName }[]` (maps `name` → `categoryId` since
     Google returns `gcid:...` in the `name` field).
   - Added `resolveCategoryId(accessToken, displayName, regionCode)` —
     exact (case-insensitive) match preferred, falls back to first search
     hit, returns `null` if no match (so callers can drop the category
     rather than send a null ID to Google).
   - Rewrote the `categories` branch in `updateGoogleBusinessProfile`:
     * New `updates.categories` signature accepts BOTH gcids (preferred)
       and display names (fallback, resolved via `resolveCategoryId`).
     * Resolves primary ID: explicit `primaryCategoryId` wins, else
       `primaryDisplayName` is resolved.
     * Resolves additional IDs: explicit `additionalCategoryIds` (filtered
       for truthy) + each `additionalDisplayNames` entry resolved.
     * Unresolvable names are silently dropped — never sends a null/
       empty `categoryId` (Google rejects those).
     * `primaryCategory` field is omitted entirely from the body when no
       primary ID could be resolved.
     * `fieldMask` still pushes `"categories"` whenever the caller
       supplies a categories block (existing behaviour preserved).

2. **`src/app/api/locations/[id]/route.ts`**
   - In the PUT handler's `googleUpdates` builder, added a categories
     branch: if `body.categories` is a non-empty array of display-name
     strings, the first entry becomes `primaryDisplayName` and the rest
     become `additionalDisplayNames`. `updateGoogleBusinessProfile`
     resolves them to gcids before patching.

## Verification
- `bun run lint` → 0 errors, 0 warnings
- `curl -s http://localhost:3000/api/health` → 200
- Dev log tail: no errors (only Prisma query logs + 200 responses)

## Key Decisions
- **Backward compatibility**: If `updates.categories` is omitted, the
  patch path is unchanged — existing callers that don't send categories
  see no behaviour change.
- **Best-effort resolution**: Google's category DB is huge but not
  exhaustive; user-entered display names may not match exactly. We do
  case-insensitive exact match first, then fall back to the first search
  hit, then drop the category entirely. This matches the task spec's
  requirement to "skip that category" on resolution failure.
- **Dual API (gcid OR displayName)**: Exposing both `primaryCategoryId`
  and `primaryDisplayName` (and `additionalCategoryIds` /
  `additionalDisplayNames`) lets a future caller that already has the
  gcid skip the search round-trip, while the current PUT route (which
  only has display names from the client) still works out of the box.
- **`regionCode=IN` default**: Matches the platform's primary market
  (MyFNG = India interior-design franchise). Callers can override.
