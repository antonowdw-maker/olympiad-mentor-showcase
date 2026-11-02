/**
 * FS-обёртка бэкапа SQLite (копия + ротация).
 * Вызывается из scripts/backup-db.ts и из prisma/seed.ts перед опасными шагами.
 */
import fs from "node:fs";
import path from "node:path";
import {
  backupNamesToDelete,
  DB_BACKUP_KEEP_DEFAULT,
  formatDbBackupName,
  isBackupFresh,
  isDbBackupFileName,
  resolveSqlitePathFromDatabaseUrl,
} from "./backup";

export type BackupResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; dest: string }
  | { ok: false; error: string };

function copyIfExists(src: string, dest: string) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

function listBackupsNewestFirst(dir: string): { name: string; mtimeMs: number }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(isDbBackupFileName)
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
}

function pruneExtras(dir: string, keep: number) {
  const listed = listBackupsNewestFirst(dir);
  const toDelete = backupNamesToDelete(
    listed.map((x) => x.name),
    keep,
  );
  for (const name of toDelete) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = path.join(dir, name + suffix);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    console.log(`[db:backup] удалён старый бэкап ${name}`);
  }
}

export function runDbBackup(opts: {
  cwd: string;
  ifStale: boolean;
  keep?: number;
  nowMs?: number;
  databaseUrl?: string;
}): BackupResult {
  const schemaDir = path.join(opts.cwd, "prisma");
  const backupDir = path.join(opts.cwd, "backups", "db");
  const dbPath = resolveSqlitePathFromDatabaseUrl(
    opts.databaseUrl ?? process.env.DATABASE_URL,
    schemaDir,
  );
  if (!dbPath) {
    // Чистый клон / другой драйвер — не валим npm-скрипты (I14F-01)
    return {
      ok: true,
      skipped: true,
      reason: "DATABASE_URL не file:… — бэкап SQLite не нужен",
    };
  }
  if (!fs.existsSync(dbPath)) {
    // Первый db:reset / dev до появления файла — пропускаем, exit 0 (I14F-01)
    return {
      ok: true,
      skipped: true,
      reason: `файла БД ещё нет (${dbPath}) — бэкап после первого создания`,
    };
  }

  const keep = opts.keep ?? DB_BACKUP_KEEP_DEFAULT;
  const nowMs = opts.nowMs ?? Date.now();
  const existing = listBackupsNewestFirst(backupDir);
  if (opts.ifStale && isBackupFresh(existing[0]?.mtimeMs ?? null, nowMs)) {
    return {
      ok: true,
      skipped: true,
      reason: `есть свежий бэкап (${existing[0]!.name}), младше 24 ч`,
    };
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const name = formatDbBackupName(new Date(nowMs));
  const dest = path.join(backupDir, name);
  fs.copyFileSync(dbPath, dest);
  copyIfExists(dbPath + "-wal", dest + "-wal");
  copyIfExists(dbPath + "-shm", dest + "-shm");
  pruneExtras(backupDir, keep);
  return { ok: true, skipped: false, dest };
}
