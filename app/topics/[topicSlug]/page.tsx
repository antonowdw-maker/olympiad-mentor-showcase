import Link from "next/link";
import { notFound } from "next/navigation";
import { GradeBadge } from "@/app/components/grade-badge";
import { TopicPageNav } from "@/app/components/topic-page-nav";
import { auth } from "@/lib/auth";
import {
  paginate,
  parsePageParam,
  topicTaskHref,
} from "@/lib/content/pagination";
import { getTopicBySlug } from "@/lib/content/queries";
import { topicBackToTopicsHref } from "@/lib/home/tab";
import { getMentorChatForTopic } from "@/lib/mentor/actions";
import { isTopicCompleted } from "@/lib/progress/calculate";
import { getSolvedTaskSlugs, getTopicProgressForUser } from "@/lib/progress/queries";
import { TopicMentorChat } from "./topic-mentor-chat";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ topicSlug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function TopicPage({ params, searchParams }: Props) {
  const { topicSlug } = await params;
  const sp = await searchParams;
  const result = await getTopicBySlug(topicSlug);
  if (result.error) {
    return (
      <p className="rounded-lg border border-[var(--line)] bg-white/80 p-4 text-[var(--warn)]">
        Ошибка загрузки темы: {result.error}. Проверь сид контента.
      </p>
    );
  }
  if (!result.topic) notFound();
  const topic = result.topic;

  const session = await auth();
  const userId = session?.user?.id;
  const progress = userId ? await getTopicProgressForUser(userId, topicSlug) : null;
  const solved = userId ? await getSolvedTaskSlugs(userId, topicSlug) : new Set<string>();
  const mentor = userId ? await getMentorChatForTopic(topicSlug) : null;
  const mentorMessages = mentor && !("error" in mentor) ? mentor.messages : [];

  const listPage = parsePageParam(sp.page);
  const tasksPage = paginate(topic.tasks, listPage);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={topicBackToTopicsHref(topic.classLevels)} className="text-sm text-[var(--muted)]">
          ← К темам
        </Link>
        <h1 className="text-3xl font-semibold">{topic.title}</h1>
        <p className="text-[var(--muted)]">{topic.description}</p>
        <p className="text-sm text-[var(--muted)]">Уровни: {topic.classLevels.join(", ")}</p>
        {progress ? (
          isTopicCompleted({
            solvedTasks: progress.solvedTasks,
            totalTasks: progress.totalTasks,
          }) ? (
            <p className="text-sm font-medium text-[var(--ok)]">
              Тема пройдена · {progress.percent}% ({progress.solvedTasks} из{" "}
              {progress.totalTasks})
            </p>
          ) : (
            <p className="text-sm font-medium text-[var(--brand)]">
              Прогресс: {progress.percent}% ({progress.solvedTasks} из {progress.totalTasks})
            </p>
          )
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Статьи</h2>
        <ul className="space-y-2">
          {topic.articles.map((a) => (
            <li key={a.slug}>
              <Link href={`/topics/${topic.slug}/articles/${a.slug}`} className="text-[var(--brand)]">
                {a.order}. {a.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Задачи</h2>
        <TopicPageNav
          topicSlug={topic.slug}
          page={tasksPage.page}
          totalPages={tasksPage.totalPages}
          hasPrev={tasksPage.hasPrev}
          hasNext={tasksPage.hasNext}
        />
        <ul className="space-y-2">
          {tasksPage.items.map((t) => {
            const isSolved = solved.has(t.slug);
            return (
              <li
                key={t.slug}
                className={`flex flex-wrap items-baseline gap-2 rounded-lg px-2 py-1.5 ${
                  isSolved ? "bg-[var(--ok-soft)]" : ""
                }`}
              >
                <Link
                  href={topicTaskHref(topic.slug, t.slug, tasksPage.page)}
                  className={isSolved ? "font-medium text-[var(--ok)]" : "text-[var(--brand)]"}
                >
                  {t.order}. {t.title}
                </Link>
                <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-xs text-[var(--brand)]">
                  ур. {t.difficulty}
                </span>
                <GradeBadge grade={t.grade} />
                {isSolved ? (
                  <span className="text-xs font-medium text-[var(--ok)]">✓ решено</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <TopicPageNav
          topicSlug={topic.slug}
          page={tasksPage.page}
          totalPages={tasksPage.totalPages}
          hasPrev={tasksPage.hasPrev}
          hasNext={tasksPage.hasNext}
        />
      </section>

      {userId ? (
        <TopicMentorChat topicSlug={topic.slug} initialMessages={mentorMessages} />
      ) : (
        <p className="rounded-lg border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
          Войди в аккаунт, чтобы спросить наставника по теме.
        </p>
      )}
    </div>
  );
}
