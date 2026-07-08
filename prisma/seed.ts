import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

// MyFNG locations (per architecture doc §7)
const LOCATIONS = [
  { code: "MYFNG-MUM", name: "MyFNG Mumbai", city: "Mumbai", address: "Linking Road, Bandra West, Mumbai, Maharashtra 400050", lat: 19.0596, lng: 72.8295, phone: "+91 22 4000 1001", pincode: "400050" },
  { code: "MYFNG-NM", name: "MyFNG Navi Mumbai", city: "Navi Mumbai", address: "Palm Beach Road, Vashi, Navi Mumbai, Maharashtra 400703", lat: 19.0760, lng: 73.0250, phone: "+91 22 4000 1002", pincode: "400703" },
  { code: "MYFNG-THA", name: "MyFNG Thane", city: "Thane", address: "Ghodbunder Road, Manpada, Thane West, Maharashtra 400607", lat: 19.2447, lng: 72.9793, phone: "+91 22 4000 1003", pincode: "400607" },
  { code: "MYFNG-PUN", name: "MyFNG Pune", city: "Pune", address: "Baner Road, Baner, Pune, Maharashtra 411045", lat: 18.5590, lng: 73.7868, phone: "+91 20 4000 1004", pincode: "411045" },
  { code: "MYFNG-NSK", name: "MyFNG Nashik", city: "Nashik", address: "College Road, Nashik, Maharashtra 422005", lat: 19.9945, lng: 73.7754, phone: "+91 253 4000 1005", pincode: "422005" },
  { code: "MYFNG-PNV", name: "MyFNG Panvel", city: "Panvel", address: "Khandeshwar Road, Panvel, Navi Mumbai, Maharashtra 410206", lat: 18.9888, lng: 73.1118, phone: "+91 22 4000 1006", pincode: "410206" },
  { code: "MYFNG-KLY", name: "MyFNG Kalyan", city: "Kalyan", address: "Station Road, Kalyan West, Maharashtra 421301", lat: 19.2403, lng: 73.1305, phone: "+91 251 4000 1007", pincode: "421301" },
  { code: "MYFNG-DOM", name: "MyFNG Dombivli", city: "Dombivli", address: "Manpada Road, Dombivli East, Maharashtra 421201", lat: 19.2167, lng: 73.0833, phone: "+91 251 4000 1008", pincode: "421201" },
  { code: "MYFNG-BHI", name: "MyFNG Bhiwandi", city: "Bhiwandi", address: "Mumbai-Agra Road, Bhiwandi, Maharashtra 421302", lat: 19.2967, lng: 73.0633, phone: "+91 2522 4000 1009", pincode: "421302" },
  { code: "MYFNG-MIR", name: "MyFNG Mira Road", city: "Mira Road", address: "Western Express Highway, Mira Road East, Maharashtra 401107", lat: 19.2750, lng: 72.8750, phone: "+91 22 4000 1010", pincode: "401107" },
  { code: "MYFNG-VAS", name: "MyFNG Vasai", city: "Vasai", address: "Vasai Road, Vasai West, Maharashtra 401202", lat: 19.4245, lng: 72.8087, phone: "+91 250 4000 1011", pincode: "401202" },
  { code: "MYFNG-VIR", name: "MyFNG Virar", city: "Virar", address: "Viva College Road, Virar West, Maharashtra 401303", lat: 19.4520, lng: 72.8110, phone: "+91 250 4000 1012", pincode: "401303" },
  { code: "MYFNG-AMB", name: "MyFNG Ambernath", city: "Ambernath", address: "Kalyan-Ambernath Road, Ambernath East, Maharashtra 421501", lat: 19.2083, lng: 73.1883, phone: "+91 251 4000 1013", pincode: "421501" },
  { code: "MYFNG-BDL", name: "MyFNG Badlapur", city: "Badlapur", address: "Railway Road, Badlapur West, Maharashtra 421503", lat: 19.1667, lng: 73.2333, phone: "+91 251 4000 1014", pincode: "421503" },
  { code: "MYFNG-RGD", name: "MyFNG Raigad", city: "Raigad", address: "Alibag Road, Raigad, Maharashtra 402201", lat: 18.5167, lng: 73.1833, phone: "+91 2141 4000 1015", pincode: "402201" },
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

const COMPETITORS = [
  { name: "HomeLane", category: "Home Interiors" },
  { name: "Livspace", category: "Home Interiors" },
  { name: "Pepperfry Studio", category: "Furniture Store" },
  { name: "Urban Ladder", category: "Home Interiors" },
];

const SERVICES_LIST = [
  { name: "Modular Kitchen", category: "Kitchen", desc: "Custom modular kitchens with premium hardware and finishes." },
  { name: "Wardrobe Design", category: "Bedroom", desc: "Sliding and hinged wardrobes with smart storage solutions." },
  { name: "False Ceiling", category: "Living Room", desc: "POP and gypsum false ceiling with integrated lighting." },
  { name: "Full Home Interiors", category: "Complete", desc: "End-to-end interior design and execution for your home." },
  { name: "Custom Furniture", category: "Furniture", desc: "Bespoke furniture crafted to your space and style." },
  { name: "Living Room Design", category: "Living Room", desc: "Complete living room makeovers with theme design." },
];

const PRODUCTS_LIST = [
  { name: "Acrylic Modular Kitchen Set", category: "Kitchen", price: 185000 },
  { name: "Sliding Wardrobe 8ft", category: "Bedroom", price: 65000 },
  { name: "False Ceiling with Cove Light", category: "Living Room", price: 28000 },
  { name: "TV Unit with Storage", category: "Living Room", price: 42000 },
  { name: "Pooja Room Unit", category: "Special", price: 35000 },
  { name: "Study Table with Bookshelf", category: "Bedroom", price: 22000 },
];

const BUSINESS_HOURS = [
  { day: 1, open: "10:00", close: "20:00", closed: false }, // Mon
  { day: 2, open: "10:00", close: "20:00", closed: false },
  { day: 3, open: "10:00", close: "20:00", closed: false },
  { day: 4, open: "10:00", close: "20:00", closed: false },
  { day: 5, open: "10:00", close: "20:00", closed: false },
  { day: 6, open: "10:00", close: "21:00", closed: false }, // Sat
  { day: 0, open: "11:00", close: "18:00", closed: false }, // Sun
];

const ATTRIBUTES = [
  { name: "Wheelchair Accessible", value: "true" },
  { name: "Appointments Required", value: "true" },
  { name: "Onsite Services", value: "true" },
  { name: "Parking Available", value: "true" },
  { name: "Online Appointments", value: "true" },
];

const CATEGORIES = [
  { name: "Interior Designer", primary: true },
  { name: "Home Improvement Store", primary: false },
  { name: "Furniture Store", primary: false },
  { name: "Kitchen Furniture Store", primary: false },
];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function rand(seed: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

async function main() {
  console.log("Seeding MyFNG Local AI Manager (expanded schema)...");

  // Clean ALL tables (order matters for FK constraints)
  const tables = [
    "StorageFile", "Webhook", "ApiToken", "ScheduledJob", "BackgroundJob",
    "ErrorLog", "ApiLog", "SyncLog", "ActivityLog", "DashboardWidget",
    "UserPreference", "Report", "AiUsage", "AiSuggestion", "AiJob",
    "CompetitorRanking", "Competitor", "GeoGridResult", "SeoAudit",
    "KeywordRanking", "Keyword", "AnalyticsMonthly", "DashboardCache",
    "AnalyticDaily", "MediaLibrary", "Post", "ReviewLabel", "ReviewReply",
    "ReviewReplyTemplate", "Review", "BusinessHour", "SpecialHour",
    "BusinessAttribute", "Service", "Product", "BusinessPhoto",
    "BusinessCategory", "BusinessInformation", "GoogleBusinessProfile",
    "GoogleAccount", "ClientAuthorization", "Client",
    "RolePermission", "Permission", "Role",
    "Notification", "AuditLog", "AIHistory", "Setting", "Location", "User",
  ];
  for (const t of tables) {
    try { await (db as any)[t].deleteMany(); } catch (e) { /* ignore */ }
  }

  // ── Roles & Permissions (§4-§5) ───────────────────────────────────
  const roleDefs = [
    { name: "Super Admin", desc: "Full access to every module and setting." },
    { name: "Marketing Manager", desc: "Reviews, Posts, Analytics, AI. No user management." },
    { name: "Branch Manager", desc: "Assigned locations, reviews, posts. No global settings." },
    { name: "Customer Support", desc: "Reviews and AI replies only." },
    { name: "Viewer", desc: "Read-only access to dashboard and reports." },
  ];
  const roles: any[] = [];
  for (const r of roleDefs) {
    roles.push(await db.role.create({ data: { name: r.name, description: r.desc } }));
  }

  const permDefs = [
    "dashboard.view", "locations.view", "locations.manage",
    "reviews.view", "reviews.reply", "reviews.ai_reply",
    "posts.view", "posts.manage", "analytics.view",
    "seo.view", "seo.manage", "ai.use",
    "notifications.view", "audit.view", "settings.view",
    "users.manage", "system.sync", "media.manage", "reports.generate",
  ];
  const perms: any[] = [];
  for (const p of permDefs) {
    perms.push(await db.permission.create({ data: { permissionName: p, description: p } }));
  }
  // Assign all perms to Super Admin
  for (const p of perms) {
    await db.rolePermission.create({ data: { roleId: roles[0].id, permissionId: p.id } });
  }
  // Marketing Manager: most except users.manage
  for (const p of perms) {
    if (p.permissionName !== "users.manage") {
      await db.rolePermission.create({ data: { roleId: roles[1].id, permissionId: p.id } });
    }
  }
  // Branch Manager: limited
  const bmPerms = ["dashboard.view","locations.view","reviews.view","reviews.reply","reviews.ai_reply","posts.view","posts.manage","analytics.view","seo.view","ai.use","notifications.view","media.manage"];
  for (const pn of bmPerms) {
    const p = perms.find(x => x.permissionName === pn);
    if (p) await db.rolePermission.create({ data: { roleId: roles[2].id, permissionId: p.id } });
  }
  // Customer Support
  const csPerms = ["dashboard.view","reviews.view","reviews.reply","reviews.ai_reply","ai.use","notifications.view"];
  for (const pn of csPerms) {
    const p = perms.find(x => x.permissionName === pn);
    if (p) await db.rolePermission.create({ data: { roleId: roles[3].id, permissionId: p.id } });
  }
  // Viewer
  const vwPerms = ["dashboard.view","locations.view","reviews.view","posts.view","analytics.view","seo.view","notifications.view","audit.view"];
  for (const pn of vwPerms) {
    const p = perms.find(x => x.permissionName === pn);
    if (p) await db.rolePermission.create({ data: { roleId: roles[4].id, permissionId: p.id } });
  }

  // ── Users (5 roles) ───────────────────────────────────────────────
  const pw = await hashPassword("MyFNG@2025");
  const users = [
    { email: "admin@myfng.in", name: "Ananya Deshpande", role: "super_admin", roleId: roles[0].id },
    { email: "marketing@myfng.in", name: "Rohit Malhotra", role: "marketing_manager", roleId: roles[1].id },
    { email: "thane@myfng.in", name: "Smita Kulkarni", role: "branch_manager", roleId: roles[2].id },
    { email: "support@myfng.in", name: "Imran Shaikh", role: "customer_support", roleId: roles[3].id },
    { email: "viewer@myfng.in", name: "Guest Viewer", role: "viewer", roleId: roles[4].id },
  ];
  const createdUsers: any[] = [];
  for (const u of users) {
    createdUsers.push(await db.user.create({ data: { ...u, password: pw } }));
  }

  // ─── Seed default end-client (for Google Third-Party Policy compliance) ────
  const selfClient = await db.client.upsert({
    where: { clientCode: "MYFNG-SELF" },
    update: {},
    create: {
      clientCode: "MYFNG-SELF",
      name: "MyFNG (Self)",
      legalName: "MyFNG Interiors Pvt. Ltd.",
      contactName: "Operations Team",
      contactEmail: "ops@myfng.in",
      contactPhone: "+91 90000 00000",
      status: "active",
      notes: "Default self-client. All MyFNG-owned locations belong to this client.",
    },
  });

  // Create an active authorization record for the self-client
  await db.clientAuthorization.upsert({
    where: { id: "self-auth-default" },
    update: { status: "active" },
    create: {
      id: "self-auth-default",
      clientId: selfClient.id,
      authorizedScopes: JSON.stringify(["review.reply", "post.create", "post.update", "post.delete", "profile.update", "analytics.sync", "media.upload", "media.delete"]),
      status: "active",
      grantedAt: new Date(),
      notes: "Default authorization for self-managed locations.",
    },
  });

  // ── Google Account — NOT created in seed. Real Google OAuth connects via UI. ──
  // When user deploys and clicks "Connect Google", a real Google account record is created.
  const gAccount = { id: "seed-placeholder" }; // placeholder for GBP linking below

  // ── Locations + GoogleBusinessProfile + BusinessInfo + Hours + Photos + etc ──
  const createdLocations: any[] = [];
  for (let i = 0; i < LOCATIONS.length; i++) {
    const L = LOCATIONS[i];
    const avgRating = 3.8 + rand(i + 1, 12) / 10;
    const reviewCount = 40 + rand(i + 7, 180);
    const healthScore = 55 + rand(i + 3, 45);
    const visibilityScore = 45 + rand(i + 9, 55);
    const syncStatuses = ["synced", "synced", "synced", "pending", "error"];

    const loc = await db.location.create({
      data: {
        locationCode: L.code,
        name: L.name,
        city: L.city,
        region: "Maharashtra",
        state: "Maharashtra",
        pincode: L.pincode,
        address: L.address,
        phone: L.phone,
        email: `${L.city.toLowerCase().replace(/\s+/g, "")}@myfng.in`,
        website: "https://myfng.in",
        timezone: "Asia/Kolkata",
        latitude: L.lat,
        longitude: L.lng,
        status: i === 9 ? "paused" : "active",
        syncStatus: pick(syncStatuses, i),
        lastSyncedAt: new Date(Date.now() - rand(i + 2, 60) * 60 * 1000),
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount,
        healthScore,
        visibilityScore,
        categoriesJson: JSON.stringify(CATEGORIES.map(c => c.name)),
        servicesJson: JSON.stringify(SERVICES_LIST.map(s => s.name)),
        hoursJson: JSON.stringify(BUSINESS_HOURS),
        attributesJson: JSON.stringify(Object.fromEntries(ATTRIBUTES.map(a => [a.name, a.value === "true"]))),
        clientId: selfClient.id,
      },
    });
    createdLocations.push(loc);

    // Google Business Profile
    const gbp = await db.googleBusinessProfile.create({
      data: {
        googleLocationId: `myfng-gbp-${L.city.toLowerCase().replace(/\s+/g, "-")}`,
        locationId: loc.id,
        googleAccountId: null, // Will be linked when real Google OAuth connects
        profileName: L.name,
        primaryCategory: "Interior Designer",
        additionalCategoriesJson: JSON.stringify(["Home Improvement Store", "Furniture Store"]),
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews: reviewCount,
        verificationState: "verified",
        profileStatus: "active",
        mapUrl: `https://maps.google.com/?cid=myfng_${L.city.toLowerCase()}`,
      },
    });

    // Business Information
    await db.businessInformation.create({
      data: {
        profileId: gbp.id,
        locationId: loc.id,
        description: `MyFNG ${L.city} — Premium home interiors & modular kitchen experience centre. Visit us for free 3D design consultation.`,
        openingHoursJson: JSON.stringify(BUSINESS_HOURS),
        servicesJson: JSON.stringify(SERVICES_LIST.map(s => s.name)),
        attributesJson: JSON.stringify(Object.fromEntries(ATTRIBUTES.map(a => [a.name, a.value === "true"]))),
        website: "https://myfng.in",
        appointmentUrl: "https://myfng.in/book",
      },
    });

    // Categories
    for (const c of CATEGORIES) {
      await db.businessCategory.create({ data: { locationId: loc.id, categoryName: c.name, isPrimary: c.primary } });
    }

    // Services
    for (const s of SERVICES_LIST) {
      await db.service.create({ data: { locationId: loc.id, serviceName: s.name, description: s.desc, category: s.category, status: "active" } });
    }

    // Products
    for (const p of PRODUCTS_LIST) {
      await db.product.create({ data: { locationId: loc.id, productName: p.name, category: p.category, price: p.price, currency: "INR", status: "active" } });
    }

    // Attributes
    for (const a of ATTRIBUTES) {
      await db.businessAttribute.create({ data: { locationId: loc.id, attributeName: a.name, attributeValue: a.value } });
    }

    // Business Hours
    for (const h of BUSINESS_HOURS) {
      await db.businessHour.create({ data: { locationId: loc.id, dayOfWeek: h.day, openTime: h.open, closeTime: h.close, isClosed: h.closed } });
    }

    // Special hours (a couple of holidays)
    await db.specialHour.create({ data: { locationId: loc.id, date: new Date("2025-08-15"), isClosed: true } });
    await db.specialHour.create({ data: { locationId: loc.id, date: new Date("2025-10-02"), isClosed: true } });

    // Business Photos (using placeholder image URLs)
    for (let p = 0; p < 4 + rand(i + 3, 4); p++) {
      await db.businessPhoto.create({
        data: {
          locationId: loc.id,
          googlePhotoId: `photo_${loc.id}_${p}`,
          imageUrl: `https://placehold.co/600x400/059669/ffffff?text=MyFNG+${L.city}+${p + 1}`,
          thumbnailUrl: `https://placehold.co/150x150/059669/ffffff?text=${L.city}`,
          source: pick(["manual", "google", "ai"], p),
          status: "active",
        },
      });
    }
  }

  // Assign branch manager to Thane + Mumbai
  await db.user.update({
    where: { id: createdUsers[2].id },
    data: { assignedLocationIds: [createdLocations[0].id, createdLocations[2].id].join(",") },
  });

  // ── Reviews + ReviewReplies + Labels ──────────────────────────────
  let reviewSeed = 100;
  for (let li = 0; li < createdLocations.length; li++) {
    const loc = createdLocations[li];
    const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId: loc.id } });
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
      const review = await db.review.create({
        data: {
          locationId: loc.id,
          profileId: gbp?.id,
          googleReviewId: `rev_${loc.city.toLowerCase().replace(/\s+/g, "")}_${reviewSeed}`,
          authorName: pick(REVIEW_AUTHORS, reviewSeed),
          authorPhoto: null,
          rating,
          text,
          sentiment,
          sentimentScore: sentiment === "positive" ? 0.7 + rand(reviewSeed, 30) / 100 : sentiment === "negative" ? -0.7 - rand(reviewSeed, 30) / 100 : 0,
          replyText,
          replySource: replied ? (rand(reviewSeed, 2) === 0 ? "ai" : "manual") : null,
          replyStatus: replied ? "replied" : (rating <= 2 ? "pending" : (rand(reviewSeed, 2) === 0 ? "pending" : "ignored")),
          repliedAt: replied ? new Date(createdAt.getTime() + 36 * 60 * 60 * 1000) : null,
          createdAt,
        },
      });

      // Labels
      if (sentiment === "positive") await db.reviewLabel.create({ data: { reviewId: review.id, label: "Appreciation" } });
      if (sentiment === "negative") {
        await db.reviewLabel.create({ data: { reviewId: review.id, label: "Complaint" } });
        if (rand(reviewSeed, 2) === 0) await db.reviewLabel.create({ data: { reviewId: review.id, label: "Delayed Service" } });
        else await db.reviewLabel.create({ data: { reviewId: review.id, label: "Pricing" } });
      }

      // Review reply record (for replied reviews)
      if (replied) {
        await db.reviewReply.create({
          data: {
            reviewId: review.id,
            replyText: replyText!,
            replySource: rand(reviewSeed, 2) === 0 ? "ai" : "manual",
            publishedBy: createdUsers[3].id,
            createdBy: createdUsers[3].id,
            googleReplyTime: new Date(createdAt.getTime() + 36 * 60 * 60 * 1000),
            status: "published",
          },
        });
      }
    }
  }

  // ── Review Reply Templates ────────────────────────────────────────
  const templates = [
    { title: "Positive 5-star", rating: 5, template: "Hi {name}, thank you so much for your kind words! We're thrilled you loved your MyFNG experience. Welcome to the MyFNG family — reach us anytime at care@myfng.in." },
    { title: "Positive 4-star", rating: 4, template: "Hi {name}, thank you for the wonderful review! It was a pleasure working on your home. We'd love to see the final result — tag us @myfng on social!" },
    { title: "Neutral 3-star", rating: 3, template: "Hi {name}, thank you for your feedback. We're glad you're satisfied with the quality. We'd love to understand how we could have earned 5 stars — please write to care@myfng.in." },
    { title: "Negative - Delay", rating: 2, template: "Hi {name}, we sincerely apologise for the delay and inconvenience. This isn't our standard. Please write to care@myfng.in with your project ID and our escalation team will resolve this within 48 hours." },
    { title: "Negative - Quality", rating: 1, template: "Hi {name}, we're truly sorry to hear about the quality issue. We stand behind our work with a 5-year warranty. Please contact care@myfng.in so we can schedule a free inspection and fix." },
  ];
  for (const t of templates) {
    await db.reviewReplyTemplate.create({ data: { title: t.title, rating: t.rating, template: t.template, language: "en", isActive: true, createdBy: createdUsers[1].id } });
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
    const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId: loc.id } });
    const postCount = 2 + rand(li + 5, 4);
    for (let p = 0; p < postCount; p++) {
      const t = pick(postTopics, li + p);
      const statusBucket = rand(li + p + 3, 4);
      const status = statusBucket === 0 ? "draft" : statusBucket === 1 ? "scheduled" : "published";
      const createdAt = new Date(Date.now() - rand(li + p + 1, 40) * 24 * 60 * 60 * 1000);
      await db.post.create({
        data: {
          locationId: loc.id,
          profileId: gbp?.id,
          type: t.type,
          title: t.title,
          content: t.content,
          ctaType: t.ctaType,
          ctaUrl: "https://myfng.in/offers",
          imageUrl: rand(li + p, 3) === 0 ? `https://placehold.co/600x400/059669/ffffff?text=MyFNG+Post` : null,
          status,
          source: rand(li + p, 3) === 0 ? "ai" : "manual",
          authorId: createdUsers[1].id,
          scheduledAt: status === "scheduled" ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) : null,
          publishedAt: status === "published" ? createdAt : null,
          createdAt,
        },
      });
    }
  }

  // ── Analytics (daily, 30 days) + Monthly ──────────────────────────
  const today = new Date();
  for (const loc of createdLocations) {
    for (let d = 29; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const base = 60 + rand(loc.latitude! * 1000 + d, 220);
      await db.analyticDaily.create({
        data: {
          locationId: loc.id,
          date,
          searchViews: base + rand(d + 1, 80),
          mapsViews: Math.floor(base * 0.7) + rand(d + 2, 50),
          websiteClicks: Math.floor(base * 0.25) + rand(d + 3, 20),
          phoneCalls: Math.floor(base * 0.08) + rand(d + 4, 8),
          directionRequests: Math.floor(base * 0.12) + rand(d + 5, 12),
          bookings: Math.floor(base * 0.03) + rand(d + 6, 4),
        },
      });
    }
    // Monthly aggregates
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);
    await db.analyticsMonthly.create({
      data: {
        locationId: loc.id,
        month: monthAgo.getMonth() + 1,
        year: monthAgo.getFullYear(),
        totalViews: 2000 + rand(loc.latitude! * 100, 3000),
        websiteClicks: 500 + rand(loc.latitude! * 100, 800),
        phoneCalls: 150 + rand(loc.latitude! * 100, 200),
        directionRequests: 200 + rand(loc.latitude! * 100, 250),
        totalReviews: 8 + rand(loc.latitude! * 100, 20),
        averageRating: loc.avgRating,
      },
    });
  }

  // ── Keywords + Geo-grid + Competitors ─────────────────────────────
  for (const loc of createdLocations) {
    for (const kw of KEYWORDS_BY_CITY) {
      const keyword = kw.replace("{city}", loc.city);
      const k = await db.keyword.create({
        data: { locationId: loc.id, keyword, city: loc.city, state: "Maharashtra", status: "active" },
      });
      // 5x5 geo grid
      for (let gx = -2; gx <= 2; gx++) {
        for (let gy = -2; gy <= 2; gy++) {
          const lat = (loc.latitude ?? 19) + gy * 0.012;
          const lng = (loc.longitude ?? 73) + gx * 0.012;
          const rankBucket = Math.abs(gx) + Math.abs(gy);
          const rank = rankBucket === 0 ? 1 + rand(gx + 5, 2) : rankBucket === 1 ? 1 + rand(gx + 6, 5) : rankBucket === 2 ? 3 + rand(gx + 7, 8) : rankBucket === 3 ? 8 + rand(gx + 8, 12) : 15 + rand(gx + 9, 20);
          await db.keywordRanking.create({
            data: { keywordId: k.id, locationId: loc.id, lat, lng, rank, searchDate: new Date(), checkedAt: new Date() },
          });
          await db.geoGridResult.create({
            data: { keywordId: k.id, latitude: lat, longitude: lng, ranking: rank, checkedAt: new Date() },
          });
        }
      }
    }

    // Competitors + rankings
    for (let ci = 0; ci < COMPETITORS.length; ci++) {
      const c = COMPETITORS[ci];
      const comp = await db.competitor.create({
        data: {
          locationId: loc.id,
          businessName: c.name,
          googlePlaceId: `comp_${loc.id}_${ci}`,
          category: c.category,
          address: `${c.name}, ${loc.city}`,
          latitude: (loc.latitude ?? 19) + (ci + 1) * 0.005,
          longitude: (loc.longitude ?? 73) + (ci + 1) * 0.005,
          isActive: true,
        },
      });
      // Competitor rankings for first keyword of this location
      const firstKw = await db.keyword.findFirst({ where: { locationId: loc.id } });
      if (firstKw) {
        await db.competitorRanking.create({
          data: { competitorId: comp.id, keywordId: firstKw.id, ranking: 3 + rand(ci + loc.latitude! * 10, 15), checkedAt: new Date() },
        });
      }
    }

    // SEO Audit
    await db.seoAudit.create({
      data: {
        locationId: loc.id,
        auditScore: loc.healthScore,
        profileStrength: loc.visibilityScore,
        missingCategoriesJson: JSON.stringify(rand(loc.latitude! * 10, 3) === 0 ? ["Kitchen Furniture Store"] : []),
        missingPhotos: rand(loc.latitude! * 10, 5),
        missingServices: rand(loc.latitude! * 10, 3),
        recommendationsJson: JSON.stringify(["Add more photos of completed projects", "Update business hours for holidays", "Respond to all pending reviews within 24h"]),
      },
    });
  }

  // ── Media Library ─────────────────────────────────────────────────
  const mediaBuckets = ["business-photos", "post-images", "reports", "ai-generated"];
  for (let m = 0; m < 30; m++) {
    const loc = pick(createdLocations, m);
    await db.mediaLibrary.create({
      data: {
        locationId: loc.id,
        fileName: `media_${loc.city.toLowerCase()}_${m}.jpg`,
        bucket: pick(mediaBuckets, m),
        fileUrl: `https://placehold.co/600x400/059669/ffffff?text=Media+${m}`,
        mimeType: "image/jpeg",
        fileSize: 200000 + rand(m, 800000),
        uploadedBy: createdUsers[1].id,
        aiGenerated: rand(m, 4) === 0,
      },
    });
  }

  // ── Reports ───────────────────────────────────────────────────────
  const reportTypes = ["daily", "weekly", "monthly", "quarterly"];
  for (let r = 0; r < 20; r++) {
    const loc = pick(createdLocations, r);
    const type = pick(reportTypes, r);
    await db.report.create({
      data: {
        reportType: type,
        locationId: loc.id,
        reportName: `MyFNG ${loc.city} ${type} report — ${new Date(Date.now() - r * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN")}`,
        fileUrl: `https://myfng.in/reports/${type}_${loc.id}_${r}.pdf`,
        generatedBy: createdUsers[1].id,
      },
    });
  }

  // ── AI Jobs + Suggestions + Usage ─────────────────────────────────
  for (let a = 0; a < 25; a++) {
    const jobTypes = ["review_reply", "google_post", "seo_audit", "monthly_report", "suggestion"];
    await db.aiJob.create({
      data: {
        jobType: pick(jobTypes, a),
        entityType: pick(["review", "post", "location"], a),
        entityId: `ent_${a}`,
        model: "glm-4.6",
        tokens: 200 + rand(a, 1800),
        durationMs: 2000 + rand(a, 12000),
        status: rand(a, 8) === 0 ? "failed" : "completed",
        createdBy: createdUsers[1].id,
      },
    });
  }

  const aiSugs = [
    { category: "review", title: "12 reviews awaiting reply", desc: "5 are 1-2 star. Respond within 24h to protect local SEO.", priority: "critical" },
    { category: "seo", title: "Ranking dropped on 'modular kitchen mumbai'", desc: "Position slipped from #2 to #7. Refresh photos and publish a post.", priority: "high" },
    { category: "post", title: "3 locations haven't posted in 14 days", desc: "Vasai, Virar, Badlapur need fresh content. Generate with MiSA AI.", priority: "medium" },
    { category: "profile", title: "Incomplete business info on Mira Road", desc: "Missing 2 services and 3 attributes. Complete for better visibility.", priority: "medium" },
    { category: "performance", title: "Nashik call volume down 18%", desc: "Investigate phone tracking and consider call-only campaign.", priority: "low" },
  ];
  for (const s of aiSugs) {
    await db.aiSuggestion.create({ data: { category: s.category, title: s.title, description: s.desc, priority: s.priority, status: "pending" } });
  }

  // AI usage for last 7 days
  for (let d = 0; d < 7; d++) {
    const date = new Date(today); date.setDate(today.getDate() - d); date.setHours(0, 0, 0, 0);
    await db.aiUsage.create({
      data: { usageDate: date, model: "glm-4.6", totalRequests: 20 + rand(d, 60), totalTokens: 8000 + rand(d, 40000), estimatedCost: (0.5 + rand(d, 3)) as any },
    });
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

  // ── Audit + Activity Logs ─────────────────────────────────────────
  const auditActions = [
    { action: "login", entity: "auth", module: "auth" },
    { action: "review.reply", entity: "review", module: "reviews" },
    { action: "post.publish", entity: "post", module: "posts" },
    { action: "ai.generate", entity: "ai", module: "ai" },
    { action: "sync.run", entity: "location", module: "sync" },
    { action: "settings.update", entity: "settings", module: "settings" },
  ];
  for (let i = 0; i < 30; i++) {
    const a = pick(auditActions, i);
    const u = pick(createdUsers, i);
    await db.auditLog.create({
      data: {
        userId: u.id, userName: u.name, action: a.action, entity: a.entity, entityId: `ent_${i}`,
        status: rand(i, 8) === 0 ? "failed" : "success", ip: `10.0.${rand(i, 20)}.${rand(i + 3, 200)}`,
        createdAt: new Date(Date.now() - i * 3 * 60 * 60 * 1000),
      },
    });
    await db.activityLog.create({
      data: {
        userId: u.id, module: a.module, action: a.action, entityType: a.entity, entityId: `ent_${i}`,
        ipAddress: `10.0.${rand(i, 20)}.${rand(i + 3, 200)}`, userAgent: "Mozilla/5.0 (Chrome)",
        createdAt: new Date(Date.now() - i * 3 * 60 * 60 * 1000),
      },
    });
  }

  // ── Sync Logs ─────────────────────────────────────────────────────
  const syncModules = ["reviews", "posts", "profile", "analytics", "photos"];
  for (let i = 0; i < 25; i++) {
    const loc = pick(createdLocations, i);
    const mod = pick(syncModules, i);
    const status = rand(i, 5) === 0 ? "failed" : "success";
    const startedAt = new Date(Date.now() - i * 2 * 60 * 60 * 1000);
    await db.syncLog.create({
      data: {
        module: mod, locationId: loc.id, startedAt,
        completedAt: new Date(startedAt.getTime() + 5000 + rand(i, 20000)),
        status,
        recordsProcessed: 10 + rand(i, 100),
        recordsInserted: rand(i, 20),
        recordsUpdated: rand(i, 30),
        recordsFailed: status === "failed" ? 1 + rand(i, 5) : 0,
        errorMessage: status === "failed" ? "OAuth token expired" : null,
      },
    });
  }

  // ── Background Jobs + Scheduled Jobs ──────────────────────────────
  const jobStatuses = ["queued", "processing", "completed", "failed", "retrying"];
  const queues = ["google-sync", "review-sync", "analytics-sync", "ai-processing", "notifications", "reports"];
  for (let i = 0; i < 20; i++) {
    await db.backgroundJob.create({
      data: {
        queueName: pick(queues, i), jobName: `${pick(queues, i)}-job-${i}`,
        status: pick(jobStatuses, i), attempts: 1 + rand(i, 3),
        startedAt: new Date(Date.now() - i * 30 * 60 * 1000),
        completedAt: rand(i, 3) === 0 ? null : new Date(Date.now() - i * 30 * 60 * 1000 + 60000),
        errorMessage: rand(i, 5) === 0 ? "Rate limit exceeded" : null,
      },
    });
  }

  const cronJobs = [
    { name: "Review Sync", cron: "*/5 * * * *", enabled: true },
    { name: "Business Profile Sync", cron: "*/30 * * * *", enabled: true },
    { name: "Analytics Sync", cron: "0 2 * * *", enabled: true },
    { name: "Dashboard Cache Refresh", cron: "*/15 * * * *", enabled: true },
    { name: "Cleanup Logs", cron: "0 3 * * 0", enabled: true },
    { name: "Generate Daily Report", cron: "0 3 * * *", enabled: true },
    { name: "AI Suggestions", cron: "0 8 * * *", enabled: true },
  ];
  for (const j of cronJobs) {
    await db.scheduledJob.create({
      data: {
        jobName: j.name, cronExpression: j.cron, isEnabled: j.enabled,
        lastRun: new Date(Date.now() - 30 * 60 * 1000),
        nextRun: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }

  // ── Error Logs ────────────────────────────────────────────────────
  const errors = [
    { module: "google-sync", code: "OAUTH_EXPIRED", msg: "Google OAuth token expired for Bhiwandi location" },
    { module: "ai-processing", code: "TIMEOUT", msg: "AI request timed out after 30s" },
    { module: "analytics-sync", code: "API_LIMIT", msg: "Google Business Profile API quota exceeded" },
  ];
  for (let i = 0; i < errors.length; i++) {
    await db.errorLog.create({
      data: { module: errors[i].module, errorCode: errors[i].code, errorMessage: errors[i].msg, resolved: i > 1, createdAt: new Date(Date.now() - i * 60 * 60 * 1000) },
    });
  }

  // ── API Tokens ────────────────────────────────────────────────────
  const tokens = [
    { provider: "google", name: "Google Business Profile", status: "active" },
    { provider: "openai", name: "MiSA AI (glm-4.6)", status: "active" },
    { provider: "smtp", name: "Email Notifications", status: "active" },
    { provider: "supabase", name: "Supabase Service Role", status: "active" },
  ];
  for (const t of tokens) {
    await db.apiToken.create({ data: { provider: t.provider, tokenName: t.name, encryptedValue: "encrypted_placeholder", status: t.status, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } });
  }

  // ── Storage Files ─────────────────────────────────────────────────
  const storageBuckets = ["business-photos", "post-images", "reports", "exports", "documents", "ai-cache"];
  for (let i = 0; i < 15; i++) {
    await db.storageFile.create({
      data: { bucket: pick(storageBuckets, i), objectName: `obj_${i}`, originalName: `file_${i}.jpg`, mimeType: pick(["image/jpeg", "image/png", "application/pdf"], i), fileSize: 100000 + rand(i, 900000) },
    });
  }

  // ── Dashboard Widgets ─────────────────────────────────────────────
  const widgets = [
    { key: "overview", title: "Business Overview", order: 1 },
    { key: "reviews", title: "Latest Reviews", order: 2 },
    { key: "analytics", title: "Analytics", order: 3 },
    { key: "keyword_rankings", title: "Keyword Rankings", order: 4 },
    { key: "latest_posts", title: "Latest Posts", order: 5 },
    { key: "notifications", title: "Notifications", order: 6 },
    { key: "ai_suggestions", title: "AI Suggestions", order: 7 },
  ];
  for (const w of widgets) {
    await db.dashboardWidget.create({ data: { widgetKey: w.key, title: w.title, displayOrder: w.order, isEnabled: true } });
  }

  // ── User Preferences ──────────────────────────────────────────────
  for (const u of createdUsers) {
    await db.userPreference.create({ data: { userId: u.id, theme: "light", language: "en", timezone: "Asia/Kolkata", defaultDashboard: "dashboard" } });
  }

  // ── Settings ──────────────────────────────────────────────────────
  await db.setting.create({ data: { key: "brand", value: JSON.stringify({ name: "MyFNG", tagline: "Home Interiors & Services", supportEmail: "care@myfng.in", supportPhone: "+91 22 4000 1000" }) } });
  await db.setting.create({ data: { key: "ai", value: JSON.stringify({ assistantName: "MiSA AI", defaultModel: "glm-4.6", autoApprove: false, maxTokensPerDay: 200000 }) } });
  await db.setting.create({ data: { key: "sync", value: JSON.stringify({ reviewsInterval: "5m", businessInfoInterval: "30m", postsInterval: "30m", analyticsInterval: "daily" }) } });

  console.log("Seed complete.");
  console.log("Login: admin@myfng.in / marketing@myfng.in / thane@myfng.in / support@myfng.in / viewer@myfng.in | password: MyFNG@2025");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
