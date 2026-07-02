# Task 2-g — Notifications View (full-stack-developer)

## Work Log
- Read worklog.md and existing shared components (page-header, store, api-client, types).
- Inspected API routes: GET /api/notifications (supports ?unread=1), PATCH /api/notifications (mark all), PATCH /api/notifications/[id] (mark one).
- Confirmed `NotificationItem` type in src/lib/types.ts (type/severity unions, link, read, createdAt).
- Built `src/components/views/notifications-view.tsx` — full notifications center:
  - PageHeader with Bell icon, title "Notifications", "Mark all read" button (disabled when unreadCount === 0 or in-flight).
  - Filter Tabs: All / Unread (with unread count badge) / Critical (with rose dot when > 0).
  - Type filter Select: All types / Reviews / Sync / Ranking / AI Alerts / System.
  - Notification list inside a Card with `max-h-[calc(100vh-16rem)] overflow-y-auto scroll-area divide-y`.
  - Each row: type-tinted icon, bold title for unread, 2-line clamped message, severity badge + type badge, relative time, left accent border in severity color + subtle bg tint for unread, min-h-[56px] touch-friendly.
  - Click row: PATCH /api/notifications/[id] then navigate via setView(link) when valid ViewKey. Loading spinner per-row during PATCH.
  - Empty state: "You're all caught up" with CheckCircle2 in emerald circle (context-aware copy for filtered vs cleared).
  - Loading skeleton (6 rows, icon + title + message + badges shape).
  - Footer hint showing filtered count.
- Palette: emerald / amber / rose / slate only. No indigo / blue.
- Icons by type: review=Star, sync=RefreshCw, ai_alert=Sparkles, ranking=TrendingUp, system=Server, manual=Bell (fallback).
- Severity colors: critical=rose, warning=amber, success=emerald, info=slate.

## Verification
- `bunx eslint src/components/views/notifications-view.tsx` → no output (clean).
- `bun run lint` → 1 pre-existing error in `app-shell.tsx` (NOT touched by this task).

## File
`src/components/views/notifications-view.tsx` — exports `NotificationsView` (named), imported by `view-router.tsx`.

## Notes for next agents
- Notifications query key: `["notifications"]`. Invalidate on any PATCH.
- All view navigation goes through `useAppStore.setView` — link field must be a valid ViewKey (validated against the full list before navigating).
- Card uses `divide-y` for row separators; unread rows add a `border-l-2` severity-colored accent + subtle bg tint.
