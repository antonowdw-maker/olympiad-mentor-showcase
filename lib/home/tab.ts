/**
 * Вкладки главной (UX-HOME): ?home=today|gather|topics[&subject=&grade=].
 * Дефолт всегда «Что сегодня» — не запоминаем последнюю.
 */
export const HOME_TAB_TODAY = "today";
export const HOME_TAB_GATHER = "gather";
export const HOME_TAB_TOPICS = "topics";

export type HomeTab =
  | typeof HOME_TAB_TODAY
  | typeof HOME_TAB_GATHER
  | typeof HOME_TAB_TOPICS;

export function parseHomeTab(raw: string | null | undefined): HomeTab {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === HOME_TAB_GATHER) return HOME_TAB_GATHER;
  if (v === HOME_TAB_TOPICS) return HOME_TAB_TOPICS;
  return HOME_TAB_TODAY;
}

export function homeTabHref(tab: HomeTab): string {
  if (tab === HOME_TAB_TODAY) return "/";
  return `/?home=${tab}`;
}

/** Вкладка «Темы» с фильтром класс×предмет (из левого меню). */
export function homeTopicsHref(subjectId: string, grade: number): string {
  const s = encodeURIComponent(subjectId.trim());
  const g = Number.isFinite(grade) ? Math.floor(grade) : 0;
  return `/?home=${HOME_TAB_TOPICS}&subject=${s}&grade=${g}`;
}

/**
 * Со страницы темы — назад на вкладку «Темы».
 * Если у темы есть класс (или «5-6» → слот 6), сохраняем subject=math&grade.
 */
export function topicBackToTopicsHref(classLevels: readonly string[]): string {
  for (const g of [6, 7, 8, 9, 10, 11] as const) {
    if (classLevels.includes(String(g)) || (g === 6 && classLevels.includes("5-6"))) {
      return homeTopicsHref("math", g);
    }
  }
  return homeTabHref(HOME_TAB_TOPICS);
}
