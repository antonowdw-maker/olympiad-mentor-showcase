/**
 * Прогресс открытых ступеней подсказки user×task (сервер).
 */
import { prisma } from "@/lib/db";
import { clampOpenedCount, nextOpenedCount, shouldBoostHelp } from "@/lib/trainer/hints";

export async function getHintsOpenedCount(userId: string, taskId: string): Promise<number> {
  const row = await prisma.taskHintProgress.findUnique({
    where: { userId_taskId: { userId, taskId } },
    select: { openedCount: true },
  });
  return row?.openedCount ?? 0;
}

/**
 * Задача — цель входящей similar-связи (кандидат на лимит I4-08).
 * Сам по себе не режет подсказки: лимит только вместе с ?reinforce=1 (FUA-01).
 */
export async function isReinforceTargetTask(
  topicId: string,
  taskSlug: string,
): Promise<boolean> {
  const n = await prisma.task.count({
    where: { topicId, similarTaskSlug: taskSlug },
  });
  return n > 0;
}

/**
 * Неверные Attempt после последней верной (текущее затруднение, REQ-TRN-03 / I4-03).
 * Если верных ещё не было — все неверные по задаче.
 */
export async function countWrongAttemptsAfterLastCorrect(
  userId: string,
  taskId: string,
): Promise<number> {
  const lastCorrect = await prisma.attempt.findFirst({
    where: { userId, taskId, isCorrect: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return prisma.attempt.count({
    where: {
      userId,
      taskId,
      isCorrect: false,
      // Reveal по кнопке A не двигает boost (I5-07)
      solutionRevealed: false,
      ...(lastCorrect ? { createdAt: { gt: lastCorrect.createdAt } } : {}),
    },
  });
}

/**
 * Состояние помощи на экране задачи: один запрос task + boost (I4-04).
 */
export async function getTaskHelpState(
  userId: string,
  topicSlug: string,
  taskSlug: string,
): Promise<{ taskId: string; boostHelp: boolean } | null> {
  const task = await prisma.task.findFirst({
    where: { slug: taskSlug, topic: { slug: topicSlug } },
    select: { id: true },
  });
  if (!task) return null;

  const wrong = await countWrongAttemptsAfterLastCorrect(userId, task.id);
  return { taskId: task.id, boostHelp: shouldBoostHelp(wrong) };
}

/**
 * Открыть следующую ступень. Возвращает новый openedCount и advanced.
 * На потолке в БД не пишет (I4-01).
 */
export async function openNextHintStep(
  userId: string,
  taskId: string,
  totalSteps: number,
): Promise<{ openedCount: number; advanced: boolean }> {
  const current = await getHintsOpenedCount(userId, taskId);
  const { opened, advanced } = nextOpenedCount(current, totalSteps);
  if (!advanced) {
    return { openedCount: clampOpenedCount(current, totalSteps), advanced: false };
  }

  await prisma.taskHintProgress.upsert({
    where: { userId_taskId: { userId, taskId } },
    create: { userId, taskId, openedCount: opened },
    update: { openedCount: opened },
  });

  return { openedCount: opened, advanced: true };
}
