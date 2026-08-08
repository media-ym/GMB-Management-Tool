export type AutoPostType = "whats_new" | "update";
export type AutoPostTone = "professional" | "friendly" | "local";

export interface AutoPostConfig {
  enabled: boolean;
  postType: AutoPostType;
  tone: AutoPostTone;
  /** Hour in IST (0–23) when daily cron should run */
  runHourIST: number;
  keywordCount: number;
  attachImage: boolean;
  ctaType: "book" | "call" | "learn_more";
  skipIfPostedToday: boolean;
  updatedAt?: string;
}

export const DEFAULT_AUTO_POST_CONFIG: AutoPostConfig = {
  enabled: false,
  postType: "whats_new",
  tone: "friendly",
  runHourIST: 7,
  keywordCount: 3,
  attachImage: false,
  ctaType: "call",
  skipIfPostedToday: true,
};

export const AUTO_POST_SETTING_KEY = "auto_post_daily";

export function mergeAutoPostConfig(
  raw: Partial<AutoPostConfig> | null | undefined,
): AutoPostConfig {
  return {
    ...DEFAULT_AUTO_POST_CONFIG,
    ...raw,
    runHourIST:
      raw?.runHourIST != null && raw.runHourIST >= 0 && raw.runHourIST <= 23
        ? raw.runHourIST
        : DEFAULT_AUTO_POST_CONFIG.runHourIST,
    keywordCount:
      raw?.keywordCount != null && raw.keywordCount >= 1
        ? Math.min(raw.keywordCount, 8)
        : DEFAULT_AUTO_POST_CONFIG.keywordCount,
  };
}

/** Topic angles when keywords are sparse — rotated per location/day. */
export const AUTO_POST_TOPIC_ANGLES = [
  "Seasonal car care tips for local drivers",
  "Why regular service at a trusted workshop matters",
  "Common monsoon car maintenance reminders",
  "AC performance and cabin comfort before summer heat",
  "Brake safety and periodic inspection benefits",
  "Battery and electrical checks for city driving",
  "Tyre health, alignment and fuel efficiency",
  "Genuine parts vs shortcuts — long-term savings",
  "Express service options for busy professionals",
  "Multi-brand expertise under one roof",
] as const;

export type IndiaSeason = "summer" | "monsoon" | "post_monsoon" | "winter";

export interface IndiaSeasonContext {
  season: IndiaSeason;
  label: string;
  monthName: string;
  year: number;
  guidance: string;
  avoid: string;
}

const TZ = "Asia/Kolkata";

/** Current season in Maharashtra (Mumbai / Pune / Thane) for accurate auto-post copy. */
export function getIndiaSeasonContext(now = new Date()): IndiaSeasonContext {
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "numeric" }).format(now),
  );
  const monthName = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long" }).format(now);
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(now));

  if (month >= 3 && month <= 5) {
    return {
      season: "summer",
      label: "Summer",
      monthName,
      year,
      guidance:
        "Focus on heat, AC cooling, coolant, overheating prevention, and long-drive readiness in hot weather.",
      avoid: "Do NOT mention monsoon rains, flooding, or wet-road monsoon tips.",
    };
  }
  if (month >= 6 && month <= 9) {
    return {
      season: "monsoon",
      label: "Monsoon / rainy season",
      monthName,
      year,
      guidance:
        "Focus on monsoon driving: wet roads, wipers, brakes, tyre grip, water logging, underbody rust, humid cabin/AC, battery and electrical checks. Mumbai/Pune rain context is appropriate.",
      avoid:
        "Do NOT mention summer heat, scorching temperatures, pre-summer AC prep, or heatwaves — it is rainy season now, not summer.",
    };
  }
  if (month === 10 || month === 11) {
    return {
      season: "post_monsoon",
      label: "Post-monsoon",
      monthName,
      year,
      guidance:
        "Focus on post-rain car check-up: underbody clean, brake inspection after wet season, tyres, alignment, and festival-season travel readiness.",
      avoid: "Do NOT describe active heavy monsoon or peak summer heat as if they are happening now.",
    };
  }
  return {
    season: "winter",
    label: "Winter",
    monthName,
    year,
    guidance:
      "Focus on cooler weather care: battery health, tyre pressure, defogging, heaters where relevant, and safe early-morning driving.",
    avoid: "Do NOT mention monsoon flooding or peak summer heat as the current season.",
  };
}

const SEASON_TOPIC_ANGLES: Record<IndiaSeason, readonly string[]> = {
  summer: [
    "AC performance and cabin comfort in peak summer heat",
    "Coolant, radiator and overheating prevention tips",
    "Summer long-drive checklist for highway trips",
    "Tyre pressure and battery care in hot weather",
    "Express service to beat the summer rush",
  ],
  monsoon: [
    "Monsoon car care: wipers, brakes and wet-road safety",
    "Protecting your car from water logging and underbody rust",
    "Tyre grip and alignment during heavy Mumbai rains",
    "Battery and electrical checks in humid monsoon weather",
    "AC cabin freshness and defogging during rainy season",
    "Pre-festival monsoon service for worry-free drives",
  ],
  post_monsoon: [
    "Post-monsoon inspection: brakes, underbody and tyres",
    "Festival-season travel readiness for your car",
    "Clearing monsoon damage: rust spots and damp interiors",
    "Alignment and suspension check after pothole season",
  ],
  winter: [
    "Winter morning starts and battery health",
    "Defogging, visibility and safe driving in cooler weather",
    "Tyre pressure checks as temperatures drop",
    "End-of-year full service for a fresh start",
  ],
};

export function getSeasonTopicAngles(season: IndiaSeason): readonly string[] {
  return SEASON_TOPIC_ANGLES[season];
}

export function pickSeasonTopicAngle(locationId: string, dayKey: string, season: IndiaSeason): string {
  const angles = getSeasonTopicAngles(season);
  const seed =
    locationId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) +
    dayKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return angles[seed % angles.length];
}
