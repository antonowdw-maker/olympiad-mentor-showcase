/**
 * Режим блока: обучение | тест (iter 13).
 * Cookie `om_block_mode`; дефолт — обучение.
 */
export const BLOCK_MODE_COOKIE = "om_block_mode";

export type BlockMode = "learn" | "test";

export const BLOCK_MODE_LEARN: BlockMode = "learn";
export const BLOCK_MODE_TEST: BlockMode = "test";

/** Разобрать сырое значение cookie / формы. */
export function parseBlockMode(raw: string | null | undefined): BlockMode {
  const v = raw?.trim().toLowerCase();
  return v === BLOCK_MODE_TEST ? BLOCK_MODE_TEST : BLOCK_MODE_LEARN;
}

export function isTestMode(mode: BlockMode): boolean {
  return mode === BLOCK_MODE_TEST;
}

export function isLearnMode(mode: BlockMode): boolean {
  return mode === BLOCK_MODE_LEARN;
}

/**
 * Ключ пакетов плана с учётом режима.
 * Обучение — прежний `topic:…` / `mixed` (совместимость).
 * Тест — префикс `test:`.
 */
export function planScopeKeyForMode(baseScopeKey: string, mode: BlockMode): string {
  const base = baseScopeKey.trim();
  if (mode === BLOCK_MODE_LEARN) return base;
  if (base.startsWith("test:")) return base;
  return `test:${base}`;
}

/** Choice с ровно двумя вариантами — анти-угадайка в тесте. */
export function isBinaryChoiceOptions(options: readonly string[] | null | undefined): boolean {
  return (options?.length ?? 0) === 2;
}
