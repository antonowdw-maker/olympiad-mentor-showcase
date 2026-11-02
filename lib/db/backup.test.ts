/**
 * Unit: правила бэкапа SQLite (ротация / свежесть / имя).
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  backupNamesToDelete,
  formatDbBackupName,
  isBackupFresh,
  isDbBackupFileName,
  resolveSqlitePathFromDatabaseUrl,
} from "./backup";

describe("formatDbBackupName / isDbBackupFileName", () => {
  it("UTC stamp и regex", () => {
    const name = formatDbBackupName(new Date("2026-09-15T09:30:45.000Z"));
    expect(name).toBe("dev-20260915-093045.db");
    expect(isDbBackupFileName(name)).toBe(true);
    expect(isDbBackupFileName("dev.db")).toBe(false);
  });
});

describe("backupNamesToDelete", () => {
  it("оставляет keep новейших", () => {
    expect(backupNamesToDelete(["a.db", "b.db", "c.db"], 2)).toEqual(["c.db"]);
    expect(backupNamesToDelete(["a.db", "b.db"], 2)).toEqual([]);
    expect(backupNamesToDelete(["a.db"], 2)).toEqual([]);
  });
});

describe("isBackupFresh", () => {
  it("свежий в пределах суток", () => {
    const now = 1_000_000;
    expect(isBackupFresh(now - 1000, now, 86_400_000)).toBe(true);
    expect(isBackupFresh(now - 86_400_001, now, 86_400_000)).toBe(false);
    expect(isBackupFresh(null, now)).toBe(false);
  });
});

describe("resolveSqlitePathFromDatabaseUrl", () => {
  it("относительный file: от schemaDir", () => {
    const schemaDir = path.resolve("tmp-schema-dir");
    expect(resolveSqlitePathFromDatabaseUrl("file:./dev.db", schemaDir)).toBe(
      path.resolve(schemaDir, "./dev.db"),
    );
  });
});
