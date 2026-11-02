import Link from "next/link";
import { auth } from "@/lib/auth";
import { DayPlanBlock, type PlanTab } from "@/app/day-plan-block";
import { SyncPlanTopicCookie } from "@/app/components/sync-plan-topic-cookie";
import { canRequestNewPackage, resolveCurrentPackage } from "@/lib/plan/build";
import { calendarDateInTz } from "@/lib/plan/date";
import { resolvePlanTopicForRequest } from "@/lib/plan/resolve-request-topic";
import {
  countAvailableTasksForDay,
  ensureDayPlanForToday,
  getPackageProgressSlugs,
  listGatherPackages,
} from "@/lib/plan/service";
import { listPlanTopicChoices } from "@/lib/plan/topic-choices";
import { isGatherPlanScope, PLAN_SCOPE_GATHER } from "@/lib/plan/learn-session";
import { BLOCK_MODE_LEARN } from "@/lib/modes/block-mode";
import { loadReinforceCtaMeta } from "@/lib/reinforce/cta-meta";
import { homeTabHref, HOME_TAB_GATHER } from "@/lib/home/tab";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string; topic?: string }> };

export default async function PlanPage({ searchParams }: Props) {
  const session = await auth();
  const userId = session?.user?.id;
  const planDate = calendarDateInTz();
  const sp = await searchParams;
  const initialTab: PlanTab = sp.tab === "history" ? "history" : "current";

  if (!userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">План на день</h1>
        <p className="text-sm text-[var(--muted)]">
          Войди, чтобы увидеть персональный список.{" "}
          <Link href="/login" className="text-[var(--brand)] underline-offset-2 hover:underline">
            Войти
          </Link>
        </p>
      </div>
    );
  }

  // Данные грузим в try, JSX строим снаружи: ошибки рендера try/catch не ловит (react-hooks/error-boundaries).
  let data: PlanData;
  try {
    data = await loadPlanData(userId, planDate, sp.topic);
  } catch (e) {
    console.error("[plan] page:", e instanceof Error ? e.message : e);
    const msg =
      e instanceof Error && e.message === "USER_GONE"
        ? "Сессия устарела (аккаунт пересоздан). Выйди и войди снова."
        : e instanceof Error && e.message === "TOPIC_NOT_FOUND"
          ? "Тема не найдена. Проверь сид контента."
          : e instanceof Error && e.message === "NO_TOPICS"
            ? "Темы ещё не загружены. Выполни сид контента."
            : "Не удалось загрузить план. Попробуй обновить страницу.";
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">План на день</h1>
        <p className="text-sm text-[var(--warn)]">
          {msg}{" "}
          {e instanceof Error && e.message === "USER_GONE" ? (
            <Link href="/login" className="text-[var(--brand)] underline-offset-2 hover:underline">
              Войти
            </Link>
          ) : null}
        </p>
      </div>
    );
  }

  if (data.kind === "empty") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">План на день</h1>
        <p className="text-sm text-[var(--warn)]">Темы ещё не загружены. Выполни сид контента.</p>
      </div>
    );
  }

  const gather = data.kind === "gather";
  return (
    <div className="space-y-6">
      <SyncPlanTopicCookie topicSlug={data.topicSlug} shouldSync={data.shouldSyncCookie} />
      <p className="text-sm text-[var(--muted)]">
        {gather ? "Новый пакет вручную" : "Собрать обучение из нескольких тем"} —{" "}
        <Link
          href={homeTabHref(HOME_TAB_GATHER)}
          className="text-[var(--brand)] underline-offset-2 hover:underline"
        >
          Собрать на главной
        </Link>
        .
      </p>
      <DayPlanBlock
        key={gather ? `gather:${data.packages.length}` : data.topicSlug}
        topicSlug={data.topicSlug}
        topics={data.topics}
        date={planDate}
        initialPackages={data.packages}
        solvedTaskSlugs={data.solvedTaskSlugs}
        initialCanCreateNew={data.canCreateNew}
        initialTab={initialTab}
        variant="full"
        gatherMode={gather}
        initialReinforceMeta={data.reinforceMeta}
      />
    </div>
  );
}

type PlanTopics = Awaited<ReturnType<typeof listPlanTopicChoices>>;
type PlanPackages = Awaited<ReturnType<typeof listGatherPackages>>;

/** Всё, что нужно странице плана: темы не загружены, режим «Собранное обучение» или обычная тема. */
type PlanData =
  | { kind: "empty" }
  | {
      kind: "gather" | "topic";
      topics: PlanTopics;
      topicSlug: string;
      shouldSyncCookie: boolean;
      packages: PlanPackages;
      solvedTaskSlugs: string[];
      canCreateNew: boolean;
      reinforceMeta: Awaited<ReturnType<typeof loadReinforceCtaMeta>>;
    };

/**
 * Загрузка данных плана без JSX; ошибки (USER_GONE, TOPIC_NOT_FOUND, NO_TOPICS…) пробрасываются —
 * страница показывает по ним сообщение.
 */
async function loadPlanData(
  userId: string,
  planDate: string,
  topicParam: string | undefined,
): Promise<PlanData> {
  const topics = await listPlanTopicChoices(userId);
  if (topics.length === 0) return { kind: "empty" };
  const { topicSlug, shouldSyncCookie } = await resolvePlanTopicForRequest(topics, topicParam);

  if (isGatherPlanScope(topicSlug)) {
    const packages = await listGatherPackages(userId, planDate);
    const taskSlugs = packages.flatMap((p) =>
      p.items.filter((i) => i.kind === "task").map((i) => i.slug),
    );
    const solvedSet = await getPackageProgressSlugs(
      userId,
      PLAN_SCOPE_GATHER,
      BLOCK_MODE_LEARN,
      planDate,
    );
    const { current } = resolveCurrentPackage(packages, solvedSet);
    return {
      kind: "gather",
      topics,
      topicSlug: PLAN_SCOPE_GATHER,
      shouldSyncCookie,
      packages,
      solvedTaskSlugs: [...solvedSet],
      canCreateNew: canRequestNewPackage(current, solvedSet, taskSlugs.length > 0 ? 1 : 0),
      reinforceMeta: await loadReinforceCtaMeta(userId, packages, solvedSet),
    };
  }

  const packages = await ensureDayPlanForToday(userId, topicSlug, planDate, BLOCK_MODE_LEARN);
  const [progress, available] = await Promise.all([
    getPackageProgressSlugs(userId, topicSlug, BLOCK_MODE_LEARN, planDate),
    countAvailableTasksForDay(userId, topicSlug, planDate, BLOCK_MODE_LEARN),
  ]);
  const solvedTaskSlugs = [...progress];
  const solved = new Set(solvedTaskSlugs);
  const { current } = resolveCurrentPackage(packages, solved);
  return {
    kind: "topic",
    topics,
    topicSlug,
    shouldSyncCookie,
    packages,
    solvedTaskSlugs,
    canCreateNew: canRequestNewPackage(current, solved, available),
    reinforceMeta: await loadReinforceCtaMeta(userId, packages, solved),
  };
}
