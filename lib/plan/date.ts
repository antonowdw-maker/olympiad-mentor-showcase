/**
 * Календарная дата для плана дня (REQ-PLN-03): Europe/Moscow → YYYY-MM-DD.
 */

export const DAY_PLAN_TZ = "Europe/Moscow";

/** Сегодняшняя дата в TZ плана (стабильный ключ для DayPlanPackage.date). */
export function calendarDateInTz(now: Date = new Date(), timeZone: string = DAY_PLAN_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
