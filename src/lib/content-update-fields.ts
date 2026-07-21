import type { LucideIcon } from "lucide-react";

export type ContentFieldKey =
  | "phone"
  | "primaryCategory"
  | "additionalCategories"
  | "businessStatus"
  | "websiteLink"
  | "appointmentLink"
  | "menuLink"
  | "attributes"
  | "openingDate"
  | "openingHours"
  | "specialHours"
  | "photos"
  | "coverPhoto"
  | "videos"
  | "businessLogo"
  | "chatLink"
  | "socialLinks"
  | "services"
  | "products"
  | "description"
  | "qna"
  | "posts"
  | "autoReply"
  | "profileProtection"
  | "foodOrdering";

export type RiskLevel = "very_high" | "high" | "medium" | "low" | "very_low";
export type ImpactLevel = "very_high" | "high" | "medium" | "low" | "very_low";

export interface BulkUpdateCard {
  fieldKey: ContentFieldKey;
  title: string;
  description: string;
  risk: RiskLevel;
  impact: ImpactLevel;
  disabled?: boolean;
}

export interface BulkUpdateSection {
  id: string;
  title: string;
  cards: BulkUpdateCard[];
}

export type ContentFieldInputType =
  | "text"
  | "phone"
  | "url"
  | "textarea"
  | "social"
  | "media"
  | "info"
  | "choice"
  | "date"
  | "amenities"
  | "hours"
  | "tags"
  | "categorySearch"
  | "specialHours";

export interface FieldChoice {
  value: string;
  label: string;
}

export interface FieldTip {
  title: string;
  description: string;
}

export interface ContentFieldMeta {
  key: ContentFieldKey;
  label: string;
  inputType: ContentFieldInputType;
  placeholder?: string;
  submitLabel?: string;
  hint?: string;
  choices?: FieldChoice[];
  tips?: FieldTip[];
  formHeading?: string;
  /** GMB-style helper shown under the field label */
  gmbDescription?: string;
  maxLength?: number;
  maxTags?: number;
  tagSuggestions?: string[];
}

export const CONTENT_FIELD_META: Record<ContentFieldKey, ContentFieldMeta> = {
  phone: {
    key: "phone",
    label: "Phone Number",
    inputType: "phone",
    formHeading: "Add your business phone number",
    gmbDescription: "Customers will see this number on Google Search and Maps. Use a local number when possible.",
    placeholder: "+91 98765 43210",
    submitLabel: "Save Phone Number",
  },
  primaryCategory: {
    key: "primaryCategory",
    label: "Primary category",
    inputType: "categorySearch",
    formHeading: "Choose your primary category",
    gmbDescription: "Search Google's category list. Pick the one that best describes your core business.",
    placeholder: "Search categories…",
    tagSuggestions: [
      "Auto repair shop",
      "Car repair and maintenance service",
      "Oil change service",
      "Brake shop",
      "Auto air conditioning service",
      "Tire shop",
      "Auto body shop",
      "Car battery store",
      "Auto electrical service",
      "Dent removal service",
      "Car wash",
      "Auto painting",
      "Wheel alignment service",
      "Transmission shop",
      "Auto glass shop",
      "Mechanic",
      "Auto tune up service",
      "Smog inspection station",
      "Car detailing service",
    ],
    submitLabel: "Save Primary Category",
  },
  additionalCategories: {
    key: "additionalCategories",
    label: "Additional categories",
    inputType: "tags",
    formHeading: "Add additional categories",
    gmbDescription: "Search and add up to 9 categories that describe your business. These appear on Google Search & Maps.",
    maxTags: 9,
    tagSuggestions: [
      "Auto repair shop",
      "Oil change service",
      "Brake shop",
      "Car repair and maintenance service",
      "Auto air conditioning service",
      "Tire shop",
      "Auto body shop",
      "Car battery store",
      "Auto electrical service",
      "Dent removal service",
      "Car wash",
      "Auto painting",
      "Wheel alignment service",
      "Transmission shop",
      "Auto glass shop",
    ],
    submitLabel: "Save Categories",
  },
  businessStatus: {
    key: "businessStatus",
    label: "Business Status",
    inputType: "choice",
    formHeading: "Specify your Business Status",
    submitLabel: "Update Business Status",
    choices: [
      { value: "OPEN", label: "Open with Main Hours" },
      { value: "CLOSED_TEMPORARILY", label: "Temporarily Closed" },
      { value: "CLOSED_PERMANENTLY", label: "Permanently Closed" },
    ],
    tips: [
      {
        title: "Importance of Business Status",
        description:
          "Accurate status helps customers know if you're open, closed temporarily, or permanently shut.",
      },
      {
        title: "Impact on Ranking & Strength",
        description:
          "Business status drives customer trust; keep it updated during holidays or renovations.",
      },
    ],
  },
  websiteLink: {
    key: "websiteLink",
    label: "Website",
    inputType: "url",
    formHeading: "Add your website link",
    gmbDescription: "Link to your official website. Google may show this on your Business Profile.",
    placeholder: "https://myfng.in",
    submitLabel: "Save Website",
  },
  appointmentLink: {
    key: "appointmentLink",
    label: "Appointment link",
    inputType: "url",
    formHeading: "Add appointment booking link",
    gmbDescription: "Let customers book appointments directly from Google.",
    placeholder: "https://myfng.in/book",
    submitLabel: "Save Appointment Link",
  },
  menuLink: {
    key: "menuLink",
    label: "Menu / Services link",
    inputType: "url",
    formHeading: "Add menu or service catalog link",
    gmbDescription: "Link to your full service menu or price list.",
    placeholder: "https://myfng.in/services",
    submitLabel: "Save Menu Link",
  },
  attributes: {
    key: "attributes",
    label: "Attributes",
    inputType: "amenities",
    formHeading: "Select amenities & attributes",
    gmbDescription: "Choose features that apply to all selected locations. These appear on your Google profile.",
    submitLabel: "Save Attributes",
  },
  openingDate: {
    key: "openingDate",
    label: "Opening date",
    inputType: "date",
    formHeading: "When did you open?",
    gmbDescription: "Add the date your business first opened at this location. Helps show business history on Google.",
    submitLabel: "Save Opening Date",
  },
  openingHours: {
    key: "openingHours",
    label: "Opening hours",
    inputType: "hours",
    formHeading: "Set regular business hours",
    gmbDescription: "Add hours for each day of the week. Customers see these on Search and Maps.",
    submitLabel: "Save Opening Hours",
  },
  specialHours: {
    key: "specialHours",
    label: "Special hours",
    inputType: "specialHours",
    formHeading: "Add special hours",
    gmbDescription: "Set hours for holidays or special events. Choose a date and mark closed or set custom hours.",
    submitLabel: "Save Special Hours",
  },
  photos: {
    key: "photos",
    label: "Photos",
    inputType: "media",
    submitLabel: "Upload Photos to Selected Listings",
  },
  coverPhoto: {
    key: "coverPhoto",
    label: "Cover Photo",
    inputType: "media",
    submitLabel: "Upload Cover Photo",
  },
  videos: {
    key: "videos",
    label: "Videos",
    inputType: "media",
    submitLabel: "Upload Videos",
  },
  businessLogo: {
    key: "businessLogo",
    label: "Business Logo",
    inputType: "media",
    submitLabel: "Upload Logo",
  },
  chatLink: {
    key: "chatLink",
    label: "Messaging link",
    inputType: "url",
    formHeading: "Add WhatsApp or chat link",
    gmbDescription: "Customers can message you directly from your profile.",
    placeholder: "https://wa.me/919876543210",
    submitLabel: "Save Chat Link",
  },
  socialLinks: {
    key: "socialLinks",
    label: "Social profiles",
    inputType: "social",
    formHeading: "Add social profile links",
    gmbDescription: "Connect your social accounts to your Business Profile.",
    submitLabel: "Save Social Links",
  },
  services: {
    key: "services",
    label: "Services",
    inputType: "tags",
    formHeading: "Add services you offer",
    gmbDescription: "Search and add services customers can book. Each service helps you match relevant searches.",
    maxTags: 20,
    tagSuggestions: [
      "Oil change",
      "Brake service",
      "AC repair",
      "General car service",
      "Engine repair",
      "Battery replacement",
      "Wheel alignment",
      "Tire replacement",
      "Denting & painting",
      "Car wash & detailing",
      "Clutch repair",
      "Suspension repair",
      "Diagnostics & scanning",
      "Radiator service",
      "Transmission service",
    ],
    submitLabel: "Save Services",
  },
  products: {
    key: "products",
    label: "Products",
    inputType: "info",
    hint: "Use the Products tab for full product catalog management.",
    submitLabel: "Go to Products",
  },
  description: {
    key: "description",
    label: "Business description",
    inputType: "textarea",
    formHeading: "Describe your business",
    gmbDescription: "Tell customers what makes your business unique. Max 750 characters.",
    placeholder: "Multi-brand car servicing and repairs with certified technicians…",
    maxLength: 750,
    submitLabel: "Save Description",
  },
  qna: {
    key: "qna",
    label: "Q&A",
    inputType: "info",
    hint: "Q&A bulk update coming soon. Reply to questions from Reviews → Inbox for now.",
    submitLabel: "Close",
  },
  posts: {
    key: "posts",
    label: "Posts",
    inputType: "info",
    hint: "Create and schedule Google Posts from the Google Posts tab.",
    submitLabel: "Go to Google Posts",
  },
  autoReply: {
    key: "autoReply",
    label: "Auto Reply",
    inputType: "info",
    hint: "Configure review auto-reply in Reviews → Auto Replies settings.",
    submitLabel: "Close",
  },
  profileProtection: {
    key: "profileProtection",
    label: "Profile Protection",
    inputType: "info",
    hint: "Profile lock / protection settings are managed in Google Business Profile directly.",
    submitLabel: "Close",
  },
  foodOrdering: {
    key: "foodOrdering",
    label: "Food Ordering Links",
    inputType: "url",
    placeholder: "https://order.example.com",
    hint: "Add food ordering / delivery link (restaurants only).",
    submitLabel: "Update Food Ordering Link",
  },
};

export const UPCOMING_HOLIDAYS: { name: string; date: string; daysUntil: number }[] = [
  { name: "Rath Yatra", date: "16 Jul 2026", daysUntil: 2 },
  { name: "Independence Day", date: "15 Aug 2026", daysUntil: 32 },
  { name: "Onam", date: "26 Aug 2026", daysUntil: 43 },
  { name: "Milad un-Nabi (tentative)", date: "26 Aug 2026", daysUntil: 43 },
  { name: "Raksha Bandhan", date: "28 Aug 2026", daysUntil: 45 },
];

export const BULK_UPDATE_SECTIONS: BulkUpdateSection[] = [
  {
    id: "categories-status",
    title: "Categories, Opening Hour & Status Update",
    cards: [
      {
        fieldKey: "additionalCategories",
        title: "Update Additional Categories",
        description: "Check & add categories based on search volumes & relevancy.",
        risk: "very_high",
        impact: "high",
      },
      {
        fieldKey: "businessStatus",
        title: "Business Status",
        description: "Update your business status to inform your customers.",
        risk: "high",
        impact: "very_high",
      },
      {
        fieldKey: "openingDate",
        title: "Business Opening Date",
        description: "Add opening date & age of your brand to your profile.",
        risk: "very_low",
        impact: "low",
      },
      {
        fieldKey: "primaryCategory",
        title: "Primary Category Mismatch",
        description: "Ensure primary category matches actual business type for maximum visibility.",
        risk: "very_high",
        impact: "very_high",
      },
    ],
  },
  {
    id: "hours",
    title: "Opening Hours, Closing Hours & Special Hours Update",
    cards: [
      {
        fieldKey: "openingHours",
        title: "Opening & Closing Hours",
        description: "Adding opening & closing hours improves profile completion score by 7.5%.",
        risk: "very_low",
        impact: "high",
      },
      {
        fieldKey: "specialHours",
        title: "Special Hours",
        description: "Set holiday & special hours to prevent customer confusion.",
        risk: "very_low",
        impact: "high",
      },
    ],
  },
  {
    id: "services-content",
    title: "Services, FAQs, Business Amenities & Description Update",
    cards: [
      {
        fieldKey: "services",
        title: "Add Business Services",
        description: "Adding services can improve ranking by up to 10%.",
        risk: "low",
        impact: "very_high",
      },
      {
        fieldKey: "description",
        title: "Short & Long Description",
        description: "Improve profile strength and completion score with a fresh description.",
        risk: "very_low",
        impact: "low",
      },
      {
        fieldKey: "qna",
        title: "Answer Business FAQs",
        description: "Update frequently asked questions for your listings.",
        risk: "medium",
        impact: "high",
      },
      {
        fieldKey: "attributes",
        title: "Listing Attributes & Business Amenities",
        description: "Add parking, WiFi, accessibility & payment methods.",
        risk: "low",
        impact: "medium",
      },
    ],
  },
  {
    id: "media-social",
    title: "Logo, Photo, Videos & Social Links Update",
    cards: [
      {
        fieldKey: "photos",
        title: "Bulk Storefront Photos Upload",
        description: "Upload interior, exterior & other photos in bulk.",
        risk: "very_low",
        impact: "high",
      },
      {
        fieldKey: "socialLinks",
        title: "Bulk Social Links Update",
        description: "Add social media profiles to GMB listings in bulk.",
        risk: "very_low",
        impact: "very_low",
      },
      {
        fieldKey: "businessLogo",
        title: "Logo & Cover Photo Update",
        description: "Add logo & cover photo across all listings in one go.",
        risk: "very_low",
        impact: "medium",
      },
      {
        fieldKey: "videos",
        title: "Videos & Reels Upload",
        description: "Upload videos & reels to engage your customers.",
        risk: "very_low",
        impact: "medium",
      },
    ],
  },
  {
    id: "links-automation",
    title: "Website, Menu, Appointment & Lock Update",
    cards: [
      {
        fieldKey: "websiteLink",
        title: "Update Website Link",
        description: "Add or update your business website with UTM tracking.",
        risk: "high",
        impact: "very_high",
      },
      {
        fieldKey: "menuLink",
        title: "Update Menu / Service Catalog Link",
        description: "Add menu or service catalog link for better engagement.",
        risk: "medium",
        impact: "high",
      },
      {
        fieldKey: "appointmentLink",
        title: "Appointment Booking & Reservation Links",
        description: "Add appointment links to be shown on Google Search.",
        risk: "low",
        impact: "medium",
      },
      {
        fieldKey: "chatLink",
        title: "WhatsApp Chat Link Update",
        description: "Add WhatsApp or chat link for direct customer messaging.",
        risk: "low",
        impact: "medium",
      },
      {
        fieldKey: "foodOrdering",
        title: "Food Ordering Links",
        description: "Add food ordering links (restaurants only).",
        risk: "low",
        impact: "low",
        disabled: true,
      },
      {
        fieldKey: "profileProtection",
        title: "Bulk Profile Protection Lock",
        description: "Review and manage profile lock across listings.",
        risk: "low",
        impact: "medium",
      },
      {
        fieldKey: "autoReply",
        title: "Set Review Auto Replies",
        description: "Configure automatic review replies for selected listings.",
        risk: "very_low",
        impact: "low",
      },
    ],
  },
  {
    id: "posts",
    title: "Create & Update Posts",
    cards: [
      {
        fieldKey: "posts",
        title: "Create Google Posts",
        description: "Create offers, events & updates across verified listings.",
        risk: "very_low",
        impact: "high",
      },
      {
        fieldKey: "products",
        title: "Bulk Product Update",
        description: "Manage product catalog across all connected listings.",
        risk: "low",
        impact: "medium",
      },
    ],
  },
];

export type MediaTab = "interior" | "exterior" | "logo" | "cover" | "additional" | "videos";

export const MEDIA_TABS: { id: MediaTab; label: string; fields: ContentFieldKey[] }[] = [
  { id: "videos", label: "Videos", fields: ["videos"] },
  { id: "logo", label: "Logo", fields: ["businessLogo"] },
  { id: "cover", label: "Cover", fields: ["coverPhoto"] },
  { id: "interior", label: "Interior Photos", fields: ["photos"] },
  { id: "exterior", label: "Exterior", fields: ["photos"] },
  { id: "additional", label: "Additional", fields: ["photos"] },
];
