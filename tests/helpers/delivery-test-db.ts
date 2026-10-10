import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { resetDeliveryEnvCache } from "@/delivery/config";
import type { AppDatabase } from "@/db/factory";
import { createId } from "@/lib/id";

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

export function createDeliveryTestDb() {
  resetDeliveryEnvCache();
  setEnv("NODE_ENV", "test");
  setEnv("DELIVERY_RUNS_ENABLED", "true");
  setEnv("DELIVERY_DEPLOY_ENABLED", "false");
  setEnv("DELIVERY_PUBLICATION_ENABLED", "false");
  setEnv("DELIVERY_SPENDING_ENABLED", "false");
  setEnv("DELIVERY_DESTRUCTIVE_ENABLED", "false");
  setEnv("DELIVERY_ALLOW_MODEL_CODE_EXECUTION", "false");
  setEnv("DELIVERY_PLAYWRIGHT_ENABLED", "false");
  setEnv("BRAVE_SEARCH_API_KEY", "");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-delivery-"));
  const workspaceRoot = path.join(dir, "workspaces");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  setEnv("DELIVERY_WORKSPACE_ROOT", workspaceRoot);

  const dbPath = path.join(dir, "test.sqlite");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);

  const stamp = "2026-01-01T00:00:00.000Z";
  const organizationId = "org_delivery_test";
  const userId = "user_delivery_admin";
  const projectId = "proj_delivery_1";

  sqlite
    .prepare(
      `INSERT INTO organizations (id, name, slug, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(organizationId, "[TEST] Delivery Org", "delivery-test", stamp, stamp);

  sqlite
    .prepare(
      `INSERT INTO users (id, organization_id, email, name, password_hash, role, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      userId,
      organizationId,
      "delivery@agency.test",
      "Delivery Admin",
      "x",
      "admin",
      stamp,
      stamp,
    );

  sqlite
    .prepare(
      `INSERT INTO projects (id, organization_id, name, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      projectId,
      organizationId,
      "[TEST] Delivery Project",
      "active",
      stamp,
      stamp,
    );

  const db = drizzle(sqlite, { schema }) as AppDatabase;

  return {
    db,
    sqlite,
    path: dbPath,
    dir,
    workspaceRoot,
    organizationId,
    userId,
    projectId,
    async createWorkflow(input: {
      templateId: string;
      brief: Record<string, string | number | boolean>;
      mode?: "mock" | "live";
      name?: string;
    }) {
      const id = createId("dwf");
      const now = new Date().toISOString();
      await db.insert(schema.deliveryWorkflows).values({
        id,
        organizationId,
        projectId,
        templateId: input.templateId,
        name: input.name ?? `Workflow ${input.templateId}`,
        status: "ready",
        mode: input.mode ?? "mock",
        briefJson: JSON.stringify(input.brief),
        scopeJson: "{}",
        currentVersion: 0,
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    },
    close() {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
      resetDeliveryEnvCache();
    },
  };
}
