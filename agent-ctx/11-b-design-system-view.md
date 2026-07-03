# Task 11-b — Design System View (doc 16)

**Agent:** full-stack-developer (Design System View)
**Task:** Build the Design System reference view with colors, typography, components, and tokens.

## Work Log

- Read `/home/z/my-project/worklog.md` (last 200 lines) to understand the foundation (Task 0-foundation) and the just-shipped Task 11-foundation which created `/api/design-system` + wired the `design-system` view key into `view-router.tsx` (importing `{ DesignSystemView } from "@/components/views/design-system-view"`).
- Inspected shared infra: `PageHeader`/`CardSection` (from `@/components/shared/page-header`), `StatCard`, badges, `api<T>()` envelope wrapper, `useUser()` from `@/lib/user-context`, shadcn Button (variants: default/outline/ghost/destructive; sizes: sm/default/lg/icon), Input, Textarea, Select, Alert, Table, Skeleton, Badge.
- Inspected `/api/design-system/route.ts` to confirm exact response shape: `philosophy`, `grid`, `breakpoints[]`, `layout`, `colors` (note + 12 named ColorTokens: primary, primaryHover, success, warning, danger, info, background, card, border, textPrimary, textSecondary, accent), `typography` (font, 5 headings, body/small/caption), `borderRadius`, `shadows`, `buttons`, `inputs`, `cards`, `tables`, `charts` (library, types, colors as `"var(--chart-N) name"` strings), `icons`, `modals`, `toasts`, `loadingStates`, `emptyStates`, `errorStates`, `animations`, `accessibility`, `darkMode`, `componentNaming`, `themeVariables`, `finalRules`.
- Wrote `/home/z/my-project/src/components/views/design-system-view.tsx` (~1220 LOC, single self-contained client component). Exports `DesignSystemView` (matches existing view-router import).
- **Sections implemented (all 17 required + bonus context cards):**
  1. **PageHeader** — title "Design System", description "Enterprise design tokens, colors, typography & components", icon `Palette`, Refresh button (calls `refetch()` via `toast.promise` with proper error throw on `r.isError`).
  2. **AI accent strip** — amber-bordered callout stating "Emerald primary · Amber AI accent · Zero indigo/blue".
  3. **Philosophy card** — 2-column grid: Keywords (emerald badges with Check icon) and Avoid (rose badges with strikethrough).
  4. **Color Palette** — amber info Alert showing the doc-vs-platform note (blue #0057FF in spec → emerald #059669 enforced), then a responsive grid (1/2/3 cols) of 12 color swatches. Each swatch: 64x64 (size-16) rounded-lg box with the actual hex as background, the hex value rendered inside the box (white text for dark colors, dark slate text for light colors — via `isLightColor()` luminance check). Beside the swatch: friendly label (Primary, Primary Hover, etc.), color name (font-mono), usage description.
  5. **Typography** — font-family card (Inter via Geist Sans, emerald-tinted). Then each heading level (H1–H5) rendered at its actual pixel size and weight via inline `style={{ fontSize, fontWeight }}`. Beside each: level badge, size, weight, usage. Plus Body (16px), Small (14px), Caption (12px) rendered samples with spec labels.
  6. **Border Radius** — 4 visual boxes (size-20) with `borderRadius` set to 12px/10px/10px/16px for Cards/Buttons/Inputs/Dialogs, each labeled with the spec string.
  7. **Shadows** — 3 cards using Tailwind `shadow-sm`, `shadow-md`, `shadow-lg` with labels. Amber "avoid heavy shadows" rule badge in the header.
  8. **Buttons showcase** — live shadcn Buttons: Primary (default emerald), Secondary (outline), Ghost, Danger (destructive rose), Icon Button (outline size=icon with Plus), Loading Button (disabled with Loader2 spin). Then 3 sizes: Small/Medium/Large. Plus variants/sizes spec badges.
  9. **Inputs showcase** — 6 live shadcn inputs in 2-col grid: Text (Input), Search (Input with leading Search icon + pl-8), Email (Input type=email with Mail icon), Password (Input type=password with Lock icon), Select (Select with 4 color options), Textarea. Plus input catalog badges.
  10. **Cards showcase** — 3-col grid of 7 card types (KPI Card, Analytics Card, Review Card, etc.) each with emerald Component icon + name.
  11. **Tables** — Features (teal badges) + Types (outline badges).
  12. **Charts** — chart types (outline badges) + color tokens grid. Each chart color rendered as a 5x5 rounded-full dot using the actual CSS variable (`style={{ backgroundColor: "var(--chart-N)" }}`) + label + var name in mono.
  13. **Breakpoints & Grid** — 4 stat tiles (Desktop Grid, Container, Content Width, Gutter) + a shadcn Table with Name | Range | Prefix columns for all 5 breakpoints.
  14. **App Shell Layout** (bonus) — sidebar collapsed/expanded badges + footer text + top-nav chips.
  15. **Accessibility** — 4 tiles (Color Contrast WCAG AA, Keyboard Nav, ARIA Support, Focus Ring) each with emerald Check icon.
  16. **Dark Mode** — Supported badge + method badge + note.
  17. **Misc specs** (bonus 6-card grid) — Icons (sizes + live size previews), Modals, Toasts (library + duration + types), Loading States, Empty States (Check list), Error States (Check list), Animations (allowed emerald + avoid rose strikethrough).
  18. **Component Naming** — PascalCase names as slate mono badges.
  19. **Theme Variables** — CSS custom properties as amber mono badges.
  20. **Final Rules** — 10 numbered rules in a 2-col grid, each with emerald Check icon + 2-digit index.
  21. **Footer credit** — "Design System v1 · MyFNG Local AI Manager · doc 16".
- **Loading skeleton** — full skeleton layout (header, philosophy cards, color palette, 3-col grid) shown while the query loads.
- **Error state** — centered rose X card with Retry button if the query fails.
- **Helpers:** `isLightColor(hex)` (perceived luminance > 0.6 → light), `parseChartColor(entry)` (splits `"var(--chart-N) name"` into var + label).
- **Color order:** rendered in spec order via `COLOR_KEYS` constant + `COLOR_LABELS` map (Primary, Primary Hover, Success, Warning, Danger, Info, Background, Card, Border, Text Primary, Text Secondary, AI Accent).
- **Palette strictly emerald/amber/teal/rose/slate/cyan + the spec's actual hex values for swatches** — zero indigo/blue. Chart color dots use the platform's `--chart-1..5` CSS variables (emerald/amber/teal/rose/cyan per globals.css).
- **Mobile responsive:** all grids collapse 4→2→1 cols; PageHeader stacks vertically on mobile; tables scroll horizontally; breakpoints grid switches to 2 cols on mobile.
- **Lint iteration:** First pass clean. Removed 2 unused imports (MousePointerClick, Sun) and a stray `icon={undefined as never}` prop on PhilosophyCard's CardSection (CardSection doesn't accept `icon`). Fixed `handleRefresh` to throw inside `toast.promise` so the error toast fires when `r.isError` is true.
- **Final lint:** `cd /home/z/my-project && bun run lint 2>&1 | tail -30` → exit 0, no errors. `bunx eslint src/components/views/design-system-view.tsx` → exit 0.
- **Type-check:** `bunx tsc --noEmit 2>&1 | grep design-system-view` → no errors in this file.
- Did NOT touch any other file. Did NOT start the dev server.

## Stage Summary

- **File:** `/home/z/my-project/src/components/views/design-system-view.tsx` (~1220 LOC, single self-contained client component).
- **Export:** named `DesignSystemView` (matches existing import in `src/components/view-router.tsx` — no router changes needed).
- **Data source:** `GET /api/design-system` via TanStack Query (`api<T>()` envelope wrapper). Loading skeleton + error state with Retry handled.
- **All 17 required UI sections implemented** plus 4 bonus context cards (App Shell Layout, Component Naming, Theme Variables, Misc Specs grid with Icons/Modals/Toasts/Loading/Empty/Error/Animations) and a footer credit.
- **Live shadcn components** rendered for the Buttons, Inputs, Select, Textarea, Alert, Table, Badge, Skeleton showcases — not mock markup.
- **Color swatches** use the actual hex from the API as the background, with white-or-dark text inside based on perceived luminance.
- **Typography samples** rendered at actual pixel sizes via inline `style`.
- **Chart color dots** use real `var(--chart-N)` CSS variables as background.
- **Palette:** strictly emerald/amber/teal/rose/slate/cyan + amber AI accent. Zero indigo/blue.
- **Lint:** PASS (exit 0). **Type-check:** PASS for this file. Ready for orchestrator end-to-end verification.
