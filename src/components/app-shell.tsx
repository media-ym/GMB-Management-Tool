"use client";

import { useSyncExternalStore, useEffect } from "react";
import { signOut } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useAppStore, roleLabel } from "@/lib/store";
import { canAccessView } from "@/lib/permissions";
import type { NotificationItem, SessionUser, ViewKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Building2, Menu, LogOut, RefreshCw, Sun, Moon, ChevronDown, Command,
  Bell, Search as SearchIcon, MoreHorizontal, Settings, ScrollText, Sparkles, FileJson,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";

interface NavItem {
  key: ViewKey;
  label: string;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "locations", label: "Locations" },
  { key: "reviews", label: "Reviews" },
  { key: "posts", label: "Google Posts" },
  { key: "analytics", label: "Analytics" },
  { key: "seo", label: "Local SEO" },
  { key: "ai", label: "MiSA AI" },
  { key: "media", label: "Media" },
  { key: "reports", label: "Reports" },
  { key: "google", label: "Google" },
  { key: "notifications", label: "Alerts" },
  { key: "audit", label: "Audit Logs" },
  { key: "system", label: "System" },
  { key: "api-docs", label: "API Docs" },
  { key: "openapi-spec", label: "OpenAPI" },
  { key: "google-api-mapping", label: "API Map" },
  { key: "roadmap", label: "Roadmap" },
  { key: "design-system", label: "Design" },
  { key: "wireframes", label: "Wireframes" },
  { key: "settings", label: "Settings" },
];

// Primary items shown directly in top bar (text only, no icons — matching reference)
const PRIMARY_KEYS: ViewKey[] = ["dashboard", "locations", "reviews", "posts", "analytics", "seo", "ai"];

// Page titles for hero section
const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Business overview, KPIs & alerts" },
  locations: { title: "Locations", subtitle: "All MyFNG Google Business Profiles" },
  reviews: { title: "Reviews", subtitle: "Sync, monitor & reply to reviews" },
  posts: { title: "Google Posts", subtitle: "Create, schedule & publish posts" },
  analytics: { title: "Analytics", subtitle: "Performance metrics & insights" },
  seo: { title: "Local SEO", subtitle: "Keywords & geo-grid ranking" },
  ai: { title: "MiSA AI", subtitle: "AI assistant & suggestions" },
  media: { title: "Media Library", subtitle: "Business photos & assets" },
  reports: { title: "Reports", subtitle: "Daily, weekly, monthly reports" },
  google: { title: "Google Integration", subtitle: "OAuth, sync & API status" },
  notifications: { title: "Notifications", subtitle: "Alerts & activity" },
  audit: { title: "Audit Logs", subtitle: "Immutable action history" },
  system: { title: "System", subtitle: "Database, jobs & integrations" },
  "api-docs": { title: "API Documentation", subtitle: "REST API specification" },
  "openapi-spec": { title: "OpenAPI Specification", subtitle: "OpenAPI 3.1 specification · 60+ endpoints" },
  "google-api-mapping": { title: "Google API Mapping", subtitle: "API → DB field mapping" },
  roadmap: { title: "Project Roadmap", subtitle: "Phases & progress" },
  "design-system": { title: "Design System", subtitle: "Colors, typography & components" },
  wireframes: { title: "Screen Wireframes", subtitle: "Screen specifications" },
  settings: { title: "Settings", subtitle: "Users, roles & configuration" },
};

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const { view, setView, commandOpen, setCommandOpen } = useAppStore();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { data: notifs } = useQuery<NotificationItem[]>({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<NotificationItem[]>("/api/notifications?unread=1"),
    refetchInterval: 60_000,
  });
  const unreadCount = notifs?.length ?? 0;

  const visibleNav = NAV.filter((n) => canAccessView(user.role, n.key));
  const primaryNav = visibleNav.filter((n) => PRIMARY_KEYS.includes(n.key));
  const moreNav = visibleNav.filter((n) => !PRIMARY_KEYS.includes(n.key));
  const pageTitle = PAGE_TITLES[view] ?? { title: "Dashboard", subtitle: "" };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandOpen]);

  async function handleSync() {
    try {
      toast.loading("Triggering Google sync…", { id: "sync" });
      await api("/api/dashboard", { method: "POST", body: JSON.stringify({}) });
      qc.invalidateQueries();
      toast.success("Sync complete.", { id: "sync" });
    } catch (e: any) {
      toast.error(e.message || "Sync failed", { id: "sync" });
    }
  }

  function initials(name: string) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ═══ TOP NAV BAR — solid blue, text-only items (no icons) ═══ */}
      <header className="sticky top-0 z-50 text-white shadow-md" style={{ background: "var(--topbar-bg)" }}>
        <div className="max-w-[1600px] mx-auto h-14 flex items-center gap-4 px-4 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="size-7 rounded-lg bg-white/15 flex items-center justify-center">
              <Building2 className="size-4" />
            </div>
            <span className="font-bold text-[15px] hidden sm:block">MyFNG</span>
          </div>

          {/* Desktop horizontal nav — TEXT ONLY, no icons (matches reference) */}
          <nav className="hidden lg:flex items-center gap-0 flex-1 min-w-0 overflow-x-auto scroll-area">
            {primaryNav.map((n) => {
              const active = view === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  className={cn(
                    "px-3 py-2 text-[14px] transition kt-nav-item shrink-0",
                    active ? "kt-nav-active" : "text-white/70 font-normal",
                  )}
                >
                  {n.label}
                </button>
              );
            })}
            {/* More dropdown */}
            {moreNav.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1 px-3 py-2 text-[14px] transition kt-nav-item shrink-0",
                    moreNav.some((n) => n.key === view) ? "kt-nav-active" : "text-white/70 font-normal",
                  )}>
                    More <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {moreNav.map((n) => (
                    <DropdownMenuItem key={n.key} onClick={() => setView(n.key)} className={cn(view === n.key && "bg-accent")}>
                      {n.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          {/* Spacer for mobile — pushes right items to the end */}
          <div className="flex-1 lg:hidden" />

          {/* Right utilities — order: Search(hidden on mobile) → Sync(hidden on mobile) → Notifications → Theme → Profile → Hamburger(mobile only) */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Search — desktop only */}
            <button
              onClick={() => setCommandOpen(true)}
              className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg bg-white/10 text-sm text-white/80 hover:bg-white/20 transition w-40"
            >
              <SearchIcon className="size-4" />
              <span className="text-xs">Search…</span>
              <kbd className="ml-auto inline-flex items-center gap-0.5 rounded bg-white/20 px-1 text-[10px] font-mono text-white/70">
                ⌘K
              </kbd>
            </button>

            {/* Sync — desktop only */}
            <Button variant="ghost" size="icon" onClick={handleSync} className="text-white/80 hover:bg-white/15 hover:text-white hidden sm:flex" aria-label="Sync">
              <RefreshCw className="size-[18px]" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" onClick={() => setView("notifications")} aria-label="Notifications" className="relative text-white/80 hover:bg-white/15 hover:text-white">
              <Bell className="size-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 size-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            {/* Theme toggle */}
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme" className="text-white/80 hover:bg-white/15 hover:text-white">
              {mounted && theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </Button>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-1.5 gap-1.5 text-white hover:bg-white/15 hover:text-white">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-white/20 text-white text-xs">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="size-3.5 text-white/60 hidden sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground font-normal">{user.email}</div>
                  <div className="text-[10px] text-primary font-medium mt-0.5">{roleLabel(user.role)}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView("settings")}>
                  <Settings className="size-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("audit")}>
                  <ScrollText className="size-4 mr-2" /> My activity
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-rose-600 focus:text-rose-600">
                  <LogOut className="size-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger menu — mobile only, LAST item on right */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/15 shrink-0" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0" style={{ background: "var(--topbar-bg)" }}>
                <div className="p-4 max-h-[85vh] overflow-y-auto scroll-area">
                  <div className="grid grid-cols-1 gap-1">
                    {visibleNav.map((n) => {
                      const active = view === n.key;
                      return (
                        <button
                          key={n.key}
                          onClick={() => setView(n.key)}
                          className={cn(
                            "px-3 py-2.5 text-[14px] transition kt-nav-item text-left rounded-lg",
                            active ? "kt-nav-active" : "text-white/70 font-normal",
                          )}
                        >
                          {n.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ═══ HERO SECTION — blue gradient with page title + search + actions ═══ */}
      <div className="text-white" style={{ background: "var(--hero-gradient)" }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight">{pageTitle.title}</h1>
            {pageTitle.subtitle && <p className="text-sm text-white/70 mt-0.5">{pageTitle.subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleSync} className="bg-white/10 text-white border-white/20 hover:bg-white/20">
              <RefreshCw className="size-4 mr-1.5" /> Sync
            </Button>
            {canAccessView(user.role, "ai") && (
              <Button size="sm" onClick={() => setView("ai")} className="bg-green-600 hover:bg-green-700 text-white">
                <Sparkles className="size-4 mr-1.5" /> MiSA AI
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MAIN CONTENT — full width, light gray bg ═══ */}
      <main className="flex-1 min-w-0 kt-fade-in">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
          {children}
        </div>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="mt-auto border-t border-border/60 bg-card">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">MyFNG Local AI Manager</span>
            <span className="text-muted-foreground/60">v1.0</span>
            <span className="hidden sm:inline text-muted-foreground/40">·</span>
            <span className="hidden sm:inline">Internal Enterprise Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3 text-amber-500" /> MiSA AI Ready
            </span>
          </div>
        </div>
      </footer>

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search modules, locations, reviews…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Modules">
            {visibleNav.map((n) => (
              <CommandItem key={n.key} onSelect={() => { setView(n.key); setCommandOpen(false); }}>
                {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { handleSync(); setCommandOpen(false); }}>
              <RefreshCw className="size-4 mr-2" /> Trigger Google sync
            </CommandItem>
            <CommandItem onSelect={() => signOut({ callbackUrl: "/" })}>
              <LogOut className="size-4 mr-2" /> Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
