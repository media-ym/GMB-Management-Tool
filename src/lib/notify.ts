import { db } from "@/lib/db";
import { getNotificationsConfig, getSmtpConfig } from "@/lib/app-settings";
import { isSmtpConfigured, sendMail } from "@/lib/mail";

export type NotifyEventId =
  | "new-review"
  | "1-star-review"
  | "sync-failure"
  | "token-expiry"
  | "ai-job-failure"
  | "report-ready"
  | "ranking-drop"
  | "profile-error"
  | string;

/**
 * Create in-app notification (+ optional email) based on Settings → Notifications.
 */
export async function dispatchAppNotification(opts: {
  eventId: NotifyEventId;
  title: string;
  message: string;
  type?: string;
  severity?: "info" | "warning" | "critical" | "success";
  link?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const cfg = await getNotificationsConfig();
  const event = cfg.events?.[opts.eventId] ?? { email: false, dashboard: true };
  const channelOn = cfg.emailChannel !== false && (cfg as { emailEnabled?: boolean }).emailEnabled !== false;
  const emailEnabled = channelOn && event.email;
  const dashboardEnabled = event.dashboard !== false;

  let notificationId: string | null = null;

  if (dashboardEnabled) {
    const row = await db.notification.create({
      data: {
        userId: opts.userId ?? null,
        type: opts.type || opts.eventId,
        title: opts.title,
        message: opts.message,
        severity: opts.severity || "info",
        link: opts.link ?? null,
        metadataJson: opts.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
    notificationId = row.id;
  }

  let emailSent = false;
  let emailError: string | null = null;

  if (emailEnabled) {
    const smtp = await getSmtpConfig();
    if (!isSmtpConfigured(smtp)) {
      emailError = "SMTP not configured";
    } else {
      const admins = await db.user.findMany({
        where: {
          status: "active",
          OR: [{ role: "super_admin" }, { role: "marketing_manager" }],
        },
        select: { email: true },
        take: 20,
      });
      const recipients = admins.map((a) => a.email).filter(Boolean);
      if (recipients.length === 0) {
        emailError = "No admin recipients";
      } else {
        try {
          await sendMail({
            to: recipients.join(", "),
            subject: `[MyFNG] ${opts.title}`,
            text: opts.message,
          });
          emailSent = true;
        } catch (e: any) {
          emailError = e?.message || "Email send failed";
        }
      }
    }
  }

  return { notificationId, emailSent, emailError, dashboardEnabled, emailEnabled };
}
