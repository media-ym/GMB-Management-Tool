/** Helpers for Google Business Profile metadata — verification, Maps URL, status. */

export type GbpVerificationState = "verified" | "unverified";

export interface GbpMetadataLike {
  placeId?: string | null;
  mapsUri?: string | null;
  hasVoiceOfMerchant?: boolean | null;
}

export interface GbpOpenInfoLike {
  status?: string | null;
}

export interface VoiceOfMerchantStateLike {
  hasVoiceOfMerchant?: boolean | null;
  verify?: { hasPendingVerification?: boolean | null } | null;
}

/**
 * Authoritative verification check — use VoiceOfMerchantState API response.
 * hasVoiceOfMerchant=true means verified on Google; anything else is unverified.
 */
export function resolveVerificationFromVoiceOfMerchant(
  vom?: VoiceOfMerchantStateLike | null,
): GbpVerificationState {
  return vom?.hasVoiceOfMerchant === true ? "verified" : "unverified";
}

/** @deprecated Use resolveVerificationFromVoiceOfMerchant — placeId is NOT verification. */
export function resolveVerificationState(
  _metadata?: GbpMetadataLike | null,
  _verifications?: { state?: string }[] | null,
): GbpVerificationState {
  return "unverified";
}

export function hasPendingVerification(vom?: VoiceOfMerchantStateLike | null): boolean {
  return !!vom?.verify?.hasPendingVerification;
}

/** Profile is disabled only when permanently closed on Google. */
export function resolveProfileStatus(
  openInfo?: GbpOpenInfoLike | null,
): "active" | "disabled" {
  if (openInfo?.status === "CLOSED_PERMANENTLY") return "disabled";
  return "active";
}

function isBrokenMapUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return url.includes("locations/") || url.includes("?cid=locations");
}

/** Prefer Google's mapsUri; fall back to place_id or name/coords search. */
export function resolveGbpMapUrl(opts: {
  metadata?: GbpMetadataLike | null;
  googleLocationId?: string | null;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  existingUrl?: string | null;
}): string | null {
  const mapsUri = opts.metadata?.mapsUri?.trim();
  if (mapsUri) return mapsUri;

  const placeId = opts.metadata?.placeId?.trim();
  if (placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
  }

  if (opts.existingUrl && !isBrokenMapUrl(opts.existingUrl)) {
    return opts.existingUrl;
  }

  if (opts.latitude != null && opts.longitude != null) {
    const label = opts.name?.trim();
    const query = label
      ? encodeURIComponent(label)
      : `${opts.latitude},${opts.longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  if (opts.name?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(opts.name.trim())}`;
  }

  return null;
}
