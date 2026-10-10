import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
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
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }
  }
}

export function createDmiTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-dmi-"));
  const dbPath = path.join(dir, "test.sqlite");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);

  const stamp = "2026-01-01T00:00:00.000Z";
  const organizationId = "org_dmi_a";
  const otherOrgId = "org_dmi_b";
  const userId = "user_dmi_a";
  const leadId = "lead_dmi_1";

  for (const [id, slug] of [
    [organizationId, "dmi-a"],
    [otherOrgId, "dmi-b"],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, is_demo, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(id, `[TEST] ${slug}`, slug, stamp, stamp);
  }

  sqlite
    .prepare(
      `INSERT INTO users (id, organization_id, email, name, password_hash, role, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(userId, organizationId, "dmi@test.local", "DMI", "x", "admin", stamp, stamp);

  sqlite
    .prepare(
      `INSERT INTO leads (
        id, organization_id, name, email, email_provenance, company, domain, status,
        source, score, acquisition_source, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      leadId,
      organizationId,
      "Acme Contact",
      "prospect@acme.test",
      "observed",
      "Acme Co",
      "acme.test",
      "qualified",
      "manual",
      70,
      "manual",
      stamp,
      stamp,
    );

  const otherLeadId = "lead_dmi_other";
  sqlite
    .prepare(
      `INSERT INTO leads (
        id, organization_id, name, email, email_provenance, company, domain, status,
        source, score, acquisition_source, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      otherLeadId,
      otherOrgId,
      "Other",
      "x@other.test",
      "observed",
      "Other Co",
      "other.test",
      "new",
      "manual",
      10,
      "manual",
      stamp,
      stamp,
    );

  const db = drizzle(sqlite, { schema }) as AppDatabase;
  return {
    db,
    sqlite,
    dir,
    organizationId,
    otherOrgId,
    userId,
    leadId,
    otherLeadId,
    createId,
    close() {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
