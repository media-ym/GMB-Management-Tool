import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  DIRECTORY_PLATFORMS,
  getDirectoryPlatform,
  isDirectoryStatus,
  type DirectoryStatus,
} from "@/lib/directory-platforms";

export const dynamic = "force-dynamic";

type PresenceRow = {
  platformId: string;
  status: DirectoryStatus;
  listingUrl: string | null;
  notes: string | null;
  lastCheckedAt: string | null;
  autoDetected: boolean;
};

// GET /api/directories — listings × platforms matrix + stats
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const url = new URL(req.url);
  const locationIdsParam = url.searchParams.get("locationIds");
  const requestedIds = locationIdsParam
    ? locationIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const scoped = scopeLocationIds(user);
  let idsFilter: string[] | undefined;
  if (scoped && requestedIds) {
    idsFilter = requestedIds.filter((id) => scoped.includes(id));
  } else if (scoped) {
    idsFilter = scoped;
  } else if (requestedIds) {
    idsFilter = requestedIds;
  }

  const locations = await db.location.findMany({
    where: idsFilter ? { id: { in: idsFilter } } : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      phone: true,
      website: true,
      status: true,
      googleProfiles: {
        take: 1,
        select: {
          mapUrl: true,
          googleLocationId: true,
          verificationState: true,
          profileStatus: true,
        },
      },
      directoryPresences: true,
    },
  });

  const platforms = DIRECTORY_PLATFORMS.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    autoFromGoogle: !!p.autoFromGoogle,
    unavailableByDefault: !!p.unavailableByDefault,
  }));

  const listings = locations.map((loc) => {
    const gbp = loc.googleProfiles[0] ?? null;
    const stored = new Map(loc.directoryPresences.map((d) => [d.platformId, d]));

    const directories: PresenceRow[] = DIRECTORY_PLATFORMS.map((p) => {
      const row = stored.get(p.id);
      if (row) {
        return {
          platformId: p.id,
          status: (isDirectoryStatus(row.status) ? row.status : "unlinked") as DirectoryStatus,
          listingUrl: row.listingUrl,
          notes: row.notes,
          lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
          autoDetected: false,
        };
      }

      // Auto-detect Google presence from linked GBP
      if (p.autoFromGoogle && gbp) {
        return {
          platformId: p.id,
          status: "linked" as const,
          listingUrl: p.id === "google_maps" || p.id === "gbp" ? gbp.mapUrl : null,
          notes: "Auto-detected from Google Business Profile",
          lastCheckedAt: null,
          autoDetected: true,
        };
      }

      if (p.unavailableByDefault) {
        return {
          platformId: p.id,
          status: "unavailable" as const,
          listingUrl: null,
          notes: null,
          lastCheckedAt: null,
          autoDetected: false,
        };
      }

      return {
        platformId: p.id,
        status: "unlinked" as const,
        listingUrl: null,
        notes: null,
        lastCheckedAt: null,
        autoDetected: false,
      };
    });

    const linkedCount = directories.filter((d) => d.status === "linked").length;
    const coverage = Math.round((linkedCount / DIRECTORY_PLATFORMS.length) * 100);

    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      address: loc.address,
      phone: loc.phone,
      website: loc.website,
      status: loc.status,
      googleLinked: !!gbp,
      verificationState: gbp?.verificationState ?? null,
      mapUrl: gbp?.mapUrl ?? null,
      coverage,
      directories,
    };
  });

  const allCells = listings.flatMap((l) => l.directories);
  const stats = {
    linked: allCells.filter((d) => d.status === "linked").length,
    processing: allCells.filter((d) => d.status === "processing").length,
    unlinked: allCells.filter((d) => d.status === "unlinked").length,
    errors: allCells.filter((d) => d.status === "error").length,
    unavailable: allCells.filter((d) => d.status === "unavailable").length,
    totalCells: allCells.length,
    platformCount: DIRECTORY_PLATFORMS.length,
    locationCount: listings.length,
    coverage:
      allCells.length > 0
        ? Math.round((allCells.filter((d) => d.status === "linked").length / allCells.length) * 100)
        : 0,
  };

  const platformSummary = DIRECTORY_PLATFORMS.map((p) => {
    const cells = listings.map((l) => l.directories.find((d) => d.platformId === p.id)!);
    const linked = cells.filter((c) => c.status === "linked").length;
    return {
      platformId: p.id,
      name: p.name,
      shortName: p.shortName,
      linkedCount: linked,
      totalCount: cells.length,
      status:
        linked === cells.length && cells.length > 0
          ? ("linked" as const)
          : linked > 0
            ? ("processing" as const)
            : ("unlinked" as const),
    };
  });

  return ok(
    { platforms, listings, stats, platformSummary },
    `Loaded directory coverage for ${listings.length} location(s).`,
  );
}

// POST /api/directories — upsert presence, sync Google, or bulk-status
// Body:
//  { action: "upsert", locationId, platformId, status, listingUrl?, notes? }
//  { action: "sync-google" }
//  { action: "bulk-status", platformId, status, locationIds?, onlyUnlinked? }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage") && !can(user.role, "system.sync")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "upsert");

  if (action === "bulk-status") {
    const platformId = String(body.platformId ?? "");
    const status = String(body.status ?? "processing");
    const onlyUnlinked = body.onlyUnlinked !== false;
    if (!getDirectoryPlatform(platformId)) {
      return fail(`Unknown platformId: ${platformId}`, 400);
    }
    if (!isDirectoryStatus(status)) {
      return fail("status must be linked | processing | unlinked | error | unavailable.", 400);
    }

    const scoped = scopeLocationIds(user);
    const requested = Array.isArray(body.locationIds)
      ? (body.locationIds as string[]).filter(Boolean)
      : null;
    let ids: string[] | undefined;
    if (scoped && requested) ids = requested.filter((id) => scoped.includes(id));
    else if (scoped) ids = scoped;
    else if (requested) ids = requested;

    const locations = await db.location.findMany({
      where: ids ? { id: { in: ids } } : undefined,
      select: {
        id: true,
        directoryPresences: { where: { platformId }, take: 1 },
      },
    });

    let updated = 0;
    for (const loc of locations) {
      const existing = loc.directoryPresences[0];
      if (onlyUnlinked && existing && existing.status === "linked") continue;
      await db.directoryPresence.upsert({
        where: { locationId_platformId: { locationId: loc.id, platformId } },
        create: {
          locationId: loc.id,
          platformId,
          status,
          notes: status === "processing" ? "Claim / import started on Bing Places" : null,
          lastCheckedAt: new Date(),
        },
        update: {
          status,
          notes: status === "processing" ? "Claim / import started on Bing Places" : undefined,
          lastCheckedAt: new Date(),
        },
      });
      updated++;
    }

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "directories.bulk_status",
      entity: "directory_presence",
      newValue: { platformId, status, updated },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok(
      { updated, platformId, status },
      `Marked ${updated} location(s) as ${status} on ${getDirectoryPlatform(platformId)?.name ?? platformId}.`,
    );
  }

  if (action === "sync-google") {
    const scoped = scopeLocationIds(user);
    const locations = await db.location.findMany({
      where: scoped ? { id: { in: scoped } } : undefined,
      select: {
        id: true,
        googleProfiles: { take: 1, select: { mapUrl: true } },
      },
    });

    let upserted = 0;
    for (const loc of locations) {
      const gbp = loc.googleProfiles[0];
      if (!gbp) continue;
      for (const platformId of ["gbp", "google_maps"] as const) {
        await db.directoryPresence.upsert({
          where: { locationId_platformId: { locationId: loc.id, platformId } },
          create: {
            locationId: loc.id,
            platformId,
            status: "linked",
            listingUrl: gbp.mapUrl,
            notes: "Synced from Google Business Profile",
            lastCheckedAt: new Date(),
          },
          update: {
            status: "linked",
            listingUrl: gbp.mapUrl ?? undefined,
            notes: "Synced from Google Business Profile",
            lastCheckedAt: new Date(),
          },
        });
        upserted++;
      }
    }

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "directories.sync_google",
      entity: "directory_presence",
      newValue: { upserted },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok({ upserted }, `Synced Google directory links for ${upserted / 2} location(s).`);
  }

  const locationId = String(body.locationId ?? "");
  const platformId = String(body.platformId ?? "");
  const status = String(body.status ?? "linked");
  const listingUrl =
    typeof body.listingUrl === "string" && body.listingUrl.trim()
      ? body.listingUrl.trim()
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!locationId || !platformId) {
    return fail("locationId and platformId are required.", 400);
  }
  if (!getDirectoryPlatform(platformId)) {
    return fail(`Unknown platformId: ${platformId}`, 400);
  }
  if (!isDirectoryStatus(status)) {
    return fail("status must be linked | processing | unlinked | error | unavailable.", 400);
  }

  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  const location = await db.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } });
  if (!location) return fail("Location not found.", 404);

  const row = await db.directoryPresence.upsert({
    where: { locationId_platformId: { locationId, platformId } },
    create: {
      locationId,
      platformId,
      status,
      listingUrl,
      notes,
      lastCheckedAt: new Date(),
    },
    update: {
      status,
      listingUrl,
      notes,
      lastCheckedAt: new Date(),
    },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "directories.upsert",
    entity: "directory_presence",
    entityId: row.id,
    newValue: { locationId, platformId, status, listingUrl },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      id: row.id,
      locationId: row.locationId,
      platformId: row.platformId,
      status: row.status,
      listingUrl: row.listingUrl,
      notes: row.notes,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    },
    `Updated ${getDirectoryPlatform(platformId)?.name ?? platformId} for "${location.name}".`,
  );
}
