# P1-D-BACKEND — Backend API Engineer — Work Record

## Task
Build client CRUD APIs, data export ZIP, and wire authorization gates into existing GBP write routes.

## Files Created
- `src/lib/client-auth.ts` — `checkClientAuthorization` + `requireClientAuth` + `DEFAULT_SCOPES`
- `src/app/api/clients/route.ts` — GET (list with auth status) + POST (create)
- `src/app/api/clients/[id]/route.ts` — GET (detail) + PATCH (update) + DELETE (soft-terminate)
- `src/app/api/clients/[id]/export/route.ts` — GET (ZIP download via archiver v8 ZipArchive)
- `src/app/api/clients/[id]/authorization/route.ts` — POST (grant) + PATCH (revoke by id)

## Files Modified
- `src/lib/permissions.ts` — added `settings.manage` (admin-only: super_admin + marketing_manager)
- `src/app/api/reviews/[id]/reply/route.ts` — gate before `replyToReview()` (scope=`review.reply`)
- `src/app/api/posts/route.ts` — gate inside `if (status === "published")` (scope=`post.create`); drafts skip gate
- `src/app/api/posts/[id]/route.ts` — 3 gates: `post.create` (publish-transition), `post.update` (edit-published), `post.delete` (DELETE, only when googlePostId is set — NOT best-effort)
- `src/app/api/locations/[id]/route.ts` — gate inside `if (gbp && googleServiceStatus.isConfigured)` block (scope=`profile.update`); local DB update happens first

## Packages Installed
- `archiver@8.0.0` + `@types/archiver@8.0.0` (v8 dropped the `archiver()` factory — use `new ZipArchive(options)`)

## Key Decisions
1. `requireClientAuth` returns discriminated union `{ok:true,clientId} | {ok:false,response}` — call site is `if (!authCheck.ok) return authCheck.response;`. No throwing, type-safe.
2. Client DELETE is **soft-delete** (status=terminated + revoke all active auths). Row is retained for audit per Google Third-Party Policy.
3. Posts DELETE gate is **NOT best-effort** — if auth fails, local delete is also blocked. Reason: a published-but-undeletable post on Google is the worst outcome.
4. Locations PUT gate fires inside the `if (gbp && googleServiceStatus.isConfigured)` block, so it's skipped when Google isn't connected. Local update happens first; 403 surfaces so user can re-establish auth and re-PUT.
5. Multiple active authorizations can coexist (newest wins via `grantedAt DESC`). To fully block a client, revoke all OR terminate the client.
6. ZIP built in-memory as Buffer (more portable than streaming PassThrough into NextResponse).

## Verification
- `bun run lint` — 0 errors, 0 warnings
- `curl http://localhost:3000/api/clients` (unauthenticated) → 401 ✅
- `curl http://localhost:3000/api/health` → 200 ✅
- Authenticated smoke test: all 5 new endpoints return 200 with correct data; auth gate returns 403 with `"Client authorization required: No active authorization on record for this client"` when all active auths are revoked; drafts bypass the gate (200); drafts bypass the gate (200); re-grant restores the system.
- Dev log: no errors after changes.

## Gotchas for Downstream Agents
- The dev server caches the Prisma client across hot-reloads via `globalThis.prisma` in `src/lib/db.ts`. After schema changes (P1-A-SCHEMA added Client/ClientAuthorization models), the running dev server kept using the OLD client and crashed with `Cannot read properties of undefined (reading 'findMany')` on `db.client`. **Fix: touch `next.config.ts` to force a full dev server restart** and clear Turbopack's module cache. This is needed whenever the Prisma schema changes after the dev server is already running.
- archiver v8 breaking change: `import archiver from "archiver"` no longer works. Use `import { ZipArchive } from "archiver"` then `new ZipArchive({ zlib: { level: 9 } })`. The `@types/archiver@8.0.0` types match.
- The seed's `self-auth-default` authorization may have been revoked by smoke tests during this run. After re-granting, the system has 1 active authorization with full DEFAULT_SCOPES. If a downstream agent runs the smoke test again, they may find multiple active authorizations (each test re-grants). Use `db.clientAuthorization.findMany({ where: { status: "active" } })` to inspect.
