/**
 * Чтение БД → PersonalStats / семейный рейтинг (iter 14).
 */
import "server-only";

import { prisma } from "@/lib/db";
import {
  buildPersonalStats,
  buildTopicStatsRow,
  countTopicsComplete,
  countUniqueSolvedInBank,
  rankFamilyMembers,
  type FamilyRankRow,
  type PersonalStatsSummary,
  type ReinforceRunStatsRow,
  type TopicStatsSource,
} from "@/lib/progress/stats";
import { scoreReinforceSession } from "@/lib/reinforce/pass";
import {
  reinforceScopeLabel,
  resolveReinforceDurationSec,
} from "@/lib/reinforce/timer";

async function loadRevealedTaskIds(userId: string): Promise<string[]> {
  const [taskReveals, instanceReveals] = await Promise.all([
    prisma.taskReveal.findMany({
      where: { userId },
      select: { taskId: true },
    }),
    prisma.taskInstanceReveal.findMany({
      where: { userId },
      select: { taskInstance: { select: { taskId: true } } },
    }),
  ]);
  const ids = new Set<string>();
  for (const r of taskReveals) ids.add(r.taskId);
  for (const r of instanceReveals) ids.add(r.taskInstance.taskId);
  return [...ids];
}

async function topicSourcesForUser(userId: string): Promise<{
  topics: TopicStatsSource[];
  allAttempts: { createdAt: Date }[];
}> {
  const [topics, attempts, revealedTaskIds] = await Promise.all([
    prisma.topic.findMany({
      orderBy: [{ order: "asc" }, { slug: "asc" }],
      select: {
        slug: true,
        title: true,
        order: true,
        tasks: { select: { id: true, grade: true } },
      },
    }),
    prisma.attempt.findMany({
      where: { userId },
      select: { taskId: true, isCorrect: true, createdAt: true },
    }),
    loadRevealedTaskIds(userId),
  ]);

  const byTopic: TopicStatsSource[] = topics.map((t) => {
    const taskIdSet = new Set(t.tasks.map((x) => x.id));
    return {
      topicSlug: t.slug,
      topicTitle: t.title,
      topicOrder: t.order,
      tasks: t.tasks.map((x) => ({ id: x.id, grade: x.grade })),
      attempts: attempts.filter((a) => taskIdSet.has(a.taskId)),
      revealedTaskIds,
    };
  });

  return { topics: byTopic, allAttempts: attempts.map((a) => ({ createdAt: a.createdAt })) };
}

export async function getPersonalStats(userId: string): Promise<PersonalStatsSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      totalXp: true,
      badges: { select: { code: true } },
    },
  });
  if (!user) return null;

  const [{ topics, allAttempts }, reinforceRuns] = await Promise.all([
    topicSourcesForUser(userId),
    loadReinforceRunRows(userId),
  ]);
  return buildPersonalStats({
    totalXp: user.totalXp,
    topics,
    allAttempts,
    badgeCodes: user.badges.map((b) => b.code),
    reinforceRuns,
  });
}

async function loadReinforceRunRows(userId: string): Promise<ReinforceRunStatsRow[]> {
  const rows = await prisma.reinforceSession.findMany({
    where: { userId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: 30,
    select: {
      id: true,
      createdAt: true,
      completedAt: true,
      status: true,
      sourcePackage: {
        select: {
          seq: true,
          scopeKey: true,
          topic: { select: { title: true } },
        },
      },
      items: {
        select: {
          answeredAt: true,
          isCorrect: true,
          taskId: true,
        },
      },
    },
  });

  const taskIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.taskId)))];
  const tasks =
    taskIds.length === 0
      ? []
      : await prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, grade: true },
        });
  const gradeById = new Map(tasks.map((t) => [t.id, t.grade]));
  const durationById = await loadDurationSecMap(rows.map((r) => r.id));

  return rows.map((r) => {
    const pass = scoreReinforceSession(
      r.items.map((i) => ({
        answeredAt: i.answeredAt,
        isCorrect: i.isCorrect,
        grade: gradeById.get(i.taskId) ?? "mid",
      })),
    );
    const durationSec = resolveReinforceDurationSec({
      durationSec: durationById.get(r.id) ?? null,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      status: r.status,
    });
    return {
      sessionId: r.id,
      scopeLabel: reinforceScopeLabel({
        scopeKey: r.sourcePackage.scopeKey,
        topicTitle: r.sourcePackage.topic.title,
      }),
      packageSeq: r.sourcePackage.seq,
      completedAt: (r.completedAt ?? r.createdAt).toISOString(),
      durationSec,
      passed: pass.passed,
      score: pass.score,
      maxScore: pass.maxScore,
    };
  });
}

/**
 * Читает durationSec через SQL — не зависит от того, успел ли `prisma generate`
 * (на Windows next часто держит query_engine DLL).
 */
async function loadDurationSecMap(ids: string[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (ids.length === 0) return map;
  try {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await prisma.$queryRawUnsafe<
      { id: string; durationSec: number | null }[]
    >(
      `SELECT id, durationSec FROM ReinforceSession WHERE id IN (${placeholders})`,
      ...ids,
    );
    for (const r of rows) map.set(r.id, r.durationSec);
  } catch {
    // колонка ещё не в БД — фолбэк по completedAt−createdAt
  }
  return map;
}

export async function getFamilyRanking(currentUserId: string): Promise<FamilyRankRow[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      login: true,
      displayName: true,
      totalXp: true,
    },
    orderBy: { login: "asc" },
  });

  const topics = await prisma.topic.findMany({
    select: {
      slug: true,
      title: true,
      order: true,
      tasks: { select: { id: true, grade: true } },
    },
  });

  const correctAttempts = await prisma.attempt.findMany({
    where: { isCorrect: true },
    select: { userId: true, taskId: true },
    distinct: ["userId", "taskId"],
  });

  const solvedByUser = new Map<string, Set<string>>();
  for (const a of correctAttempts) {
    let set = solvedByUser.get(a.userId);
    if (!set) {
      set = new Set();
      solvedByUser.set(a.userId, set);
    }
    set.add(a.taskId);
  }

  const members = users.map((u) => {
    const solved = solvedByUser.get(u.id) ?? new Set<string>();
    const topicRows = topics.map((t) =>
      buildTopicStatsRow({
        topicSlug: t.slug,
        topicTitle: t.title,
        topicOrder: t.order,
        tasks: t.tasks.map((x) => ({ id: x.id, grade: x.grade })),
        attempts: [...solved]
          .filter((id) => t.tasks.some((task) => task.id === id))
          .map((taskId) => ({
            taskId,
            isCorrect: true,
            createdAt: new Date(0),
          })),
        revealedTaskIds: [],
      }),
    );
    return {
      userId: u.id,
      displayLabel: (u.displayName?.trim() || u.login).trim(),
      totalXp: u.totalXp,
      uniqueTasksSolved: countUniqueSolvedInBank(topicRows),
      topicsComplete: countTopicsComplete(topicRows),
    };
  });

  return rankFamilyMembers(members, currentUserId);
}
