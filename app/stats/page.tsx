import Link from "next/link";
import { auth } from "@/lib/auth";
import { getFamilyRanking, getPersonalStats } from "@/lib/progress/stats-queries";
import { formatReinforceDuration } from "@/lib/reinforce/timer";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Статистика</h1>
        <p className="text-sm text-[var(--muted)]">
          Войди, чтобы увидеть прогресс по темам и рейтинг.{" "}
          <Link href="/login" className="text-[var(--brand)] underline-offset-2 hover:underline">
            Войти
          </Link>
        </p>
      </div>
    );
  }

  const [personal, family] = await Promise.all([
    getPersonalStats(userId),
    getFamilyRanking(userId),
  ]);

  if (!personal) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Статистика</h1>
        <p className="text-sm text-[var(--muted)]">Не удалось загрузить данные ученика.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Статистика</h1>
        <p className="text-sm text-[var(--muted)]">
          Прогресс по темам, ошибки и оценка минут по решённым задачам. «Время» в таблице тем — не
          секундомер, а сумма оценок грейда (2 / 6 / 12 мин). У закреплений — wall-clock таймер
          теста.
        </p>
      </header>

      <section className="space-y-2" aria-labelledby="stats-summary">
        <h2 id="stats-summary" className="text-base font-semibold text-[var(--ink)]">
          Сводка
        </h2>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--muted)]">
          <span>
            <span className="tabular-nums font-semibold text-[var(--ink)]">{personal.totalXp}</span>{" "}
            кубков
          </span>
          <span>
            решено{" "}
            <span className="tabular-nums font-semibold text-[var(--ink)]">
              {personal.uniqueTasksSolved}
            </span>
          </span>
          <span>
            дней{" "}
            <span className="tabular-nums font-semibold text-[var(--ink)]">
              {personal.activeDays}
            </span>
          </span>
          <span>
            закреплений{" "}
            <span className="tabular-nums font-semibold text-[var(--ink)]">
              {personal.reinforceCompletions}
            </span>
          </span>
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="stats-reinforce">
        <h2 id="stats-reinforce" className="text-lg font-semibold text-[var(--ink)]">
          Закрепления
        </h2>
        {personal.reinforceRuns.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Пока нет завершённых тестов закрепления. После полного пакета на плане появится
            «Закрепить».
          </p>
        ) : (
          <ul className="space-y-2" aria-label="История закреплений">
            {personal.reinforceRuns.map((r) => (
              <li
                key={r.sessionId}
                className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-3 text-sm"
              >
                <p className="font-medium text-[var(--ink)]">
                  {r.scopeLabel}
                  <span className="font-normal text-[var(--muted)]"> · список {r.packageSeq}</span>
                </p>
                <p className="mt-1 tabular-nums text-[var(--muted)]">
                  {r.passed ? "Сдано" : "Не сдано"}: {r.score}/{r.maxScore}
                  {r.durationSec != null ? (
                    <>
                      {" "}
                      · время{" "}
                      <span className="text-[var(--ink)]">
                        {formatReinforceDuration(r.durationSec)}
                      </span>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="stats-topics">
        <h2 id="stats-topics" className="text-lg font-semibold text-[var(--ink)]">
          По темам
        </h2>
        {personal.topics.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Тем в банке пока нет.</p>
        ) : (
          <>
            {/* Узкий экран: карточки без горизонтального скролла страницы (iter 15) */}
            <ul className="space-y-2 sm:hidden" aria-label="Прогресс по темам">
              {personal.topics.map((t) => (
                <li
                  key={t.topicSlug}
                  className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-3"
                >
                  <Link
                    href={`/topics/${t.topicSlug}`}
                    className="font-medium text-[var(--brand)] no-underline hover:underline"
                  >
                    {t.topicTitle}
                  </Link>
                  <p className="mt-1 text-sm tabular-nums text-[var(--ink)]">
                    {t.solvedTasks}/{t.totalTasks} ({t.percent}%)
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Ошибки: {t.wrongAttempts} · Эталон A: {t.revealedTasks} · ~{t.estimatedMinutes}{" "}
                    мин
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-lg border border-[var(--line)] sm:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[var(--brand-soft)]/40 text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Тема</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Прогресс</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Ошибки</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Эталон A</th>
                    <th className="px-3 py-2 font-medium tabular-nums">~ мин</th>
                  </tr>
                </thead>
                <tbody>
                  {personal.topics.map((t) => (
                    <tr key={t.topicSlug} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2">
                        <Link
                          href={`/topics/${t.topicSlug}`}
                          className="font-medium text-[var(--brand)] no-underline hover:underline"
                        >
                          {t.topicTitle}
                        </Link>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--ink)]">
                        {t.solvedTasks}/{t.totalTasks} ({t.percent}%)
                      </td>
                      <td className="px-3 py-2 tabular-nums">{t.wrongAttempts}</td>
                      <td className="px-3 py-2 tabular-nums">{t.revealedTasks}</td>
                      <td className="px-3 py-2 tabular-nums">{t.estimatedMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="stats-family">
        <h2 id="stats-family" className="text-lg font-semibold text-[var(--ink)]">
          Рейтинг
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Рейтинг по кубкам; при равенстве — по числу уникально решённых задач.
        </p>
        {family.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Пользователей пока нет.</p>
        ) : (
          <ol className="space-y-2">
            {family.map((row) => (
              <li
                key={row.userId}
                className={
                  row.isCurrent
                    ? "rounded-lg border-2 border-[var(--brand)] bg-[var(--surface)] px-3 py-2 shadow-sm"
                    : "rounded-lg border border-[var(--line)] bg-[var(--surface)]/70 px-3 py-2"
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--ink)]">
                    #{row.rank} {row.displayLabel}
                    {row.isCurrent ? " · ты" : ""}
                  </span>
                  {/* ink на «ты»: темы красят bg-[var(--brand)]* градиентом — brand-текст там нечитаем */}
                  <span
                    className={
                      row.isCurrent
                        ? "tabular-nums font-semibold text-[var(--ink)]"
                        : "tabular-nums font-medium text-[var(--brand)]"
                    }
                  >
                    {row.totalXp} кубков
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Решено задач: {row.uniqueTasksSolved}; тем на 100%: {row.topicsComplete}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
