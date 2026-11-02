/**
 * Область плана дня (iter 10c): одна тема или микс открытых («Разные»).
 * Iter 13A: `gather` — отдельный scope ручного сбора (не `topic:gather`).
 */
import { isGatherPlanScope, PLAN_SCOPE_GATHER } from "@/lib/plan/learn-session";

export const PLAN_SCOPE_MIXED = "mixed";

export function topicScopeKey(topicSlug: string): string {
  return `topic:${topicSlug}`;
}

export function isMixedPlanScope(scopeKeyOrCookie: string): boolean {
  return scopeKeyOrCookie.trim() === PLAN_SCOPE_MIXED;
}

/**
 * Cookie / ?topic= → ключ БД.
 * `gather` → `gather` (не `topic:gather`). Обычный day-plan resolver gather не принимает.
 */
export function planSelectionToScopeKey(selection: string): string {
  const s = selection.trim();
  if (isMixedPlanScope(s)) return PLAN_SCOPE_MIXED;
  if (isGatherPlanScope(s)) return PLAN_SCOPE_GATHER;
  return topicScopeKey(s);
}

/** Из ключа БД — значение для cookie / UI. */
export function scopeKeyToSelection(scopeKey: string): string {
  if (isMixedPlanScope(scopeKey)) return PLAN_SCOPE_MIXED;
  if (isGatherPlanScope(scopeKey)) return PLAN_SCOPE_GATHER;
  if (scopeKey.startsWith("topic:")) return scopeKey.slice("topic:".length);
  return scopeKey;
}
