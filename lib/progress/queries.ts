/**
 * Прогресс пользователя по теме (чтение из БД + calculateTopicProgress).
 */
import { prisma } from "@/lib/db";
import { calculateTopicProgress } from "@/lib/progress/calculate";

export async function getTopicProgressForUser(userId: string, topicSlug: string) {
  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    include: { tasks: { select: { id: true } } },
  });
  if (!topic) return null;

  const taskIds = topic.tasks.map((t) => t.id);
  const correct = await prisma.attempt.findMany({
    where: {
      userId,
      isCorrect: true,
      taskId: { in: taskIds },
    },
    select: { taskId: true },
    distinct: ["taskId"],
  });

  return calculateTopicProgress({
    totalTasks: taskIds.length,
    solvedTaskIds: correct.map((a) => a.taskId),
  });
}

/** Множество slug задач, решённых верно (для списка темы). */
export async function getSolvedTaskSlugs(userId: string, topicSlug: string): Promise<Set<string>> {
  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    include: { tasks: { select: { id: true, slug: true } } },
  });
  if (!topic) return new Set();

  const byId = new Map(topic.tasks.map((t) => [t.id, t.slug]));
  const correct = await prisma.attempt.findMany({
    where: {
      userId,
      isCorrect: true,
      taskId: { in: topic.tasks.map((t) => t.id) },
    },
    select: { taskId: true },
    distinct: ["taskId"],
  });

  return new Set(
    correct.map((a) => byId.get(a.taskId)).filter((s): s is string => Boolean(s)),
  );
}
