"use client";

import { useState, useTransition } from "react";
import type { HintStepPublic } from "@/lib/content/schemas";
import { openHintStepAction } from "@/lib/trainer/open-hint";

type Props = {
  topicSlug: string;
  taskSlug: string;
  initialSteps: HintStepPublic[];
  hintStepsTotal: number;
  initialOpened: number;
  initialHasMore: boolean;
  onOpenArticle?: (slug: string) => void;
  /** Подсветка усиления помощи после 3 неверных */
  boostHelp?: boolean;
  /** Контекст визита закрепления — передаём в openHintStepAction. */
  reinforce?: string | null;
  /** Изоморф (12a); null если пула нет. */
  instanceId?: string | null;
};

/**
 * Ступени с сервера: открытие через action; закрытые тексты на клиенте не хранятся.
 */
export function HintSteps({
  topicSlug,
  taskSlug,
  initialSteps,
  hintStepsTotal,
  initialOpened,
  initialHasMore,
  onOpenArticle,
  boostHelp = false,
  reinforce = null,
  instanceId = null,
}: Props) {
  const [steps, setSteps] = useState(initialSteps);
  const [opened, setOpened] = useState(initialOpened);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (hintStepsTotal === 0) {
    return <p className="text-sm text-[var(--muted)]">Подсказок пока нет.</p>;
  }

  function openNext() {
    startTransition(async () => {
      const result = await openHintStepAction(topicSlug, taskSlug, reinforce, instanceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setSteps(result.visibleSteps);
      setOpened(result.openedCount);
      setHasMore(result.hasMoreHints);
    });
  }

  return (
    <div className="space-y-3">
      {boostHelp ? (
        <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-sm text-[var(--ink)]">
          {hasMore
            ? "Уже несколько попыток — загляни в связанные статьи или открой следующую ступень подсказки. Эталон сам не появится."
            : "Уже несколько попыток — загляни в связанные статьи и перечитай открытые ступени. Эталон сам не появится."}
        </p>
      ) : null}

      <ol className="list-decimal space-y-3 pl-5">
        {steps.map((step, idx) => (
          <li key={idx} className="text-[var(--ink)]">
            {step.text}
            {step.docSlug ? (
              <>
                {" "}
                <button
                  type="button"
                  className="text-sm text-[var(--brand)] underline-offset-2 hover:underline"
                  onClick={() => onOpenArticle?.(step.docSlug!)}
                >
                  → {step.docTitle ?? "Статья"}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ol>

      {hasMore ? (
        <button
          type="button"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--brand)] px-3 py-2 text-sm text-[var(--brand)] disabled:opacity-60"
          onClick={openNext}
        >
          {pending
            ? "Открываю…"
            : `Открыть подсказку ${opened + 1} из ${hintStepsTotal}`}
        </button>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Все ступени открыты. Эталон по-прежнему скрыт.
        </p>
      )}

      {error ? (
        <p className="text-sm text-[var(--warn)]" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
