"use client";

/**
 * Компактный jump на номер страницы (при totalPages > 7).
 * Ссылки-номера остаются в серверном TopicPageNav.
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { topicListHref } from "@/lib/content/pagination";
import { TOUCH_BTN_CLASS } from "@/lib/ui/mobile";

type Props = {
  topicSlug: string;
  totalPages: number;
  currentPage: number;
};

export function TopicPageJumpForm({ topicSlug, totalPages, currentPage }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(String(currentPage));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    const page = Math.min(Math.max(1, n), totalPages);
    router.push(topicListHref(topicSlug, page));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]"
      aria-label="Перейти на страницу"
    >
      <label className="inline-flex items-center gap-1.5">
        <span>№</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={totalPages}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="box-border min-h-11 w-16 rounded-lg border border-[var(--line)] bg-white px-2 text-center text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
          aria-label={`Номер страницы от 1 до ${totalPages}`}
        />
      </label>
      <button type="submit" className={`${TOUCH_BTN_CLASS} rounded-lg border border-[var(--line)] bg-white text-[var(--ink)]`}>
        Перейти
      </button>
    </form>
  );
}
