# MyFNG Local AI Manager — Production Deployment Guide (Hostinger)

This guide takes you from a fresh Hostinger VPS to a production-ready MyFNG
Local AI Manager deployment connected to real Google Business Profile (GBP)
locations. Total time: ~80 minutes.

---

## Prerequisites

- **Hostinger VPS** (recommended) or Business/Premium hosting with Node.js 20+ support.
- A **domain / subdomain** (production: `gmb.myfng.in`) with DNS A/AAAA records pointing to your Hostinger server's IP.
- A **Google Cloud Console** project with Business Profile APIs enabled.
- SSH access to your Hostinger server.

---

## Phase 1: Google Cloud Console Setup (15 min)

1. Go to <https://console.cloud.google.com/>.
2. Create a new project (e.g. `MyFNG-GBP-Manager`).
3. Enable APIs (APIs & Services → Library):
   - **Google My Business API**
   - **Business Profile API**
   - **Business Profile Performance API**
4. Configure the OAuth consent screen:
   - User type: **External**
   - App name: `MyFNG Local AI Manager`
   - User support email + developer contact: your email
   - Authorized domains: `myfng.in` (covers `gmb.myfng.in`)
   - Scopes: `business.manage`, `openid`, `email`, `profile`
5. Create OAuth 2.0 credentials:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://gmb.myfng.in`
   - Authorized redirect URIs: `https://gmb.myfng.in/api/google/callback`
   - Copy the **Client ID** and **Client Secret** — you'll paste them into `.env` later.
6. Submit for verification (required for public access; "Testing" mode works immediately for up to 100 test users).

---

## Phase 2: Hostinger Server Setup (30 min)

1. SSH into your Hostinger server:
   ```bash
   ssh username@your-server-ip
   ```

2. Install Node.js 20+ and Bun:
   ```bash
   # Node.js 20 (LTS)
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Bun (for running the Next.js app + scripts)
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc

   # PM2 (process manager)
   sudo npm install -g pm2

   # PostgreSQL (if not already provided by Hostinger)
   sudo apt-get install -y postgresql postgresql-contrib
   sudo systemctl enable --now postgresql
   ```

3. Create the PostgreSQL database and user:
   ```bash
   sudo -u postgres psql <<'SQL'
   CREATE USER myfng_user WITH ENCRYPTED PASSWORD 'STRONG_DB_PASSWORD';
   CREATE DATABASE myfng_db OWNER myfng_user;
   GRANT ALL PRIVILEGES ON DATABASE myfng_db TO myfng_user;
   SQL
   ```

4. Clone the project:
   ```bash
   git clone <your-repo-url> /home/myfng/platform
   cd /home/myfng/platform
   ```

5. Install dependencies:
   ```bash
   bun install
   ```

6. Copy and edit the environment file:
   ```bash
   cp .env.production.example .env
   # (local template is `.env.example`)
   nano .env
   ```
   Fill in **all** values. Generate secrets with:
   ```bash
   openssl rand -base64 32  # → NEXTAUTH_SECRET
   openssl rand -hex 32     # → TOKEN_ENCRYPTION_KEY
   openssl rand -hex 16     # → CRON_SECRET
   ```
   Set:
   ```bash
   DATABASE_URL="postgresql://myfng_user:STRONG_DB_PASSWORD@localhost:5432/myfng_db"
   NEXTAUTH_URL="https://gmb.myfng.in"
   GOOGLE_REDIRECT_URI="https://gmb.myfng.in/api/google/callback"
   GOOGLE_CLIENT_ID="...from Google Cloud Console..."
   GOOGLE_CLIENT_SECRET="...from Google Cloud Console..."
   TOKEN_ENCRYPTION_KEY="<64-hex-chars>"
   NEXTAUTH_SECRET="<base64-string>"
   CRON_SECRET="<32-hex-chars>"
   NODE_ENV="production"
   ```

7. Switch the Prisma schema to PostgreSQL:
   ```bash
   cp prisma/schema.postgresql.prisma prisma/schema.prisma
   ```

8. Initialize the database:
   ```bash
   bun run db:generate      # regenerate Prisma client for PostgreSQL
   bun run db:push          # create all tables
   bunx tsx prisma/seed.ts  # seed users, roles, sample data (idempotent)
   ```

> **Tip**: Steps 5–8 are automated by `./start-production.sh`. See Phase 3 below.

---

## Phase 3: Build & Start (10 min)

### Option A — Manual
1. Build the production bundle:
   ```bash
   bun run build
   ```
2. Start the production server (it listens on port 3000):
   ```bash
   bun run start
   ```
3. Or with PM2 (recommended — auto-restart on crash + boot):
   ```bash
   pm2 start "bun run start" --name myfng
   pm2 save
   pm2 startup    # follow the printed instructions to enable auto-start on boot
   ```

### Option B — One-shot (recommended for first deploy)
```bash
chmod +x start-production.sh
./start-production.sh
# Then: pm2 start "bun run start" --name myfng
```

---

## Phase 4: Reverse Proxy & SSL (Caddy — recommended, auto-SSL) (15 min)

Install Caddy:
```bash
sudo apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:
```caddy
gmb.myfng.in {
    reverse_proxy localhost:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
    }
}
```

Reload Caddy — it will automatically provision a Let's Encrypt TLS certificate:
```bash
sudo systemctl reload caddy
```

### Alternative: Nginx + Certbot
If you prefer Nginx, see the [Certbot instructions](https://certbot.eff.org/) and proxy `/` to `http://127.0.0.1:3000`.

---

## Phase 5: Connect Google Business Profile (5 min)

1. Visit `https://gmb.myfng.in`.
2. Login with `admin@myfng.in` / `MyFNG@2025` (or your seeded admin).
3. Go to **Google Integration → Connect Google**.
4. Authorize with the Google account that owns the Business Profiles.
5. Go to **Locations → Add Location → Import from Google**.
6. Select your real locations → **Import**.
7. Click **Sync** on a location — reviews + analytics should populate within ~30s.

---

## Phase 6: Set Up Cron Jobs (5 min)

Open the server crontab (`crontab -e`) and add:

```bash
# Daily drift detection at 2:00 AM server time
0 2 * * * curl -fsS -H "x-cron-secret: YOUR_CRON_SECRET" https://gmb.myfng.in/api/cron/drift-detection

# Full Google sync for all linked locations — every 6 hours
0 */6 * * * curl -fsS -H "x-cron-secret: YOUR_CRON_SECRET" https://gmb.myfng.in/api/cron/sync-all

# Optional: publish scheduled posts every 15 minutes
*/15 * * * * curl -fsS -H "x-cron-secret: YOUR_CRON_SECRET" https://gmb.myfng.in/api/cron/publish-scheduled
```

Replace `YOUR_CRON_SECRET` with the value you set in `.env` (`CRON_SECRET`).

The cron endpoints validate the `x-cron-secret` header against
`process.env.CRON_SECRET` and return `401` if it doesn't match (or if the
secret is unset).

Implemented:
- `/api/cron/drift-detection` — daily profile drift check
- `/api/cron/sync-all` — full Google sync every 6 hours (reviews, posts, photos, analytics, …)

Local / without system crontab:
```bash
npm run cron:sync          # one-shot
npm run cron:sync:loop     # keep running; syncs every 6 hours
```

---

## Phase 7: Post-Deployment Checklist

- [ ] Visit `https://myfng.in` — loads without errors.
- [ ] Login with `admin@myfng.in` / `MyFNG@2025` works.
- [ ] **Google Integration** page shows "Connected".
- [ ] **Locations** list shows your real GBP locations.
- [ ] Sync a location — reviews/analytics populate.
- [ ] Create a test post — publishes to Google.
- [ ] Reply to a test review — appears on Google.
- [ ] **Clients** page shows your self-client with active authorization.
- [ ] **Audit Logs** show your actions.
- [ ] `bun run build` succeeded on the server.
- [ ] PM2 reports the app as `online`: `pm2 status`.

---

## Security Checklist

- [ ] Changed admin password from the default (`MyFNG@2025`).
- [ ] `NEXTAUTH_SECRET` is a random 32-byte string (not the dev default).
- [ ] `TOKEN_ENCRYPTION_KEY` is a random 32-byte (64-hex-char) string.
- [ ] `CRON_SECRET` is a random string.
- [ ] `GOOGLE_REDIRECT_URI` matches your domain exactly (`https://myfng.in/api/google/callback`, no trailing slash).
- [ ] HTTPS is enforced (Caddy auto-SSL or Let's Encrypt).
- [ ] `.env` is **not** world-readable: `chmod 600 .env`.
- [ ] Database backups are scheduled (e.g. `pg_dump myfng_db | gzip > /backup/myfng_$(date +%F).sql.gz`).
- [ ] Hostinger firewall allows only 22, 80, 443.

---

## Troubleshooting

### OAuth `redirect_uri_mismatch`
- Ensure `GOOGLE_REDIRECT_URI` in `.env` **exactly** matches the authorized redirect URI in Google Cloud Console.
- Must include `https://` and **no** trailing slash: `https://myfng.in/api/google/callback`.

### Google API `403 / PERMISSION_DENIED`
- Verify **Google My Business API** and **Business Profile API** are enabled in Google Cloud Console.
- Verify the OAuth consent screen is **published** (not "Testing" mode) for production access.
- Verify the Google account you authorized is an Owner/Manager of the GBP locations you're trying to manage.

### Token refresh fails (`invalid_grant`)
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct (no trailing whitespace).
- The user may have revoked access in their Google Account → re-connect via the Integration page.
- If you rotated `TOKEN_ENCRYPTION_KEY`, all existing encrypted tokens become unreadable. Re-connect Google.

### `TOKEN_ENCRYPTION_KEY not set` warning in logs
- Set a 64-hex-char value (`openssl rand -hex 32`) in `.env`, then restart the app.

### Database connection fails
- Verify `DATABASE_URL` format: `postgresql://user:pass@host:5432/dbname`.
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`.
- Check the database user has `CREATE TABLE` permissions on the database.
- Test the connection: `psql "$DATABASE_URL" -c '\dt'`.

### `bun run build` fails with TypeScript errors
- The codebase builds cleanly under strict TypeScript — `next.config.ts` does **not** suppress type errors.
- To find the real errors, run `bunx tsc --noEmit` and fix the reported files.
- Files in `examples/`, `mini-services/`, `skills/`, and `upload/` are excluded from the Next.js build via `tsconfig.json` so SDK sample code doesn't break production.

### App not starting
- Check PM2 logs: `pm2 logs myfng --lines 100`.
- Verify `.env` exists and `NODE_ENV=production`.
- Verify port 3000 is not already in use: `ss -lntp | grep :3000`.

### Google API quota exceeded
- Check Google Cloud Console → APIs & Services → Quotas for the Business Profile APIs.
- The platform has a built-in 10 QPS rate limiter (`src/lib/google-rate-limit.ts`); if you need to lower it, edit `MAX_QPS`.

---

## Maintenance

### Update the app
```bash
cd /home/myfng/platform
git pull
bun install
bun run db:generate     # if Prisma schema changed
bun run db:push         # if Prisma schema changed
bun run build
pm2 restart myfng
```

### Backup the database
```bash
pg_dump myfng_db | gzip > /home/myfng/backups/myfng_$(date +%F).sql.gz
# Add to crontab for daily backups at 3 AM:
# 0 3 * * * pg_dump myfng_db | gzip > /home/myfng/backups/myfng_$(date +\%F).sql.gz
```

### Restore the database
```bash
gunzip -c /home/myfng/backups/myfng_2025-01-01.sql.gz | psql myfng_db
```

### View application logs
```bash
pm2 logs myfng --lines 200
# Or the raw server log:
tail -f /home/myfng/platform/server.log
```

---

## Support

For issues, check in this order:
1. **PM2 logs**: `pm2 logs myfng --lines 100`
2. **Application logs**: `/home/myfng/platform/server.log`
3. **Browser console** (frontend errors) + **Network tab** (API errors)
4. **Google Cloud Console** → APIs & Services → Quotas & Errors

Contact: **MyFNG IT Team**
