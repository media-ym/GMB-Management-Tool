import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    // Render login (client component) — no session yet
    const { LoginScreen } = await import("@/components/login-screen");
    return <LoginScreen />;
  }

  // Fetch full user record for assignedLocationIds + role + status
  const dbUser = await db.user.findUnique({
    where: { id: (session.user as any).id },
    select: { id: true, email: true, name: true, role: true, avatar: true, assignedLocationIds: true, status: true },
  });

  if (!dbUser || dbUser.status !== "active") {
    const { LoginScreen } = await import("@/components/login-screen");
    return <LoginScreen />;
  }

  const user = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as any,
    avatar: dbUser.avatar,
    assignedLocationIds: dbUser.assignedLocationIds ? dbUser.assignedLocationIds.split(",").filter(Boolean) : [],
  };

  return <Workspace user={user} />;
}
