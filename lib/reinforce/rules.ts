/**
 * Чистые правила сессии закрепления (13B/C) — без Prisma.
 */
import type { PlanItem } from "@/lib/plan/build";
import { isLearnPackageComplete } from "@/lib/plan/learn-session";

export type ReinforceSessionStatus = "active" | "completed" | "skipped";

/** Slug задач из учебного пакета (порядок пакета). */
export function taskSlugsFromLearnPackage(items: readonly PlanItem[]): string[] {
  return items.filter((i) => i.kind === "task").map((i) => i.slug);
}

export function canStartReinforceForPackage(
  items: readonly PlanItem[],
  solvedTaskSlugs: ReadonlySet<string>,
  existingStatus: ReinforceSessionStatus | null,
): { ok: true } | { ok: false; reason: "INCOMPLETE" | "ALREADY_DONE" | "SKIPPED" } {
  if (!isLearnPackageComplete(items, solvedTaskSlugs)) {
    return { ok: false, reason: "INCOMPLETE" };
  }
  if (existingStatus === "completed") return { ok: false, reason: "ALREADY_DONE" };
  if (existingStatus === "skipped") return { ok: false, reason: "SKIPPED" };
  return { ok: true };
}

/** Первый неотвеченный вопрос; null если все отвечены. */
export function findCurrentReinforceItemIndex(
  items: readonly { answeredAt: Date | string | null }[],
): number | null {
  const idx = items.findIndex((i) => !i.answeredAt);
  return idx < 0 ? null : idx;
}

export function isReinforceSessionFullyAnswered(
  items: readonly { answeredAt: Date | string | null }[],
): boolean {
  return items.length > 0 && items.every((i) => Boolean(i.answeredAt));
}

/**
 * Все ответы верны (и сессия полностью отвечена).
 * Для награды / «сдан» — REQ-MODE-09 (`scoreReinforceSession` / `isReinforceSessionPassed`), не этот хелпер.
 */
export function isReinforceSessionAllCorrect(
  items: readonly {
    answeredAt: Date | string | null;
    isCorrect: boolean | null;
  }[],
): boolean {
  return (
    isReinforceSessionFullyAnswered(items) &&
    items.every((i) => i.isCorrect === true)
  );
}
