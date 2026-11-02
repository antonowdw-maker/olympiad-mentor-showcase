/**
 * Начисление XP/бейджей после верного Attempt (L1 / iter 11).
 * XP идемпотентен по TaskXpAward @@unique([userId, taskId]) в одной транзакции с increment.
 */
import { prisma } from "@/lib/db";
import {
  milestoneBadgesForUniqueCount,
  milestoneBadgeTitle,
  shouldEarnTechniqueBadge,
  techniqueBadgeCode,
  techniqueBadgeTitle,
  xpAwardAmount,
} from "@/lib/progress/xp";

export type XpAwardResult = {
  xpGained: number;
  totalXp: number;
  newBadges: { code: string; title: string }[];
};

/** Prisma unique violation (SQLite / Postgres). */
export function isPrismaUniqueConflict(e: unknown): boolean {
  return Boolean(
    e && typeof e === "object" && "code" in e && String((e as { code: unknown }).code) === "P2002",
  );
}

/**
 * Вызывать после записи верного Attempt.
 * XP: create TaskXpAward + increment totalXp атомарно; P2002 на award → 0 XP.
 * Сумма = база грейда с штрафами за подсказки/неверные (ceil, мин. 10%).
 */
export async function awardXpForCorrectSolve(input: {
  userId: string;
  taskId: string;
  topicId: string;
  topicSlug: string;
  topicTitle: string;
  grade: string;
  hintsOpenedCount: number;
  wrongAttemptCount: number;
}): Promise<XpAwardResult> {
  const xpAmount = xpAwardAmount({
    grade: input.grade,
    hintsOpenedCount: input.hintsOpenedCount,
    wrongAttemptCount: input.wrongAttemptCount,
  });

  return prisma.$transaction(async (tx) => {
    let xpGained = 0;
    let totalXp = 0;

    try {
      await tx.taskXpAward.create({
        data: {
          userId: input.userId,
          taskId: input.taskId,
          xpAmount,
        },
      });
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { totalXp: { increment: xpAmount } },
        select: { totalXp: true },
      });
      xpGained = xpAmount;
      totalXp = updated.totalXp;
    } catch (e) {
      if (!isPrismaUniqueConflict(e)) throw e;
      // Уже начисляли за эту задачу — повтор / гонка
      const u = await tx.user.findUnique({
        where: { id: input.userId },
        select: { totalXp: true },
      });
      totalXp = u?.totalXp ?? 0;
      xpGained = 0;
    }

    const uniqueCorrect = await tx.attempt.findMany({
      where: { userId: input.userId, isCorrect: true },
      select: { taskId: true },
      distinct: ["taskId"],
    });
    const uniqueCount = uniqueCorrect.length;

    const newBadges: { code: string; title: string }[] = [];

    for (const code of milestoneBadgesForUniqueCount(uniqueCount)) {
      const created = await tryCreateBadge(tx, input.userId, code, milestoneBadgeTitle(code));
      if (created) newBadges.push(created);
    }

    const uniqueInTopic = await tx.attempt.findMany({
      where: {
        userId: input.userId,
        isCorrect: true,
        task: { topicId: input.topicId },
      },
      select: { taskId: true },
      distinct: ["taskId"],
    });

    if (shouldEarnTechniqueBadge(uniqueInTopic.length)) {
      const code = techniqueBadgeCode(input.topicSlug);
      const created = await tryCreateBadge(
        tx,
        input.userId,
        code,
        techniqueBadgeTitle(input.topicTitle),
      );
      if (created) newBadges.push(created);
    }

    return { xpGained, totalXp, newBadges };
  });
}

type BadgeTx = {
  userBadge: {
    create: (args: {
      data: { userId: string; code: string; title: string };
    }) => Promise<unknown>;
  };
};

async function tryCreateBadge(
  tx: BadgeTx,
  userId: string,
  code: string,
  title: string,
): Promise<{ code: string; title: string } | null> {
  try {
    await tx.userBadge.create({
      data: { userId, code, title },
    });
    return { code, title };
  } catch (e) {
    if (isPrismaUniqueConflict(e)) return null;
    throw e;
  }
}

export async function getUserXpSummary(userId: string): Promise<{
  totalXp: number;
  badges: { code: string; title: string; earnedAt: string }[];
}> {
  const [user, badges] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totalXp: true } }),
    prisma.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: "asc" },
      select: { code: true, title: true, earnedAt: true },
    }),
  ]);
  return {
    totalXp: user?.totalXp ?? 0,
    badges: badges.map((b) => ({
      code: b.code,
      title: b.title,
      earnedAt: b.earnedAt.toISOString(),
    })),
  };
}
