import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleNeighborsNav } from "./article-neighbors-nav";
import {
  topicArticleHref,
  type ArticleNavContext,
} from "@/lib/content/neighbors";
import { parsePageParam, topicListHref, topicTaskHref } from "@/lib/content/pagination";
import { getArticleNeighbors, getArticlePublic } from "@/lib/content/queries";
import { renderSimpleMarkdown } from "@/lib/content/render-md";
import { planBackHref } from "@/lib/plan/plan-href";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ topicSlug: string; articleSlug: string }>;
  searchParams: Promise<{
    fromTask?: string;
    from?: string;
    tab?: string;
    page?: string;
    planTopic?: string;
  }>;
};

export default async function ArticlePage({ params, searchParams }: Props) {
  const { topicSlug, articleSlug } = await params;
  const { fromTask, from, tab, page: pageRaw, planTopic } = await searchParams;
  const listPage = parsePageParam(pageRaw);
  const navCtx: ArticleNavContext = {
    fromTask: fromTask || undefined,
    from: from || undefined,
    tab: tab || undefined,
    page: listPage,
    planTopic: planTopic || undefined,
  };

  const [article, neighbors] = await Promise.all([
    getArticlePublic(topicSlug, articleSlug),
    getArticleNeighbors(topicSlug, articleSlug),
  ]);
  if (!article) notFound();

  const fromPlan = from === "plan";
  const backHref = fromTask
    ? topicTaskHref(topicSlug, fromTask, listPage)
    : fromPlan
      ? planBackHref({ tab, planTopic })
      : topicListHref(topicSlug, listPage);
  const backLabel = fromTask
    ? "← Вернуться к задаче"
    : fromPlan
      ? "← К плану"
      : "← К теме";

  const topicHref = topicListHref(topicSlug, listPage);
  const prev = neighbors.prev
    ? {
        ...neighbors.prev,
        href: topicArticleHref(topicSlug, neighbors.prev.slug, navCtx),
      }
    : null;
  const next = neighbors.next
    ? {
        ...neighbors.next,
        href: topicArticleHref(topicSlug, neighbors.next.slug, navCtx),
      }
    : null;

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        <Link href={backHref} className="hover:text-[var(--brand)]">
          {backLabel}
        </Link>
        {fromPlan && !fromTask ? (
          <Link href={topicHref} className="hover:text-[var(--brand)]">
            К теме
          </Link>
        ) : null}
      </div>
      <h1 className="text-3xl font-semibold">{article.title}</h1>
      <div
        className="space-y-4 rounded-xl border border-[var(--line)] bg-white/80 p-6 shadow-sm"
        dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(article.body) }}
      />
      <ArticleNeighborsNav prev={prev} next={next} topicHref={topicHref} />
    </article>
  );
}
