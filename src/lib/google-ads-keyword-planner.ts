import { getValidAccessToken, getGoogleOAuthScopeStatus } from "@/lib/google-service";
import { db } from "@/lib/db";

/** Prefer newest; fall back if gateway returns HTML 404 */
const ADS_API_VERSIONS = ["v20", "v19", "v18"] as const;

/** Language: English */
export const LANGUAGE_ENGLISH = "1000";
/** Language: Hindi */
export const LANGUAGE_HINDI = "1001";

/** Geo: India */
export const GEO_INDIA = "2356";

const CITY_GEO: Record<string, string> = {
  mumbai: "1007785",
  "thane west": "1007785",
  thane: "1007785",
  "navi mumbai": "1007785",
  "mira road east": "1007785",
  "vile parle west": "1007785",
  kalyan: "1007785",
  "kalyan west": "1007785",
  "kalyan east": "1007785",
  dombivli: "1007785",
  pune: "1007788",
  delhi: "1007751",
  "new delhi": "1007751",
  bangalore: "1007745",
  bengaluru: "1007745",
  hyderabad: "1007765",
  chennai: "1007747",
  kolkata: "1007772",
  ahmedabad: "1007740",
};

export type KeywordIdea = {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: string;
  competitionIndex: number | null;
  lowBidInr: number | null;
  highBidInr: number | null;
};

export type KeywordIdeasResult = {
  ideas: KeywordIdea[];
  seed: string[];
  pageUrl?: string | null;
  geoLabel: string;
  geoTargetConstant: string;
  languageId: string;
  customerIdUsed: string;
  source: "google_ads";
};

function adsConfig() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/\D/g, "").trim();
  const loginCustomerId =
    (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "").trim() || null;
  return { developerToken, customerId, loginCustomerId };
}

export function isGoogleAdsConfigured(): boolean {
  const { developerToken, customerId } = adsConfig();
  return !!(developerToken && customerId);
}

export async function resolveGeoForLocation(locationId?: string | null): Promise<{
  geoTargetConstant: string;
  geoLabel: string;
}> {
  if (!locationId) {
    return { geoTargetConstant: GEO_INDIA, geoLabel: "India" };
  }
  const loc = await db.location.findUnique({
    where: { id: locationId },
    select: { city: true, name: true },
  });
  if (!loc) return { geoTargetConstant: GEO_INDIA, geoLabel: "India" };

  const cityKey = (loc.city || "").toLowerCase().trim();
  const geo = CITY_GEO[cityKey];
  if (geo) {
    return { geoTargetConstant: geo, geoLabel: loc.city || "Mumbai metro" };
  }
  return { geoTargetConstant: GEO_INDIA, geoLabel: loc.city ? `${loc.city}, India` : "India" };
}

function microsToInr(micros: number | string | null | undefined): number | null {
  if (micros == null || micros === "") return null;
  const n = typeof micros === "string" ? parseInt(micros, 10) : micros;
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 1_000_000) * 100) / 100;
}

function normalizeCompetition(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "UNSPECIFIED";
  return raw.replace(/^KEYWORD_PLAN_COMPETITION_LEVEL_/, "");
}

function extractAdsError(status: number, text: string, json: any): string {
  const detailErrors = json?.error?.details;
  if (Array.isArray(detailErrors)) {
    for (const d of detailErrors) {
      const errs = d?.errors;
      if (Array.isArray(errs) && errs[0]?.message) {
        const code = errs[0]?.errorCode ? JSON.stringify(errs[0].errorCode) : "";
        return `${errs[0].message}${code ? ` (${code})` : ""}`;
      }
    }
  }
  if (json?.error?.message) return json.error.message;

  if (status === 404 || /<html|That’s an error|Not Found/i.test(text)) {
    return (
      "Keyword Planner API 404 — developer token likely has Test/Explorer access without Keyword Planner. " +
      "In Google Ads (Yunick Media MCC) → Tools → API Center: apply for Basic access and enable permissible use " +
      "“Researching keywords and recommendations”. Test tokens cannot call KeywordPlanIdeaService on production accounts."
    );
  }
  return `Google Ads API error (${status})`;
}

async function adsFetch(
  path: string,
  opts: {
    accessToken: string;
    developerToken: string;
    loginCustomerId?: string | null;
    method?: string;
    body?: unknown;
    version?: string;
  },
): Promise<{ ok: boolean; status: number; json: any; text: string; version: string }> {
  const version = opts.version || ADS_API_VERSIONS[0];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    "developer-token": opts.developerToken,
    "Content-Type": "application/json",
  };
  if (opts.loginCustomerId) {
    headers["login-customer-id"] = opts.loginCustomerId;
  }

  const res = await fetch(`https://googleads.googleapis.com/${version}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json, text, version };
}

export async function listAccessibleCustomerIds(accessToken: string, developerToken: string): Promise<string[]> {
  const res = await adsFetch("/customers:listAccessibleCustomers", {
    accessToken,
    developerToken,
  });
  if (!res.ok) return [];
  const names: string[] = res.json.resourceNames || [];
  return names
    .map((n) => n.replace(/^customers\//, "").replace(/\D/g, ""))
    .filter(Boolean);
}

function mapIdeaResults(results: any[]): KeywordIdea[] {
  return results
    .map((r) => {
      const m = r.keywordIdeaMetrics || {};
      const avg =
        m.avgMonthlySearches != null ? parseInt(String(m.avgMonthlySearches), 10) : null;
      const idx =
        m.competitionIndex != null ? parseInt(String(m.competitionIndex), 10) : null;
      return {
        keyword: (r.text || "").trim(),
        avgMonthlySearches: Number.isFinite(avg as number) ? (avg as number) : null,
        competition: normalizeCompetition(m.competition),
        competitionIndex: Number.isFinite(idx as number) ? (idx as number) : null,
        lowBidInr: microsToInr(m.lowTopOfPageBidMicros),
        highBidInr: microsToInr(m.highTopOfPageBidMicros),
      };
    })
    .filter((i) => i.keyword)
    .sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0));
}

export async function generateKeywordIdeas(opts: {
  seeds: string[];
  locationId?: string | null;
  pageUrl?: string | null;
  languageId?: string;
  pageSize?: number;
}): Promise<KeywordIdeasResult> {
  const { developerToken, customerId, loginCustomerId } = adsConfig();
  if (!developerToken || !customerId) {
    throw new Error(
      "Google Ads is not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID in .env",
    );
  }

  const scopeStatus = await getGoogleOAuthScopeStatus();
  if (!scopeStatus.connected) {
    throw new Error("Google account not connected. Connect Google under Google Integration.");
  }
  if (!scopeStatus.hasAdwordsScope) {
    throw new Error(
      "Google Ads scope missing. Reconnect Google so “adwords” permission is granted.",
    );
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("Google access token unavailable. Reconnect Google Integration.");
  }

  const seeds = opts.seeds.map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const pageUrl = opts.pageUrl?.trim() || null;
  if (!seeds.length && !pageUrl) {
    throw new Error("Provide at least one seed keyword or a website URL");
  }

  const { geoTargetConstant, geoLabel } = await resolveGeoForLocation(opts.locationId);
  const languageId = opts.languageId || LANGUAGE_ENGLISH;

  const body: Record<string, unknown> = {
    language: `languageConstants/${languageId}`,
    geoTargetConstants: [`geoTargetConstants/${geoTargetConstant}`],
    includeAdultKeywords: false,
    keywordPlanNetwork: "GOOGLE_SEARCH_AND_PARTNERS",
  };

  if (seeds.length && pageUrl) {
    body.keywordAndUrlSeed = { keywords: seeds, url: pageUrl };
  } else if (pageUrl) {
    body.urlSeed = { url: pageUrl };
  } else {
    body.keywordSeed = { keywords: seeds };
  }

  // Login customer candidates: env MCC first, then accessible managers/accounts
  const accessible = await listAccessibleCustomerIds(accessToken, developerToken);
  const loginCandidates = Array.from(
    new Set(
      [loginCustomerId, customerId, ...accessible].filter((id): id is string => !!id),
    ),
  );

  let lastError = "Google Ads Keyword Planner request failed";

  for (const version of ADS_API_VERSIONS) {
    for (const loginId of loginCandidates.length ? loginCandidates : [null]) {
      const res = await adsFetch(`/customers/${customerId}:generateKeywordIdeas`, {
        accessToken,
        developerToken,
        loginCustomerId: loginId,
        method: "POST",
        body,
        version,
      });

      if (res.ok) {
        const ideas = mapIdeaResults(res.json.results || []);
        return {
          ideas,
          seed: seeds,
          pageUrl,
          geoLabel,
          geoTargetConstant,
          languageId,
          customerIdUsed: customerId,
          source: "google_ads",
        };
      }

      lastError = extractAdsError(res.status, res.text, res.json);

      // Auth / permission errors won't be fixed by version hopping
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `${lastError} — OAuth user must have access to Ads customer ${customerId}. ` +
            (loginCustomerId
              ? ""
              : "If developer token is from an MCC (yunickmedia), set GOOGLE_ADS_LOGIN_CUSTOMER_ID to that manager ID."),
        );
      }
    }
  }

  // If configured customer isn't in accessible list, surface that clearly
  if (accessible.length && !accessible.includes(customerId)) {
    throw new Error(
      `${lastError} Connected Google user can access: ${accessible.join(", ") || "(none)"}. ` +
        `Update GOOGLE_ADS_CUSTOMER_ID to one of these, and if using MCC set GOOGLE_ADS_LOGIN_CUSTOMER_ID.`,
    );
  }

  throw new Error(lastError);
}

export async function getKeywordPlannerStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  hasAdwordsScope: boolean;
  customerIdMasked: string | null;
  loginCustomerIdSet: boolean;
  loginCustomerIdMasked: string | null;
  accessibleCustomers: string[];
  adsApiReachable: boolean | null;
  keywordPlannerReachable: boolean | null;
  hint?: string;
}> {
  const { developerToken, customerId, loginCustomerId } = adsConfig();
  const scopeStatus = await getGoogleOAuthScopeStatus();
  let accessibleCustomers: string[] = [];
  let hint: string | undefined;
  let adsApiReachable: boolean | null = null;
  let keywordPlannerReachable: boolean | null = null;

  if (developerToken && scopeStatus.hasAdwordsScope) {
    try {
      const token = await getValidAccessToken();
      if (token) {
        accessibleCustomers = await listAccessibleCustomerIds(token, developerToken);
        adsApiReachable = accessibleCustomers.length > 0;

        // Probe Keyword Planner with a tiny request (diagnose 404 vs auth)
        if (customerId) {
          const probe = await adsFetch(`/customers/${customerId}:generateKeywordIdeas`, {
            accessToken: token,
            developerToken,
            loginCustomerId: loginCustomerId || customerId,
            method: "POST",
            body: {
              language: "languageConstants/1000",
              geoTargetConstants: ["geoTargetConstants/2356"],
              includeAdultKeywords: false,
              keywordPlanNetwork: "GOOGLE_SEARCH",
              keywordSeed: { keywords: ["car service"] },
            },
            version: "v20",
          });
          keywordPlannerReachable = probe.ok;
          if (!probe.ok && (probe.status === 404 || /<html/i.test(probe.text))) {
            hint =
              "MCC ID is set, but Keyword Planner still 404s → open Yunick Media API Center and upgrade developer token to Basic + “Researching keywords and recommendations”.";
          } else if (!probe.ok) {
            hint = extractAdsError(probe.status, probe.text, probe.json);
          }
        }

        if (customerId && accessibleCustomers.length && !accessibleCustomers.includes(customerId)) {
          hint = `Customer ${customerId} not in accessible list. Try one of: ${accessibleCustomers.join(", ")}`;
        } else if (!loginCustomerId && accessibleCustomers.length > 1) {
          hint =
            "Multiple Ads accounts found. Set GOOGLE_ADS_LOGIN_CUSTOMER_ID to your MCC/manager ID (Yunick Media).";
        }
      }
    } catch {
      // ignore diagnostics failures
    }
  }

  return {
    configured: !!(developerToken && customerId),
    connected: scopeStatus.connected,
    hasAdwordsScope: scopeStatus.hasAdwordsScope,
    customerIdMasked: customerId
      ? `${customerId.slice(0, 3)}…${customerId.slice(-3)}`
      : null,
    loginCustomerIdSet: !!loginCustomerId,
    loginCustomerIdMasked: loginCustomerId
      ? `${loginCustomerId.slice(0, 3)}…${loginCustomerId.slice(-3)}`
      : null,
    accessibleCustomers,
    adsApiReachable,
    keywordPlannerReachable,
    hint,
  };
}
