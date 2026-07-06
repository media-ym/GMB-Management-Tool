# ═══════════════════════════════════════════════════════════════════════════
# MyFNG Local AI Manager — Dockerfile for Hostinger Deployment
# ═══════════════════════════════════════════════════════════════════════════

FROM oven/bun:1.1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN bun run db:generate

# Build the Next.js app
ENV NODE_ENV=production
RUN bun run build

# ─── Production image ─────────────────────────────────────────────────────
FROM oven/bun:1.1 AS production
WORKDIR /app

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start
CMD ["bun", "run", "start"]
