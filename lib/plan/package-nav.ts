/**
 * Навигация по задачам внутри пакета плана / gather (не порядок темы).
 */
import type { PlanItem } from "@/lib/plan/build";

export type PlanTaskNeighbor = {
  slug: string;
  title: string;
  topicSlug: string;
};

/**
 * Среди пакетов дня найти пакет с задачей и соседей **по задачам**
 * (статьи пакета пропускаем — «Дальше» после ответа ведёт к следующей задаче).
 */
export function findPlanTaskNeighbors(
  packages: readonly { items: readonly PlanItem[] }[],
  taskSlug: string,
): { prev: PlanTaskNeighbor | null; next: PlanTaskNeighbor | null } {
  const needle = taskSlug.trim();
  if (!needle) return { prev: null, next: null };

  for (const pkg of packages) {
    const tasks = pkg.items.filter((i) => i.kind === "task");
    const idx = tasks.findIndex((t) => t.slug === needle);
    if (idx < 0) continue;

    const toNb = (item: PlanItem | undefined): PlanTaskNeighbor | null => {
      if (!item || item.kind !== "task") return null;
      const topic = item.topicSlug?.trim();
      if (!topic) return null;
      return { slug: item.slug, title: item.title, topicSlug: topic };
    };

    return {
      prev: toNb(tasks[idx - 1]),
      next: toNb(tasks[idx + 1]),
    };
  }

  return { prev: null, next: null };
}

/** Ссылка на задачу с сохранением контекста плана. */
export function planTaskHref(
  topicSlug: string,
  taskSlug: string,
  opts: { tab?: string | null; planTopic?: string | null },
): string {
  const q = new URLSearchParams({ from: "plan" });
  if (opts.tab === "history") q.set("tab", "history");
  const planTopic = opts.planTopic?.trim();
  if (planTopic) q.set("planTopic", planTopic);
  return `/topics/${topicSlug}/tasks/${taskSlug}?${q}`;
}
