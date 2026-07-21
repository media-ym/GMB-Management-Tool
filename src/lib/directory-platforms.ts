export type DirectoryStatus = "linked" | "processing" | "unlinked" | "error" | "unavailable";

export type DirectoryPlatformId =
  | "google_maps"
  | "gbp"
  | "apple_maps"
  | "bing"
  | "facebook"
  | "instagram"
  | "justdial"
  | "sulekha"
  | "indiacom"
  | "waze"
  | "linkedin"
  | "twitter";

export type DirectoryPlatform = {
  id: DirectoryPlatformId;
  name: string;
  shortName: string;
  /** Platforms we can auto-detect from Google Business Profile sync */
  autoFromGoogle?: boolean;
  /** Cannot be linked via this app yet */
  unavailableByDefault?: boolean;
  /** Owner dashboard to claim / manage listings */
  manageUrl?: string;
  /** Short how-to shown in Connect dialog */
  connectHint?: string;
  /** Build a search URL so the user can find/claim the listing */
  searchUrl: (loc: { name: string; city: string; phone?: string | null; address?: string }) => string;
};

export const DIRECTORY_PLATFORMS: DirectoryPlatform[] = [
  {
    id: "google_maps",
    name: "Google Maps",
    shortName: "Maps",
    autoFromGoogle: true,
    searchUrl: (l) =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${l.city}`)}`,
  },
  {
    id: "gbp",
    name: "Google Business Profile",
    shortName: "GBP",
    autoFromGoogle: true,
    searchUrl: () => "https://business.google.com/locations",
  },
  {
    id: "apple_maps",
    name: "Apple Maps",
    shortName: "Apple",
    searchUrl: (l) =>
      `https://maps.apple.com/?q=${encodeURIComponent(`${l.name} ${l.city}`)}`,
  },
  {
    id: "bing",
    name: "Bing Places",
    shortName: "Bing",
    manageUrl: "https://www.bing.com/forbusiness",
    connectHint:
      "1) bing.com/forbusiness kholo → Microsoft se login. 2) Import from Google Business Profile (sabse fast). 3) Listing verify karo. 4) Bing Maps / listing URL yahan paste karke Save.",
    searchUrl: (l) =>
      `https://www.bing.com/maps?q=${encodeURIComponent(`${l.name} ${l.address || ""} ${l.city}`.trim())}`,
  },
  {
    id: "facebook",
    name: "Facebook",
    shortName: "Facebook",
    searchUrl: (l) =>
      `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${l.name} ${l.city}`)}`,
  },
  {
    id: "instagram",
    name: "Instagram",
    shortName: "Instagram",
    searchUrl: (l) =>
      `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(l.name)}`,
  },
  {
    id: "justdial",
    name: "Justdial",
    shortName: "Justdial",
    searchUrl: (l) =>
      `https://www.justdial.com/${encodeURIComponent(l.city)}/${encodeURIComponent(l.name.replace(/\s+/g, "-"))}`,
  },
  {
    id: "sulekha",
    name: "Sulekha",
    shortName: "Sulekha",
    searchUrl: (l) =>
      `https://www.sulekha.com/${encodeURIComponent(l.city.toLowerCase())}`,
  },
  {
    id: "indiacom",
    name: "IndiaMART / India.com",
    shortName: "India.com",
    searchUrl: (l) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${l.name} ${l.city} site:indiamart.com OR site:india.com`)}`,
  },
  {
    id: "waze",
    name: "Waze",
    shortName: "Waze",
    searchUrl: (l) =>
      `https://www.waze.com/ul?q=${encodeURIComponent(`${l.name} ${l.city}`)}`,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    shortName: "LinkedIn",
    searchUrl: (l) =>
      `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(l.name)}`,
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    shortName: "X",
    searchUrl: (l) =>
      `https://x.com/search?q=${encodeURIComponent(l.name)}&f=user`,
  },
];

export function getDirectoryPlatform(id: string): DirectoryPlatform | undefined {
  return DIRECTORY_PLATFORMS.find((p) => p.id === id);
}

export function isDirectoryStatus(v: string): v is DirectoryStatus {
  return ["linked", "processing", "unlinked", "error", "unavailable"].includes(v);
}
