# Self-hosted Supabase — MyFNG GMB App Migration

Move the full MyFNG frontend + API to your self-hosted Supabase at **89.116.21.158**.

| Service | URL |
|---------|-----|
| Kong API | `http://89.116.21.158:8000` |
| Studio | `http://89.116.21.158:8001` (login: `supabase` / `DASHBOARD_PASSWORD`) |
| Postgres | `89.116.21.158:5432` (user: `postgres` / `POSTGRES_PASSWORD`) |

Production app: **https://gmb.myfng.in** (browser talks to Supabase via `/supabase` proxy).

---

## 1. Fill `.env` on the app server

```bash
cp .env.example .env
nano .env
```

Minimum values (from your self-hosted Supabase `.env`):

```env
NEXT_PUBLIC_SUPABASE_URL=http://89.116.21.158:8000
SUPABASE_INTERNAL_URL=http://89.116.21.158:8000

SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

DATABASE_URL=postgresql://postgres:POSTGRES_PASSWORD@89.116.21.158:5432/postgres?connection_limit=3&pool_timeout=20

NEXT_PUBLIC_APP_URL=https://gmb.myfng.in
NEXTAUTH_URL=https://gmb.myfng.in
NEXT_PUBLIC_SUPABASE_BROWSER_URL=https://gmb.myfng.in/supabase
```

Keep your existing Google OAuth, OpenRouter, CRON_SECRET, etc.

> **Note:** `S3_PROTOCOL_*` keys are for Supabase Storage on the Supabase server itself — you do **not** put them in the Next.js `.env`.

---

## 2. One-shot database + auth setup

From the app repo root (local or on gmb.myfng.in server):

```bash
npm install
npm run supabase:setup
```

This runs:

1. Auth health check against Kong
2. `prisma db push` — all app tables (`User`, `Location`, `Review`, …)
3. Storage buckets + RLS SQL
4. Schema drift fixes
5. `prisma/seed.ts` — default users
6. `supabase-bootstrap-users.mjs` — creates Supabase Auth logins

Optional cron jobs (after `CRON_SECRET` is set):

```bash
npm run supabase:setup -- --with-cron
```

Or paste `supabase/cron-jobs.sql` in **Studio → SQL Editor**.

---

## 3. Production deploy (gmb.myfng.in)

```bash
git pull
cp .env.production.example .env   # then fill secrets
./start-production.sh
pm2 restart myfng
```

Ensure reverse proxy forwards:

- `https://gmb.myfng.in` → Next.js `:3000`
- `/supabase/*` is handled by Next.js rewrite (already in `next.config.ts`)

---

## 4. Studio checklist

Open **http://89.116.21.158:8001** → SQL Editor:

1. Extensions: `pg_cron`, `pg_net` enabled
2. Run `supabase/cron-jobs.sql` if not using `--with-cron`
3. Verify tables: `public."User"`, `public."Location"`, …

---

## 5. Login after migration

| Email | Role |
|-------|------|
| admin@myfng.in | super_admin |
| marketing@myfng.in | marketing_manager |
| thane@myfng.in | branch_manager |

Password: `SEED_PASSWORD` from `.env` (default `MyFNG@2025`).

---

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| Login fails / mixed content | Set `NEXT_PUBLIC_SUPABASE_BROWSER_URL=https://gmb.myfng.in/supabase` |
| `FATAL no tenant identifier` | Use `postgres` user in `DATABASE_URL`, not Supavisor tenant format |
| `403` on REST | Use `SUPABASE_SECRET_KEY` for server; publishable key for browser |
| Port 5432 refused | Open firewall on Supabase host for app server IP only |
| Storage upload fails | Run `20260728120000_storage_buckets_and_rls.sql` in Studio |

---

## Architecture

```
Browser (HTTPS gmb.myfng.in)
    → /supabase/*  (Next.js rewrite)
    → Kong :8000 @ 89.116.21.158
        → GoTrue (auth)
        → PostgREST
        → Storage

Next.js API routes
    → Prisma → Postgres :5432 @ 89.116.21.158
    → Supabase Admin (service key) → Kong :8000
```
