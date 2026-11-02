/**
 * Пагинация списка задач темы: prev/next + номера страниц (jump-to-page).
 * Использовать сверху и снизу списка.
 */
import Link from "next/link";
import { TopicPageJumpForm } from "@/app/components/topic-page-jump-form";
import { pageNavItems, topicListHref } from "@/lib/content/pagination";
import { TOUCH_BTN_CLASS, TOUCH_ICON_BTN_CLASS } from "@/lib/ui/mobile";

type Props = {
  topicSlug: string;
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

const linkIdle =
  `${TOUCH_ICON_BTN_CLASS} rounded-lg border border-[var(--line)] bg-white text-[var(--brand)]`;
const linkCurrent =
  `${TOUCH_ICON_BTN_CLASS} rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] font-semibold text-[var(--brand)]`;

export function TopicPageNav({
  topicSlug,
  page,
  totalPages,
  hasPrev,
  hasNext,
}: Props) {
  if (totalPages <= 1) return null;

  const items = pageNavItems(page, totalPages);

  return (
    <nav className="flex flex-col gap-3" aria-label="Страницы списка задач">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {hasPrev ? (
          <Link href={topicListHref(topicSlug, page - 1)} className={`${TOUCH_BTN_CLASS} rounded-lg text-[var(--brand)]`}>
            ← Назад
          </Link>
        ) : (
          <span className={`${TOUCH_BTN_CLASS} text-[var(--muted)]`}>← Назад</span>
        )}

        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          {items.map((item, idx) =>
            item === "ellipsis" ? (
              <li
                key={`e-${idx}`}
                className="min-w-8 px-1 text-center text-[var(--muted)]"
                aria-hidden
              >
                …
              </li>
            ) : (
              <li key={item}>
                {item === page ? (
                  <span className={linkCurrent} aria-current="page">
                    {item}
                  </span>
                ) : (
                  <Link href={topicListHref(topicSlug, item)} className={linkIdle}>
                    {item}
                  </Link>
                )}
              </li>
            ),
          )}
        </ol>

        {hasNext ? (
          <Link href={topicListHref(topicSlug, page + 1)} className={`${TOUCH_BTN_CLASS} rounded-lg text-[var(--brand)]`}>
            Вперёд →
          </Link>
        ) : (
          <span className={`${TOUCH_BTN_CLASS} text-[var(--muted)]`}>Вперёд →</span>
        )}
      </div>

      <p className="text-sm text-[var(--muted)]">
        Стр. {page} из {totalPages}
      </p>

      {totalPages > 7 ? (
        <TopicPageJumpForm
          topicSlug={topicSlug}
          totalPages={totalPages}
          currentPage={page}
        />
      ) : null}
    </nav>
  );
}
