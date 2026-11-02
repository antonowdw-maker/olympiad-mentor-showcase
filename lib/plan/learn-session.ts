/**
 * Завершённость учебного пакета и scope ручного сбора (iter 13A).
 */
import type { DayPlanPackageStatus, PlanItem } from "@/lib/plan/build";

/** ScopeKey пакетов «Собрать обучение» (не смешивать с topic:/mixed плана дня). */
export const PLAN_SCOPE_GATHER = "gather";

export function isGatherPlanScope(scopeKeyOrSelection: string): boolean {
  return scopeKeyOrSelection.trim() === PLAN_SCOPE_GATHER;
}

/**
 * Учебный пакет пройден: у каждой задачи пакета есть верный Attempt (канон).
 * Статьи не блокируют.
 */
export function isLearnPackageComplete(
  items: readonly PlanItem[],
  solvedTaskSlugs: ReadonlySet<string>,
): boolean {
  const tasks = items.filter((i) => i.kind === "task");
  if (tasks.length === 0) return false;
  return tasks.every((t) => solvedTaskSlugs.has(t.slug));
}

/** Уникальные topicSlug из элементов пакета (для прогресса gather). */
export function collectTopicSlugsFromPlanItems(items: readonly PlanItem[]): string[] {
  const out = new Set<string>();
  for (const it of items) {
    const s = it.topicSlug?.trim();
    if (s) out.add(s);
  }
  return [...out];
}

/**
 * Последний по порядку normal-пакет, у которого все задачи решены.
 * Нужен для CTA закрепления, когда «текущий» уже review без задач (I13A-02).
 */
export function findLastCompletedLearnPackage<
  T extends { id: string; items: PlanItem[]; status: DayPlanPackageStatus },
>(packages: readonly T[], solvedTaskSlugs: ReadonlySet<string>): T | null {
  for (let i = packages.length - 1; i >= 0; i--) {
    const p = packages[i]!;
    if (p.status !== "normal") continue;
    if (isLearnPackageComplete(p.items, solvedTaskSlugs)) return p;
  }
  return null;
}
