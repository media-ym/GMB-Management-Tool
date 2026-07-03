import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/admin/jobs/[id]/retry — retry a failed job (doc 12 §19)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view") && !can(user.role, "settings.view")) return forbidden();

  const { id } = await params;
  const job = await db.backgroundJob.findUnique({ where: { id } });
  if (!job) return notFound("Job not found");

  const updated = await db.backgroundJob.update({
    where: { id },
    data: {
      status: "queued",
      attempts: job.attempts + 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    },
  });

  await logAudit({ userId: user.id, userName: user.name, action: "job.retry", entity: "background_job", entityId: id, newValue: { jobName: job.jobName, attempts: updated.attempts }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id, status: "queued" }, "Job queued for retry");
}
