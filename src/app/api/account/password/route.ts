import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSessionUser, logAudit } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ok, unauthorized, fail } from "@/lib/api-response";
import { validatePassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/supabase/env";
import { clearPortalTempPassword } from "@/lib/portal-link";

export const dynamic = "force-dynamic";

/** POST /api/account/password — change the signed-in user's password */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");

  if (!currentPassword || !newPassword) {
    return fail("Current password and new password are required");
  }
  if (newPassword !== confirmPassword) {
    return fail("New password and confirmation do not match");
  }
  if (currentPassword === newPassword) {
    return fail("New password must be different from the current password");
  }

  const policy = validatePassword(newPassword);
  if (!policy.valid) {
    return fail(`Password policy violation: ${policy.errors.join("; ")}`);
  }

  // Verify current password against Supabase Auth
  const verifier = createSupabaseClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return fail("Current password is incorrect");
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.id) return fail("Auth session not found — please sign in again");

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  });
  if (updateError) {
    return fail(updateError.message || "Failed to update password");
  }

  await clearPortalTempPassword(user.id);

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "user.password_change",
    entity: "user",
    entityId: user.id,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ updated: true }, "Password updated");
}
