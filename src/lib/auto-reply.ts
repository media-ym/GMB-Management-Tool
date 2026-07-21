export type AutoReplyMode = "manual" | "ai";
export type AutoReplyLength = "short" | "long";
export type AutoReplyReviewType = "text" | "no_text";

export interface AutoReplyAdvancedSettings {
  supportName: string;
  supportEmail: string;
  supportPhone: string;
  supportLink: string;
  addSupportFooter: boolean;
  addRegards: boolean;
}

export interface AutoReplyConfig {
  enabled: boolean;
  mode: AutoReplyMode;
  selectedRatings: number[];
  reviewTypes: AutoReplyReviewType[];
  template: string;
  replyLength: AutoReplyLength;
  addEmoji: boolean;
  advanced: AutoReplyAdvancedSettings;
  updatedAt?: string;
}

export const DEFAULT_AUTO_REPLY_CONFIG: AutoReplyConfig = {
  enabled: false,
  mode: "manual",
  selectedRatings: [5, 4, 3, 2, 1],
  reviewTypes: ["text", "no_text"],
  template: "",
  replyLength: "long",
  addEmoji: false,
  advanced: {
    supportName: "",
    supportEmail: "",
    supportPhone: "",
    supportLink: "",
    addSupportFooter: false,
    addRegards: true,
  },
};

export const AUTO_REPLY_SETTING_KEY = "review_auto_reply";

export function mergeAutoReplyConfig(raw: Partial<AutoReplyConfig> | null | undefined): AutoReplyConfig {
  return {
    ...DEFAULT_AUTO_REPLY_CONFIG,
    ...raw,
    selectedRatings: raw?.selectedRatings?.length ? raw.selectedRatings : DEFAULT_AUTO_REPLY_CONFIG.selectedRatings,
    reviewTypes: raw?.reviewTypes?.length ? raw.reviewTypes : DEFAULT_AUTO_REPLY_CONFIG.reviewTypes,
    advanced: { ...DEFAULT_AUTO_REPLY_CONFIG.advanced, ...raw?.advanced },
  };
}

export interface ReviewTemplateVars {
  businessName?: string;
  category?: string;
  address?: string;
  area?: string;
  customerName?: string;
  phone?: string;
  managerName?: string;
  city?: string;
  rating?: number;
}

/** Replace all review reply placeholders (PascalCase, snake_case, legacy). */
export function substituteReviewReplyTemplate(
  template: string,
  vars: ReviewTemplateVars,
): string {
  const customerName = vars.customerName ?? "Customer";
  const businessName = vars.businessName ?? "";
  const category = vars.category ?? "Auto Service";
  const address = vars.address ?? vars.city ?? "";
  const area = vars.area ?? vars.city ?? "";
  const phone = vars.phone ?? "";
  const managerName = vars.managerName ?? "";
  const city = vars.city ?? "";
  const rating = vars.rating != null ? String(vars.rating) : "";

  const map: Record<string, string> = {
    BusinessName: businessName,
    Category: category,
    Address: address,
    Area: area,
    CustomerName: customerName,
    Phone: phone,
    customer_name: customerName,
    Customer_Name: customerName,
    location_name: businessName,
    LocationName: businessName,
    manager_name: managerName,
    ManagerName: managerName,
    city: city,
    City: city,
    rating,
    Rating: rating,
  };

  let out = template;
  for (const [key, value] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), value);
  }

  // Legacy single-brace placeholders
  out = out
    .replace(/\{name\}/gi, customerName)
    .replace(/\{location\}/gi, businessName)
    .replace(/\{rating\}/gi, rating)
    .replace(/\{customer\}/gi, customerName)
    .replace(/\{phone\}/gi, phone)
    .replace(/\{city\}/gi, city)
    .replace(/\{address\}/gi, address)
    .replace(/\{area\}/gi, area)
    .replace(/\{category\}/gi, category);

  return out.trim();
}

/** @deprecated use substituteReviewReplyTemplate */
export function substituteAutoReplyTemplate(
  template: string,
  vars: ReviewTemplateVars,
): string {
  return substituteReviewReplyTemplate(template, vars);
}

export function inferLocationCategory(categoriesJson: string | null | undefined): string {
  if (!categoriesJson) return "Auto Service";
  try {
    const parsed = JSON.parse(categoriesJson) as unknown;
    if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]);
    if (parsed && typeof parsed === "object" && "primary" in parsed) {
      return String((parsed as { primary: unknown }).primary);
    }
  } catch {
    /* ignore */
  }
  return "Auto Service";
}

export function autoReplyCharLimit(length: AutoReplyLength): number {
  return length === "short" ? 200 : 400;
}
