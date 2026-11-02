/**
 * Upgrade / backfill DayPlanPackage.scopeKey (iter 10c).
 *
 * Безопасный порядок для БД **до** 10c (ещё без колонки или с пустым scopeKey):
 * 1. Скопировать `prisma/dev.db` → backup.
 * 2. `npm run db:backfill-plan-scope` — ADD COLUMN при необходимости + заполнение
 *    `topic:<slug>` **до** смены unique на (userId, scopeKey, date, seq).
 * 3. `npx prisma db push` — применить unique из schema.
 * 4. Повторный backfill должен оставить 0 пустых scopeKey.
 *
 * Если сделать `db push` со сменой unique раньше backfill, при двух темах с seq=1
 * в один день у одного user строки получат одинаковый ключ (user,"",date,1) — конфликт.
 *
 * Запуск: npm run db:backfill-plan-scope
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ColInfo = { name: string };

async function hasScopeKeyColumn(): Promise<boolean> {
  const cols = await prisma.$queryRawUnsafe<ColInfo[]>(`PRAGMA table_info("DayPlanPackage")`);
  return cols.some((c) => c.name === "scopeKey");
}

async function main() {
  const hasCol = await hasScopeKeyColumn();
  if (!hasCol) {
    console.log("Adding scopeKey column (TEXT NOT NULL DEFAULT '')…");
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "DayPlanPackage" ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT ''`,
    );
  } else {
    console.log("scopeKey column already present");
  }

  // Raw UPDATE: работает до/после Prisma unique; не зависит от client API.
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "DayPlanPackage"
    SET "scopeKey" = 'topic:' || (
      SELECT "slug" FROM "Topic" WHERE "Topic"."id" = "DayPlanPackage"."topicId"
    )
    WHERE ("scopeKey" = '' OR "scopeKey" IS NULL)
      AND EXISTS (SELECT 1 FROM "Topic" WHERE "Topic"."id" = "DayPlanPackage"."topicId")
  `);
  console.log("rows backfilled:", updated);

  const empty = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM "DayPlanPackage" WHERE "scopeKey" = '' OR "scopeKey" IS NULL`,
  );
  const emptyCount = Number(empty[0]?.n ?? 0);
  console.log("left empty:", emptyCount);

  const dups = await prisma.$queryRawUnsafe<{ n: number }[]>(`
    SELECT COUNT(*) as n FROM (
      SELECT "userId", "scopeKey", "date", "seq", COUNT(*) as c
      FROM "DayPlanPackage"
      GROUP BY "userId", "scopeKey", "date", "seq"
      HAVING c > 1
    )
  `);
  const dupCount = Number(dups[0]?.n ?? 0);
  console.log("duplicate (userId,scopeKey,date,seq) groups:", dupCount);

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
