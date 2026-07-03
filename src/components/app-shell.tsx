"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useAppStore, roleLabel } from "@/lib/store";
import { canAccessView } from "@/lib/permissions";
import type { NotificationItem, SessionUser, ViewKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Building2, LayoutDashboard, MapPin, Star, FileText, BarChart3,
  Search, Sparkles, Bell, ScrollText, Settings, Menu, LogOut,
  RefreshCw, Search as SearchIcon, Sun, Moon, ChevronDown, Command,
  Image as ImageIcon, FileBarChart, Database, Plug, Code2, ArrowLeftRight, Map, Palette, Monitor,
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
  description: string;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Business overview, KPIs & alerts" },
  { key: "locations", label: "Locations", icon: MapPin, description: "All MyFNG Google Business Profiles" },
  { key: "reviews", label: "Reviews", icon: Star, description: "Sync, reply & sentiment" },
  { key: "posts", label: "Google Posts", icon: FileText, description: "Create, schedule, publish" },
  { key: "analytics", label: "Analytics", icon: BarChart3, description: "Search, maps, calls, directions" },
  { key: "seo", label: "Local SEO", icon: Search, description: "Keywords & geo-grid ranking" },
  { key: "ai", label: "MiSA AI", icon: Sparkles, description: "AI assistant & suggestions" },
  { key: "media", label: "Media Library", icon: ImageIcon, description: "Business photos & assets" },
  { key: "reports", label: "Reports", icon: FileBarChart, description: "Daily, weekly, monthly reports" },
  { key: "google", label: "Google Integration", icon: Plug, description: "OAuth, sync & API status" },
  { key: "notifications", label: "Notifications", icon: Bell, description: "Alerts & activity" },
  { key: "audit", label: "Audit Logs", icon: ScrollText, description: "Immutable action history" },
  { key: "system", label: "System", icon: Database, description: "Database, jobs & integrations" },
  { key: "api-docs", label: "API Docs", icon: Code2, description: "REST API specification" },
  { key: "google-api-mapping", label: "Google API Map", icon: ArrowLeftRight, description: "Google API → DB field mapping" },
  { key: "roadmap", label: "Roadmap", icon: Map, description: "Project phases & progress" },
  { key: "design-system", label: "Design System", icon: Palette, description: "Colors, typography & components" },
  { key: "wireframes", label: "Wireframes", icon: Monitor, description: "Screen specifications & layouts" },
  { key: "settings", label: "Settings", icon: Settings, description: "Users, roles & system config" },
];

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const { view, setView, sidebarOpen, setSidebarOpen, commandOpen, setCommandOpen } = useAppStore();
  const { data: session } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // Mount detection without setState-in-effect (React 19 rule).
  // Returns false on server / first render, true on client after hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Notifications badge count
  const { data: notifs } = useQuery<NotificationItem[]>({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<NotificationItem[]>("/api/notifications?unread=1"),
    refetchInterval: 60_000,
  });
  const unreadCount = notifs?.length ?? 0;

  const visibleNav = NAV.filter((n) => canAccessView(user.role, n.key));

  // Keyboard shortcut for command palette
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
      {/* Top bar */}
      <header className="sticky top-0 z-40 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="h-full flex items-center gap-2 px-3 sm:px-4">
          {/* Mobile menu */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground">
              <SidebarContent
                user={user}
                view={view}
                nav={visibleNav}
                onSelect={(v) => { setView(v); setSidebarOpen(false); }}
                onSync={handleSync}
                onSignOut={() => signOut({ callbackUrl: "/" })}
              />
            </SheetContent>
          </Sheet>

          {/* Brand (mobile) */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Building2 className="size-4" />
            </div>
            <span className="font-semibold">MyFNG</span>
          </div>

          {/* Search trigger */}
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden md:flex items-center gap-2 ml-2 h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground hover:bg-muted transition w-72"
          >
            <SearchIcon className="size-4" />
            <span>Search or jump to…</span>
            <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border bg-background px-1 text-[10px] font-mono">
              <Command className="size-2.5" />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleSync} className="hidden sm:flex">
              <RefreshCw className="size-4 mr-1.5" /> Sync
            </Button>

            <Button variant="ghost" size="icon" onClick={() => setView("notifications")} aria-label="Notifications" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 size-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {mounted && theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-1.5 sm:px-2 gap-1.5">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left leading-tight">
                    <div className="text-xs font-medium">{user.name}</div>
                    <div className="text-[10px] text-muted-foreground">{roleLabel(user.role)}</div>
                  </div>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
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

      <div className="flex-1 flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
          <SidebarContent
            user={user}
            view={view}
            nav={visibleNav}
            onSelect={setView}
            onSync={handleSync}
            onSignOut={() => signOut({ callbackUrl: "/" })}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">MyFNG Local AI Manager</span>
            <span>v1.0</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Internal Enterprise Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3 text-amber-500" /> MiSA AI
            </span>
            <span>·</span>
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
                <span className="ml-auto text-xs text-muted-foreground">{n.description}</span>
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

function SidebarContent({
  user, view, nav, onSelect, onSync, onSignOut,
}: {
  user: SessionUser;
  view: ViewKey;
  nav: NavItem[];
  onSelect: (v: ViewKey) => void;
  onSync: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
        <div className="size-9 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-sm">
          <Building2 className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold leading-tight">MyFNG</div>
          <div className="text-[11px] text-sidebar-foreground/60 leading-tight">Local AI Manager</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-area p-3 space-y-1">
        {nav.map((n) => {
          const active = view === n.key;
          return (
            <button
              key={n.key}
              onClick={() => onSelect(n.key)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition group",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <n.icon className={cn("size-4 shrink-0", active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground")} />
              <span className="font-medium">{n.label}</span>
            </button>
          );
        })}
      </nav>

      {/* AI promo card */}
      <div className="p-3">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <Sparkles className="size-4 text-amber-400" />
            <span className="text-sm font-semibold">MiSA AI</span>
          </div>
          <p className="mt-1 text-[11px] text-sidebar-foreground/60 leading-relaxed">
            Draft replies, generate posts, surface locations needing attention.
          </p>
          <button
            onClick={() => onSelect("ai")}
            className="mt-2 w-full rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-medium py-1.5 hover:opacity-90 transition"
          >
            Open MiSA AI
          </button>
        </div>
      </div>

      {/* User mini */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</div>
            <div className="text-[10px] text-sidebar-foreground/60 truncate">{roleLabel(user.role)}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onSignOut} className="size-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
