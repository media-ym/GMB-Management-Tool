# Task 2-b — Reviews View (full-stack-developer)

## Work Log
- Read worklog.md and the previously-shipped Notifications view (2-g) in /agent-ctx for format + conventions.
- Reviewed foundation: lib/types.ts (ReviewWithLocation), lib/permissions.ts (can() + reviews.reply / reviews.ai_reply matrix), lib/store.ts (activeLocationId, user), lib/api-client.ts, hooks/use-locations.ts, shared/page-header + badges + stat-card, ui/{select,tabs,toggle-group,dialog,avatar,button,textarea,input,skeleton,badge,card}.
- Inspected API contract: GET /api/reviews (locationId/status/sentiment/minRating/maxRating/limit), GET /api/reviews/[id]/reply (MiSA AI draft), POST /api/reviews/[id]/reply (publish), PATCH action=ignore.
- Built src/components/views/reviews-view.tsx — full Reviews module:
  - PageHeader with Star icon, location Select dropdown, and Sync button (POST /api/dashboard → toast → invalidate all).
  - 4-card stat row: Total Reviews, Pending Reply, Avg Rating, Negative Reviews (≤2★). Computed client-side from fetched set (pre-search so counts are stable while typing).
  - Filter bar (Card): status Tabs (All/Pending/Replied/Ignored), sentiment Select, rating ToggleGroup (All/5★/4★/3★/1–2★ — low tinted rose), search Input (author/text/location, client-side).
  - Reviews list: `max-h-[calc(100vh-20rem)] overflow-y-auto scroll-area`, 1-col mobile / 2-col lg+ grid, gap-3, card p-4.
  - ReviewCard: Avatar (image + colored initials), author + location + relative time, RatingStars size 16, expandable line-clamp-4 text, SentimentBadge + ReplyStatusBadge (Pending=amber / Replied=emerald with source suffix / Ignored=slate), existing reply in muted box with "Replied by MiSA AI" / "Replied manually" + amber "AI" pill when source=ai, relative reply time.
  - Negative reviews (rating ≤ 2) get a rose left-border accent.
  - Action row (gated by can(role, 'reviews.reply')): "MiSA AI draft" (amber outline, gated by can(role, 'reviews.ai_reply'), per-card spinner, GET → opens editor pre-filled), "Reply"/"Edit reply" (opens editor with existing reply or local draft), "Ignore" (PATCH action=ignore, per-card spinner). Viewer: no action row.
  - Reply editor Dialog (sm:max-w-2xl): header with author + RatingStars + amber Draft pill; review quoted in muted box; Textarea maxLength 4096 with char count + MiSA AI hint; footer Cancel / Save draft (persists to in-memory drafts map keyed by review id) / Publish to Google (POST → toast + invalidate + close).
  - Loading skeletons (6 × h-56) and EmptyState (Inbox icon, context-aware copy).
  - Mobile: 1 column, all action buttons min-h-11 (44px touch targets), filter bar wraps.
- Palette: emerald / amber / rose / teal / slate only. Zero indigo / blue.

## Verification
- `bunx eslint src/components/views/reviews-view.tsx` → clean (exit 0).
- `bun run lint` → 1 pre-existing error in app-shell.tsx (NOT touched by this task).

## File
`src/components/views/reviews-view.tsx` — exports named `ReviewsView` (matches the import already wired in view-router.tsx).

## Notes for next agents
- Query key: `["reviews", reviewsUrl]` where reviewsUrl encodes locationId + status + sentiment + rating. Invalidate `["reviews"]` after any reply/ignore/sync.
- In-memory drafts map (`drafts: Record<reviewId, string>`) — not persisted; cleared on full reload. If a future agent wants true draft persistence, wire it to a drafts table or localStorage.
- RBAC: action buttons gated by `can(user.role, 'reviews.reply')` and `can(user.role, 'reviews.ai_reply')`. Viewer sees read-only cards.
- AI draft button calls GET /api/reviews/[id]/reply (returns `{ reply: string }`) — takes a few seconds; spinner is per-card via `aiLoadingId` state.
