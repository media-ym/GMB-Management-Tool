#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# MyFNG Local AI Manager — Production Setup Script
# Run this AFTER cloning the repo and creating your .env file.
#
#   cp .env.example .env
#   nano .env       # fill in all real values
#   ./start-production.sh
# ═══════════════════════════════════════════════════════════════════════════
set -e

cd "$(dirname "$0")"

echo "=== MyFNG Local AI Manager — Production Setup ==="
echo ""

# ─── 1. Check for .env ───────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "ERROR: .env file not found."
  echo "       Run: cp .env.example .env && nano .env"
  exit 1
fi
echo "[1/7] .env found."

# ─── 2. Check required env vars ──────────────────────────────────────────────
echo "[2/7] Checking required environment variables..."
for var in DATABASE_URL NEXTAUTH_SECRET NEXTAUTH_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TOKEN_ENCRYPTION_KEY CRON_SECRET; do
  value=$(grep "^${var}=" .env | cut -d'=' -f2- | tr -d '"' || true)
  if [ -z "$value" ] || [ "$value" = "" ]; then
    echo "  WARNING: $var is not set (or empty) in .env"
  else
    echo "  OK: $var is set"
  fi
done

# ─── 3. Install dependencies ─────────────────────────────────────────────────
echo ""
echo "[3/7] Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

# ─── 4. Switch to PostgreSQL schema if DATABASE_URL is postgres ──────────────
echo ""
echo "[4/7] Selecting Prisma schema..."
if grep -q '^DATABASE_URL="postgres' .env; then
  echo "  DATABASE_URL is PostgreSQL — copying prisma/schema.postgresql.prisma → prisma/schema.prisma"
  cp prisma/schema.postgresql.prisma prisma/schema.prisma
else
  echo "  DATABASE_URL is not PostgreSQL — keeping existing prisma/schema.prisma (SQLite)."
fi

# ─── 5. Generate Prisma client ───────────────────────────────────────────────
echo ""
echo "[5/7] Generating Prisma client..."
bun run db:generate

# ─── 6. Push schema to database ──────────────────────────────────────────────
echo ""
echo "[6/7] Pushing schema to database..."
bun run db:push

# Seed initial data (idempotent — safe to re-run)
echo "  Seeding initial data..."
bunx tsx prisma/seed.ts || echo "  (seed skipped or already applied)"

# ─── 7. Build production bundle ──────────────────────────────────────────────
echo ""
echo "[7/7] Building production bundle..."
bun run build

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Start the server directly:    bun run start"
echo "  2. Or with PM2 (recommended):    pm2 start \"bun run start\" --name myfng"
echo "                                  pm2 save && pm2 startup"
echo "  3. Configure your reverse proxy (Caddy/Nginx) to forward to port 3000."
echo "  4. Visit your domain and login with admin@myfng.in / MyFNG@2025"
echo "  5. Go to Google Integration → Connect Google to authorize real GBP locations."
echo ""
