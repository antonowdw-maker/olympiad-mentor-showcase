import { setUiThemeAction } from "@/lib/ui/theme-actions";
import {
  isThemeUnlocked,
  THEME_PREMIUM_UNLOCK_CUPS,
  UI_THEME_LABELS,
  UI_THEMES,
  unlockCupsForTheme,
  type UiTheme,
} from "@/lib/ui/theme";
import { TOUCH_BTN_CLASS } from "@/lib/ui/mobile";

type Props = {
  current: UiTheme;
  totalXp: number;
  /** Тестовый SEED_TEST_USER — все темы открыты. */
  bypassUnlock?: boolean;
};

/**
 * Пикер пресета оформления на главной (iter 15b+).
 * Неординарные темы — disabled до 1000 кубков (кроме bypassUnlock).
 */
export function HomeThemePicker({ current, totalXp, bypassUnlock = false }: Props) {
  return (
    <form
      action={setUiThemeAction}
      className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
    >
      <p className="text-sm font-medium text-[var(--ink)]">Оформление</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        Классика и Игровая — всегда. Дорама, Бравл и другие неординарные темы — с{" "}
        {THEME_PREMIUM_UNLOCK_CUPS} кубков. Везде в UI — кубки; бейджи меняют вид.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {UI_THEMES.map((theme) => {
          const selected = theme === current;
          const unlocked = isThemeUnlocked(theme, totalXp, { bypassUnlock });
          const need = unlockCupsForTheme(theme);
          return (
            <button
              key={theme}
              type="submit"
              name="uiTheme"
              value={theme}
              disabled={!unlocked}
              className={`${TOUCH_BTN_CLASS} rounded-lg border px-3 text-sm ${
                !unlocked
                  ? "cursor-not-allowed border-[var(--line)] text-[var(--muted)] opacity-60"
                  : selected
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] font-medium text-[var(--ink)]"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--ink)]"
              }`}
              aria-pressed={selected}
              aria-disabled={!unlocked}
              title={
                !unlocked ? `Откроется с ${need} кубков (сейчас ${totalXp})` : undefined
              }
            >
              {UI_THEME_LABELS[theme]}
              {!unlocked ? (
                <span className="ml-1 text-[0.7rem] font-normal">(с {need} кубков)</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </form>
  );
}
