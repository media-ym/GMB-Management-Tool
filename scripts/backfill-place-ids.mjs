/**
 * Backfill Google Place IDs onto GoogleBusinessProfile rows.
 * Run: npx tsx scripts/backfill-place-ids.mjs
 */
import { PrismaClient } from "@prisma/client";
import { getValidAccessToken, getBusinessProfile } from "../src/lib/google-service.ts";
import { resolveGbpMapUrl } from "../src/lib/gbp-profile-utils.ts";

const db = new PrismaClient();

async function main() {
  const token = await getValidAccessToken();
  if (!token) {
    console.error("No Google access token. Reconnect Google OAuth first.");
    process.exit(1);
  }

  const rows = await db.googleBusinessProfile.findMany({
    where: { OR: [{ placeId: null }, { placeId: "" }] },
    select: { id: true, googleLocationId: true, profileName: true, mapUrl: true },
  });
  console.log(`Backfilling ${rows.length} profiles…`);

  for (const row of rows) {
    try {
      const profile = await getBusinessProfile(token, row.googleLocationId);
      const placeId = profile.metadata?.placeId?.trim() || null;
      const mapUrl =
        resolveGbpMapUrl({
          metadata: profile.metadata,
          googleLocationId: row.googleLocationId,
          name: profile.title || row.profileName,
          latitude: profile.latlng?.latitude,
          longitude: profile.latlng?.longitude,
        }) || row.mapUrl;

      await db.googleBusinessProfile.update({
        where: { id: row.id },
        data: {
          ...(placeId ? { placeId } : {}),
          ...(mapUrl ? { mapUrl } : {}),
        },
      });
      console.log(`${row.profileName.slice(0, 55)} → ${placeId || "(no placeId)"}`);
    } catch (e) {
      console.error("FAIL", row.googleLocationId, e?.message || e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
