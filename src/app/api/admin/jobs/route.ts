import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/admin/jobs — background jobs list (doc 12 §19)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view") && !can(user.role, "settings.view")) return forbidden();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const queue = url.searchParams.get("queue") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

  const where: any = {};
  if (status) where.status = status;
  if (queue) where.queueName = queue;

  const jobs = await db.backgroundJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const stats = {
    queued: await db.backgroundJob.count({ where: { status: "queued" } }),
    processing: await db.backgroundJob.count({ where: { status: "processing" } }),
    completed: await db.backgroundJob.count({ where: { status: "completed" } }),
    failed: await db.backgroundJob.count({ where: { status: "failed" } }),
    retrying: await db.backgroundJob.count({ where: { status: "retrying" } }),
  };

  return ok({
    stats,
    jobs: jobs.map(j => ({
      id: j.id,
      queueName: j.queueName,
      jobName: j.jobName,
      status: j.status,
      attempts: j.attempts,
      payload: j.payloadJson ? JSON.parse(j.payloadJson) : null,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
