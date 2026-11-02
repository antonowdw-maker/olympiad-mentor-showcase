/**
 * Чтение контента из БД и сборка публичных DTO без эталона (REQ-CNT-13).
 * Подсказки: только открытые ступени (W-03 / iter 4).
 */
import { prisma } from "@/lib/db";
import { parseOlympiadGrade } from "@/lib/content/grade";
import { pickOrderedNeighbors } from "@/lib/content/neighbors";
import {
  articlePublicSchema,
  taskPublicSchema,
  type ArticlePublic,
  type TaskPublic,
  type HintStep,
  type AnswerTable,
} from "@/lib/content/schemas";
import { parseAnswerTableJson } from "@/lib/content/answer-table";
import {
  getInstanceHintsOpenedCount,
  resolveTaskInstance,
} from "@/lib/content/instance-resolve";
import { getHintsOpenedCount, isReinforceTargetTask } from "@/lib/trainer/hint-progress";
import {
  clampOpenedCount,
  effectiveHintStepsTotal,
  isReinforceVisit,
  shouldApplyReinforceHintCap,
  sliceVisibleHints,
} from "@/lib/trainer/hints";

export type QueryError = { code: "BAD_JSON" | "NOT_FOUND"; message: string };

function parseJsonArray<T>(raw: string, label: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, error: `Некорректный JSON в поле ${label}` };
  }
}

/** Список тем (для главной и навигации). */
export async function listTopics() {
  return prisma.topic.findMany({
    orderBy: { order: "asc" },
    select: {
      slug: true,
      title: true,
      description: true,
      order: true,
      classLevels: true,
    },
  });
}

type NeighborLink = {
  slug: string;
  order: number;
  title: string;
  href: string;
};

function toNeighborLink(
  topicSlug: string,
  kind: "tasks" | "articles",
  item: { slug: string; order: number; title: string } | null,
): NeighborLink | null {
  if (!item) return null;
  return {
    slug: item.slug,
    order: item.order,
    title: item.title,
    href: `/topics/${topicSlug}/${kind}/${item.slug}`,
  };
}

/** Соседи задачи в теме (порядок order) — для «предыдущая / следующая». */
export async function getTaskNeighbors(topicSlug: string, taskSlug: string) {
  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    include: {
      tasks: {
        orderBy: { order: "asc" },
        select: { slug: true, order: true, title: true },
      },
    },
  });
  if (!topic) return { prev: null, next: null };

  const { prev, next } = pickOrderedNeighbors(topic.tasks, taskSlug);
  return {
    prev: toNeighborLink(topicSlug, "tasks", prev),
    next: toNeighborLink(topicSlug, "tasks", next),
  };
}

/** Соседи статьи в теме (порядок order) — для «предыдущая / следующая». */
export async function getArticleNeighbors(topicSlug: string, articleSlug: string) {
  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    include: {
      articles: {
        orderBy: { order: "asc" },
        select: { slug: true, order: true, title: true },
      },
    },
  });
  if (!topic) return { prev: null, next: null };

  const { prev, next } = pickOrderedNeighbors(topic.articles, articleSlug);
  return {
    prev: toNeighborLink(topicSlug, "articles", prev),
    next: toNeighborLink(topicSlug, "articles", next),
  };
}

/** Только title темы — для навигации на экране задачи (без статей/задач). */
export async function getTopicTitleBySlug(slug: string): Promise<string | null> {
  const topic = await prisma.topic.findUnique({
    where: { slug },
    select: { title: true },
  });
  return topic?.title ?? null;
}

/** Тема по slug. */
export async function getTopicBySlug(slug: string) {
  const topic = await prisma.topic.findUnique({
    where: { slug },
    include: {
      articles: { orderBy: { order: "asc" }, select: { slug: true, title: true, order: true } },
      tasks: {
        orderBy: { order: "asc" },
        select: { slug: true, title: true, difficulty: true, grade: true, order: true },
      },
    },
  });
  if (!topic) return { error: null as string | null, topic: null };

  const levels = parseJsonArray<string[]>(topic.classLevels, "classLevels");
  if (!levels.ok) {
    return { error: levels.error as string, topic: null };
  }

  return {
    error: null as string | null,
    topic: {
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      classLevels: levels.value,
      articles: topic.articles,
      tasks: topic.tasks.map((t) => ({
        ...t,
        grade: parseOlympiadGrade(t.grade) ?? "mid",
      })),
    },
  };
}

/** Статья для чтения учеником. */
export async function getArticlePublic(
  topicSlug: string,
  articleSlug: string,
): Promise<ArticlePublic | null> {
  const article = await prisma.docArticle.findFirst({
    where: { slug: articleSlug, topic: { slug: topicSlug } },
  });
  if (!article) return null;
  return articlePublicSchema.parse({
    slug: article.slug,
    title: article.title,
    body: article.body,
    order: article.order,
  });
}

/**
 * Задача для UI: без acceptedAnswers; подсказки — только открытые для userId.
 * При наличии пула instance (12a) — выдаёт изоморф (анти-повтор / цикл).
 */
export async function getTaskPublic(
  topicSlug: string,
  taskSlug: string,
  userId?: string | null,
  opts?: {
    reinforce?: string | null;
    mode?: import("@/lib/modes/block-mode").BlockMode;
    /**
     * Заход с плана (PPV-02): момент создания пакета с этой задачей.
     * Instance, решённый раньше, меняем на нерешённый; решённый позже — не трогаем.
     */
    planSince?: Date | null;
  },
): Promise<{ task: TaskPublic | null; error: string | null }> {
  const task = await prisma.task.findFirst({
    where: { slug: taskSlug, topic: { slug: topicSlug } },
  });
  if (!task) return { task: null, error: null };

  const resolved = await resolveTaskInstance(task.id, userId, {
    mode: opts?.mode,
    unstickIfSolvedBefore: opts?.planSince ?? undefined,
  });
  const statement = resolved?.statement ?? task.statement;
  const hintJson = resolved?.hintSteps ?? task.hintSteps;
  const optionsJson = resolved?.options ?? task.options;
  const instanceId = resolved?.id ?? null;
  const instanceSlug = resolved?.slug ?? null;
  const instanceCount = await prisma.taskInstance.count({ where: { taskId: task.id } });
  const hasOtherVariants = instanceCount >= 2;

  const relatedParsed = parseJsonArray<string[]>(task.relatedDocSlugs, "relatedDocSlugs");
  const hintsParsed = parseJsonArray<HintStep[]>(hintJson, "hintSteps");
  if (!relatedParsed.ok) {
    return { task: null, error: relatedParsed.error };
  }
  if (!hintsParsed.ok) {
    return { task: null, error: hintsParsed.error };
  }

  const relatedDocSlugs = relatedParsed.value;
  const allHintSteps = hintsParsed.value;
  const incomingTarget = await isReinforceTargetTask(task.topicId, task.slug);
  const applyCap = shouldApplyReinforceHintCap(
    isReinforceVisit(opts?.reinforce),
    incomingTarget,
  );
  const hintStepsTotal = effectiveHintStepsTotal(allHintSteps.length, applyCap);
  const rawOpened = userId
    ? instanceId
      ? await getInstanceHintsOpenedCount(userId, instanceId)
      : await getHintsOpenedCount(userId, task.id)
    : 0;
  const hintsOpenedCount = clampOpenedCount(rawOpened, hintStepsTotal);
  const visibleHints = sliceVisibleHints(allHintSteps, hintsOpenedCount);

  let options: string[] | undefined;
  let table: AnswerTable | undefined;
  if (task.answerType === "table") {
    // Для таблицы колонка options хранит JSON описания таблицы (без эталона)
    const parsedTable = parseAnswerTableJson(optionsJson);
    if (!parsedTable) {
      return { task: null, error: "Некорректное описание таблицы ответа" };
    }
    table = parsedTable;
  } else if (optionsJson) {
    const optParsed = parseJsonArray<string[]>(optionsJson, "options");
    if (!optParsed.ok) {
      return { task: null, error: optParsed.error };
    }
    options = optParsed.value;
  }

  // Превью статей: связанные + только docSlug уже открытых ступеней (не закрытых).
  const previewSlugs = new Set<string>([
    ...relatedDocSlugs,
    ...visibleHints.map((s) => s.docSlug).filter((s): s is string => Boolean(s)),
  ]);

  const articles = await prisma.docArticle.findMany({
    where: {
      topicId: task.topicId,
      slug: { in: [...previewSlugs] },
    },
    select: { slug: true, title: true, body: true },
  });
  const bySlug = new Map(articles.map((a) => [a.slug, a]));

  let similarTask: {
    slug: string;
    order: number;
    label: string;
    title: string;
  } | null = null;
  if (task.similarTaskSlug) {
    const similar = await prisma.task.findFirst({
      where: { slug: task.similarTaskSlug, topicId: task.topicId },
      select: { slug: true, order: true, title: true },
    });
    if (similar) {
      similarTask = {
        slug: similar.slug,
        order: similar.order,
        title: similar.title,
        label: `Задача ${similar.order}: ${similar.title}`,
      };
    }
  }

  try {
    const publicTask = taskPublicSchema.parse({
      slug: task.slug,
      // У варианта с другими числами — своё название (иначе заголовок противоречит условию)
      title: resolved?.title ?? task.title,
      statement,
      answerType: task.answerType,
      options,
      table,
      difficulty: task.difficulty,
      grade: parseOlympiadGrade(task.grade) ?? "mid",
      order: task.order,
      instanceId,
      instanceSlug,
      hasOtherVariants,
      relatedDocs: relatedDocSlugs.map((slug) => ({
        slug,
        title: bySlug.get(slug)?.title ?? slug,
      })),
      hintSteps: visibleHints.map((step) => ({
        text: step.text,
        docSlug: step.docSlug,
        docTitle: step.docSlug ? bySlug.get(step.docSlug)?.title : undefined,
      })),
      hintStepsTotal,
      hintsOpenedCount,
      hasMoreHints: hintsOpenedCount < hintStepsTotal,
      similarTask,
      workedExample: task.workedExample,
      hasSimilarHelp: Boolean(task.workedExample || similarTask),
      articlePreviews: articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        body: a.body,
      })),
    });
    return { task: publicTask, error: null };
  } catch (e) {
    return {
      task: null,
      error: e instanceof Error ? e.message : "Ошибка сборки DTO задачи",
    };
  }
}
