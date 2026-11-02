/**
 * Расчёт прогресса по теме (REQ-PRG-02).
 * Прогресс = доля задач темы с ≥1 верным Attempt.
 *
 * «Тема пройдена» (REQ-PRG-04 / P-TOPIC-DONE) — все каноны решены;
 * не путать с порогом сдачи закрепления (REQ-MODE-09).
 */

export type ProgressInput = {
  totalTasks: number;
  /** id задач с хотя бы одной верной попыткой */
  solvedTaskIds: string[];
};

export type ProgressResult = {
  totalTasks: number;
  solvedTasks: number;
  /** 0–100, округление вниз */
  percent: number;
};

export type TopicCompletedInput = {
  totalTasks: number;
  solvedTasks: number;
};

/**
 * Тема пройдена: есть задачи и все каноны с ≥1 верным Attempt
 * (`solvedTasks >= totalTasks`, `totalTasks > 0`).
 */
export function isTopicCompleted(input: TopicCompletedInput): boolean {
  const total = Number.isFinite(input.totalTasks)
    ? Math.max(0, Math.floor(input.totalTasks))
    : 0;
  const solved = Number.isFinite(input.solvedTasks)
    ? Math.max(0, Math.floor(input.solvedTasks))
    : 0;
  return total > 0 && solved >= total;
}

export function calculateTopicProgress(input: ProgressInput): ProgressResult {
  const totalTasks = Math.max(0, input.totalTasks);
  const uniqueSolved = new Set(input.solvedTaskIds);
  const solvedTasks = totalTasks === 0 ? 0 : Math.min(uniqueSolved.size, totalTasks);
  const percent = totalTasks === 0 ? 0 : Math.floor((solvedTasks / totalTasks) * 100);
  return { totalTasks, solvedTasks, percent };
}
