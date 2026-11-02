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

/** Навигация между задачами темы (или пакета плана). */
export function TaskNeighborsNav({ prev, next, topicHref }: Props) {
  const label = (n: NonNullable<Neighbor>) =>
    n.order > 0 ? `${n.order}. ${n.title}` : n.title;
  const fromPlan = topicHref.startsWith("/plan");

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm"
      aria-label="Соседние задачи"
    >
      {prev ? (
        <Link href={prev.href} className="text-[var(--muted)] no-underline hover:text-[var(--brand)]">
          ← {label(prev)}
        </Link>
      ) : (
        <Link href={topicHref} className="text-[var(--muted)] no-underline hover:text-[var(--brand)]">
          {fromPlan ? "← К плану" : "← К списку задач"}
        </Link>
      )}
      {next ? (
        <Link href={next.href} className="font-medium text-[var(--brand)] no-underline hover:underline">
          {label(next)} →
        </Link>
      ) : (
        <Link href={topicHref} className="font-medium text-[var(--brand)] no-underline hover:underline">
          {fromPlan ? "К плану →" : "К теме →"}
        </Link>
      )}
    </nav>
  );
}
