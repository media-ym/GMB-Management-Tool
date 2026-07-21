export interface GbpCatalogProduct {
  name: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  landingUrl?: string;
  googleItemId: string;
  googleEditId?: string;
}

const SKIP_LABELS = new Set([
  "products",
  "product",
  "view all",
  "view more",
  "menu",
  "services",
  "photos",
  "reviews",
  "posts",
  "about",
  "updates",
  "profiles",
  "directions",
  "website",
  "call",
  "save",
  "share",
  "learn more",
  "google",
  "overview",
  "see more",
  "from ",
  "close",
  "search",
  "sign in",
  "hours",
  "nearby",
  "stars",
  "address",
  "category",
  "phone",
  "email",
  "name",
  "description",
  "price",
]);

const UI_NOISE_PATTERNS = [
  /^[\d.]+ stars?$/i,
  /^address:?$/i,
  /^phone:?$/i,
  /^plus code:/i,
  /^copy /i,
  /^open /i,
  /^close$/i,
  /^search$/i,
  /^sign in$/i,
  /^zoom /i,
  /^show /i,
  /^write a review$/i,
  /^suggest an edit/i,
  /^browse /i,
  /^collapse /i,
  /^explore /i,
  /^interactive map$/i,
  /^hours$/i,
  /^nearby$/i,
  /^more info$/i,
  /^next page$/i,
  /^send to phone$/i,
  /^available search options/i,
  /^myfng\.in$/i,
  /^wednesday,/i,
  /^'[;+]/,
  /getMessage\(\)/,
  /\.Tb\(\)/,
  /return a\(b\+/,
  /^[\W\d]+$/,
  /^press \//i,
  /jump to the search box/i,
  /^something went wrong/i,
  /^edit services/i,
  /^on google$/i,
  /^category$/i,
  /^address$/i,
];

export function isProductName(s: string): boolean {
  const t = s.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^[\d\s₹$.,+\-()]+$/.test(t)) return false;
  const lower = t.toLowerCase();
  if (SKIP_LABELS.has(lower)) return false;
  for (const skip of SKIP_LABELS) {
    if (lower.startsWith(skip)) return false;
  }
  for (const re of UI_NOISE_PATTERNS) {
    if (re.test(t)) return false;
  }
  if (lower.includes("google.com") || lower.includes("my fng - multi brand")) return false;
  if (/^[\W_`'";\\()[\]{}]+$/.test(t.replace(/\s/g, ""))) return false;
  return true;
}

export function isImageUrl(s: string): boolean {
  return /googleusercontent\.com|ggpht\.com|gstatic\.com/i.test(s);
}

export function slugProductKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function catalogItemId(name: string, category?: string): string {
  return `gmb_catalog:${slugProductKey(name)}:${slugProductKey(category || "general")}`;
}

export function isValidCatalogProduct(p: GbpCatalogProduct): boolean {
  if (!isProductName(p.name)) return false;
  if (!p.imageUrl || !isImageUrl(p.imageUrl)) return false;
  return true;
}

export function isBusinessCatalogProduct(p: GbpCatalogProduct): boolean {
  if (!isProductName(p.name)) return false;
  if (p.imageUrl && isImageUrl(p.imageUrl)) return true;
  if (p.category && p.category.length > 2 && isCategoryLabel(p.category)) return true;
  // Require at least two words for products without image/category
  return p.name.split(/\s+/).length >= 2;
}

export function isCategoryLabel(s: string): boolean {
  const t = s.trim();
  if (!isProductName(t)) return false;
  if (t.length > 60) return false;
  return /service|repair|detailing|denting|painting|roadside|battery|towing|filter|wax|polish|bumper|fender/i.test(t);
}
