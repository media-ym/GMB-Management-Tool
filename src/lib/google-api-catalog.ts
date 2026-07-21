/** Google & third-party APIs used by MyFNG — billing status and quota reference. */

export type BillingTier = "free" | "paid" | "conditional";

export interface GoogleApiCatalogEntry {
  id: string;
  name: string;
  serviceId: string;
  endpoint: string;
  purpose: string;
  billing: BillingTier;
  billingNote: string;
  quotaNote: string;
  usedFor: string[];
  consoleUrl: string;
}

export const GOOGLE_API_CATALOG: GoogleApiCatalogEntry[] = [
  {
    id: "oauth",
    name: "Google OAuth 2.0",
    serviceId: "oauth2.googleapis.com",
    endpoint: "https://oauth2.googleapis.com/token",
    purpose: "Connect Google Business Profile accounts",
    billing: "free",
    billingNote: "No per-request charge. OAuth is free for standard use.",
    quotaNote: "Token refresh rate-limited per client ID.",
    usedFor: ["Connect", "Token refresh", "Disconnect"],
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    id: "account-mgmt",
    name: "My Business Account Management API",
    serviceId: "mybusinessaccountmanagement.googleapis.com",
    endpoint: "https://mybusinessaccountmanagement.googleapis.com/v1",
    purpose: "List GBP accounts linked to OAuth user",
    billing: "free",
    billingNote: "Google Business Profile APIs are free — no per-call billing.",
    quotaNote: "~10 QPS per project; daily quota varies by endpoint.",
    usedFor: ["Account discovery", "Profile linking"],
    consoleUrl: "https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com",
  },
  {
    id: "business-info",
    name: "My Business Business Information API",
    serviceId: "mybusinessbusinessinformation.googleapis.com",
    endpoint: "https://mybusinessbusinessinformation.googleapis.com/v1",
    purpose: "Location profile, hours, categories, attributes",
    billing: "free",
    billingNote: "No charge for read/write within quota limits.",
    quotaNote: "Read ~2,000/min · Write ~150/min (project defaults).",
    usedFor: ["Location sync", "Profile edits", "Categories", "Hours"],
    consoleUrl: "https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com",
  },
  {
    id: "gbp-v4",
    name: "Google Business Profile API (v4)",
    serviceId: "mybusiness.googleapis.com",
    endpoint: "https://mybusiness.googleapis.com/v4",
    purpose: "Reviews, posts, media, service list",
    billing: "free",
    billingNote: "Legacy v4 endpoints remain free under GBP quota.",
    quotaNote: "~10 QPS; shared across all GBP calls in this app.",
    usedFor: ["Reviews", "Posts", "Photos", "Review replies"],
    consoleUrl: "https://console.cloud.google.com/apis/library/mybusiness.googleapis.com",
  },
  {
    id: "performance",
    name: "Business Profile Performance API",
    serviceId: "businessprofileperformance.googleapis.com",
    endpoint: "https://businessprofileperformance.googleapis.com/v1",
    purpose: "Search views, maps views, calls, direction requests",
    billing: "free",
    billingNote: "Analytics metrics are free via GBP Performance API.",
    quotaNote: "Metric fetch per location per day; batched in sync jobs.",
    usedFor: ["Analytics dashboard", "Daily metrics sync"],
    consoleUrl: "https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com",
  },
  {
    id: "verifications",
    name: "My Business Verifications API",
    serviceId: "mybusinessverifications.googleapis.com",
    endpoint: "https://mybusinessverifications.googleapis.com/v1",
    purpose: "Location verification status and initiation",
    billing: "free",
    billingNote: "Verification API calls are not billed separately.",
    quotaNote: "Low volume; used only during verification flows.",
    usedFor: ["Bulk verify", "Verification status"],
    consoleUrl: "https://console.cloud.google.com/apis/library/mybusinessverifications.googleapis.com",
  },
  {
    id: "userinfo",
    name: "Google UserInfo API",
    serviceId: "openidconnect.googleapis.com",
    endpoint: "https://www.googleapis.com/oauth2/v2/userinfo",
    purpose: "OAuth user email and profile after connect",
    billing: "free",
    billingNote: "Included with OAuth; no additional charge.",
    quotaNote: "Called once per OAuth connect.",
    usedFor: ["Google connect callback"],
    consoleUrl: "https://console.cloud.google.com/apis/credentials/consent",
  },
  {
    id: "misa-ai",
    name: "MiSA AI (Third-party)",
    serviceId: "misa-ai",
    endpoint: "Internal AI provider",
    purpose: "Review replies, content suggestions, SEO copy",
    billing: "paid",
    billingNote: "Token-based pricing — tracked in AI Usage. Not a Google API.",
    quotaNote: "Usage limits configurable in Settings.",
    usedFor: ["AI replies", "Content generation", "SEO suggestions"],
    consoleUrl: "/ai",
  },
];

export function billingTierLabel(tier: BillingTier): string {
  if (tier === "free") return "Free";
  if (tier === "paid") return "Paid";
  return "Conditional";
}
