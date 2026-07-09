# Task PROD-READY — DevOps Engineer Work Record

## Summary
Made the MyFNG Local AI Manager 100% production-ready for Hostinger deployment. Delivered env template, complete PostgreSQL schema, full deployment guide, executable startup script, and a clean `bun run build`.

## Files Created
- `/home/z/my-project/.env.example` — comprehensive env-var template (DATABASE, NEXTAUTH, GOOGLE OAUTH, TOKEN_ENCRYPTION, CRON, NODE_ENV, optional SMTP) with `openssl rand …` generation hints.
- `/home/z/my-project/start-production.sh` — executable bash bootstrap. Validates `.env`, runs `bun install`, auto-switches to PG schema when `DATABASE_URL` starts with `postgres`, runs `db:generate` → `db:push` → seed → `bun run build`.

## Files Modified
- `prisma/schema.postgresql.prisma` — was a 24-line stub; expanded to 944 lines (full SQLite schema copy with `provider = "postgresql"`). Includes Client + ClientAuthorization models. Prisma validates clean.
- `DEPLOYMENT.md` — full 7-phase Hostinger deployment guide: Google Cloud setup, Hostinger server setup, build & start, reverse proxy (Caddy + HSTS), GBP connect, cron, post-deploy checklist, security checklist, troubleshooting, maintenance.
- `next.config.ts` — removed invalid `eslint` key (Next.js 16 dropped it; was producing startup warning in dev.log) and removed `typescript.ignoreBuildErrors: true`.
- `tsconfig.json` — added `examples`, `mini-services`, `skills`, `upload` to `exclude` so SDK sample code doesn't block builds.
- `src/app/api/ai/route.ts` — fixed real production bug: `reviewsNow._avg.rating` (count returns a number) → `reviewsPrev._avg.rating` (aggregate). Without this, the monthly summary's `avgRating` would have been `NaN`.
- `src/app/api/dashboard/executive/route.ts` — removed dead `locReviews` line that referenced a non-existent `locationId` on a `select`-ed review shape.
- `src/app/api/posts/bulk/route.ts` — annotated `const created: string[] = []` (was inferred `never[]`).
- `src/app/api/reports/route.ts` — `include: { location: … }` was invalid (Report has no `location` relation). Rewrote to fetch locations separately and join in JS.
- `src/lib/types.ts` — added `syncErrors` and `draftPosts` fields to `DashboardSummary` (returned by API + consumed by `dashboard-view.tsx`).
- `src/components/shared/page-header.tsx` — added optional `icon` prop to `CardSection` (used in 11 places in `google-api-mapping-view.tsx`).
- `src/components/views/google-integration-view.tsx` — added `redirectUri` to `OauthState` type.
- `src/lib/ai.ts` — fixed string-vs-number comparison: `ratingDelta.toFixed(2) > 0` → use `ratingDeltaNum` for comparison.
- `src/lib/google-service.ts` — fixed two errors: (1) `primaryId` type mismatch (`string | undefined` vs `string | null`); (2) `completeVerification` returned a union with incompatible `body()` return types — made the 404 branch `async () => "{}"`.

## Verification
- `bun run lint` → **0 errors, 0 warnings**.
- `bun run build` → **exit 0**, "✓ Compiled successfully in 23.2s", "✓ Generating static pages (3/3)", standalone bundle copied to `.next/standalone/`.
- `bunx prisma validate --schema=prisma/schema.postgresql.prisma` → **"The schema is valid 🚀"**.
- Dev server auto-restarted cleanly after `next.config.ts` edit; `GET /` returns 200, `GET /api/cron/drift-detection` correctly returns 401 (CRON_SECRET unset in dev).

## Build Errors Found & Fixed (10 total)
The previously-suppressed build was hiding 10 real TypeScript errors. All fixed at source — no `ignoreBuildErrors` escape hatch kept. The most impactful fix was `src/app/api/ai/route.ts:79`, where the monthly-summary endpoint was sending `NaN` as `avgRating` to MiSA AI because it accessed `_avg.rating` on a `count()` result instead of the aggregate.

## What an Operator Needs to Deploy
1. `cp .env.example .env && nano .env` — fill in real values (use the included `openssl rand` hints to generate secrets).
2. `./start-production.sh` — installs deps, switches schema to PG, pushes DB, seeds, builds.
3. `pm2 start "bun run start" --name myfng && pm2 save && pm2 startup`
4. Configure Caddy reverse proxy (see DEPLOYMENT.md Phase 4).
5. Visit the domain, login, connect Google Business Profile.

See `/home/z/my-project/DEPLOYMENT.md` for the full step-by-step guide.
