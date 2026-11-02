import Link from "next/link";
import { notFound } from "next/navigation";
import { GradeBadge } from "@/app/components/grade-badge";
import { TaskStatement } from "@/app/components/task-statement";
import { auth } from "@/lib/auth";
import { isSeedTestUserLogin } from "@/lib/auth/seed-test-user";
import { parsePageParam, topicListHref, withListPage } from "@/lib/content/pagination";
import { getTaskNeighbors, getTaskPublic, getTopicTitleBySlug } from "@/lib/content/queries";
import { taskClientBoundaryKey } from "@/lib/content/task-client-boundary";
import { getOtherVariantUiState } from "@/lib/content/request-other-variant";
import { getMentorChatForTask } from "@/lib/mentor/actions";
import { planBackHref } from "@/lib/plan/plan-href";
import { getPlanTaskNav, getPlanTaskSince } from "@/lib/plan/service";
import { getSolvedTaskSlugs } from "@/lib/progress/queries";
import { getTaskHelpState } from "@/lib/trainer/hint-progress";
import { readBlockModeFromCookies } from "@/lib/modes/actions";
import { prisma } from "@/lib/db";
import { TaskNeighborsNav } from "./task-neighbors-nav";
import { TaskPageClient } from "./task-page-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ topicSlug: string; taskSlug: string }>;
  searchParams: Promise<{
    from?: string;
    tab?: string;
    page?: string;
    planTopic?: string;
    reinforce?: string;
  }>;
};

export default async function TaskPage({ params, searchParams }: Props) {
  const { topicSlug, taskSlug } = await params;
  const { from, tab, page: pageRaw, planTopic, reinforce } = await searchParams;
  const listPage = parsePageParam(pageRaw);
  const topicHref = topicListHref(topicSlug, listPage);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const blockMode = await readBlockModeFromCookies();
  const fromPlan = from === "plan" && Boolean(planTopic?.trim()) && Boolean(userId);

  const userLogin = userId
    ? (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { login: true },
        })
      )?.login
    : null;
  const canRevealSolution = isSeedTestUserLogin(userLogin);
  const planSince = fromPlan
    ? await getPlanTaskSince(userId!, planTopic!, taskSlug, blockMode)
    : null;

  const [{ task, error }, topicNeighbors, helpState, mentor, planNav, topicTitle] =
    await Promise.all([
      getTaskPublic(topicSlug, taskSlug, userId, {
        reinforce,
        mode: blockMode,
        planSince,
      }),
      getTaskNeighbors(topicSlug, taskSlug),
      userId ? getTaskHelpState(userId, topicSlug, taskSlug) : Promise.resolve(null),
      getMentorChatForTask(topicSlug, taskSlug),
      fromPlan
        ? getPlanTaskNav(userId!, planTopic!, taskSlug, { tab })
        : Promise.resolve(null),
      getTopicTitleBySlug(topicSlug),
    ]);

  // Ссылка на список темы: показываем название, не голое «К теме».
  const topicBackLabel = topicTitle
    ? from === "plan"
      ? `К теме · ${topicTitle}`
      : `← ${topicTitle}`
    : from === "plan"
      ? "К теме"
      : "← К теме";

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={topicHref} className="text-sm text-[var(--muted)]">
          {topicTitle ? `← ${topicTitle}` : "← К теме"}
        </Link>
        <p className="rounded-lg border border-[var(--line)] bg-white/80 p-4 text-[var(--warn)]">
          Ошибка контента задачи (видно оператору): {error}
        </p>
      </div>
    );
  }
  if (!task) notFound();

  const solved = userId ? await getSolvedTaskSlugs(userId, topicSlug) : new Set<string>();
  const initialBoost = helpState?.boostHelp ?? false;
  const mentorMessages = "error" in mentor ? [] : mentor.messages;
  const revealAllowed = "error" in mentor ? false : mentor.revealAllowed;

  const taskRow =
    userId && task.instanceId
      ? await prisma.task.findFirst({
          where: { slug: taskSlug, topic: { slug: topicSlug } },
          select: { id: true },
        })
      : null;
  const variantUi =
    userId && taskRow
      ? await getOtherVariantUiState(userId, taskRow.id, task.instanceId ?? null)
      : { allowed: false, poolSize: 0 };

  // «Уже решена» для формы — по текущему instance (не по канону): иначе после
  // «Другой вариант» lastCorrect=true показал бы кнопку до верного ответа на новом варианте.
  const currentInstanceSolved =
    userId && task.instanceId
      ? Boolean(
          await prisma.attempt.findFirst({
            where: {
              userId,
              taskInstanceId: task.instanceId,
              isCorrect: true,
            },
            select: { id: true },
          }),
        )
      : false;

  // Из плана: «Дальше» и нижняя навигация — по порядку пакета (в т.ч. gather/mixed).
  const planBack = planBackHref({ tab, planTopic });
  const nextFromPlan = planNav?.next ?? null;
  const prevFromPlan = planNav?.prev ?? null;

  const nextLabel = nextFromPlan
    ? nextFromPlan.title
    : topicNeighbors.next
      ? `${topicNeighbors.next.order}. ${topicNeighbors.next.title}`
      : null;

  const prev = prevFromPlan
    ? {
        slug: prevFromPlan.slug,
        order: 0,
        title: prevFromPlan.title,
        href: prevFromPlan.href,
      }
    : topicNeighbors.prev
      ? { ...topicNeighbors.prev, href: withListPage(topicNeighbors.prev.href, listPage) }
      : null;
  const next = nextFromPlan
    ? {
        slug: nextFromPlan.slug,
        order: 0,
        title: nextFromPlan.title,
        href: nextFromPlan.href,
      }
    : topicNeighbors.next
      ? { ...topicNeighbors.next, href: withListPage(topicNeighbors.next.href, listPage) }
      : null;

  const nextTaskHref = fromPlan
    ? (nextFromPlan?.href ?? planBack)
    : (next?.href ?? topicHref);
  const nextTaskLabel = fromPlan
    ? (nextFromPlan ? nextLabel : "к плану")
    : (nextLabel ?? "к теме");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        {from === "plan" ? (
          <Link href={planBack} className="hover:text-[var(--brand)]">
            ← К плану
          </Link>
        ) : null}
        <Link href={topicHref} className="hover:text-[var(--brand)]">
          {topicBackLabel}
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold">
            Задача {task.order}: {task.title}
          </h1>
          <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-xs text-[var(--brand)]">
            ур. {task.difficulty}
          </span>
          <GradeBadge grade={task.grade} />
          <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">
            тип: {task.answerType}
          </span>
          {solved.has(task.slug) ? (
            <span className="rounded-full bg-[var(--ok-soft)] px-2 py-0.5 text-xs font-medium text-[var(--ok)]">
              решено
            </span>
          ) : null}
        </div>
        <TaskStatement statement={task.statement} />
      </div>

      <TaskPageClient
        key={taskClientBoundaryKey(task.instanceId)}
        topicSlug={topicSlug}
        taskSlug={taskSlug}
        answerType={task.answerType}
        options={task.options}
        table={task.table}
        alreadySolved={currentInstanceSolved}
        nextTaskHref={nextTaskHref}
        nextTaskLabel={nextTaskLabel ?? "к теме"}
        relatedDocs={task.relatedDocs}
        hintSteps={task.hintSteps}
        hintStepsTotal={task.hintStepsTotal}
        hintsOpenedCount={task.hintsOpenedCount}
        hasMoreHints={task.hasMoreHints}
        articles={task.articlePreviews}
        initialBoostHelp={initialBoost}
        hasSimilarHelp={task.hasSimilarHelp}
        workedExample={task.workedExample ?? null}
        similarTask={task.similarTask ?? null}
        mentorMessages={mentorMessages}
        revealAllowed={revealAllowed}
        canRevealSolution={canRevealSolution}
        reinforce={reinforce ?? null}
        instanceId={task.instanceId ?? null}
        hasOtherVariants={Boolean(task.hasOtherVariants)}
        otherVariantAllowed={variantUi.allowed}
        blockMode={blockMode}
      />

      <TaskNeighborsNav
        prev={prev}
        next={next}
        topicHref={fromPlan ? planBack : topicHref}
      />
    </div>
  );
}
