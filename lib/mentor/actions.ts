"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { HintStep } from "@/lib/content/schemas";
import {
  getCurrentBoundContent,
  requireBoundTaskContent,
} from "@/lib/content/instance-binding";
import { isReinforceTargetTask } from "@/lib/trainer/hint-progress";
import {
  clampOpenedCount,
  effectiveHintStepsTotal,
  isReinforceVisit,
  shouldApplyReinforceHintCap,
  sliceVisibleHints,
} from "@/lib/trainer/hints";
import { runMentorTurn, runMentorTopicTurn } from "@/lib/mentor/turn";
import { hasTaskReveal, revealTaskSolution } from "@/lib/mentor/reveal";
import {
  getOrCreateTaskMentorSession,
  getOrCreateTopicMentorSession,
  loadMentorPromptHistory,
  mentorTaskScopeKey,
  mentorTopicScopeKey,
  parseTopicAnswerGroups,
} from "@/lib/mentor/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const chatSchema = z.object({
  topicSlug: z.string().min(1),
  taskSlug: z.string().min(1),
  message: z.string().min(1).max(2000),
  reinforce: z.string().optional(),
  instanceId: z.string().optional(),
});

const topicChatSchema = z.object({
  topicSlug: z.string().min(1),
  message: z.string().min(1).max(2000),
});

/** Мягкий лимит user-сообщений к ИИ на задачу (I5-10 / NFR-10). */
const MENTOR_LLM_MAX_TURNS =
  Number(process.env.MENTOR_LLM_MAX_TURNS) > 0
    ? Number(process.env.MENTOR_LLM_MAX_TURNS)
    : 30;

export type MentorMessageDto = {
  id: string;
  role: "user" | "assistant";
  body: string;
  mode: "llm" | "fallback" | "user";
  createdAt: string;
};

function toDto(m: {
  id: string;
  role: string;
  body: string;
  mode: string;
  createdAt: Date;
}): MentorMessageDto {
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    body: m.body,
    mode:
      m.role === "user" ? "user" : m.mode === "llm" ? "llm" : "fallback",
    createdAt: m.createdAt.toISOString(),
  };
}

export async function getMentorChatForTask(
  topicSlug: string,
  taskSlug: string,
): Promise<{ messages: MentorMessageDto[]; revealAllowed: boolean } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Нужно войти" };
  }

  const task = await prisma.task.findFirst({
    where: { slug: taskSlug, topic: { slug: topicSlug } },
    select: {
      id: true,
      topicId: true,
      statement: true,
      acceptedAnswers: true,
      options: true,
      hintSteps: true,
    },
  });
  if (!task) return { error: "Задача не найдена" };

  const binding = await getCurrentBoundContent(session.user.id, task);
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { login: true },
  });
  const { isSeedTestUserLogin } = await import("@/lib/auth/seed-test-user");
  const revealAllowed =
    isSeedTestUserLogin(dbUser?.login) &&
    (await hasTaskReveal(session.user.id, task.id, binding.instanceId));

  const mentorSession = await prisma.mentorSession.findUnique({
    where: {
      userId_scopeKey: {
        userId: session.user.id,
        scopeKey: mentorTaskScopeKey(task.id, binding.instanceId),
      },
    },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  const messages: MentorMessageDto[] = [...(mentorSession?.messages ?? [])]
    .reverse()
    .map(toDto);

  return { messages, revealAllowed };
}

/** История чата наставника по теме (без задачи). */
export async function getMentorChatForTopic(
  topicSlug: string,
): Promise<{ messages: MentorMessageDto[] } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Нужно войти" };
  }

  const topic = await prisma.topic.findUnique({
    where: { slug: topicSlug },
    select: { id: true },
  });
  if (!topic) return { error: "Тема не найдена" };

  const mentorSession = await prisma.mentorSession.findUnique({
    where: {
      userId_scopeKey: {
        userId: session.user.id,
        scopeKey: mentorTopicScopeKey(topic.id),
      },
    },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  return {
    messages: [...(mentorSession?.messages ?? [])].reverse().map(toDto),
  };
}

export type SendMentorResult =
  | {
      ok: true;
      user: MentorMessageDto;
      reply: MentorMessageDto;
      revealAllowed: boolean;
    }
  | { ok: false; error: string };

export type SendMentorTopicResult =
  | {
      ok: true;
      user: MentorMessageDto;
      reply: MentorMessageDto;
    }
  | { ok: false; error: string };

export async function sendMentorMessageAction(
  topicSlug: string,
  taskSlug: string,
  message: string,
  reinforce?: string | null,
  instanceId?: string | null,
): Promise<SendMentorResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти в аккаунт" };
  }

  const { assertNotTestMode } = await import("@/lib/modes/assert-learn");
  const gate = await assertNotTestMode("Наставник");
  if (!gate.ok) return gate;

  const parsed = chatSchema.safeParse({
    topicSlug,
    taskSlug,
    message: message.trim(),
    reinforce: reinforce ?? undefined,
    instanceId: instanceId ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Некорректное сообщение" };
  }

  const task = await prisma.task.findFirst({
    where: {
      slug: parsed.data.taskSlug,
      topic: { slug: parsed.data.topicSlug },
    },
  });
  if (!task) {
    return { ok: false, error: "Задача не найдена" };
  }

  const bound = await requireBoundTaskContent(
    session.user.id,
    task,
    parsed.data.instanceId,
  );
  if (!bound.ok) {
    return { ok: false, error: bound.error };
  }

  let accepted: string[];
  let relatedSlugs: string[];
  let allHints: HintStep[];
  try {
    accepted = JSON.parse(bound.binding.acceptedAnswers) as string[];
    relatedSlugs = JSON.parse(task.relatedDocSlugs) as string[];
    allHints = JSON.parse(bound.binding.hintSteps) as HintStep[];
  } catch {
    return { ok: false, error: "Ошибка контента задачи" };
  }

  const [articles, dbUser] = await Promise.all([
    prisma.docArticle.findMany({
      where: { topicId: task.topicId, slug: { in: relatedSlugs } },
      select: { slug: true, title: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { login: true, displayName: true },
    }),
  ]);
  const titleBySlug = new Map(articles.map((a) => [a.slug, a.title]));

  const incomingTarget = await isReinforceTargetTask(task.topicId, task.slug);
  const applyCap = shouldApplyReinforceHintCap(
    isReinforceVisit(parsed.data.reinforce),
    incomingTarget,
  );
  const hintStepsTotal = effectiveHintStepsTotal(allHints.length, applyCap);
  const hintsOpenedCount = clampOpenedCount(
    bound.binding.openedCount,
    hintStepsTotal,
  );
  const visibleHints = sliceVisibleHints(allHints, hintsOpenedCount);

  const recentAttempts = await prisma.attempt.findMany({
    where: {
      userId: session.user.id,
      taskId: task.id,
      solutionRevealed: false,
      ...(bound.binding.instanceId
        ? { taskInstanceId: bound.binding.instanceId }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { submittedAnswer: true, isCorrect: true },
  });

  const { isSeedTestUserLogin } = await import("@/lib/auth/seed-test-user");
  const revealAllowed =
    isSeedTestUserLogin(dbUser?.login) &&
    (await hasTaskReveal(
      session.user.id,
      task.id,
      bound.binding.instanceId,
    ));

  const mentorSession = await getOrCreateTaskMentorSession(
    session.user.id,
    task.id,
    task.topicId,
    bound.binding.instanceId,
  );

  const { userTurns, history } = await loadMentorPromptHistory(mentorSession.id);
  const forceFallback = userTurns >= MENTOR_LLM_MAX_TURNS;

  const userMsg = await prisma.mentorMessage.create({
    data: {
      sessionId: mentorSession.id,
      role: "user",
      body: parsed.data.message,
      mode: "user",
    },
  });

  const piiForbidden = [
    session.user.id,
    dbUser?.login,
    dbUser?.displayName,
    session.user.name,
  ].filter((x): x is string => Boolean(x && String(x).trim().length >= 2));

  const turn = await runMentorTurn({
    taskTitle: bound.binding.title ?? task.title,
    taskStatement: bound.binding.statement,
    relatedDocSlugs: relatedSlugs,
    relatedDocTitles: relatedSlugs.map((s) => titleBySlug.get(s) ?? s),
    relatedDocs: relatedSlugs.map((slug) => ({
      slug,
      title: titleBySlug.get(slug) ?? slug,
    })),
    recentAttempts: recentAttempts.reverse(),
    hintsOpenedCount,
    hintStepsTotal,
    visibleHintTexts: visibleHints.map((h) => h.text),
    revealAllowed,
    acceptedAnswers: accepted,
    answerType: task.answerType,
    history,
    userMessage: parsed.data.message,
    piiForbidden,
    forceFallback,
    forceFallbackReason: forceFallback ? "rate_limited" : undefined,
  });

  const saved = await prisma.mentorMessage.create({
    data: {
      sessionId: mentorSession.id,
      role: "assistant",
      body: turn.body,
      mode: turn.mode,
    },
  });

  revalidatePath(`/topics/${parsed.data.topicSlug}/tasks/${parsed.data.taskSlug}`);

  return {
    ok: true,
    revealAllowed,
    user: toDto(userMsg),
    reply: toDto(saved),
  };
}

/** Сообщение наставнику в контексте темы (REQ-MNT-01). */
export async function sendMentorTopicMessageAction(
  topicSlug: string,
  message: string,
): Promise<SendMentorTopicResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти в аккаунт" };
  }

  const parsed = topicChatSchema.safeParse({
    topicSlug,
    message: message.trim(),
  });
  if (!parsed.success) {
    return { ok: false, error: "Некорректное сообщение" };
  }

  const topic = await prisma.topic.findUnique({
    where: { slug: parsed.data.topicSlug },
    include: {
      articles: { orderBy: { order: "asc" }, select: { slug: true, title: true } },
      tasks: { select: { acceptedAnswers: true } },
    },
  });
  if (!topic) {
    return { ok: false, error: "Тема не найдена" };
  }

  const parsedGroups = parseTopicAnswerGroups(topic.tasks);
  if (!parsedGroups.ok) {
    return { ok: false, error: parsedGroups.error };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { login: true, displayName: true },
  });

  const mentorSession = await getOrCreateTopicMentorSession(session.user.id, topic.id);

  const { userTurns, history } = await loadMentorPromptHistory(mentorSession.id);
  const forceFallback = userTurns >= MENTOR_LLM_MAX_TURNS;

  const userMsg = await prisma.mentorMessage.create({
    data: {
      sessionId: mentorSession.id,
      role: "user",
      body: parsed.data.message,
      mode: "user",
    },
  });

  const piiForbidden = [
    session.user.id,
    dbUser?.login,
    dbUser?.displayName,
    session.user.name,
  ].filter((x): x is string => Boolean(x && String(x).trim().length >= 2));

  const relatedDocs = topic.articles.map((a) => ({ slug: a.slug, title: a.title }));

  const turn = await runMentorTopicTurn({
    topicTitle: topic.title,
    topicDescription: topic.description,
    articleSlugs: topic.articles.map((a) => a.slug),
    articleTitles: topic.articles.map((a) => a.title),
    relatedDocs,
    topicAnswerGroups: parsedGroups.groups,
    history,
    userMessage: parsed.data.message,
    piiForbidden,
    forceFallback,
    forceFallbackReason: forceFallback ? "rate_limited" : undefined,
  });

  const saved = await prisma.mentorMessage.create({
    data: {
      sessionId: mentorSession.id,
      role: "assistant",
      body: turn.body,
      mode: turn.mode,
    },
  });

  revalidatePath(`/topics/${parsed.data.topicSlug}`);

  return {
    ok: true,
    user: toDto(userMsg),
    reply: toDto(saved),
  };
}

export type RevealActionResult =
  | { ok: true; acceptedAnswers: string[] }
  | { ok: false; error: string };

export async function revealSolutionAction(
  topicSlug: string,
  taskSlug: string,
  instanceId?: string | null,
): Promise<RevealActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти в аккаунт" };
  }

  const { isSeedTestUserLogin } = await import("@/lib/auth/seed-test-user");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { login: true },
  });
  if (!isSeedTestUserLogin(user?.login)) {
    return { ok: false, error: "Показ эталона доступен только тестовому аккаунту" };
  }

  const { assertNotTestMode } = await import("@/lib/modes/assert-learn");
  const gate = await assertNotTestMode("Показ решения");
  if (!gate.ok) return gate;

  const result = await revealTaskSolution(
    session.user.id,
    topicSlug,
    taskSlug,
    instanceId,
  );
  if (!result.ok) return result;

  revalidatePath(`/topics/${topicSlug}/tasks/${taskSlug}`);
  return result;
}
