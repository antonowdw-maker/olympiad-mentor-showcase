/**
 * Политика адаптива (iter 15 → nav-left follow-up):
 * телефон ≥375px, breakpoint Tailwind `sm` = 640px.
 * Шапка auth: только кубки + ур./ранг (`xp`). Статистика / Выйти / ник — в левом меню.
 *
 * Источник истины для слотов — `headerNavSlot` / `headerItemsInSlot`;
 * UI (`SiteHeaderNav`) рендерит по ним.
 */

/** Ширина, ниже которой шапка считает экран «узким» (px). Совпадает с `sm` Tailwind. */
export const NARROW_VIEWPORT_MAX_PX = 639;

/** Минимальная сторона тач-зоны (CSS px), ориентир AC ~44. */
export const TOUCH_MIN_PX = 44;

/**
 * Tailwind-классы основной кнопки/CTA: высота ≥44px, удобный padding.
 * Подключать к submit / «Закрепить» / вкладкам / «Отправить».
 */
export const TOUCH_BTN_CLASS =
  "min-h-11 px-4 inline-flex items-center justify-center";

/** Квадратная зона иконки (бургер тем у бренда и т.п.). */
export const TOUCH_ICON_BTN_CLASS =
  "min-h-11 min-w-11 inline-flex items-center justify-center";

/**
 * Обёртка поля выбора темы (legacy native select — не использовать для длинных title).
 * Предпочтительно: `TopicSelectField` (кнопка + список на всю ширину).
 */
export const TOUCH_SELECT_FIELD_CLASS =
  "flex w-full min-w-0 flex-col gap-1.5 text-sm text-[var(--muted)]";

/** @deprecated native select плохо показывает длинные названия на мобиле */
export const TOUCH_SELECT_CLASS =
  "box-border min-h-11 w-full min-w-0 max-w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)] disabled:opacity-60";

export type HeaderNavItemId =
  | "progress"
  | "stats"
  | "xp"
  | "displayName"
  | "logout"
  | "login";

export type HeaderNavSlot = "chrome" | "menu";

/**
 * Куда класть пункт шапки.
 * `chrome` — рядом с брендом; `menu` — устаревший слот (пустой: всё ушло в side-nav).
 */
export function headerNavSlot(id: HeaderNavItemId): HeaderNavSlot {
  if (id === "xp" || id === "login") return "chrome";
  return "menu";
}

/**
 * Порядок пунктов шапки: auth — только HUD кубков/уровня; гость — «Войти».
 * `stats` / `logout` / `displayName` / `progress` в шапке не показываем (side-nav).
 */
export function headerNavItemOrder(authenticated: boolean): HeaderNavItemId[] {
  if (!authenticated) return ["login"];
  return ["xp"];
}

/**
 * Пункты слота шапки (политика → UI).
 * Слот `menu` всегда пуст — disclosure «Меню» снят.
 */
export function headerItemsInSlot(
  slot: HeaderNavSlot,
  authenticated: boolean,
): HeaderNavItemId[] {
  return headerNavItemOrder(authenticated).filter(
    (id) => headerNavSlot(id) === slot,
  );
}

/** Узкий viewport по ширине в px (для unit; в UI обычно CSS `sm:`). */
export function isNarrowViewport(widthPx: number): boolean {
  if (!Number.isFinite(widthPx) || widthPx < 0) return true;
  return widthPx <= NARROW_VIEWPORT_MAX_PX;
}
