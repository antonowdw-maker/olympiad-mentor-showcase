/**
 * L1: XP и бейджи (чистые правила; без Prisma).
 * «Приём» на MVP ≈ устойчивый прогресс по теме (≥5 уникальных верных).
 */
import type { OlympiadGrade } from "@/lib/content/grade";

export const XP_BY_GRADE: Record<OlympiadGrade, number> = {
  low: 10,
  mid: 20,
  high: 35,
};

/** −10% за каждую открытую ступень подсказки и за каждую неверную попытку. */
export const XP_PENALTY_PERCENT = 10;
/** Пол всегда ≥10% от базы. */
export const XP_MIN_PERCENT = 10;

/** База XP по грейду (100% без штрафов). */
export function xpForFirstCorrect(grade: OlympiadGrade | string): number {
  if (grade === "low" || grade === "mid" || grade === "high") {
    return XP_BY_GRADE[grade];
  }
  return XP_BY_GRADE.mid;
}

/**
 * XP за первое верное: база минус 10%×(ступени подсказок + неверные), не ниже 10% базы.
 * Целые баллы, округление вверх (ceil).
 */
export function xpAwardAmount(input: {
  grade: OlympiadGrade | string;
  hintsOpenedCount: number;
  wrongAttemptCount: number;
}): number {
  const base = xpForFirstCorrect(input.grade);
  const hints = Math.max(0, Math.floor(input.hintsOpenedCount));
  const wrongs = Math.max(0, Math.floor(input.wrongAttemptCount));
  const percent = Math.max(XP_MIN_PERCENT, 100 - XP_PENALTY_PERCENT * (hints + wrongs));
  return Math.ceil((base * percent) / 100);
}

export type MilestoneBadgeCode = "debut" | "steady" | "deep";

/** Пороги уникальных верных задач → milestone-бейджи. */
export const MILESTONE_THRESHOLDS: { code: MilestoneBadgeCode; minUnique: number; title: string }[] =
  [
    { code: "debut", minUnique: 1, title: "Первый успех" },
    { code: "steady", minUnique: 10, title: "Уверенный старт" },
    { code: "deep", minUnique: 25, title: "Глубокая практика" },
  ];

export const TECHNIQUE_BADGE_MIN = 5;

export function techniqueBadgeCode(topicSlug: string): string {
  return `technique:${topicSlug}`;
}

export function isTechniqueBadgeCode(code: string): boolean {
  return code.startsWith("technique:");
}

export function topicSlugFromTechniqueBadge(code: string): string | null {
  if (!isTechniqueBadgeCode(code)) return null;
  return code.slice("technique:".length) || null;
}

export function milestoneBadgesForUniqueCount(uniqueCorrect: number): MilestoneBadgeCode[] {
  return MILESTONE_THRESHOLDS.filter((t) => uniqueCorrect >= t.minUnique).map((t) => t.code);
}

export function shouldEarnTechniqueBadge(uniqueCorrectInTopic: number): boolean {
  return uniqueCorrectInTopic >= TECHNIQUE_BADGE_MIN;
}

export function milestoneBadgeTitle(code: MilestoneBadgeCode): string {
  return MILESTONE_THRESHOLDS.find((t) => t.code === code)?.title ?? code;
}

export function techniqueBadgeTitle(topicTitle: string): string {
  return `Приёмы: ${topicTitle}`;
}

/** XP за сданный тест закрепления (REQ-MODE-09; константа, не от состава пакета). Было 15 при «все верны». */
export const SESSION_REINFORCE_XP = 10;

export const SESSION_REINFORCED_BADGE_PREFIX = "session_reinforced:";

export function sessionReinforcedBadgeCode(sourcePackageId: string): string {
  return `${SESSION_REINFORCED_BADGE_PREFIX}${sourcePackageId}`;
}

export function sessionReinforcedBadgeTitle(): string {
  return "Материал закреплён";
}
