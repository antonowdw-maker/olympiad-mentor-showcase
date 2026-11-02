/**
 * Reveal эталона по кнопке A (REQ-TRN-09, INV-07).
 * С пулом — только текущий instance (I12A-01); без пула — канон TaskReveal.
 */
import { prisma } from "@/lib/db";
import { requireBoundTaskContent } from "@/lib/content/instance-binding";
import { getHintsOpenedCount } from "@/lib/trainer/hint-progress";

export async function hasTaskReveal(
  userId: string,
  taskId: string,
  instanceId?: string | null,
): Promise<boolean> {
  if (instanceId) {
    const row = await prisma.taskInstanceReveal.findUnique({
      where: {
        userId_taskInstanceId: { userId, taskInstanceId: instanceId },
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  const row = await prisma.taskReveal.findUnique({
    where: { userId_taskId: { userId, taskId } },
    select: { id: true },
  });
  return Boolean(row);
}

export type RevealResult =
  | { ok: true; acceptedAnswers: string[] }
  | { ok: false; error: string };

/** Явный запрос эталона: создаёт reveal и возвращает acceptedAnswers текущего binding. */
export async function revealTaskSolution(
  userId: string,
  topicSlug: string,
  taskSlug: string,
  clientInstanceId?: string | null,
): Promise<RevealResult> {
  const task = await prisma.task.findFirst({
    where: { slug: taskSlug, topic: { slug: topicSlug } },
    select: {
      id: true,
      statement: true,
      acceptedAnswers: true,
      options: true,
      hintSteps: true,
    },
  });
  if (!task) {
    return { ok: false, error: "Задача не найдена" };
  }

  const bound = await requireBoundTaskContent(userId, task, clientInstanceId);
  if (!bound.ok) return bound;

  let accepted: string[];
  try {
    accepted = JSON.parse(bound.binding.acceptedAnswers) as string[];
  } catch {
    return { ok: false, error: "Ошибка контента задачи" };
  }

  if (bound.binding.instanceId) {
    const existing = await prisma.taskInstanceReveal.findUnique({
      where: {
        userId_taskInstanceId: {
          userId,
          taskInstanceId: bound.binding.instanceId,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.taskInstanceReveal.create({
        data: { userId, taskInstanceId: bound.binding.instanceId },
      });
      await prisma.attempt.create({
        data: {
          userId,
          taskId: task.id,
          taskInstanceId: bound.binding.instanceId,
          submittedAnswer: "[reveal]",
          isCorrect: false,
          hintsOpenedCount: bound.binding.openedCount,
          solutionRevealed: true,
        },
      });
    }
  } else {
    const existing = await prisma.taskReveal.findUnique({
      where: { userId_taskId: { userId, taskId: task.id } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.taskReveal.create({
        data: { userId, taskId: task.id },
      });
      const opened = await getHintsOpenedCount(userId, task.id);
      await prisma.attempt.create({
        data: {
          userId,
          taskId: task.id,
          submittedAnswer: "[reveal]",
          isCorrect: false,
          hintsOpenedCount: opened,
          solutionRevealed: true,
        },
      });
    }
  }

  return { ok: true, acceptedAnswers: accepted };
}
