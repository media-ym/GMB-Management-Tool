import { db } from "@/lib/db";
import { refreshLocationScores } from "@/lib/location-scores";

export type ScanFindingSeverity = "critical" | "warning" | "info" | "success";

export interface ScanFinding {
  severity: ScanFindingSeverity;
  category: string;
  title: string;
  detail: string;
  action?: string;
}

export interface LocationScanResult {
  locationId: string;
  name: string;
  city: string;
  healthScore: number;
  visibilityScore: number;
  avgRating: number;
  reviewCount: number;
  syncStatus: string;
  completeness: number;
  photoCount: number;
  serviceCount: number;
  pendingNegativeReviews: number;
  posts30d: number;
  searchViews30d: number;
  mapsViews30d: number;
  calls30d: number;
  directions30d: number;
  verified: boolean;
  findings: ScanFinding[];
  priority: "P0" | "P1" | "P2" | "P3";
}

export interface PriorityScanReport {
  scannedAt: string;
  locationCount: number;
  summary: {
    critical: number;
    warnings: number;
    successes: number;
    avgHealth: number;
    avgVisibility: number;
    needsAttention: number;
  };
  locations: LocationScanResult[];
  topActions: ScanFinding[];
  markdown: string;
}

function priorityFromFindings(findings: ScanFinding[]): LocationScanResult["priority"] {
  if (findings.some((f) => f.severity === "critical")) return "P0";
  if (findings.filter((f) => f.severity === "warning").length >= 2) return "P1";
  if (findings.some((f) => f.severity === "warning")) return "P2";
  return "P3";
}

function severityRank(s: ScanFindingSeverity): number {
  return { critical: 0, warning: 1, info: 2, success: 3 }[s];
}

export async function runPriorityScan(locationIds?: string[] | null): Promise<PriorityScanReport> {
  const where = locationIds?.length ? { id: { in: locationIds } } : {};
  const locations = await db.location.findMany({
    where,
    orderBy: { city: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      avgRating: true,
      reviewCount: true,
      syncStatus: true,
      status: true,
      phone: true,
      website: true,
      googleProfiles: {
        select: {
          verificationState: true,
          businessInfo: { select: { description: true, website: true } },
        },
      },
    },
  });

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const results: LocationScanResult[] = [];

  for (const loc of locations) {
    // Refresh health/visibility from live DB signals
    let healthScore = 0;
    let visibilityScore = 0;
    let completeness = 0;
    try {
      const scores = await refreshLocationScores(loc.id, { writeAudit: true });
      healthScore = scores.healthScore;
      visibilityScore = scores.visibilityScore;
      completeness = scores.healthBreakdown.profileCompleteness;
    } catch {
      /* keep zeros; still report other signals */
    }

    const gbp = loc.googleProfiles[0];
    const [
      photoCount,
      serviceCount,
      pendingNegativeReviews,
      posts30d,
      analytics,
    ] = await Promise.all([
      db.businessPhoto.count({ where: { locationId: loc.id, status: "active" } }),
      db.service.count({ where: { locationId: loc.id } }),
      db.review.count({
        where: { locationId: loc.id, replyStatus: "pending", rating: { lte: 3 } },
      }),
      db.post.count({
        where: {
          locationId: loc.id,
          status: "published",
          OR: [
            { publishedAt: { gte: since30d } },
            { publishedAt: null, createdAt: { gte: since30d } },
          ],
        },
      }),
      db.analyticDaily.aggregate({
        where: { locationId: loc.id, date: { gte: since30d } },
        _sum: {
          searchViews: true,
          mapsViews: true,
          phoneCalls: true,
          directionRequests: true,
        },
      }),
    ]);

    const findings: ScanFinding[] = [];
    const verified = gbp?.verificationState === "verified";

    if (loc.syncStatus === "error") {
      findings.push({
        severity: "critical",
        category: "sync",
        title: "Google sync error",
        detail: "OAuth/token or sync pipeline failed. Reconnect Google Integration.",
        action: "Fix sync",
      });
    }
    if (!verified) {
      findings.push({
        severity: "critical",
        category: "verification",
        title: "Profile not verified",
        detail: "Unverified listings lose trust and ranking signals.",
        action: "Verify on Google",
      });
    }
    if (loc.avgRating < 4 && loc.reviewCount > 10) {
      findings.push({
        severity: "critical",
        category: "reputation",
        title: `Rating ${loc.avgRating.toFixed(1)} below 4.0`,
        detail: `${pendingNegativeReviews} pending negative reviews need replies.`,
        action: "Reply to reviews",
      });
    } else if (pendingNegativeReviews >= 3) {
      findings.push({
        severity: "warning",
        category: "reviews",
        title: `${pendingNegativeReviews} unanswered negative reviews`,
        detail: "Respond within SLA to protect ranking and conversion.",
        action: "Open Reviews",
      });
    }
    if (visibilityScore < 50) {
      findings.push({
        severity: "warning",
        category: "visibility",
        title: `Low visibility (${visibilityScore}/100)`,
        detail: "Refresh photos, posts, and categories to recover discovery.",
        action: "Improve SEO",
      });
    } else if (visibilityScore < 70) {
      findings.push({
        severity: "info",
        category: "seo",
        title: `Moderate visibility (${visibilityScore}/100)`,
        detail: "Services + description updates can unlock more Search/Maps views.",
        action: "View SEO",
      });
    }
    if (posts30d === 0) {
      findings.push({
        severity: "warning",
        category: "content",
        title: "No posts in last 30 days",
        detail: "Publishing 2+ posts/month keeps the profile active in local pack.",
        action: "Create post",
      });
    }
    if (photoCount < 5) {
      findings.push({
        severity: "warning",
        category: "media",
        title: `Only ${photoCount} active photos`,
        detail: "Aim for 10+ high-quality workshop/service photos.",
        action: "Upload media",
      });
    }
    if (!gbp?.businessInfo?.description) {
      findings.push({
        severity: "warning",
        category: "profile",
        title: "Missing business description",
        detail: "Add a keyword-rich description on the GMB profile.",
        action: "Edit content",
      });
    }
    if (!loc.phone) {
      findings.push({
        severity: "warning",
        category: "profile",
        title: "Phone number missing",
        detail: "Call clicks need a primary phone on the listing.",
        action: "Add phone",
      });
    }
    if (!loc.website && !gbp?.businessInfo?.website) {
      findings.push({
        severity: "info",
        category: "profile",
        title: "Website not set",
        detail: "Website clicks cannot convert without a URL.",
        action: "Add website",
      });
    }
    if (serviceCount < 3) {
      findings.push({
        severity: "info",
        category: "services",
        title: `Thin services list (${serviceCount})`,
        detail: "Add core services customers search for.",
        action: "Add services",
      });
    }
    if (healthScore >= 80 && visibilityScore >= 70 && pendingNegativeReviews === 0) {
      findings.push({
        severity: "success",
        category: "performance",
        title: "Strong profile health",
        detail: `Health ${healthScore}/100 · Visibility ${visibilityScore}/100 · ${loc.avgRating.toFixed(1)}★`,
      });
    }

    findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

    results.push({
      locationId: loc.id,
      name: loc.name,
      city: loc.city,
      healthScore,
      visibilityScore,
      avgRating: loc.avgRating,
      reviewCount: loc.reviewCount,
      syncStatus: loc.syncStatus,
      completeness,
      photoCount,
      serviceCount,
      pendingNegativeReviews,
      posts30d,
      searchViews30d: analytics._sum.searchViews ?? 0,
      mapsViews30d: analytics._sum.mapsViews ?? 0,
      calls30d: analytics._sum.phoneCalls ?? 0,
      directions30d: analytics._sum.directionRequests ?? 0,
      verified,
      findings,
      priority: priorityFromFindings(findings),
    });
  }

  results.sort((a, b) => {
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    return a.healthScore - b.healthScore;
  });

  const allFindings = results.flatMap((r) =>
    r.findings.map((f) => ({ ...f, title: `${r.city}: ${f.title}` })),
  );
  allFindings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const critical = allFindings.filter((f) => f.severity === "critical").length;
  const warnings = allFindings.filter((f) => f.severity === "warning").length;
  const successes = allFindings.filter((f) => f.severity === "success").length;
  const avgHealth = results.length
    ? Math.round(results.reduce((s, r) => s + r.healthScore, 0) / results.length)
    : 0;
  const avgVisibility = results.length
    ? Math.round(results.reduce((s, r) => s + r.visibilityScore, 0) / results.length)
    : 0;

  const report: PriorityScanReport = {
    scannedAt: new Date().toISOString(),
    locationCount: results.length,
    summary: {
      critical,
      warnings,
      successes,
      avgHealth,
      avgVisibility,
      needsAttention: results.filter((r) => r.priority === "P0" || r.priority === "P1").length,
    },
    locations: results,
    topActions: allFindings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 12),
    markdown: "",
  };
  report.markdown = buildScanMarkdown(report);
  return report;
}

function buildScanMarkdown(report: PriorityScanReport): string {
  const lines: string[] = [];
  lines.push("# MiSA Priority Scan Report");
  lines.push("");
  lines.push(`Scanned **${report.locationCount}** GMB profiles · ${new Date(report.scannedAt).toLocaleString("en-IN")}`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Critical issues | ${report.summary.critical} |`);
  lines.push(`| Warnings | ${report.summary.warnings} |`);
  lines.push(`| Wins | ${report.summary.successes} |`);
  lines.push(`| Avg health | ${report.summary.avgHealth}/100 |`);
  lines.push(`| Avg visibility | ${report.summary.avgVisibility}/100 |`);
  lines.push(`| Locations needing attention | ${report.summary.needsAttention} |`);
  lines.push("");

  if (report.topActions.length) {
    lines.push("## Top priority actions");
    lines.push("");
    for (const a of report.topActions) {
      const tag = a.severity === "critical" ? "CRITICAL" : "WARN";
      lines.push(`- **[${tag}]** ${a.title} - ${a.detail}${a.action ? ` → *${a.action}*` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Location-by-location");
  lines.push("");
  for (const loc of report.locations) {
    lines.push(`### ${loc.priority} · ${loc.name} (${loc.city})`);
    lines.push("");
    lines.push(
      `Health **${loc.healthScore}**/100 · Visibility **${loc.visibilityScore}**/100 · Rating **${loc.avgRating.toFixed(1)}★** (${loc.reviewCount}) · Completeness **${loc.completeness}%**`,
    );
    lines.push("");
    lines.push(
      `Photos ${loc.photoCount} · Services ${loc.serviceCount} · Posts(30d) ${loc.posts30d} · Pending neg. reviews ${loc.pendingNegativeReviews} · Verified ${loc.verified ? "yes" : "no"}`,
    );
    lines.push("");
    lines.push(
      `30d views: Search ${loc.searchViews30d} / Maps ${loc.mapsViews30d} · Calls ${loc.calls30d} · Directions ${loc.directions30d}`,
    );
    lines.push("");
    if (loc.findings.length === 0) {
      lines.push("- No issues flagged.");
    } else {
      for (const f of loc.findings) {
        lines.push(`- **${f.severity}** (${f.category}): ${f.title} - ${f.detail}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by MiSA Priority Scan from live MyFNG location data.*");
  return lines.join("\n");
}
