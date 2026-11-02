/**
 * Завершение теста закрепления + награда (REQ-MODE-08 + MODE-09).
 * Сессия → completed при всех ответах; +XP / бейдж — только если сдан порог баллов.
 * Идемпотентно user×пакет; только из status=active (I13BC-02).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPrismaUniqueConflict } from "@/lib/progress/award";
import {
  SESSION_REINFORCE_XP,
  sessionReinforcedBadgeCode,
  sessionReinforcedBadgeTitle,
} from "@/lib/progress/xp";
import { isReinforceSessionFullyAnswered } from "@/lib/reinforce/rules";
import {
  isReinforceSessionPassed,
  scoreReinforceSession,
  type ReinforceScoreItem,
} from "@/lib/reinforce/pass";
import { computeReinforceDurationSec } from "@/lib/reinforce/timer";

export type ReinforceAwardResult = {
  xpGained: number;
  totalXp: number;
  badge: { code: string; title: string } | null;
  /** Тест закрыт (completed). */
  completed: boolean;
  /** Награда выдана в этом вызове (сессия сдана по MODE-09). */
  rewarded: boolean;
  /** Итог порога; null если ещё не все ответы. */
  pass: {
    score: number;
    maxScore: number;
    threshold: number;
    passed: boolean;
  } | null;
};

type Tx = Prisma.TransactionClient;

async function totalXpOf(tx: Tx, userId: string): Promise<number> {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { totalXp: true },
  });
  return u?.totalXp ?? 0;
}

async function loadScoreItems(
  tx: Tx,
  sessionId: string,
): Promise<ReinforceScoreItem[]> {
  const rows = await tx.reinforceSessionItem.findMany({
    where: { sessionId },
    select: { answeredAt: true, isCorrect: true, taskId: true },
  });
  const taskIds = [...new Set(rows.map((r) => r.taskId))];
  const tasks = await tx.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, grade: true },
  });
  const gradeById = new Map(tasks.map((t) => [t.id, t.grade]));
  return rows.map((r) => ({
    answeredAt: r.answeredAt,
    isCorrect: r.isCorrect,
    grade: gradeById.get(r.taskId) ?? "mid",
  }));
}

/**
 * Ядро внутри уже открытой транзакции (I13BC-01).
 * Claim: status=active → completed; rewardGrantedAt + XP только при passed (MODE-09).
 */
export async function awardReinforceSessionRewardInTx(
  tx: Tx,
  input: {
    userId: string;
    sessionId: string;
    sourcePackageId: string;
  },
): Promise<ReinforceAwardResult> {
  const session = await tx.reinforceSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      userId: true,
      rewardGrantedAt: true,
      status: true,
      createdAt: true,
    },
  });
  if (!session || session.userId !== input.userId) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const totalXp = await totalXpOf(tx, input.userId);

  if (session.rewardGrantedAt) {
    const items = await loadScoreItems(tx, input.sessionId);
    const pass = scoreReinforceSession(items);
    return {
      xpGained: 0,
      totalXp,
      badge: null,
      completed: true,
      rewarded: false,
      pass,
    };
  }

  if (session.status !== "active") {
    const items =
      session.status === "completed"
        ? await loadScoreItems(tx, input.sessionId)
        : [];
    return {
      xpGained: 0,
      totalXp,
      badge: null,
      completed: session.status === "completed",
      rewarded: false,
      pass: items.length ? scoreReinforceSession(items) : null,
    };
  }

  const items = await loadScoreItems(tx, input.sessionId);
  if (!isReinforceSessionFullyAnswered(items)) {
    return {
      xpGained: 0,
      totalXp,
      badge: null,
      completed: false,
      rewarded: false,
      pass: null,
    };
  }

  const pass = scoreReinforceSession(items);
  const passed = pass.passed;
  const now = new Date();
  const durationSec = computeReinforceDurationSec(session.createdAt, now);

  const claimed = await tx.reinforceSession.updateMany({
    where: {
      id: input.sessionId,
      userId: input.userId,
      status: "active",
    },
    data: {
      status: "completed",
      completedAt: now,
      ...(passed ? { rewardGrantedAt: now } : {}),
    },
  });
  if (claimed.count === 0) {
    return {
      xpGained: 0,
      totalXp: await totalXpOf(tx, input.userId),
      badge: null,
      completed: true,
      rewarded: false,
      pass,
    };
  }

  // durationSec через SQL: Prisma Client мог не успеть regenerate (EPERM + next на Windows).
  try {
    await tx.$executeRawUnsafe(
      `UPDATE ReinforceSession SET durationSec = ? WHERE id = ?`,
      durationSec,
      input.sessionId,
    );
  } catch {
    // колонка отсутствует — время всё равно восстановится по completedAt−createdAt
  }

  if (!passed) {
    return {
      xpGained: 0,
      totalXp: await totalXpOf(tx, input.userId),
      badge: null,
      completed: true,
      rewarded: false,
      pass,
    };
  }

  const updated = await tx.user.update({
    where: { id: input.userId },
    data: { totalXp: { increment: SESSION_REINFORCE_XP } },
    select: { totalXp: true },
  });

  const code = sessionReinforcedBadgeCode(input.sourcePackageId);
  const title = sessionReinforcedBadgeTitle();
  let badge: { code: string; title: string } | null = null;
  try {
    await tx.userBadge.create({
      data: { userId: input.userId, code, title },
    });
    badge = { code, title };
  } catch (e) {
    if (!isPrismaUniqueConflict(e)) throw e;
  }

  return {
    xpGained: SESSION_REINFORCE_XP,
    totalXp: updated.totalXp,
    badge,
    completed: true,
    rewarded: true,
    pass,
  };
}

/**
 * Идемпотентно: user×пакет. Повтор после rewardGrantedAt → 0 XP.
 * Без внешнего tx открывает свою транзакцию.
 */
export async function awardReinforceSessionReward(input: {
  userId: string;
  sessionId: string;
  sourcePackageId: string;
}): Promise<ReinforceAwardResult> {
  return prisma.$transaction((tx) => awardReinforceSessionRewardInTx(tx, input));
}

/** Реэкспорт для тестов / call sites, ожидающих проверку порога. */
export { isReinforceSessionPassed };
