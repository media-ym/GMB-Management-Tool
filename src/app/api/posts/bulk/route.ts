import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/posts/bulk — bulk operations (doc 09 §18)
// Body: { action: "publish"|"schedule"|"archive"|"delete"|"publish-multi", postIds: string[], scheduledAt?: string, locationIds?: string[] }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { action, postIds, scheduledAt, locationIds } = body;
  if (!action) return fail("action required");

  if (action === "publish" && Array.isArray(postIds)) {
    const result = await db.post.updateMany({
      where: { id: { in: postIds }, status: { in: ["draft", "scheduled"] } },
      data: { status: "published", publishedAt: new Date(), scheduledAt: null },
    });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.publish", entity: "post", newValue: { postIds, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ updated: result.count }, `Published ${result.count} posts`);
  }

  if (action === "schedule" && Array.isArray(postIds) && scheduledAt) {
    const result = await db.post.updateMany({
      where: { id: { in: postIds }, status: "draft" },
      data: { status: "scheduled", scheduledAt: new Date(scheduledAt) },
    });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.schedule", entity: "post", newValue: { postIds, scheduledAt, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ updated: result.count }, `Scheduled ${result.count} posts`);
  }

  if (action === "archive" && Array.isArray(postIds)) {
    const result = await db.post.updateMany({
      where: { id: { in: postIds } },
      data: { status: "failed" }, // using "failed" as archive proxy since we don't have "archived" status
    });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.archive", entity: "post", newValue: { postIds, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ updated: result.count }, `Archived ${result.count} posts`);
  }

  if (action === "delete" && Array.isArray(postIds)) {
    const result = await db.post.deleteMany({ where: { id: { in: postIds }, status: "draft" } });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.delete", entity: "post", newValue: { postIds, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ deleted: result.count }, `Deleted ${result.count} draft posts`);
  }

  // Multi-location publish: create the same post for multiple locations (doc 09 §10)
  if (action === "publish-multi" && Array.isArray(locationIds) && body.post) {
    const post = body.post;
    const scoped = scopeLocationIds(user);
    const validLocationIds = scoped ? locationIds.filter((id: string) => scoped.includes(id)) : locationIds;
    const created: string[] = [];
    for (const locId of validLocationIds) {
      const p = await db.post.create({
        data: {
          locationId: locId,
          type: post.type,
          title: post.title,
          content: post.content,
          ctaType: post.ctaType ?? null,
          ctaUrl: post.ctaUrl ?? null,
          imageUrl: post.imageUrl ?? null,
          status: post.status || "draft",
          source: post.source || "manual",
          authorId: user.id,
          scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
          publishedAt: post.status === "published" ? new Date() : null,
        },
      });
      created.push(p.id);
    }
    await logAudit({ userId: user.id, userName: user.name, action: "post.multi_publish", entity: "post", newValue: { locationIds: validLocationIds, count: created.length }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ created: created.length, ids: created }, `Published to ${created.length} locations`);
  }

  return fail("Unknown action. Use: publish, schedule, archive, delete, publish-multi");
}
