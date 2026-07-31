import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { encryptToken, decryptToken } from "@/lib/token-crypto";

/**
 * Portal user ↔ Client mapping.
 * Lives in ClientPortalLink because the app DB role cannot ALTER "User"
 * (table owner is postgres on this self-hosted Supabase).
 */

export type PortalCredentials = {
  userId: string;
  clientId: string;
  loginEmail: string | null;
  temporaryPassword: string | null;
  mustChangePassword: boolean;
};

export async function ensurePortalLinkTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ClientPortalLink" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "clientId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ClientPortalLink_clientId_idx" ON "ClientPortalLink"("clientId")`,
  );
  // Credentials columns (added after initial table) — safe to re-run
  await db.$executeRawUnsafe(
    `ALTER TABLE "ClientPortalLink" ADD COLUMN IF NOT EXISTS "loginEmail" TEXT`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "ClientPortalLink" ADD COLUMN IF NOT EXISTS "tempPasswordEnc" TEXT`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "ClientPortalLink" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT true`,
  );
}

export async function getClientIdForUser(userId: string): Promise<string | null> {
  try {
    const rows = await db.$queryRawUnsafe<{ clientId: string }[]>(
      `SELECT "clientId" FROM "ClientPortalLink" WHERE "userId" = $1 LIMIT 1`,
      userId,
    );
    return rows[0]?.clientId ?? null;
  } catch {
    return null;
  }
}

export async function setPortalLink(userId: string, clientId: string): Promise<void> {
  await ensurePortalLinkTable();
  const existing = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "ClientPortalLink" WHERE "userId" = $1 LIMIT 1`,
    userId,
  );
  if (existing[0]) {
    await db.$executeRawUnsafe(
      `UPDATE "ClientPortalLink" SET "clientId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2`,
      clientId,
      userId,
    );
  } else {
    await db.$executeRawUnsafe(
      `INSERT INTO "ClientPortalLink" ("id", "userId", "clientId") VALUES ($1, $2, $3)`,
      randomUUID(),
      userId,
      clientId,
    );
  }

  try {
    await db.$executeRawUnsafe(
      `UPDATE "User" SET "clientId" = $1 WHERE "id" = $2`,
      clientId,
      userId,
    );
  } catch {
    /* column may not exist yet */
  }
}

/** Store login email + temporary password (encrypted) for admin + client visibility. */
export async function setPortalCredentials(
  userId: string,
  clientId: string,
  loginEmail: string,
  temporaryPassword: string,
): Promise<void> {
  await setPortalLink(userId, clientId);
  const enc = encryptToken(temporaryPassword);
  await db.$executeRawUnsafe(
    `UPDATE "ClientPortalLink"
     SET "loginEmail" = $1,
         "tempPasswordEnc" = $2,
         "mustChangePassword" = true,
         "updatedAt" = CURRENT_TIMESTAMP
     WHERE "userId" = $3`,
    loginEmail.trim().toLowerCase(),
    enc,
    userId,
  );
}

async function rowToCredentials(row: {
  userId: string;
  clientId: string;
  loginEmail: string | null;
  tempPasswordEnc: string | null;
  mustChangePassword: boolean;
} | undefined): Promise<PortalCredentials | null> {
  if (!row) return null;
  return {
    userId: row.userId,
    clientId: row.clientId,
    loginEmail: row.loginEmail,
    temporaryPassword: decryptToken(row.tempPasswordEnc),
    mustChangePassword: !!row.mustChangePassword,
  };
}

export async function getPortalCredentialsByClientId(
  clientId: string,
): Promise<PortalCredentials | null> {
  try {
    await ensurePortalLinkTable();
    const rows = await db.$queryRawUnsafe<
      {
        userId: string;
        clientId: string;
        loginEmail: string | null;
        tempPasswordEnc: string | null;
        mustChangePassword: boolean;
      }[]
    >(
      `SELECT "userId", "clientId", "loginEmail", "tempPasswordEnc", "mustChangePassword"
       FROM "ClientPortalLink" WHERE "clientId" = $1 ORDER BY "updatedAt" DESC LIMIT 1`,
      clientId,
    );
    return rowToCredentials(rows[0]);
  } catch {
    return null;
  }
}

export async function getPortalCredentialsByUserId(
  userId: string,
): Promise<PortalCredentials | null> {
  try {
    await ensurePortalLinkTable();
    const rows = await db.$queryRawUnsafe<
      {
        userId: string;
        clientId: string;
        loginEmail: string | null;
        tempPasswordEnc: string | null;
        mustChangePassword: boolean;
      }[]
    >(
      `SELECT "userId", "clientId", "loginEmail", "tempPasswordEnc", "mustChangePassword"
       FROM "ClientPortalLink" WHERE "userId" = $1 LIMIT 1`,
      userId,
    );
    return rowToCredentials(rows[0]);
  } catch {
    return null;
  }
}

/** Clear stored temp password after the client sets their own password. */
export async function clearPortalTempPassword(userId: string): Promise<void> {
  try {
    await ensurePortalLinkTable();
    await db.$executeRawUnsafe(
      `UPDATE "ClientPortalLink"
       SET "tempPasswordEnc" = NULL,
           "mustChangePassword" = false,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "userId" = $1`,
      userId,
    );
  } catch {
    /* ignore */
  }
}
