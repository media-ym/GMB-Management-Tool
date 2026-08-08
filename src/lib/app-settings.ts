import { db } from "@/lib/db";

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 15_000;

export async function getSettingValue<T = unknown>(key: string): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  const row = await db.setting.findUnique({ where: { key } });
  if (!row?.value) {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
  try {
    const parsed = JSON.parse(row.value) as T;
    cache.set(key, { at: Date.now(), value: parsed });
    return parsed;
  } catch {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
}

export function invalidateSettingCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}

export type SmtpConfig = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  encryption?: "None" | "TLS" | "SSL" | string;
  senderName?: string;
  senderEmail?: string;
};

export type SyncConfig = {
  reviewsInterval?: string;
  businessInfoInterval?: string;
  postsInterval?: string;
  analyticsInterval?: string;
  retryAttempts?: number;
  retryDelay?: number;
  batchSize?: number;
};

export type SecurityConfig = {
  sessionTimeout?: number;
  jwtExpiry?: number;
  maxFailedAttempts?: number;
  lockDuration?: number;
};

export type AiConfig = {
  assistantName?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retryCount?: number;
  autoApprove?: boolean;
  maxTokensPerDay?: number;
};

export type BrandConfig = {
  name?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  logoUrl?: string;
  timezone?: string;
  language?: string;
  dateFormat?: string;
  currency?: string;
};

export type NotifEventConfig = { email: boolean; dashboard: boolean };
export type NotificationsConfig = {
  emailChannel?: boolean;
  events?: Record<string, NotifEventConfig>;
};

export type AiPromptDef = {
  id: string;
  name: string;
  description: string;
  version: string;
  variables: string[];
  active: boolean;
  lastModified: string;
  template: string;
};

/** Parse UI interval strings like 5m, 30m, 1h, hourly, daily, weekly → ms */
export function parseIntervalMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const v = value.trim().toLowerCase();
  if (v === "hourly") return 60 * 60 * 1000;
  if (v === "daily") return 24 * 60 * 60 * 1000;
  if (v === "weekly") return 7 * 24 * 60 * 60 * 1000;
  const m = /^(\d+)\s*(m|min|mins|h|hr|hrs|d)$/.exec(v);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith("m")) return n * 60 * 1000;
  if (unit.startsWith("h")) return n * 60 * 60 * 1000;
  if (unit.startsWith("d")) return n * 24 * 60 * 60 * 1000;
  return fallbackMs;
}

export function intervalToCronHint(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 5) return "*/5 * * * *";
  if (mins <= 15) return "*/15 * * * *";
  if (mins <= 30) return "*/30 * * * *";
  if (mins <= 60) return "0 * * * *";
  if (mins <= 120) return "0 */2 * * *";
  if (mins <= 360) return "0 */6 * * *";
  return "0 2 * * *";
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  return (await getSettingValue<SmtpConfig>("smtp")) ?? {};
}

export async function getSyncConfig(): Promise<SyncConfig> {
  return (
    (await getSettingValue<SyncConfig>("sync")) ?? {
      reviewsInterval: "2h",
      businessInfoInterval: "2h",
      postsInterval: "2h",
      analyticsInterval: "daily",
      retryAttempts: 3,
      retryDelay: 60,
      batchSize: 4,
    }
  );
}

export async function getSecurityConfig(): Promise<Required<
  Pick<SecurityConfig, "maxFailedAttempts" | "lockDuration" | "jwtExpiry" | "sessionTimeout">
>> {
  const s = (await getSettingValue<SecurityConfig>("security")) ?? {};
  return {
    maxFailedAttempts: Math.max(1, Number(s.maxFailedAttempts) || 5),
    lockDuration: Math.max(1, Number(s.lockDuration) || 15), // minutes
    jwtExpiry: Math.max(1, Number(s.jwtExpiry) || 8), // hours
    sessionTimeout: Math.max(5, Number(s.sessionTimeout) || 30), // minutes idle (informational)
  };
}

export async function getAiConfig(): Promise<AiConfig> {
  return (await getSettingValue<AiConfig>("ai")) ?? {};
}

export async function getBrandConfig(): Promise<BrandConfig> {
  return (await getSettingValue<BrandConfig>("brand")) ?? {};
}

export async function getNotificationsConfig(): Promise<NotificationsConfig> {
  return (await getSettingValue<NotificationsConfig>("notifications")) ?? {};
}

export const DEFAULT_AI_PROMPTS: AiPromptDef[] = [
  {
    id: "review-reply",
    name: "Review Reply",
    description: "AI-generated responses to customer reviews.",
    version: "1.2.0",
    variables: ["customer_name", "rating", "location_name", "review_text"],
    active: true,
    lastModified: new Date(0).toISOString(),
    template:
      'You are MiSA, an AI assistant for {location_name}. Write a professional, empathetic reply to a {rating}-star review from {customer_name}. Review text: "{review_text}". Keep the reply under 80 words, warm and concise.',
  },
  {
    id: "google-posts",
    name: "Google Posts",
    description: "Generate Whats New, offer & event posts.",
    version: "1.1.0",
    variables: ["location_name", "post_type", "topic", "cta"],
    active: true,
    lastModified: new Date(0).toISOString(),
    template:
      "You are MiSA. Create a {post_type} post for {location_name} about {topic}. Include a clear {cta}. Keep it under 100 words and engaging.",
  },
  {
    id: "seo-recommendations",
    name: "SEO Recommendations",
    description: "Generate actionable SEO improvement suggestions.",
    version: "1.0.3",
    variables: ["location_name", "current_score", "missing_categories"],
    active: true,
    lastModified: new Date(0).toISOString(),
    template:
      "You are MiSA, an SEO expert. For {location_name} (current SEO score: {current_score}), generate 5 prioritized recommendations. Missing: {missing_categories}. Format as a numbered list with rationale.",
  },
  {
    id: "business-description",
    name: "Business Description",
    description: "Generate GBP business descriptions.",
    version: "1.0.0",
    variables: ["location_name", "city", "services", "usp"],
    active: false,
    lastModified: new Date(0).toISOString(),
    template:
      "Write a 750-character business description for {location_name} in {city}. Services: {services}. USP: {usp}. Tone: professional yet approachable.",
  },
  {
    id: "monthly-reports",
    name: "Monthly Reports",
    description: "Summarize monthly performance into a narrative.",
    version: "2.0.1",
    variables: ["location_name", "month", "metrics_summary", "highlights"],
    active: true,
    lastModified: new Date(0).toISOString(),
    template:
      "You are MiSA. Generate a monthly performance report for {location_name} for {month}. Metrics: {metrics_summary}. Highlights: {highlights}. Structure: Executive summary, wins, challenges, recommendations.",
  },
  {
    id: "profile-audit",
    name: "Profile Audit",
    description: "Audit GBP completeness and surface gaps.",
    version: "1.0.2",
    variables: ["location_name", "completeness_score", "missing_fields"],
    active: true,
    lastModified: new Date(0).toISOString(),
    template:
      "Audit the GBP profile for {location_name}. Completeness: {completeness_score}%. Missing fields: {missing_fields}. List each gap with severity (high/medium/low) and suggested action.",
  },
];

export async function getAiPrompts(): Promise<AiPromptDef[]> {
  const saved = await getSettingValue<AiPromptDef[]>("ai_prompts");
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_AI_PROMPTS;
  const byId = new Map(saved.map((p) => [p.id, p]));
  return DEFAULT_AI_PROMPTS.map((d) => {
    const s = byId.get(d.id);
    return s ? { ...d, ...s, id: d.id, name: s.name || d.name } : d;
  });
}

export async function saveAiPrompt(prompt: AiPromptDef): Promise<AiPromptDef[]> {
  const current = await getAiPrompts();
  const next = current.map((p) => (p.id === prompt.id ? prompt : p));
  if (!next.some((p) => p.id === prompt.id)) next.push(prompt);
  await db.setting.upsert({
    where: { key: "ai_prompts" },
    create: { key: "ai_prompts", value: JSON.stringify(next), description: "AI prompt templates" },
    update: { value: JSON.stringify(next) },
  });
  invalidateSettingCache("ai_prompts");
  return next;
}
