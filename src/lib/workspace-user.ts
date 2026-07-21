import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/types";

export async function getWorkspaceUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const dbUser = await db.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatar: true,
      assignedLocationIds: true,
      status: true,
    },
  });

  if (!dbUser || dbUser.status !== "active") return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as Role,
    avatar: dbUser.avatar,
    assignedLocationIds: dbUser.assignedLocationIds
      ? dbUser.assignedLocationIds.split(",").filter(Boolean)
      : [],
  };
}
