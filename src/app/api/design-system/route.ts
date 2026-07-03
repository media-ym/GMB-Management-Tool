import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// GET /api/design-system — design tokens & component spec (doc 16)
export async function GET() {
  return ok({
    philosophy: {
      keywords: ["Professional", "Clean", "Minimal", "Fast", "Data Driven", "AI First", "Premium", "Spacious"],
      avoid: ["Colorful dashboards", "Heavy gradients", "Large shadows", "Rounded cartoon UI", "Unnecessary animations"],
    },
    grid: {
      desktop: "12 Column Grid",
      container: "1440px",
      contentWidth: "1320px",
      gutter: "24px",
    },
    breakpoints: [
      { name: "Mobile", range: "0-767px", prefix: "sm:" },
      { name: "Tablet", range: "768-1023px", prefix: "md:" },
      { name: "Laptop", range: "1024-1439px", prefix: "lg:" },
      { name: "Desktop", range: "1440px+", prefix: "xl:" },
      { name: "Large Desktop", range: "1920px+", prefix: "2xl:" },
    ],
    layout: {
      sidebar: { collapsed: "72px (mobile drawer)", expanded: "260px (desktop)" },
      topNav: ["Global Search", "Sync", "Notifications", "Theme Toggle", "Profile", "Current Location Filter"],
      footer: "Sticky bottom — brand + version + MiSA AI badge",
    },
    colors: {
      note: "Doc 16 specifies #0057FF (blue) as primary. Platform uses emerald (#059669) per design rules — no indigo/blue. All other colors match spec.",
      primary: { hex: "#059669", name: "Emerald 600", usage: "Primary actions, active states, brand" },
      primaryHover: { hex: "#047857", name: "Emerald 700", usage: "Hover states" },
      success: { hex: "#16A34A", name: "Green 600", usage: "Success states, healthy status" },
      warning: { hex: "#F59E0B", name: "Amber 500", usage: "Warnings, pending, scheduled" },
      danger: { hex: "#DC2626", name: "Red 600", usage: "Errors, destructive, critical" },
      info: { hex: "#0284C7", name: "Sky 600", usage: "Info, tips" },
      background: { hex: "#F8FAFC", name: "Slate 50", usage: "Page background" },
      card: { hex: "#FFFFFF", name: "White", usage: "Card backgrounds" },
      border: { hex: "#E5E7EB", name: "Gray 200", usage: "Borders, dividers" },
      textPrimary: { hex: "#111827", name: "Gray 900", usage: "Primary text" },
      textSecondary: { hex: "#6B7280", name: "Gray 500", usage: "Secondary/muted text" },
      accent: { hex: "#F59E0B", name: "Amber 500", usage: "MiSA AI accent, AI-generated tags" },
    },
    typography: {
      font: "Inter (via Geist Sans)",
      headings: [
        { level: "H1", size: "32px", weight: "700", usage: "Page titles" },
        { level: "H2", size: "28px", weight: "700", usage: "Section titles" },
        { level: "H3", size: "24px", weight: "600", usage: "Card titles" },
        { level: "H4", size: "20px", weight: "600", usage: "Subsection titles" },
        { level: "H5", size: "18px", weight: "600", usage: "Widget titles" },
      ],
      body: "16px / 400",
      small: "14px / 400",
      caption: "12px / 400",
    },
    borderRadius: {
      cards: "12px (var(--radius))",
      buttons: "10px (calc(var(--radius) - 2px))",
      inputs: "10px",
      dialogs: "16px (calc(var(--radius) + 4px))",
    },
    shadows: {
      cards: "Small (shadow-sm)",
      modal: "Medium (shadow-lg)",
      dropdown: "Small (shadow-md)",
      rule: "Avoid heavy shadows",
    },
    buttons: {
      variants: ["Primary (filled, emerald)", "Secondary (outline)", "Ghost (transparent)", "Danger (rose)", "Icon Button", "Loading Button"],
      sizes: ["Small (h-8)", "Medium (h-9)", "Large (h-10)"],
    },
    inputs: ["Text", "Textarea", "Search", "Email", "Password", "Phone", "Number", "Date", "Select", "Multi Select", "Tags", "Autocomplete"],
    cards: ["KPI Card", "Analytics Card", "Review Card", "Location Card", "Notification Card", "AI Suggestion Card", "Chart Card"],
    tables: {
      features: ["Sticky Header", "Pagination", "Sorting", "Filtering", "Column Resize", "Export", "Bulk Selection"],
      types: ["Review Table", "Location Table", "Analytics Table", "SEO Table", "Users Table", "Posts Table"],
    },
    charts: {
      library: "Recharts",
      types: ["Line", "Bar", "Area", "Pie", "Donut", "Heatmap (custom)", "Ranking Chart"],
      colors: ["var(--chart-1) emerald", "var(--chart-2) amber", "var(--chart-3) teal", "var(--chart-4) rose", "var(--chart-5) cyan"],
    },
    icons: {
      library: "Lucide React",
      sizes: [18, 20, 24],
    },
    modals: ["Small", "Medium", "Large", "Fullscreen"],
    toasts: {
      types: ["Success", "Warning", "Error", "Info"],
      duration: "4 seconds",
      library: "Sonner",
    },
    loadingStates: ["Skeleton", "Spinner", "Progress Bar", "Button Loader"],
    emptyStates: { required: ["Illustration (icon)", "Message", "Primary Action"] },
    errorStates: { required: ["Error Icon", "Message", "Retry Button", "Support Link"] },
    animations: { maxDuration: "200ms", allowed: ["Fade", "Slide", "Scale"], avoid: ["Bounce", "Rotate", "Complex animations"] },
    accessibility: { contrast: "WCAG AA", keyboard: "Supported", aria: "Supported", focusRing: "Visible" },
    darkMode: { supported: true, method: "CSS Variables (next-themes)", note: "No separate components — same components work in both modes" },
    componentNaming: ["DashboardCard", "ReviewCard", "LocationCard", "MetricCard", "AnalyticsChart", "NotificationBell", "SidebarMenu", "HeaderSearch"],
    themeVariables: ["--primary", "--background", "--card", "--foreground", "--border", "--radius", "--ring"],
    finalRules: [
      "White background", "High whitespace", "Minimal borders", "Small shadows",
      "Consistent spacing", "Responsive first", "Enterprise look", "Fast rendering",
      "Accessibility compliant", "Reusable components",
    ],
  });
}
