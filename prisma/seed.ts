/**
 * Сид БД: демо-пользователь из .env (SEED_TEST_USER_*) + темы из реестра.
 * Контент upsert по slug — Attempt не сносятся.
 * Логины/пароли — только SEED_* в .env (не в git).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TOPIC_SEEDS, TOPIC_SEED_VALIDATE } from "../content/seed";
import type { TopicSeed } from "../lib/content/schemas";
import { validateTopicContent } from "../lib/content/validate";
import { optionsColumnJson } from "../lib/content/answer-table";

const prisma = new PrismaClient();

/** Обрезка; отбрасываем только mojibake \uFFFD (не символ «?» в пароле). */
function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  if (!v || /\uFFFD/.test(v)) return undefined;
  return v;
}

async function upsertUser(login: string, password: string, displayName: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { login },
    create: { login, passwordHash, displayName },
    update: { passwordHash, displayName },
  });
}

/**
 * Демо-пользователь: SEED_TEST_USER_*. Значения из .env.example — только для локального запуска.
 */
async function seedTestUser() {
  const login = envTrim("SEED_TEST_USER_LOGIN");
  const password = envTrim("SEED_TEST_USER_PASSWORD");
  const displayName = envTrim("SEED_TEST_USER_NAME") ?? login;
  if (!login && !password) {
    console.log("Сид: демо-пользователь пропущен (SEED_TEST_USER_* не заданы).");
    return;
  }
  if (!login || !password) {
    console.error(
      "Сид тестового User: задай оба SEED_TEST_USER_LOGIN и SEED_TEST_USER_PASSWORD (или убери оба).",
    );
    process.exit(1);
  }
  await upsertUser(login, password, displayName ?? login);
  console.log(`Сид OK: тестовый User «${login}».`);
}

async function seedTopic(raw: TopicSeed) {
  const result = validateTopicContent(raw, TOPIC_SEED_VALIDATE);

  for (const issue of result.issues) {
    const line = `- [${issue.code}] ${issue.message}${issue.path ? ` (${issue.path})` : ""}`;
    if ((issue.severity ?? "error") === "warn") {
      console.warn(line);
    } else {
      console.error(line);
    }
  }

  if (!result.ok || !result.data) {
    console.error(`Валидация контента «${raw.slug}» не прошла (есть error).`);
    process.exit(1);
  }

  const topic = result.data;

  const dbTopic = await prisma.topic.upsert({
    where: { slug: topic.slug },
    create: {
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      order: topic.order,
      classLevels: JSON.stringify(topic.classLevels),
    },
    update: {
      title: topic.title,
      description: topic.description,
      order: topic.order,
      classLevels: JSON.stringify(topic.classLevels),
    },
  });

  for (const a of topic.articles) {
    await prisma.docArticle.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        title: a.title,
        body: a.body,
        order: a.order,
        topicId: dbTopic.id,
      },
      update: {
        title: a.title,
        body: a.body,
        order: a.order,
        topicId: dbTopic.id,
      },
    });
  }

  for (const t of topic.tasks) {
    const dbTask = await prisma.task.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        title: t.title,
        statement: t.statement,
        acceptedAnswers: JSON.stringify(t.acceptedAnswers),
        answerType: t.answerType,
        options: optionsColumnJson(t),
        difficulty: t.difficulty,
        grade: t.grade,
        order: t.order,
        relatedDocSlugs: JSON.stringify(t.relatedDocSlugs),
        hintSteps: JSON.stringify(t.hintSteps),
        similarTaskSlug: t.similarTaskSlug ?? null,
        workedExample: t.workedExample ?? null,
        sourceHint: t.sourceHint ?? null,
        topicId: dbTopic.id,
      },
      update: {
        title: t.title,
        statement: t.statement,
        acceptedAnswers: JSON.stringify(t.acceptedAnswers),
        answerType: t.answerType,
        options: optionsColumnJson(t),
        difficulty: t.difficulty,
        grade: t.grade,
        order: t.order,
        relatedDocSlugs: JSON.stringify(t.relatedDocSlugs),
        hintSteps: JSON.stringify(t.hintSteps),
        similarTaskSlug: t.similarTaskSlug ?? null,
        workedExample: t.workedExample ?? null,
        sourceHint: t.sourceHint ?? null,
        topicId: dbTopic.id,
      },
    });

    // Изоморфы (12a): upsert по стабильному slug `{taskSlug}__{inst.slug}`
    const keepInstanceSlugs = (t.instances ?? []).map(
      (inst) => `${t.slug}__${inst.slug}`,
    );
    if (t.instances && t.instances.length > 0) {
      for (const inst of t.instances) {
        const fullSlug = `${t.slug}__${inst.slug}`;
        await prisma.taskInstance.upsert({
          where: { slug: fullSlug },
          create: {
            slug: fullSlug,
            taskId: dbTask.id,
            order: inst.order,
            title: inst.title ?? null,
            statement: inst.statement,
            acceptedAnswers: JSON.stringify(inst.acceptedAnswers),
            options: optionsColumnJson(inst),
            hintSteps: JSON.stringify(inst.hintSteps),
          },
          update: {
            taskId: dbTask.id,
            order: inst.order,
            title: inst.title ?? null,
            statement: inst.statement,
            acceptedAnswers: JSON.stringify(inst.acceptedAnswers),
            options: optionsColumnJson(inst),
            hintSteps: JSON.stringify(inst.hintSteps),
          },
        });
      }
    }
    // I12A-07: prune хвостов даже если instances в сиде пустой/отсутствует
    const obsoleteInst = await prisma.taskInstance.findMany({
      where: {
        taskId: dbTask.id,
        ...(keepInstanceSlugs.length > 0
          ? { NOT: { slug: { in: keepInstanceSlugs } } }
          : {}),
      },
      select: { id: true, slug: true },
    });
    if (obsoleteInst.length > 0 && process.env.SEED_PRUNE === "1") {
      await prisma.taskInstance.deleteMany({
        where: { id: { in: obsoleteInst.map((o) => o.id) } },
      });
      console.warn(
        `Сид SEED_PRUNE=1: задача «${t.slug}» — удалены instance: ${obsoleteInst.map((o) => o.slug).join(", ")}`,
      );
    } else if (obsoleteInst.length > 0 && keepInstanceSlugs.length === 0) {
      console.warn(
        `Сид: задача «${t.slug}» — в БД есть instance без массива в сиде (${obsoleteInst.length}); prune: SEED_PRUNE=1`,
      );
    }
  }

  // Хвосты сида: по умолчанию только предупреждение (AC: upsert без сноса Attempt).
  // Жёсткое удаление — только с SEED_PRUNE=1 (осознанно; каскад унесёт Attempt/чат).
  const keepSlugs = topic.tasks.map((t) => t.slug);
  const obsolete = await prisma.task.findMany({
    where: { topicId: dbTopic.id, NOT: { slug: { in: keepSlugs } } },
    select: { id: true, slug: true },
  });
  if (obsolete.length > 0) {
    const names = obsolete.map((o) => o.slug).join(", ");
    if (process.env.SEED_PRUNE === "1") {
      await prisma.task.deleteMany({ where: { id: { in: obsolete.map((o) => o.id) } } });
      console.warn(
        `Сид SEED_PRUNE=1: тема «${topic.slug}» — удалены задачи: ${names}`,
      );
    } else {
      console.warn(
        `Сид: тема «${topic.slug}» — в БД есть задачи вне сида (${names}). Upsert их не трогает. Удалить: SEED_PRUNE=1.`,
      );
    }
  }

  console.log(
    `Сид OK: тема «${topic.slug}»: статей ${topic.articles.length}, задач ${topic.tasks.length} (upsert).`,
  );
}

async function main() {
  // Перед сидом — свежий бэкап, если прошло ≥24 ч.
  const { runDbBackup } = await import("../lib/db/run-backup");
  const bak = runDbBackup({ cwd: process.cwd(), ifStale: true });
  if (!bak.ok) {
    console.warn(`[db:seed] бэкап не сделан: ${bak.error}`);
  } else if (bak.skipped) {
    console.log(`[db:seed] бэкап: ${bak.reason}`);
  } else {
    console.log(`[db:seed] бэкап OK → ${bak.dest}`);
  }

  await seedTestUser();
  for (const topic of TOPIC_SEEDS) {
    await seedTopic(topic);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
