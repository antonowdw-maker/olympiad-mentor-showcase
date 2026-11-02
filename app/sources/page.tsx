export const dynamic = "force-dynamic";

/**
 * Источники контента витрины: демо-набор задач.
 */
export default function SourcesPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Источники</h1>
        <p className="text-sm text-[var(--muted)]">
          Это демо-версия: в ней только собственные и классические задачи двух тем. Полный банк задач олимпиад
          ведётся в приватном репозитории; там для каждой задачи фиксируется первоисточник и
          официальное решение.
        </p>
      </header>

      <section className="space-y-2" aria-labelledby="sources-figures">
        <h2 id="sources-figures" className="text-base font-semibold text-[var(--ink)]">
          Рисунки в условиях
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Политика: <strong className="font-medium text-[var(--ink)]">A</strong> (предпочтительно) —
          SVG в условии в блоке <code className="text-[var(--ink)]">figure-svg</code>;{" "}
          <strong className="font-medium text-[var(--ink)]">B</strong> — файл в{" "}
          <code className="text-[var(--ink)]">public/content/figures/…</code>.
        </p>
      </section>
    </div>
  );
}
