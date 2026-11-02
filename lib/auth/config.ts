/**
 * Конфиг Auth.js без Prisma — безопасен для `proxy.ts` (бывший middleware).
 * Резолв User.id по БД — только в Node (`lib/auth/index.ts`), иначе JWT с устаревшим id
 * ломает FK при DayPlanPackage.create после db:reset / пересоздания User.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/auth") || pathname === "/login") {
        return true;
      }
      return Boolean(auth?.user);
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      if (user && "login" in user && typeof user.login === "string" && user.login.trim()) {
        token.login = user.login.trim();
      }
      return token;
    },
    async session({ session, token }) {
      // Edge: только копируем id из JWT (без Prisma). Node переопределяет в index.ts.
      if (session.user && token.userId) {
        session.user.id = String(token.userId);
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
