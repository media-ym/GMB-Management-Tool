import { NextRequest } from "next/server";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/admin/test-email — send a real SMTP test message */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.manage") && !can(user.role, "settings.view")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return fail("Valid recipient email (to) is required");
  }

  try {
    const result = await sendMail({
      to,
      subject: "MyFNG Local AI Manager — Test Email",
      text: `This is a test email from MyFNG Local AI Manager.\n\nSent by: ${user.name} (${user.email})\nTime: ${new Date().toISOString()}`,
      html: `<p>This is a test email from <strong>MyFNG Local AI Manager</strong>.</p>
             <p>Sent by: ${user.name} (${user.email})<br/>Time: ${new Date().toISOString()}</p>`,
      smtpOverride: {
        host: body.host,
        port: body.port != null ? Number(body.port) : undefined,
        username: body.username,
        password: body.password,
        encryption: body.encryption,
        senderName: body.senderName,
        senderEmail: body.senderEmail,
      },
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "settings.test_email",
      entity: "settings",
      newValue: { to, from: result.from, messageId: result.messageId },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok(
      {
        sent: true,
        to,
        from: result.from,
        messageId: result.messageId,
        subject: "MyFNG Local AI Manager — Test Email",
        timestamp: new Date().toISOString(),
      },
      "Test email sent successfully",
    );
  } catch (e: any) {
    return fail(e?.message || "SMTP connection failed. Check host, port, and credentials.", 500);
  }
}
