import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const kw = await db.keyword.count({ where: { status: "active" } });
const ranks = await db.keywordRanking.count();
const withRank = await db.keyword.count({
  where: { rankings: { some: { rank: { gt: 0 } } } },
});
const loc = await db.location.count({
  where: { latitude: { not: null }, longitude: { not: null } },
});
const sample = await db.keyword.findMany({
  take: 2,
  include: {
    rankings: { take: 1, orderBy: { checkedAt: "desc" } },
    location: { select: { name: true, latitude: true, longitude: true } },
  },
});

console.log(JSON.stringify({ keywords: kw, rankingRows: ranks, keywordsWithRank: withRank, locationsWithCoords: loc, sample }, null, 2));
await db.$disconnect();
