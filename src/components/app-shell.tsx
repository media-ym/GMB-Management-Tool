"use client";

import { useSyncExternalStore, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useAppStore, roleLabel } from "@/lib/store";
import { canAccessView } from "@/lib/permissions";
import type { NotificationItem, SessionUser, ViewKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Building2, LayoutDashboard, MapPin, Star, FileText, BarChart3,
  Search, Sparkles, Bell, ScrollText, Settings, Menu, LogOut,
  RefreshCw, Search as SearchIcon, Sun, Moon, ChevronDown, Command,
  Image as ImageIcon, FileBarChart, Database, Plug, Code2, ArrowLeftRight, Map, Palette, Monitor,
  MoreHorizontal,
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
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "reviews", label: "Reviews", icon: Star },
  { key: "posts", label: "Google Posts", icon: FileText },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "seo", label: "Local SEO", icon: Search },
  { key: "ai", label: "MiSA AI", icon: Sparkles },
  { key: "media", label: "Media Library", icon: ImageIcon },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "google", label: "Google Integration", icon: Plug },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "audit", label: "Audit Logs", icon: ScrollText },
  { key: "system", label: "System", icon: Database },
  { key: "api-docs", label: "API Docs", icon: Code2 },
  { key: "google-api-mapping", label: "Google API Map", icon: ArrowLeftRight },
  { key: "roadmap", label: "Roadmap", icon: Map },
  { key: "design-system", label: "Design System", icon: Palette },
  { key: "wireframes", label: "Wireframes", icon: Monitor },
  { key: "settings", label: "Settings", icon: Settings },
];

// Primary nav items shown directly in top bar; rest go in "More" dropdown
const PRIMARY_NAV_KEYS: ViewKey[] = ["dashboard", "locations", "reviews", "posts", "analytics", "seo", "ai"];

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const { view, setView, commandOpen, setCommandOpen } = useAppStore();
  const { data: session } = useSession();
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
  const primaryNav = visibleNav.filter((n) => PRIMARY_NAV_KEYS.includes(n.key));
  const moreNav = visibleNav.filter((n) => !PRIMARY_NAV_KEYS.includes(n.key));

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
      toast.success("Sync complete. All locations refreshed.", { id: "sync" });
    } catch (e: any) {
      toast.error(e.message || "Sync failed", { id: "sync" });
    }
  }

  function initials(name: string) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ═══ Top Navigation Bar — blue-to-purple gradient, no sidebar ═══ */}
      <header className="sticky top-0 z-40 text-white shadow-lg" style={{ background: "var(--gradient-topnav)" }}>
        <div className="max-w-[1600px] mx-auto h-14 flex items-center gap-3 px-4 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="size-8 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
              <Building2 className="size-4.5" />
            </div>
            <span className="font-bold text-base hidden sm:block">MyFNG</span>
          </div>

          {/* Desktop horizontal nav */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scroll-area">
            {primaryNav.map((n) => {
              const active = view === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm transition kt-nav-item shrink-0",
                    active ? "kt-nav-active" : "text-white/80 font-medium",
                  )}
                >
                  <n.icon className="size-4" />
                  <span>{n.label}</span>
                </button>
              );
            })}
            {/* More dropdown */}
            {moreNav.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1 px-3 py-1.5 text-sm transition kt-nav-item shrink-0",
                    moreNav.some((n) => n.key === view) ? "kt-nav-active" : "text-white/80 font-medium",
                  )}>
                    <MoreHorizontal className="size-4" />
                    <span>More</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {moreNav.map((n) => (
                    <DropdownMenuItem key={n.key} onClick={() => setView(n.key)} className={cn(view === n.key && "bg-accent")}>
                      <n.icon className="size-4 mr-2" />
                      {n.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          {/* Mobile menu trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/15 shrink-0">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="top" className="h-auto p-0" style={{ background: "var(--gradient-topnav)" }}>
              <div className="p-4 max-h-[70vh] overflow-y-auto scroll-area">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {visibleNav.map((n) => {
                    const active = view === n.key;
                    return (
                      <button
                        key={n.key}
                        onClick={() => setView(n.key)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 text-sm transition kt-nav-item",
                          active ? "kt-nav-active" : "text-white/80 font-medium",
                        )}
                      >
                        <n.icon className="size-4 shrink-0" />
                        <span className="truncate">{n.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Search trigger */}
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden md:flex items-center gap-2 h-9 px-3.5 rounded-lg bg-white/15 text-sm text-white/90 hover:bg-white/25 transition w-56 backdrop-blur shrink-0"
          >
            <SearchIcon className="size-4" />
            <span>Search…</span>
            <kbd className="ml-auto inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 text-[10px] font-mono text-white/80">
              <Command className="size-2.5" />K
            </kbd>
          </button>

          {/* Right utilities */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" onClick={handleSync} className="text-white/90 hover:bg-white/15 hover:text-white hidden sm:flex" aria-label="Sync">
              <RefreshCw className="size-[18px]" />
            </Button>

            <Button variant="ghost" size="icon" onClick={() => setView("notifications")} aria-label="Notifications" className="relative text-white/90 hover:bg-white/15 hover:text-white">
              <Bell className="size-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 size-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme" className="text-white/90 hover:bg-white/15 hover:text-white">
              {mounted && theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-1.5 gap-1.5 text-white hover:bg-white/15 hover:text-white">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-white/20 text-white text-xs">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left leading-tight">
                    <div className="text-xs font-medium text-white">{user.name}</div>
                    <div className="text-[10px] text-white/60">{roleLabel(user.role)}</div>
                  </div>
                  <ChevronDown className="size-3.5 text-white/60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground font-normal">{user.email}</div>
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
          </div>
        </div>
      </header>

      {/* ═══ Main content — full width, no sidebar ═══ */}
      <main className="flex-1 min-w-0 kt-fade-in">
        <div className="max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>

      {/* ═══ Footer ═══ */}
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
            <span className="text-muted-foreground/40">·</span>
            <span>Authorized MyFNG personnel only</span>
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
                <n.icon className="size-4 mr-2" />
                <span>{n.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { handleSync(); setCommandOpen(false); }}>
              <RefreshCw className="size-4 mr-2" /> Trigger Google sync
            </CommandItem>
            <CommandItem onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); setCommandOpen(false); }}>
              {mounted && theme === "dark" ? <Sun className="size-4 mr-2" /> : <Moon className="size-4 mr-2" />}
              Toggle {mounted && theme === "dark" ? "light" : "dark"} theme
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
