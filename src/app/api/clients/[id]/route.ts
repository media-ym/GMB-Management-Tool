import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getPortalCredentialsByClientId } from "@/lib/portal-link";

export const dynamic = "force-dynamic";

// GET /api/clients/[id] — client detail with locations, active authorizations, stats.
// Admin-only (settings.view).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: {
      authorizations: { orderBy: { grantedAt: "desc" } },
      locations: {
        select: {
          id: true,
          name: true,
          city: true,
          status: true,
          syncStatus: true,
          reviewCount: true,
          avgRating: true,
        },
        orderBy: { city: "asc" },
      },
    },
  });
  if (!client) return notFound("Client not found");

  const locationIds = client.locations.map((l) => l.id);

  const [totalReviews, totalPosts, totalPhotos] = await Promise.all([
    locationIds.length
      ? db.review.count({ where: { locationId: { in: locationIds } } })
      : 0,
    locationIds.length
      ? db.post.count({ where: { locationId: { in: locationIds } } })
      : 0,
    locationIds.length
      ? db.businessPhoto.count({ where: { locationId: { in: locationIds } } })
      : 0,
  ]);

  const authorizations = client.authorizations.map((a) => {
    let scopes: string[] = [];
    if (a.authorizedScopes) {
      try {
        scopes = JSON.parse(a.authorizedScopes) as string[];
      } catch {
        scopes = [];
      }
    }
    return {
      id: a.id,
      status: a.status,
      grantedAt: a.grantedAt.toISOString(),
      revokedAt: a.revokedAt?.toISOString() ?? null,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      grantedByUserId: a.grantedByUserId,
      authorizationDoc: a.authorizationDoc,
      notes: a.notes,
      scopes,
    };
  });

  const portalCreds = await getPortalCredentialsByClientId(client.id);

  return ok({
    id: client.id,
    clientCode: client.clientCode,
    name: client.name,
    legalName: client.legalName,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contactPhone: client.contactPhone,
    status: client.status,
    notes: client.notes,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    locations: client.locations.map((l) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      status: l.status,
      syncStatus: l.syncStatus,
      reviewCount: l.reviewCount,
      avgRating: l.avgRating,
    })),
    authorizations,
    stats: { totalReviews, totalPosts, totalPhotos, totalLocations: client.locations.length },
    portalLogin: portalCreds
      ? {
          userId: portalCreds.userId,
          email: portalCreds.loginEmail,
          temporaryPassword: portalCreds.temporaryPassword,
          mustChangePassword: portalCreds.mustChangePassword,
        }
      : null,
  });
}

// PATCH /api/clients/[id] — update client fields.
// Admin-only (settings.manage).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage")) return forbidden();

  const { id } = await params;
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) return notFound("Client not found");

  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {};
  const fields = ["name", "legalName", "contactName", "contactEmail", "contactPhone", "clientCode", "notes", "status"];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  if (allowed.name !== undefined && (!allowed.name || !String(allowed.name).trim())) {
    return fail("Client name cannot be empty");
  }
  if (allowed.clientCode !== undefined && allowed.clientCode && String(allowed.clientCode).trim()) {
    const dup = await db.client.findFirst({
      where: { clientCode: String(allowed.clientCode).trim(), NOT: { id } },
    });
    if (dup) return fail("Client code already exists. Use a unique code.");
  }
  if (allowed.status !== undefined) {
    const validStatuses = ["active", "paused", "terminated"];
    if (!validStatuses.includes(String(allowed.status))) {
      return fail(`status must be one of: ${validStatuses.join(", ")}`);
    }
  }

  const updated = await db.client.update({ where: { id }, data: allowed });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "client.update",
    entity: "client",
    entityId: id,
    previousValue: existing,
    newValue: allowed,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      id: updated.id,
      name: updated.name,
      clientCode: updated.clientCode,
      status: updated.status,
    },
    "Client updated",
  );
}

// DELETE /api/clients/[id] — terminate client (soft-delete: status=terminated, revoke all auths).
// Per Google Third-Party Policy, the client record must be retained for audit.
// Admin-only (settings.manage).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage")) return forbidden();

  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { authorizations: true },
  });
  if (!client) return notFound("Client not found");

  const now = new Date();

  // Revoke ALL authorizations for this client (active → revoked).
  const activeAuths = client.authorizations.filter((a) => a.status === "active");
  if (activeAuths.length > 0) {
    await db.clientAuthorization.updateMany({
      where: { clientId: id, status: "active" },
      data: { status: "revoked", revokedAt: now },
    });
  }

  // Mark the client as terminated. We intentionally do NOT delete the row —
  // Google's Third-Party Policy requires retaining authorization records for
  // audit. Use the export endpoint to download the full record before
  // termination if needed for off-platform archival.
  const updated = await db.client.update({
    where: { id },
    data: { status: "terminated" },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "client.terminate",
    entity: "client",
    entityId: id,
    previousValue: { status: client.status, activeAuthCount: activeAuths.length },
    newValue: {
      status: "terminated",
      revokedAuthCount: activeAuths.length,
      revokedAt: now.toISOString(),
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      id: updated.id,
      status: updated.status,
      revokedAuthorizations: activeAuths.length,
      exportAvailable: true,
    },
    `Client "${updated.name}" terminated. ${activeAuths.length} authorization(s) revoked. ` +
      `The client record has been retained for audit. Use /api/clients/${id}/export to download all client data before archival.`,
  );
}
