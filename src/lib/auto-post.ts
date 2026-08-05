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
  attachImage: true,
  ctaType: "book",
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
