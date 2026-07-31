import { NextRequest } from "next/server";
import { readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MEDIA_DIR = join(process.cwd(), "public", "uploads", "media");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/admin/storage/cleanup
 * body: { action: "temp" | "archive-reports" }
 * - temp: delete orphan local media files older than 7 days (not referenced in MediaLibrary)
 * - archive-reports: mark old report StorageFile rows (move bucket → archives conceptually via tag)
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage") && !can(user.role, "system.view")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "temp");

  try {
    if (action === "temp") {
      let deleted = 0;
      let scanned = 0;
      const media = await db.mediaLibrary.findMany({ select: { fileUrl: true, fileName: true } });
      const referenced = new Set<string>();
      for (const m of media) {
        const parts = (m.fileUrl || "").split("/");
        const last = parts[parts.length - 1];
        if (last) referenced.add(last);
        if (m.fileName) referenced.add(m.fileName);
      }

      let names: string[] = [];
      try {
        names = await readdir(MEDIA_DIR);
      } catch {
        names = [];
      }

      const now = Date.now();
      for (const name of names) {
        scanned++;
        if (referenced.has(name)) continue;
        const abs = join(MEDIA_DIR, name);
        try {
          const st = await stat(abs);
          if (now - st.mtimeMs > MAX_AGE_MS) {
            await unlink(abs);
            deleted++;
          }
        } catch {
          /* skip */
        }
      }

      await logAudit({
        userId: user.id,
        userName: user.name,
        action: "storage.cleanup_temp",
        entity: "storage",
        newValue: { scanned, deleted },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      });

      return ok({ scanned, deleted }, deleted ? `Deleted ${deleted} orphan file(s)` : "No orphan temporary files to delete");
    }

    if (action === "archive-reports") {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const old = await db.storageFile.findMany({
        where: { bucket: "reports", createdAt: { lt: cutoff } },
        select: { id: true },
      });
      let moved = 0;
      for (const f of old) {
        await db.storageFile.update({
          where: { id: f.id },
          data: { bucket: "archives" },
        });
        moved++;
      }

      await logAudit({
        userId: user.id,
        userName: user.name,
        action: "storage.archive_reports",
        entity: "storage",
        newValue: { moved },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      });

      return ok({ moved }, moved ? `Archived ${moved} report file(s)` : "No old reports to archive");
    }

    return fail("Unknown action");
  } catch (e: any) {
    return fail(e?.message || "Cleanup failed", 500);
  }
}
