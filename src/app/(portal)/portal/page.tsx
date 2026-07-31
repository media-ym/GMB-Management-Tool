import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy /portal — clients now use the full workspace UI. */
export default function PortalPage() {
  redirect("/dashboard");
}
