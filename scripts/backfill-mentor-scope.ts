/**
 * Upgrade / backfill MentorSession.scopeKey (follow-up BC-02).
 *
 * Порядок для локальной SQLite:
 * 1. Backup `prisma/dev.db`.
 * 2. `npm run db:backfill-mentor-scope` — ADD COLUMN + заполнение `task:`/`topic:`.
 * 3. Схлопнуть дубликаты topic-сессий (оставить одну с сообщениями).
 * 4. `npx prisma db push` — unique (userId, scopeKey).
 *
 * Запуск: npm run db:backfill-mentor-scope
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ColInfo = { name: string };

async function hasScopeKeyColumn(): Promise<boolean> {
  const cols = await prisma.$queryRawUnsafe<ColInfo[]>(`PRAGMA table_info("MentorSession")`);
  return cols.some((c) => c.name === "scopeKey");
}

async function main() {
  const hasCol = await hasScopeKeyColumn();
  if (!hasCol) {
    console.log("Adding scopeKey column (TEXT NOT NULL DEFAULT '')…");
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MentorSession" ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT ''`,
    );
  } else {
    console.log("scopeKey column already present");
  }

  const taskFilled = await prisma.$executeRawUnsafe(`
    UPDATE "MentorSession"
    SET "scopeKey" = 'task:' || "taskId"
    WHERE "taskId" IS NOT NULL
      AND ("scopeKey" = '' OR "scopeKey" IS NULL OR "scopeKey" NOT LIKE 'task:%')
  `);
  console.log("task scopeKey rows touched:", taskFilled);

  const topicFilled = await prisma.$executeRawUnsafe(`
    UPDATE "MentorSession"
    SET "scopeKey" = 'topic:' || "topicId"
    WHERE "taskId" IS NULL
      AND "topicId" IS NOT NULL
      AND ("scopeKey" = '' OR "scopeKey" IS NULL OR "scopeKey" NOT LIKE 'topic:%')
  `);
  console.log("topic scopeKey rows touched:", topicFilled);

  const orphans = await prisma.$executeRawUnsafe(`
    DELETE FROM "MentorSession"
    WHERE ("scopeKey" = '' OR "scopeKey" IS NULL)
      AND "taskId" IS NULL
      AND "topicId" IS NULL
  `);
  console.log("orphan sessions deleted:", orphans);

  // Дубликаты одинакового scopeKey у одного user: оставляем сессию с наибольшим числом сообщений
  const dups = await prisma.$queryRawUnsafe<
    { userId: string; scopeKey: string; c: number }[]
  >(`
    SELECT "userId", "scopeKey", COUNT(*) as c
    FROM "MentorSession"
    WHERE "scopeKey" != ''
    GROUP BY "userId", "scopeKey"
    HAVING c > 1
  `);

  for (const g of dups) {
    const sessions = await prisma.$queryRawUnsafe<{ id: string; n: number }[]>(`
      SELECT s."id" as id, COUNT(m."id") as n
      FROM "MentorSession" s
      LEFT JOIN "MentorMessage" m ON m."sessionId" = s."id"
      WHERE s."userId" = '${g.userId.replace(/'/g, "''")}'
        AND s."scopeKey" = '${g.scopeKey.replace(/'/g, "''")}'
      GROUP BY s."id"
      ORDER BY n DESC, s."createdAt" ASC
    `);
    const keep = sessions[0]?.id;
    if (!keep) continue;
    for (const s of sessions.slice(1)) {
      // Переносим сообщения в keep, затем удаляем дубль
      await prisma.$executeRawUnsafe(`
        UPDATE "MentorMessage" SET "sessionId" = '${keep}' WHERE "sessionId" = '${s.id}'
      `);
      await prisma.$executeRawUnsafe(`
        DELETE FROM "MentorSession" WHERE "id" = '${s.id}'
      `);
      console.log("merged duplicate session", s.id, "→", keep);
    }
  }

  const empty = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM "MentorSession" WHERE "scopeKey" = '' OR "scopeKey" IS NULL`,
  );
  const emptyCount = Number(empty[0]?.n ?? 0);
  console.log("left empty:", emptyCount);

  const dupAfter = await prisma.$queryRawUnsafe<{ n: number }[]>(`
    SELECT COUNT(*) as n FROM (
      SELECT "userId", "scopeKey", COUNT(*) as c
      FROM "MentorSession"
      GROUP BY "userId", "scopeKey"
      HAVING c > 1
    )
  `);
  const dupCount = Number(dupAfter[0]?.n ?? 0);
  console.log("duplicate (userId,scopeKey) groups:", dupCount);

  if (emptyCount > 0 || dupCount > 0) {
    console.error("Backfill incomplete — do not run prisma db push with new unique yet.");
    process.exit(1);
  }
  console.log("OK: safe to prisma db push (if unique not applied yet).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
