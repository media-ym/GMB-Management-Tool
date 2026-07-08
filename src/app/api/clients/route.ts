import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { DEFAULT_SCOPES } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

// GET /api/clients — list all clients with location count + active authorization status.
// Admin-only (settings.view).
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const clients = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { locations: true, authorizations: true } },
      authorizations: {
        where: { status: "active" },
        orderBy: { grantedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          grantedAt: true,
          expiresAt: true,
          authorizedScopes: true,
        },
      },
    },
  });

  const data = clients.map((c) => {
    const activeAuth = c.authorizations[0];
    let scopes: string[] = [];
    if (activeAuth?.authorizedScopes) {
      try {
        scopes = JSON.parse(activeAuth.authorizedScopes) as string[];
      } catch {
        scopes = [];
      }
    }
    // An active authorization is considered "valid" if it has no expiry or
    // its expiry is in the future.
    const now = new Date();
    const authValid =
      !!activeAuth &&
      (!activeAuth.expiresAt || new Date(activeAuth.expiresAt) > now);

    return {
      id: c.id,
      clientCode: c.clientCode,
      name: c.name,
      legalName: c.legalName,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      status: c.status,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      locationCount: c._count.locations,
      authorizationCount: c._count.authorizations,
      authorization: activeAuth
        ? {
            id: activeAuth.id,
            status: activeAuth.status,
            grantedAt: activeAuth.grantedAt.toISOString(),
            expiresAt: activeAuth.expiresAt?.toISOString() ?? null,
            scopes,
            valid: authValid,
          }
        : null,
    };
  });

  return ok(data);
}

// POST /api/clients — create a new client.
// Admin-only (settings.manage).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage")) {
    return forbidden("Only admins can create clients.");
  }

  const body = await req.json().catch(() => ({}));
  const {
    name,
    legalName,
    contactName,
    contactEmail,
    contactPhone,
    clientCode,
    notes,
  } = body ?? {};

  if (!name || !String(name).trim()) {
    return fail("Client name is required");
  }

  // Unique clientCode check (if provided)
  if (clientCode && String(clientCode).trim()) {
    const existing = await db.client.findFirst({
      where: { clientCode: String(clientCode).trim() },
    });
    if (existing) {
      return fail("Client code already exists. Use a unique code.");
    }
  }

  const client = await db.client.create({
    data: {
      name: String(name).trim(),
      legalName: legalName ? String(legalName).trim() : null,
      contactName: contactName ? String(contactName).trim() : null,
      contactEmail: contactEmail ? String(contactEmail).trim() : null,
      contactPhone: contactPhone ? String(contactPhone).trim() : null,
      clientCode: clientCode ? String(clientCode).trim() : null,
      notes: notes ? String(notes) : null,
      status: "active",
    },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "client.create",
    entity: "client",
    entityId: client.id,
    newValue: {
      name: client.name,
      clientCode: client.clientCode,
      defaultScopes: DEFAULT_SCOPES,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      id: client.id,
      name: client.name,
      clientCode: client.clientCode,
      status: client.status,
    },
    `Client "${client.name}" created. Grant authorization before managing their Google Business Profile.`,
  );
}
