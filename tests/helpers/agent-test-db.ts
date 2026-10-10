import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { resetAgentEnvCache } from "@/agent/config";
import type { AppDatabase } from "@/db/factory";

function applyMigrations(sqlite: Database.Database) {
  const migrationsDir = path.join(process.cwd(), "src/db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      sqlite.exec(statement);
    }
  }
}

function setEnv(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

export function createAgentTestDb() {
  resetAgentEnvCache();
  setEnv("NODE_ENV", "test");
  setEnv("AGENT_DEFAULT_PROVIDER", "mock");
  setEnv("AGENT_ALLOW_MOCK_IN_PRODUCTION", "false");
  setEnv("AGENT_KILL_SWITCH", "false");
  setEnv("AGENT_GLOBAL_BUDGET_CENTS", "50000");
  setEnv("AGENT_DEFAULT_JOB_BUDGET_CENTS", "100");
  setEnv("AGENT_DEFAULT_MAX_ATTEMPTS", "3");
  setEnv("AGENT_DEFAULT_TIMEOUT_MS", "2000");
  setEnv("AGENT_WORKER_LOCK_MS", "200");
  setEnv("GEMINI_API_KEY", "");
  setEnv("GROQ_API_KEY", "");
  setEnv("OPENROUTER_API_KEY", "");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-agent-"));
  const dbPath = path.join(dir, "test.sqlite");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);

  const stamp = "2026-01-01T00:00:00.000Z";
  sqlite
    .prepare(
      `INSERT INTO organizations (id, name, slug, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run("org_test", "[TEST] Org", "test-org", stamp, stamp);

  const db = drizzle(sqlite, { schema }) as AppDatabase;

  return {
    db,
    sqlite,
    path: dbPath,
    organizationId: "org_test",
    close() {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
      resetAgentEnvCache();
    },
  };
}
