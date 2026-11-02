/**
 * Синхронизация Prisma Client со схемой (хеш schema.prisma).
 *
 * Зачем: после `db push` / смены schema клиент в node_modules устаревает;
 * на Windows `next dev` часто держит query_engine DLL → `prisma generate` падает с EPERM.
 *
 *   tsx scripts/ensure-prisma-client.ts           — generate только если хеш не совпал
 *   tsx scripts/ensure-prisma-client.ts --force   — всегда generate
 *   tsx scripts/ensure-prisma-client.ts --check   — только проверка (exit 1 если устарел)
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
const CLIENT_DIR = path.join(ROOT, "node_modules", ".prisma", "client");
const CLIENT_INDEX = path.join(CLIENT_DIR, "index.js");
const STAMP = path.join(CLIENT_DIR, ".olympiad-schema.sha256");

const force = process.argv.includes("--force");
const checkOnly = process.argv.includes("--check");

function sleepMs(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy wait — без зависимостей; короткие ретраи */
  }
}

function schemaHash(): string {
  const body = fs.readFileSync(SCHEMA);
  return createHash("sha256").update(body).digest("hex");
}

function readStamp(): string | null {
  try {
    return fs.readFileSync(STAMP, "utf8").trim();
  } catch {
    return null;
  }
}

function writeStamp(hash: string) {
  fs.mkdirSync(CLIENT_DIR, { recursive: true });
  fs.writeFileSync(STAMP, `${hash}\n`, "utf8");
}

function clientLooksPresent(): boolean {
  return fs.existsSync(CLIENT_INDEX);
}

function isStale(hash: string): boolean {
  if (!clientLooksPresent()) return true;
  return readStamp() !== hash;
}

function prismaGenerateOnce(): void {
  const prismaCli = path.join(
    ROOT,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  if (fs.existsSync(prismaCli)) {
    execFileSync(process.execPath, [prismaCli, "generate"], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    return;
  }
  execFileSync("npx", ["prisma", "generate"], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

function generateWithRetries(maxAttempts = 6): void {
  let last: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      prismaGenerateOnce();
      return;
    } catch (e) {
      last = e;
      const wait = 400 * i;
      console.warn(
        `[prisma:ensure] generate не удался (попытка ${i}/${maxAttempts}). ` +
          `Часто Windows + «npm run dev» держит query_engine. Жду ${wait} ms…`,
      );
      sleepMs(wait);
    }
  }
  console.error(`
[prisma:ensure] Не удалось обновить Prisma Client.

1) Останови next (Ctrl+C в терминале с «npm run dev»).
2) npm run db:generate
3) npm run dev

Причина обычно EPERM rename query_engine-windows.dll.node.
`);
  throw last instanceof Error ? last : new Error(String(last));
}

function main() {
  if (!fs.existsSync(SCHEMA)) {
    console.error(`[prisma:ensure] нет файла ${SCHEMA}`);
    process.exit(1);
  }

  const hash = schemaHash();
  const stale = isStale(hash);

  if (checkOnly) {
    if (stale) {
      console.error(
        "[prisma:ensure] клиент устарел относительно prisma/schema.prisma — запусти npm run db:generate",
      );
      process.exit(1);
    }
    console.log("[prisma:ensure] ok (хеш совпадает)");
    return;
  }

  if (!force && !stale) {
    console.log("[prisma:ensure] клиент актуален");
    return;
  }

  console.log(
    force
      ? "[prisma:ensure] --force → prisma generate"
      : "[prisma:ensure] схема изменилась → prisma generate",
  );
  generateWithRetries();
  writeStamp(hash);
  console.log("[prisma:ensure] готово");
}

main();
