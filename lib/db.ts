/**
 * Prisma Client (singleton) — чтобы в dev не плодить соединения при HMR.
 * В development предупреждаем, если schema.prisma новее stamp после ensure.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaStaleWarned?: boolean;
};

function warnIfPrismaClientStale() {
  if (process.env.NODE_ENV === "production") return;
  if (globalForPrisma.prismaStaleWarned) return;
  try {
    const root = process.cwd();
    const schema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"));
    const hash = createHash("sha256").update(schema).digest("hex");
    const stampPath = path.join(
      root,
      "node_modules",
      ".prisma",
      "client",
      ".olympiad-schema.sha256",
    );
    const stamp = fs.readFileSync(stampPath, "utf8").trim();
    if (stamp === hash) return;
    globalForPrisma.prismaStaleWarned = true;
    console.error(
      "[prisma] Клиент устарел относительно prisma/schema.prisma.\n" +
        "  Останови next (Ctrl+C) → npm run db:generate → npm run dev\n" +
        "  (на Windows next часто блокирует query_engine DLL.)",
    );
  } catch {
    // нет stamp / schema — ensure ещё не гоняли; молчим
  }
}

warnIfPrismaClientStale();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
