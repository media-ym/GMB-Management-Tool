/**
 * Server-side Google Places / Maps key.
 * Prefer GOOGLE_PLACES_API_KEY — use a key with NO HTTP-referrer restriction (IP or none).
 */
export function getPlacesApiKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null
  );
}

export function formatPlacesApiError(raw: string): string {
  if (/blocked/i.test(raw)) {
    return [
      "Places API (New) SearchText is blocked for this API key.",
      "Fix: Google Cloud Console → APIs & Services → Credentials → your key →",
      "Application restrictions = None (or server IP), API restrictions = Places API (New).",
      "Or set GOOGLE_PLACES_API_KEY in .env to a server-only key.",
    ].join(" ");
  }
  if (/not been used|SERVICE_DISABLED|PERMISSION_DENIED/i.test(raw)) {
    return "Enable Places API (New) on project gmb-api-for-myfng and wait ~5 minutes.";
  }
  if (/REQUEST_DENIED|not authorized/i.test(raw)) {
    return "API key cannot call Places — check key restrictions or use GOOGLE_PLACES_API_KEY.";
  }
  return raw;
}

export function isPlacesConfigError(message: string): boolean {
  return /blocked|REQUEST_DENIED|not been used|SERVICE_DISABLED|PERMISSION_DENIED|not authorized/i.test(
    message,
  );
}
