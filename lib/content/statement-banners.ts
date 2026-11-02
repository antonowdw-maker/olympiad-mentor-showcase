/**
 * Маркеры в первой строке условия (C-NIT / Verifier: мизер).
 * Рендер — `TaskStatement`: плашка, тело без дубля строки.
 */

/** Первая строка: «Игра по правилам мизера!» */
export const MISERE_BANNER_RE = /^Игра по правилам мизера!\s*\n?/u;

export function splitMisereBanner(text: string): { banner: boolean; body: string } {
  const m = MISERE_BANNER_RE.exec(text);
  if (!m) return { banner: false, body: text };
  return { banner: true, body: text.slice(m[0].length) };
}
