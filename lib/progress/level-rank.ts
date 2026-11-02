/**
 * Единая шкала уровня / ранга по totalXp (для всех тем оформления).
 * Уровень 0: 0…99 XP; 1: 100…199; 2: 200…299; …
 * «Кубки» в UI — тот же счётчик XP, другая подпись.
 */

export const XP_PER_LEVEL = 100;

/** Ранги по уровню. Дальше уровня 8 — «Легенда II», «III», … */
export const RANK_TITLES = [
  "Новичок",
  "Ученик",
  "Искатель",
  "Боец",
  "Стратег",
  "Чемпион",
  "Герой",
  "Мастер",
  "Легенда",
] as const;

export type RankInfo = {
  level: number;
  title: string;
  /** Прогресс внутри текущего уровня 0…99. */
  intoLevel: number;
  /** До следующего уровня. */
  xpToNext: number;
  /** 0…100 для полоски. */
  fillPct: number;
};

function clampXp(totalXp: number): number {
  if (!Number.isFinite(totalXp)) return 0;
  return Math.max(0, Math.floor(totalXp));
}

/** Уровень: floor(xp / 100), начиная с 0. */
export function levelFromXp(totalXp: number): number {
  return Math.floor(clampXp(totalXp) / XP_PER_LEVEL);
}

/** Кубки в UI = накопленный XP (1:1). */
export function cupsFromXp(totalXp: number): number {
  return clampXp(totalXp);
}

export function rankTitleForLevel(level: number): string {
  const lv = Math.max(0, Math.floor(level));
  if (lv < RANK_TITLES.length) return RANK_TITLES[lv]!;
  const extra = lv - RANK_TITLES.length + 2; // Легенда II при level 9
  return `Легенда ${roman(extra)}`;
}

function roman(n: number): string {
  const map: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let x = Math.max(1, Math.min(20, n));
  let out = "";
  for (const [v, s] of map) {
    while (x >= v) {
      out += s;
      x -= v;
    }
  }
  return out;
}

/** Полный снимок для HUD / шапки. */
export function rankInfoFromXp(totalXp: number): RankInfo {
  const xp = clampXp(totalXp);
  const level = levelFromXp(xp);
  const intoLevel = xp % XP_PER_LEVEL;
  return {
    level,
    title: rankTitleForLevel(level),
    intoLevel,
    xpToNext: XP_PER_LEVEL - intoLevel,
    fillPct: intoLevel,
  };
}
