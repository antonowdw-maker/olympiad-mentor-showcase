/**
 * Резолв instance для user×task (12a + 13).
 * По умолчанию липкий последний показ; новый — только при forceNew («Другой вариант»).
 * После верного ответа остаёмся на том же варианте (revalidate не срывает sticky).
 * При выборе *нового* показа в обучении/тесте предпочитаем instance без верного Attempt.
 */
import { prisma } from "@/lib/db";
import {
  pickTaskInstance,
  pickUnsolvedTaskInstance,
  shouldStickInLearnMode,
  shouldStickToCurrentInstance,
} from "@/lib/content/instance-select";
import {
  BLOCK_MODE_LEARN,
  BLOCK_MODE_TEST,
  type BlockMode,
} from "@/lib/modes/block-mode";
import { clampOpenedCount, nextOpenedCount } from "@/lib/trainer/hints";

export type ResolvedTaskInstance = {
  id: string;
  slug: string;
  order: number;
  /** Своё название варианта; null — показываем название канона. */
  title: string | null;
  statement: string;
  acceptedAnswers: string;
  options: string | null;
  hintSteps: string;
  openedCount: number;
};

export type ResolveTaskInstanceOptions = {
  /** Явный запрос следующего изоморфа (кнопка «Другой вариант»). */
  forceNew?: boolean;
  /** Режим блока (13): влияет на анти-повтор верных instance. */
  mode?: BlockMode;
  /**
   * PPV-02: с плана — не липнуть к instance, решённому до этого момента
   * (создание пакета плана), и выбрать нерешённый. Решённый позже — в т.ч. только что,
   * при revalidate после «Проверить» — остаётся (дальше — кнопка «Другой вариант»).
   */
  unstickIfSolvedBefore?: Date;
};

/** Время последнего верного Attempt по instance (null — верных нет). */
async function loadLastCorrectAt(userId: string, instanceId: string): Promise<Date | null> {
  const row = await prisma.attempt.findFirst({
    where: { userId, isCorrect: true, taskInstanceId: instanceId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

async function loadCorrectlySolvedInstanceIds(
  userId: string,
  instanceIds: string[],
): Promise<Set<string>> {
  if (instanceIds.length === 0) return new Set();
  const rows = await prisma.attempt.findMany({
    where: {
      userId,
      isCorrect: true,
      taskInstanceId: { in: instanceIds },
    },
    select: { taskInstanceId: true },
  });
  return new Set(
    rows.map((r) => r.taskInstanceId).filter((id): id is string => Boolean(id)),
  );
}

/**
 * Если у задачи нет instance — null (использовать поля Task).
 * Для гостя (без userId) — первый по order, без записи показа.
 */
export async function resolveTaskInstance(
  taskId: string,
  userId: string | null | undefined,
  opts?: ResolveTaskInstanceOptions,
): Promise<ResolvedTaskInstance | null> {
  const forceNew = Boolean(opts?.forceNew);
  const mode = opts?.mode ?? BLOCK_MODE_LEARN;

  const instances = await prisma.taskInstance.findMany({
    where: { taskId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      slug: true,
      order: true,
      title: true,
      statement: true,
      acceptedAnswers: true,
      options: true,
      hintSteps: true,
    },
  });
  if (instances.length === 0) return null;

  if (!userId) {
    const first = instances[0]!;
    return { ...first, openedCount: 0 };
  }

  const shows = await prisma.userTaskInstanceShow.findMany({
    where: {
      userId,
      taskInstanceId: { in: instances.map((i) => i.id) },
    },
    orderBy: [{ shownAt: "desc" }, { id: "desc" }],
    select: { taskInstanceId: true, shownAt: true, openedCount: true },
  });

  const lastShownId = shows[0]?.taskInstanceId ?? null;
  const refs = instances.map((i) => ({ id: i.id, order: i.order }));
  const shownIds = shows.map((s) => s.taskInstanceId);

  const correctlySolved =
    mode === BLOCK_MODE_LEARN || mode === BLOCK_MODE_TEST
      ? await loadCorrectlySolvedInstanceIds(
          userId,
          instances.map((i) => i.id),
        )
      : new Set<string>();

  const preferUnsolved = mode === BLOCK_MODE_LEARN || mode === BLOCK_MODE_TEST;

  if (preferUnsolved) {
    const openExists = instances.some((i) => !correctlySolved.has(i.id));
    const since = opts?.unstickIfSolvedBefore;
    let solvedBeforeSince = false;
    if (since && lastShownId && correctlySolved.has(lastShownId) && openExists) {
      const lastCorrectAt = await loadLastCorrectAt(userId, lastShownId);
      solvedBeforeSince = lastCorrectAt !== null && lastCorrectAt < since;
    }
    if (
      shouldStickInLearnMode(lastShownId, forceNew, correctlySolved, {
        unstickIfSolvedAndOpenExists: solvedBeforeSince,
        openInstanceExists: openExists,
      })
    ) {
      const row = instances.find((i) => i.id === lastShownId);
      if (row) {
        const show = shows.find((s) => s.taskInstanceId === lastShownId);
        return { ...row, openedCount: show?.openedCount ?? 0 };
      }
    }
  } else if (shouldStickToCurrentInstance(lastShownId, forceNew)) {
    const row = instances.find((i) => i.id === lastShownId);
    if (row) {
      const show = shows.find((s) => s.taskInstanceId === lastShownId);
      return { ...row, openedCount: show?.openedCount ?? 0 };
    }
  }

  let picked = preferUnsolved
    ? pickUnsolvedTaskInstance(refs, shownIds, lastShownId, correctlySolved)
    : pickTaskInstance(refs, shownIds, lastShownId);

  // Обучение: если все варианты уже верны — цикл по пулу (как раньше).
  // Тест: не подставляем «зазубренный» — null (страница/план не должны сюда попасть).
  if (!picked && preferUnsolved && mode === BLOCK_MODE_LEARN) {
    picked = pickTaskInstance(refs, shownIds, lastShownId);
  }
  if (!picked) return null;

  const row = instances.find((i) => i.id === picked!.id)!;
  const upserted = await prisma.userTaskInstanceShow.upsert({
    where: {
      userId_taskInstanceId: { userId, taskInstanceId: row.id },
    },
    create: {
      userId,
      taskInstanceId: row.id,
      openedCount: 0,
      enteredViaOtherVariant: forceNew,
    },
    update: {
      shownAt: new Date(),
      openedCount: 0,
      // Повторный показ через «Другой вариант» снова ставит замок.
      ...(forceNew ? { enteredViaOtherVariant: true } : {}),
    },
    select: { openedCount: true },
  });

  return { ...row, openedCount: upserted.openedCount };
}

/** Instance ids канона с верным Attempt у user. */
export async function getCorrectlySolvedInstanceIdsForTask(
  userId: string,
  taskId: string,
): Promise<Set<string>> {
  const instances = await prisma.taskInstance.findMany({
    where: { taskId },
    select: { id: true },
  });
  return loadCorrectlySolvedInstanceIds(
    userId,
    instances.map((i) => i.id),
  );
}

/**
 * Канон тестопригоден: есть пул ≥2 (или ≥1) instance без верного Attempt.
 * Без пула — не берём в тест (нельзя «другие данные»).
 */
export async function isTaskTestable(userId: string, taskId: string): Promise<boolean> {
  const instances = await prisma.taskInstance.findMany({
    where: { taskId },
    select: { id: true },
  });
  if (instances.length < 2) return false;
  const solved = await loadCorrectlySolvedInstanceIds(
    userId,
    instances.map((i) => i.id),
  );
  return instances.some((i) => !solved.has(i.id));
}

export async function filterTestableTaskIds(
  userId: string,
  taskRows: { id: string; slug: string }[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const t of taskRows) {
    if (await isTaskTestable(userId, t.id)) out.add(t.slug);
  }
  return out;
}

export async function countTaskInstances(taskId: string): Promise<number> {
  return prisma.taskInstance.count({ where: { taskId } });
}

export async function getInstanceHintsOpenedCount(
  userId: string,
  taskInstanceId: string,
): Promise<number> {
  const row = await prisma.userTaskInstanceShow.findUnique({
    where: { userId_taskInstanceId: { userId, taskInstanceId } },
    select: { openedCount: true },
  });
  return row?.openedCount ?? 0;
}

export async function openNextInstanceHintStep(
  userId: string,
  taskInstanceId: string,
  totalSteps: number,
): Promise<{ openedCount: number; advanced: boolean }> {
  const current = await getInstanceHintsOpenedCount(userId, taskInstanceId);
  const { opened, advanced } = nextOpenedCount(current, totalSteps);
  if (!advanced) {
    return { openedCount: clampOpenedCount(current, totalSteps), advanced: false };
  }

  await prisma.userTaskInstanceShow.upsert({
    where: { userId_taskInstanceId: { userId, taskInstanceId } },
    create: { userId, taskInstanceId, openedCount: opened },
    update: { openedCount: opened },
  });

  return { openedCount: opened, advanced: true };
}
