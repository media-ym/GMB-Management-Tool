/** Client-safe Google Ads Keyword Planner geo + date helpers (no DB / secrets). */

export const LANGUAGE_ENGLISH = "1000";
export const LANGUAGE_HINDI = "1001";
export const GEO_INDIA = "2356";

const ADS_MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;

export type PlannerDatePreset = "1" | "3" | "6" | "12";

export type YearMonth = { year: number; month: (typeof ADS_MONTHS)[number] };

/** Major India geos for Keyword Planner (Google Ads geoTargetConstants). */
export const INDIA_GEO_OPTIONS: { id: string; label: string; region?: string }[] = [
  { id: GEO_INDIA, label: "India", region: "Country" },
  { id: "1007785", label: "Mumbai", region: "Maharashtra" },
  { id: "1007788", label: "Pune", region: "Maharashtra" },
  { id: "1007751", label: "Delhi", region: "Delhi" },
  { id: "1007745", label: "Bengaluru", region: "Karnataka" },
  { id: "1007765", label: "Hyderabad", region: "Telangana" },
  { id: "1007747", label: "Chennai", region: "Tamil Nadu" },
  { id: "1007772", label: "Kolkata", region: "West Bengal" },
  { id: "1007740", label: "Ahmedabad", region: "Gujarat" },
  { id: "1007768", label: "Jaipur", region: "Rajasthan" },
  { id: "1007793", label: "Surat", region: "Gujarat" },
  { id: "1007774", label: "Lucknow", region: "Uttar Pradesh" },
  { id: "1007770", label: "Kanpur", region: "Uttar Pradesh" },
  { id: "1007783", label: "Nagpur", region: "Maharashtra" },
  { id: "1007766", label: "Indore", region: "Madhya Pradesh" },
  { id: "1007786", label: "Nashik", region: "Maharashtra" },
  { id: "1007790", label: "Rajkot", region: "Gujarat" },
  { id: "1007796", label: "Vadodara", region: "Gujarat" },
  { id: "1007750", label: "Coimbatore", region: "Tamil Nadu" },
  { id: "1007771", label: "Kochi", region: "Kerala" },
  { id: "1007748", label: "Chandigarh", region: "Chandigarh" },
  { id: "1007757", label: "Goa", region: "Goa" },
  { id: "1007798", label: "Visakhapatnam", region: "Andhra Pradesh" },
  { id: "1007744", label: "Bhopal", region: "Madhya Pradesh" },
  { id: "1007787", label: "Patna", region: "Bihar" },
  { id: "1007780", label: "Mysuru", region: "Karnataka" },
  { id: "1007775", label: "Ludhiana", region: "Punjab" },
  { id: "1007753", label: "Faridabad", region: "Haryana" },
  { id: "1007755", label: "Ghaziabad", region: "Uttar Pradesh" },
  { id: "1007762", label: "Gurugram", region: "Haryana" },
  { id: "1007784", label: "Noida", region: "Uttar Pradesh" },
  { id: "1007795", label: "Thiruvananthapuram", region: "Kerala" },
  { id: "1007778", label: "Madurai", region: "Tamil Nadu" },
  { id: "1007791", label: "Ranchi", region: "Jharkhand" },
  { id: "1007759", label: "Guwahati", region: "Assam" },
];

export const CITY_GEO: Record<string, string> = {
  mumbai: "1007785",
  "thane west": "1007785",
  thane: "1007785",
  "navi mumbai": "1007785",
  "mira road east": "1007785",
  "vile parle west": "1007785",
  kalyan: "1007785",
  "kalyan west": "1007785",
  "kalyan east": "1007785",
  dombivli: "1007785",
  pune: "1007788",
  delhi: "1007751",
  "new delhi": "1007751",
  bangalore: "1007745",
  bengaluru: "1007745",
  hyderabad: "1007765",
  chennai: "1007747",
  kolkata: "1007772",
  ahmedabad: "1007740",
  jaipur: "1007768",
  surat: "1007793",
  lucknow: "1007774",
  kanpur: "1007770",
  nagpur: "1007783",
  indore: "1007766",
  nashik: "1007786",
  rajkot: "1007790",
  vadodara: "1007796",
  coimbatore: "1007750",
  kochi: "1007771",
  ernakulam: "1007771",
  chandigarh: "1007748",
  goa: "1007757",
  panaji: "1007757",
  visakhapatnam: "1007798",
  vizag: "1007798",
  bhopal: "1007744",
  patna: "1007787",
  mysuru: "1007780",
  mysore: "1007780",
  ludhiana: "1007775",
  faridabad: "1007753",
  ghaziabad: "1007755",
  gurugram: "1007762",
  gurgaon: "1007762",
  noida: "1007784",
  thiruvananthapuram: "1007795",
  trivandrum: "1007795",
  madurai: "1007778",
  ranchi: "1007791",
  guwahati: "1007759",
};

export const DATE_PRESET_OPTIONS: { value: PlannerDatePreset; label: string }[] = [
  { value: "1", label: "Last month" },
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

export function geoLabelForConstant(geoTargetConstant: string): string {
  return (
    INDIA_GEO_OPTIONS.find((g) => g.id === geoTargetConstant)?.label ??
    (geoTargetConstant === GEO_INDIA ? "India" : `Geo ${geoTargetConstant}`)
  );
}

/** Last complete calendar month(s). Default 1 month. */
export function plannerYearMonthRange(preset: PlannerDatePreset = "1"): {
  start: YearMonth;
  end: YearMonth;
  label: string;
} {
  const months = Math.max(1, parseInt(preset, 10) || 1);
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - (months - 1), 1);

  const toYm = (d: Date): YearMonth => ({
    year: d.getFullYear(),
    month: ADS_MONTHS[d.getMonth()],
  });

  const start = toYm(startDate);
  const end = toYm(endDate);
  const fmt = (ym: YearMonth) => `${ym.month.slice(0, 1)}${ym.month.slice(1, 3).toLowerCase()} ${ym.year}`;
  const label =
    start.year === end.year && start.month === end.month
      ? fmt(start)
      : `${fmt(start)} – ${fmt(end)}`;

  return { start, end, label };
}
