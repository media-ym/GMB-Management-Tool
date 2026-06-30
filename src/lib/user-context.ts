"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "./types";

// React context is the idiomatic way to pass the server-resolved user down to
// client views. Unlike the Zustand store (whose `user` field starts null and
// hydrates via setState — which races with useSyncExternalStore on first
// render in React 19), context is always populated synchronously when the
// provider renders, so views never see a null user.
export const UserContext = createContext<SessionUser | null>(null);

export function useUser(): SessionUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useUser must be used inside <UserContext.Provider>");
  return u;
}
