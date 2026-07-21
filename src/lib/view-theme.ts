import type { StatAccent } from "@/components/shared/stat-card";

/** Consistent colorful accent per page title (Dashboard-style theme). */
export const VIEW_PAGE_ACCENTS: Record<string, StatAccent> = {
  Dashboard: "blue",
  Locations: "emerald",
  Reviews: "amber",
  Analytics: "blue",
  Content: "cyan",
  Directories: "teal",
  "Keywords Position": "violet",
  Competitors: "rose",
  "Market Research": "indigo",
  "Local SEO": "emerald",
  "MiSA AI": "cyan",
  "Media Library": "pink",
  Reports: "orange",
  "Google Integration": "blue",
  Notifications: "amber",
  "Audit Logs": "slate",
  System: "slate",
  "API Documentation": "cyan",
  "OpenAPI Specification": "teal",
  "Google API Mapping": "indigo",
  "Project Roadmap": "violet",
  "Design System": "purple",
  "Screen Wireframes": "pink",
  Settings: "blue",
  "End-Clients": "emerald",
  "Google Posts": "cyan",
};

export function accentForPageTitle(title: string): StatAccent {
  return VIEW_PAGE_ACCENTS[title] ?? "blue";
}
