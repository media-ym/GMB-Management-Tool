#!/usr/bin/env node
/**
 * Create Supabase Auth users and link them to Prisma `User.authId`.
 *
 * Prerequisites:
 *   - DATABASE_URL → self-hosted Supabase Postgres
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - Prisma schema pushed (`npx prisma db push`)
 *   - App users seeded (`npx tsx prisma/seed.ts`) OR existing User rows
 *
 * Usage:
 *   node scripts/supabase-bootstrap-users.mjs
 *   SEED_PASSWORD='MyFNG@2025' node scripts/supabase-bootstrap-users.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();
const password = process.env.SEED_PASSWORD || "MyFNG@2025";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new PrismaClient();

const DEFAULT_EMAILS = [
  "admin@myfng.in",
  "marketing@myfng.in",
  "thane@myfng.in",
  "support@myfng.in",
  "viewer@myfng.in",
];

async function ensureAuthUser(email, name, role) {
  const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  const existing = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { name, role, full_name: name },
    });
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, full_name: name },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const users = await db.user.findMany({
    where: { email: { in: DEFAULT_EMAILS } },
    select: { id: true, email: true, name: true, role: true, authId: true },
  });

  if (users.length === 0) {
    console.error("No seed users found in public.User — run: npx tsx prisma/seed.ts");
    process.exit(1);
  }

  for (const user of users) {
    const authId = await ensureAuthUser(user.email, user.name, user.role);
    if (user.authId !== authId) {
      await db.user.update({
        where: { id: user.id },
        data: { authId, status: "active", password: null },
      });
    }
    console.log(`✓ ${user.email} → authId=${authId}`);
  }

  console.log(`\nDone. Login with password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
