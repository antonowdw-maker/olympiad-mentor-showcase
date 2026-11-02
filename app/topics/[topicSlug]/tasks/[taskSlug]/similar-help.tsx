"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  topicSlug: string;
  workedExample: string | null;
  similarTask: { slug: string; label: string; title?: string } | null;
};

/**
 * Кнопка B: похожий разбор без эталона текущей задачи.
 * Ссылка на похожую задачу — «Задача N», не slug.
 */
export function SimilarHelp({ topicSlug, workedExample, similarTask }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--brand-soft)]/40 p-4">
      <h2 className="font-semibold">Помощь без спойлера ответа</h2>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm text-white"
      >
        {open ? "Скрыть похожий разбор" : "Похожий пример с разбором (B)"}
      </button>
      {open ? (
        <div className="space-y-2 text-sm leading-relaxed text-[var(--ink)]">
          {workedExample ? <p className="whitespace-pre-wrap">{workedExample}</p> : null}
          {similarTask ? (
            <p>
              Похожая задача:{" "}
              <Link href={`/topics/${topicSlug}/tasks/${similarTask.slug}`}>{similarTask.label}</Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
