import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  AUTO_POST_SETTING_KEY,
  mergeAutoPostConfig,
  type AutoPostConfig,
} from "@/lib/auto-post";
import { runDailyAutoPosts } from "@/lib/post-auto-generate";

export const dynamic = "force-dynamic";

function parseConfig(raw: string | null | undefined): AutoPostConfig {
  if (!raw) return mergeAutoPostConfig(null);
  try {
    return mergeAutoPostConfig(JSON.parse(raw) as Partial<AutoPostConfig>);
  } catch {
    return mergeAutoPostConfig(null);
  }
}

// GET /api/posts/auto-post
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.view")) return forbidden();

  const row = await db.setting.findUnique({ where: { key: AUTO_POST_SETTING_KEY } });
  return ok(parseConfig(row?.value));
}

// PUT /api/posts/auto-post
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const config = mergeAutoPostConfig(body as Partial<AutoPostConfig>);

  const payload: AutoPostConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  await db.setting.upsert({
    where: { key: AUTO_POST_SETTING_KEY },
    create: {
      key: AUTO_POST_SETTING_KEY,
      value: JSON.stringify(payload),
      description: "Daily auto-post to Google Business Profile",
      updatedBy: user.id,
    },
    update: {
      value: JSON.stringify(payload),
      updatedBy: user.id,
    },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "post.auto_post_saved",
    entity: "settings",
    entityId: AUTO_POST_SETTING_KEY,
    newValue: { enabled: payload.enabled, runHourIST: payload.runHourIST },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  let runResult: Awaited<ReturnType<typeof runDailyAutoPosts>> | null = null;
  if (payload.enabled) {
    runResult = await runDailyAutoPosts({ force: true });
  }

  const message =
    runResult && runResult.published > 0
      ? `Auto post settings saved · published ${runResult.published} post(s) now`
      : "Auto post settings saved";

  return ok({ ...payload, runResult }, message);
}
