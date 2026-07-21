import type { GooglePhotoCategory } from "@/lib/google-service";
import type { ContentFieldKey, MediaTab } from "@/lib/content-update-fields";
import { MEDIA_TABS } from "@/lib/content-update-fields";

const UI_TAB_TO_GOOGLE: Record<MediaTab, GooglePhotoCategory | undefined> = {
  logo: "PROFILE",
  cover: "COVER",
  interior: "INTERIOR",
  exterior: "EXTERIOR",
  additional: undefined,
  videos: undefined,
};

const VALID_GOOGLE_CATEGORIES = new Set<string>([
  "COVER", "PROFILE", "INTERIOR", "EXTERIOR", "PRODUCT", "TEAM",
  "FOOD_AND_DRINK", "MENU", "AT_WORK", "COMMON_AREA", "ROOMS", "LANDSCAPE",
]);

/** Map UI media tab (logo, cover, …) to Google's locationAssociation category. */
export function mediaTabToGoogleCategory(tab: MediaTab): GooglePhotoCategory | undefined {
  return UI_TAB_TO_GOOGLE[tab];
}

/** Accept either Google enum (PROFILE) or UI tab id (logo). */
export function normalizePhotoCategory(raw?: string): GooglePhotoCategory | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (VALID_GOOGLE_CATEGORIES.has(upper)) return upper as GooglePhotoCategory;
  const fromTab = UI_TAB_TO_GOOGLE[raw.toLowerCase() as MediaTab];
  return fromTab;
}

export function fieldKeyToMediaTab(fieldKey: ContentFieldKey): MediaTab {
  if (fieldKey === "businessLogo") return "logo";
  if (fieldKey === "coverPhoto") return "cover";
  if (fieldKey === "videos") return "videos";
  return "interior";
}

/** Tabs shown in the bulk media form — logo field only shows Logo, etc. */
export function mediaTabsForField(fieldKey: ContentFieldKey) {
  if (fieldKey === "businessLogo") return MEDIA_TABS.filter((t) => t.id === "logo");
  if (fieldKey === "coverPhoto") return MEDIA_TABS.filter((t) => t.id === "cover");
  if (fieldKey === "videos") return MEDIA_TABS.filter((t) => t.id === "videos");
  if (fieldKey === "photos") {
    return MEDIA_TABS.filter((t) => ["interior", "exterior", "additional"].includes(t.id));
  }
  return MEDIA_TABS;
}
