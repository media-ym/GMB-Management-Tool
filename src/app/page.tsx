import { redirect } from "next/navigation";
import { getWorkspaceUser } from "@/lib/workspace-user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getWorkspaceUser();
  if (user) redirect("/dashboard");

  const { LoginScreen } = await import("@/components/login-screen");
  return <LoginScreen />;
}
