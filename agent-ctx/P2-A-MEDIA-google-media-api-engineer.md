# Task P2-A-MEDIA — Google Media API Engineer

## Summary
Added photo upload to Google Business Profile (sourceUrl method) and DELETE media from Google, wired into the existing `/api/media` routes with end-client authorization gates.

## Files Changed
- `src/lib/google-service.ts` — added 2 new exported functions:
  - `uploadGooglePhoto(accessToken, locationName, { sourceUrl, description?, category? })` → `{ name, googleUrl? }`. Uses Google's sourceUrl method (POST {parent}/media with `{ mediaFormat: { photo: { sourceUrl } }, locationAssociation?: { category } }`). Wrapped in `withRetry`.
  - `deleteGooglePhoto(accessToken, mediaName)` → `boolean`. DELETE {GBP_API_BASE}/{mediaName}. 404 normalized to success (idempotent delete).
  - Also exported `GooglePhotoCategory` union + `UploadGooglePhotoInput`/`UploadGooglePhotoResult` interfaces.
- `src/app/api/media/route.ts` — added POST handler (was GET-only before):
  - Multipart upload: file → /public/uploads/media/<uuid>.<ext>
  - Creates MediaLibrary record (always)
  - If `publishToGoogle=true`: `requireClientAuth(locationId, "media.upload")` → `uploadGooglePhoto()` → on success creates BusinessPhoto row with returned googlePhotoId (source="google"). Best-effort on Google failure; hard 403 on auth failure.
- `src/app/api/media/[id]/route.ts` — NEW file, DELETE handler:
  - `?type=media` (default): delete MediaLibrary + linked BusinessPhoto
  - `?type=photo`: delete BusinessPhoto directly
  - Best-effort Google delete when googlePhotoId present
  - Auth gate only fires when photo has googlePhotoId (local-only deletes need no policy gate)

## Key Decisions
1. **sourceUrl over 2-step byte upload** — simpler, single-step, avoids fragile media-upload endpoint. We already persist uploads to /public/uploads/media, so Google can fetch them directly.
2. **Dual-write to MediaLibrary + BusinessPhoto when publishToGoogle** — MediaLibrary is the canonical asset library (GET /api/media reads from it); BusinessPhoto carries the googlePhotoId linkage and shows in location.photos.
3. **Google upload failure = best-effort; client-auth failure = hard 403** — mirrors the existing posts pattern (P1-D-BACKEND). Transient API failures don't block local upload; revoked authorization surfaces a 403.
4. **404 normalized to success in deleteGooglePhoto** — idempotent delete (sync drift, manual delete on Google's side).
5. **No new packages** — uses built-in fetch, fs/promises, crypto.randomUUID.

## Verification
- `bun run lint` — 0 errors, 0 warnings ✅
- `curl /api/health` → HTTP 200 ✅
- `curl /api/media` (anon) → HTTP 401 ✅ (auth gate fires)
- `curl -X DELETE /api/media/abc` (anon) → HTTP 401 ✅
- `curl -X POST /api/media` (anon, no body) → HTTP 401 ✅
- Dev log: no errors after exercising the new routes (only pre-existing `[next-auth][warn][NEXTAUTH_URL]` warning unrelated to this task)
- TypeScript strict check: 4 errors in src/lib/google-service.ts at lines 639, 641, 656, 798 are all in PRE-EXISTING code (P1-B-GS's category-resolution block + completeVerification 404-pattern). My new functions at lines 397-460 typecheck cleanly.

## Patterns Reused From Previous Agents
- `withRetry` + `sanitizeGoogleError` (from P1-B-GS) for all Google fetch calls
- `requireClientAuth(locationId, scope)` discriminated-union pattern (from P1-D-BACKEND) for end-client authorization gates
- Best-effort Google delete pattern (from posts DELETE in P1-D-BACKEND): log failure, still delete locally
- 404-normalization pattern (from completeVerification in P1-B-GS) for idempotent deletes

## Patterns Introduced For Future Agents
- Multipart upload via `req.formData()` + `Buffer.from(await file.arrayBuffer())` + `fs/promises.writeFile` — useful for any future file-upload routes
- Public URL construction: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/uploads/media/<filename>` — same pattern can be reused for any asset that needs to be handed to Google as a sourceUrl
- Path-scoped file deletion: only unlink files whose URL pathname starts with `/uploads/media/` — never delete external URLs we don't own
