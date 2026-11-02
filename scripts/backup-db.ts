/**
 * Копия локальной SQLite + ротация (оставить 2 последних).
 *
 *   npm run db:backup              — всегда новый бэкап
 *   npm run db:backup -- --if-stale — только если нет свежего (< 24 ч)
 *
 * Файлы: backups/db/dev-YYYYMMDD-HHmmss.db (+ -wal/-shm при наличии).
 */
import fs from "node:fs";
import path from "node:path";
import { DB_BACKUP_KEEP_DEFAULT } from "../lib/db/backup";
import { runDbBackup } from "../lib/db/run-backup";

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function main() {
  const cwd = process.cwd();
  loadDotEnv(path.join(cwd, ".env"));
  const ifStale = process.argv.includes("--if-stale");
  const result = runDbBackup({ cwd, ifStale });
  if (!result.ok) {
    console.error(`[db:backup] ${result.error}`);
    process.exitCode = 1;
    return;
  }
  if (result.skipped) {
    console.log(`[db:backup] пропуск: ${result.reason}`);
    return;
  }
  console.log(`[db:backup] OK → ${result.dest} (храним ≤${DB_BACKUP_KEEP_DEFAULT})`);
}

main();
