/**
 * Служебные selection/scope плана дня — нельзя использовать как slug темы.
 * Нейтральный модуль: без зависимости content ↔ plan (I13A-R3-02).
 */
export const RESERVED_PLAN_SELECTION_SLUGS = ["mixed", "gather"] as const;

export function isReservedPlanSelectionSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (RESERVED_PLAN_SELECTION_SLUGS as readonly string[]).includes(s);
}
