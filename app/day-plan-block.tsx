"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { GradeBadge } from "@/app/components/grade-badge";
import { PlanTopicPicker } from "@/app/components/plan-topic-picker";
import { AlternatePlanTopics } from "@/app/components/alternate-plan-topics";
import { createNewDayPlanPackageAction } from "@/lib/plan/actions";
import type { DayPlanPackageDto } from "@/lib/plan/service";
import { resolveCurrentPackage, type PlanItem } from "@/lib/plan/build";
import type { PlanTopicChoice } from "@/lib/plan/topic-preference";
import { isMixedPlanScope } from "@/lib/plan/scope";
import { findLastCompletedLearnPackage } from "@/lib/plan/learn-session";
import { ReinforceCta } from "@/app/components/reinforce-cta";
import type { ReinforceSessionStatus } from "@/lib/reinforce/rules";

export type PlanTab = "current" | "history";

/** Статус сессии закрепления для eligible-пакета (скрытие CTA после completed/skipped). */
export type ReinforceMetaProp = {
  packageId: string;
  status: ReinforceSessionStatus;
  sessionId: string;
};

type Props = {
  topicSlug: string;
  topics: PlanTopicChoice[];
  date: string;
  initialPackages: DayPlanPackageDto[];
  solvedTaskSlugs: string[];
  /** С сервера (I6-06); обновляется после «Новый список» */
  initialCanCreateNew: boolean;
  /** Полный UI с вкладками (страница /plan) */
  variant?: "full" | "teaser";
  /** Вкладка из URL (?tab=history) — возврат «К плану» */
  initialTab?: PlanTab;
  /** Пакеты ручного сбора (gather) — без «Новый список» плана дня. */
  gatherMode?: boolean;
  /** Мета сессии закрепления для последнего пройденного пакета. */
  initialReinforceMeta?: ReinforceMetaProp | null;
};

function statusLabel(status: string, mixed: boolean, _testMode: boolean): string | null {
  if (status === "need_study") {
    return "Для теста пока нечего набрать: сначала реши задачи в обучении.";
  }
  if (status === "theme_closed") {
    return mixed
      ? "Все открытые темы закрыты. Можно повторить статьи или выбрать одну тему."
      : "Тема закрыта. Можно повторить статьи или перейти к другой теме плана.";
  }
  if (status === "caught_up") {
    return mixed
      ? "На сегодня всё по выбранным темам. Повтори статьи, смени режим плана или загляни завтра."
      : "На сегодня всё по этой теме. Повтори статьи, смени тему плана или загляни завтра.";
  }
  return null;
}

function itemHref(item: PlanItem, tab: PlanTab, planScope: string): string {
  const topic = item.topicSlug?.trim() || "unknown";
  const q = new URLSearchParams({ from: "plan", tab, planTopic: planScope });
  return item.kind === "article"
    ? `/topics/${topic}/articles/${item.slug}?${q}`
    : `/topics/${topic}/tasks/${item.slug}?${q}`;
}

function PackageItems({
  pkg,
  solved,
  tab,
  mixed,
  planScope,
  testMode,
}: {
  pkg: DayPlanPackageDto;
  solved: Set<string>;
  tab: PlanTab;
  mixed: boolean;
  planScope: string;
  testMode: boolean;
}) {
  const tasks = pkg.items.filter((i) => i.kind === "task");
  const articles = pkg.items.filter((i) => i.kind === "article");
  const note = statusLabel(pkg.status, mixed, testMode);

  const correctCount = tasks.filter((t) => solved.has(t.slug)).length;
  const showScore = false && testMode && pkg.status === "normal" && tasks.length > 0;

  return (
    <div className="space-y-3">
      {note ? (
        <p className="text-sm text-[var(--warn)]" role="status">
          {note}
        </p>
      ) : null}

      {showScore ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          Сдано в этом списке: {correctCount} из {tasks.length} (отметка ✓ — была попытка)
        </p>
      ) : null}

      {tasks.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Задачи
          </h4>
          <ul className="space-y-2">
            {tasks.map((item) => {
              const done = solved.has(item.slug);
              return (
                <li key={`${pkg.id}-task-${item.slug}`}>
                  <Link
                    href={itemHref(item, tab, planScope)}
                    className={`flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm no-underline transition hover:border-[var(--brand)] ${
                      done
                        ? "border-[var(--ok)] bg-[var(--ok-soft)]"
                        : "border-[var(--line)] bg-[var(--bg)]/60"
                    }`}
                  >
                    <span className="min-w-0 text-[var(--ink)] [overflow-wrap:anywhere]">
                      {done ? "✓ " : ""}
                      {item.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      {item.grade ? <GradeBadge grade={item.grade} /> : null}
                      ~{item.estMinutes} мин
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : pkg.status === "theme_closed" ? (
        <p className="text-sm text-[var(--muted)]">
          Задачи темы закрыты — ниже статьи для повторения.
        </p>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          В этом списке задач нет (на сегодня всё уже предложено).
        </p>
      )}

      {articles.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Статьи
          </h4>
          <ul className="space-y-2">
            {articles.map((item) => (
              <li key={`${pkg.id}-article-${item.slug}`}>
                <Link
                  href={itemHref(item, tab, planScope)}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)]/60 px-3 py-2 text-sm no-underline transition hover:border-[var(--brand)]"
                >
                  <span className="text-[var(--ink)]">{item.title}</span>
                  <span className="text-xs text-[var(--muted)]">~{item.estMinutes} мин</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** План дня: тизер на home или полный UI на /plan. */
export function DayPlanBlock({
  topicSlug,
  topics,
  date,
  initialPackages,
  solvedTaskSlugs,
  initialCanCreateNew,
  variant = "full",
  initialTab = "current",
  gatherMode = false,
  initialReinforceMeta = null,
}: Props) {
  const [packages, setPackages] = useState(initialPackages);
  const [canCreateNew, setCanCreateNew] = useState(initialCanCreateNew);
  const [solvedSlugs, setSolvedSlugs] = useState(solvedTaskSlugs);
  const [tab, setTab] = useState<PlanTab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const testMode = false;

  const solved = useMemo(() => new Set(solvedSlugs), [solvedSlugs]);
  const mixed = isMixedPlanScope(topicSlug);

  const topicTitle = gatherMode
    ? "Собранное обучение"
    : mixed
      ? "Разные темы"
      : (topics.find((t) => t.slug === topicSlug)?.title ?? topicSlug);

  const { current: activePackage, dayExhausted } = useMemo(
    () => resolveCurrentPackage(packages, solved),
    [packages, solved],
  );
  const history = useMemo(() => {
    if (!activePackage) return packages;
    return packages.filter((p) => p.id !== activePackage.id);
  }, [packages, activePackage]);

  const reinforceEligible = useMemo(
    () => findLastCompletedLearnPackage(packages, solved),
    [packages, solved],
  );
  const reinforceTerminal =
    Boolean(reinforceEligible) &&
    initialReinforceMeta != null &&
    initialReinforceMeta.packageId === reinforceEligible?.id &&
    (initialReinforceMeta.status === "completed" ||
      initialReinforceMeta.status === "skipped");
  const showReinforceCta = Boolean(reinforceEligible) && !reinforceTerminal;

  function onNewList() {
    setError(null);
    startTransition(async () => {
      const result = await createNewDayPlanPackageAction(topicSlug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPackages(result.packages);
      setCanCreateNew(result.canCreateNew);
      setSolvedSlugs(result.solvedTaskSlugs);
      setTab("current");
    });
  }

  if (variant === "teaser") {
    const taskCount = activePackage?.items.filter((i) => i.kind === "task").length ?? 0;
    const articleCount = activePackage?.items.filter((i) => i.kind === "article").length ?? 0;
    const review =
      activePackage &&
      (activePackage.status === "theme_closed" ||
        activePackage.status === "caught_up" ||
        activePackage.status === "need_study");
    return (
      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white/80 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">Что сегодня</h2>
          <p className="text-sm text-[var(--muted)]">{date}</p>
        </div>
        <PlanTopicPicker topics={topics} currentSlug={topicSlug} />
        {activePackage ? (
          <p className="text-sm text-[var(--ink)]">
            {topicTitle}: {taskCount} задач
            {articleCount ? `, ${articleCount} статей` : ""} · ~{activePackage.totalMinutes} мин
            {history.length > 0 ? ` · в истории: ${history.length}` : ""}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">Пакет ещё не собран.</p>
        )}
        {showReinforceCta && reinforceEligible ? (
          <ReinforceCta packageId={reinforceEligible.id} packageSeq={reinforceEligible.seq} />
        ) : null}
        {review ? (
          <>
            <p className="text-sm text-[var(--warn)]" role="status">
              {statusLabel(activePackage!.status, mixed, testMode)}
            </p>
            <AlternatePlanTopics
              topicSlug={topicSlug}
              topics={topics}
              tab="current"
              navigateTo="home"
            />
          </>
        ) : dayExhausted ? (
          <>
            <p className="text-sm text-[var(--warn)]">
              {mixed
                ? "На сегодня все задачи из открытых тем уже в списках — смени режим плана или смотри историю."
                : "На сегодня все задачи этой темы уже в списках — смени тему плана или смотри историю."}
            </p>
            <AlternatePlanTopics
              topicSlug={topicSlug}
              topics={topics}
              tab="current"
              navigateTo="home"
            />
          </>
        ) : null}
        <p className="text-sm text-[var(--muted)]">
          Можно заниматься и без плана — вкладка «Темы» на главной. Полный список и история — на
          странице плана.
        </p>
        <Link
          href={`/plan?topic=${encodeURIComponent(topicSlug)}`}
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white no-underline"
        >
          Открыть план
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-semibold">План на день</h1>
        <p className="text-sm text-[var(--muted)]">{date}</p>
      </div>
      <PlanTopicPicker
        topics={topics}
        currentSlug={topicSlug}
        returnTo={`/plan?tab=${tab}`}
      />
      <p className="text-sm text-[var(--muted)]">
        {gatherMode
          ? "Ручной сбор обучения: задачи с балансом грейдов. "
          : "Быстрый план на день. "}
        Ориентир пакета ~1 час, до 6 задач. F5 не меняет список.
        {mixed
          ? " Режим «Разные темы» — задачи из нескольких открытых тем; история — отдельно от планов по одной теме."
          : gatherMode
            ? " История «Собранное обучение» — отдельно от плана по теме."
            : " История пакетов — отдельно по каждой теме."}
      </p>
      {showReinforceCta && reinforceEligible ? (
        <ReinforceCta packageId={reinforceEligible.id} packageSeq={reinforceEligible.seq} />
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-2">
        <button
          type="button"
          onClick={() => setTab("current")}
          className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm ${
            tab === "current"
              ? "bg-[var(--brand-soft)] font-medium text-[var(--brand)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          Текущий
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm ${
            tab === "history"
              ? "bg-[var(--brand-soft)] font-medium text-[var(--brand)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          История{history.length ? ` (${history.length})` : ""}
        </button>
      </div>

      {tab === "current" ? (
        activePackage ? (
          <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/80 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {topicTitle} · список {activePackage.seq}
              </h2>
              <span className="text-xs text-[var(--muted)]">~{activePackage.totalMinutes} мин</span>
            </div>
            {dayExhausted &&
            activePackage.status !== "theme_closed" &&
            activePackage.status !== "caught_up" &&
            activePackage.status !== "need_study" ? (
              <>
                <p className="text-sm text-[var(--warn)]" role="status">
                  {mixed
                    ? "На сегодня новые задачи из открытых тем закончились. Ниже — последний список; смени режим или смотри «Историю»."
                    : "На сегодня новые задачи этой темы закончились. Ниже — последний список; смени тему или смотри «Историю»."}
                </p>
                <AlternatePlanTopics topicSlug={topicSlug} topics={topics} tab="current" />
              </>
            ) : null}
            {(activePackage.status === "theme_closed" ||
              activePackage.status === "caught_up" ||
              activePackage.status === "need_study") && (
              <AlternatePlanTopics topicSlug={topicSlug} topics={topics} tab="current" />
            )}
            <PackageItems
              pkg={activePackage}
              solved={solved}
              tab="current"
              mixed={mixed}
              planScope={topicSlug}
              testMode={testMode}
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">Пакет ещё не собран.</p>
        )
      ) : history.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {mixed
            ? "Пока только один список за сегодня в режиме «Разные темы»."
            : "Пока только один список за сегодня по этой теме."}
        </p>
      ) : (
        <div className="space-y-4">
          {[...history].reverse().map((pkg) => (
            <div
              key={pkg.id}
              className="space-y-3 rounded-xl border border-[var(--line)] bg-white/60 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Список {pkg.seq}</h2>
                <span className="text-xs text-[var(--muted)]">~{pkg.totalMinutes} мин</span>
              </div>
              <PackageItems
                pkg={pkg}
                solved={solved}
                tab="history"
                mixed={mixed}
                planScope={topicSlug}
                testMode={testMode}
              />
            </div>
          ))}
        </div>
      )}

      {gatherMode ? (
        <p className="text-xs text-[var(--muted)]">
          Новый пакет — ссылка «Собрать на главной» (вкладка «Собрать обучение»), после решения
          текущего.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onNewList}
            disabled={pending || !canCreateNew}
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            title={
              canCreateNew
                ? "Собрать новый пакет из оставшихся задач"
                : "Сначала реши все задачи текущего списка"
            }
          >
            {pending ? "Собираю…" : "Новый список"}
          </button>
          {!canCreateNew ? (
            <span className="text-xs text-[var(--muted)]">
              {activePackage && activePackage.status !== "normal"
                ? mixed
                  ? "Кнопка неактивна: в режиме «Разные» на сегодня новых задач нет — смени тему или повтори статьи."
                  : "Кнопка неактивна: по этой теме на сегодня новых задач нет — смени тему или повтори статьи."
                : "Кнопка неактивна: закрой все задачи текущего списка верным ответом (просмотр решения кнопкой A сам по себе задачу не закрывает)."}
            </span>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="text-sm text-[var(--warn)]" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
