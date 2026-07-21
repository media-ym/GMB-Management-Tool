/**
 * One-shot: re-sync Google Performance analytics for a location (or all).
 * Usage: node scripts/resync-analytics.mjs [locationId]
 */
import { PrismaClient } from "@prisma/client";

const locationId = process.argv[2] || "cmrj5l4e204y2ehb0trjbjl26";

// Dynamic import of compiled TS path won't work — call API instead via fetch
const base = process.env.APP_URL || "http://127.0.0.1:3000";

async function main() {
  const prisma = new PrismaClient();
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true },
  });
  if (!loc) {
    console.error("Location not found:", locationId);
    process.exit(1);
  }
  console.log("Resyncing analytics for:", loc.name, loc.id);

  // Prefer direct lib import via tsx if available; else hit API (needs cookie).
  // Use a small inline fetch to Google through the Next route after server is up.
  const { syncLocationAnalytics } = await import("../src/lib/google-service.ts").catch(() => ({}));

  if (typeof syncLocationAnalytics === "function") {
    const result = await syncLocationAnalytics(locationId, 180);
    console.log("Result:", result);
  } else {
    console.log("Direct import failed — will sync via server after restart.");
    console.log("POST", `${base}/api/locations/${locationId}/sync`, '{ module: "analytics", days: 180 }');
  }

  const agg = await prisma.analyticDaily.aggregate({
    where: { locationId },
    _sum: {
      searchViews: true,
      mapsViews: true,
      searchDesktop: true,
      searchMobile: true,
      mapsDesktop: true,
      mapsMobile: true,
      websiteClicks: true,
      phoneCalls: true,
      directionRequests: true,
      conversations: true,
      bookings: true,
    },
    _count: true,
  });
  console.log("DB aggregate after:", JSON.stringify(agg, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
