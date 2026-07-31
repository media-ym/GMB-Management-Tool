"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, ViewKey, SessionUser } from "@/lib/types";

interface AppState {
  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;

  view: ViewKey;
  setView: (v: ViewKey) => void;

  /** Empty = all locations; non-empty = filter to those ids */
  selectedLocationIds: string[];
  setSelectedLocationIds: (ids: string[]) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

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
      selectedLocationIds: [],
      setSelectedLocationIds: (ids) => set({ selectedLocationIds: ids }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),
      theme: "light",
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: "myfng-app-store",
      version: 3,
      partialize: (s) => ({
        selectedLocationIds: s.selectedLocationIds,
        theme: s.theme,
      }),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        if (state && !Array.isArray(state.selectedLocationIds)) {
          const legacy = state.activeLocationId as string | "all" | undefined;
          state.selectedLocationIds =
            legacy && legacy !== "all" ? [legacy] : [];
          delete state.activeLocationId;
        }
        return state as unknown as AppState;
      },
    },
  ),
);

export function roleLabel(role: Role): string {
  const builtin: Record<string, string> = {
    super_admin: "Super Admin",
    marketing_manager: "Marketing Manager",
    branch_manager: "Branch Manager",
    customer_support: "Customer Support",
    viewer: "Viewer",
  };
  return (
    builtin[role] ||
    role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
