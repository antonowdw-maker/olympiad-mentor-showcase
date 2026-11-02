"use client";

import type { HintStepPublic } from "@/lib/content/schemas";
import { HintSteps } from "./hint-steps";

export type ArticlePreview = {
  slug: string;
  title: string;
  body: string;
};

type RelatedDoc = { slug: string; title: string };

type Props = {
  topicSlug: string;
  taskSlug: string;
  relatedDocs: RelatedDoc[];
  hintSteps: HintStepPublic[];
  hintStepsTotal: number;
  hintsOpenedCount: number;
  hasMoreHints: boolean;
  boostHelp?: boolean;
  onOpenArticle: (slug: string) => void;
  reinforce?: string | null;
  instanceId?: string | null;
};

/**
 * Клиентский блок: связанные статьи + подсказки.
 * Модалка статьи — у родителя (TaskPageClient), чтобы открывать и из чата наставника.
 */
export function TaskDocsAndHints({
  topicSlug,
  taskSlug,
  relatedDocs,
  hintSteps,
  hintStepsTotal,
  hintsOpenedCount,
  hasMoreHints,
  boostHelp = false,
  onOpenArticle,
  reinforce = null,
  instanceId = null,
}: Props) {
  return (
    <>
      <section className="space-y-2 rounded-xl border border-[var(--line)] bg-white/80 p-4">
        <h2 className="font-semibold">Связанные статьи</h2>
        <ul className="list-inside list-disc">
          {relatedDocs.map((doc) => (
            <li key={doc.slug}>
              <button
                type="button"
                className="text-[var(--brand)] underline-offset-2 hover:underline"
                onClick={() => onOpenArticle(doc.slug)}
              >
                {doc.title}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 space-y-2 rounded-xl border border-dashed border-[var(--line)] bg-white/50 p-4">
        <h2 className="font-semibold">Подсказки (ступени)</h2>
        <p className="text-sm text-[var(--muted)]">
          Статьи открываются во всплывающем окне — «Вернуться к задаче».
        </p>
        <HintSteps
          topicSlug={topicSlug}
          taskSlug={taskSlug}
          initialSteps={hintSteps}
          hintStepsTotal={hintStepsTotal}
          initialOpened={hintsOpenedCount}
          initialHasMore={hasMoreHints}
          onOpenArticle={onOpenArticle}
          boostHelp={boostHelp}
          reinforce={reinforce}
          instanceId={instanceId}
        />
      </section>
    </>
  );
}
