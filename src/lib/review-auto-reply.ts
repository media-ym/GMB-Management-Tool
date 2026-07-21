import { db } from "@/lib/db";
import { replyToReview, getValidAccessToken } from "@/lib/google-service";
import { checkClientAuthorization } from "@/lib/client-auth";
import {
  AUTO_REPLY_SETTING_KEY,
  mergeAutoReplyConfig,
  substituteReviewReplyTemplate,
  inferLocationCategory,
  autoReplyCharLimit,
  type AutoReplyConfig,
} from "@/lib/auto-reply";

export async function loadAutoReplyConfig(): Promise<AutoReplyConfig> {
  const row = await db.setting.findUnique({ where: { key: AUTO_REPLY_SETTING_KEY } });
  if (!row?.value) return mergeAutoReplyConfig(null);
  try {
    return mergeAutoReplyConfig(JSON.parse(row.value) as Partial<AutoReplyConfig>);
  } catch {
    return mergeAutoReplyConfig(null);
  }
}

export function reviewMatchesAutoReply(
  config: AutoReplyConfig,
  review: { rating: number; text: string; replyStatus: string },
): boolean {
  if (!config.enabled) return false;
  if (config.mode !== "manual") return false;
  if (!config.template.trim()) return false;
  if (!config.selectedRatings.includes(review.rating)) return false;
  if (review.replyStatus === "replied" || review.replyStatus === "ignored") return false;

  const hasText = review.text.trim().length > 0;
  if (hasText && !config.reviewTypes.includes("text")) return false;
  if (!hasText && !config.reviewTypes.includes("no_text")) return false;
  return true;
}

export function buildAutoReplyMessage(
  config: AutoReplyConfig,
  review: {
    authorName: string;
    rating: number;
    text: string;
  },
  location: {
    name: string;
    city: string;
    address: string;
    phone: string | null;
    categoriesJson: string | null;
  },
): string {
  let text = substituteReviewReplyTemplate(config.template, {
    customerName: review.authorName,
    businessName: location.name,
    category: inferLocationCategory(location.categoriesJson),
    address: location.address,
    area: location.city,
    city: location.city,
    phone: location.phone ?? undefined,
    managerName: config.advanced.supportName || location.name,
    rating: review.rating,
  });

  if (config.advanced.addRegards && !/regards/i.test(text)) {
    const signOff = config.advanced.supportName || location.name;
    text += `\n\nRegards,\n${signOff}`;
  }
  if (config.advanced.addSupportFooter) {
    const parts = [
      config.advanced.supportEmail,
      config.advanced.supportPhone,
      config.advanced.supportLink,
    ].filter(Boolean);
    if (parts.length) text += `\n\nSupport: ${parts.join(" · ")}`;
  }
  if (config.addEmoji && !/[\u{1F300}-\u{1FAFF}]/u.test(text)) {
    text += " 🙏";
  }

  const limit = autoReplyCharLimit(config.replyLength);
  if (text.length > limit) text = text.slice(0, limit - 3) + "...";
  return text.trim();
}

export async function tryAutoReplyToReview(
  reviewId: string,
  config?: AutoReplyConfig,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const cfg = config ?? (await loadAutoReplyConfig());

  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: {
      location: { include: { googleProfiles: true } },
    },
  });
  if (!review) return { ok: false, skipped: true, error: "Review not found" };
  if (!reviewMatchesAutoReply(cfg, review)) {
    return { ok: false, skipped: true };
  }

  const auth = await checkClientAuthorization(review.locationId, "review.reply");
  if (!auth.authorized) {
    return { ok: false, error: auth.reason ?? "Client not authorized for review.reply" };
  }

  const replyText = buildAutoReplyMessage(cfg, review, review.location);
  if (replyText.length < 3) {
    return { ok: false, error: "Auto reply text too short" };
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) return { ok: false, error: "No valid Google access token" };
  if (!review.googleReviewId) return { ok: false, error: "Missing Google review id" };

  try {
    await replyToReview(accessToken, review.googleReviewId, replyText);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Google reply failed";
    return { ok: false, error: msg };
  }

  await db.review.update({
    where: { id: reviewId },
    data: {
      replyText,
      replyStatus: "replied",
      replySource: "template",
      repliedAt: new Date(),
    },
  });

  return { ok: true };
}

/** Process auto-replies for newly synced review ids (called after Google sync). */
export async function processAutoRepliesForReviews(
  reviewIds: string[],
): Promise<{ replied: number; skipped: number; errors: string[] }> {
  const config = await loadAutoReplyConfig();
  if (!config.enabled) {
    return { replied: 0, skipped: reviewIds.length, errors: [] };
  }

  let replied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of reviewIds) {
    const result = await tryAutoReplyToReview(id, config);
    if (result.ok) replied++;
    else if (result.skipped) skipped++;
    else if (result.error) errors.push(`${id}: ${result.error}`);
  }

  return { replied, skipped, errors };
}

/** Catch pending reviews that match auto-reply rules (cron / backlog). */
export async function processPendingAutoReplies(limit = 25): Promise<{
  replied: number;
  errors: string[];
}> {
  const result = await processAllPendingAutoReplies({ batchSize: limit, maxBatches: 1 });
  return { replied: result.replied, errors: result.errors };
}

/** Process entire backlog of pending reviews in batches. */
export async function processAllPendingAutoReplies(opts?: {
  batchSize?: number;
  maxBatches?: number;
  ratings?: number[];
}): Promise<{ replied: number; skipped: number; errors: string[]; remaining: number }> {
  const batchSize = opts?.batchSize ?? 25;
  const maxBatches = opts?.maxBatches ?? 50;
  const config = await loadAutoReplyConfig();
  if (!config.enabled || config.mode !== "manual") {
    return { replied: 0, skipped: 0, errors: [], remaining: 0 };
  }

  const ratings = opts?.ratings?.length ? opts.ratings : config.selectedRatings;
  let replied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let batch = 0; batch < maxBatches; batch++) {
    const pending = await db.review.findMany({
      where: {
        syncStatus: "synced",
        replyStatus: "pending",
        rating: { in: ratings },
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true, rating: true, text: true, replyStatus: true },
    });

    if (pending.length === 0) break;

    const eligible = pending.filter((r) => reviewMatchesAutoReply(config, r));
    if (eligible.length === 0) break;

    const result = await processAutoRepliesForReviews(eligible.map((r) => r.id));
    replied += result.replied;
    skipped += result.skipped;
    errors.push(...result.errors);

    if (result.replied === 0) break;
  }

  const remaining = await db.review.count({
    where: {
      syncStatus: "synced",
      replyStatus: "pending",
      rating: { in: ratings },
    },
  });

  return { replied, skipped, errors, remaining };
}
