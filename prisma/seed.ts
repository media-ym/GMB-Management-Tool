import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

// MyFNG locations (per architecture doc §7) with realistic addresses
const LOCATIONS = [
  { name: "MyFNG Mumbai", city: "Mumbai", address: "Linking Road, Bandra West, Mumbai, Maharashtra 400050", lat: 19.0596, lng: 72.8295, phone: "+91 22 4000 1001" },
  { name: "MyFNG Navi Mumbai", city: "Navi Mumbai", address: "Palm Beach Road, Vashi, Navi Mumbai, Maharashtra 400703", lat: 19.0760, lng: 73.0250, phone: "+91 22 4000 1002" },
  { name: "MyFNG Thane", city: "Thane", address: "Ghodbunder Road, Manpada, Thane West, Maharashtra 400607", lat: 19.2447, lng: 72.9793, phone: "+91 22 4000 1003" },
  { name: "MyFNG Pune", city: "Pune", address: "Baner Road, Baner, Pune, Maharashtra 411045", lat: 18.5590, lng: 73.7868, phone: "+91 20 4000 1004" },
  { name: "MyFNG Nashik", city: "Nashik", address: "College Road, Nashik, Maharashtra 422005", lat: 19.9945, lng: 73.7754, phone: "+91 253 4000 1005" },
  { name: "MyFNG Panvel", city: "Panvel", address: "Khandeshwar Road, Panvel, Navi Mumbai, Maharashtra 410206", lat: 18.9888, lng: 73.1118, phone: "+91 22 4000 1006" },
  { name: "MyFNG Kalyan", city: "Kalyan", address: "Station Road, Kalyan West, Maharashtra 421301", lat: 19.2403, lng: 73.1305, phone: "+91 251 4000 1007" },
  { name: "MyFNG Dombivli", city: "Dombivli", address: "Manpada Road, Dombivli East, Maharashtra 421201", lat: 19.2167, lng: 73.0833, phone: "+91 251 4000 1008" },
  { name: "MyFNG Bhiwandi", city: "Bhiwandi", address: "Mumbai-Agra Road, Bhiwandi, Maharashtra 421302", lat: 19.2967, lng: 73.0633, phone: "+91 2522 4000 1009" },
  { name: "MyFNG Mira Road", city: "Mira Road", address: "Western Express Highway, Mira Road East, Maharashtra 401107", lat: 19.2750, lng: 72.8750, phone: "+91 22 4000 1010" },
  { name: "MyFNG Vasai", city: "Vasai", address: "Vasai Road, Vasai West, Maharashtra 401202", lat: 19.4245, lng: 72.8087, phone: "+91 250 4000 1011" },
  { name: "MyFNG Virar", city: "Virar", address: "Viva College Road, Virar West, Maharashtra 401303", lat: 19.4520, lng: 72.8110, phone: "+91 250 4000 1012" },
  { name: "MyFNG Ambernath", city: "Ambernath", address: "Kalyan-Ambernath Road, Ambernath East, Maharashtra 421501", lat: 19.2083, lng: 73.1883, phone: "+91 251 4000 1013" },
  { name: "MyFNG Badlapur", city: "Badlapur", address: "Railway Road, Badlapur West, Maharashtra 421503", lat: 19.1667, lng: 73.2333, phone: "+91 251 4000 1014" },
  { name: "MyFNG Raigad", city: "Raigad", address: "Alibag Road, Raigad, Maharashtra 402201", lat: 18.5167, lng: 73.1833, phone: "+91 2141 4000 1015" },
];

const REVIEW_AUTHORS = [
  "Rohan Mehta", "Priya Sharma", "Amit Deshpande", "Sneha Patil", "Vikram Iyer",
  "Anjali Nair", "Suresh Kadam", "Deepa Joshi", "Manish Gupta", "Pooja More",
  "Karan Singh", "Neha Verma", "Rajesh Pawar", "Meera Desai", "Aditya Rao",
  "Swati Bhat", "Gaurav Kale", "Reshma Pillai", "Nilesh Shetty", "Arti Kulkarni",
];

const POSITIVE_REVIEWS = [
  "Got my modular kitchen done by MyFNG team. Excellent finish and on-time delivery. The 3D design preview helped a lot. Highly recommend!",
  "Outstanding service! The team understood exactly what we wanted. Our living room makeover looks stunning. Worth every rupee.",
  "Booked a full home interiors package. Professional crew, clean work, and they handled all approvals. 5 stars from us.",
  "Great experience from design to installation. Special thanks to the project manager who kept us updated daily.",
  "Beautiful wardrobes and excellent space utilisation in our 2BHK. The finish quality is top notch.",
  "Very happy with the false ceiling and lighting work. The team was punctual and courteous throughout.",
  "MyFNG Pune team did an amazing job with our kitchen and master bedroom. Modern designs and durable material.",
  "Smooth end-to-end experience. The site supervisor was always available. Final outcome exceeded expectations.",
];
const NEUTRAL_REVIEWS = [
  "Decent work overall but the project took 2 weeks longer than promised. Quality is good though.",
  "Design was nice but communication could have been better. Happy with the final result.",
  "Satisfied with the work but had to follow up multiple times for the warranty documents.",
  "Good quality interiors. Slightly on the expensive side but you get what you pay for.",
];
const NEGATIVE_REVIEWS = [
  "Delayed by 3 weeks and the finishing on the cabinet doors is uneven. Had to call them back twice for fixes.",
  "Promised soft-close hinges but received regular ones. Still waiting for replacement after 2 weeks.",
  "Poor response from the site supervisor. Work quality is okay but project management needs improvement.",
  "The paint started chipping near the window within a month. Disappointed with the warranty support.",
];

const KEYWORDS_BY_CITY = [
  "modular kitchen near me", "home interiors", "wardrobe designers",
  "false ceiling contractor", "modular kitchen {city}", "interior designer {city}",
  "home renovation", "custom furniture", "living room design",
];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function rand(seed: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

async function main() {
  console.log("Seeding MyFNG Local AI Manager...");

  // Clean
  await db.aIHistory.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.keywordRanking.deleteMany();
  await db.keyword.deleteMany();
  await db.analyticDaily.deleteMany();
  await db.review.deleteMany();
  await db.post.deleteMany();
  await db.location.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();

  // ── Users (5 roles) ───────────────────────────────────────────────
  const pw = await hashPassword("myfng123");
  const users = [
    { email: "admin@myfng.in", name: "Ananya Deshpande", role: "super_admin", avatar: null, assignedLocationIds: null },
    { email: "marketing@myfng.in", name: "Rohit Malhotra", role: "marketing_manager", avatar: null, assignedLocationIds: null },
    { email: "thane@myfng.in", name: "Smita Kulkarni", role: "branch_manager", avatar: null, assignedLocationIds: null }, // assign below
    { email: "support@myfng.in", name: "Imran Shaikh", role: "customer_support", avatar: null, assignedLocationIds: null },
    { email: "viewer@myfng.in", name: "Guest Viewer", role: "viewer", avatar: null, assignedLocationIds: null },
  ];
  const createdUsers = [];
  for (const u of users) {
    createdUsers.push(await db.user.create({ data: { ...u, password: pw } }));
  }

  // ── Locations ─────────────────────────────────────────────────────
  const createdLocations = [];
  for (let i = 0; i < LOCATIONS.length; i++) {
    const L = LOCATIONS[i];
    const avgRating = 3.8 + rand(i + 1, 12) / 10; // 3.8 – 4.9
    const reviewCount = 40 + rand(i + 7, 180);
    const healthScore = 55 + rand(i + 3, 45);
    const visibilityScore = 45 + rand(i + 9, 55);
    const syncStatuses = ["synced", "synced", "synced", "pending", "error"];
    const loc = await db.location.create({
      data: {
        name: L.name,
        city: L.city,
        region: "Maharashtra",
        address: L.address,
        phone: L.phone,
        website: "https://myfng.in",
        googleLocationId: `myfng-gbp-${L.city.toLowerCase().replace(/\s+/g, "-")}`,
        placeId: `ChIJ_${L.city.toLowerCase().replace(/\s+/g, "")}_${i}`,
        latitude: L.lat,
        longitude: L.lng,
        status: i === 9 ? "paused" : "active",
        syncStatus: pick(syncStatuses, i),
        lastSyncedAt: new Date(Date.now() - rand(i + 2, 60) * 60 * 1000),
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount,
        healthScore,
        visibilityScore,
        categoriesJson: JSON.stringify(["Home Improvement", "Interior Designer", "Furniture Store", "Kitchen Furniture Store"]),
        servicesJson: JSON.stringify(["Modular Kitchen", "Wardrobe Design", "False Ceiling", "Full Home Interiors", "Custom Furniture", "Living Room Design"]),
        hoursJson: JSON.stringify({ mon: "10:00-20:00", tue: "10:00-20:00", wed: "10:00-20:00", thu: "10:00-20:00", fri: "10:00-20:00", sat: "10:00-21:00", sun: "11:00-18:00" }),
        attributesJson: JSON.stringify({ wheelchairAccessible: true, appointments: true, onsiteServices: true, parking: true }),
      },
    });
    createdLocations.push(loc);
  }

  // Assign branch manager to Thane + Mumbai
  await db.user.update({
    where: { id: createdUsers[2].id },
    data: { assignedLocationIds: [createdLocations[0].id, createdLocations[2].id].join(",") },
  });

  // ── Reviews (realistic, 8-20 per location) ────────────────────────
  let reviewSeed = 100;
  for (let li = 0; li < createdLocations.length; li++) {
    const loc = createdLocations[li];
    const count = 8 + rand(li + 11, 12);
    for (let r = 0; r < count; r++) {
      reviewSeed++;
      const bucket = rand(reviewSeed, 10);
      let rating: number, text: string, sentiment: string;
      if (bucket < 6) { rating = 5; text = pick(POSITIVE_REVIEWS, reviewSeed); sentiment = "positive"; }
      else if (bucket < 8) { rating = 4; text = pick(POSITIVE_REVIEWS, reviewSeed + 1); sentiment = "positive"; }
      else if (bucket < 9) { rating = 3; text = pick(NEUTRAL_REVIEWS, reviewSeed); sentiment = "neutral"; }
      else { rating = rand(reviewSeed, 2) === 0 ? 1 : 2; text = pick(NEGATIVE_REVIEWS, reviewSeed); sentiment = "negative"; }

      const createdAt = new Date(Date.now() - rand(reviewSeed, 45) * 24 * 60 * 60 * 1000);
      const replied = rating >= 3 && rand(reviewSeed, 3) === 0;
      const replyText = replied
        ? `Hi ${pick(REVIEW_AUTHORS, reviewSeed).split(" ")[0]}, thank you so much for sharing your experience with MyFNG ${loc.city}. We're glad you chose us for your home interiors. Our team would love to stay in touch — reach us anytime at care@myfng.in. — Team MyFNG`
        : null;
      await db.review.create({
        data: {
          locationId: loc.id,
          googleReviewId: `rev_${loc.city.toLowerCase().replace(/\s+/g, "")}_${reviewSeed}`,
          authorName: pick(REVIEW_AUTHORS, reviewSeed),
          authorPhoto: null,
          rating,
          text,
          sentiment,
          replyText,
          replySource: replied ? "manual" : null,
          replyStatus: replied ? "replied" : (rating <= 2 ? "pending" : (rand(reviewSeed, 2) === 0 ? "pending" : "ignored")),
          repliedAt: replied ? new Date(createdAt.getTime() + 36 * 60 * 60 * 1000) : null,
          createdAt,
        },
      });
    }
  }

  // ── Posts ─────────────────────────────────────────────────────────
  const postTopics = [
    { type: "whats_new", title: "New Monsoon Modular Kitchen Collection Launched", content: "Introducing our all-new monsoon-ready modular kitchen range with anti-moisture ply and soft-close hardware across all MyFNG experience centres. Visit us this weekend for an exclusive preview and complimentary 3D design consultation.", ctaType: "learn_more" },
    { type: "offer", title: "Flat 25% Off on Wardrobe Packages — This Month Only", content: "Upgrade your bedroom with custom sliding wardrobes at 25% off. Free site measurement, free 3D design, and zero-cost EMI for 6 months. Limited slots per city — book your free design visit today.", ctaType: "book" },
    { type: "event", title: "Home Interiors Design Expo — Pune", content: "Join us at the MyFNG Design Expo in Baner, Pune. Meet our senior designers, explore live mock-up homes, and avail expo-only discounts on full home interior packages. Saturday & Sunday, 10 AM to 8 PM.", ctaType: "sign_up" },
    { type: "update", title: "New Experience Centre Now Open in Kalyan", content: "We're excited to announce the opening of our newest MyFNG experience centre at Station Road, Kalyan. Walk in for free design consultations, material sampling, and meet our certified interior designers.", ctaType: "call" },
    { type: "whats_new", title: "Smart Home Integration Now Available", content: "MyFNG now offers smart lighting, automated curtains, and voice-controlled ambiance as part of selected full home interior packages. Experience the future of living at any MyFNG studio.", ctaType: "learn_more" },
  ];
  for (let li = 0; li < createdLocations.length; li++) {
    const loc = createdLocations[li];
    const postCount = 2 + rand(li + 5, 4);
    for (let p = 0; p < postCount; p++) {
      const t = pick(postTopics, li + p);
      const statusBucket = rand(li + p + 3, 4);
      const status = statusBucket === 0 ? "draft" : statusBucket === 1 ? "scheduled" : "published";
      const createdAt = new Date(Date.now() - rand(li + p + 1, 40) * 24 * 60 * 60 * 1000);
      await db.post.create({
        data: {
          locationId: loc.id,
          type: t.type,
          title: t.title,
          content: t.content,
          ctaType: t.ctaType,
          ctaUrl: "https://myfng.in/offers",
          status,
          source: rand(li + p, 3) === 0 ? "ai" : "manual",
          authorId: createdUsers[1].id, // marketing manager
          scheduledAt: status === "scheduled" ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) : null,
          publishedAt: status === "published" ? createdAt : null,
          createdAt,
        },
      });
    }
  }

  // ── Analytics (last 30 days per location) ─────────────────────────
  const today = new Date();
  for (const loc of createdLocations) {
    for (let d = 29; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const base = 60 + rand(loc.latitude * 1000 + d, 220);
      await db.analyticDaily.create({
        data: {
          locationId: loc.id,
          date,
          searchViews: base + rand(d + 1, 80),
          mapsViews: Math.floor(base * 0.7) + rand(d + 2, 50),
          websiteClicks: Math.floor(base * 0.25) + rand(d + 3, 20),
          phoneCalls: Math.floor(base * 0.08) + rand(d + 4, 8),
          directionRequests: Math.floor(base * 0.12) + rand(d + 5, 12),
        },
      });
    }
  }

  // ── Keywords + Geo-grid rankings ──────────────────────────────────
  for (const loc of createdLocations) {
    for (const kw of KEYWORDS_BY_CITY) {
      const keyword = kw.replace("{city}", loc.city);
      const k = await db.keyword.create({
        data: { locationId: loc.id, keyword, city: loc.city, status: "active" },
      });
      // 5x5 geo grid around the location
      for (let gx = -2; gx <= 2; gx++) {
        for (let gy = -2; gy <= 2; gy++) {
          const lat = (loc.latitude ?? 19) + gy * 0.012;
          const lng = (loc.longitude ?? 73) + gx * 0.012;
          const rankBucket = Math.abs(gx) + Math.abs(gy); // 0-4
          const rank = rankBucket === 0 ? 1 + rand(gx + 5, 2) : rankBucket === 1 ? 1 + rand(gx + 6, 5) : rankBucket === 2 ? 3 + rand(gx + 7, 8) : rankBucket === 3 ? 8 + rand(gx + 8, 12) : 15 + rand(gx + 9, 20);
          await db.keywordRanking.create({
            data: { keywordId: k.id, locationId: loc.id, lat, lng, rank },
          });
        }
      }
    }
  }

  // ── Notifications ─────────────────────────────────────────────────
  const notifs = [
    { type: "review", title: "New 1-star review on MyFNG Pune", message: "A customer posted a 1-star review mentioning delay and uneven finish. Needs immediate attention.", severity: "critical", link: "reviews" },
    { type: "sync", title: "Google sync failed for MyFNG Bhiwandi", message: "OAuth token expired. Re-authorize Google Business Profile to resume sync.", severity: "warning", link: "locations" },
    { type: "ranking", title: "Ranking dropped for 'modular kitchen mumbai'", message: "Position dropped from #2 to #7 in last 7 days. Consider refreshing photos and posts.", severity: "warning", link: "seo" },
    { type: "ai_alert", title: "MiSA AI flagged 4 locations needing attention", message: "Lower than average health score detected on Mira Road, Vasai, Virar, Badlapur.", severity: "info", link: "ai" },
    { type: "system", title: "Daily analytics sync completed", message: "Performance metrics updated for all 15 locations.", severity: "success", link: "analytics" },
    { type: "review", title: "12 new reviews this week", message: "Average rating improved by 0.1 across all locations.", severity: "info", link: "reviews" },
  ];
  for (const n of notifs) {
    await db.notification.create({
      data: { userId: null, type: n.type, title: n.title, message: n.message, severity: n.severity as any, read: false, link: n.link },
    });
  }

  // ── Audit logs ────────────────────────────────────────────────────
  const auditActions = [
    { action: "login", entity: "auth" },
    { action: "review.reply", entity: "review" },
    { action: "post.publish", entity: "post" },
    { action: "ai.generate", entity: "ai" },
    { action: "sync.run", entity: "location" },
    { action: "settings.update", entity: "settings" },
  ];
  for (let i = 0; i < 30; i++) {
    const a = pick(auditActions, i);
    const u = pick(createdUsers, i);
    await db.auditLog.create({
      data: {
        userId: u.id,
        userName: u.name,
        action: a.action,
        entity: a.entity,
        entityId: `ent_${i}`,
        status: rand(i, 8) === 0 ? "failed" : "success",
        ip: `10.0.${rand(i, 20)}.${rand(i + 3, 200)}`,
        createdAt: new Date(Date.now() - i * 3 * 60 * 60 * 1000),
      },
    });
  }

  // ── Settings ──────────────────────────────────────────────────────
  await db.setting.create({ data: { key: "brand", value: JSON.stringify({ name: "MyFNG", tagline: "Home Interiors & Services", supportEmail: "care@myfng.in", supportPhone: "+91 22 4000 1000" }) } });
  await db.setting.create({ data: { key: "ai", value: JSON.stringify({ assistantName: "MiSA AI", defaultModel: "glm-4.6", autoApprove: false, maxTokensPerDay: 200000 }) } });
  await db.setting.create({ data: { key: "sync", value: JSON.stringify({ reviewsInterval: "5m", businessInfoInterval: "30m", postsInterval: "30m", analyticsInterval: "daily" }) } });

  console.log("Seed complete. Users:", createdUsers.length, "Locations:", createdLocations.length);
  console.log("Login credentials — email: admin@myfng.in / marketing@myfng.in / thane@myfng.in / support@myfng.in / viewer@myfng.in | password: myfng123");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
