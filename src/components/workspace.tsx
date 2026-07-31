"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { UserContext } from "@/lib/user-context";
import type { SessionUser } from "@/lib/types";

export function Workspace({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  // Sync the user into the Zustand store too (some components read it from
  // there for non-critical UI like the sidebar), but the authoritative source
  // for views is UserContext below — always populated synchronously.
  useAppStore.setState({ user });

  // Drop persisted location filters that are outside this user's scope (e.g. after portal login)
  useEffect(() => {
    if (user.role !== "client_portal" && user.role !== "branch_manager") return;
    const allowed = new Set(user.assignedLocationIds ?? []);
    const selected = useAppStore.getState().selectedLocationIds;
    const next = selected.filter((id) => allowed.has(id));
    if (next.length !== selected.length) {
      useAppStore.getState().setSelectedLocationIds(next);
    }
  }, [user.id, user.role, user.assignedLocationIds]);

  return (
    <UserContext.Provider value={user}>
      <AppShell user={user}>{children}</AppShell>
    </UserContext.Provider>
  );
}
