/**
 * Соседи в упорядоченном списке (задачи / статьи темы).
 */

export function pickOrderedNeighbors<T extends { slug: string }>(
  items: readonly T[],
  slug: string,
): { prev: T | null; next: T | null } {
  const idx = items.findIndex((x) => x.slug === slug);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: items[idx - 1] ?? null,
    next: items[idx + 1] ?? null,
  };
}

/** Query-контекст страницы статьи (возврат к задаче / плану / странице списка). */
export type ArticleNavContext = {
  fromTask?: string;
  from?: string;
  tab?: string;
  page?: number | null;
  /** Область плана (slug | mixed) — не путать с topicSlug контента. */
  planTopic?: string;
};

/** Ссылка на статью с сохранением контекста навигации. */
export function topicArticleHref(
  topicSlug: string,
  articleSlug: string,
  ctx: ArticleNavContext = {},
): string {
  const base = `/topics/${topicSlug}/articles/${articleSlug}`;
  const q = new URLSearchParams();
  if (ctx.fromTask) q.set("fromTask", ctx.fromTask);
  if (ctx.from) q.set("from", ctx.from);
  if (ctx.tab) q.set("tab", ctx.tab);
  if (ctx.planTopic) q.set("planTopic", ctx.planTopic);
  if (ctx.page != null && ctx.page > 1) q.set("page", String(ctx.page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
