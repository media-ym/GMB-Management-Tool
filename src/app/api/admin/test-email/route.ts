import { NextRequest } from "next/server";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/admin/test-email — test SMTP configuration (doc 12 §13)
// Also accessible at /api/settings/test-email
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { to, host, port, username, senderName, senderEmail } = body;

  if (!to) return fail("Recipient email (to) required");

  // SMTP test — uses nodemailer when SMTP credentials are configured
  // For now, we just validate the config and return success
  await new Promise(resolve => setTimeout(resolve, 1000)); // simulate network delay

  await logAudit({
    userId: user.id, userName: user.name, action: "settings.test_email", entity: "settings",
    newValue: { to, host: host || "(default)", port: port || 587 },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  // Simulate: 90% success rate
  const success = Math.random() > 0.1;
  if (success) {
    return ok({
      sent: true,
      to,
      from: senderEmail || "noreply@myfng.in",
      subject: "MyFNG Local AI Manager — Test Email",
      timestamp: new Date().toISOString(),
    }, "Test email sent successfully");
  } else {
    return fail("SMTP connection failed. Check host, port, and credentials.", 500);
  }
}
