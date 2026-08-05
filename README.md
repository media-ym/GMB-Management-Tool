# MyFNG Local AI Manager

Internal platform for managing **Google Business Profile** locations for My FNG — reviews, posts, media, analytics, SEO, competitors, and a public customer review landing page.

Production domain: `https://gmb.myfng.in`

---

## Features

- Google Business Profile OAuth sync (locations, reviews, posts, media, analytics)
- Reviews inbox + AI draft replies + optional auto-reply cron
- Content posts (schedule / bulk) + products
- Analytics, SEO keywords, competitors, reports
- **Public review landing** at `/review?locationId=…` (AI review options → Google write-review link)
- MiSA AI dashboard agent (OpenRouter)

---

## Quick start (local)

**Requirements:** Node.js 20+, npm or bun, SQLite (default) or PostgreSQL.

```bash
git clone <your-repo-url>
cd MyFNG-GMB

cp .env.example .env
# Fill GOOGLE_* and NEXTAUTH_SECRET at minimum

npm install
npx prisma generate
npx prisma db push
# optional: npx tsx prisma/seed.ts

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Customer review link (per branch)

```
http://localhost:3000/review?business=My+FNG&branch=Kalyan+West&locationId=<LOCATION_ID>
```

Optional override for Google short link:

```
…&gmb=https://g.page/r/XXXX/review
```

---

## Environment

| File | Use |
|------|-----|
| `.env.example` | Local template |
| `.env.production.example` | Production template (`gmb.myfng.in`) |

**Never commit `.env`.** It is gitignored. If it was tracked historically, remove it from the index:

```bash
git rm --cached .env db/custom.db
```

---

## Production deploy

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Hostinger / VPS steps (PostgreSQL, PM2, Nginx, cron, Google OAuth).

Summary:

1. Copy `.env.production.example` → `.env` on the server  
2. Use PostgreSQL schema: `cp prisma/schema.postgresql.prisma prisma/schema.prisma`  
3. `npm install && npx prisma generate && npx prisma db push`  
4. `npm run build && pm2 start ecosystem.config.js`  
5. Point Google OAuth redirect to `https://gmb.myfng.in/api/google/callback`  
6. Cron with header `x-cron-secret: $CRON_SECRET`:
   - `GET /api/cron/sync-all`
   - `GET /api/cron/publish-scheduled`
   - `GET /api/cron/auto-post-daily` (daily MiSA SEO posts to all verified locations)
   - `GET /api/cron/auto-reply-reviews`
   - `GET /api/cron/drift-detection`

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` | Production standalone build |
| `npm start` | Run standalone server |
| `npm run db:push` | Apply Prisma schema |
| `npm run lint` | ESLint |

---

## Security notes

- All `/api/cron/*` routes require `x-cron-secret`
- Google does **not** allow third-party apps to post or prefill customer reviews — the `/review` page generates text and opens Google’s write-review URL
- Keep `CRON_SECRET`, OAuth secrets, and API keys only in server env
