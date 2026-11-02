/**
 * Серверный binding user×task×instance (I12A-02).
 * Клиентский instanceId не доверяем: для пула обязан совпасть с текущим sticky.
 */
import { prisma } from "@/lib/db";
import { resolveTaskInstance } from "@/lib/content/instance-resolve";

export type BoundTaskContent = {
  taskId: string;
  /** null — у канона нет пула instance. */
  instanceId: string | null;
  /** Своё название варианта; null — название канона (Task.title). */
  title: string | null;
  statement: string;
  acceptedAnswers: string;
  options: string | null;
  hintSteps: string;
  openedCount: number;
};

export type BindingResult =
  | { ok: true; binding: BoundTaskContent }
  | { ok: false; error: string };

/**
 * Текущий sticky instance (без forceNew). Для пула всегда создаёт/читает показ.
 */
export async function getCurrentBoundContent(
  userId: string,
  task: {
    id: string;
    statement: string;
    acceptedAnswers: string;
    options: string | null;
    hintSteps: string;
  },
): Promise<BoundTaskContent> {
  const resolved = await resolveTaskInstance(task.id, userId);
  if (!resolved) {
    const hintRow = await prisma.taskHintProgress.findUnique({
      where: { userId_taskId: { userId, taskId: task.id } },
      select: { openedCount: true },
    });
    return {
      taskId: task.id,
      instanceId: null,
      title: null,
      statement: task.statement,
      acceptedAnswers: task.acceptedAnswers,
      options: task.options,
      hintSteps: task.hintSteps,
      openedCount: hintRow?.openedCount ?? 0,
    };
  }
  return {
    taskId: task.id,
    instanceId: resolved.id,
    title: resolved.title,
    statement: resolved.statement,
    acceptedAnswers: resolved.acceptedAnswers,
    options: resolved.options,
    hintSteps: resolved.hintSteps,
    openedCount: resolved.openedCount,
  };
}

/**
 * Mutating actions: при пуле — instanceId обязателен и должен быть текущим sticky.
 */
export async function requireBoundTaskContent(
  userId: string,
  task: {
    id: string;
    statement: string;
    acceptedAnswers: string;
    options: string | null;
    hintSteps: string;
  },
  clientInstanceId: string | null | undefined,
): Promise<BindingResult> {
  const poolSize = await prisma.taskInstance.count({ where: { taskId: task.id } });
  const current = await getCurrentBoundContent(userId, task);

  if (poolSize === 0) {
    if (clientInstanceId) {
      return { ok: false, error: "Экземпляр задачи не найден" };
    }
    return { ok: true, binding: current };
  }

  if (!clientInstanceId) {
    return { ok: false, error: "Нужен текущий вариант задачи" };
  }
  if (!current.instanceId || clientInstanceId !== current.instanceId) {
    return {
      ok: false,
      error: "Вариант задачи устарел — обновите страницу",
    };
  }
  return { ok: true, binding: current };
}

/** Есть ли верный Attempt по канону (для «Другой вариант»). */
export async function hasCanonicalCorrectAttempt(
  userId: string,
  taskId: string,
): Promise<boolean> {
  const row = await prisma.attempt.findFirst({
    where: { userId, taskId, isCorrect: true },
    select: { id: true },
  });
  return Boolean(row);
}
