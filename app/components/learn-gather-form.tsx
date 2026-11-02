"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createGatherLearnPackageAction } from "@/lib/plan/actions";
import type { PlanTopicChoice } from "@/lib/plan/topic-preference";

type Props = {
  topics: PlanTopicChoice[];
  /** Без крупного заголовка — вкладка главной уже подписана. */
  embedded?: boolean;
};

/** Ручной сбор учебного пакета из выбранных тем (REQ-MODE-01). */
export function LearnGatherForm({ topics, embedded = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(() =>
    topics.filter((t) => t.hasUnsolved).slice(0, 1).map((t) => t.slug),
  );

  const selectable = useMemo(
    () => [...topics].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
    [topics],
  );

  function toggle(slug: string) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function selectAll() {
    setSelected(selectable.filter((t) => t.hasUnsolved).map((t) => t.slug));
  }

  function clearAll() {
    setSelected([]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createGatherLearnPackageAction(selected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/plan?topic=gather&tab=current`);
      router.refresh();
    });
  }

  if (selectable.length === 0) {
    return null;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-[var(--line)] bg-white/80 p-4"
    >
      {!embedded ? (
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Собрать обучение</h2>
          <p className="text-sm text-[var(--muted)]">
            Выбери одну или несколько тем — задачи подберём с балансом грейдов (до 6 / ~60 мин).
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Выбери одну или несколько тем — задачи с балансом грейдов (до 6 / ~60 мин).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAll}
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Выбрать все
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={pending || selected.length === 0}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          Сбросить
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {selectable.map((t) => {
          const on = selected.includes(t.slug);
          return (
            <li key={t.slug}>
              <button
                type="button"
                onClick={() => toggle(t.slug)}
                className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm transition ${
                  on
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)]"
                }`}
                aria-pressed={on}
              >
                {t.title}
                {t.hasUnsolved ? "" : " (закрыта)"}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="submit"
        disabled={pending || selected.length === 0}
        className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Собираю…" : "Собрать пакет"}
      </button>
      {error ? (
        <p className="text-sm text-[var(--warn)]" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
