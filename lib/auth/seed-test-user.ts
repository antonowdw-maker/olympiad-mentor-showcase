/**
 * Тестовый аккаунт SEED_TEST_USER_* (демо-пользователь).
 * Для смоука: все темы оформления и кнопка A (эталон).
 */

export function isSeedTestUserLogin(login: string | null | undefined): boolean {
  const testLogin = process.env.SEED_TEST_USER_LOGIN?.trim().toLowerCase();
  if (!testLogin || typeof login !== "string") return false;
  const L = login.trim().toLowerCase();
  return L.length > 0 && L === testLogin;
}
