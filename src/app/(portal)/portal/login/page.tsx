import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** No separate portal login — clients use the same site login (/). */
export default function PortalLoginRedirect() {
  redirect("/");
}
