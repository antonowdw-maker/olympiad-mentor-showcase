import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/app/components/app-chrome";
import { SiteHeaderNav } from "@/app/components/site-header-nav";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { getSessionDisplayLabel } from "@/lib/auth/display-name";
import { listTopics } from "@/lib/content/queries";
import { getUserXpSummary } from "@/lib/progress/award";
import { getTopicProgressForUser } from "@/lib/progress/queries";
import { prisma } from "@/lib/db";
import {
  isThemeUnlockBypassLogin,
  resolveEffectiveUiTheme,
  UI_THEME_DEFAULT,
  type UiTheme,
} from "@/lib/ui/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olympiad Mentor",
  description: "Тренажёр и наставник по олимпиадной математике",
};

/** Корректный масштаб на телефоне (iter 15 / NFR-01). Зум не блокируем (a11y). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

/** Прогресс по темам для бокового меню: slug темы → проценты и счётчики. */
type TopicProgressMap = Record<
  string,
  {
    topicSlug: string;
    topicTitle: string;
    percent: number;
    solvedTasks: number;
    totalTasks: number;
  }
>;

async function loadUserUiTheme(
  userId: string,
  totalXp: number,
): Promise<UiTheme> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { uiTheme: true, login: true },
  });
  const bypassUnlock = isThemeUnlockBypassLogin(row?.login);
  return resolveEffectiveUiTheme(row?.uiTheme, totalXp, { bypassUnlock });
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [topics, session] = await Promise.all([listTopics(), auth()]);
  const userId = session?.user?.id;

  const [progressBySlug, displayLabel, xpSummary] = await Promise.all([
    userId
      ? Promise.all(
          topics.map(async (t) => {
            const p = await getTopicProgressForUser(userId, t.slug);
            if (!p) return null;
            return [
              t.slug,
              {
                topicSlug: t.slug,
                topicTitle: t.title,
                percent: p.percent,
                solvedTasks: p.solvedTasks,
                totalTasks: p.totalTasks,
              },
            ] as const;
          }),
        ).then((rows) => {
          const map: TopicProgressMap = {};
          for (const row of rows) {
            if (row) map[row[0]] = row[1];
          }
          return map;
        })
      : Promise.resolve<TopicProgressMap>({}),
    userId ? getSessionDisplayLabel(userId) : Promise.resolve(null),
    userId ? getUserXpSummary(userId) : Promise.resolve(null),
  ]);

  const uiTheme = userId
    ? await loadUserUiTheme(userId, xpSummary?.totalXp ?? 0)
    : UI_THEME_DEFAULT;

  const sideProgress: Record<
    string,
    { solvedTasks: number; totalTasks: number; percent: number }
  > = {};
  for (const [slug, row] of Object.entries(progressBySlug)) {
    sideProgress[slug] = {
      solvedTasks: row.solvedTasks,
      totalTasks: row.totalTasks,
      percent: row.percent,
    };
  }

  const headerRight = (
    <>
      {topics.length === 0 ? (
        <span className="hidden text-sm text-[var(--muted)] sm:inline">
          Темы появятся после сида
        </span>
      ) : null}
      <SiteHeaderNav
        authenticated={Boolean(session?.user)}
        totalXp={xpSummary?.totalXp ?? null}
        uiTheme={uiTheme}
      />
    </>
  );

  return (
    <html lang="ru" data-theme={uiTheme}>
      <body>
        <AppChrome
          topics={topics.map((t) => {
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
          })}
          progressBySlug={sideProgress}
          authenticated={Boolean(session?.user)}
          displayLabel={displayLabel}
          totalXp={xpSummary?.totalXp ?? null}
          logoutAction={logoutAction}
          headerRight={headerRight}
        >
          {children}
        </AppChrome>
      </body>
    </html>
  );
}
