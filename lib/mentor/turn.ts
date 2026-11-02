/**
 * Оркестрация ответа наставника: LLM | fallback → фильтр INV-08.
 */
import { buildFallbackReply } from "@/lib/mentor/fallback";
import { filterMentorReply, filterMentorReplyForTaskGroups } from "@/lib/mentor/filter";
import { mentorLlmClient, type LlmClient } from "@/lib/mentor/llm";
import {
  MENTOR_SYSTEM_PROMPT,
  buildMentorTopicUserPrompt,
  buildMentorUserPrompt,
  scrubForbiddenPii,
  type MentorPromptInput,
  type MentorTopicPromptInput,
} from "@/lib/mentor/prompt";

export type MentorTurnContext = MentorPromptInput & {
  relatedDocs: { slug: string; title: string }[];
  visibleHintTexts: string[];
  acceptedAnswers: string[];
  /** text | number | choice — усиливает фильтр чисел (I5-01) */
  answerType?: string;
  /** login / displayName / id — вычистить из промпта (INV-09) */
  piiForbidden?: string[];
  /** true → не звать Gemini, сразу fallback (мягкий лимит I5-10) */
  forceFallback?: boolean;
  forceFallbackReason?: "rate_limited" | "no_key" | "timeout" | "http" | "empty" | "network";
};

/** Чат по теме: без reveal; фильтр по канонам каждой задачи отдельно (BC-01). */
export type MentorTopicTurnContext = MentorTopicPromptInput & {
  relatedDocs: { slug: string; title: string }[];
  /** Группы acceptedAnswers по задачам темы — не плоский список. */
  topicAnswerGroups: string[][];
  piiForbidden?: string[];
  forceFallback?: boolean;
  forceFallbackReason?: "rate_limited" | "no_key" | "timeout" | "http" | "empty" | "network";
};

export type MentorTurnResult = {
  body: string;
  mode: "llm" | "fallback";
};

export async function runMentorTurn(
  ctx: MentorTurnContext,
  llm: LlmClient = mentorLlmClient,
): Promise<MentorTurnResult> {
  let userPrompt = buildMentorUserPrompt({
    ...ctx,
    acceptedAnswers: ctx.revealAllowed ? ctx.acceptedAnswers : undefined,
  });
  if (ctx.piiForbidden?.length) {
    userPrompt = scrubForbiddenPii(userPrompt, ctx.piiForbidden);
  }

  if (ctx.forceFallback) {
    const reason = ctx.forceFallbackReason ?? "rate_limited";
    console.warn(`[mentor/turn] forceFallback reason=${reason}`);
    return {
      body: buildFallbackReply({
        reason,
        relatedDocs: ctx.relatedDocs,
        hintsOpenedCount: ctx.hintsOpenedCount,
        hintStepsTotal: ctx.hintStepsTotal,
        visibleHintTexts: ctx.visibleHintTexts,
      }),
      mode: "fallback",
    };
  }

  const llmResult = await llm.generate({
    system: MENTOR_SYSTEM_PROMPT,
    user: userPrompt,
  });

  if (!llmResult.ok) {
    console.warn(
      `[mentor/turn] LLM fail reason=${llmResult.reason}`,
      llmResult.detail ? `detail=${llmResult.detail.slice(0, 200)}` : "",
    );
    const body = buildFallbackReply({
      reason: llmResult.reason,
      httpDetail: llmResult.detail,
      relatedDocs: ctx.relatedDocs,
      hintsOpenedCount: ctx.hintsOpenedCount,
      hintStepsTotal: ctx.hintStepsTotal,
      visibleHintTexts: ctx.visibleHintTexts,
    });
    return { body, mode: "fallback" };
  }

  const filtered = filterMentorReply(
    llmResult.text,
    ctx.acceptedAnswers,
    ctx.revealAllowed,
    ctx.answerType,
  );
  return { body: filtered.text, mode: "llm" };
}

export async function runMentorTopicTurn(
  ctx: MentorTopicTurnContext,
  llm: LlmClient = mentorLlmClient,
): Promise<MentorTurnResult> {
  let userPrompt = buildMentorTopicUserPrompt(ctx);
  if (ctx.piiForbidden?.length) {
    userPrompt = scrubForbiddenPii(userPrompt, ctx.piiForbidden);
  }

  if (ctx.forceFallback) {
    const reason = ctx.forceFallbackReason ?? "rate_limited";
    console.warn(`[mentor/turn] topic forceFallback reason=${reason}`);
    return {
      body: buildFallbackReply({
        reason,
        relatedDocs: ctx.relatedDocs,
        hintsOpenedCount: 0,
        hintStepsTotal: 0,
        visibleHintTexts: [],
        scope: "topic",
      }),
      mode: "fallback",
    };
  }

  const llmResult = await llm.generate({
    system: MENTOR_SYSTEM_PROMPT,
    user: userPrompt,
  });

  if (!llmResult.ok) {
    console.warn(
      `[mentor/turn] topic LLM fail reason=${llmResult.reason}`,
      llmResult.detail ? `detail=${llmResult.detail.slice(0, 200)}` : "",
    );
    return {
      body: buildFallbackReply({
        reason: llmResult.reason,
        httpDetail: llmResult.detail,
        relatedDocs: ctx.relatedDocs,
        hintsOpenedCount: 0,
        hintStepsTotal: 0,
        visibleHintTexts: [],
        scope: "topic",
      }),
      mode: "fallback",
    };
  }

  const filtered = filterMentorReplyForTaskGroups(
    llmResult.text,
    ctx.topicAnswerGroups,
    false,
    "topic",
  );
  return { body: filtered.text, mode: "llm" };
}
