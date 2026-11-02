/**
 * Пагинация списков на странице темы (PLAN iter 10).
 * page 1-based; при невалидном page → 1; пустой список → одна «пустая» страница.
 */

export const TOPIC_LIST_PAGE_SIZE = 20;

export type PageSlice<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** Нормализация номера страницы из query (?page=). */
export function parsePageParam(raw: string | string[] | undefined | null): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(s ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/**
 * Нарезает массив на страницу.
 * page больше totalPages → последняя страница (удобно для устаревших ссылок).
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number = TOPIC_LIST_PAGE_SIZE,
): PageSlice<T> {
  const size = pageSize < 1 ? TOPIC_LIST_PAGE_SIZE : pageSize;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: safePage,
    pageSize: size,
    totalItems,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

/** Ссылка на список задач темы с сохранением страницы (I10-02). page=1 можно опустить. */
export function topicListHref(topicSlug: string, page?: number | null): string {
  const base = `/topics/${topicSlug}`;
  if (page == null || page <= 1) return base;
  return `${base}?page=${page}`;
}

/**
 * Ссылка на задачу; `page` — страница списка, с которой пришли (возврат «К теме»).
 * page=1 / пусто — без query.
 */
export function topicTaskHref(
  topicSlug: string,
  taskSlug: string,
  page?: number | null,
): string {
  const base = `/topics/${topicSlug}/tasks/${taskSlug}`;
  if (page == null || page <= 1) return base;
  return `${base}?page=${page}`;
}

/** Дописать `page` к уже готовому href задачи (соседи / next после ответа). */
export function withListPage(href: string, page?: number | null): string {
  if (page == null || page <= 1) return href;
  if (/[?&]page=/.test(href)) return href;
  return href.includes("?") ? `${href}&page=${page}` : `${href}?page=${page}`;
}

/**
 * Номера для UI jump-to-page: при total ≤ 7 — все; иначе окно вокруг текущей
 * + первая/последняя и «…».
 */
export type PageNavItem = number | "ellipsis";

export function pageNavItems(current: number, totalPages: number): PageNavItem[] {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const page = Math.min(Math.max(1, Math.floor(current) || 1), total);

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= total) set.add(p);
  }
  // Чтобы у краёв не было дыр вроде 1 … 2 3
  if (page <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (page >= total - 2) {
    set.add(total - 1);
    set.add(total - 2);
    set.add(total - 3);
  }

  const sorted = [...set].sort((a, b) => a - b);
  const out: PageNavItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("ellipsis");
    out.push(n);
  }
  return out;
}
