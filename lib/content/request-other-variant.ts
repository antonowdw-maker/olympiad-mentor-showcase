"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canRequestOtherVariant } from "@/lib/content/other-variant-gate";
import { resolveTaskInstance } from "@/lib/content/instance-resolve";
import { readBlockModeFromCookies } from "@/lib/modes/actions";
import { assertNotTestMode } from "@/lib/modes/assert-learn";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  topicSlug: z.string().min(1),
  taskSlug: z.string().min(1),
});

export type RequestOtherVariantResult =
  | { ok: true; instanceId: string }
  | { ok: false; error: string };

/**
 * Кнопка «Другой вариант»: следующий изоморф (анти-повтор / цикл).
 * P-VARIANT-AFTER-CORRECT: смена только после верного Attempt на текущем instance
 * (в т. ч. на первом визите). XP не начисляется. В «Тест» недоступно (iter 13).
 */
export async function requestOtherTaskVariantAction(
  topicSlug: string,
  taskSlug: string,
): Promise<RequestOtherVariantResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти в аккаунт" };
  }

  const gate = await assertNotTestMode("«Другой вариант»");
  if (!gate.ok) return gate;

  const parsed = schema.safeParse({ topicSlug, taskSlug });
  if (!parsed.success) {
    return { ok: false, error: "Некорректные данные" };
  }

  const task = await prisma.task.findFirst({
    where: {
      slug: parsed.data.taskSlug,
      topic: { slug: parsed.data.topicSlug },
    },
    select: { id: true },
  });
  if (!task) {
    return { ok: false, error: "Задача не найдена" };
  }

  const n = await prisma.taskInstance.count({ where: { taskId: task.id } });
  if (n < 2) {
    return { ok: false, error: "Для этой задачи нет других вариантов" };
  }

  const mode = await readBlockModeFromCookies();
  const current = await resolveTaskInstance(task.id, session.user.id, { mode });
  if (!current) {
    return { ok: false, error: "Не удалось выбрать вариант" };
  }

  const correct = await prisma.attempt.findFirst({
    where: {
      userId: session.user.id,
      taskInstanceId: current.id,
      isCorrect: true,
    },
    select: { id: true },
  });

  if (
    !canRequestOtherVariant({
      poolSize: n,
      currentInstanceId: current.id,
      currentHasCorrect: Boolean(correct),
    })
  ) {
    return {
      ok: false,
      error: "Сначала реши текущий вариант верно — потом можно сменить условие",
    };
  }

  const resolved = await resolveTaskInstance(task.id, session.user.id, {
    forceNew: true,
    mode,
  });
  if (!resolved) {
    return { ok: false, error: "Не удалось выбрать вариант" };
  }

  revalidatePath(`/topics/${parsed.data.topicSlug}/tasks/${parsed.data.taskSlug}`);
  revalidatePath(`/topics/${parsed.data.topicSlug}`);

  return { ok: true, instanceId: resolved.id };
}

/** Серверный флаг для UI: показывать ли кнопку «Другой вариант» (только после верного). */
export async function getOtherVariantUiState(
  userId: string,
  taskId: string,
  currentInstanceId: string | null,
): Promise<{ allowed: boolean; poolSize: number }> {
  const poolSize = await prisma.taskInstance.count({ where: { taskId } });
  if (poolSize < 2 || !currentInstanceId) {
    return { allowed: false, poolSize };
  }
  const correct = await prisma.attempt.findFirst({
    where: { userId, taskInstanceId: currentInstanceId, isCorrect: true },
    select: { id: true },
  });
  const allowed = canRequestOtherVariant({
    poolSize,
    currentInstanceId,
    currentHasCorrect: Boolean(correct),
  });
  return { allowed, poolSize };
}
