/**
 * Чистая сборка одного пакета плана дня (REQ-PLN-01…06, 10b).
 * Без Prisma / auth — удобно для unit.
 */
import {
  estMinutesForGrade,
  type OlympiadGrade,
} from "@/lib/content/grade";

export const DAY_PLAN_BUDGET_MIN = 60;
export const EST_ARTICLE_MIN = 8;
/**
 * Потолок задач в одном пакете (G-01 / REVIEW-ITER10b).
 * Остановка набора: минут ≥ budget **или** задач ≥ этого лимита.
 * Ориентир ~1 час сохраняется, когда банк позволяет набрать его за ≤6 задач.
 */
export const MAX_TASKS_PER_PACKAGE = 6;

export type PlanItemKind = "article" | "task";

export type PlanItem = {
  kind: PlanItemKind;
  slug: string;
  title: string;
  estMinutes: number;
  /** Только для задач — олимпиадный грейд (UI плана). */
  grade?: OlympiadGrade;
  /** Тема элемента (10c: ссылки в миксе). */
  topicSlug: string;
};

export type PlanTaskCandidate = {
  slug: string;
  title: string;
  order: number;
  /** Кластер разнообразия: обычно relatedDocSlugs[0] */
  cluster: string;
  /** Олимпиадный грейд — оценка минут и микс в пакете */
  grade: OlympiadGrade;
  topicSlug: string;
};

export type PlanArticleCandidate = {
  slug: string;
  title: string;
  order: number;
  topicSlug: string;
};

export type BuildDayPlanPackageInput = {
  tasks: PlanTaskCandidate[];
  articles: PlanArticleCandidate[];
  solvedTaskSlugs: ReadonlySet<string>;
  /** Задачи, уже попавшие в пакеты этого дня */
  offeredTaskSlugs: ReadonlySet<string>;
  budgetMin?: number;
  articleMinutes?: number;
  /** Сколько статей в пакет (по умолчанию до 2) */
  maxArticles?: number;
  /** Потолок задач в пакете (дефолт MAX_TASKS_PER_PACKAGE) */
  maxTasks?: number;
};

export type DayPlanPackageStatus = "normal" | "theme_closed" | "caught_up" | "need_study";

export type BuildDayPlanPackageResult = {
  items: PlanItem[];
  status: DayPlanPackageStatus;
  totalMinutes: number;
};

export { estMinutesForGrade };

/** Есть ли ещё задачи для нового пакета сегодня. */
export function countAvailableTasks(input: {
  tasks: PlanTaskCandidate[];
  solvedTaskSlugs: ReadonlySet<string>;
  offeredTaskSlugs: ReadonlySet<string>;
}): number {
  return input.tasks.filter(
    (t) => !input.solvedTaskSlugs.has(t.slug) && !input.offeredTaskSlugs.has(t.slug),
  ).length;
}

/**
 * Собирает один пакет: статьи + задачи.
 * Ориентир минут ≥ budgetMin (~1 час), потолок задач MAX_TASKS_PER_PACKAGE;
 * остановка по первому из двух условий (минуты или количество).
 * Разнообразие по cluster и грейду; среди прочих — лёгкие раньше тяжёлых (разгон).
 */
export function buildDayPlanPackage(input: BuildDayPlanPackageInput): BuildDayPlanPackageResult {
  const budgetMin = input.budgetMin ?? DAY_PLAN_BUDGET_MIN;
  const articleMin = input.articleMinutes ?? EST_ARTICLE_MIN;
  const maxArticles = input.maxArticles ?? 2;
  const maxTasks = input.maxTasks ?? MAX_TASKS_PER_PACKAGE;

  const available = input.tasks
    .filter((t) => !input.solvedTaskSlugs.has(t.slug) && !input.offeredTaskSlugs.has(t.slug))
    .slice()
    .sort((a, b) => a.order - b.order);

  const articlesSorted = input.articles.slice().sort((a, b) => a.order - b.order);
  const allSolved =
    input.tasks.length > 0 && input.tasks.every((t) => input.solvedTaskSlugs.has(t.slug));

  if (available.length === 0) {
    const reviewArticles = articlesSorted.slice(0, Math.max(2, maxArticles)).map((a) => ({
      kind: "article" as const,
      slug: a.slug,
      title: a.title,
      estMinutes: articleMin,
      topicSlug: a.topicSlug,
    }));
    const status: DayPlanPackageStatus = allSolved ? "theme_closed" : "caught_up";
    const totalMinutes = reviewArticles.reduce((s, i) => s + i.estMinutes, 0);
    return { items: reviewArticles, status, totalMinutes };
  }

  const pickedTasks: PlanTaskCandidate[] = [];
  const usedClusters = new Set<string>();
  const usedGrades = new Set<OlympiadGrade>();
  const usedTopics = new Set<string>();
  let taskMinutesSum = 0;

  const pickNext = (): PlanTaskCandidate | null => {
    let best: PlanTaskCandidate | null = null;
    let bestScore = -Infinity;
    for (const t of available) {
      if (pickedTasks.some((p) => p.slug === t.slug)) continue;
      // Новый кластер > новая тема (10c) > новый грейд > лёгкие раньше тяжёлых > order.
      let score = 0;
      if (!usedClusters.has(t.cluster)) score += 100;
      if (!usedTopics.has(t.topicSlug)) score += 70;
      if (!usedGrades.has(t.grade)) score += 40;
      score -= estMinutesForGrade(t.grade) * 0.05;
      score -= t.order * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  };

  while (taskMinutesSum < budgetMin && pickedTasks.length < maxTasks) {
    const next = pickNext();
    if (!next) break;
    pickedTasks.push(next);
    usedClusters.add(next.cluster);
    usedGrades.add(next.grade);
    usedTopics.add(next.topicSlug);
    taskMinutesSum += estMinutesForGrade(next.grade);
  }

  // Не класть весь банк: только до потолка (защита от budgetMin ≤ 0 / пустого набора).
  if (pickedTasks.length === 0) {
    pickedTasks.push(...available.slice(0, maxTasks));
  }

  const relatedKeys = new Set<string>();
  for (const t of pickedTasks) {
    if (t.cluster) relatedKeys.add(`${t.topicSlug}::${t.cluster}`);
  }

  const articlePool = articlesSorted.filter((a) =>
    relatedKeys.has(`${a.topicSlug}::${a.slug}`),
  );
  const articlePickSource = articlePool.length > 0 ? articlePool : articlesSorted;
  const pickedArticles = articlePickSource.slice(0, maxArticles);

  // Сначала задачи (главное на сегодня), потом статьи к ним
  const items: PlanItem[] = [
    ...pickedTasks.map((t) => ({
      kind: "task" as const,
      slug: t.slug,
      title: t.title,
      estMinutes: estMinutesForGrade(t.grade),
      grade: t.grade,
      topicSlug: t.topicSlug,
    })),
    ...pickedArticles.map((a) => ({
      kind: "article" as const,
      slug: a.slug,
      title: a.title,
      estMinutes: articleMin,
      topicSlug: a.topicSlug,
    })),
  ];

  const totalMinutes = items.reduce((s, i) => s + i.estMinutes, 0);
  return { items, status: "normal", totalMinutes };
}

export type BuildTestDayPlanPackageInput = {
  tasks: PlanTaskCandidate[];
  /** Каноны с ≥1 верным Attempt (изученные). */
  studiedTaskSlugs: ReadonlySet<string>;
  /** Уже в пакетах теста этого дня. */
  offeredTaskSlugs: ReadonlySet<string>;
  /** Изученные, у которых есть instance без верного Attempt. */
  testableTaskSlugs: ReadonlySet<string>;
  budgetMin?: number;
  maxTasks?: number;
};

/** Число задач, доступных для нового тестового пакета. */
export function countAvailableTestTasks(input: {
  tasks: PlanTaskCandidate[];
  studiedTaskSlugs: ReadonlySet<string>;
  offeredTaskSlugs: ReadonlySet<string>;
  testableTaskSlugs: ReadonlySet<string>;
}): number {
  return input.tasks.filter(
    (t) =>
      input.studiedTaskSlugs.has(t.slug) &&
      input.testableTaskSlugs.has(t.slug) &&
      !input.offeredTaskSlugs.has(t.slug),
  ).length;
}

/**
 * Пакет режима «тест»: только изученные каноны с другим instance; без статей.
 */
export function buildTestDayPlanPackage(
  input: BuildTestDayPlanPackageInput,
): BuildDayPlanPackageResult {
  const budgetMin = input.budgetMin ?? DAY_PLAN_BUDGET_MIN;
  const maxTasks = input.maxTasks ?? MAX_TASKS_PER_PACKAGE;

  const available = input.tasks
    .filter(
      (t) =>
        input.studiedTaskSlugs.has(t.slug) &&
        input.testableTaskSlugs.has(t.slug) &&
        !input.offeredTaskSlugs.has(t.slug),
    )
    .slice()
    .sort((a, b) => a.order - b.order);

  if (available.length === 0) {
    const anyStudied = input.tasks.some((t) => input.studiedTaskSlugs.has(t.slug));
    return {
      items: [],
      status: anyStudied ? "caught_up" : "need_study",
      totalMinutes: 0,
    };
  }

  const pickedTasks: PlanTaskCandidate[] = [];
  const usedClusters = new Set<string>();
  const usedGrades = new Set<OlympiadGrade>();
  const usedTopics = new Set<string>();
  let taskMinutesSum = 0;

  const pickNext = (): PlanTaskCandidate | null => {
    let best: PlanTaskCandidate | null = null;
    let bestScore = -Infinity;
    for (const t of available) {
      if (pickedTasks.some((p) => p.slug === t.slug)) continue;
      let score = 0;
      if (!usedClusters.has(t.cluster)) score += 100;
      if (!usedTopics.has(t.topicSlug)) score += 70;
      if (!usedGrades.has(t.grade)) score += 40;
      score -= estMinutesForGrade(t.grade) * 0.05;
      score -= t.order * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  };

  while (taskMinutesSum < budgetMin && pickedTasks.length < maxTasks) {
    const next = pickNext();
    if (!next) break;
    pickedTasks.push(next);
    usedClusters.add(next.cluster);
    usedGrades.add(next.grade);
    usedTopics.add(next.topicSlug);
    taskMinutesSum += estMinutesForGrade(next.grade);
  }

  if (pickedTasks.length === 0) {
    pickedTasks.push(...available.slice(0, maxTasks));
  }

  const items: PlanItem[] = pickedTasks.map((t) => ({
    kind: "task" as const,
    slug: t.slug,
    title: t.title,
    estMinutes: estMinutesForGrade(t.grade),
    grade: t.grade,
    topicSlug: t.topicSlug,
  }));

  const totalMinutes = items.reduce((s, i) => s + i.estMinutes, 0);
  return { items, status: "normal", totalMinutes };
}

/** Собрать slug задач из сохранённых пакетов дня. */
export function collectOfferedTaskSlugs(packagesItems: PlanItem[][]): Set<string> {
  const out = new Set<string>();
  for (const items of packagesItems) {
    for (const it of items) {
      if (it.kind === "task") out.add(it.slug);
    }
  }
  return out;
}

/**
 * Можно ли открыть новый список: текущий пакет с задачами полностью решён
 * и статус normal (не theme_closed / caught_up).
 */
export function canRequestNewPackage(
  latest: { items: PlanItem[]; status: DayPlanPackageStatus } | null | undefined,
  solvedTaskSlugs: ReadonlySet<string>,
  /** Если передано и ≤0 — новый список нельзя (банк на день исчерпан) */
  availableTaskCount?: number,
): boolean {
  if (!latest) return false;
  if (latest.status !== "normal") return false;
  if (availableTaskCount !== undefined && availableTaskCount <= 0) return false;
  const tasks = latest.items.filter((i) => i.kind === "task");
  if (tasks.length === 0) return false;
  return tasks.every((t) => solvedTaskSlugs.has(t.slug));
}

/**
 * «Текущий» для UI:
 * — если передан solved: первый normal-пакет с нерешённой задачей (не бросаем работу в «историю»);
 * — иначе / всё решено: theme_closed / caught_up как текущий; иначе последний normal с задачами.
 */
export function resolveCurrentPackage<T extends { items: PlanItem[]; status: DayPlanPackageStatus }>(
  packages: T[],
  solvedTaskSlugs?: ReadonlySet<string>,
): { current: T | null; dayExhausted: boolean } {
  if (packages.length === 0) return { current: null, dayExhausted: false };

  if (solvedTaskSlugs) {
    for (const p of packages) {
      if (p.status !== "normal") continue;
      const tasks = p.items.filter((i) => i.kind === "task");
      if (tasks.length === 0) continue;
      if (tasks.some((t) => !solvedTaskSlugs.has(t.slug))) {
        return { current: p, dayExhausted: false };
      }
    }
  }

  const latest = packages[packages.length - 1]!;
  if (latest.status === "theme_closed" || latest.status === "caught_up" || latest.status === "need_study") {
    return { current: latest, dayExhausted: true };
  }
  const latestHasTasks = latest.items.some((i) => i.kind === "task");
  if (latestHasTasks && latest.status === "normal") {
    return { current: latest, dayExhausted: false };
  }
  for (let i = packages.length - 1; i >= 0; i--) {
    const p = packages[i]!;
    if (p.items.some((it) => it.kind === "task")) {
      return { current: p, dayExhausted: true };
    }
  }
  return { current: latest, dayExhausted: true };
}

/** Все предложенные сегодня задачи уже решены (можно писать caught_up / theme_closed). */
export function allOfferedTasksSolved(
  packagesItems: PlanItem[][],
  solvedTaskSlugs: ReadonlySet<string>,
): boolean {
  const offered = collectOfferedTaskSlugs(packagesItems);
  if (offered.size === 0) return true;
  for (const slug of offered) {
    if (!solvedTaskSlugs.has(slug)) return false;
  }
  return true;
}
