"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, ViewKey, SessionUser } from "@/lib/types";

interface AppState {
  // session (mirrors NextAuth for client use)
  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;

  // active view (single-route SPA navigation)
  view: ViewKey;
  setView: (v: ViewKey) => void;

  // active location filter (used by reviews/posts/analytics/seo)
  activeLocationId: string | "all";
  setActiveLocationId: (id: string | "all") => void;

  // mobile sidebar open
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // command palette
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  // theme (light/dark) — managed by next-themes but mirrored for UI bits
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      view: "dashboard",
      setView: (v) => set({ view: v }),
      activeLocationId: "all",
      setActiveLocationId: (id) => set({ activeLocationId: id }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),
      theme: "light",
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: "myfng-app-store",
      partialize: (s) => ({ view: s.view, activeLocationId: s.activeLocationId, theme: s.theme }),
    },
  ),
);

export function roleLabel(role: Role): string {
  return (
    {
      super_admin: "Super Admin",
      marketing_manager: "Marketing Manager",
      branch_manager: "Branch Manager",
      customer_support: "Customer Support",
      viewer: "Viewer",
    } as Record<Role, string>
  )[role];
}
