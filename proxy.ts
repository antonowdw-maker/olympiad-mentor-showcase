import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

/**
 * Proxy (бывший middleware, Next 16) только с JWT-конфигом (без Prisma / bcrypt).
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
