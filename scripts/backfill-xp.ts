/**
 * Backfill L1: TaskXpAward + User.totalXp + UserBadge по верным Attempt.
 *
 * Порядок для локальной SQLite:
 * 1. Backup `prisma/dev.db`.
 * 2. `npx prisma db push` — totalXp, UserBadge, TaskXpAward.
 * 3. `npm run db:backfill-xp` — rebuild фактов XP; бейджи только upsert (необратимы).
 *
 * Запуск: npm run db:backfill-xp
 */
import { PrismaClient } from "@prisma/client";
import {
  milestoneBadgesForUniqueCount,
  milestoneBadgeTitle,
  shouldEarnTechniqueBadge,
  techniqueBadgeCode,
  techniqueBadgeTitle,
  xpForFirstCorrect,
} from "../lib/progress/xp";
import { parseOlympiadGrade } from "../lib/content/grade";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, login: true } });
  console.log(`Users: ${users.length}`);

  for (const user of users) {
    const correct = await prisma.attempt.findMany({
      where: { userId: user.id, isCorrect: true },
      select: {
        taskId: true,
        createdAt: true,
        task: {
          select: {
            grade: true,
            topicId: true,
            topic: { select: { slug: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Первое верное по каждой задаче → факт XP
    const firstByTask = new Map<string, (typeof correct)[number]>();
    for (const a of correct) {
      if (!firstByTask.has(a.taskId)) firstByTask.set(a.taskId, a);
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskXpAward.deleteMany({ where: { userId: user.id } });

      let totalXp = 0;
      for (const a of firstByTask.values()) {
        const grade = parseOlympiadGrade(a.task.grade) ?? "mid";
        const xpAmount = xpForFirstCorrect(grade);
        totalXp += xpAmount;
        await tx.taskXpAward.create({
          data: {
            userId: user.id,
            taskId: a.taskId,
            xpAmount,
          },
        });
      }

      await tx.user.update({
        where: { id: user.id },
        data: { totalXp },
      });

      const uniqueCount = firstByTask.size;
      for (const code of milestoneBadgesForUniqueCount(uniqueCount)) {
        await tx.userBadge.upsert({
          where: { userId_code: { userId: user.id, code } },
          create: { userId: user.id, code, title: milestoneBadgeTitle(code) },
          update: { title: milestoneBadgeTitle(code) },
        });
      }

      const byTopic = new Map<
        string,
        { slug: string; title: string; taskIds: Set<string> }
      >();
      for (const a of firstByTask.values()) {
        const t = a.task.topic;
        let row = byTopic.get(a.task.topicId);
        if (!row) {
          row = { slug: t.slug, title: t.title, taskIds: new Set() };
          byTopic.set(a.task.topicId, row);
        }
        row.taskIds.add(a.taskId);
      }

      for (const row of byTopic.values()) {
        if (!shouldEarnTechniqueBadge(row.taskIds.size)) continue;
        const code = techniqueBadgeCode(row.slug);
        const title = techniqueBadgeTitle(row.title);
        await tx.userBadge.upsert({
          where: { userId_code: { userId: user.id, code } },
          create: { userId: user.id, code, title },
          update: { title },
        });
      }

      console.log(
        `${user.login}: totalXp=${totalXp}, uniqueCorrect=${uniqueCount}, topics=${byTopic.size}`,
      );
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
