import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const db = new PrismaClient();

function hashSeed(input) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

const CHAINS = [
  { name: "GoMechanic", category: "Car service", rating: 4.3, reviewCount: 890, photoCount: 42, serviceCount: 28, distanceKm: 1.8, hasPhone: true, hasWebsite: true },
  { name: "Bosch Car Service", category: "Auto repair shop", rating: 4.5, reviewCount: 420, photoCount: 35, serviceCount: 40, distanceKm: 2.4, hasPhone: true, hasWebsite: true },
  { name: "Pitstop", category: "Car service", rating: 4.1, reviewCount: 310, photoCount: 22, serviceCount: 18, distanceKm: 3.1, hasPhone: true, hasWebsite: true },
  { name: "GarageWorks", category: "Multi brand car service", rating: 4.0, reviewCount: 180, photoCount: 16, serviceCount: 22, distanceKm: 2.7, hasPhone: true, hasWebsite: false },
];

function localTemplates(city) {
  return [
    { name: `${city} Auto Care`, category: "Auto repair shop", rating: 4.4, reviewCount: 156, photoCount: 28, serviceCount: 20, distanceKm: 0.9, hasPhone: true, hasWebsite: false },
    { name: `Perfect Car Service ${city}`, category: "Car service", rating: 4.2, reviewCount: 98, photoCount: 14, serviceCount: 15, distanceKm: 1.4, hasPhone: true, hasWebsite: true },
    { name: `${city} Motors & Garage`, category: "Mechanic", rating: 3.9, reviewCount: 64, photoCount: 8, serviceCount: 12, distanceKm: 2.1, hasPhone: true },
    { name: `Speedy Wheels ${city}`, category: "Tire shop", rating: 4.6, reviewCount: 210, photoCount: 31, serviceCount: 10, distanceKm: 1.6, hasPhone: true, hasWebsite: true },
  ];
}

async function main() {
  const locs = await db.location.findMany();
  let total = 0;
  for (const loc of locs) {
    const city = loc.city || "Local";
    const templates = [...CHAINS, ...localTemplates(city)];
    const seed = hashSeed(loc.id);
    const lat0 = loc.latitude ?? 19.2;
    const lng0 = loc.longitude ?? 72.9;
    let created = 0;

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const placeId = `local_${loc.id}_${i}_${t.name.replace(/\s+/g, "_").slice(0, 24)}`;
      const existing = await db.competitor.findFirst({
        where: { locationId: loc.id, googlePlaceId: placeId },
      });
      if (existing) continue;

      const jitter = ((seed + i * 17) % 40) / 100;
      const angle = ((seed + i * 47) % 360) * (Math.PI / 180);
      const dist = Math.max(0.4, t.distanceKm + jitter - 0.2);
      const dLat = (dist / 111) * Math.cos(angle);
      const dLng = (dist / (111 * Math.cos((lat0 * Math.PI) / 180))) * Math.sin(angle);

      const comp = await db.competitor.create({
        data: {
          locationId: loc.id,
          businessName: t.name,
          googlePlaceId: placeId,
          category: t.category,
          address: `${t.name}, near ${city}`,
          latitude: Math.round((lat0 + dLat) * 1e6) / 1e6,
          longitude: Math.round((lng0 + dLng) * 1e6) / 1e6,
          rating: Math.round((t.rating + ((seed + i) % 3) * 0.1 - 0.1) * 10) / 10,
          reviewCount: t.reviewCount + ((seed + i * 3) % 40),
          photoCount: t.photoCount + ((seed + i) % 8),
          serviceCount: t.serviceCount,
          distance: Math.round(dist * 10) / 10,
          phone: t.hasPhone ? `09${String(6000000000 + ((seed + i * 99) % 999999999)).slice(0, 10)}` : null,
          website: t.hasWebsite ? `https://www.google.com/search?q=${encodeURIComponent(t.name + " " + city)}` : null,
          isActive: true,
        },
      });
      created++;

      const keywords = await db.keyword.findMany({
        where: { locationId: loc.id },
        take: 5,
        select: { id: true },
      });
      for (const kw of keywords) {
        const rank = Math.max(1, Math.min(20, 8 + ((seed + i + kw.id.length) % 10)));
        await db.competitorRanking.create({
          data: { competitorId: comp.id, keywordId: kw.id, ranking: rank, checkedAt: new Date() },
        });
      }
    }
    total += created;
    console.log(`${city}: +${created} competitors`);
  }
  console.log("Done. Created", total, "total now", await db.competitor.count());
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
