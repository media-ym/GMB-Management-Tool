/**
 * Build a Google "Write a review" deep link.
 * Apps cannot post reviews via API — customer must submit on Google.
 *
 * Preferred: official short link (g.page/r/…/review or newReviewUri)
 * Then: placeid=ChIJ…
 * Fallback: Maps write-review data URL from CID
 */
export function toGoogleWriteReviewUrl(opts: {
  reviewUrl?: string | null;
  placeId?: string | null;
  mapUrl?: string | null;
}): string | null {
  const short = normalizeReviewUrl(opts.reviewUrl);
  if (short) return short;

  const placeId =
    opts.placeId?.trim() ||
    extractPlaceIdFromMapUrl(opts.mapUrl) ||
    null;

  if (placeId) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
  }

  const cid = extractCid(opts.mapUrl);
  if (cid) {
    const hex = BigInt(cid).toString(16);
    return `https://www.google.com/maps/place//data=!4m3!3m2!1s0x0:0x${hex}!12e1`;
  }

  if (opts.mapUrl?.trim() && /^https?:\/\//i.test(opts.mapUrl)) {
    return opts.mapUrl.trim();
  }

  return null;
}

/** Normalize g.page / maps newReviewUri variants. */
export function normalizeReviewUrl(url?: string | null): string | null {
  const raw = url?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;

  // Already a write-review / g.page review link
  if (/g\.page\/r\/[^/]+\/review/i.test(raw)) return raw.split("?")[0];
  if (/local\/writereview/i.test(raw)) return raw;
  if (/maps\.app\.goo\.gl/i.test(raw)) return raw;

  // g.page/r/TOKEN without /review
  const gPage = raw.match(/^(https?:\/\/g\.page\/r\/[^/?#]+)/i);
  if (gPage) return `${gPage[1]}/review`;

  return null;
}

/** @deprecated use object form */
export function toGoogleWriteReviewUrlFromMap(
  mapUrl: string | null | undefined,
): string | null {
  return toGoogleWriteReviewUrl({ mapUrl });
}

function extractPlaceIdFromMapUrl(mapUrl?: string | null): string | null {
  if (!mapUrl) return null;
  const m =
    mapUrl.match(/place_id:([^&]+)/i)?.[1] ||
    mapUrl.match(/[?&]placeid=([^&]+)/i)?.[1] ||
    mapUrl.match(/[?&]place_id=([^&]+)/i)?.[1];
  return m ? decodeURIComponent(m) : null;
}

function extractCid(mapUrl?: string | null): string | null {
  if (!mapUrl) return null;
  return mapUrl.match(/[?&]cid=(\d+)/i)?.[1] ?? null;
}
