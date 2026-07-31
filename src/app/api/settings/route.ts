import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { invalidateSettingCache } from "@/lib/app-settings";

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
  // Never expose full SMTP password to the client — mask it
  if (obj.smtp && typeof obj.smtp === "object" && obj.smtp.password) {
    obj.smtp = { ...obj.smtp, password: "••••••••", passwordSet: true };
  }
  return ok(obj);
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage") && !can(user.role, "settings.view")) return forbidden();
  // Prefer settings.manage; allow view for backward compat during rollout
  if (!can(user.role, "settings.manage") && user.role !== "super_admin") return forbidden();

  const body = await req.json().catch(() => ({}));
  const { key, value } = body;
  if (!key) return fail("key required");

  let toStore = value;
  // Preserve SMTP password when client sends masked placeholder
  if (key === "smtp" && value && typeof value === "object") {
    const existing = await db.setting.findUnique({ where: { key: "smtp" } });
    let prev: any = {};
    try { prev = existing?.value ? JSON.parse(existing.value) : {}; } catch { /* */ }
    const pw = String(value.password || "");
    if (!pw || pw.includes("•")) {
      toStore = { ...value, password: prev.password || "" };
    }
  }

  const updated = await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(toStore) },
    update: { value: JSON.stringify(toStore) },
  });

  invalidateSettingCache(key);

  const auditValue = key === "smtp" && toStore && typeof toStore === "object"
    ? { ...toStore, password: toStore.password ? "[set]" : "" }
    : toStore;

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "settings.update",
    entity: "settings",
    entityId: key,
    newValue: auditValue,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });
  return ok({ key: updated.key }, "Setting saved");
}
