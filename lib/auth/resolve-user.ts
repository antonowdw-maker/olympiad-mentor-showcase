/**
 * Резолв актуального User.id для JWT-сессии.
 * После db:reset / пересоздания User id в токене устаревает → FK на DayPlanPackage.create.
 * Лечим по login из JWT; если User нет — null (нужен повторный вход).
 */
import { prisma } from "@/lib/db";

export async function resolvePersistedUserId(opts: {
  userId?: string | null;
  login?: string | null;
}): Promise<string | null> {
  const login = opts.login?.trim();
  if (login) {
    const byLogin = await prisma.user.findUnique({
      where: { login },
      select: { id: true },
    });
    if (byLogin) return byLogin.id;
  }

  const id = opts.userId?.trim();
  if (!id) return null;

  const byId = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  return byId?.id ?? null;
}

/** Бросает USER_GONE, если userId нет в БД (защита FK при записи). */
export async function assertUserExists(userId: string): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!row) {
    throw new Error("USER_GONE");
  }
}

export function isPrismaForeignKeyError(e: unknown): boolean {
  return Boolean(
    e && typeof e === "object" && "code" in e && String((e as { code: string }).code) === "P2003",
  );
}
