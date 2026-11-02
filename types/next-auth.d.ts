import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
  }

  interface User {
    /** Логин для восстановления id после пересоздания User в сиде */
    login?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    login?: string;
  }
}
