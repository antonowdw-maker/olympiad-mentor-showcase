import Link from "next/link";

type Neighbor = {
  href: string;
  order: number;
  title: string;
} | null;

type Props = {
  prev: Neighbor;
  next: Neighbor;
  topicHref: string;
};

/** Навигация между статьями темы. */
export function ArticleNeighborsNav({ prev, next, topicHref }: Props) {
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm"
      aria-label="Соседние статьи"
    >
      {prev ? (
        <Link href={prev.href} className="text-[var(--muted)] no-underline hover:text-[var(--brand)]">
          ← {prev.order}. {prev.title}
        </Link>
      ) : (
        <Link href={topicHref} className="text-[var(--muted)] no-underline hover:text-[var(--brand)]">
          ← К списку статей
        </Link>
      )}
      {next ? (
        <Link href={next.href} className="font-medium text-[var(--brand)] no-underline hover:underline">
          {next.order}. {next.title} →
        </Link>
      ) : (
        <Link href={topicHref} className="font-medium text-[var(--brand)] no-underline hover:underline">
          К теме →
        </Link>
      )}
    </nav>
  );
}
