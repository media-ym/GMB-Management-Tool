import { db } from "@/lib/db";
import {
  attachLocalPostMedia,
  createGooglePost,
  getValidAccessToken,
  resolveV4LocationName,
} from "@/lib/google-service";
import { checkClientAuthorization } from "@/lib/client-auth";

export function buildGooglePostPayload(post: {
  type: string;
  title: string;
  content: string;
  ctaType: string | null;
  ctaUrl: string | null;
  startDate?: Date | null;
  startTime?: string | null;
  endDate?: Date | null;
  endTime?: string | null;
  couponCode?: string | null;
  redeemUrl?: string | null;
  offerTerms?: string | null;
}) {
  const googleTopicType = post.type === "offer" ? "OFFER" : post.type === "event" ? "EVENT" : "STANDARD";
  const googlePostData: Record<string, unknown> = {
    languageCode: "en",
    summary: post.content,
    topicType: googleTopicType,
  };

  if (googleTopicType !== "OFFER") {
    const actionType = post.ctaType?.toUpperCase();
    const ctaPayload =
      actionType && actionType !== "NONE"
        ? actionType === "CALL"
          ? { actionType: "CALL" }
          : post.ctaUrl
            ? { actionType, url: post.ctaUrl }
            : undefined
        : undefined;
    if (ctaPayload) googlePostData.callToAction = ctaPayload;
  }

  function buildDateObj(d: Date | null | undefined) {
    if (!d) return undefined;
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  function buildTimeObj(t: string | null | undefined) {
    if (!t) return undefined;
    const [h, m] = t.split(":").map(Number);
    return { hours: h, minutes: m, seconds: 0, nanos: 0 };
  }

  if (post.type === "offer") {
    googlePostData.offer = {};
    if (post.couponCode) (googlePostData.offer as Record<string, string>).couponCode = post.couponCode;
    if (post.redeemUrl) (googlePostData.offer as Record<string, string>).redeemOnlineUrl = post.redeemUrl;
    if (post.offerTerms) (googlePostData.offer as Record<string, string>).termsConditions = post.offerTerms;
  }
  if ((post.type === "event" || post.type === "offer") && post.startDate) {
    googlePostData.event = {
      title: post.title,
      schedule: {
        startDate: buildDateObj(post.startDate),
        startTime: buildTimeObj(post.startTime),
        endDate: buildDateObj(post.endDate),
        endTime: buildTimeObj(post.endTime),
      },
    };
  }

  return googlePostData;
}

export async function publishPostToGoogle(opts: {
  locationId: string;
  type: string;
  title: string;
  content: string;
  ctaType?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
}): Promise<{ ok: true; googlePostId: string | null } | { ok: false; error: string }> {
  const auth = await checkClientAuthorization(opts.locationId, "post.create");
  if (!auth.authorized) {
    return { ok: false, error: auth.reason ?? "Client not authorized for post.create" };
  }

  const gbp = await db.googleBusinessProfile.findFirst({
    where: { locationId: opts.locationId },
  });
  if (!gbp) return { ok: false, error: "No Google Business Profile linked" };
  if (gbp.verificationState !== "verified") {
    return { ok: false, error: "Listing is not verified on Google" };
  }

  const accessToken = await getValidAccessToken({ locationId: opts.locationId });
  if (!accessToken) return { ok: false, error: "No valid Google access token" };

  try {
    const googlePostData = buildGooglePostPayload({
      type: opts.type,
      title: opts.title,
      content: opts.content,
      ctaType: opts.ctaType ?? "learn_more",
      ctaUrl: opts.ctaUrl ?? null,
    });

    const v4Name = await resolveV4LocationName(accessToken, gbp.googleLocationId);
    await attachLocalPostMedia(accessToken, v4Name, googlePostData, opts.imageUrl);
    const gPost = await createGooglePost(accessToken, v4Name, googlePostData);
    return { ok: true, googlePostId: gPost.name || null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Google publish failed";
    return { ok: false, error: msg };
  }
}
