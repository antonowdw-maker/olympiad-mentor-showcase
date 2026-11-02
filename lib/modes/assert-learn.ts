/**
 * Серверные запреты для режима «тест» (iter 13).
 */
import { readBlockModeFromCookies } from "@/lib/modes/actions";
import { isTestMode } from "@/lib/modes/block-mode";

export async function assertNotTestMode(
  actionLabel: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = await readBlockModeFromCookies();
  if (isTestMode(mode)) {
    return {
      ok: false,
      error: `${actionLabel} недоступно в режиме «Тест». Переключись на «Обучение».`,
    };
  }
  return { ok: true };
}
