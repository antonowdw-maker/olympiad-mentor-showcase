/**
 * Загрузка / создание пакетов плана дня (сервер; Prisma).
 *
 * ensureDayPlanForToday намеренно пишет в БД на GET (/plan и тизер):
 * первый заход за день создаёт пакет (в т.ч. theme_closed при закрытой теме).
 * Зафиксировано в SRS (REQ-PLN-03 / PT-07): материализация при просмотре — осознанное поведение.
 *
 * Iter 10c: область = scopeKey (`topic:<slug>` | `mixed`).
 * Iter 13A: ручной сбор — отдельный `scopeKey=gather` (не через ensureDayPlanForToday).
 */
import { listPlanTopicChoices } from "@/lib/plan/topic-choices";
import { prisma } from "@/lib/db";
import { assertUserExists, isPrismaForeignKeyError } from "@/lib/auth/resolve-user";
import { parseOlympiadGrade } from "@/lib/content/grade";
import { filterTestableTaskIds } from "@/lib/content/instance-resolve";
import {
  allOfferedTasksSolved,
  buildDayPlanPackage,
  buildTestDayPlanPackage,
  canRequestNewPackage,
  collectOfferedTaskSlugs,
  countAvailableTasks,
  countAvailableTestTasks,
  resolveCurrentPackage,
  type DayPlanPackageStatus,
  type PlanArticleCandidate,
  type PlanItem,
  type PlanTaskCandidate,
} from "@/lib/plan/build";
import { exhaustedTaskSlugsFromPool } from "@/lib/plan/exhausted";
import { calendarDateInTz } from "@/lib/plan/date";
import {
  PLAN_SCOPE_MIXED,
  isMixedPlanScope,
  planSelectionToScopeKey,
  topicScopeKey,
} from "@/lib/plan/scope";
import {
  BLOCK_MODE_LEARN,
  BLOCK_MODE_TEST,
  planScopeKeyForMode,
  type BlockMode,
} from "@/lib/modes/block-mode";
import {
  collectTopicSlugsFromPlanItems,
  isGatherPlanScope,
  PLAN_SCOPE_GATHER,
} from "@/lib/plan/learn-session";
import { findPlanTaskNeighbors, planTaskHref } from "@/lib/plan/package-nav";

export type DayPlanPackageDto = {
  id: string;
  seq: number;
  date: string;
  status: DayPlanPackageStatus;
  items: PlanItem[];
  totalMinutes: number;
  createdAt: string;
  scopeKey: string;
};

function parseItems(raw: string): PlanItem[] {
  try {
    const items = JSON.parse(raw) as PlanItem[];
    // Старые пакеты без topicSlug — не ломаем ссылки: подставим позже по scope
    return items;
  } catch {
    return [];
  }
}

/** Дописать topicSlug в элементы старых пакетов (до 10c). */
function hydrateItemsTopicSlug(items: PlanItem[], fallbackTopicSlug: string): PlanItem[] {
  return items.map((it) => ({
    ...it,
    topicSlug: it.topicSlug?.trim() || fallbackTopicSlug,
  }));
}

function toDto(
  row: {
    id: string;
    seq: number;
    date: string;
    status: string;
    items: string;
    createdAt: Date;
    scopeKey: string;
  },
  fallbackTopicSlug: string,
): DayPlanPackageDto {
  const items = hydrateItemsTopicSlug(parseItems(row.items), fallbackTopicSlug);
  return {
    id: row.id,
    seq: row.seq,
    date: row.date,
    status: row.status as DayPlanPackageStatus,
    items,
    totalMinutes: items.reduce((s, i) => s + i.estMinutes, 0),
    createdAt: row.createdAt.toISOString(),
    scopeKey: row.scopeKey || topicScopeKey(fallbackTopicSlug),
  };
}

type TopicBundle = {
  id: string;
  slug: string;
  order: number;
  tasks: {
    slug: string;
    title: string;
    order: number;
    relatedDocSlugs: string;
    grade: string;
  }[];
  articles: { slug: string; title: string; order: number }[];
};

async function loadTopicBundle(topicSlug: string): Promise<TopicBundle | null> {
  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    include: {
      tasks: {
        orderBy: { order: "asc" },
        select: {
          slug: true,
          title: true,
          order: true,
          relatedDocSlugs: true,
          grade: true,
        },
      },
      articles: {
        orderBy: { order: "asc" },
        select: { slug: true, title: true, order: true },
      },
    },
  });
  if (!topic) return null;
  return topic;
}

/** Открытые темы (есть задачи и не все решены) — пул для mixed. */
async function loadOpenTopicBundles(userId: string): Promise<TopicBundle[]> {
  const choices = await listPlanTopicChoices(userId);
  const openSlugs = choices.filter((c) => c.hasUnsolved).map((c) => c.slug);
  if (openSlugs.length === 0) return [];

  const topics = await prisma.topic.findMany({
    where: { slug: { in: openSlugs } },
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    include: {
      tasks: {
        orderBy: { order: "asc" },
        select: {
          slug: true,
          title: true,
          order: true,
          relatedDocSlugs: true,
          grade: true,
        },
      },
      articles: {
        orderBy: { order: "asc" },
        select: { slug: true, title: true, order: true },
      },
    },
  });
  return topics;
}

function taskCandidates(
  tasks: {
    slug: string;
    title: string;
    order: number;
    relatedDocSlugs: string;
    grade: string;
  }[],
  topicSlug: string,
): PlanTaskCandidate[] {
  return tasks.map((t) => {
    let related: string[] = [];
    try {
      related = JSON.parse(t.relatedDocSlugs) as string[];
    } catch {
      related = [];
    }
    const grade = parseOlympiadGrade(t.grade) ?? "mid";
    return {
      slug: t.slug,
      title: t.title,
      order: t.order,
      cluster: related[0] ?? `task:${t.slug}`,
      grade,
      topicSlug,
    };
  });
}

function articleCandidates(
  articles: { slug: string; title: string; order: number }[],
  topicSlug: string,
): PlanArticleCandidate[] {
  return articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    order: a.order,
    topicSlug,
  }));
}

/** Решённые slug задач темы (единая точка — I6-05). Любой верный Attempt по канону. */
export async function getSolvedTaskSlugsForTopic(
  userId: string,
  topicId: string,
): Promise<Set<string>> {
  const rows = await prisma.attempt.findMany({
    where: { userId, isCorrect: true, task: { topicId } },
    select: { task: { select: { slug: true } } },
  });
  return new Set(rows.map((r) => r.task.slug));
}

/**
 * P-PLAN-UNSOLVED: каноны, у которых все instance уже с верным Attempt.
 * Частично решённые (есть другой instance) в план ещё можно брать.
 */
export async function getExhaustedTaskSlugsForTopic(
  userId: string,
  topicId: string,
): Promise<Set<string>> {
  const tasks = await prisma.task.findMany({
    where: { topicId },
    select: {
      slug: true,
      instances: { select: { id: true } },
    },
  });
  const instanceIds = tasks.flatMap((t) => t.instances.map((i) => i.id));
  if (instanceIds.length === 0) return new Set();
  const correct = await prisma.attempt.findMany({
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
  return exhaustedTaskSlugsFromPool({
    tasks: tasks.map((t) => ({
      slug: t.slug,
      instanceIds: t.instances.map((i) => i.id),
    })),
    correctlySolvedInstanceIds: solvedIds,
  });
}

export async function getSolvedTaskSlugsForTopicSlug(
  userId: string,
  topicSlug: string,
): Promise<string[]> {
  if (isMixedPlanScope(topicSlug)) {
    return [...(await getSolvedTaskSlugsForSelection(userId, PLAN_SCOPE_MIXED))];
  }
  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    select: { id: true },
  });
  if (!topic) return [];
  const set = await getSolvedTaskSlugsForTopic(userId, topic.id);
  return [...set];
}

/** Решённые slug для области плана (одна тема или микс). */
export async function getSolvedTaskSlugsForSelection(
  userId: string,
  selection: string,
): Promise<Set<string>> {
  if (isMixedPlanScope(selection)) {
    // 10C-01: для проверки пакета нужны Attempt по всем темам, не только «открытым».
    // Иначе закрытая тема выпадает из solved, и решённые задачи снова «нерешённые».
    const rows = await prisma.attempt.findMany({
      where: { userId, isCorrect: true },
      select: { task: { select: { slug: true } } },
    });
    return new Set(rows.map((r) => r.task.slug));
  }
  const topic = await prisma.topic.findUnique({
    where: { slug: selection.trim() },
    select: { id: true },
  });
  if (!topic) return new Set();
  return getSolvedTaskSlugsForTopic(userId, topic.id);
}

/** Исчерпанные каноны для области плана (P-PLAN-UNSOLVED). */
export async function getExhaustedTaskSlugsForSelection(
  userId: string,
  selection: string,
): Promise<Set<string>> {
  if (isMixedPlanScope(selection)) {
    const tasks = await prisma.task.findMany({
      select: {
        slug: true,
        instances: { select: { id: true } },
      },
    });
    const instanceIds = tasks.flatMap((t) => t.instances.map((i) => i.id));
    if (instanceIds.length === 0) return new Set();
    const correct = await prisma.attempt.findMany({
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
    return exhaustedTaskSlugsFromPool({
      tasks: tasks.map((t) => ({
        slug: t.slug,
        instanceIds: t.instances.map((i) => i.id),
      })),
      correctlySolvedInstanceIds: solvedIds,
    });
  }
  const topic = await prisma.topic.findUnique({
    where: { slug: selection.trim() },
    select: { id: true },
  });
  if (!topic) return new Set();
  return getExhaustedTaskSlugsForTopic(userId, topic.id);
}

/**
 * Исчерпанные каноны по списку тем (gather / пикер).
 */
export async function getExhaustedTaskSlugsForTopicSlugs(
  userId: string,
  topicSlugs: readonly string[],
): Promise<Set<string>> {
  const slugs = [...new Set(topicSlugs.map((s) => s.trim()).filter(Boolean))];
  if (slugs.length === 0) return new Set();
  const topics = await prisma.topic.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  if (topics.length === 0) return new Set();
  const out = new Set<string>();
  for (const t of topics) {
    const part = await getExhaustedTaskSlugsForTopic(userId, t.id);
    for (const s of part) out.add(s);
  }
  return out;
}

/** Старые пакеты (до 10c): пустой scopeKey → topic:<slug>. */
async function backfillScopeKeysForTopic(topicId: string, topicSlug: string): Promise<void> {
  await prisma.dayPlanPackage.updateMany({
    where: { topicId, scopeKey: "" },
    data: { scopeKey: topicScopeKey(topicSlug) },
  });
}

/**
 * Разрешить область: selection = topic slug | "mixed".
 * Возвращает scopeKey, якорный topicId и кандидатов.
 */
async function resolvePlanScope(
  userId: string,
  selection: string,
  mode: BlockMode = BLOCK_MODE_LEARN,
): Promise<{
  scopeKey: string;
  anchorTopicId: string;
  fallbackTopicSlug: string;
  tasks: PlanTaskCandidate[];
  articles: PlanArticleCandidate[];
  mode: BlockMode;
}> {
  // Gather — только createGatherLearnPackage / listGatherPackages (I13A-07).
  if (isGatherPlanScope(selection)) {
    throw new Error("GATHER_NOT_DAY_PLAN");
  }

  const baseKey = planSelectionToScopeKey(selection);
  const scopeKey = planScopeKeyForMode(baseKey, mode);

  if (isMixedPlanScope(selection)) {
    let bundles = await loadOpenTopicBundles(userId);
    if (bundles.length === 0) {
      // Нет открытых — берём все темы для review (theme_closed)
      const all = await prisma.topic.findMany({
        orderBy: [{ order: "asc" }, { slug: "asc" }],
        include: {
          tasks: {
            orderBy: { order: "asc" },
            select: {
              slug: true,
              title: true,
              order: true,
              relatedDocSlugs: true,
              grade: true,
            },
          },
          articles: {
            orderBy: { order: "asc" },
            select: { slug: true, title: true, order: true },
          },
        },
      });
      bundles = all;
    }
    if (bundles.length === 0) {
      throw new Error("TOPIC_NOT_FOUND");
    }
    const anchor = bundles[0]!;
    const tasks = bundles.flatMap((b) => taskCandidates(b.tasks, b.slug));
    const articles = bundles.flatMap((b) => articleCandidates(b.articles, b.slug));
    return {
      scopeKey,
      anchorTopicId: anchor.id,
      fallbackTopicSlug: anchor.slug,
      tasks,
      articles,
      mode,
    };
  }

  const topic = await loadTopicBundle(selection.trim());
  if (!topic) {
    throw new Error("TOPIC_NOT_FOUND");
  }
  await backfillScopeKeysForTopic(topic.id, topic.slug);
  return {
    scopeKey,
    anchorTopicId: topic.id,
    fallbackTopicSlug: topic.slug,
    tasks: taskCandidates(topic.tasks, topic.slug),
    articles: articleCandidates(topic.articles, topic.slug),
    mode,
  };
}

/** Все пакеты пользователя за дату по области (тема или mixed) и режиму. */
export async function listDayPlanPackages(
  userId: string,
  selection: string,
  date: string = calendarDateInTz(),
  mode: BlockMode = BLOCK_MODE_LEARN,
): Promise<DayPlanPackageDto[]> {
  // Gather — только listGatherPackages (I13A-R2-04).
  if (isGatherPlanScope(selection)) {
    throw new Error("GATHER_NOT_DAY_PLAN");
  }

  const scopeKey = planScopeKeyForMode(planSelectionToScopeKey(selection), mode);

  if (!isMixedPlanScope(selection)) {
    const topic = await prisma.topic.findUnique({
      where: { slug: selection.trim() },
      select: { id: true, slug: true },
    });
    if (!topic) return [];
    await backfillScopeKeysForTopic(topic.id, topic.slug);
  }

  const rows = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey, date },
    orderBy: { seq: "asc" },
  });

  let fallback = selection.trim();
  if (isMixedPlanScope(selection)) {
    fallback = rows[0]
      ? (hydrateItemsTopicSlug(parseItems(rows[0].items), "mixed").find((i) => i.topicSlug)?.topicSlug ??
        "mixed")
      : "mixed";
  }

  return rows.map((r) => toDto(r, isMixedPlanScope(selection) ? fallback : selection.trim()));
}

/**
 * Гарантирует ≥1 пакет за сегодня: если пусто — собирает и пишет в БД
 * (в т.ч. theme_closed / caught_up — пакет-повторение, I6-01).
 * F5 не пересобирает существующие (REQ-PLN-03).
 */
export async function ensureDayPlanForToday(
  userId: string,
  selection: string,
  date: string = calendarDateInTz(),
  mode: BlockMode = BLOCK_MODE_LEARN,
): Promise<DayPlanPackageDto[]> {
  await assertUserExists(userId);
  const scope = await resolvePlanScope(userId, selection, mode);

  await pruneTrailingEmptyPackages(userId, scope.scopeKey, date);
  await prunePrematureReviewPackages(userId, scope.scopeKey, date, selection);

  let existing = await listDayPlanPackages(userId, selection, date, mode);
  if (existing.length === 0) {
    await createNewDayPlanPackage(userId, selection, date, { allowEmptyReview: true, mode });
    return listDayPlanPackages(userId, selection, date, mode);
  }

  const latest = existing[existing.length - 1]!;
  if (latest.status === "normal") {
    const available = await countAvailableTasksForDay(userId, selection, date, mode);
    if (available === 0) {
      const progress = await getPackageProgressSlugs(userId, selection, mode, date);
      const itemsList = existing.map((p) => p.items);
      if (
        canRequestNewPackage(latest, progress) &&
        allOfferedTasksSolved(itemsList, progress)
      ) {
        await createNewDayPlanPackage(userId, selection, date, { allowEmptyReview: true, mode });
        existing = await listDayPlanPackages(userId, selection, date, mode);
      }
    }
  }

  return existing;
}

async function prunePrematureReviewPackages(
  userId: string,
  scopeKey: string,
  date: string,
  selection: string,
): Promise<void> {
  const rows = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey, date },
    orderBy: { seq: "asc" },
  });
  if (rows.length === 0) return;
  const latest = rows[rows.length - 1]!;
  if (latest.status !== "caught_up" && latest.status !== "theme_closed" && latest.status !== "need_study") return;

  const exhausted = await getExhaustedTaskSlugsForSelection(userId, selection);
  const itemsList = rows.map((r) => parseItems(r.items));
  if (latest.status === "theme_closed") return;
  if (allOfferedTasksSolved(itemsList, exhausted)) return;
  await prisma.dayPlanPackage.delete({ where: { id: latest.id } });
}

async function pruneTrailingEmptyPackages(
  userId: string,
  scopeKey: string,
  date: string,
): Promise<void> {
  const rows = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey, date },
    orderBy: { seq: "asc" },
  });
  if (rows.length <= 1) return;

  const idsToDelete: string[] = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i]!;
    if (row.status === "theme_closed" || row.status === "caught_up") break;
    const items = parseItems(row.items);
    const hasTask = items.some((it) => it.kind === "task");
    if (hasTask) break;
    idsToDelete.push(row.id);
  }
  if (idsToDelete.length === 0) return;
  await prisma.dayPlanPackage.deleteMany({ where: { id: { in: idsToDelete } } });
}

export type CreateDayPlanOptions = {
  /** true только для ensure первого пакета дня — можно сохранить review без задач */
  allowEmptyReview?: boolean;
  mode?: BlockMode;
};

/**
 * Прогресс для gating пакета: верный Attempt по задаче пакета
 * не раньше createdAt этого пакета (и с привязкой к instance).
 * P-PLAN-UNSOLVED: старый верный на другом instance не закрывает пункт плана.
 */
export async function getPackageProgressSlugs(
  userId: string,
  selection: string,
  mode: BlockMode = BLOCK_MODE_LEARN,
  date: string = calendarDateInTz(),
): Promise<Set<string>> {
  const packages = isGatherPlanScope(selection)
    ? await listGatherPackages(userId, date)
    : await listDayPlanPackages(userId, selection, date, mode);

  const out = new Set<string>();
  for (const pkg of packages) {
    const taskSlugs = pkg.items.filter((i) => i.kind === "task").map((i) => i.slug);
    if (taskSlugs.length === 0) continue;
    const since = new Date(pkg.createdAt);
    const tasks = await prisma.task.findMany({
      where: { slug: { in: taskSlugs } },
      select: { id: true, slug: true },
    });
    const byId = new Map(tasks.map((t) => [t.id, t.slug]));
    const rows = await prisma.attempt.findMany({
      where: {
        userId,
        isCorrect: true,
        taskId: { in: tasks.map((t) => t.id) },
        taskInstanceId: { not: null },
        createdAt: { gte: since },
      },
      select: { taskId: true },
    });
    for (const r of rows) {
      const slug = byId.get(r.taskId);
      if (slug) out.add(slug);
    }
  }
  return out;
}

/**
 * Новый пакет. По кнопке: нужен закрытый текущий + доступные задачи.
 * По ensure (allowEmptyReview): можно сохранить theme_closed / caught_up / need_study.
 * selection = topic slug | "mixed".
 */
export async function createNewDayPlanPackage(
  userId: string,
  selection: string,
  date: string = calendarDateInTz(),
  options: CreateDayPlanOptions = {},
): Promise<DayPlanPackageDto> {
  await assertUserExists(userId);
  const allowEmptyReview = options.allowEmptyReview === true;
  const mode = options.mode ?? BLOCK_MODE_LEARN;
  const scope = await resolvePlanScope(userId, selection, mode);

  // Тяжёлые чтения — вне транзакции: иначе на большом банке interactive-транзакция
  // не укладывается в таймаут Prisma. Гонку ловит повторная проверка seq внутри insert.
  const existing = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey: scope.scopeKey, date },
    orderBy: { seq: "asc" },
  });
  const offered = collectOfferedTaskSlugs(existing.map((r) => parseItems(r.items)));
  const progress = await getPackageProgressSlugs(userId, selection, mode, date);
  const exhausted =
    mode === BLOCK_MODE_LEARN
      ? await getExhaustedTaskSlugsForSelection(userId, selection)
      : new Set<string>();

  let testable = new Set<string>();
  if (mode === BLOCK_MODE_TEST) {
    const taskRows = await prisma.task.findMany({
      where: { slug: { in: scope.tasks.map((t) => t.slug) } },
      select: { id: true, slug: true },
    });
    testable = await filterTestableTaskIds(userId, taskRows);
  }

  const studied =
    mode === BLOCK_MODE_TEST
      ? await getSolvedTaskSlugsForSelection(userId, selection)
      : exhausted;

  const available =
    mode === BLOCK_MODE_TEST
      ? countAvailableTestTasks({
          tasks: scope.tasks,
          studiedTaskSlugs: studied,
          offeredTaskSlugs: offered,
          testableTaskSlugs: testable,
        })
      : countAvailableTasks({
          tasks: scope.tasks,
          solvedTaskSlugs: exhausted,
          offeredTaskSlugs: offered,
        });

  if (existing.length > 0) {
    const mapped = existing.map((r) => ({
      items: parseItems(r.items),
      status: r.status as DayPlanPackageStatus,
    }));
    const { current } = resolveCurrentPackage(mapped, progress);
    if (!current || current.status !== "normal") {
      throw new Error("NO_MORE_TASKS");
    }
    if (!canRequestNewPackage(current, progress)) {
      throw new Error("CURRENT_INCOMPLETE");
    }
    if (available === 0) {
      if (!allowEmptyReview) throw new Error("NO_MORE_TASKS");
      if (!allOfferedTasksSolved(mapped.map((m) => m.items), progress)) {
        throw new Error("CURRENT_INCOMPLETE");
      }
    }
  } else if (available === 0 && !allowEmptyReview) {
    throw new Error("NO_MORE_TASKS");
  }

  const built =
    mode === BLOCK_MODE_TEST
      ? buildTestDayPlanPackage({
          tasks: scope.tasks,
          studiedTaskSlugs: studied,
          offeredTaskSlugs: offered,
          testableTaskSlugs: testable,
        })
      : buildDayPlanPackage({
          tasks: scope.tasks,
          articles: scope.articles,
          solvedTaskSlugs: exhausted,
          offeredTaskSlugs: offered,
        });

  const maxSeq = existing.reduce((m, r) => Math.max(m, r.seq), 0);
  const seq = maxSeq + 1;

  const createData = {
    userId,
    topicId: scope.anchorTopicId,
    scopeKey: scope.scopeKey,
    date,
    seq,
    items: JSON.stringify(built.items),
    status: built.status,
  };

  const inserted = await insertDayPlanPackageRow(createData, maxSeq);
  if (inserted.row) return toDto(inserted.row, scope.fallbackTopicSlug);

  // Гонка вкладок (10C-05): пакет с этим seq уже создан параллельно — дубль не пишем.
  const again = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey: scope.scopeKey, date },
    orderBy: { seq: "asc" },
  });
  const latest = again[again.length - 1];
  if (!latest) throw inserted.error;

  if (allowEmptyReview) {
    return toDto(latest, scope.fallbackTopicSlug);
  }

  const progressNow = await getPackageProgressSlugs(userId, selection, mode);
  const mappedNow = again.map((r) => ({
    items: parseItems(r.items),
    status: r.status as DayPlanPackageStatus,
  }));
  const { current } = resolveCurrentPackage(mappedNow, progressNow);
  if (!current || current.status !== "normal") {
    throw new Error("NO_MORE_TASKS");
  }
  throw new Error("CURRENT_INCOMPLETE");
}

/** Лимиты interactive-транзакции записи пакета (дефолтных 5 с Prisma мало для dev/SQLite). */
const PLAN_TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

type DayPlanPackageRow = Awaited<ReturnType<typeof prisma.dayPlanPackage.create>>;

type DayPlanPackageCreateData = {
  userId: string;
  topicId: string;
  scopeKey: string;
  date: string;
  seq: number;
  items: string;
  status: string;
};

/**
 * Короткая транзакция записи пакета: свежее чтение seq + create.
 * Если за время расчёта (вне транзакции) кто-то уже дописал пакет дня
 * или create упал на уникальном seq (P2002) — возвращаем конфликт, без записи.
 * FK-ошибка → USER_GONE (обычно устаревший userId в JWT после пересоздания User).
 */
async function insertDayPlanPackageRow(
  data: DayPlanPackageCreateData,
  expectedMaxSeq: number,
): Promise<{ row: DayPlanPackageRow; error?: undefined } | { row: null; error: unknown }> {
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.dayPlanPackage.findMany({
      where: { userId: data.userId, scopeKey: data.scopeKey, date: data.date },
      select: { seq: true },
    });
    const freshMax = fresh.reduce((m, r) => Math.max(m, r.seq), 0);
    if (freshMax !== expectedMaxSeq) {
      return { row: null, error: new Error("PLAN_RACE") };
    }
    try {
      return { row: await tx.dayPlanPackage.create({ data }) };
    } catch (e) {
      if (isPrismaForeignKeyError(e)) throw new Error("USER_GONE");
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      if (code !== "P2002") throw e;
      return { row: null, error: e };
    }
  }, PLAN_TX_OPTIONS);
}

/** Сколько задач ещё можно предложить сегодня (для canCreateNew). */
export async function countAvailableTasksForDay(
  userId: string,
  selection: string,
  date: string = calendarDateInTz(),
  mode: BlockMode = BLOCK_MODE_LEARN,
): Promise<number> {
  const scope = await resolvePlanScope(userId, selection, mode);
  const existing = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey: scope.scopeKey, date },
    select: { items: true },
  });
  const offered = collectOfferedTaskSlugs(existing.map((r) => parseItems(r.items)));

  if (mode === BLOCK_MODE_TEST) {
    const studied = await getSolvedTaskSlugsForSelection(userId, selection);
    const taskRows = await prisma.task.findMany({
      where: { slug: { in: scope.tasks.map((t) => t.slug) } },
      select: { id: true, slug: true },
    });
    const testable = await filterTestableTaskIds(userId, taskRows);
    return countAvailableTestTasks({
      tasks: scope.tasks,
      studiedTaskSlugs: studied,
      offeredTaskSlugs: offered,
      testableTaskSlugs: testable,
    });
  }

  const exhausted = await getExhaustedTaskSlugsForSelection(userId, selection);
  return countAvailableTasks({
    tasks: scope.tasks,
    solvedTaskSlugs: exhausted,
    offeredTaskSlugs: offered,
  });
}

/** Решённые slug по списку тем (для gather). */
export async function getSolvedTaskSlugsForTopicSlugs(
  userId: string,
  topicSlugs: readonly string[],
): Promise<Set<string>> {
  const slugs = [...new Set(topicSlugs.map((s) => s.trim()).filter(Boolean))];
  if (slugs.length === 0) return new Set();
  const topics = await prisma.topic.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  if (topics.length === 0) return new Set();
  const rows = await prisma.attempt.findMany({
    where: {
      userId,
      isCorrect: true,
      task: { topicId: { in: topics.map((t) => t.id) } },
    },
    select: { task: { select: { slug: true } } },
  });
  return new Set(rows.map((r) => r.task.slug));
}

/**
 * «Собрать обучение»: пакет в scope `gather` из выбранных тем (REQ-MODE-01/02).
 * Gating завершённости текущего пакета — по solved всех тем в уже существующих
 * gather-пакетах дня + новой выборки (I13A-01), иначе смена T1→T2 ломается.
 */
export async function createGatherLearnPackage(
  userId: string,
  topicSlugs: readonly string[],
  date: string = calendarDateInTz(),
): Promise<DayPlanPackageDto> {
  await assertUserExists(userId);
  const unique = [...new Set(topicSlugs.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("NO_TOPICS");
  }

  const bundles: TopicBundle[] = [];
  for (const slug of unique) {
    const b = await loadTopicBundle(slug);
    if (b) bundles.push(b);
  }
  // Любой неизвестный slug — отказ целиком (I13A-04).
  if (bundles.length !== unique.length) {
    throw new Error("TOPIC_NOT_FOUND");
  }

  const anchor = bundles[0]!;
  const tasks = bundles.flatMap((b) => taskCandidates(b.tasks, b.slug));
  const articles = bundles.flatMap((b) => articleCandidates(b.articles, b.slug));
  const scopeKey = PLAN_SCOPE_GATHER;

  // Тяжёлые чтения — вне транзакции (см. createNewDayPlanPackage).
  const existing = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey, date },
    orderBy: { seq: "asc" },
  });
  const existingItems = existing.map((r) => parseItems(r.items));
  const offered = collectOfferedTaskSlugs(existingItems);
  const topicsFromExisting = existingItems.flatMap((items) =>
    collectTopicSlugsFromPlanItems(items),
  );
  const gatingTopics = [...new Set([...topicsFromExisting, ...unique])];
  const exhausted = await getExhaustedTaskSlugsForTopicSlugs(userId, gatingTopics);
  const progress = await getPackageProgressSlugs(userId, PLAN_SCOPE_GATHER, BLOCK_MODE_LEARN, date);
  const available = countAvailableTasks({
    tasks,
    solvedTaskSlugs: exhausted,
    offeredTaskSlugs: offered,
  });

  if (existing.length > 0) {
    const mapped = existing.map((r) => ({
      items: parseItems(r.items),
      status: r.status as DayPlanPackageStatus,
    }));
    const { current } = resolveCurrentPackage(mapped, progress);
    if (!current || current.status !== "normal") {
      throw new Error("NO_MORE_TASKS");
    }
    if (!canRequestNewPackage(current, progress)) {
      throw new Error("CURRENT_INCOMPLETE");
    }
    if (available === 0) {
      throw new Error("NO_MORE_TASKS");
    }
  } else if (available === 0) {
    throw new Error("NO_MORE_TASKS");
  }

  const built = buildDayPlanPackage({
    tasks,
    articles,
    solvedTaskSlugs: exhausted,
    offeredTaskSlugs: offered,
  });

  if (built.status !== "normal" || built.items.filter((i) => i.kind === "task").length === 0) {
    throw new Error("NO_MORE_TASKS");
  }

  const maxSeq = existing.reduce((m, r) => Math.max(m, r.seq), 0);
  const createData = {
    userId,
    topicId: anchor.id,
    scopeKey,
    date,
    seq: maxSeq + 1,
    items: JSON.stringify(built.items),
    status: built.status,
  };

  const inserted = await insertDayPlanPackageRow(createData, maxSeq);
  if (inserted.row) return toDto(inserted.row, PLAN_SCOPE_GATHER);
  // Гонка вкладок (I13A-R3-01): не сравниваем selection с items пакета —
  // builder может не включить все выбранные темы (лимит ≤6). Всегда conflict.
  throw new Error("GATHER_RACE_CONFLICT");
}

/** Пакеты ручного сбора за день. */
export async function listGatherPackages(
  userId: string,
  date: string = calendarDateInTz(),
): Promise<DayPlanPackageDto[]> {
  const rows = await prisma.dayPlanPackage.findMany({
    where: { userId, scopeKey: PLAN_SCOPE_GATHER, date },
    orderBy: { seq: "asc" },
  });
  return rows.map((r) => toDto(r, "gather"));
}

export type PlanTaskNavLink = {
  slug: string;
  title: string;
  href: string;
};

/**
 * Соседи задачи в пакете плана дня (topic / mixed / gather).
 * Для «Дальше» после верного ответа — порядок пакета, не order темы.
 */
/**
 * Время создания пакета плана дня, в котором предложена задача (PPV-02).
 * Верный Attempt раньше этого момента пункт плана не закрывает — такой instance
 * при заходе с плана не держим; решённый позже (в т.ч. только что) — держим.
 * null — задачи нет в пакетах дня.
 */
export async function getPlanTaskSince(
  userId: string,
  planTopic: string,
  taskSlug: string,
  mode: BlockMode = BLOCK_MODE_LEARN,
  date: string = calendarDateInTz(),
): Promise<Date | null> {
  const selection = planTopic.trim();
  if (!selection) return null;
  const packages = isGatherPlanScope(selection)
    ? await listGatherPackages(userId, date)
    : await listDayPlanPackages(userId, selection, date, mode);
  const pkg = packages.find((p) =>
    p.items.some((i) => i.kind === "task" && i.slug === taskSlug),
  );
  return pkg ? new Date(pkg.createdAt) : null;
}

export async function getPlanTaskNav(
  userId: string,
  planTopic: string,
  taskSlug: string,
  opts: { tab?: string | null; date?: string } = {},
): Promise<{ prev: PlanTaskNavLink | null; next: PlanTaskNavLink | null }> {
  const selection = planTopic.trim();
  if (!selection) return { prev: null, next: null };

  const date = opts.date ?? calendarDateInTz();
  const packages = isGatherPlanScope(selection)
    ? await listGatherPackages(userId, date)
    : await listDayPlanPackages(userId, selection, date, BLOCK_MODE_LEARN);

  const { prev, next } = findPlanTaskNeighbors(packages, taskSlug);
  const linkOpts = { tab: opts.tab, planTopic: selection };

  const toLink = (n: ReturnType<typeof findPlanTaskNeighbors>["next"]): PlanTaskNavLink | null => {
    if (!n) return null;
    return {
      slug: n.slug,
      title: n.title,
      href: planTaskHref(n.topicSlug, n.slug, linkOpts),
    };
  };

  return { prev: toLink(prev), next: toLink(next) };
}
