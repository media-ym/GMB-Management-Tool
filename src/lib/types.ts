// Shared domain types for MyFNG Local AI Manager

/** Built-in + custom role slugs (custom roles are free-form strings). */
export type Role = string;

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", description: "Full access to every module and setting." },
  { value: "marketing_manager", label: "Marketing Manager", description: "Reviews, Posts, Analytics, AI. No user management." },
  { value: "branch_manager", label: "Branch Manager", description: "Assigned locations, reviews, posts. No global settings." },
  { value: "customer_support", label: "Customer Support", description: "Reviews and AI replies only." },
  { value: "viewer", label: "Viewer", description: "Read-only access to dashboard and reports." },
];

export type ViewKey =
  | "dashboard"
  | "locations"
  | "reviews"
  | "posts"
  | "analytics"
  | "seo"
  | "ai"
  | "media"
  | "reports"
  | "google"
  | "notifications"
  | "audit"
  | "system"
  | "api-docs"
  | "openapi-spec"
  | "google-api-mapping"
  | "google-billing"
  | "roadmap"
  | "design-system"
  | "wireframes"
  | "settings"
  | "clients"
  | "content-updates"
  | "directories"
  | "keywords"
  | "competitors"
  | "market-research";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar?: string | null;
  assignedLocationIds?: string[] | null;
  /**
   * When set, every location-scoped API must use these IDs.
   * - client_portal → that client's locations
   * - staff → agency locations only (excludes portal-tenant GBPs)
   */
  scopedLocationIds?: string[] | null;
  /** End-client portal link (null for staff). */
  clientId?: string | null;
  /** Effective permissions for this user (builtin + RBAC overrides / custom roles). */
  permissions?: string[];
}

export type SyncStatus = "synced" | "syncing" | "pending" | "error";
export type LocationStatus = "active" | "paused" | "error";
export type Sentiment = "positive" | "neutral" | "negative";
export type ReplyStatus = "pending" | "replied" | "ignored";
export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export type PostType = "whats_new" | "offer" | "event" | "update";

// Standard API response envelope (per architecture doc §50)
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  errors: unknown | null;
  timestamp: string;
}

export interface DashboardSummary {
  googleConnected?: boolean;
  totalLocations: number;
  activeLocations: number;
  syncErrors: number;
  totalReviews: number;
  pendingReviews: number;
  avgRating: number;
  totalSearchViews: number;
  totalMapsViews: number;
  totalSearchDesktop?: number;
  totalSearchMobile?: number;
  totalMapsDesktop?: number;
  totalMapsMobile?: number;
  totalWebsiteClicks: number;
  totalPhoneCalls: number;
  totalDirectionRequests: number;
  totalConversations?: number;
  totalBookings?: number;
  /** GBP-style interactions: website + calls + directions + chat + bookings */
  totalInteractions?: number;
  avgHealthScore: number;
  avgVisibilityScore: number;
  publishedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
}

export interface LocationWithStats {
  id: string;
  name: string;
  city: string;
  region: string;
  address: string;
  phone: string | null;
  website: string | null;
  status: LocationStatus;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  avgRating: number;
  reviewCount: number;
  healthScore: number;
  visibilityScore: number;
  latitude: number | null;
  longitude: number | null;
  verificationState: string | null;
}

export interface ReviewWithLocation {
  id: string;
  locationId: string;
  locationName: string;
  locationCity: string;
  googleReviewId: string;
  authorName: string;
  authorPhoto: string | null;
  rating: number;
  text: string;
  sentiment: Sentiment;
  replyText: string | null;
  replySource: "manual" | "ai" | "template" | null;
  replyStatus: ReplyStatus;
  repliedAt: string | null;
  createdAt: string;
}

export interface ReviewChangeWithLocation {
  id: string;
  reviewId: string | null;
  locationId: string;
  locationName: string;
  locationCity: string;
  googleReviewId: string;
  changeType: "deleted" | "edited";
  authorName: string;
  authorPhoto: string | null;
  previousRating: number | null;
  previousText: string | null;
  newRating: number | null;
  newText: string | null;
  detectedAt: string;
}

export interface PostWithLocation {
  id: string;
  locationId: string;
  locationName: string;
  type: PostType;
  title: string;
  content: string;
  ctaType: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  status: PostStatus;
  source: "manual" | "ai" | "google";
  scheduledAt: string | null;
  recurrenceType: "once" | "weekly" | null;
  recurrenceDayOfWeek: number | null;
  recurrenceTime: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface AnalyticsPoint {
  date: string;
  searchViews: number;
  mapsViews: number;
  websiteClicks: number;
  phoneCalls: number;
  directionRequests: number;
}

export interface GeoGridPoint {
  lat: number;
  lng: number;
  rank: number; // 1-50, 0 = not ranked
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  promptType?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical" | "success";
  read: boolean;
  link: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  userName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  status: "success" | "failed";
  ip: string | null;
  createdAt: string;
  newValue: string | null;
}
