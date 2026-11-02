/**
 * Выбор темы для плана дня (после T2): cookie + дефолт по прогрессу.
 * Iter 10c: sentinel `mixed` («Разные темы»).
 */
import { PLAN_SCOPE_MIXED, isMixedPlanScope } from "@/lib/plan/scope";
import { PLAN_SCOPE_GATHER, isGatherPlanScope } from "@/lib/plan/learn-session";

export const PLAN_TOPIC_COOKIE = "om_plan_topic";
export { PLAN_SCOPE_MIXED, PLAN_SCOPE_GATHER };

export type PlanTopicChoice = {
  slug: string;
  title: string;
  order: number;
  /** В теме ещё есть задачи без верного Attempt */
  hasUnsolved: boolean;
};

export type TopicProgressLike = {
  totalTasks: number;
  solvedTasks: number;
} | null | undefined;

/**
 * Тема «открыта» для плана, только если в ней есть задачи и не все решены.
 * Тема без задач (скелет со статьями) — не открытая (PT-01).
 */
export function hasUnsolvedTasks(progress: TopicProgressLike): boolean {
  if (!progress) return false;
  return progress.totalTasks > 0 && progress.solvedTasks < progress.totalTasks;
}

/**
 * Предпочтение ученика, если валидно; иначе первая тема с нерешёнными (по order);
 * иначе первая в списке.
 * `mixed` из cookie/query сохраняем даже при <2 открытых (10C-04: смотреть историю);
 * новый выбор в пикере по-прежнему требует ≥2 (`canOfferMixedPlan` / action).
 */
export function resolvePlanTopicSlug(
  preferred: string | null | undefined,
  topics: readonly PlanTopicChoice[],
): string {
  if (topics.length === 0) {
    throw new Error("NO_TOPICS");
  }
  const sorted = [...topics].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const pref = preferred?.trim();
  if (pref && isMixedPlanScope(pref)) {
    return PLAN_SCOPE_MIXED;
  }
  if (pref && isGatherPlanScope(pref)) {
    return PLAN_SCOPE_GATHER;
  }
  if (pref && sorted.some((t) => t.slug === pref)) {
    return pref;
  }
  const open = sorted.find((t) => t.hasUnsolved);
  return open?.slug ?? sorted[0]!.slug;
}

/** true, если можно впервые предложить mixed в пикере (≥2 открытых). */
export function canOfferMixedPlan(topics: readonly PlanTopicChoice[]): boolean {
  return topics.filter((t) => t.hasUnsolved).length >= 2;
}

/** Показать пункт «Разные» в select: новый оффер или уже выбранный mixed. */
export function shouldShowMixedPlanOption(
  topics: readonly PlanTopicChoice[],
  currentSlug: string,
): boolean {
  return canOfferMixedPlan(topics) || isMixedPlanScope(currentSlug);
}

/** Другие темы с незакрытыми задачами — для подсказки при theme_closed. */
export function otherOpenTopics(
  currentSlug: string,
  topics: readonly PlanTopicChoice[],
): PlanTopicChoice[] {
  if (isMixedPlanScope(currentSlug)) {
    return topics
      .filter((t) => t.hasUnsolved)
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  }
  return topics
    .filter((t) => t.slug !== currentSlug && t.hasUnsolved)
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}
