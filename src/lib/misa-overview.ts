import type { ViewKey } from "@/lib/types";

export type MisaInsightCategory =
  | "visibility"
  | "reputation"
  | "sync"
  | "performance"
  | "content"
  | "reviews"
  | "seo";

export type MisaOverviewConfig = {
  /** Short tab label shown next to MiSA */
  tabLabel: string;
  /** One clear line: what MiSA helps with on this tab */
  helpLine: string;
  /** Short prompt chips (Hinglish, easy to scan) */
  prompts: string[];
  /** Insight categories to show; empty = all */
  categories: MisaInsightCategory[];
  /** Show Priority scan (dashboard only) */
  showPriorityScan?: boolean;
};

/** Tabs where MiSA overview strip is shown */
export const MISA_OVERVIEW_VIEWS: ViewKey[] = [
  "dashboard",
  "locations",
  "reviews",
  "analytics",
  "content-updates",
  "posts",
  "directories",
  "keywords",
  "competitors",
  "market-research",
  "seo",
  "media",
  "reports",
  "google",
  "notifications",
];

const CONFIG: Partial<Record<ViewKey, MisaOverviewConfig>> = {
  dashboard: {
    tabLabel: "Dashboard",
    helpLine: "Poora network check: kaunsi branch pe dikkat hai, aaj kya urgent hai.",
    prompts: [
      "Aaj ka priority kya hai?",
      "Kaunsi location weak hai?",
      "Reviews aur calls ka short summary",
    ],
    categories: [],
    showPriorityScan: true,
  },
  locations: {
    tabLabel: "Locations",
    helpLine: "Profile complete hai ya nahi, verify pending, phone/address sync.",
    prompts: [
      "Kaunsi locations unverified hain?",
      "Incomplete profiles list karo",
      "Sync error wali branches?",
    ],
    categories: ["sync", "visibility", "seo"],
  },
  reviews: {
    tabLabel: "Reviews",
    helpLine: "Pending replies, negative reviews, aur reply draft ke liye MiSA.",
    prompts: [
      "Pending negative replies kitne?",
      "Rating drop kahan hai?",
      "Ek polite reply draft likho",
    ],
    categories: ["reviews", "reputation"],
  },
  analytics: {
    tabLabel: "Analytics",
    helpLine: "Search/Maps views, calls, website clicks - kya up/down hai.",
    prompts: [
      "Last 30 days calls vs directions",
      "Kaunsi branch pe views gir rahe?",
      "Performance summary simple language mein",
    ],
    categories: ["performance", "visibility"],
  },
  "content-updates": {
    tabLabel: "Content",
    helpLine: "Posts, products, profile updates - kahan content stale hai.",
    prompts: [
      "30 din se post nahi hui?",
      "Naya GMB post idea do",
      "Profile description improve karo",
    ],
    categories: ["content", "seo"],
  },
  posts: {
    tabLabel: "Posts",
    helpLine: "Publish queue, post ideas, aur locations jo quiet hain.",
    prompts: [
      "Is hafta ke liye 3 post ideas",
      "Quiet locations list",
      "Offer post draft likho",
    ],
    categories: ["content"],
  },
  directories: {
    tabLabel: "Directories",
    helpLine: "Listing consistency across directories - missing ya mismatch.",
    prompts: [
      "Directory gaps batao",
      "NAP mismatch kahan ho sakta hai?",
    ],
    categories: ["seo", "visibility"],
  },
  keywords: {
    tabLabel: "Keywords",
    helpLine: "Search keywords aur ranking opportunities.",
    prompts: [
      "Top search keywords kaunse?",
      "Local keywords suggest karo",
    ],
    categories: ["seo", "visibility"],
  },
  competitors: {
    tabLabel: "Competitors",
    helpLine: "Competitors vs MyFNG - rating, reviews, visibility gap.",
    prompts: [
      "Competitors se kahan peeche hain?",
      "Unke vs humare reviews compare",
    ],
    categories: ["visibility", "reputation", "seo"],
  },
  "market-research": {
    tabLabel: "Market Research",
    helpLine: "Area demand, gaps, aur expansion ideas.",
    prompts: [
      "Is area mein opportunity kya hai?",
      "Service demand summary",
    ],
    categories: ["seo", "visibility", "performance"],
  },
  seo: {
    tabLabel: "SEO",
    helpLine: "Visibility score, categories, photos, local SEO fixes.",
    prompts: [
      "Lowest visibility locations?",
      "SEO quick wins list",
      "Categories / services improve tips",
    ],
    categories: ["seo", "visibility"],
  },
  media: {
    tabLabel: "Media",
    helpLine: "Photos missing? Kaunsi branch pe fresh media chahiye.",
    prompts: [
      "Photo-poor locations?",
      "Cover photo tips do",
    ],
    categories: ["content", "seo", "visibility"],
  },
  reports: {
    tabLabel: "Reports",
    helpLine: "Monthly summary, wins, aur next actions draft.",
    prompts: [
      "Is mahine ka executive summary",
      "Wins aur problems bullet points",
    ],
    categories: ["performance", "reviews", "content", "visibility"],
  },
  google: {
    tabLabel: "Google",
    helpLine: "OAuth, sync health, API errors - connection theek hai?",
    prompts: [
      "Google sync status check",
      "Kaunsi locations sync fail?",
    ],
    categories: ["sync"],
  },
  notifications: {
    tabLabel: "Alerts",
    helpLine: "Urgent alerts - reviews, sync, visibility.",
    prompts: [
      "Aaj ke top alerts summarize",
      "Pehle kya fix karun?",
    ],
    categories: ["reviews", "sync", "visibility", "reputation"],
  },
};

export function getMisaOverviewConfig(view: ViewKey): MisaOverviewConfig | null {
  if (!MISA_OVERVIEW_VIEWS.includes(view)) return null;
  return (
    CONFIG[view] ?? {
      tabLabel: "MyFNG",
      helpLine: "Is page ke data pe based tips aur quick questions.",
      prompts: ["Is page ka short summary do", "Abhi kya priority hai?"],
      categories: [],
    }
  );
}

export function filterMisaInsightsByView<
  T extends { category: string; impact: "high" | "medium" | "low" },
>(insights: T[], view: ViewKey): T[] {
  const cfg = getMisaOverviewConfig(view);
  if (!cfg) return [];
  const cats = cfg.categories;
  const filtered =
    cats.length === 0 ? insights : insights.filter((i) => cats.includes(i.category as MisaInsightCategory));
  const impactOrder = { high: 0, medium: 1, low: 2 } as const;
  return [...filtered].sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
}

/** Simple labels instead of HIGH IMPACT */
export function misaInsightToneLabel(type: string, impact: string): string {
  if (type === "critical" || impact === "high") return "Problem";
  if (type === "success") return "Good news";
  if (type === "info") return "Tip";
  return "Watch";
}
