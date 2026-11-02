"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canRequestNewPackage, resolveCurrentPackage } from "@/lib/plan/build";
import { calendarDateInTz } from "@/lib/plan/date";
import { isMixedPlanScope } from "@/lib/plan/scope";
import {
  countAvailableTasksForDay,
  createGatherLearnPackage,
  createNewDayPlanPackage,
  ensureDayPlanForToday,
  getPackageProgressSlugs,
  listGatherPackages,
  type DayPlanPackageDto,
} from "@/lib/plan/service";
import { listPlanTopicChoices } from "@/lib/plan/topic-choices";
import {
  PLAN_SCOPE_MIXED,
  PLAN_TOPIC_COOKIE,
  canOfferMixedPlan,
} from "@/lib/plan/topic-preference";
import { PLAN_SCOPE_GATHER } from "@/lib/plan/learn-session";
import { BLOCK_MODE_LEARN } from "@/lib/modes/block-mode";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export type DayPlanState =
  | {
      ok: true;
      date: string;
      topicSlug: string;
      packages: DayPlanPackageDto[];
      canCreateNew: boolean;
      solvedTaskSlugs: string[];
    }
  | { ok: false; error: string };

function withCanCreate(
  packages: DayPlanPackageDto[],
  solvedTaskSlugs: string[],
  availableTaskCount: number,
): boolean {
  const solved = new Set(solvedTaskSlugs);
  const { current } = resolveCurrentPackage(packages, solved);
  return canRequestNewPackage(current, solved, availableTaskCount);
}

async function buildOkState(
  userId: string,
  topicSlug: string,
  date: string,
  packages: DayPlanPackageDto[],
): Promise<Extract<DayPlanState, { ok: true }>> {
  const [progress, availableTaskCount] = await Promise.all([
    getPackageProgressSlugs(userId, topicSlug, BLOCK_MODE_LEARN, date),
    countAvailableTasksForDay(userId, topicSlug, date, BLOCK_MODE_LEARN),
  ]);
  const solvedTaskSlugs = [...progress];
  return {
    ok: true,
    date,
    topicSlug,
    packages,
    solvedTaskSlugs,
    canCreateNew: withCanCreate(packages, solvedTaskSlugs, availableTaskCount),
  };
}

/** Сохранить выбранную тему плана (cookie) и обновить страницы. selection = slug | mixed. */
export async function setPlanTopicPreferenceAction(
  topicSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти" };
  }
  const slug = topicSlug.trim();
  if (!slug) {
    return { ok: false, error: "Тема не указана" };
  }

  if (isMixedPlanScope(slug)) {
    const topics = await listPlanTopicChoices(session.user.id);
    if (!canOfferMixedPlan(topics)) {
      return { ok: false, error: "Нужны хотя бы две открытые темы" };
    }
    const jar = await cookies();
    jar.set(PLAN_TOPIC_COOKIE, PLAN_SCOPE_MIXED, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
    revalidatePath("/");
    revalidatePath("/plan");
    return { ok: true };
  }

  if (slug === PLAN_SCOPE_GATHER) {
    const jar = await cookies();
    jar.set(PLAN_TOPIC_COOKIE, PLAN_SCOPE_GATHER, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
    revalidatePath("/");
    revalidatePath("/plan");
    return { ok: true };
  }

  const topic = await prisma.topic.findUnique({ where: { slug }, select: { slug: true } });
  if (!topic) {
    return { ok: false, error: "Тема не найдена" };
  }
  const jar = await cookies();
  jar.set(PLAN_TOPIC_COOKIE, topic.slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/");
  revalidatePath("/plan");
  return { ok: true };
}

/** Кнопка «Новый список» — новый пакет в истории дня (только обучение / план). */
export async function createNewDayPlanPackageAction(topicSlug: string): Promise<DayPlanState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти" };
  }
  const slug = topicSlug.trim();
  if (!slug) {
    return { ok: false, error: "Тема не указана" };
  }
  if (slug === PLAN_SCOPE_GATHER) {
    return {
      ok: false,
      error: "Для ручного сбора используй «Собрать обучение».",
    };
  }
  const date = calendarDateInTz();
  try {
    await createNewDayPlanPackage(session.user.id, slug, date, { mode: BLOCK_MODE_LEARN });
    const packages = await ensureDayPlanForToday(
      session.user.id,
      slug,
      date,
      BLOCK_MODE_LEARN,
    );
    revalidatePath("/");
    revalidatePath("/plan");
    return buildOkState(session.user.id, slug, date, packages);
  } catch (e) {
    if (e instanceof Error && e.message === "USER_GONE") {
      return {
        ok: false,
        error: "Сессия устарела — выйди и войди снова.",
      };
    }
    if (e instanceof Error && e.message === "TOPIC_NOT_FOUND") {
      return { ok: false, error: "Тема не найдена" };
    }
    if (e instanceof Error && e.message === "CURRENT_INCOMPLETE") {
      return {
        ok: false,
        error: "Сначала реши все задачи текущего списка.",
      };
    }
    if (e instanceof Error && e.message === "NO_MORE_TASKS") {
      return {
        ok: false,
        error: "На сегодня новых задач не осталось. Повтори статьи или зайди завтра.",
      };
    }
    console.error("[plan] createNewDayPlanPackageAction:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Не удалось собрать новый список" };
  }
}

/** «Собрать обучение» из выбранных тем → пакет scope=gather. */
export async function createGatherLearnPackageAction(
  topicSlugs: string[],
): Promise<DayPlanState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти" };
  }
  const date = calendarDateInTz();
  try {
    await createGatherLearnPackage(session.user.id, topicSlugs, date);
    const packages = await listGatherPackages(session.user.id, date);
    const solved = await getPackageProgressSlugs(
      session.user.id,
      PLAN_SCOPE_GATHER,
      BLOCK_MODE_LEARN,
      date,
    );
    const jar = await cookies();
    jar.set(PLAN_TOPIC_COOKIE, PLAN_SCOPE_GATHER, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
    revalidatePath("/");
    revalidatePath("/plan");
    return {
      ok: true,
      date,
      topicSlug: PLAN_SCOPE_GATHER,
      packages,
      solvedTaskSlugs: [...solved],
      canCreateNew: withCanCreate(packages, [...solved], 1),
    };
  } catch (e) {
    if (e instanceof Error && e.message === "USER_GONE") {
      return {
        ok: false,
        error: "Сессия устарела — выйди и войди снова.",
      };
    }
    if (e instanceof Error && e.message === "NO_TOPICS") {
      return { ok: false, error: "Выбери хотя бы одну тему" };
    }
    if (e instanceof Error && e.message === "TOPIC_NOT_FOUND") {
      return { ok: false, error: "Тема не найдена" };
    }
    if (e instanceof Error && e.message === "CURRENT_INCOMPLETE") {
      return {
        ok: false,
        error: "Сначала реши все задачи текущего собранного пакета.",
      };
    }
    if (e instanceof Error && e.message === "NO_MORE_TASKS") {
      return {
        ok: false,
        error: "По выбранным темам не осталось нерешённых задач для нового пакета.",
      };
    }
    if (e instanceof Error && e.message === "GATHER_RACE_CONFLICT") {
      return {
        ok: false,
        error: "Параллельно собран другой пакет. Обнови страницу и собери обучение снова.",
      };
    }
    console.error("[plan] createGatherLearnPackageAction:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Не удалось собрать обучение" };
  }
}
