import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const settings = await db.setting.findMany();
  const obj: Record<string, any> = {};
  for (const s of settings) {
    try { obj[s.key] = JSON.parse(s.value); } catch { obj[s.key] = s.value; }
  }
  return ok(obj);
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { key, value } = body;
  if (!key) return fail("key required");

  const updated = await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });

  await logAudit({ userId: user.id, userName: user.name, action: "settings.update", entity: "settings", entityId: key, newValue: value, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ key: updated.key }, "Setting saved");
}
