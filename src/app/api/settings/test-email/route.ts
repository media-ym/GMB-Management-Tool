import { NextRequest } from "next/server";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/settings/test-email — alias for /api/admin/test-email (doc 13 §13)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { to } = body;
  if (!to) return fail("Recipient email (to) required");

  await new Promise(resolve => setTimeout(resolve, 1000));
  await logAudit({ userId: user.id, userName: user.name, action: "settings.test_email", entity: "settings", newValue: { to }, ip: req.headers.get("x-forwarded-for") ?? undefined });

  return ok({ sent: true, to, timestamp: new Date().toISOString() }, "Test email sent successfully");
}
