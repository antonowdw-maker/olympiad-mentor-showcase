"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type HeaderTopicProgress = {
  topicSlug: string;
  topicTitle: string;
  percent: number;
  solvedTasks: number;
  totalTasks: number;
};

type Props = {
  /** Прогресс по темам; на странице темы показывается % текущей. */
  progressBySlug: Record<string, HeaderTopicProgress>;
};

/**
 * % в шапке вне главной — для темы из URL, иначе скрыт.
 * На главной прогресс уже в карточках тем.
 */
export function HeaderProgress({ progressBySlug }: Props) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/login") return null;

  const slug = pathname.match(/^\/topics\/([^/]+)/)?.[1];
  if (!slug) return null;
  const progress = progressBySlug[slug];
  if (!progress) return null;

  return (
    <Link
      href={`/topics/${progress.topicSlug}`}
      className="inline-flex min-h-11 items-center no-underline tabular-nums text-[var(--brand)]"
      title={`${progress.topicTitle}: ${progress.solvedTasks} из ${progress.totalTasks}`}
    >
      {progress.percent}%
    </Link>
  );
}
