"use client";

/**
 * Левое nav-меню (AC-NAV).
 * Иерархия: класс → предмет → темы; пустые ветки — «Пока пусто».
 * Desktop (md+): рельс w-12 в потоке + hover-панель absolute (без layout shift);
 * sticky top-0, чтобы меню не уезжало на длинных страницах. Mobile: drawer.
 */
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { CupIcon } from "@/app/components/cup-icon";
import { isTopicCompleted } from "@/lib/progress/calculate";
import {
  overallProgressPercent,
  SIDE_NAV_GRADES,
  SIDE_NAV_VISIBLE_GRADES,
  SIDE_NAV_VISIBLE_SUBJECTS,
  topicsForNavSlot,
  type SideNavSubjectId,
  type SideNavTopicProgress,
  type SideNavTopicRef,
} from "@/lib/ui/side-nav";
import { homeTopicsHref } from "@/lib/home/tab";
import { TOUCH_BTN_CLASS, TOUCH_ICON_BTN_CLASS } from "@/lib/ui/mobile";

type SideNavData = {
  topics: SideNavTopicRef[];
  progressBySlug: Record<string, SideNavTopicProgress>;
  authenticated: boolean;
  displayLabel: string | null;
  totalXp: number | null;
  logoutAction: (formData: FormData) => void | Promise<void>;
};

type Props = SideNavData & {
  headerRight: ReactNode;
  children: ReactNode;
};

export function AppChrome({
  topics,
  progressBySlug,
  authenticated,
  displayLabel,
  totalXp,
  logoutAction,
  headerRight,
  children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelId = useId();

  const progressList = topics.map((t) => {
    const p = progressBySlug[t.slug];
    return {
      solvedTasks: p?.solvedTasks ?? 0,
      totalTasks: p?.totalTasks ?? 0,
      percent: p?.percent ?? 0,
    };
  });
  const overall = authenticated ? overallProgressPercent(progressList) : null;

  const navProps: SideNavData & { overall: number | null } = {
    topics,
    progressBySlug,
    authenticated,
    displayLabel,
    totalXp,
    logoutAction,
    overall,
  };

  return (
    <div className="flex min-h-screen items-stretch">
      <DesktopSideNav {...navProps} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--line)] bg-[var(--surface)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:py-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className={`${TOUCH_ICON_BTN_CLASS} rounded-lg border border-[var(--line)] text-[var(--ink)] md:hidden`}
                aria-expanded={mobileOpen}
                aria-controls={panelId}
                onClick={() => setMobileOpen(true)}
              >
                <span className="sr-only">Открыть меню тем</span>
                <MenuGlyph />
              </button>
              <Link
                href="/"
                className="flex min-w-0 flex-col no-underline"
              >
                <span className="truncate text-base font-semibold tracking-tight text-[var(--ink)] sm:text-lg">
                  Olympiad Mentor
                </span>
                <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                  Тренажёр
                </span>
              </Link>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {headerRight}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 overflow-x-clip px-4 py-6 sm:py-8 [overflow-wrap:anywhere]">
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <MobileDrawer
          id={panelId}
          onClose={() => setMobileOpen(false)}
          {...navProps}
        />
      ) : null}
    </div>
  );
}

function DesktopSideNav(props: SideNavData & { overall: number | null }) {
  return (
    <aside
      className="group/sidenav sticky top-0 z-30 hidden h-dvh w-12 shrink-0 md:block"
      aria-label="Навигация по темам"
    >
      {/* Ширина в потоке всегда w-12 — hover не расталкивает main. */}
      <div className="relative h-full w-12">
        <div
          className="flex h-full w-12 flex-col border-r border-[var(--line)] bg-[var(--surface)]"
          aria-hidden
        >
          <div className="flex h-11 shrink-0 items-center justify-center text-[var(--muted)]">
            <MenuGlyph />
          </div>
        </div>
        {/* Раскрытие поверх контента (absolute), не в потоке.
            Футер (Статистика/Выйти) — shrink-0; дерево скроллится отдельно. */}
        <div className="absolute inset-y-0 left-0 z-40 flex w-12 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--surface)] transition-[width,box-shadow] duration-200 ease-out group-hover/sidenav:w-64 group-hover/sidenav:shadow-lg">
          <div className="flex h-11 shrink-0 items-center justify-center border-b border-[var(--line)] text-[var(--muted)] group-hover/sidenav:justify-start group-hover/sidenav:px-3">
            <MenuGlyph />
            <span className="ml-2 hidden truncate text-xs font-semibold text-[var(--ink)] group-hover/sidenav:inline">
              Меню
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden px-1 py-2 group-hover/sidenav:px-2">
            <SideNavBody {...props} compact />
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileDrawer({
  id,
  onClose,
  ...props
}: SideNavData & { overall: number | null; id: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Меню тем"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Закрыть меню"
        onClick={onClose}
      />
      <div
        id={id}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,90vw)] flex-col border-r border-[var(--line)] bg-[var(--bg)] shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
          <p className="text-sm font-semibold text-[var(--ink)]">Меню</p>
          <button
            type="button"
            className={`${TOUCH_ICON_BTN_CLASS} rounded-lg text-[var(--muted)]`}
            onClick={onClose}
          >
            <span className="sr-only">Закрыть</span>×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
          <SideNavBody {...props} compact={false} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

function SideNavBody({
  topics,
  progressBySlug,
  authenticated,
  displayLabel,
  totalXp,
  logoutAction,
  overall,
  compact,
  onNavigate,
}: SideNavData & {
  overall: number | null;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const reveal = compact ? "opacity-0 group-hover/sidenav:opacity-100" : "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Скролл только у дерева (+ шапка пользователя); футер всегда виден. */}
      <div className={`min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto ${reveal}`}>
        <div className="space-y-1 px-1">
          {authenticated ? (
            <>
              <p className="truncate text-sm font-medium text-[var(--ink)]">
                {displayLabel ?? "Ученик"}
              </p>
              {totalXp != null ? (
                <p className="inline-flex items-center gap-1 text-xs tabular-nums text-[var(--muted)]">
                  <CupIcon className="h-3 w-3 text-[var(--brand)]" />
                  {totalXp} кубков
                </p>
              ) : null}
              {overall != null ? (
                <p className="text-xs text-[var(--muted)]">Прогресс банка: {overall}%</p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-[var(--muted)]">Гость</p>
          )}
        </div>

        <nav className="space-y-1" aria-label="Класс → предмет → темы">
          {SIDE_NAV_VISIBLE_GRADES.map((grade) => (
            // Все ветки меню изначально свёрнуты; после перезагрузки страницы — снова свёрнуты
            // (состояние раскрытия нигде не сохраняется).
            <details key={grade} className="group/grade rounded-md">
              <summary
                className={`${TOUCH_BTN_CLASS} cursor-pointer list-none justify-start rounded-md px-2 text-left text-sm font-semibold text-[var(--ink)] marker:content-none [&::-webkit-details-marker]:hidden`}
              >
                <span className="mr-1 text-[var(--muted)]" aria-hidden>
                  ▸
                </span>
                {grade} класс
              </summary>
              <ul className="mt-0.5 space-y-0.5 border-l border-[var(--line)] py-0.5 pl-2">
                {SIDE_NAV_VISIBLE_SUBJECTS.map((subj) => (
                  <SubjectBranch
                    key={`${grade}-${subj.id}`}
                    grade={grade}
                    subjectId={subj.id}
                    subjectLabel={subj.label}
                    topics={topics}
                    progressBySlug={progressBySlug}
                    authenticated={authenticated}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </details>
          ))}
        </nav>
      </div>

      <div
        className={`shrink-0 space-y-1 border-t border-[var(--line)] bg-[var(--surface)] pt-2 ${reveal}`}
      >
        {authenticated ? (
          <>
            <Link
              href="/stats"
              onClick={onNavigate}
              className={`${TOUCH_BTN_CLASS} w-full justify-start rounded-md px-2 text-sm text-[var(--muted)] no-underline hover:text-[var(--brand)]`}
            >
              Статистика
            </Link>
            <Link
              href="/sources"
              onClick={onNavigate}
              className={`${TOUCH_BTN_CLASS} w-full justify-start rounded-md px-2 text-sm text-[var(--muted)] no-underline hover:text-[var(--brand)]`}
            >
              Источники
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className={`${TOUCH_BTN_CLASS} w-full justify-start rounded-md px-2 text-sm text-[var(--muted)] hover:text-[var(--brand)]`}
              >
                Выйти
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/sources"
              onClick={onNavigate}
              className={`${TOUCH_BTN_CLASS} w-full justify-start rounded-md px-2 text-sm text-[var(--muted)] no-underline hover:text-[var(--brand)]`}
            >
              Источники
            </Link>
            <Link
              href="/login"
              onClick={onNavigate}
              className={`${TOUCH_BTN_CLASS} w-full justify-start rounded-md px-2 text-sm font-medium text-[var(--brand)] no-underline`}
            >
              Войти
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function SubjectBranch({
  grade,
  subjectId,
  subjectLabel,
  topics,
  progressBySlug,
  authenticated,
  onNavigate,
}: {
  grade: (typeof SIDE_NAV_GRADES)[number];
  subjectId: SideNavSubjectId;
  subjectLabel: string;
  topics: SideNavTopicRef[];
  progressBySlug: Record<string, SideNavTopicProgress>;
  authenticated: boolean;
  onNavigate?: () => void;
}) {
  const slotTopics = topicsForNavSlot(topics, grade, subjectId);
  const subjectHref = homeTopicsHref(subjectId, grade);

  return (
    <li>
      <details className="group/subj">
        <summary
          className={`${TOUCH_BTN_CLASS} cursor-pointer list-none justify-start gap-1 rounded-md px-2 text-left text-xs font-medium text-[var(--muted)] marker:content-none [&::-webkit-details-marker]:hidden`}
        >
          <span className="shrink-0" aria-hidden>
            ▸
          </span>
          <Link
            href={subjectHref}
            onClick={(e) => {
              // Клик по названию → вкладка «Темы», без toggle details.
              e.stopPropagation();
              onNavigate?.();
            }}
            className="min-w-0 truncate text-[var(--ink)] no-underline hover:text-[var(--brand)]"
          >
            {subjectLabel}
          </Link>
        </summary>
        <ul className="mt-0.5 space-y-0.5 border-l border-[var(--line)] py-0.5 pl-2">
          {slotTopics.length === 0 ? (
            <li className="px-2 py-1 text-xs text-[var(--muted)]">Пока пусто</li>
          ) : (
            slotTopics.map((t) => {
              const p = progressBySlug[t.slug];
              const done =
                p &&
                isTopicCompleted({
                  solvedTasks: p.solvedTasks,
                  totalTasks: p.totalTasks,
                });
              return (
                <li key={t.slug}>
                  <Link
                    href={`/topics/${t.slug}`}
                    onClick={onNavigate}
                    className={`${TOUCH_BTN_CLASS} w-full justify-start gap-1 rounded-md px-2 text-left text-sm text-[var(--ink)] no-underline hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]`}
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {p && authenticated ? (
                      done ? (
                        <span
                          className="inline-flex w-8 shrink-0 justify-end text-xs font-medium text-[var(--ok)]"
                          title="Тема пройдена"
                          aria-label="Тема пройдена"
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex w-8 shrink-0 justify-end tabular-nums text-xs text-[var(--muted)]">
                          {p.percent}%
                        </span>
                      )
                    ) : null}
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </details>
    </li>
  );
}

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor">
      <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
    </svg>
  );
}
