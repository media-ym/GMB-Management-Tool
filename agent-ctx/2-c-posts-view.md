---
Task ID: 2-c
Agent: full-stack-developer (Posts View)
Task: Build the Google Posts management view with MiSA AI post generation.

Work Log:
- Read worklog.md and inspected the foundation: types (PostWithLocation, PostType), permissions (posts.view, posts.manage), api-client envelope, store (useAppStore with activeLocationId), use-locations hook, existing views (dashboard, notifications, ai) for shared conventions, and the existing API routes for /api/posts (GET list, POST create + ai_generate, PATCH update, DELETE).
- Created /home/z/my-project/src/components/views/posts-view.tsx (1065 lines, single self-contained client component module).
- Built `PostsView` with PageHeader (FileText icon, location Select wired to activeLocationId, "+ New post" button gated on can(user.role, 'posts.manage')).
- Stat row: 4 StatCards (Published / Scheduled / Drafts / AI-Generated) computed from a parallel unfiltered query so totals stay correct even when status filter is active.
- Filter bar: Tabs (All / Published / Scheduled / Drafts) + type Select (All / What's New / Offer / Event / Update). statusFilter is passed to the API; typeFilter is applied client-side.
- Posts grid: responsive 1/2/3 cols inside a scroll-area wrapper (max-h-[calc(100vh-22rem)]). Each PostCard shows: type icon (Newspaper/Tag/CalendarDays/Info) + label, title (1-line clamp), content preview (3-line clamp, muted), PostStatusBadge + amber "MiSA AI" badge when source==='ai', CTA badge, location name, relative time (published / scheduled / created), and a per-card DropdownMenu (Publish now, Schedule…, Edit, Delete) gated by `canManage`.
- Schedule action opens an inline Dialog with a Calendar (disabled past dates) + time Input.
- Delete uses AlertDialog confirmation; calls DELETE /api/posts/[id] with toast feedback.
- Create/Edit dialog (PostEditorDialog) — large 2-column layout (form left, simulated Google preview right):
  - "Generate with MiSA AI" panel: amber-tinted box with topic Input + Generate button. Calls POST /api/posts with { action: 'ai_generate', locationId, type, topic }, fills title/content/ctaType from response and marks source='ai'. Loading spinner on button, Enter-to-submit, success toast.
  - Location Select (required, prefilled from activeLocationId), Type Select (4 types with icons), Title Input (60-char cap + live counter), Content Textarea (rows=5, live word + char count, hint about 100–180 words), CTA type Select (book/order/sign_up/call/learn_more) + CTA URL/phone Input, Status Select (Draft / Schedule / Publish now), and conditional date+time picker (Calendar popover + time Input) when status==='scheduled'.
  - Right preview pane shows a faux Google search card with location avatar, type label, title, content (line-clamp-6), and a primary-tinted CTA button — updates live.
  - Save button label morphs (Save draft / Schedule post / Publish now) and shows spinner during request. Edit mode PATCHes /api/posts/[id], create mode POSTs /api/posts.
  - State resets on dialog open via useEffect.
- Empty state: amber Sparkles icon, "No posts yet. Create your first post or let MiSA AI generate one." plus a conditional New post button.
- Loading skeleton: 6 PostCard skeletons.
- All RBAC checks via `can(user.role, 'posts.manage')` — viewer/customer_support see read-only view (no New post button, no per-card dropdown).
- Style: emerald + amber palette only (NO indigo/blue). MiSA AI badges use amber-500/10 / amber-600 tint. Type icons tinted with emerald/amber/teal/slate.
- Long lists use the project's `.scroll-area` class for custom scrollbar styling.

Stage Summary:
- File: /home/z/my-project/src/components/views/posts-view.tsx (1065 lines, zero lint errors in this file).
- Lint status for this file: clean (verified with `npx eslint src/components/views/posts-view.tsx` — no output).
- Full `bun run lint` reports 1 error + 1 warning, both OUTSIDE this file: app-shell.tsx:60 (orchestrator's set-state-in-effect) and seo-view.tsx:161 (sibling's unused eslint-disable). Not touched per task rules.
- Posts view is fully wired to existing API routes (/api/posts GET/POST + /api/posts/[id] PATCH/DELETE) and uses only shared components from @/components/shared and @/components/ui.
- Ready for orchestrator to integrate via ViewRouter (PostsView is already imported in view-router.tsx).
