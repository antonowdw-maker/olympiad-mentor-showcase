/**
 * Таймер сессии закрепления (P-TIMER): старт = createdAt сессии (вход в тест),
 * стоп = момент, когда все вопросы отвечены.
 */

/** Длительность в целых секундах; отрицательное / NaN → 0. */
export function computeReinforceDurationSec(
  startedAt: Date | string,
  finishedAt: Date | string,
): number {
  const a = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const b = typeof finishedAt === "string" ? new Date(finishedAt) : finishedAt;
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 1000);
}

/**
 * Эффективная длительность: сохранённая durationSec, иначе разница completedAt−createdAt
 * (для сессий до P-TIMER).
 */
export function resolveReinforceDurationSec(input: {
  durationSec: number | null | undefined;
  createdAt: Date | string;
  completedAt: Date | string | null | undefined;
  status: string;
}): number | null {
  if (input.status !== "completed") return null;
  if (
    input.durationSec != null &&
    Number.isFinite(input.durationSec) &&
    input.durationSec >= 0
  ) {
    return Math.floor(input.durationSec);
  }
  if (!input.completedAt) return null;
  return computeReinforceDurationSec(input.createdAt, input.completedAt);
}

/** Человекочитаемо: «1:05», «12:03», «1:02:03». */
export function formatReinforceDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${mm.padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * Подпись области пакета для /stats (тема / микс / сбор).
 */
export function reinforceScopeLabel(input: {
  scopeKey: string;
  topicTitle: string;
}): string {
  const key = input.scopeKey.trim();
  if (key === "mixed") return "Разные темы";
  if (key === "gather") return "Собранное обучение";
  if (key.startsWith("topic:")) {
    return input.topicTitle.trim() || key.slice("topic:".length);
  }
  return input.topicTitle.trim() || "Закрепление";
}
