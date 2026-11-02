/**
 * Ссылка «← К плану» с вкладкой и областью (тема / mixed).
 */
export function planBackHref(opts: {
  tab?: string | null;
  /** Cookie/область плана: slug темы или `mixed` (не topicSlug контента). */
  planTopic?: string | null;
}): string {
  const q = new URLSearchParams();
  if (opts.tab === "history") q.set("tab", "history");
  const planTopic = opts.planTopic?.trim();
  if (planTopic) q.set("topic", planTopic);
  const s = q.toString();
  return s ? `/plan?${s}` : "/plan";
}
