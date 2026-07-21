import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  AUTO_REPLY_SETTING_KEY,
  mergeAutoReplyConfig,
  type AutoReplyConfig,
} from "@/lib/auto-reply";

export const dynamic = "force-dynamic";

function parseConfig(raw: string | null | undefined): AutoReplyConfig {
  if (!raw) return mergeAutoReplyConfig(null);
  try {
    return mergeAutoReplyConfig(JSON.parse(raw) as Partial<AutoReplyConfig>);
  } catch {
    return mergeAutoReplyConfig(null);
  }
}

// GET /api/reviews/auto-reply
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const row = await db.setting.findUnique({ where: { key: AUTO_REPLY_SETTING_KEY } });
  return ok(parseConfig(row?.value));
}

// PUT /api/reviews/auto-reply
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const config = mergeAutoReplyConfig(body as Partial<AutoReplyConfig>);

  if (config.enabled && config.mode === "manual" && !config.template.trim()) {
    return fail("Reply template is required when auto reply is enabled");
  }

  if (config.selectedRatings.length === 0) {
    return fail("Select at least one star rating");
  }

  const payload: AutoReplyConfig = {
    ...config,
    template: config.template.trim(),
    updatedAt: new Date().toISOString(),
  };

  await db.setting.upsert({
    where: { key: AUTO_REPLY_SETTING_KEY },
    create: {
      key: AUTO_REPLY_SETTING_KEY,
      value: JSON.stringify(payload),
      description: "Review auto-reply configuration",
      updatedBy: user.id,
    },
    update: {
      value: JSON.stringify(payload),
      updatedBy: user.id,
    },
  });

  // Keep per-rating templates in sync for the manual reply inbox flow
  if (config.mode === "manual" && config.template.trim()) {
    for (const rating of config.selectedRatings) {
      const title = `Auto Reply ${rating}★`;
      const existing = await db.reviewReplyTemplate.findFirst({
        where: { title, rating },
      });
      if (existing) {
        await db.reviewReplyTemplate.update({
          where: { id: existing.id },
          data: {
            template: config.template.trim(),
            isActive: config.enabled,
            language: "manual",
          },
        });
      } else {
        await db.reviewReplyTemplate.create({
          data: {
            title,
            rating,
            template: config.template.trim(),
            language: "manual",
            isActive: config.enabled,
            createdBy: user.id,
          },
        });
      }
    }
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "review.auto_reply_saved",
    entity: "settings",
    entityId: AUTO_REPLY_SETTING_KEY,
    newValue: { enabled: payload.enabled, mode: payload.mode, ratings: payload.selectedRatings },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(payload, "Auto reply settings saved");
}
