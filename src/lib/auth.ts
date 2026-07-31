import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import { verifyPassword, isLocked, MAX_FAILED_ATTEMPTS, LOCK_DURATION_MS } from "./password";
import { getSecurityConfig } from "./app-settings";

// Session config — jwtExpiry hours come from Settings → Security when available
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // default 8h; runtime authorize uses Setting
  pages: { signIn: "/" }, // single-route SPA — login rendered inside the shell
  providers: [
    CredentialsProvider({
      name: "MyFNG SSO",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        const security = await getSecurityConfig();
        const maxFailed = security.maxFailedAttempts || MAX_FAILED_ATTEMPTS;
        const lockMs = (security.lockDuration || 15) * 60 * 1000 || LOCK_DURATION_MS;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          await logAuthEvent(null, email, "login.failed", "User not found", req);
          return null;
        }

        // Check status — only active users can log in (doc 06 §20)
        if (user.status === "suspended" || user.status === "inactive") {
          await logAuthEvent(user.id, email, "login.failed", `Account ${user.status}`, req);
          return null;
        }
        if (user.status === "invited") {
          await logAuthEvent(user.id, email, "login.failed", "Account not activated", req);
          return null;
        }

        // Check lockout (doc 06 §11)
        if (isLocked(user.lockedUntil)) {
          const remaining = Math.ceil((new Date(user.lockedUntil!).getTime() - Date.now()) / 60000);
          await logAuthEvent(user.id, email, "login.failed", `Account locked (${remaining}min remaining)`, req);
          return null;
        }

        if (!user.password) {
          await logAuthEvent(user.id, email, "login.failed", "Password not set", req);
          return null;
        }

        const valid = await verifyPassword(credentials.password, user.password);
        if (!valid) {
          // Increment failed attempts
          const newFailed = user.failedLoginAttempts + 1;
          const shouldLock = newFailed >= maxFailed;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newFailed,
              status: shouldLock ? "locked" : user.status,
              lockedUntil: shouldLock ? new Date(Date.now() + lockMs) : user.lockedUntil,
            },
          });
          await logAuthEvent(user.id, email, "login.failed", `Invalid password (attempt ${newFailed}/${maxFailed})`, req);
          return null;
        }

        // Successful login — reset failed attempts, update last login
        const ip = req?.headers?.["x-forwarded-for"] as string || req?.headers?.["x-real-ip"] as string || "unknown";
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            status: "active",
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        });
        await logAuthEvent(user.id, email, "login.success", "Credentials validated", req);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar ?? undefined,
          assignedLocationIds: user.assignedLocationIds
            ? user.assignedLocationIds.split(",").filter(Boolean)
            : [],
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.name = (user as any).name;
        token.email = (user as any).email;
        token.avatar = (user as any).avatar;
        token.assignedLocationIds = (user as any).assignedLocationIds ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).name = token.name;
        (session.user as any).email = token.email;
        (session.user as any).avatar = token.avatar;
        (session.user as any).assignedLocationIds = token.assignedLocationIds ?? [];
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "myfng-local-ai-manager-dev-secret-change-in-prod",
};

// Helper to log auth events to both audit_logs and activity_logs (doc 06 §17, §18)
async function logAuthEvent(userId: string | null, email: string, action: string, message: string, req?: any) {
  const ip = req?.headers?.["x-forwarded-for"] as string || req?.headers?.["x-real-ip"] as string || "unknown";
  const userAgent = req?.headers?.["user-agent"] as string || "unknown";
  try {
    await db.auditLog.create({
      data: {
        userId,
        userName: email,
        action,
        entity: "auth",
        entityId: userId,
        ip,
        status: action.endsWith("failed") ? "failed" : "success",
        newValue: JSON.stringify({ message }),
      },
    });
    await db.activityLog.create({
      data: {
        userId,
        module: "auth",
        action,
        entityType: "user",
        entityId: userId,
        ipAddress: ip,
        userAgent,
      },
    });
  } catch (e) {
    console.error("auth log failed", e);
  }
}
