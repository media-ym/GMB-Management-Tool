import { getSessionUser } from "@/lib/session";
import { ok, unauthorized } from "@/lib/api-response";
import { getBrandConfig } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

/** GET /api/brand — public (authenticated) brand name/logo for shell */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const brand = await getBrandConfig();
  return ok({
    name: brand.name || "MyFNG",
    tagline: brand.tagline || "Your Friendly Neighbourhood Garage",
    logoUrl: brand.logoUrl || "",
    supportEmail: brand.supportEmail || "",
    supportPhone: brand.supportPhone || "",
  });
}
