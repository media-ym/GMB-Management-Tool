import { NextRequest } from "next/server";
import { mkdir, readdir, stat, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKUP_DIR = join(process.cwd(), "backups");
const RETENTION_DAYS = 30;
const MAX_ROWS_PER_TABLE = 5000;

const EXPORT_TABLES = [
  "user",
  "location",
  "googleAccount",
  "googleBusinessProfile",
  "setting",
  "review",
  "post",
  "mediaLibrary",
  "notification",
  "errorLog",
  "scheduledJob",
  "backgroundJob",
  "syncLog",
  "auditLog",
] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function ensureDir() {
  await mkdir(BACKUP_DIR, { recursive: true });
}

type BackupFileMeta = {
  id: string;
  filename: string;
  timestamp: string;
  sizeBytes: number;
  size: string;
  status: "success";
  type: "manual";
};

async function listBackupFiles(): Promise<BackupFileMeta[]> {
  await ensureDir();
  const names = await readdir(BACKUP_DIR);
  const files: BackupFileMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const abs = join(BACKUP_DIR, name);
    const st = await stat(abs);
    files.push({
      id: name.replace(/\.json$/, ""),
      filename: name,
      timestamp: st.mtime.toISOString(),
      sizeBytes: st.size,
      size: formatBytes(st.size),
      status: "success",
      type: "manual",
    });
  }
  files.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  return files;
}

async function pruneOld(files: Awaited<ReturnType<typeof listBackupFiles>>) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const f of files) {
    if (+new Date(f.timestamp) < cutoff) {
      await unlink(join(BACKUP_DIR, f.filename)).catch(() => null);
    }
  }
}

/** POST — create a real JSON data export under /backups */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  try {
    await ensureDir();
    const tables: Record<string, unknown[]> = {};
    let tableCount = 0;
    for (const key of EXPORT_TABLES) {
      try {
        const rows = await (db as any)[key].findMany({ take: MAX_ROWS_PER_TABLE });
        tables[key] = rows.map((row: Record<string, unknown>) => {
          const copy: Record<string, unknown> = { ...row };
          // Never dump password hashes / tokens into backup JSON if present
          if ("password" in copy) copy.password = copy.password ? "[redacted]" : null;
          if ("accessToken" in copy) copy.accessToken = "[redacted]";
          if ("refreshToken" in copy) copy.refreshToken = "[redacted]";
          return copy;
        });
        tableCount++;
      } catch {
        tables[key] = [];
      }
    }

    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: { id: user.id, email: user.email },
      tables,
    };
    const json = JSON.stringify(payload, null, 2);
    const backupId = `backup_manual_${Date.now()}`;
    const filename = `${backupId}.json`;
    await writeFile(join(BACKUP_DIR, filename), json, "utf8");

    const history = await listBackupFiles();
    await pruneOld(history);

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "backup.trigger",
      entity: "system",
      entityId: backupId,
      newValue: { backupId, size: formatBytes(Buffer.byteLength(json)), tables: tableCount },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok(
      {
        backupId,
        timestamp: new Date().toISOString(),
        status: "completed",
        size: formatBytes(Buffer.byteLength(json)),
        tables: tableCount,
        retention: `${RETENTION_DAYS} days`,
        path: `backups/${filename}`,
      },
      "Backup completed successfully",
    );
  } catch (e: any) {
    return fail(e?.message || "Backup failed", 500);
  }
}

/** GET — list real backup files on disk */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const history = await listBackupFiles();
  const usedBytes = history.reduce((a, f) => a + f.sizeBytes, 0);

  return ok({
    lastBackup: history[0]?.timestamp ?? null,
    status: history.length ? "healthy" : "empty",
    retention: `${RETENTION_DAYS} days`,
    schedule: "Manual (Trigger Manual Backup)",
    history: history.map((h) => ({
      id: h.id,
      timestamp: h.timestamp,
      size: h.size,
      status: h.status,
      type: h.type,
    })),
    storage: {
      total: "App disk (backups/)",
      used: formatBytes(usedBytes),
      available: "—",
      backups: history.length,
    },
  });
}
