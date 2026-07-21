"use client";

import { useSyncExternalStore, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useAppStore, roleLabel } from "@/lib/store";
import { canAccessView } from "@/lib/permissions";
import { viewToPath } from "@/lib/routes";
import { useAppNavigation } from "@/hooks/use-app-navigation";
import type { NotificationItem, SessionUser, ViewKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STAT_ACCENT_STYLES, type StatAccent } from "@/components/shared/stat-card";
import { accentForPageTitle } from "@/lib/view-theme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu, LogOut, RefreshCw, Sun, Moon, ChevronDown, Command,
  Bell, Search as SearchIcon, MoreHorizontal, Settings, ScrollText, FileJson, Bot,
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
  { key: "analytics", label: "Analytics" },
  { key: "seo", label: "Local SEO" },
  { key: "ai", label: "MiSA AI" },
  { key: "media", label: "Media" },
  { key: "reports", label: "Reports" },
  { key: "google", label: "Google" },
  { key: "google-billing", label: "API & Billing" },
  { key: "notifications", label: "Alerts" },
  { key: "audit", label: "Audit Logs" },
  { key: "system", label: "System" },
  { key: "api-docs", label: "API Docs" },
  { key: "openapi-spec", label: "OpenAPI" },
  { key: "google-api-mapping", label: "API Map" },
  { key: "settings", label: "Settings" },
  { key: "clients", label: "Clients" },
  { key: "content-updates", label: "Content" },
  { key: "keywords", label: "Keywords" },
  { key: "competitors", label: "Competitors" },
  { key: "market-research", label: "Market Research" },
];

// Primary items shown directly in top bar (text only, no icons — matching reference)
// Directories hidden from nav; MiSA AI takes that primary slot with blue highlight.
const PRIMARY_KEYS: ViewKey[] = ["dashboard", "locations", "reviews", "content-updates", "ai", "keywords", "competitors", "market-research", "analytics"];

const HIDDEN_NAV_KEYS = new Set<ViewKey>(["directories"]);

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const { commandOpen, setCommandOpen } = useAppStore();
  const { navigate } = useAppNavigation();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "true") {
      toast.success("Google Business Profile connected successfully.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const googleError = params.get("google_error");
    if (googleError) {
      if (googleError === "missing_business_scope") {
        toast.error("Allow 'Manage your Business Profile' when connecting Google, then try again.");
      } else if (googleError === "state_mismatch") {
        toast.error(
          "Google connect failed (session mismatch). Open http://localhost:3000/google (not 0.0.0.0), then Connect again.",
        );
      } else {
        toast.error(`Google connect failed: ${decodeURIComponent(googleError)}`);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [mounted]);

  const { data: notifs } = useQuery<NotificationItem[]>({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<NotificationItem[]>("/api/notifications?unread=1"),
    refetchInterval: 60_000,
  });
  const unreadCount = notifs?.length ?? 0;

  const visibleNav = NAV.filter(
    (n) => canAccessView(user.role, n.key) && !HIDDEN_NAV_KEYS.has(n.key),
  );
  const primaryNav = visibleNav
    .filter((n) => PRIMARY_KEYS.includes(n.key))
    .sort((a, b) => PRIMARY_KEYS.indexOf(a.key) - PRIMARY_KEYS.indexOf(b.key));
  const moreNav = visibleNav.filter((n) => !PRIMARY_KEYS.includes(n.key));

  function isNavActive(key: ViewKey): boolean {
    if (key === "content-updates") return pathname.startsWith("/content");
    return pathname === viewToPath(key);
  }

  function isMoreActive(): boolean {
    return moreNav.some((n) => isNavActive(n.key));
  }

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
      {/* ═══ TOP NAV BAR — white bar, blue menu items ═══ */}
      <header className="kt-topbar sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto h-14 flex items-center gap-4 px-4 sm:px-6">
          {/* Logo */}
          <div className="flex items-center shrink-0">
            <Link href="/dashboard" className="flex items-center">
              <Image
                src="/myfng-logo-transparent.png"
                alt="MyFNG - Your Friendly Neighbourhood Garage"
                width={140}
                height={40}
                className="h-8 sm:h-9 w-auto object-contain"
                priority
                unoptimized
              />
            </Link>
          </div>

          {/* Desktop horizontal nav — TEXT ONLY, no icons (matches reference) */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scroll-area">
            {primaryNav.map((n) => {
              const active = isNavActive(n.key);
              const isMisa = n.key === "ai";
              return (
                <Link
                  key={n.key}
                  href={viewToPath(n.key)}
                  className={cn(
                    "px-3 py-2 text-[14px] transition kt-nav-item shrink-0",
                    active ? "kt-nav-active" : "font-normal",
                    isMisa &&
                      "!rounded-md !bg-[#0047AB] !text-white font-medium hover:!bg-[#003d91] hover:!text-white",
                    isMisa && active && "!bg-[#003d91] !text-white shadow-sm after:!hidden",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
            {/* More dropdown */}
            {moreNav.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1 px-3 py-2 text-[14px] transition kt-nav-item shrink-0",
                    isMoreActive() ? "kt-nav-active" : "font-normal",
                  )}>
                    More <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 p-2">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    More modules
                  </p>
                  {moreNav.map((n) => {
                    const accent = accentForPageTitle(n.label) as StatAccent;
                    const dot = STAT_ACCENT_STYLES[accent]?.iconBg ?? "bg-blue-500";
                    return (
                      <DropdownMenuItem
                        key={n.key}
                        asChild
                      >
                        <Link
                          href={viewToPath(n.key)}
                          className={cn(
                            "rounded-md gap-2 flex items-center",
                            isNavActive(n.key) && "bg-accent font-medium",
                          )}
                        >
                          <span className={cn("size-2 rounded-full shrink-0", dot)} />
                          {n.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
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
              className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg bg-muted/60 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition w-40 border border-border/60"
            >
              <SearchIcon className="size-4" />
              <span className="text-xs">Search…</span>
              <kbd className="ml-auto inline-flex items-center gap-0.5 rounded bg-background px-1 text-[10px] font-mono text-muted-foreground border border-border/60">
                ⌘K
              </kbd>
            </button>

            {/* Sync — desktop only */}
            <Button variant="ghost" size="icon" onClick={handleSync} className="text-[#0047AB] hover:bg-[#0047AB]/10 hover:text-[#0047AB] hidden sm:flex dark:text-[#0096FF] dark:hover:bg-[#0096FF]/10" aria-label="Sync">
              <RefreshCw className="size-[18px]" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" onClick={() => navigate("notifications")} aria-label="Notifications" className="relative text-[#0047AB] hover:bg-[#0047AB]/10 hover:text-[#0047AB] dark:text-[#0096FF] dark:hover:bg-[#0096FF]/10">
              <Bell className="size-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 size-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            {/* Theme toggle */}
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme" className="text-[#0047AB] hover:bg-[#0047AB]/10 hover:text-[#0047AB] dark:text-[#0096FF] dark:hover:bg-[#0096FF]/10">
              {mounted && theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </Button>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-1.5 gap-1.5 text-[#0047AB] hover:bg-[#0047AB]/10 hover:text-[#0047AB] dark:text-[#0096FF] dark:hover:bg-[#0096FF]/10">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-[#0047AB]/15 text-[#0047AB] text-xs dark:bg-[#0096FF]/15 dark:text-[#0096FF]">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="size-3.5 text-[#0047AB]/60 dark:text-[#0096FF]/60 hidden sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground font-normal">{user.email}</div>
                  <div className="text-[10px] text-primary font-medium mt-0.5">{roleLabel(user.role)}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("settings")}>
                  <Settings className="size-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("audit")}>
                  <ScrollText className="size-4 mr-2" /> My activity
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-rose-600 focus:text-rose-600">
                  <LogOut className="size-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger menu — mobile only, LAST item on right */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden text-[#0047AB] hover:bg-[#0047AB]/10 shrink-0 dark:text-[#0096FF] dark:hover:bg-[#0096FF]/10" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 kt-topbar">
                <div className="p-4 border-b border-border/60">
                  <Image src="/myfng-logo-transparent.png" alt="MyFNG" width={120} height={36} className="h-8 w-auto object-contain" unoptimized />
                </div>
                <div className="p-4 max-h-[85vh] overflow-y-auto scroll-area">
                  <div className="grid grid-cols-1 gap-1">
                    {visibleNav.map((n) => {
                      const active = isNavActive(n.key);
                      const isMisa = n.key === "ai";
                      return (
                        <Link
                          key={n.key}
                          href={viewToPath(n.key)}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "px-3 py-2.5 text-[14px] transition kt-nav-item text-left rounded-lg block",
                            active ? "kt-nav-active" : "font-normal",
                            isMisa &&
                              "!bg-[#0047AB] !text-white font-medium hover:!bg-[#003d91] hover:!text-white",
                            isMisa && active && "!bg-[#003d91] !text-white after:!hidden",
                          )}
                        >
                          {n.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT — colorful dashboard pages use PageHeader inside ═══ */}
      <main className="flex-1 min-w-0 kt-fade-in bg-gradient-to-b from-slate-50/90 via-background to-background dark:from-background dark:via-background dark:to-background">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
          {children}
        </div>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="mt-auto border-t border-border/60 bg-card">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Image src="/myfng-logo-transparent.png" alt="MyFNG" width={80} height={24} className="h-5 w-auto object-contain hidden sm:block" unoptimized />
            <span className="font-medium text-foreground">Local AI Manager</span>
            <span className="text-muted-foreground/60">v1.0</span>
            <span className="hidden sm:inline text-muted-foreground/40">·</span>
            <span className="hidden sm:inline">Internal Enterprise Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Bot className="size-3 text-[var(--brand-cyan)]" /> MiSA AI Ready
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
              <CommandItem key={n.key} onSelect={() => { navigate(n.key); setCommandOpen(false); }}>
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
