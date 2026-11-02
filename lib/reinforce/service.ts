/**
 * Сессия закрепления: старт / ответ / skip (iter 13B).
 * Награда — awardReinforceSessionReward (13C).
 */
import { prisma } from "@/lib/db";
import { getCorrectlySolvedInstanceIdsForTask } from "@/lib/content/instance-resolve";
import { pickUnsolvedTaskInstance } from "@/lib/content/instance-select";
import type { PlanItem } from "@/lib/plan/build";
import { getSolvedTaskSlugsForTopicSlugs } from "@/lib/plan/service";
import { collectTopicSlugsFromPlanItems } from "@/lib/plan/learn-session";
import { isAnswerCorrect } from "@/lib/trainer/answer";
import { isTableAnswerComplete, parseAnswerTableJson } from "@/lib/content/answer-table";
import type { AnswerTable } from "@/lib/content/schemas";
import { awardReinforceSessionReward, awardReinforceSessionRewardInTx, type ReinforceAwardResult } from "@/lib/reinforce/award";
import { isPrismaUniqueConflict } from "@/lib/progress/award";
import {
  canStartReinforceForPackage,
  findCurrentReinforceItemIndex,
  isReinforceSessionFullyAnswered,
  taskSlugsFromLearnPackage,
  type ReinforceSessionStatus,
} from "@/lib/reinforce/rules";
import {
  scoreReinforceSession,
  type ReinforcePassSummary,
} from "@/lib/reinforce/pass";
import type { OlympiadGrade } from "@/lib/content/grade";
import { parseOlympiadGrade } from "@/lib/content/grade";
import { resolveReinforceDurationSec } from "@/lib/reinforce/timer";

function parsePackageItems(raw: string): PlanItem[] {
  try {
    return JSON.parse(raw) as PlanItem[];
  } catch {
    return [];
  }
}

export type ReinforceQuestionDto = {
  ord: number;
  total: number;
  itemId: string;
  taskSlug: string;
  topicSlug: string;
  title: string;
  statement: string;
  answerType: string;
  options: string[] | null;
  /** Описание таблицы без эталона (answerType table), иначе null. */
  table: AnswerTable | null;
  taskInstanceId: string;
  answered: boolean;
  isCorrect: boolean | null;
  /** Олимпиадный грейд канона (для баллов MODE-09). */
  grade: OlympiadGrade | null;
};

export type ReinforceSessionDto = {
  id: string;
  status: ReinforceSessionStatus;
  sourcePackageId: string;
  packageSeq: number;
  questions: ReinforceQuestionDto[];
  currentOrd: number | null;
  reward: ReinforceAwardResult | null;
  /** Итог порога после полного ответа / на completed. */
  pass: ReinforcePassSummary | null;
  /** ISO старта таймера (createdAt сессии). */
  startedAt: string;
  /** Секунды wall-clock после завершения; null пока active / skipped. */
  durationSec: number | null;
};

async function pickInstanceForTask(
  userId: string,
  taskId: string,
): Promise<{ id: string } | null> {
  const instances = await prisma.taskInstance.findMany({
    where: { taskId },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });
  if (instances.length < 2) return null;
  const solved = await getCorrectlySolvedInstanceIdsForTask(userId, taskId);
  const shows = await prisma.userTaskInstanceShow.findMany({
    where: { userId, taskInstanceId: { in: instances.map((i) => i.id) } },
    orderBy: { shownAt: "desc" },
    select: { taskInstanceId: true },
  });
  const shownIds = shows.map((s) => s.taskInstanceId);
  const last = shownIds[0] ?? null;
  const picked = pickUnsolvedTaskInstance(instances, shownIds, last, solved);
  return picked ? { id: picked.id } : null;
}

/**
 * Создать или вернуть active-сессию по пройденному пакету.
 */
export async function startReinforceSession(
  userId: string,
  sourcePackageId: string,
): Promise<ReinforceSessionDto> {
  const pkg = await prisma.dayPlanPackage.findFirst({
    where: { id: sourcePackageId, userId },
  });
  if (!pkg) throw new Error("PACKAGE_NOT_FOUND");
  if (pkg.status !== "normal") throw new Error("PACKAGE_NOT_LEARN");

  const items = parsePackageItems(pkg.items);
  const topicSlugs = collectTopicSlugsFromPlanItems(items);
  const solved = await getSolvedTaskSlugsForTopicSlugs(userId, topicSlugs);

  const existing = await prisma.reinforceSession.findUnique({
    where: {
      userId_sourcePackageId: { userId, sourcePackageId },
    },
    include: { items: { orderBy: { ord: "asc" } } },
  });

  const gate = canStartReinforceForPackage(
    items,
    solved,
    existing ? (existing.status as ReinforceSessionStatus) : null,
  );
  if (!gate.ok) {
    if (existing?.status === "active") {
      return loadSessionDto(existing.id);
    }
    if (gate.reason === "ALREADY_DONE" && existing) {
      return loadSessionDto(existing.id);
    }
    throw new Error(gate.reason);
  }

  if (existing?.status === "active") {
    return loadSessionDto(existing.id);
  }

  const taskSlugs = taskSlugsFromLearnPackage(items);
  const tasks = await prisma.task.findMany({
    where: { slug: { in: taskSlugs } },
    select: {
      id: true,
      slug: true,
      title: true,
      topic: { select: { slug: true } },
    },
  });
  const bySlug = new Map(tasks.map((t) => [t.slug, t]));

  const chosen: { taskId: string; taskInstanceId: string; slug: string }[] = [];
  for (const slug of taskSlugs) {
    const t = bySlug.get(slug);
    if (!t) continue;
    const inst = await pickInstanceForTask(userId, t.id);
    if (!inst) continue;
    chosen.push({ taskId: t.id, taskInstanceId: inst.id, slug });
  }
  if (chosen.length === 0) {
    throw new Error("NO_TESTABLE_TASKS");
  }

  let sessionId: string;
  try {
    const session = await prisma.reinforceSession.create({
      data: {
        userId,
        sourcePackageId,
        status: "active",
        items: {
          create: chosen.map((c, ord) => ({
            taskId: c.taskId,
            taskInstanceId: c.taskInstanceId,
            ord,
          })),
        },
      },
    });
    sessionId = session.id;
  } catch (e) {
    // I13BC-03: гонка двух start → unique user×пакет
    if (!isPrismaUniqueConflict(e)) throw e;
    const raced = await prisma.reinforceSession.findUnique({
      where: { userId_sourcePackageId: { userId, sourcePackageId } },
      select: { id: true },
    });
    if (!raced) throw e;
    return loadSessionDto(raced.id);
  }

  // Зафиксировать показ выбранных instance (анти-повтор)
  for (const c of chosen) {
    await prisma.userTaskInstanceShow.upsert({
      where: {
        userId_taskInstanceId: { userId, taskInstanceId: c.taskInstanceId },
      },
      create: { userId, taskInstanceId: c.taskInstanceId, openedCount: 0 },
      update: { shownAt: new Date() },
    });
  }

  return loadSessionDto(sessionId);
}

export async function skipReinforceSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const session = await prisma.reinforceSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "active") return;
  await prisma.reinforceSession.update({
    where: { id: sessionId },
    data: { status: "skipped", completedAt: new Date() },
  });
}

/** «Позже» до старта — без сессии; после старта вызывают skipReinforceSession. */
export async function getReinforceSessionForUser(
  userId: string,
  sessionId: string,
): Promise<ReinforceSessionDto> {
  const session = await prisma.reinforceSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  return loadSessionDto(session.id);
}

export async function submitReinforceAnswer(input: {
  userId: string;
  sessionId: string;
  itemId: string;
  answer: string;
}): Promise<{
  isCorrect: boolean;
  session: ReinforceSessionDto;
  reward: ReinforceAwardResult | null;
}> {
  const { isCorrect, reward } = await prisma.$transaction(async (tx) => {
    const session = await tx.reinforceSession.findFirst({
      where: { id: input.sessionId, userId: input.userId },
      include: {
        items: { orderBy: { ord: "asc" } },
      },
    });
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_NOT_ACTIVE");

    const item = session.items.find((i) => i.id === input.itemId);
    if (!item) throw new Error("ITEM_NOT_FOUND");
    if (item.answeredAt) throw new Error("ALREADY_ANSWERED");

    const currentIdx = findCurrentReinforceItemIndex(session.items);
    if (currentIdx === null || session.items[currentIdx]?.id !== item.id) {
      throw new Error("NOT_CURRENT_ITEM");
    }

    const inst = await tx.taskInstance.findUnique({
      where: { id: item.taskInstanceId },
      include: {
        task: {
          select: {
            id: true,
            slug: true,
            answerType: true,
            acceptedAnswers: true,
            options: true,
          },
        },
      },
    });
    if (!inst) throw new Error("INSTANCE_NOT_FOUND");

    let accepted: string[];
    try {
      accepted = JSON.parse(inst.acceptedAnswers) as string[];
    } catch {
      throw new Error("BAD_CONTENT");
    }

    // Таблица заполнена не целиком — не тратим единственную попытку закрепления
    if (inst.task.answerType === "table") {
      const table = parseAnswerTableJson(inst.options ?? inst.task.options);
      if (!table) throw new Error("BAD_CONTENT");
      if (!isTableAnswerComplete(input.answer, table)) throw new Error("TABLE_INCOMPLETE");
    }

    const correct = isAnswerCorrect(input.answer, accepted, inst.task.answerType);

    const attempt = await tx.attempt.create({
      data: {
        userId: input.userId,
        taskId: item.taskId,
        taskInstanceId: item.taskInstanceId,
        submittedAnswer: input.answer.trim(),
        isCorrect: correct,
        hintsOpenedCount: 0,
        solutionRevealed: false,
      },
    });

    await tx.reinforceSessionItem.update({
      where: { id: item.id },
      data: {
        answeredAt: new Date(),
        attemptId: attempt.id,
        isCorrect: correct,
      },
    });

    const refreshed = await tx.reinforceSessionItem.findMany({
      where: { sessionId: session.id },
      orderBy: { ord: "asc" },
      select: { answeredAt: true, isCorrect: true },
    });

    // I13BC-01: последний ответ и award в одной tx
    let reward: ReinforceAwardResult | null = null;
    if (isReinforceSessionFullyAnswered(refreshed)) {
      reward = await awardReinforceSessionRewardInTx(tx, {
        userId: input.userId,
        sessionId: session.id,
        sourcePackageId: session.sourcePackageId,
      });
    }

    return { isCorrect: correct, reward };
  });

  const dto = await loadSessionDto(input.sessionId);
  return { isCorrect, session: dto, reward };
}
async function loadSessionDto(sessionId: string): Promise<ReinforceSessionDto> {
  let session = await prisma.reinforceSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      sourcePackage: { select: { id: true, seq: true } },
      items: {
        orderBy: { ord: "asc" },
      },
    },
  });

  // I13BC-01 recovery: все отвечены, active → complete (+ награда при passed MODE-09)
  if (
    session.status === "active" &&
    !session.rewardGrantedAt &&
    isReinforceSessionFullyAnswered(session.items)
  ) {
    await awardReinforceSessionReward({
      userId: session.userId,
      sessionId: session.id,
      sourcePackageId: session.sourcePackageId,
    });
    session = await prisma.reinforceSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        sourcePackage: { select: { id: true, seq: true } },
        items: { orderBy: { ord: "asc" } },
      },
    });
  }

  const instanceIds = session.items.map((i) => i.taskInstanceId);
  const instances = await prisma.taskInstance.findMany({
    where: { id: { in: instanceIds } },
    include: {
      task: {
          select: {
            slug: true,
            title: true,
            answerType: true,
            options: true,
            grade: true,
            topic: { select: { slug: true } },
          },
        },
    },
  });
  const byInst = new Map(instances.map((i) => [i.id, i]));

  const currentOrd = findCurrentReinforceItemIndex(session.items);
  // На итоговом экране (все отвечены) показываем все формулировки
  const revealAll =
    session.status === "completed" ||
    session.status === "skipped" ||
    currentOrd === null;

  const questions: ReinforceQuestionDto[] = session.items.map((item) => {
    const inst = byInst.get(item.taskInstanceId);
    const reveal =
      revealAll || Boolean(item.answeredAt) || item.ord === currentOrd;

    let options: string[] | null = null;
    let table: AnswerTable | null = null;
    if (reveal && inst?.task.answerType === "table") {
      // Колонка options у таблицы — JSON описания таблицы (свой у варианта или канона)
      table = parseAnswerTableJson(inst.options ?? inst.task.options);
    } else if (reveal) {
      if (inst?.options) {
        try {
          options = JSON.parse(inst.options) as string[];
        } catch {
          options = null;
        }
      } else if (inst?.task.options) {
        try {
          options = JSON.parse(inst.task.options) as string[];
        } catch {
          options = null;
        }
      }
    }

    return {
      ord: item.ord,
      total: session.items.length,
      itemId: item.id,
      taskSlug: inst?.task.slug ?? "",
      topicSlug: inst?.task.topic.slug ?? "",
      title: inst?.title ?? inst?.task.title ?? "",
      // I13BC-07: будущие вопросы без statement/options
      statement: reveal ? (inst?.statement ?? "") : "",
      answerType: inst?.task.answerType ?? "text",
      options,
      table,
      taskInstanceId: item.taskInstanceId,
      answered: Boolean(item.answeredAt),
      isCorrect: item.isCorrect,
      grade: inst?.task.grade ? parseOlympiadGrade(inst.task.grade) : null,
    };
  });

  const passItems = session.items.map((item) => {
    const inst = byInst.get(item.taskInstanceId);
    return {
      answeredAt: item.answeredAt,
      isCorrect: item.isCorrect,
      grade: inst?.task.grade ?? "mid",
    };
  });
  const pass = isReinforceSessionFullyAnswered(session.items)
    ? scoreReinforceSession(passItems)
    : null;

  let reward: ReinforceAwardResult | null = null;
  if (session.rewardGrantedAt) {
    const u = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { totalXp: true },
    });
    reward = {
      xpGained: 0,
      totalXp: u?.totalXp ?? 0,
      badge: null,
      completed: true,
      rewarded: false,
      pass,
    };
  }

  return {
    id: session.id,
    status: session.status as ReinforceSessionStatus,
    sourcePackageId: session.sourcePackageId,
    packageSeq: session.sourcePackage.seq,
    questions,
    currentOrd,
    reward,
    pass,
    startedAt: session.createdAt.toISOString(),
    durationSec: resolveReinforceDurationSec({
      // старый Prisma Client может не отдавать поле — фолбэк по датам
      durationSec:
        "durationSec" in session
          ? (session as { durationSec?: number | null }).durationSec
          : null,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      status: session.status,
    }),
  };
}

/** Есть ли незавершённая/готовая сессия для пакета (скрытие CTA). */
export async function getReinforceSessionMeta(
  userId: string,
  sourcePackageId: string,
): Promise<{ status: ReinforceSessionStatus; sessionId: string } | null> {
  const row = await prisma.reinforceSession.findUnique({
    where: { userId_sourcePackageId: { userId, sourcePackageId } },
    select: { id: true, status: true },
  });
  if (!row) return null;
  return { status: row.status as ReinforceSessionStatus, sessionId: row.id };
}
