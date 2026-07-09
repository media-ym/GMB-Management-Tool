# POSTS-CALENDAR-QUEUE — Frontend Engineer

## Goal
Add Calendar View (monthly, drag-to-reschedule, location filter) and Publishing Queue (retry/cancel/reschedule) to the Google Posts view at `src/components/views/posts-view.tsx`.

## Files created
- `src/components/views/posts-calendar.tsx` (~630 lines)
  - `PostsCalendar` — monthly 7-col grid with prev/next/today, type legend, scheduled/published switches, location color dots, click-chip-to-edit, click-empty-to-create.
  - `DraggablePostChip` — `useDraggable` from @dnd-kit/core; only `scheduled` posts are draggable; published posts get a Lock icon and `disabled:true`.
  - `DayCell` — `useDroppable`; renders chips + "+N more" expand/collapse + Plus button for create-on-date.
  - Optimistic drag-to-reschedule: `qc.setQueryData(["posts"], ...)` moves chip immediately, PATCH confirms, revert on error. Preserves original time-of-day.
  - Past-date guard, mobile horizontal scroll (min-w-[760px] inner grid).
- `src/components/views/posts-queue.tsx` (~430 lines)
  - `PublishingQueue` — 3 columns (Pending/Processing/Failed) with count badges.
  - Processing column intentionally empty with explanatory note (publish is synchronous).
  - `QueueCard` — title, location, Scheduled/Failed badge, content preview, live countdown (useCountdown hook ticks every 30s), action buttons.
  - Actions: Publish now / Reschedule (inline dialog) / Cancel for scheduled; Retry / Edit / Cancel for failed. busyAction lock prevents double-clicks.
  - Auto-refresh every 30s via `setInterval` + `qc.invalidateQueries(["posts"])`. Self-cleans on unmount.

## Files modified
- `src/components/views/posts-view.tsx`
  - Added imports: `PostsCalendar`, `PublishingQueue`, `ToggleGroup/Item`, `ListIcon/CalendarIcon/Inbox` icons.
  - New state: `viewMode: "list" | "calendar" | "queue"` (default "list"), `presetScheduledAt: Date | null`.
  - New memos: `calendarPosts` (scheduled+published, type-filtered), `queuePosts` (scheduled+failed), `locationColorMap` (12-color palette indexed by location), `showLocationDots`.
  - New helper: `openCreateWithDate(date)` — opens PostEditorDialog in create mode with status="scheduled" + scheduledAt prefilled.
  - Replaced filter bar with view-mode ToggleGroup + type Select (always visible). Status Tabs now only render in list mode.
  - List view (bulk bar + select-all + posts grid) wrapped in `viewMode === "list" && (...)` — unchanged behavior in list mode.
  - Conditional rendering of `<PostsCalendar>` (calendar mode) and `<PublishingQueue>` (queue mode).
  - `PostEditorDialog` now accepts `defaultScheduledAt?: Date | null` — both useState initializer and open-effect use it to prefill status + scheduledAt when creating with a preset date.

## Backend
- Verified existing `PATCH /api/posts/[id]` handles `failed → published` retry correctly:
  - The condition `body.status === "published" && post.status !== "published"` is TRUE for failed posts.
  - This calls `createGooglePost(...)` and assigns `data.googlePostId` + `data.publishedAt`.
  - The `editingPublished` block (which would patchGooglePost) only fires when `post.status === "published"` — not for failed → published.
- No backend changes needed.

## Verification
- `bun run lint` → 0 errors, 0 warnings ✅
- `bunx tsc --noEmit` → 0 errors ✅
- `curl /api/health` → 200 ✅
- Agent-browser: confirmed all 3 view modes render correctly, click chip → existing PostEditorDialog (edit mode), click empty day → existing PostEditorDialog (create mode with status="Schedule" + date prefilled), created scheduled post → appears in both calendar (draggable chip on correct date) and queue (Pending column with countdown + action buttons), Cancel action moves post back to draft + queue restores empty state.

## Reuse summary
- `PostsCalendar` reuses PostEditorDialog (via parent `openEdit`/`openCreateWithDate` callbacks) and `useAppStore.activeLocationId` (via parent `allPostsData` query).
- `PublishingQueue` reuses PostEditorDialog (via parent `onEdit` callback) and `/api/posts` endpoint (via parent `allPostsData` prop).
- Both reuse `useQueryClient`, `toast` (sonner), and shadcn components (Card, Button, Badge, Dialog, Popover, Calendar, Switch, Skeleton, ToggleGroup).
- No new packages installed — `@dnd-kit/core` and `date-fns` were already in package.json.
