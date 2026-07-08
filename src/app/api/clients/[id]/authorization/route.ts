import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { DEFAULT_SCOPES } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

// POST /api/clients/[id]/authorization — grant a new authorization.
// Body: { authorizedScopes?: string[], expiresAt?: string, authorizationDoc?: string, notes?: string }
// If no scopes are provided, DEFAULT_SCOPES is used.
// Admin-only (settings.manage).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage")) return forbidden();

  const { id } = await params;
  const client = await db.client.findUnique({ where: { id } });
  if (!client) return notFound("Client not found");

  if (client.status === "terminated") {
    return fail("Cannot grant authorization to a terminated client");
  }

  const body = await req.json().catch(() => ({}));
  const { authorizedScopes, expiresAt, authorizationDoc, notes } = body ?? {};

  // Resolve scopes — fall back to DEFAULT_SCOPES if caller omits them.
  let scopes: string[] = DEFAULT_SCOPES;
  if (Array.isArray(authorizedScopes)) {
    if (authorizedScopes.length === 0) {
      return fail("authorizedScopes cannot be empty — pass at least one scope or omit to use defaults");
    }
    const invalid = authorizedScopes.filter((s: unknown) => typeof s !== "string" || !s.trim());
    if (invalid.length > 0) {
      return fail("All authorizedScopes entries must be non-empty strings");
    }
    scopes = authorizedScopes.map((s: string) => s.trim());
  }

  // Validate expiresAt if provided.
  let expiresAtDate: Date | null = null;
  if (expiresAt !== undefined && expiresAt !== null) {
    const parsed = new Date(expiresAt);
    if (isNaN(parsed.getTime())) {
      return fail("expiresAt must be a valid ISO date string");
    }
    if (parsed <= new Date()) {
      return fail("expiresAt must be in the future");
    }
    expiresAtDate = parsed;
  }

  // Create the new authorization. The previous active authorization (if any)
  // is left in place — it remains queryable for audit history, but
  // requireClientAuth orders by grantedAt DESC, so the newest one wins.
  const auth = await db.clientAuthorization.create({
    data: {
      clientId: id,
      authorizedScopes: JSON.stringify(scopes),
      status: "active",
      expiresAt: expiresAtDate,
      grantedByUserId: user.id,
      authorizationDoc: authorizationDoc ? String(authorizationDoc) : null,
      notes: notes ? String(notes) : null,
    },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "client.authorization_granted",
    entity: "client_authorization",
    entityId: auth.id,
    newValue: {
      clientId: id,
      clientName: client.name,
      scopes,
      expiresAt: expiresAtDate?.toISOString() ?? null,
      authorizationDoc: auth.authorizationDoc,
      grantedByUserId: user.id,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      id: auth.id,
      clientId: id,
      status: auth.status,
      scopes,
      grantedAt: auth.grantedAt.toISOString(),
      expiresAt: auth.expiresAt?.toISOString() ?? null,
    },
    `Authorization granted to "${client.name}" with ${scopes.length} scope(s).`,
  );
}

// PATCH /api/clients/[id]/authorization — revoke an authorization.
// Body: { authorizationId: string }
// Sets status=revoked + revokedAt=now on the specified authorization.
// Admin-only (settings.manage).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage")) return forbidden();

  const { id } = await params;
  const client = await db.client.findUnique({ where: { id } });
  if (!client) return notFound("Client not found");

  const body = await req.json().catch(() => ({}));
  const { authorizationId } = body ?? {};
  if (!authorizationId || typeof authorizationId !== "string") {
    return fail("authorizationId is required");
  }

  const auth = await db.clientAuthorization.findUnique({
    where: { id: authorizationId },
  });
  if (!auth || auth.clientId !== id) {
    return notFound("Authorization not found for this client");
  }

  if (auth.status === "revoked") {
    return fail("Authorization is already revoked");
  }

  const now = new Date();
  const updated = await db.clientAuthorization.update({
    where: { id: authorizationId },
    data: { status: "revoked", revokedAt: now },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "client.authorization_revoked",
    entity: "client_authorization",
    entityId: authorizationId,
    previousValue: { status: auth.status, scopes: auth.authorizedScopes },
    newValue: {
      clientId: id,
      clientName: client.name,
      status: "revoked",
      revokedAt: now.toISOString(),
      revokedByUserId: user.id,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      id: updated.id,
      clientId: id,
      status: updated.status,
      revokedAt: updated.revokedAt?.toISOString() ?? null,
    },
    `Authorization revoked for "${client.name}". All GBP write operations for this client will now be blocked.`,
  );
}
