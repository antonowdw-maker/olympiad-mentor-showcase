/**
 * Локальный бэкап SQLite: имена файлов, «свежесть», ротация (оставить N последних).
 * Без Prisma — чистое FS-правило для unit.
 */
import path from "node:path";

export const DB_BACKUP_KEEP_DEFAULT = 2;
/** Раз в сутки (мс). */
export const DB_BACKUP_MAX_AGE_MS_DEFAULT = 24 * 60 * 60 * 1000;

export const DB_BACKUP_FILE_RE = /^dev-\d{8}-\d{6}\.db$/;

/** Имя файла бэкапа: dev-YYYYMMDD-HHmmss.db (UTC). */
export function formatDbBackupName(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `dev-${y}${mo}${d}-${h}${mi}${s}.db`;
}

export function isDbBackupFileName(name: string): boolean {
  return DB_BACKUP_FILE_RE.test(name);
}

/**
 * Какие файлы удалить после нового бэкапа.
 * @param namesSortedNewestFirst — только имена бэкапов, уже отсортированные (новые → старые)
 * @param keep — сколько оставить (включая только что созданный)
 */
export function backupNamesToDelete(
  namesSortedNewestFirst: string[],
  keep: number = DB_BACKUP_KEEP_DEFAULT,
): string[] {
  const k = Math.max(0, Math.floor(keep));
  if (namesSortedNewestFirst.length <= k) return [];
  return namesSortedNewestFirst.slice(k);
}

/** true, если бэкап ещё «свежий» и новый не нужен. */
export function isBackupFresh(
  newestMtimeMs: number | null,
  nowMs: number,
  maxAgeMs: number = DB_BACKUP_MAX_AGE_MS_DEFAULT,
): boolean {
  if (newestMtimeMs == null || !Number.isFinite(newestMtimeMs)) return false;
  return nowMs - newestMtimeMs < maxAgeMs;
}

/**
 * Путь к файлу SQLite из DATABASE_URL.
 * Относительные `file:./…` — от schemaDir (обычно prisma/).
 */
export function resolveSqlitePathFromDatabaseUrl(
  databaseUrl: string | undefined,
  schemaDir: string,
): string | null {
  const raw = databaseUrl?.trim();
  if (!raw || !raw.startsWith("file:")) return null;
  let filePart = raw.slice("file:".length);
  if (filePart.startsWith("///")) {
    filePart = filePart.slice(3);
  } else if (filePart.startsWith("//")) {
    filePart = filePart.replace(/^\/\/[^/]*/, "");
  }
  if (!filePart) return null;
  if (/^[A-Za-z]:[\\/]/.test(filePart) || filePart.startsWith("/")) {
    return filePart;
  }
  return path.resolve(schemaDir, filePart);
}
