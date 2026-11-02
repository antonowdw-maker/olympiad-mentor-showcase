/**
 * Загрузка тем для пикера плана: slug/title/order + есть ли нерешённые задачи.
 * P-PLAN-UNSOLVED: «нерешённые» = есть канон с нерешённым instance.
 */
import { listTopics } from "@/lib/content/queries";
import { prisma } from "@/lib/db";
import { exhaustedTaskSlugsFromPool } from "@/lib/plan/exhausted";
import type { PlanTopicChoice } from "@/lib/plan/topic-preference";

export async function listPlanTopicChoices(userId: string | null): Promise<PlanTopicChoice[]> {
  const topics = await listTopics();
  if (!userId) {
    return topics.map((t) => ({
      slug: t.slug,
      title: t.title,
      order: t.order,
      hasUnsolved: false,
    }));
  }
  return Promise.all(
    topics.map(async (t) => {
      const topic = await prisma.topic.findUnique({
        where: { slug: t.slug },
        select: {
          id: true,
          tasks: {
            select: {
              slug: true,
              instances: { select: { id: true } },
            },
          },
        },
      });
      if (!topic || topic.tasks.length === 0) {
        return {
          slug: t.slug,
          title: t.title,
          order: t.order,
          hasUnsolved: false,
        };
      }
      const instanceIds = topic.tasks.flatMap((task) => task.instances.map((i) => i.id));
      const correct =
        instanceIds.length === 0
          ? []
          : await prisma.attempt.findMany({
              where: {
                userId,
                isCorrect: true,
                taskInstanceId: { in: instanceIds },
              },
              select: { taskInstanceId: true },
            });
      const solvedIds = new Set(
        correct
          .map((c) => c.taskInstanceId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      const exhausted = exhaustedTaskSlugsFromPool({
        tasks: topic.tasks.map((task) => ({
          slug: task.slug,
          instanceIds: task.instances.map((i) => i.id),
        })),
        correctlySolvedInstanceIds: solvedIds,
      });
      return {
        slug: t.slug,
        title: t.title,
        order: t.order,
        hasUnsolved: exhausted.size < topic.tasks.length,
      };
    }),
  );
}
