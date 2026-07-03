import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/admin/backup — trigger manual backup (doc 12 §21)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden(); // Super Admin only

  // Mock backup — in production this would trigger a database dump
  const backupId = `backup_${Date.now()}`;
  const timestamp = new Date().toISOString();

  await logAudit({
    userId: user.id, userName: user.name, action: "backup.trigger", entity: "system",
    newValue: { backupId, timestamp }, ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({
    backupId,
    timestamp,
    status: "completed",
    size: "12.4 MB",
    tables: 49,
    retention: "30 days",
  }, "Backup completed successfully");
}

// GET /api/admin/backup — backup status (doc 12 §21)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  // Mock backup history
  const lastBackup = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago

  return ok({
    lastBackup: lastBackup.toISOString(),
    status: "healthy",
    retention: "30 days",
    schedule: "Daily at 2:00 AM IST",
    history: [
      { id: "backup_001", timestamp: lastBackup.toISOString(), size: "12.4 MB", status: "success", type: "automatic" },
      { id: "backup_002", timestamp: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), size: "12.1 MB", status: "success", type: "automatic" },
      { id: "backup_003", timestamp: new Date(Date.now() - 54 * 60 * 60 * 1000).toISOString(), size: "11.8 MB", status: "success", type: "automatic" },
    ],
    storage: {
      total: "1 GB",
      used: "124 MB",
      available: "900 MB",
      backups: 10,
    },
  });
}
