"use client";

import { BadgeView } from "@/app/components/badge-view";
import { lookupBadgeCatalog } from "@/lib/progress/badge-catalog";
import type { UiTheme } from "@/lib/ui/theme";

type Badge = { code: string; title: string };

type Props = {
  badges: Badge[];
  /** Скин хрома бейджей = текущая тема оболочки. */
  theme: UiTheme;
};

/**
 * Бейджи на главной свёрткой (UX-HOME + 15b/15b+).
 * Подсказка — стилизованный fixed-tooltip у BadgeView (без native title и без раздувания скролла).
 */
export function HomeBadgesCollapsible({ badges, theme }: Props) {
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
        Бейджи
        {badges.length > 0 ? (
          <span className="ml-2 font-normal text-[var(--muted)]">({badges.length})</span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2">
        <p className="text-xs text-[var(--muted)]">
          За число разных решённых задач и за приёмы темы. Наведи или сфокусируй значок — название и
          факт (едины на всех темах; вид меняется с оформлением). Кубки — в шапке.
        </p>
        {badges.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Пока без бейджей — реши первую задачу.</p>
        ) : (
          <ul className="flex flex-wrap gap-3 pb-1" role="list">
            {badges.map((b) => {
              const meta = lookupBadgeCatalog(b.code, b.title);
              return (
                <li key={b.code}>
                  <BadgeView entry={meta} theme={theme} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
