"use client";

import { useCallback, useState } from "react";
import type { AnswerTable, HintStepPublic } from "@/lib/content/schemas";
import type { MentorMessageDto } from "@/lib/mentor/actions";
import { BLOCK_MODE_LEARN, type BlockMode } from "@/lib/modes/block-mode";
import { AnswerForm } from "./answer-form";
import { ArticleModal } from "./article-modal";
import { MentorChat } from "./mentor-chat";
import { RevealSolution } from "./reveal-solution";
import { SimilarHelp } from "./similar-help";
import { TaskDocsAndHints, type ArticlePreview } from "./task-docs-and-hints";

type Similar = {
  slug: string;
  order: number;
  label: string;
  title: string;
} | null;

type Props = {
  topicSlug: string;
  taskSlug: string;
  answerType: string;
  options?: string[];
  /** Таблица для answerType table (без эталона). */
  table?: AnswerTable;
  alreadySolved: boolean;
  nextTaskHref: string;
  nextTaskLabel: string;
  relatedDocs: { slug: string; title: string }[];
  hintSteps: HintStepPublic[];
  hintStepsTotal: number;
  hintsOpenedCount: number;
  hasMoreHints: boolean;
  articles: ArticlePreview[];
  initialBoostHelp: boolean;
  hasSimilarHelp: boolean;
  workedExample: string | null;
  similarTask: Similar;
  mentorMessages: MentorMessageDto[];
  revealAllowed: boolean;
  /** Кнопка A (эталон) — только SEED_TEST_USER / ученик. */
  canRevealSolution?: boolean;
  reinforce?: string | null;
  instanceId?: string | null;
  hasOtherVariants?: boolean;
  /** P-VARIANT-AFTER-CORRECT: показывать ли «Другой вариант» (есть верный на текущем). */
  otherVariantAllowed?: boolean;
  blockMode?: BlockMode;
};

/** Клиентская оболочка страницы задачи: ответ, подсказки, A/B, наставник.
 * Перемонтируется с page через key=taskClientBoundaryKey(instanceId) (I12A-R2-01).
 */
export function TaskPageClient({
  topicSlug,
  taskSlug,
  answerType,
  options,
  table,
  alreadySolved,
  nextTaskHref,
  nextTaskLabel,
  relatedDocs,
  hintSteps,
  hintStepsTotal,
  hintsOpenedCount,
  hasMoreHints,
  articles,
  initialBoostHelp,
  hasSimilarHelp,
  workedExample,
  similarTask,
  mentorMessages,
  revealAllowed,
  canRevealSolution = false,
  reinforce = null,
  instanceId = null,
  hasOtherVariants = false,
  otherVariantAllowed = false,
  blockMode = BLOCK_MODE_LEARN,
}: Props) {
  const [boostHelp, setBoostHelp] = useState(initialBoostHelp);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const testMode = blockMode === "test";

  const openArticle = useCallback(
    (slug: string) => {
      if (articles.some((a) => a.slug === slug)) {
        setActiveSlug(slug);
        return;
      }
      window.location.href = `/topics/${topicSlug}/articles/${slug}`;
    },
    [articles, topicSlug],
  );

  const active = articles.find((a) => a.slug === activeSlug) ?? null;

  return (
    <>
      {testMode ? (
        <p className="rounded-lg border border-[var(--line)] bg-[var(--brand-soft)]/40 px-3 py-2 text-sm text-[var(--ink)]">
          Режим «Тест»: без подсказок, эталона и наставника.
        </p>
      ) : null}

      <AnswerForm
        topicSlug={topicSlug}
        taskSlug={taskSlug}
        answerType={answerType}
        options={options}
        table={table}
        alreadySolved={alreadySolved}
        nextTaskHref={nextTaskHref}
        nextTaskLabel={nextTaskLabel}
        onBoostHelp={() => setBoostHelp(true)}
        reinforce={testMode ? null : reinforce}
        instanceId={instanceId}
        hasOtherVariants={testMode ? false : hasOtherVariants}
        otherVariantAllowed={testMode ? false : otherVariantAllowed}
        testMode={testMode}
      />

      {!testMode ? (
        <>
          <TaskDocsAndHints
            topicSlug={topicSlug}
            taskSlug={taskSlug}
            relatedDocs={relatedDocs}
            hintSteps={hintSteps}
            hintStepsTotal={hintStepsTotal}
            hintsOpenedCount={hintsOpenedCount}
            hasMoreHints={hasMoreHints}
            boostHelp={boostHelp}
            onOpenArticle={openArticle}
            reinforce={reinforce}
            instanceId={instanceId}
          />

          {hasSimilarHelp ? (
            <SimilarHelp
              workedExample={workedExample}
              similarTask={similarTask}
              topicSlug={topicSlug}
            />
          ) : null}

          {canRevealSolution ? (
            <RevealSolution
              topicSlug={topicSlug}
              taskSlug={taskSlug}
              initiallyRevealed={revealAllowed}
              instanceId={instanceId}
            />
          ) : null}

          <MentorChat
            topicSlug={topicSlug}
            taskSlug={taskSlug}
            initialMessages={mentorMessages}
            initialRevealAllowed={canRevealSolution ? revealAllowed : false}
            canRevealSolution={canRevealSolution}
            onOpenArticle={openArticle}
            reinforce={reinforce}
            instanceId={instanceId}
          />
        </>
      ) : null}

      <ArticleModal article={active} onClose={() => setActiveSlug(null)} />
    </>
  );
}
