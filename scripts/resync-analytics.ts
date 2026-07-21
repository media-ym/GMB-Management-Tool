import { PrismaClient } from "@prisma/client";
import { syncLocationAnalytics } from "../src/lib/google-service";

const locationId = process.argv[2] || "cmrj5l4e204y2ehb0trjbjl26";
const daysBack = Math.min(Math.max(parseInt(process.argv[3] || "180", 10) || 180, 30), 540);

async function main() {
  const prisma = new PrismaClient();
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true },
  });
  if (!loc) throw new Error(`Location not found: ${locationId}`);

  console.log(`Syncing analytics for "${loc.name}" (${daysBack} days)…`);
  const result = await syncLocationAnalytics(locationId, daysBack);
  console.log("Sync result:", result);

  const agg = await prisma.analyticDaily.aggregate({
    where: { locationId },
    _count: true,
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
  });

  const s = agg._sum;
  const views = (s.searchViews ?? 0) + (s.mapsViews ?? 0);
  const interactions =
    (s.websiteClicks ?? 0) +
    (s.phoneCalls ?? 0) +
    (s.directionRequests ?? 0) +
    (s.conversations ?? 0) +
    (s.bookings ?? 0);

  console.log("\n=== Totals (should approach GMB Feb–Jul) ===");
  console.log("Days stored:", agg._count);
  console.log("Profile views:", views, `(search ${s.searchViews}, maps ${s.mapsViews})`);
  console.log("  Search desktop/mobile:", s.searchDesktop, "/", s.searchMobile);
  console.log("  Maps desktop/mobile:", s.mapsDesktop, "/", s.mapsMobile);
  console.log("Interactions:", interactions);
  console.log("  Calls:", s.phoneCalls, "Directions:", s.directionRequests, "Website:", s.websiteClicks);
  console.log("  Chat:", s.conversations, "Bookings:", s.bookings);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
