export type ProfileStrengthMetricKey =
  | "onPage"
  | "content"
  | "review"
  | "sentiment"
  | "website"
  | "ranking"
  | "traffic";

export interface ProfileStrengthItem {
  text: string;
  ok: boolean;
}

export interface ProfileStrengthMetric {
  key: ProfileStrengthMetricKey;
  label: string;
  shortLabel: string;
  score: number | null;
  scorePercent: number | null;
  status: "pass" | "warn" | "fail" | "unavailable";
  items: ProfileStrengthItem[];
  dataAvailable: boolean;
}

export interface ProfileStrengthResult {
  overallScore: number | null;
  improvementAreas: number;
  metrics: ProfileStrengthMetric[];
}

export interface ProfileStrengthStats {
  photoCount: number;
  serviceCount: number;
  categoryCount: number;
  productCount: number;
  attributeCount: number;
  repliedReviewCount: number;
  recentPostsCount: number;
  totalPublishedPosts: number;
  analyticsSynced: boolean;
  analyticsDaysInRange: number;
}

export interface ProfileStrengthInput {
  location: {
    name: string;
    reviewCount: number;
    avgRating: number;
    visibilityScore: number;
  };
  googleProfile: {
    verificationState?: string;
    businessInfo?: { appointmentUrl?: string | null; website?: string | null } | null;
  } | null;
  completeness: {
    checklist: {
      description: boolean;
      categories: boolean;
      attributes: boolean;
      website: boolean;
    };
  };
  healthBreakdown: {
    googleRating: number;
    reviewResponseRate: number;
    recentPosts: number;
    seoScore: number;
  };
  analytics30d: {
    searchViews: number | null;
    mapsViews: number | null;
    websiteClicks: number | null;
    phoneCalls?: number | null;
    synced?: boolean;
  };
  photos: unknown[];
  services: unknown[];
  stats: ProfileStrengthStats;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toTen(score100: number): number {
  return Math.round((score100 / 10) * 100) / 100;
}

function statusFromPercent(p: number): "pass" | "warn" | "fail" {
  if (p >= 75) return "pass";
  if (p >= 50) return "warn";
  return "fail";
}

function makeMetric(
  key: ProfileStrengthMetricKey,
  label: string,
  shortLabel: string,
  scorePercent: number | null,
  items: ProfileStrengthItem[],
  dataAvailable = true,
): ProfileStrengthMetric {
  if (!dataAvailable || scorePercent == null) {
    return {
      key,
      label,
      shortLabel,
      score: null,
      scorePercent: null,
      status: "unavailable",
      items,
      dataAvailable: false,
    };
  }
  return {
    key,
    label,
    shortLabel,
    score: toTen(scorePercent),
    scorePercent,
    status: statusFromPercent(scorePercent),
    items,
    dataAvailable: true,
  };
}

export function computeProfileStrength(detail: ProfileStrengthInput): ProfileStrengthResult {
  const { location, googleProfile, completeness, healthBreakdown, analytics30d, photos, services, stats } = detail;
  const checklist = completeness.checklist;
  const photoCount = stats.photoCount || photos.length;
  const serviceCount = stats.serviceCount || services.length;
  const reviewResponseRate = location.reviewCount > 0
    ? clamp((stats.repliedReviewCount / location.reviewCount) * 100)
    : healthBreakdown.reviewResponseRate;

  const onPageItems: ProfileStrengthItem[] = [
    {
      text: googleProfile?.verificationState === "verified"
        ? "Business profile is verified on Google."
        : "Business profile is unverified — verify to improve trust.",
      ok: googleProfile?.verificationState === "verified",
    },
    {
      text: stats.categoryCount >= 2
        ? `${stats.categoryCount} categories configured on profile.`
        : stats.categoryCount === 1
          ? "Only primary category set — add relevant additional categories."
          : "No categories synced — run profile sync.",
      ok: stats.categoryCount >= 2,
    },
    {
      text: serviceCount >= 10
        ? `${serviceCount} services synced from Google.`
        : serviceCount >= 5
          ? `${serviceCount} services synced — add more for discoverability.`
          : serviceCount > 0
            ? `Only ${serviceCount} service(s) synced — add more services.`
            : "No services synced yet — run sync.",
      ok: serviceCount >= 5,
    },
    {
      text: stats.attributeCount >= 3
        ? `${stats.attributeCount} attributes filled (accessibility, amenities, etc.).`
        : stats.attributeCount > 0
          ? `${stats.attributeCount} attribute(s) synced — fill more amenities.`
          : "No attributes synced — fill wheelchair access, appointments, parking.",
      ok: stats.attributeCount >= 3 || checklist.attributes,
    },
    {
      text: googleProfile?.businessInfo?.appointmentUrl
        ? "Booking / appointment URL is present."
        : "Missing appointment or booking URL.",
      ok: !!googleProfile?.businessInfo?.appointmentUrl,
    },
  ];
  const onPagePercent = clamp(
    (onPageItems.filter((i) => i.ok).length / onPageItems.length) * 100,
  );

  const contentItems: ProfileStrengthItem[] = [
    {
      text: checklist.description
        ? "Business description is filled with useful detail."
        : "Add a complete business description with keywords.",
      ok: checklist.description,
    },
    {
      text: photoCount >= 10
        ? `${photoCount} photos synced — strong visual profile.`
        : photoCount >= 5
          ? `${photoCount} photos synced — upload more workshop images.`
          : photoCount > 0
            ? `${photoCount} photo(s) synced — listings with 10+ photos perform better.`
            : "No photos synced yet — run Photos sync from Google.",
      ok: photoCount >= 5,
    },
    {
      text: stats.recentPostsCount >= 2
        ? `${stats.recentPostsCount} post(s) in last 30 days (${stats.totalPublishedPosts} total published).`
        : stats.totalPublishedPosts > 0
          ? `${stats.totalPublishedPosts} published posts — none in last 30 days.`
          : "No Google Posts synced yet.",
      ok: stats.recentPostsCount >= 2,
    },
  ];
  const postingScore = clamp(Math.max(
    Math.min(100, stats.recentPostsCount * 25),
    Math.min(70, stats.totalPublishedPosts * 3),
  ));
  const contentPercent = clamp(
    (contentItems.filter((i) => i.ok).length / contentItems.length) * 100 * 0.55
      + postingScore * 0.45,
  );

  const reviewItems: ProfileStrengthItem[] = [
    {
      text: location.reviewCount >= 20
        ? `${location.reviewCount} reviews — strong social proof.`
        : location.reviewCount > 0
          ? `${location.reviewCount} review(s) — encourage happy customers to review.`
          : "No reviews synced yet.",
      ok: location.reviewCount >= 20,
    },
    {
      text: location.avgRating >= 4.0
        ? `Average rating ${location.avgRating.toFixed(1)}★ is healthy.`
        : location.avgRating > 0
          ? `Average rating ${location.avgRating.toFixed(1)}★ needs improvement.`
          : "No rating data yet.",
      ok: location.avgRating >= 4.0,
    },
    {
      text: reviewResponseRate >= 80
        ? `${reviewResponseRate}% response rate (${stats.repliedReviewCount}/${location.reviewCount} replied).`
        : location.reviewCount > 0
          ? `${reviewResponseRate}% response rate — reply to more reviews.`
          : "No reviews to respond to yet.",
      ok: reviewResponseRate >= 80,
    },
  ];
  const reviewPercent = location.reviewCount > 0
    ? clamp(
        healthBreakdown.googleRating * 0.35
          + Math.min(100, (location.reviewCount / 40) * 100) * 0.35
          + reviewResponseRate * 0.3,
      )
    : null;

  const sentimentItems: ProfileStrengthItem[] = [
    {
      text: location.avgRating >= 4.5
        ? `Customer sentiment is positive (${location.avgRating.toFixed(1)}★ avg).`
        : location.avgRating > 0
          ? `Monitor recent reviews — avg ${location.avgRating.toFixed(1)}★.`
          : "No sentiment data until reviews are synced.",
      ok: location.avgRating >= 4.5,
    },
    {
      text: reviewResponseRate >= 90
        ? `${reviewResponseRate}% reply rate improves customer trust.`
        : location.reviewCount > 0
          ? `${reviewResponseRate}% reply rate — respond to negative reviews promptly.`
          : "No review replies yet.",
      ok: reviewResponseRate >= 90,
    },
  ];
  const sentimentPercent = location.reviewCount > 0
    ? clamp(healthBreakdown.googleRating * 0.55 + reviewResponseRate * 0.45)
    : null;

  const websiteItems: ProfileStrengthItem[] = [
    {
      text: checklist.website
        ? "Website URL is linked on the profile."
        : "Add your website URL to the Google Business Profile.",
      ok: checklist.website,
    },
    {
      text: googleProfile?.businessInfo?.website
        ? "Google business info website is synced."
        : "Sync website in business information.",
      ok: !!googleProfile?.businessInfo?.website,
    },
  ];
  const websitePercent = clamp(
    (websiteItems.filter((i) => i.ok).length / websiteItems.length) * 100,
  );

  const rankingItems: ProfileStrengthItem[] = [
    {
      text: location.visibilityScore >= 60
        ? `Visibility score ${location.visibilityScore}/100 — decent local presence.`
        : `Visibility score ${location.visibilityScore}/100 — improve SEO signals.`,
      ok: location.visibilityScore >= 60,
    },
    {
      text: healthBreakdown.seoScore >= 50
        ? "SEO fundamentals are in place."
        : "Complete profile gaps to improve local rankings.",
      ok: healthBreakdown.seoScore >= 50,
    },
  ];
  const rankingPercent = clamp(location.visibilityScore);

  const analyticsAvailable = stats.analyticsSynced || analytics30d.synced === true;
  const searchViews = analytics30d.searchViews ?? 0;
  const mapsViews = analytics30d.mapsViews ?? 0;
  const websiteClicks = analytics30d.websiteClicks ?? 0;
  const phoneCalls = analytics30d.phoneCalls ?? 0;
  const totalTraffic = searchViews + mapsViews;

  const trafficItems: ProfileStrengthItem[] = analyticsAvailable
    ? [
        {
          text: totalTraffic > 0
            ? `${totalTraffic.toLocaleString("en-IN")} search + maps views in last 30 days.`
            : "No search or maps views in last 30 days — improve posts, photos, and keywords.",
          ok: totalTraffic > 50,
        },
        {
          text: websiteClicks > 0
            ? `${websiteClicks.toLocaleString("en-IN")} website clicks in last 30 days.`
            : "No website clicks in last 30 days — check website link and posts.",
          ok: websiteClicks > 0,
        },
        {
          text: phoneCalls > 0
            ? `${phoneCalls.toLocaleString("en-IN")} phone call clicks in last 30 days.`
            : "No phone call clicks recorded in last 30 days.",
          ok: phoneCalls > 0,
        },
      ]
    : [
        {
          text: "Analytics not synced for this location — run Analytics or Full sync to load traffic data.",
          ok: false,
        },
      ];
  const trafficPercent = analyticsAvailable
    ? clamp(Math.min(100, totalTraffic / 2.5 + websiteClicks * 2 + phoneCalls * 3))
    : null;

  const metrics: ProfileStrengthMetric[] = [
    makeMetric("onPage", "On Page Strength", "On Page", onPagePercent, onPageItems),
    makeMetric("content", "Content Strength", "Content", contentPercent, contentItems),
    makeMetric("review", "Review Strength", "Review", reviewPercent, reviewItems, location.reviewCount > 0),
    makeMetric("sentiment", "Sentiment Strength", "Sentiment", sentimentPercent, sentimentItems, location.reviewCount > 0),
    makeMetric("website", "Website Strength", "Website", websitePercent, websiteItems),
    makeMetric("ranking", "Ranking Strength", "Ranking", rankingPercent, rankingItems),
    makeMetric("traffic", "Traffic Strength", "Traffic", trafficPercent, trafficItems, analyticsAvailable),
  ];

  const scoredMetrics = metrics.filter((m) => m.dataAvailable && m.score != null);
  const overallScore = scoredMetrics.length > 0
    ? Math.round((scoredMetrics.reduce((s, m) => s + (m.score ?? 0), 0) / scoredMetrics.length) * 100) / 100
    : null;
  const improvementAreas = metrics.filter((m) => m.dataAvailable && m.score != null && m.score < 6).length;

  return { overallScore, improvementAreas, metrics };
}
