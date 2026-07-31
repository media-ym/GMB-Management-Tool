import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getWorkspaceUser } from "@/lib/workspace-user";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getWorkspaceUser();
  if (!user) redirect("/");
  // client_portal uses the same AppShell / routes as staff (data scoped by clientId)
  return <Workspace user={user}>{children}</Workspace>;
}
