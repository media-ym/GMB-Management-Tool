import { db } from "./db";

/**
 * Default scopes granted when a new client authorization is created without
 * an explicit scope list. Aligned with the scopes used by the existing GBP
 * write operations (review reply, post CRUD, profile update, analytics sync,
 * media upload/delete).
 */
export const DEFAULT_SCOPES = [
  "review.reply",
  "post.create",
  "post.update",
  "post.delete",
  "profile.update",
  "analytics.sync",
  "media.upload",
  "media.delete",
];

export interface AuthCheckResult {
  authorized: boolean;
  clientId: string | null;
  reason?: string;
}

/**
 * Check if a location's client has authorized a specific scope.
 *
 * Returns authorized=true if:
 *   - the location has no clientId (self-managed — always allowed)
 *   - OR the linked client has an active authorization with the requested
 *     scope present in its `authorizedScopes` JSON array, and that
 *     authorization has not been revoked and is not past its expiry.
 *
 * The check is read-only and safe to call before any GBP write.
 */
export async function checkClientAuthorization(
  locationId: string,
  scope: string,
): Promise<AuthCheckResult> {
  const location = await db.location.findUnique({
    where: { id: locationId },
    select: { clientId: true },
  });
  if (!location) {
    return { authorized: false, clientId: null, reason: "Location not found" };
  }
  // Self-managed location — no end-client authorization required.
  if (!location.clientId) {
    return { authorized: true, clientId: null };
  }

  const auth = await db.clientAuthorization.findFirst({
    where: {
      clientId: location.clientId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { grantedAt: "desc" },
  });

  if (!auth) {
    return {
      authorized: false,
      clientId: location.clientId,
      reason: "No active authorization on record for this client",
    };
  }

  let scopes: string[] = [];
  if (auth.authorizedScopes) {
    try {
      scopes = JSON.parse(auth.authorizedScopes) as string[];
    } catch {
      scopes = [];
    }
  }
  if (!scopes.includes(scope)) {
    return {
      authorized: false,
      clientId: location.clientId,
      reason: `Scope '${scope}' not authorized`,
    };
  }

  return { authorized: true, clientId: location.clientId };
}

/**
 * Convenience wrapper that returns either an "ok" discriminator (with the
 * resolved clientId) or a ready-to-return 403 Response carrying a clear,
 * user-facing reason. GBP write routes can short-circuit by returning
 * `result.response` directly when `!result.ok`.
 */
export async function requireClientAuth(
  locationId: string,
  scope: string,
): Promise<
  | { ok: true; clientId: string | null }
  | { ok: false; response: Response }
> {
  const result = await checkClientAuthorization(locationId, scope);
  if (result.authorized) {
    return { ok: true, clientId: result.clientId };
  }
  const body = JSON.stringify({
    success: false,
    message: `Client authorization required: ${result.reason || "not authorized"}`,
    data: { clientId: result.clientId, scope, requiredScope: scope },
    errors: null,
    timestamp: new Date().toISOString(),
  });
  return {
    ok: false,
    response: new Response(body, {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  };
}
