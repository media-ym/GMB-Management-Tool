import { db } from "@/lib/db";
import { aiGeneratePost } from "@/lib/ai";
import { publishPostToGoogle } from "@/lib/post-publish";
import {
  AUTO_POST_SETTING_KEY,
  getIndiaSeasonContext,
  mergeAutoPostConfig,
  pickSeasonTopicAngle,
  type AutoPostConfig,
} from "@/lib/auto-post";
import { createBrandedPostImageUrl } from "@/lib/post-template-image";
import { listPortalClientIds } from "@/lib/portal-link";
import type { SessionUser } from "@/lib/types";

const TZ = "Asia/Kolkata";
const JOB_NAME = "auto-post-daily";

function startOfTodayIST(): Date {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${key}T00:00:00+05:30`);
}

function currentHourIST(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
}

function todayKeyIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function loadAutoPostConfig(): Promise<AutoPostConfig> {
  const row = await db.setting.findUnique({ where: { key: AUTO_POST_SETTING_KEY } });
  if (!row?.value) return mergeAutoPostConfig(null);
  try {
    return mergeAutoPostConfig(JSON.parse(row.value) as Partial<AutoPostConfig>);
  } catch {
    return mergeAutoPostConfig(null);
  }
}

/** System user for cron AI audit logs */
export async function getAutomationUser(): Promise<SessionUser> {
  const user = await db.user.findFirst({
    where: { status: "active", role: { in: ["super_admin", "admin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    throw new Error("No admin user found for automation");
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser["role"],
    avatar: user.avatar,
    assignedLocationIds: user.assignedLocationIds as string[] | null,
    permissions: [],
    scopedLocationIds: undefined,
  };
}

function pickTopicAngle(locationId: string, dayKey: string): string {
  const season = getIndiaSeasonContext();
  return pickSeasonTopicAngle(locationId, dayKey, season.season);
}

async function fetchLocationKeywords(locationId: string, city: string, limit: number): Promise<string[]> {
  const rows = await db.keyword.findMany({
    where: {
      OR: [{ locationId }, { locationId: null, city: { equals: city, mode: "insensitive" } }],
    },
    orderBy: { keyword: "asc" },
    take: limit * 3,
    select: { keyword: true },
  });
  const unique = [...new Set(rows.map((r) => r.keyword.trim()).filter(Boolean))];
  const dayOffset = Number(todayKeyIST().replace(/-/g, "")) % Math.max(unique.length, 1);
  if (unique.length === 0) return [];
  const rotated = [...unique.slice(dayOffset), ...unique.slice(0, dayOffset)];
  return rotated.slice(0, limit);
}

async function buildAutoPostImage(
  locationId: string,
  headline: string,
  subtitle: string,
): Promise<string | null> {
  try {
    const { url } = await createBrandedPostImageUrl({
      locationId,
      headline,
      subtitle,
      dayKey: todayKeyIST(),
    });
    return url;
  } catch (e: unknown) {
    console.warn("Branded post image failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function alreadyPostedToday(locationId: string): Promise<boolean> {
  const todayStart = startOfTodayIST();
  const count = await db.post.count({
    where: {
      locationId,
      status: "published",
      source: "ai",
      publishedAt: { gte: todayStart },
    },
  });
  return count > 0;
}

export async function listEligibleLocations(): Promise<
  Array<{
    id: string;
    name: string;
    city: string;
    address: string;
    phone: string | null;
    website: string | null;
  }>
> {
  const portalClientIds = await listPortalClientIds();
  return db.location.findMany({
    where: {
      status: "active",
      syncStatus: { not: "archived" },
      ...(portalClientIds.length > 0
        ? { OR: [{ clientId: null }, { clientId: { notIn: portalClientIds } }] }
        : {}),
      googleProfiles: { some: { verificationState: "verified" } },
    },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      phone: true,
      website: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function generateAndPublishAutoPostForLocation(
  location: {
    id: string;
    name: string;
    city: string;
    address: string;
    phone: string | null;
    website: string | null;
  },
  config: AutoPostConfig,
  user: SessionUser,
): Promise<{ ok: boolean; skipped?: boolean; postId?: string; error?: string }> {
  if (config.skipIfPostedToday && (await alreadyPostedToday(location.id))) {
    return { ok: false, skipped: true };
  }

  const keywords = await fetchLocationKeywords(location.id, location.city, config.keywordCount);
  const season = getIndiaSeasonContext();
  const topicAngle = pickTopicAngle(location.id, todayKeyIST());
  const topic =
    keywords.length > 0
      ? `Local SEO focus: ${keywords.join(", ")}. Angle: ${topicAngle}`
      : topicAngle;

  let generated: { title: string; content: string; ctaType: string };
  try {
    generated = await aiGeneratePost({
      user,
      locationName: location.name,
      city: location.city,
      address: location.address,
      keywords,
      type: config.postType,
      topic,
      tone: config.tone,
      seasonContext: season,
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "AI generation failed" };
  }

  const imageUrl = config.attachImage
    ? await buildAutoPostImage(location.id, generated.title, season.label)
    : null;
  const ctaType = (config.ctaType || generated.ctaType || "call").toLowerCase();
  const ctaUrl =
    ctaType === "call"
      ? null
      : ctaType === "book"
        ? location.website || undefined
        : location.website || undefined;

  const pub = await publishPostToGoogle({
    locationId: location.id,
    type: config.postType,
    title: generated.title,
    content: generated.content,
    ctaType,
    ctaUrl: ctaUrl ?? null,
    imageUrl,
  });

  if (!pub.ok) {
    const failed = await db.post.create({
      data: {
        locationId: location.id,
        type: config.postType,
        title: generated.title,
        content: generated.content,
        ctaType,
        ctaUrl: ctaUrl ?? null,
        imageUrl,
        status: "failed",
        source: "ai",
        authorId: user.id,
      },
    });
    return { ok: false, postId: failed.id, error: pub.error };
  }

  const post = await db.post.create({
    data: {
      locationId: location.id,
      type: config.postType,
      title: generated.title,
      content: generated.content,
      ctaType,
      ctaUrl: ctaUrl ?? null,
      imageUrl,
      status: "published",
      source: "ai",
      authorId: user.id,
      googlePostId: pub.googlePostId,
      publishedAt: new Date(),
    },
  });

  return { ok: true, postId: post.id };
}

export async function runDailyAutoPosts(opts?: {
  force?: boolean;
  locationIds?: string[];
  delayMs?: number;
}): Promise<{
  published: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const config = await loadAutoPostConfig();
  if (!config.enabled && !opts?.force) {
    return { published: 0, skipped: 0, failed: 0, errors: [] };
  }

  if (!opts?.force) {
    const hour = currentHourIST();
    if (hour !== config.runHourIST) {
      return { published: 0, skipped: 0, failed: 0, errors: [] };
    }
    const existing = await db.scheduledJob.findFirst({ where: { jobName: JOB_NAME } });
    const today = todayKeyIST();
    if (existing?.lastRun) {
      const lastKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(existing.lastRun);
      if (lastKey === today) {
        return { published: 0, skipped: 0, failed: 0, errors: [] };
      }
    }
  }

  const user = await getAutomationUser();
  let locations = await listEligibleLocations();
  if (opts?.locationIds?.length) {
    const allowed = new Set(opts.locationIds);
    locations = locations.filter((l) => allowed.has(l.id));
    if (locations.length === 0) {
      return {
        published: 0,
        skipped: 0,
        failed: 0,
        errors: [
          "Selected location is not eligible (needs verified Google profile and active status).",
        ],
      };
    }
  }

  if (locations.length === 0) {
    return {
      published: 0,
      skipped: 0,
      failed: 0,
      errors: ["No eligible verified locations found for auto-post."],
    };
  }

  let published = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  const delayMs = opts?.delayMs ?? 600;

  for (const loc of locations) {
    const result = await generateAndPublishAutoPostForLocation(loc, config, user);
    if (result.ok) published++;
    else if (result.skipped) skipped++;
    else {
      failed++;
      if (result.error) errors.push(`${loc.name}: ${result.error}`);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  const now = new Date();
  const jobRow = await db.scheduledJob.findFirst({ where: { jobName: JOB_NAME } });
  if (jobRow) {
    await db.scheduledJob.update({
      where: { id: jobRow.id },
      data: { lastRun: now },
    });
  } else {
    await db.scheduledJob.create({
      data: {
        jobName: JOB_NAME,
        cronExpression: `0 ${config.runHourIST} * * *`,
        lastRun: now,
        isEnabled: true,
      },
    });
  }

  return { published, skipped, failed, errors };
}
