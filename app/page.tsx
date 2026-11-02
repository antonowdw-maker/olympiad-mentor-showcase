import Link from "next/link";
import { auth } from "@/lib/auth";
import { DayPlanBlock } from "@/app/day-plan-block";
import { HomeBadgesCollapsible } from "@/app/components/home-badges-collapsible";
import { HomeTabs } from "@/app/components/home-tabs";
import { HomeThemePicker } from "@/app/components/home-theme-picker";
import { LearnGatherForm } from "@/app/components/learn-gather-form";
import { TopicJumpSelect } from "@/app/components/topic-jump-select";
import { listTopics } from "@/lib/content/queries";
import { prisma } from "@/lib/db";
import { resolveEffectiveUiTheme, UI_THEME_DEFAULT, isThemeUnlockBypassLogin } from "@/lib/ui/theme";
import {
  HOME_TAB_GATHER,
  HOME_TAB_TODAY,
  HOME_TAB_TOPICS,
  parseHomeTab,
} from "@/lib/home/tab";
import { isTopicCompleted } from "@/lib/progress/calculate";
import {
  parseSideNavGrade,
  parseSideNavSubjectId,
  subjectHomeTagline,
  topicsForNavSlot,
} from "@/lib/ui/side-nav";
import { canRequestNewPackage, resolveCurrentPackage } from "@/lib/plan/build";
import { calendarDateInTz } from "@/lib/plan/date";
import { isGatherPlanScope, PLAN_SCOPE_GATHER } from "@/lib/plan/learn-session";
import { resolvePlanTopicForRequest } from "@/lib/plan/resolve-request-topic";
import {
  countAvailableTasksForDay,
  ensureDayPlanForToday,
  getPackageProgressSlugs,
  listGatherPackages,
} from "@/lib/plan/service";
import { listPlanTopicChoices } from "@/lib/plan/topic-choices";
import { BLOCK_MODE_LEARN } from "@/lib/modes/block-mode";
import { getUserXpSummary } from "@/lib/progress/award";
import { getTopicProgressForUser } from "@/lib/progress/queries";
import { loadReinforceCtaMeta } from "@/lib/reinforce/cta-meta";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ home?: string; subject?: string; grade?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const homeTab = parseHomeTab(sp.home);
  const navSubject = parseSideNavSubjectId(sp.subject);
  const navGrade = parseSideNavGrade(sp.grade);

  const [topicsRaw, session] = await Promise.all([listTopics(), auth()]);
  const userId = session?.user?.id;
  let xpSummary: Awaited<ReturnType<typeof getUserXpSummary>> | null = null;
  let uiTheme = UI_THEME_DEFAULT;
  let themeBypass = false;
  if (userId) {
    const [xp, userRow] = await Promise.all([
      getUserXpSummary(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { uiTheme: true, totalXp: true, login: true },
      }),
    ]);
    xpSummary = xp;
    themeBypass = isThemeUnlockBypassLogin(userRow?.login);
    uiTheme = resolveEffectiveUiTheme(userRow?.uiTheme, userRow?.totalXp ?? 0, {
      bypassUnlock: themeBypass,
    });
  }

  const withProgress = await Promise.all(
    topicsRaw.map(async (t) => ({
      ...t,
      progress: userId ? await getTopicProgressForUser(userId, t.slug) : null,
    })),
  );

  let dayPlan: Awaited<ReturnType<typeof ensureDayPlanForToday>> | null = null;
  let solvedTaskSlugs: string[] = [];
  let canCreateNew = false;
  let topicSlug = "";
  let planTopics: Awaited<ReturnType<typeof listPlanTopicChoices>> = [];
  let planLoadError = false;
  let planSessionStale = false;
  let gatherMode = false;
  let reinforceMeta: Awaited<ReturnType<typeof loadReinforceCtaMeta>> = null;
  const planDate = calendarDateInTz();

  if (userId) {
    try {
      planTopics = await listPlanTopicChoices(userId);
      if (planTopics.length > 0) {
        const resolved = await resolvePlanTopicForRequest(planTopics, undefined);
        topicSlug = resolved.topicSlug;

        if (isGatherPlanScope(topicSlug)) {
          gatherMode = true;
          dayPlan = await listGatherPackages(userId, planDate);
          const solvedSet = await getPackageProgressSlugs(
            userId,
            PLAN_SCOPE_GATHER,
            BLOCK_MODE_LEARN,
            planDate,
          );
          solvedTaskSlugs = [...solvedSet];
          const { current } = resolveCurrentPackage(dayPlan, solvedSet);
          canCreateNew = canRequestNewPackage(
            current,
            solvedSet,
            dayPlan.some((p) => p.items.some((i) => i.kind === "task")) ? 1 : 0,
          );
          reinforceMeta = await loadReinforceCtaMeta(userId, dayPlan, solvedSet);
        } else {
          dayPlan = await ensureDayPlanForToday(
            userId,
            topicSlug,
            planDate,
            BLOCK_MODE_LEARN,
          );
          const [progress, available] = await Promise.all([
            getPackageProgressSlugs(userId, topicSlug, BLOCK_MODE_LEARN, planDate),
            countAvailableTasksForDay(userId, topicSlug, planDate, BLOCK_MODE_LEARN),
          ]);
          solvedTaskSlugs = [...progress];
          const solvedSet = new Set(solvedTaskSlugs);
          const { current } = resolveCurrentPackage(dayPlan, solvedSet);
          canCreateNew = canRequestNewPackage(current, solvedSet, available);
          reinforceMeta = await loadReinforceCtaMeta(userId, dayPlan, solvedSet);
        }
      }
    } catch (e) {
      console.error("[home] day plan:", e instanceof Error ? e.message : e);
      dayPlan = null;
      planLoadError = true;
      planSessionStale = e instanceof Error && e.message === "USER_GONE";
    }
  }

  const showGatherTab = Boolean(userId && planTopics.length > 0);

  const topicsForTab =
    homeTab === HOME_TAB_TOPICS && navSubject && navGrade
      ? (() => {
          const slotSlugs = new Set(
            topicsForNavSlot(
              withProgress.map((t) => {
                let classLevels: string[] = [];
                try {
                  const parsed = JSON.parse(t.classLevels) as unknown;
                  if (Array.isArray(parsed)) {
                    classLevels = parsed.filter((x): x is string => typeof x === "string");
                  }
                } catch {
                  classLevels = [];
                }
                return {
                  slug: t.slug,
                  title: t.title,
                  order: t.order,
                  classLevels,
                };
              }),
              navGrade,
              navSubject,
            ).map((t) => t.slug),
          );
          return withProgress.filter((t) => slotSlugs.has(t.slug));
        })()
      : withProgress;

  return (
    <div className="space-y-6">
      {homeTab === HOME_TAB_TOPICS && navSubject ? (
        <p className="max-w-xl text-base leading-relaxed text-[var(--muted)]">
          {subjectHomeTagline(navSubject)}
        </p>
      ) : null}

      <HomeTabs current={homeTab} showGather={showGatherTab} />

      {homeTab === HOME_TAB_TODAY ? (
        userId && dayPlan && topicSlug ? (
          <DayPlanBlock
            key={gatherMode ? `gather:${dayPlan.length}` : topicSlug}
            topicSlug={gatherMode ? PLAN_SCOPE_GATHER : topicSlug}
            topics={planTopics}
            date={planDate}
            initialPackages={dayPlan}
            solvedTaskSlugs={solvedTaskSlugs}
            initialCanCreateNew={canCreateNew}
            variant="teaser"
            gatherMode={gatherMode}
            initialReinforceMeta={reinforceMeta}
          />
        ) : (
          <section className="rounded-xl border border-dashed border-[var(--line)] bg-white/50 p-4">
            <h2 className="text-lg font-semibold">Что сегодня</h2>
            {userId ? (
              <p className="mt-2 text-sm text-[var(--warn)]">
                {planSessionStale
                  ? "Сессия устарела (аккаунт пересоздан). Выйди и войди снова — затем план соберётся."
                  : planLoadError
                    ? "Не удалось загрузить план. Обнови страницу или проверь сид контента."
                    : "План пока пуст — темы ещё не загружены. Выполни сид контента."}{" "}
                {planSessionStale ? (
                  <Link href="/login" className="text-[var(--brand)] underline-offset-2 hover:underline">
                    Войти
                  </Link>
                ) : null}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Войди в аккаунт, чтобы увидеть персональный план.{" "}
                <Link href="/login" className="text-[var(--brand)] underline-offset-2 hover:underline">
                  Войти
                </Link>
              </p>
            )}
          </section>
        )
      ) : null}

      {homeTab === HOME_TAB_GATHER ? (
        showGatherTab ? (
          <LearnGatherForm topics={planTopics} embedded />
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Войди и загрузи темы, чтобы собрать обучение.{" "}
            <Link href="/login" className="text-[var(--brand)] underline-offset-2 hover:underline">
              Войти
            </Link>
          </p>
        )
      ) : null}

      {homeTab === HOME_TAB_TOPICS ? (
        <section className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Можно заниматься свободно, не только по дневному плану.
            {navSubject && navGrade
              ? ` · ${navGrade} класс`
              : null}
          </p>
          <TopicJumpSelect
            topics={topicsForTab.map((t) => ({ slug: t.slug, title: t.title }))}
          />
          {topicsForTab.length === 0 ? (
            <p className="rounded-lg border border-[var(--line)] bg-white/80 p-4 text-[var(--muted)]">
              {navSubject && navGrade
                ? "Пока пусто — для этого класса и предмета тем ещё нет."
                : (
                  <>
                    Контент ещё не загружен. Выполни{" "}
                    <code className="text-[var(--ink)]">npm run db:reset</code>.
                  </>
                )}
            </p>
          ) : (
            <ul className="space-y-3">
              {topicsForTab.map((t) => {
                const p = t.progress;
                const started = Boolean(p && p.solvedTasks > 0);
                const done = Boolean(
                  p && isTopicCompleted({ solvedTasks: p.solvedTasks, totalTasks: p.totalTasks }),
                );
                // Фон белый + акцент слева — без сплошной заливки brand/ok (сливается с текстом).
                const accentBorder = done
                  ? "border-l-[var(--ok)]"
                  : started
                    ? "border-l-[var(--brand)]"
                    : "border-l-[var(--line)]";
                const accentHover = done
                  ? "hover:border-l-[var(--ok)]"
                  : started
                    ? "hover:border-l-[var(--brand)]"
                    : "hover:border-l-[var(--brand)]";
                const statusClass = done
                  ? "text-[var(--ok)]"
                  : started
                    ? "text-[var(--brand)]"
                    : "text-[var(--muted)]";

                return (
                  <li key={t.slug}>
                    <Link
                      href={`/topics/${t.slug}`}
                      className={`block rounded-xl border border-[var(--line)] border-l-4 bg-white p-4 text-[var(--ink)] no-underline shadow-sm transition hover:border-[var(--brand)] hover:shadow ${accentBorder} ${accentHover}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="font-semibold text-[var(--ink)]">{t.title}</div>
                        {p ? (
                          <span className={`text-sm font-medium tabular-nums ${statusClass}`}>
                            {done
                              ? `Тема пройдена · ${p.percent}%`
                              : started
                                ? `Решено ${p.solvedTasks} из ${p.totalTasks} · ${p.percent}%`
                                : `Ещё не начинал · ${p.percent}%`}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                        {t.description}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {userId ? (
        <div className="space-y-3">
          <HomeThemePicker
            current={uiTheme}
            totalXp={xpSummary?.totalXp ?? 0}
            bypassUnlock={themeBypass}
          />
          {xpSummary ? (
            <HomeBadgesCollapsible badges={xpSummary.badges} theme={uiTheme} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
