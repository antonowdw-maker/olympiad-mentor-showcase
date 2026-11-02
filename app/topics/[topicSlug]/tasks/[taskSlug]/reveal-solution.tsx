"use client";

import { useState, useTransition } from "react";
import { revealSolutionAction } from "@/lib/mentor/actions";

type Props = {
  topicSlug: string;
  taskSlug: string;
  initiallyRevealed: boolean;
  /** Текущий instance (пул 12a); сервер сверяет со sticky. */
  instanceId?: string | null;
};

/**
 * Кнопка A: явный запрос эталона этой задачи / текущего instance (REQ-TRN-09).
 */
export function RevealSolution({
  topicSlug,
  taskSlug,
  initiallyRevealed,
  instanceId = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(initiallyRevealed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function requestReveal() {
    startTransition(async () => {
      const result = await revealSolutionAction(topicSlug, taskSlug, instanceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setAnswers(result.acceptedAnswers);
      setRevealed(true);
      setOpen(true);
    });
  }

  return (
    <section className="space-y-2 rounded-xl border border-dashed border-[var(--line)] bg-white/50 p-4">
      <h2 className="font-semibold">Решение этой задачи (A)</h2>
      <p className="text-sm text-[var(--muted)]">
        Эталон откроется только после явного нажатия. Три неверных ответа сами его не
        показывают.
      </p>

      {!revealed ? (
        <button
          type="button"
          disabled={pending}
          onClick={requestReveal}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--warn)] px-3 py-2 text-sm text-[var(--warn)] disabled:opacity-60"
        >
          {pending ? "Открываю…" : "Покажи решение этой задачи"}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] disabled:opacity-60"
          onClick={() => {
            if (answers) {
              setOpen((v) => !v);
              return;
            }
            requestReveal();
          }}
        >
          {pending ? "Загружаю…" : open && answers ? "Скрыть эталон" : "Показать эталон"}
        </button>
      )}

      {open && answers ? (
        <div className="rounded-lg bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
          <p className="font-medium">Эталон:</p>
          <ul className="list-inside list-disc">
            {answers.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--warn)]" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
