import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

export async function requirePortalUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "client_portal" || !user.clientId) {
    if (user && user.role !== "client_portal") redirect("/dashboard");
    redirect("/");
  }
  return user;
}

export function isPortalUser(user: SessionUser | null | undefined): boolean {
  return !!user && user.role === "client_portal" && !!user.clientId;
}
