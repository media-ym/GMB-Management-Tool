import { db } from "@/lib/db";
import { syncLocationFull } from "@/lib/google-service";
import { logAudit } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

let syncRunning = false;

export function isFullSyncRunning(): boolean {
  return syncRunning;
}

/** Background full Google sync — avoids HTTP timeout / HTML 504 on long runs. */
export async function runFullSyncInBackground(opts: {
  user: SessionUser;
  locationIds?: string[];
  ip?: string;
}): Promise<{ locations: number; errors: string[] }> {
  if (syncRunning) {
    return { locations: 0, errors: ["Sync already in progress"] };
  }
  syncRunning = true;
  const errors: string[] = [];
  const syncResults: Record<string, unknown> = {};

  try {
    const where = opts.locationIds?.length ? { id: { in: opts.locationIds } } : {};
    const locations = await db.location.findMany({
      where,
      select: { id: true, name: true, googleProfiles: { select: { googleLocationId: true } } },
    });

    const linked = locations.filter((loc) => loc.googleProfiles?.[0]);
    const unlinked = locations.filter((loc) => !loc.googleProfiles?.[0]);

    if (unlinked.length) {
      await db.location.updateMany({
        where: { id: { in: unlinked.map((l) => l.id) } },
        data: { syncStatus: "synced", lastSyncedAt: new Date() },
      });
    }

    const BATCH = 4;
    for (let i = 0; i < linked.length; i += BATCH) {
      const batch = linked.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (loc) => {
          try {
            const result = await syncLocationFull(loc.id);
            syncResults[loc.name] = result.synced;
            if (result.errors.length > 0) errors.push(`${loc.name}: ${result.errors.join(", ")}`);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Sync failed";
            errors.push(`${loc.name}: ${msg}`);
          }
        }),
      );
    }

    await logAudit({
      userId: opts.user.id,
      userName: opts.user.name,
      action: "sync.run",
      entity: "location",
      newValue: {
        locationIds: opts.locationIds ?? "all",
        locationsSynced: locations.length,
        syncResults,
        errors: errors.length,
        background: true,
      },
      ip: opts.ip,
    });

    return { locations: locations.length, errors };
  } finally {
    syncRunning = false;
  }
}
