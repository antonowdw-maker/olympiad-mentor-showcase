/**
 * Политика ступенчатых подсказок (сервер; REQ-TRN-01, W-03).
 * Чистые функции — без Prisma; unit на поведение.
 */

/** Ограничить счётчик открытых ступеней [0, total]. */
export function clampOpenedCount(opened: number, total: number): number {
  if (!Number.isFinite(opened) || opened < 0) return 0;
  if (total <= 0) return 0;
  return Math.min(Math.floor(opened), total);
}

/** Уже открытые ступени (первые openedCount элементов). */
export function sliceVisibleHints<T>(steps: T[], openedCount: number): T[] {
  const n = clampOpenedCount(openedCount, steps.length);
  return steps.slice(0, n);
}

/**
 * Следующее значение openedCount после «открыть ступень».
 * Не прыгает через ступени; на потолке advanced=false.
 */
export function nextOpenedCount(
  current: number,
  total: number,
): { opened: number; advanced: boolean } {
  const cur = clampOpenedCount(current, total);
  if (total <= 0 || cur >= total) {
    return { opened: cur, advanced: false };
  }
  return { opened: cur + 1, advanced: true };
}

/** Верно при ≥3 открытых ступенях и есть похожая → предложение закрепить (REQ-TRN-10). */
export function shouldOfferReinforce(
  hintsOpenedCount: number,
  hasSimilarTask: boolean,
  threshold = 3,
): boolean {
  return hasSimilarTask && hintsOpenedCount >= threshold;
}

/**
 * Потолок ступеней на закрепляющей задаче (REQ-TRN-10 / I4-08): 0 или максимум 1.
 * Лимит только при визите с предложением закрепления (`?reinforce=1`), не глобально (FUA-01).
 */
export const REINFORCE_MAX_HINT_STEPS = 1;

/** Query-параметр входа «это закрепление после ≥3 подсказок». */
export const REINFORCE_QUERY_PARAM = "reinforce";
export const REINFORCE_QUERY_VALUE = "1";

export function isReinforceVisit(
  reinforceQuery: string | null | undefined,
): boolean {
  const v = reinforceQuery?.trim().toLowerCase();
  return v === REINFORCE_QUERY_VALUE || v === "true" || v === "reinforce";
}

/**
 * Применять лимит подсказок: ученик пришёл как на закрепление И задача — цель similar.
 */
export function shouldApplyReinforceHintCap(
  reinforceVisit: boolean,
  isIncomingSimilarTarget: boolean,
): boolean {
  return reinforceVisit && isIncomingSimilarTarget;
}

export function effectiveHintStepsTotal(
  rawTotal: number,
  applyReinforceCap: boolean,
): number {
  const n = Number.isFinite(rawTotal) ? Math.max(0, Math.floor(rawTotal)) : 0;
  if (!applyReinforceCap) return n;
  return Math.min(REINFORCE_MAX_HINT_STEPS, n);
}

/** Href закрепляющей задачи с маркером визита. */
export function reinforceTaskHref(topicSlug: string, taskSlug: string): string {
  const q = new URLSearchParams({ [REINFORCE_QUERY_PARAM]: REINFORCE_QUERY_VALUE });
  return `/topics/${topicSlug}/tasks/${taskSlug}?${q}`;
}

/** После N неверных — усиление помощи без авто-эталона (REQ-TRN-03). */
export function shouldBoostHelp(wrongAttemptCount: number, threshold = 3): boolean {
  return wrongAttemptCount >= threshold;
}
