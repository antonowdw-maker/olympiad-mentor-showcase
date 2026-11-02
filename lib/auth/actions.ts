"use server";

import { signIn, signOut } from "@/lib/auth";
import { PLAN_TOPIC_COOKIE } from "@/lib/plan/topic-preference";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      login,
      password,
      redirectTo: "/",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw e;
  }
}

export async function logoutAction() {
  // Выбор темы плана — cookie браузера; иначе следующий пользователь унаследует чужую тему (PT-02).
  const jar = await cookies();
  jar.delete(PLAN_TOPIC_COOKIE);
  await signOut({ redirectTo: "/login" });
}
