"use client";

import { useEffect, useId } from "react";
import { renderSimpleMarkdown } from "@/lib/content/render-md";
import type { ArticlePreview } from "./task-docs-and-hints";

type Props = {
  article: ArticlePreview | null;
  onClose: () => void;
};

/** Модалка статьи задачи — общая для подсказок и чата наставника (I5-08). */
export function ArticleModal({ article, onClose }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!article) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [article, onClose]);

  if (!article) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[var(--line)] bg-[var(--bg)] p-4 shadow-lg sm:max-h-[85vh] sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id={titleId}
            className="min-w-0 text-xl font-semibold text-[var(--ink)] [overflow-wrap:anywhere]"
          >
            {article.title}
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
        <div
          className="space-y-4 [overflow-wrap:anywhere]"
          dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(article.body) }}
        />
        <div className="mt-6">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm text-white"
            onClick={onClose}
          >
            ← Вернуться к задаче
          </button>
        </div>
      </div>
    </div>
  );
}
