import "server-only";
import { getServerEnv } from "@/lib/env";
import {
  openDatabase,
  resolveSqlitePath,
  type AppDatabase,
} from "@/db/factory";

export type { AppDatabase };

const globalForDb = globalThis as unknown as {
  __agencyDbHandle?: ReturnType<typeof openDatabase>;
};

function getHandle() {
  if (!globalForDb.__agencyDbHandle) {
    const env = getServerEnv();
    globalForDb.__agencyDbHandle = openDatabase(env.DATABASE_PATH);
  }
  return globalForDb.__agencyDbHandle;
}

export function getSqlite() {
  return getHandle().sqlite;
}

export function getDb(): AppDatabase {
  return getHandle().db;
}

export function checkDatabaseHealth(): {
  ok: boolean;
  path: string;
  error?: string;
} {
  const env = getServerEnv();
  const dbPath = resolveSqlitePath(env.DATABASE_PATH);
  try {
    const row = getSqlite().prepare("select 1 as ok").get() as { ok: number };
    return { ok: row.ok === 1, path: dbPath };
  } catch (error) {
    return {
      ok: false,
      path: dbPath,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
