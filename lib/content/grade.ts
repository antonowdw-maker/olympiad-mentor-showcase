/**
 * Олимпиадный грейд сложности задачи (PLAN 10b).
 * Не путать с `difficulty` класса (`5` / `5-6` / `6`).
 */

export const OLYMPIAD_GRADES = ["low", "mid", "high"] as const;
export type OlympiadGrade = (typeof OLYMPIAD_GRADES)[number];

/** Оценка минут в плане дня по грейду (низкий / средний / высокий). */
export function estMinutesForGrade(grade: OlympiadGrade): number {
  switch (grade) {
    case "low":
      return 2;
    case "mid":
      return 6;
    case "high":
      return 12;
  }
}

/** Подпись для UI. */
export function gradeLabelRu(grade: OlympiadGrade): string {
  switch (grade) {
    case "low":
      return "низкий";
    case "mid":
      return "средний";
    case "high":
      return "высокий";
  }
}

/** Парсинг из БД / JSON; неизвестное → null. */
export function parseOlympiadGrade(raw: string): OlympiadGrade | null {
  if (raw === "low" || raw === "mid" || raw === "high") return raw;
  return null;
}

/** Порядок сложности для сравнения (закрепляющая не должна быть выше). */
export function olympiadGradeRank(grade: OlympiadGrade): number {
  switch (grade) {
    case "low":
      return 0;
    case "mid":
      return 1;
    case "high":
      return 2;
  }
}
