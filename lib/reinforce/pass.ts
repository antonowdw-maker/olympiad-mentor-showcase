/**
 * Порог «тест сдан» (REQ-MODE-09): баллы по грейду, ratio 0.7.
 * Награда — константа SESSION_REINFORCE_XP (не от состава пакета).
 */
import type { OlympiadGrade } from "@/lib/content/grade";
import { parseOlympiadGrade } from "@/lib/content/grade";
import { isReinforceSessionFullyAnswered } from "@/lib/reinforce/rules";

/** Доля от maxScore; порог = ceil(ratio × max). */
export const REINFORCE_PASS_RATIO = 0.7;

/** Вес верного ответа: low / mid / high. */
export const REINFORCE_GRADE_POINTS: Record<OlympiadGrade, number> = {
  low: 1,
  mid: 2,
  high: 3,
};

export type ReinforceScoreItem = {
  answeredAt: Date | string | null;
  isCorrect: boolean | null;
  /** Task.grade; неизвестное → mid. */
  grade: string | null | undefined;
};

export type ReinforcePassSummary = {
  score: number;
  maxScore: number;
  /** Минимальный score для сдачи (ceil). */
  threshold: number;
  passed: boolean;
};

/** Баллы за одну задачу по грейду; битый grade → mid. */
export function reinforcePointsForGrade(grade: string | null | undefined): number {
  const g = parseOlympiadGrade((grade ?? "").trim()) ?? "mid";
  return REINFORCE_GRADE_POINTS[g];
}

export function reinforcePassThreshold(maxScore: number): number {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(REINFORCE_PASS_RATIO * maxScore);
}

/**
 * Скоринг сессии закрепления.
 * Не полностью отвечена → passed=false (даже если текущий score высок).
 * maxScore=0 → не сдан.
 */
export function scoreReinforceSession(
  items: readonly ReinforceScoreItem[],
): ReinforcePassSummary {
  const maxScore = items.reduce((s, i) => s + reinforcePointsForGrade(i.grade), 0);
  const threshold = reinforcePassThreshold(maxScore);
  const fully = isReinforceSessionFullyAnswered(items);

  let score = 0;
  if (fully) {
    for (const i of items) {
      if (i.isCorrect === true) score += reinforcePointsForGrade(i.grade);
    }
  }

  const passed = fully && maxScore > 0 && score >= threshold;
  return { score, maxScore, threshold, passed };
}

/** Синоним для award / UI: сдан по MODE-09. */
export function isReinforceSessionPassed(
  items: readonly ReinforceScoreItem[],
): boolean {
  return scoreReinforceSession(items).passed;
}
