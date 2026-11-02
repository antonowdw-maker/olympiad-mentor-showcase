/**
 * Auth.js (NextAuth v5): Credentials + JWT (без Prisma Adapter).
 * Полный auth (с Prisma) — только Node; `proxy.ts` берёт authConfig.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth/config";
import { resolvePersistedUserId } from "@/lib/auth/resolve-user";

const credentialsSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        login: { label: "Логин", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { login: parsed.data.login },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.displayName ?? user.login,
          login: user.login,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      const resolvedId = await resolvePersistedUserId({
        userId: token.userId ? String(token.userId) : null,
        login: token.login ? String(token.login) : null,
      });
      if (!resolvedId) {
        // JWT «осиротел» — не отдаём id, иначе FK на DayPlan / Attempt
        return { ...session, user: undefined };
      }
      if (session.user) {
        session.user.id = resolvedId;
      }
      return session;
    },
  },
});
