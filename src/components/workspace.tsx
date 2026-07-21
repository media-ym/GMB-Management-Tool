"use client";

import { useAppStore } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { UserContext } from "@/lib/user-context";
import type { SessionUser } from "@/lib/types";

export function Workspace({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  // Sync the user into the Zustand store too (some components read it from
  // there for non-critical UI like the sidebar), but the authoritative source
  // for views is UserContext below — always populated synchronously.
  useAppStore.setState({ user });

  return (
    <UserContext.Provider value={user}>
      <AppShell user={user}>{children}</AppShell>
    </UserContext.Provider>
  );
}
