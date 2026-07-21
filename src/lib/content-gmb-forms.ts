/** Preset amenities aligned with common Google Business Profile attribute groups */

export const GMB_AMENITY_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Accessibility",
    items: ["Wheelchair accessible entrance", "Wheelchair accessible restroom", "Wheelchair accessible parking"],
  },
  {
    title: "Payments",
    items: ["Credit cards", "Debit cards", "UPI", "Cash only"],
  },
  {
    title: "Parking & Transport",
    items: ["Free parking", "Paid parking", "On-site parking", "Valet parking"],
  },
  {
    title: "Amenities",
    items: ["WiFi", "Restroom", "Air conditioning", "Waiting area", "Gender-neutral restroom"],
  },
  {
    title: "Service options",
    items: ["Online appointments", "On-site services", "Same-day delivery", "In-store pickup"],
  },
];

export const GMB_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type GmbDay = (typeof GMB_DAYS)[number];

export interface DayHours {
  open: boolean;
  from: string;
  to: string;
}

export const DEFAULT_DAY_HOURS: Record<GmbDay, DayHours> = {
  Monday: { open: true, from: "09:00", to: "18:00" },
  Tuesday: { open: true, from: "09:00", to: "18:00" },
  Wednesday: { open: true, from: "09:00", to: "18:00" },
  Thursday: { open: true, from: "09:00", to: "18:00" },
  Friday: { open: true, from: "09:00", to: "18:00" },
  Saturday: { open: true, from: "09:00", to: "16:00" },
  Sunday: { open: false, from: "09:00", to: "16:00" },
};

export function serializeHours(hours: Record<GmbDay, DayHours>): string {
  return GMB_DAYS.filter((d) => hours[d].open)
    .map((d) => `${d.slice(0, 3)} ${hours[d].from}-${hours[d].to}`)
    .join(", ");
}

export const GMB_SOCIAL_FIELDS = [
  { key: "facebook" as const, label: "Facebook", placeholder: "https://facebook.com/yourpage" },
  { key: "instagram" as const, label: "Instagram", placeholder: "https://instagram.com/yourpage" },
  { key: "youtube" as const, label: "YouTube", placeholder: "https://youtube.com/@channel" },
  { key: "linkedin" as const, label: "LinkedIn", placeholder: "https://linkedin.com/company/..." },
];

export interface SpecialHoursEntry {
  id: string;
  date: string;
  label?: string;
  closed: boolean;
  from: string;
  to: string;
}

export function serializeSpecialHours(entries: SpecialHoursEntry[]): string {
  return entries
    .map((e) => {
      const date = e.date;
      if (e.closed) return `${date}: Closed${e.label ? ` (${e.label})` : ""}`;
      return `${date}: ${e.from}-${e.to}${e.label ? ` (${e.label})` : ""}`;
    })
    .join("\n");
}

export function formatDisplayDate(isoDate: string): string {
  try {
    const d = new Date(isoDate + "T12:00:00");
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}
