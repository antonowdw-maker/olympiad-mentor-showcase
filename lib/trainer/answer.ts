/**
 * Нормализация и проверка ответа ученика (сервер; REQ-TRN-07 задел).
 * Полная политика подсказок — iter 4; здесь достаточно для Attempt.isCorrect.
 */
import { normalizeTableAnswer } from "@/lib/content/answer-table";

/** Гомоглифы латиница ↔ кириллица для буквенных ответов. */
const HOMOGLYPHS: Record<string, string> = {
  a: "а",
  b: "б",
  c: "в",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  h: "н",
  k: "к",
  m: "м",
  t: "т",
};

export function normalizeAnswer(raw: string, answerType: string): string {
  // Таблица: сравниваем поячеечно в каноническом виде (разделители, регистр, пробелы)
  if (answerType === "table") return normalizeTableAnswer(raw);
  let s = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (answerType === "number") {
    s = s.replace(",", ".");
  }
  // Однобуквенные / короткие choice — сводим гомоглифы
  if (s.length <= 2) {
    s = [...s].map((ch) => HOMOGLYPHS[ch] ?? ch).join("");
  }
  return s;
}

/**
 * Сравнивает ввод с acceptedAnswers (все синонимы).
 */
export function isAnswerCorrect(
  submitted: string,
  acceptedAnswers: string[],
  answerType: string,
): boolean {
  const norm = normalizeAnswer(submitted, answerType);
  return acceptedAnswers.some((a) => normalizeAnswer(a, answerType) === norm);
}
