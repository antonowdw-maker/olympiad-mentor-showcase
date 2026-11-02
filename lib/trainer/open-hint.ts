"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { HintStep } from "@/lib/content/schemas";
import { requireBoundTaskContent } from "@/lib/content/instance-binding";
import { openNextInstanceHintStep } from "@/lib/content/instance-resolve";
import { isReinforceTargetTask, openNextHintStep } from "@/lib/trainer/hint-progress";
import {
  effectiveHintStepsTotal,
  isReinforceVisit,
  shouldApplyReinforceHintCap,
  sliceVisibleHints,
} from "@/lib/trainer/hints";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const openSchema = z.object({
  topicSlug: z.string().min(1),
  taskSlug: z.string().min(1),
  reinforce: z.string().optional(),
  instanceId: z.string().optional(),
});

export type OpenHintResult =
  | {
      ok: true;
      openedCount: number;
      hintStepsTotal: number;
      hasMoreHints: boolean;
      visibleSteps: { text: string; docSlug?: string; docTitle?: string }[];
      advanced: boolean;
    }
  | { ok: false; error: string };

/**
 * Открыть следующую ступень подсказки (W-03).
 * Пул instance: только текущий sticky (I12A-02).
 */
export async function openHintStepAction(
  topicSlug: string,
  taskSlug: string,
  reinforce?: string | null,
  instanceId?: string | null,
): Promise<OpenHintResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти в аккаунт" };
  }

  const { assertNotTestMode } = await import("@/lib/modes/assert-learn");
  const gate = await assertNotTestMode("Подсказки");
  if (!gate.ok) return gate;

  const parsed = openSchema.safeParse({
    topicSlug,
    taskSlug,
    reinforce: reinforce ?? undefined,
    instanceId: instanceId ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Некорректные данные" };
  }

  const task = await prisma.task.findFirst({
    where: {
      slug: parsed.data.taskSlug,
      topic: { slug: parsed.data.topicSlug },
    },
    select: {
      id: true,
      topicId: true,
      slug: true,
      statement: true,
      acceptedAnswers: true,
      options: true,
      hintSteps: true,
    },
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

  let allSteps: HintStep[];
  try {
    allSteps = JSON.parse(bound.binding.hintSteps) as HintStep[];
  } catch {
    return { ok: false, error: "Ошибка контента подсказок" };
  }

  const incomingTarget = await isReinforceTargetTask(task.topicId, task.slug);
  const applyCap = shouldApplyReinforceHintCap(
    isReinforceVisit(parsed.data.reinforce),
    incomingTarget,
  );
  const hintStepsTotal = effectiveHintStepsTotal(allSteps.length, applyCap);

  const { openedCount, advanced } = bound.binding.instanceId
    ? await openNextInstanceHintStep(
        session.user.id,
        bound.binding.instanceId,
        hintStepsTotal,
      )
    : await openNextHintStep(session.user.id, task.id, hintStepsTotal);

  const visible = sliceVisibleHints(allSteps, openedCount);
  const docSlugs = visible.map((s) => s.docSlug).filter((s): s is string => Boolean(s));
  const articles =
    docSlugs.length > 0
      ? await prisma.docArticle.findMany({
          where: { topicId: task.topicId, slug: { in: docSlugs } },
          select: { slug: true, title: true },
        })
      : [];
  const bySlug = new Map(articles.map((a) => [a.slug, a.title]));

  revalidatePath(`/topics/${parsed.data.topicSlug}/tasks/${parsed.data.taskSlug}`);

  return {
    ok: true,
    openedCount,
    hintStepsTotal,
    hasMoreHints: openedCount < hintStepsTotal,
    advanced,
    visibleSteps: visible.map((step) => ({
      text: step.text,
      docSlug: step.docSlug,
      docTitle: step.docSlug ? bySlug.get(step.docSlug) : undefined,
    })),
  };
}
