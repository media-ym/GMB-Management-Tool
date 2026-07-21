/** Parse location.attributesJson safely. */
export function parseLocationAttributes(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim() || raw === "[]" || raw === "{}") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const SOCIAL_PLATFORMS = ["facebook", "instagram", "youtube", "linkedin", "twitter", "tiktok", "pinterest"] as const;

export function hasSocialLinks(attrs: Record<string, unknown>): boolean {
  const social = attrs.socialLinks;
  if (social && typeof social === "object" && !Array.isArray(social)) {
    if (Object.values(social as Record<string, unknown>).some((v) => typeof v === "string" && v.trim())) {
      return true;
    }
  }
  return SOCIAL_PLATFORMS.some((key) => {
    const v = attrs[key];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export function hasChatLink(attrs: Record<string, unknown>): boolean {
  const chat = attrs.chatLink;
  return typeof chat === "string" && chat.trim().length > 0;
}

export function hasMenuLink(attrs: Record<string, unknown>, menuUrl?: string | null): boolean {
  if (menuUrl?.trim()) return true;
  const menu = attrs.menuLink;
  return typeof menu === "string" && menu.trim().length > 0;
}

/** Extract social profile URLs from Google location.attributes[]. */
export function extractSocialFromGoogleAttributes(attributes: unknown[]): Record<string, string> {
  const social: Record<string, string> = {};
  for (const raw of attributes ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const attr = raw as Record<string, unknown>;
    const name = String(attr.name ?? attr.attributeId ?? "").toLowerCase();
    const uri =
      (attr.uriValues as { uri?: string }[] | undefined)?.[0]?.uri ??
      (Array.isArray(attr.values) ? String(attr.values[0] ?? "") : "") ??
      (typeof attr.value === "string" ? attr.value : "");
    if (!uri?.trim()) continue;

    for (const platform of SOCIAL_PLATFORMS) {
      if (name.includes(platform) || name.includes(`url_${platform}`) || name === `url_${platform}`) {
        social[platform] = uri.trim();
      }
    }
  }
  return social;
}

export function extractChatLinkFromGoogleAttributes(attributes: unknown[]): string | null {
  for (const raw of attributes ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const attr = raw as Record<string, unknown>;
    const name = String(attr.name ?? "").toLowerCase();
    if (!name.includes("whatsapp") && !name.includes("url_whatsapp") && !name.includes("text_messaging") && !name.includes("chat")) continue;
    const uri =
      (attr.uriValues as { uri?: string }[] | undefined)?.[0]?.uri ??
      (Array.isArray(attr.values) ? String(attr.values[0] ?? "") : "");
    if (uri?.trim()) return uri.trim();
  }
  return null;
}

export function extractMenuLinkFromGoogleAttributes(attributes: unknown[]): string | null {
  for (const raw of attributes ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const attr = raw as Record<string, unknown>;
    const name = String(attr.name ?? "").toLowerCase();
    if (!name.includes("url_menu") && !name.includes("menu")) continue;
    const uri =
      (attr.uriValues as { uri?: string }[] | undefined)?.[0]?.uri ??
      (Array.isArray(attr.values) ? String(attr.values[0] ?? "") : "");
    if (uri?.trim()) return uri.trim();
  }
  return null;
}

export function mergeLocationAttributes(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current, ...patch };
  if (patch.socialLinks && typeof patch.socialLinks === "object") {
    const prev = (current.socialLinks as Record<string, string> | undefined) ?? {};
    merged.socialLinks = { ...prev, ...(patch.socialLinks as Record<string, string>) };
  }
  return merged;
}
