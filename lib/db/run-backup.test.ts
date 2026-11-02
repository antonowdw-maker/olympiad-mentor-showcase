/**
 * Unit: runDbBackup при отсутствии файла БД не падает (I14F-01).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDbBackup } from "./run-backup";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("runDbBackup (I14F-01)", () => {
  it("нет prisma/dev.db → skipped ok, без ошибки", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "om-bak-"));
    dirs.push(cwd);
    fs.mkdirSync(path.join(cwd, "prisma"), { recursive: true });
    const r = runDbBackup({
      cwd,
      ifStale: false,
      databaseUrl: "file:./dev.db",
    });
    expect(r).toEqual({
      ok: true,
      skipped: true,
      reason: expect.stringMatching(/ещё нет/),
    });
  });

  it("есть файл → создаёт бэкап и ротацию keep=2", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "om-bak-"));
    dirs.push(cwd);
    const prismaDir = path.join(cwd, "prisma");
    fs.mkdirSync(prismaDir, { recursive: true });
    const db = path.join(prismaDir, "dev.db");
    fs.writeFileSync(db, "sqlite-fake");

    const r1 = runDbBackup({
      cwd,
      ifStale: false,
      databaseUrl: "file:./dev.db",
      nowMs: Date.parse("2026-09-15T10:00:00.000Z"),
      keep: 2,
    });
    expect(r1.ok && !r1.skipped).toBe(true);
    if (r1.ok && !r1.skipped) {
      expect(fs.existsSync(r1.dest)).toBe(true);
    }

    const r2 = runDbBackup({
      cwd,
      ifStale: false,
      databaseUrl: "file:./dev.db",
      nowMs: Date.parse("2026-09-15T11:00:00.000Z"),
      keep: 2,
    });
    expect(r2.ok && !r2.skipped).toBe(true);

    const r3 = runDbBackup({
      cwd,
      ifStale: false,
      databaseUrl: "file:./dev.db",
      nowMs: Date.parse("2026-09-15T12:00:00.000Z"),
      keep: 2,
    });
    expect(r3.ok && !r3.skipped).toBe(true);

    const bakDir = path.join(cwd, "backups", "db");
    const files = fs.readdirSync(bakDir).filter((n) => n.endsWith(".db"));
    expect(files.length).toBe(2);
  });
});
