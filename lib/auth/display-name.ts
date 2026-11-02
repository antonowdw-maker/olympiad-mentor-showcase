/**
 * Имя в шапке: из БД (не из JWT), чтобы не залипал битый SEED_TEST_USER_NAME в сессии.
 */
import { prisma } from "@/lib/db";

export async function getSessionDisplayLabel(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, login: true },
  });
  if (!user) return "Ученик";
  const name = user.displayName?.trim();
  if (name && !/[?\uFFFD]/.test(name) && /[\p{L}\p{N}]/u.test(name)) {
    return name;
  }
  return user.login;
}
