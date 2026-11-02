/**
 * Iter 14: агрегация личной статистики и семейного рейтинга (чистые правила).
 * «Время» = Σ estMinutes уникально решённых канонов + число календарных дней с Attempt.
 */
import { calculateTopicProgress, isTopicCompleted } from "@/lib/progress/calculate";
import { estMinutesForGrade, parseOlympiadGrade } from "@/lib/content/grade";
import { SESSION_REINFORCED_BADGE_PREFIX } from "@/lib/progress/xp";

export type StatsTask = {
  id: string;
  /** Olympiad grade raw из БД */
  grade: string;
};

export type StatsAttempt = {
  taskId: string;
  isCorrect: boolean;
  /** ISO или Date — для дней активности */
  createdAt: Date | string;
};

export type TopicStatsSource = {
  topicSlug: string;
  topicTitle: string;
  topicOrder: number;
  tasks: StatsTask[];
  attempts: StatsAttempt[];
  /** Уникальные taskId с reveal (TaskReveal или instance→task) */
  revealedTaskIds: string[];
};

export type TopicStatsRow = {
  topicSlug: string;
  topicTitle: string;
  topicOrder: number;
  totalTasks: number;
  solvedTasks: number;
  percent: number;
  wrongAttempts: number;
  revealedTasks: number;
  /** Σ estMinutes по уникально решённым канонам */
  estimatedMinutes: number;
};

export type PersonalStatsSummary = {
  totalXp: number;
  uniqueTasksSolved: number;
  activeDays: number;
  reinforceCompletions: number;
  topics: TopicStatsRow[];
  /** Завершённые закрепления с wall-clock (P-TIMER). */
  reinforceRuns: ReinforceRunStatsRow[];
};

export type ReinforceRunStatsRow = {
  sessionId: string;
  /** Тема / «Разные темы» / «Собранное обучение» */
  scopeLabel: string;
  packageSeq: number;
  /** ISO completedAt */
  completedAt: string;
  durationSec: number | null;
  passed: boolean;
  score: number;
  maxScore: number;
};

export type FamilyRankInput = {
  userId: string;
  displayLabel: string;
  totalXp: number;
  uniqueTasksSolved: number;
  topicsComplete: number;
};

export type FamilyRankRow = FamilyRankInput & {
  rank: number;
  isCurrent: boolean;
};

/** Календарный день UTC YYYY-MM-DD (стабильно в unit). */
export function attemptDayKey(createdAt: Date | string): string {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return d.toISOString().slice(0, 10);
}

/** Число уникальных календарных дней с ≥1 Attempt. */
export function countActiveDays(attempts: { createdAt: Date | string }[]): number {
  const days = new Set<string>();
  for (const a of attempts) {
    days.add(attemptDayKey(a.createdAt));
  }
  return days.size;
}

export function buildTopicStatsRow(src: TopicStatsSource): TopicStatsRow {
  const taskIds = src.tasks.map((t) => t.id);
  const taskIdSet = new Set(taskIds);
  const solvedIds = [
    ...new Set(
      src.attempts
        .filter((a) => a.isCorrect && taskIdSet.has(a.taskId))
        .map((a) => a.taskId),
    ),
  ];
  const progress = calculateTopicProgress({
    totalTasks: taskIds.length,
    solvedTaskIds: solvedIds,
  });

  let wrongAttempts = 0;
  for (const a of src.attempts) {
    if (!a.isCorrect && taskIdSet.has(a.taskId)) wrongAttempts += 1;
  }

  const revealedInTopic = new Set(
    src.revealedTaskIds.filter((id) => taskIdSet.has(id)),
  );

  const gradeById = new Map(src.tasks.map((t) => [t.id, t.grade]));
  let estimatedMinutes = 0;
  for (const id of solvedIds) {
    const g = parseOlympiadGrade(gradeById.get(id) ?? "") ?? "mid";
    estimatedMinutes += estMinutesForGrade(g);
  }

  return {
    topicSlug: src.topicSlug,
    topicTitle: src.topicTitle,
    topicOrder: src.topicOrder,
    totalTasks: progress.totalTasks,
    solvedTasks: progress.solvedTasks,
    percent: progress.percent,
    wrongAttempts,
    revealedTasks: revealedInTopic.size,
    estimatedMinutes,
  };
}

export function buildPersonalStats(input: {
  totalXp: number;
  topics: TopicStatsSource[];
  /** Все Attempt пользователя (для activeDays), не только по одной теме */
  allAttempts: { createdAt: Date | string }[];
  badgeCodes: string[];
  reinforceRuns?: ReinforceRunStatsRow[];
}): PersonalStatsSummary {
  const topics = [...input.topics]
    .map(buildTopicStatsRow)
    .sort((a, b) => a.topicOrder - b.topicOrder || a.topicSlug.localeCompare(b.topicSlug));

  const uniqueTasksSolved = countUniqueSolvedInBank(topics);
  const reinforceCompletions = input.badgeCodes.filter((c) =>
    c.startsWith(SESSION_REINFORCED_BADGE_PREFIX),
  ).length;

  return {
    totalXp: Math.max(0, Math.floor(input.totalXp)),
    uniqueTasksSolved,
    activeDays: countActiveDays(input.allAttempts),
    reinforceCompletions,
    topics,
    reinforceRuns: input.reinforceRuns ?? [],
  };
}

/**
 * Рейтинг: XP ↓, затем uniqueTasksSolved ↓, затем userId.
 * rank — 1-based плотный по порядку после сортировки.
 */
export function rankFamilyMembers(
  members: FamilyRankInput[],
  currentUserId: string,
): FamilyRankRow[] {
  const sorted = [...members].sort((a, b) => {
    if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
    if (b.uniqueTasksSolved !== a.uniqueTasksSolved) {
      return b.uniqueTasksSolved - a.uniqueTasksSolved;
    }
    return a.userId.localeCompare(b.userId);
  });

  return sorted.map((m, i) => ({
    ...m,
    rank: i + 1,
    isCurrent: m.userId === currentUserId,
  }));
}

/** Сколько тем пройдено (REQ-PRG-04): все каноны решены. */
export function countTopicsComplete(
  topicRows: { percent?: number; totalTasks: number; solvedTasks?: number }[],
): number {
  return topicRows.filter((t) => {
    if (typeof t.solvedTasks === "number") {
      return isTopicCompleted({ totalTasks: t.totalTasks, solvedTasks: t.solvedTasks });
    }
    // Фоллбэк для старых вызовов со сводкой percent === 100.
    return t.totalTasks > 0 && t.percent === 100;
  }).length;
}

/**
 * Уникально решённые каноны **только в текущем банке тем** (сумма solvedTasks по темам).
 * Не считать «голые» Attempt по удалённым taskId — иначе сводка и семья разъедутся (I14-01).
 */
export function countUniqueSolvedInBank(topicRows: { solvedTasks: number }[]): number {
  return topicRows.reduce((s, t) => s + t.solvedTasks, 0);
}
