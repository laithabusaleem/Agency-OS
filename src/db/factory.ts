import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export type DbHandle = {
  sqlite: Database.Database;
  db: AppDatabase;
  path: string;
  close: () => void;
};

export function resolveSqlitePath(databasePath: string) {
  if (path.isAbsolute(databasePath)) return databasePath;
  const relative = databasePath.replace(/^\.\/?/, "");
  const scoped = relative.startsWith("data/")
    ? relative
    : path.posix.join("data", path.posix.basename(relative));
  return path.join(/* turbopackIgnore: true */ process.cwd(), scoped);
}

export function openDatabase(databasePath: string): DbHandle {
  const dbPath = resolveSqlitePath(databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    path: dbPath,
    close: () => sqlite.close(),
  };
}
