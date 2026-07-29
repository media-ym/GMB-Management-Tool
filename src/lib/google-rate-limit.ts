// Token-bucket rate limiter for Google Business Profile APIs.
// Google's default quota: ~10 QPS per project.
// Plus retry/backoff wrapper for transient 429/503 errors.

const MAX_QPS = 10;
const MAX_REQUESTS = MAX_QPS; // tokens per second
let tokens = MAX_REQUESTS;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  tokens = Math.min(MAX_REQUESTS, tokens + elapsed * MAX_REQUESTS);
  lastRefill = now;
}

export async function waitForRateLimit(): Promise<void> {
  refill();
  if (tokens >= 1) {
    tokens -= 1;
    return;
  }
  // Wait until a token is available
  const waitMs = (1 - tokens) * (1000 / MAX_REQUESTS);
  await new Promise((r) => setTimeout(r, waitMs));
  refill();
  tokens -= 1;
}

interface RetryOptions {
  maxAttempts?: number;
  onRetry?: (attempt: number, status: number, waitMs: number) => void;
}

/**
 * Wraps an async fetch operation with rate limiting + exponential backoff retry.
 * Retries on HTTP 429 (Too Many Requests) and 5xx errors.
 * Honors Retry-After header if present.
 */
export async function withRetry<T>(
  operation: () => Promise<{ ok: boolean; status: number; retryAfter?: number; body: () => Promise<string> }>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitForRateLimit();
    let result;
    try {
      result = await operation();
    } catch (e: any) {
      // Network error — retry
      lastError = e;
      if (attempt < maxAttempts) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        options.onRetry?.(attempt, 0, waitMs);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw e;
    }

    if (result.ok) {
      // Success — parse JSON
      const text = await result.body();
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    // Retryable status codes
    const retryable = result.status === 429 || (result.status >= 500 && result.status < 600);
    if (!retryable || attempt === maxAttempts) {
      const text = await result.body();
      // Sanitize the final error message before throwing to callers —
      // strips internal request IDs / project numbers and maps common
      // HTTP errors to user-friendly strings.
      throw new Error(sanitizeGoogleError(`Google API ${result.status}: ${text}`));
    }

    // Calculate wait time
    const waitMs = result.retryAfter ? result.retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt - 1), 8000);
    lastError = new Error(`Google API ${result.status} (attempt ${attempt})`);
    options.onRetry?.(attempt, result.status, waitMs);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw lastError
    ? new Error(sanitizeGoogleError(lastError.message))
    : new Error("withRetry: max attempts reached");
}

/** Sanitize Google API error messages for end-user display. */
export function sanitizeGoogleError(message: string): string {
  // Prefer Google's human-readable `error.message` / validation details when JSON.
  const jsonMatch = message.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const details = parsed?.error?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          const errDetails = d?.errorDetails;
          if (Array.isArray(errDetails) && errDetails.length) {
            const first = errDetails[0];
            const field = first?.field ? ` (${first.field})` : "";
            const detailMsg = first?.message || first?.value;
            if (detailMsg) {
              if (/source_url|media/i.test(String(first?.field || "")) || /link.*invalid/i.test(String(detailMsg))) {
                return `Google rejected the post image URL${field}: ${detailMsg}. Use a public HTTPS image URL (Google cannot fetch http:// IP or private storage links).`;
              }
              return `Google rejected the request${field}: ${detailMsg}`;
            }
          }
        }
      }
      const googleMsg = parsed?.error?.message;
      if (typeof googleMsg === "string" && googleMsg.trim()) {
        if (/not eligible/i.test(googleMsg)) {
          return `${googleMsg} Open Google Business Profile to verify (often video) — SMS/call may not be offered for this listing.`;
        }
        if (/INVALID_ARGUMENT|invalid argument/i.test(googleMsg) && /verif/i.test(message)) {
          return "Google rejected this verification request. This listing may not offer SMS/call via API — verify in Google Business Profile instead.";
        }
        return googleMsg;
      }
    } catch {
      // fall through
    }
  }

  // Strip internal request IDs, project numbers, and long JSON payloads
  let clean = message.replace(/Request ID:\s*[^\s,]+/gi, "").trim();
  clean = clean.replace(/projects\/\d+/g, "projects/[REDACTED]");
  // Map common errors to friendly messages
  if (/401|invalid_grant|invalid_token/i.test(clean)) {
    return "Google authorization expired. Please reconnect your Google account.";
  }
  if (/403/.test(clean) && /insufficient authentication scopes/i.test(clean)) {
    return "Google Business Profile permission not granted. Go to More → Google → Disconnect → Connect again and allow all permissions.";
  }
  if (/403/.test(clean)) {
    return "Google API access denied (403). Go to More → Google → reconnect, and enable My Business APIs in Google Cloud Console.";
  }
  if (/429/.test(clean)) {
    return "Google API rate limit reached. Please try again in a few minutes.";
  }
  if (/50\d/.test(clean)) {
    return "Google servers are temporarily unavailable. Please try again.";
  }
  // Only map INVALID_ARGUMENT → verification wording for verification endpoints
  if (/INVALID_ARGUMENT|invalid argument/i.test(clean) && /verif/i.test(clean)) {
    return "Google rejected this verification request. This listing may not offer SMS/call via API — verify in Google Business Profile instead.";
  }
  if (/INVALID_ARGUMENT|invalid argument/i.test(clean)) {
    return "Google rejected the request (invalid argument). Check the post image URL — it must be a public HTTPS link Google can fetch.";
  }
  // Truncate long messages
  return clean.length > 200 ? clean.slice(0, 200) + "…" : clean;
}
