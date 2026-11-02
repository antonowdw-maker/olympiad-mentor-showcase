/**
 * Сессии наставника: уникальность через scopeKey (BC-02).
 * `task:<taskId>` | `task:<taskId>:inst:<instanceId>` | `topic:<topicId>` —
 * SQLite unique([userId, scopeKey]) реально схлопывает гонки.
 * История по instance разделена (I12A-01).
 */
import { prisma } from "@/lib/db";

export function mentorTaskScopeKey(
  taskId: string,
  instanceId?: string | null,
): string {
  if (instanceId) return `task:${taskId}:inst:${instanceId}`;
  return `task:${taskId}`;
}

export function mentorTopicScopeKey(topicId: string): string {
  return `topic:${topicId}`;
}

/** Найти или создать сессию чата по теме (без задачи). */
export async function getOrCreateTopicMentorSession(
  userId: string,
  topicId: string,
): Promise<{ id: string }> {
  const scopeKey = mentorTopicScopeKey(topicId);
  return prisma.mentorSession.upsert({
    where: { userId_scopeKey: { userId, scopeKey } },
    create: { userId, topicId, taskId: null, scopeKey },
    update: {},
    select: { id: true },
  });
}

/** Найти или создать сессию чата по задаче (и опционально по instance). */
export async function getOrCreateTaskMentorSession(
  userId: string,
  taskId: string,
  topicId: string,
  instanceId?: string | null,
): Promise<{ id: string }> {
  const scopeKey = mentorTaskScopeKey(taskId, instanceId);
  return prisma.mentorSession.upsert({
    where: { userId_scopeKey: { userId, scopeKey } },
    create: { userId, taskId, topicId, scopeKey },
    update: {},
    select: { id: true },
  });
}

/**
 * История для промпта: последние N сообщений + полный счётчик user-ходов (BC-03).
 * Лимит MENTOR_LLM_MAX_TURNS не зависит от take истории.
 */
export async function loadMentorPromptHistory(
  sessionId: string,
  historyLimit = 40,
): Promise<{
  userTurns: number;
  history: { role: "user" | "assistant"; body: string }[];
}> {
  const [userTurns, recent] = await Promise.all([
    prisma.mentorMessage.count({
      where: { sessionId, role: "user" },
    }),
    prisma.mentorMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: historyLimit,
      select: { role: true, body: true },
    }),
  ]);

  const chronological = [...recent].reverse();
  return {
    userTurns,
    history: chronological.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      body: m.body,
    })),
  };
}

/**
 * Парсинг acceptedAnswers задач темы: fail closed при битом JSON (BC-01).
 */
export function parseTopicAnswerGroups(
  tasks: { acceptedAnswers: string }[],
): { ok: true; groups: string[][] } | { ok: false; error: string } {
  const groups: string[][] = [];
  for (const t of tasks) {
    try {
      const arr = JSON.parse(t.acceptedAnswers) as unknown;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string")) {
        return { ok: false, error: "Ошибка контента задач темы" };
      }
      const strings = (arr as string[]).map((s) => s.trim()).filter(Boolean);
      if (strings.length === 0) {
        return { ok: false, error: "Ошибка контента задач темы" };
      }
      groups.push(strings);
    } catch {
      return { ok: false, error: "Ошибка контента задач темы" };
    }
  }
  return { ok: true, groups };
}
