import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import { verifyPassword } from "./password";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 }, // 12h
  pages: { signIn: "/" }, // single route — login rendered inside the shell
  providers: [
    CredentialsProvider({
      name: "MyFNG SSO",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        const valid = await verifyPassword(credentials.password, user.password);
        if (!valid) return null;
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
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
