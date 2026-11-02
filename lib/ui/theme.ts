/**
 * Пороги разблока тем и подписи (15b+).
 * В UI везде «кубки» = User.totalXp (1:1); в коде поле по-прежнему totalXp.
 *
 * Обычные темы (Классика, Игровая) — всегда открыты.
 * Неординарные (Дорама, Бравл и будущие) — с THEME_PREMIUM_UNLOCK_CUPS,
 * кроме тестового SEED_TEST_USER (демо-пользователь) — у него всё открыто.
 */

import { isSeedTestUserLogin } from "@/lib/auth/seed-test-user";

export const UI_THEMES = ["default", "arcade", "soft", "brawl"] as const;

export type UiTheme = (typeof UI_THEMES)[number];

export const UI_THEME_DEFAULT: UiTheme = "default";

/** Темы без порога кубков. */
export const UI_THEMES_ORDINARY = ["default", "arcade"] as const;

export type UiThemeOrdinary = (typeof UI_THEMES_ORDINARY)[number];

/**
 * Порог разблока всех неординарных тем (Дорама, Бравл, будущие).
 * Единый: 1000 кубков.
 */
export const THEME_PREMIUM_UNLOCK_CUPS = 1000;

/** @deprecated используй THEME_PREMIUM_UNLOCK_CUPS */
export const THEME_BRAWL_UNLOCK_XP = THEME_PREMIUM_UNLOCK_CUPS;
/** @deprecated используй THEME_PREMIUM_UNLOCK_CUPS */
export const THEME_BRAWL_UNLOCK_XP_TARGET = THEME_PREMIUM_UNLOCK_CUPS;
/** @deprecated используй THEME_PREMIUM_UNLOCK_CUPS */
export const THEME_DORAMA_UNLOCK_XP = THEME_PREMIUM_UNLOCK_CUPS;

/** Подписи для пикера на главной. */
export const UI_THEME_LABELS: Record<UiTheme, string> = {
  default: "Классика",
  arcade: "Игровая",
  soft: "Дорама",
  brawl: "Бравл",
};

export type ThemeUnlockOpts = {
  /** Тестовый SEED_TEST_USER — все темы без порога. */
  bypassUnlock?: boolean;
};

export function parseUiTheme(raw: unknown): UiTheme {
  if (typeof raw !== "string") return UI_THEME_DEFAULT;
  const v = raw.trim().toLowerCase();
  if (v === "dorama") return "soft";
  if ((UI_THEMES as readonly string[]).includes(v)) {
    return v as UiTheme;
  }
  return UI_THEME_DEFAULT;
}

export function isUiTheme(raw: unknown): raw is UiTheme {
  return typeof raw === "string" && (UI_THEMES as readonly string[]).includes(raw);
}

export function isOrdinaryUiTheme(theme: UiTheme): boolean {
  return (UI_THEMES_ORDINARY as readonly string[]).includes(theme);
}

/** Неординарная тема — нужен порог кубков (если нет bypass). */
export function themeRequiresUnlock(theme: UiTheme): boolean {
  return !isOrdinaryUiTheme(theme);
}

export function unlockCupsForTheme(theme: UiTheme): number {
  return themeRequiresUnlock(theme) ? THEME_PREMIUM_UNLOCK_CUPS : 0;
}

/** @deprecated alias unlockCupsForTheme */
export function unlockXpForTheme(theme: UiTheme): number {
  return unlockCupsForTheme(theme);
}

/**
 * Логин совпадает с SEED_TEST_USER_LOGIN → bypass unlock (тестовый «ученик»).
 * @deprecated используй isSeedTestUserLogin из @/lib/auth/seed-test-user
 */
export function isThemeUnlockBypassLogin(login: string | null | undefined): boolean {
  return isSeedTestUserLogin(login);
}

export function isThemeUnlocked(
  theme: UiTheme,
  totalXp: number,
  opts: ThemeUnlockOpts = {},
): boolean {
  if (opts.bypassUnlock) return true;
  if (!themeRequiresUnlock(theme)) return true;
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  return xp >= unlockCupsForTheme(theme);
}

export function resolveEffectiveUiTheme(
  raw: unknown,
  totalXp: number,
  opts: ThemeUnlockOpts = {},
): UiTheme {
  const theme = parseUiTheme(raw);
  if (!isThemeUnlocked(theme, totalXp, opts)) return UI_THEME_DEFAULT;
  return theme;
}
