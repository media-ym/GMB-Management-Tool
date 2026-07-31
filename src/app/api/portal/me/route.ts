import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/portal/me — portal session + client + google + locations */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "client_portal" || !user.clientId) {
    return forbidden("Client portal access only");
  }

  const client = await db.client.findUnique({
    where: { id: user.clientId },
    include: {
      _count: { select: { locations: true } },
      authorizations: {
        where: { status: "active" },
        orderBy: { grantedAt: "desc" },
        take: 1,
      },
      locations: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          city: true,
          status: true,
          avgRating: true,
          reviewCount: true,
          syncStatus: true,
          lastSyncedAt: true,
          googleProfiles: {
            select: { profileName: true, verificationState: true, mapUrl: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!client) return forbidden("Client record not found");

  const googleAccount = await db.googleAccount.findFirst({
    where: { clientId: client.id, status: "active" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      email: true,
      status: true,
      tokenExpiry: true,
      updatedAt: true,
    },
  });

  const auth = client.authorizations[0];

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    },
    client: {
      id: client.id,
      name: client.name,
      clientCode: client.clientCode,
      status: client.status,
      contactEmail: client.contactEmail,
      locationCount: client._count.locations,
    },
    google: googleAccount
      ? {
          connected: true,
          email: googleAccount.email,
          status: googleAccount.status,
          tokenExpiry: googleAccount.tokenExpiry?.toISOString() ?? null,
          connectedAt: googleAccount.updatedAt.toISOString(),
        }
      : { connected: false },
    authorization: auth
      ? {
          id: auth.id,
          status: auth.status,
          grantedAt: auth.grantedAt.toISOString(),
          expiresAt: auth.expiresAt?.toISOString() ?? null,
        }
      : null,
    locations: client.locations.map((l) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      status: l.status,
      avgRating: l.avgRating,
      reviewCount: l.reviewCount,
      syncStatus: l.syncStatus,
      lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
      profileName: l.googleProfiles[0]?.profileName ?? l.name,
      verificationState: l.googleProfiles[0]?.verificationState ?? null,
      mapUrl: l.googleProfiles[0]?.mapUrl ?? null,
    })),
  });
}
