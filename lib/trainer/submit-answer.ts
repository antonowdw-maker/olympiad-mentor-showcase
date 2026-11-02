"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAnswerCorrect } from "@/lib/trainer/answer";
import { countWrongAttemptsAfterLastCorrect, isReinforceTargetTask } from "@/lib/trainer/hint-progress";
import {
  clampOpenedCount,
  effectiveHintStepsTotal,
  isReinforceVisit,
  reinforceTaskHref,
  shouldApplyReinforceHintCap,
  shouldBoostHelp,
  shouldOfferReinforce,
} from "@/lib/trainer/hints";
import { requireBoundTaskContent } from "@/lib/content/instance-binding";
import {
  TABLE_INCOMPLETE_ERROR,
  isTableAnswerComplete,
  parseAnswerTableJson,
} from "@/lib/content/answer-table";
import { awardXpForCorrectSolve } from "@/lib/progress/award";
import { readBlockModeFromCookies } from "@/lib/modes/actions";
import {
  isBinaryChoiceOptions,
  isTestMode,
} from "@/lib/modes/block-mode";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const submitSchema = z.object({
  topicSlug: z.string().min(1),
  taskSlug: z.string().min(1),
  answer: z.string().min(1),
  reinforce: z.string().optional(),
  instanceId: z.string().optional(),
});

export type SubmitAnswerResult =
  | {
      ok: true;
      isCorrect: boolean;
      hintsOpenedCount: number;
      /** Предложить закрепляющую похожую (REQ-TRN-10). */
      offerReinforce: boolean;
      reinforceHref: string | null;
      reinforceLabel: string | null;
      /** После ≥3 неверных в текущем затруднении — мягкое усиление (REQ-TRN-03). */
      boostHelp: boolean;
      /** L1: XP за это решение (0 если не первое верное). */
      xpGained: number;
      totalXp: number;
      newBadges: { code: string; title: string }[];
      /** Тест + binary choice: повторный ввод запрещён после ошибки. */
      locked?: boolean;
    }
  | { ok: false; error: string; locked?: boolean };

/**
 * Создаёт Attempt; hintsOpenedCount — с сервера, clamp по effective total (W-03 / I4-02 / FUA-03).
 * Пул instance: только текущий sticky binding (I12A-02).
 */
export async function submitAnswerAction(formData: FormData): Promise<SubmitAnswerResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти в аккаунт" };
  }

  const parsed = submitSchema.safeParse({
    topicSlug: formData.get("topicSlug"),
    taskSlug: formData.get("taskSlug"),
    answer: formData.get("answer"),
    reinforce: formData.get("reinforce") || undefined,
    instanceId: formData.get("instanceId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Некорректные данные формы" };
  }

  const task = await prisma.task.findFirst({
    where: {
      slug: parsed.data.taskSlug,
      topic: { slug: parsed.data.topicSlug },
    },
    include: { topic: { select: { id: true, slug: true, title: true } } },
  });
  if (!task) {
    return { ok: false, error: "Задача не найдена" };
  }

  const bound = await requireBoundTaskContent(
    session.user.id,
    task,
    parsed.data.instanceId,
  );
  if (!bound.ok) {
    return { ok: false, error: bound.error };
  }

  const mode = await readBlockModeFromCookies();
  const test = isTestMode(mode);

  let accepted: string[];
  let rawHintTotal = 0;
  let options: string[] = [];
  const optionsJson = bound.binding.options ?? task.options;
  try {
    accepted = JSON.parse(bound.binding.acceptedAnswers) as string[];
    const steps = JSON.parse(bound.binding.hintSteps) as unknown[];
    rawHintTotal = Array.isArray(steps) ? steps.length : 0;
    if (optionsJson && task.answerType !== "table") {
      options = JSON.parse(optionsJson) as string[];
    }
  } catch {
    return { ok: false, error: "Ошибка контента задачи" };
  }

  // Таблица: неполный ответ не считаем попыткой (ни Attempt, ни штрафа XP)
  if (task.answerType === "table") {
    const table = parseAnswerTableJson(optionsJson);
    if (!table) return { ok: false, error: "Ошибка контента задачи" };
    if (!isTableAnswerComplete(parsed.data.answer, table)) {
      return { ok: false, error: TABLE_INCOMPLETE_ERROR };
    }
  }

  const binaryLock =
    test &&
    task.answerType === "choice" &&
    isBinaryChoiceOptions(options) &&
    Boolean(bound.binding.instanceId);

  if (binaryLock && bound.binding.instanceId) {
    const priorWrong = await prisma.attempt.findFirst({
      where: {
        userId: session.user.id,
        taskInstanceId: bound.binding.instanceId,
        isCorrect: false,
      },
      select: { id: true },
    });
    const priorCorrect = await prisma.attempt.findFirst({
      where: {
        userId: session.user.id,
        taskInstanceId: bound.binding.instanceId,
        isCorrect: true,
      },
      select: { id: true },
    });
    if (priorWrong && !priorCorrect) {
      return {
        ok: false,
        error: "В тесте этот вопрос уже сдан с ошибкой. Перейди дальше.",
        locked: true,
      };
    }
  }

  const incomingTarget = await isReinforceTargetTask(task.topicId, task.slug);
  const applyCap =
    !test &&
    shouldApplyReinforceHintCap(isReinforceVisit(parsed.data.reinforce), incomingTarget);
  const hintStepsTotal = effectiveHintStepsTotal(rawHintTotal, applyCap);

  const hintsOpenedCount = clampOpenedCount(
    bound.binding.openedCount,
    hintStepsTotal,
  );
  const isCorrect = isAnswerCorrect(parsed.data.answer, accepted, task.answerType);

  await prisma.attempt.create({
    data: {
      userId: session.user.id,
      taskId: task.id,
      taskInstanceId: bound.binding.instanceId,
      submittedAnswer: parsed.data.answer.trim(),
      isCorrect,
      hintsOpenedCount: test ? 0 : hintsOpenedCount,
      solutionRevealed: false,
    },
  });

  let offerReinforce = false;
  let reinforceHref: string | null = null;
  let reinforceLabel: string | null = null;
  if (
    !test &&
    isCorrect &&
    shouldOfferReinforce(hintsOpenedCount, Boolean(task.similarTaskSlug))
  ) {
    const similar = await prisma.task.findFirst({
      where: { slug: task.similarTaskSlug!, topicId: task.topicId },
      select: { slug: true, order: true, title: true },
    });
    if (similar) {
      offerReinforce = true;
      reinforceHref = reinforceTaskHref(parsed.data.topicSlug, similar.slug);
      reinforceLabel = `Задача ${similar.order}: ${similar.title}`;
    }
  }

  const wrongAfter = isCorrect
    ? 0
    : await countWrongAttemptsAfterLastCorrect(session.user.id, task.id);
  const boostHelp = !test && !isCorrect && shouldBoostHelp(wrongAfter);
  const locked = Boolean(binaryLock && !isCorrect);

  let xpGained = 0;
  let totalXp = 0;
  let newBadges: { code: string; title: string }[] = [];
  if (isCorrect) {
    // I12A-04: reveal не считается неверной попыткой для штрафа XP
    const wrongAttemptCount = await prisma.attempt.count({
      where: {
        userId: session.user.id,
        taskId: task.id,
        isCorrect: false,
        solutionRevealed: false,
      },
    });
    const award = await awardXpForCorrectSolve({
      userId: session.user.id,
      taskId: task.id,
      topicId: task.topic.id,
      topicSlug: task.topic.slug,
      topicTitle: task.topic.title,
      grade: task.grade,
      hintsOpenedCount,
      wrongAttemptCount,
    });
    xpGained = award.xpGained;
    totalXp = award.totalXp;
    newBadges = award.newBadges;
  } else {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { totalXp: true },
    });
    totalXp = u?.totalXp ?? 0;
  }

  revalidatePath(`/topics/${parsed.data.topicSlug}`);
  revalidatePath(`/topics/${parsed.data.topicSlug}/tasks/${parsed.data.taskSlug}`);
  revalidatePath("/");

  return {
    ok: true,
    isCorrect,
    hintsOpenedCount,
    offerReinforce,
    reinforceHref,
    reinforceLabel,
    boostHelp,
    xpGained,
    totalXp,
    newBadges,
    locked,
  };
}
