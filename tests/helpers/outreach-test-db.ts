import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { resetOutreachEnvCache } from "@/outreach/config";
import { setEmergencyStop, setSendingEnabled } from "@/outreach/gates";
import { MockEmailSender } from "@/outreach/senders/mock";
import { setTestEmailSender } from "@/outreach/senders/registry";
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

export function createOutreachTestDb() {
  resetOutreachEnvCache();
  setTestEmailSender(null);

  setEnv("NODE_ENV", "test");
  setEnv("SESSION_SECRET", "test-session-secret-at-least-32-chars!!");
  setEnv("OUTREACH_SENDING_ENABLED", "true");
  setEnv("OUTREACH_EMERGENCY_STOP", "false");
  setEnv("OUTREACH_DAILY_QUOTA", "50");
  setEnv("OUTREACH_PER_CAMPAIGN_LIMIT", "100");
  setEnv("OUTREACH_RATE_LIMIT_PER_MINUTE", "100");
  setEnv("OUTREACH_FROM_EMAIL", "sender@agency.test");
  setEnv("OUTREACH_FROM_NAME", "Agency Test");
  setEnv("RESEND_API_KEY", "");
  setEnv(
    "OUTREACH_UNSUBSCRIBE_BASE_URL",
    "http://localhost:3000/api/outreach/unsubscribe",
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-outreach-"));
  const dbPath = path.join(dir, "test.sqlite");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);

  const stamp = "2026-01-01T00:00:00.000Z";
  const organizationId = "org_outreach_test";
  const userId = "user_outreach_admin";
  const leadId = "lead_outreach_1";

  sqlite
    .prepare(
      `INSERT INTO organizations (id, name, slug, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(organizationId, "[TEST] Outreach Org", "outreach-test", stamp, stamp);

  sqlite
    .prepare(
      `INSERT INTO users (id, organization_id, email, name, password_hash, role, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      userId,
      organizationId,
      "admin@agency.test",
      "Admin",
      "x",
      "admin",
      stamp,
      stamp,
    );

  sqlite
    .prepare(
      `INSERT INTO leads (
        id, organization_id, name, email, email_provenance, company, status,
        source, score, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      leadId,
      organizationId,
      "Acme Contact",
      "prospect@acme.test",
      "observed",
      "Acme Co",
      "new",
      "manual",
      80,
      stamp,
      stamp,
    );

  const db = drizzle(sqlite, { schema }) as AppDatabase;
  const mockSender = new MockEmailSender();
  setTestEmailSender(mockSender);

  return {
    db,
    sqlite,
    path: dbPath,
    organizationId,
    userId,
    leadId,
    mockSender,
    async enableSending() {
      await setSendingEnabled(db, true);
      await setEmergencyStop(db, false);
    },
    async disableSending() {
      await setSendingEnabled(db, false);
    },
    async emergencyStop(on = true) {
      await setEmergencyStop(db, on);
    },
    close() {
      setTestEmailSender(null);
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
      resetOutreachEnvCache();
    },
  };
}

export async function seedApprovedSendFixture(
  db: AppDatabase,
  opts: {
    organizationId: string;
    userId: string;
    leadId: string;
    campaignStatus?: "approved" | "draft" | "pending_review" | "stopped";
    messageStatus?: "approved" | "draft" | "in_review" | "scheduled";
    toEmail?: string;
    sendLimit?: number;
    sentCount?: number;
    approvalRequired?: boolean;
    approved?: boolean;
  },
) {
  const stamp = new Date().toISOString();
  const campaignId = createId("ocamp");
  const messageId = createId("omsg");
  const status = opts.campaignStatus ?? "approved";
  const approved = opts.approved ?? status === "approved";

  await db.insert(schema.outreachCampaigns).values({
    id: campaignId,
    organizationId: opts.organizationId,
    name: "Test Campaign",
    status,
    category: "approved_outreach",
    sendLimit: opts.sendLimit ?? 50,
    sentCount: opts.sentCount ?? 0,
    approvalRequired: opts.approvalRequired ?? true,
    approvedByUserId: approved ? opts.userId : null,
    approvedAt: approved ? stamp : null,
    approvalNote: approved ? "ok" : null,
    createdByUserId: opts.userId,
    createdAt: stamp,
    updatedAt: stamp,
  });

  await db.insert(schema.outreachMessages).values({
    id: messageId,
    organizationId: opts.organizationId,
    campaignId,
    leadId: opts.leadId,
    type: "personalized_outreach",
    status: opts.messageStatus ?? "approved",
    subject: "Hello Acme",
    bodyText: "Evidence-backed note.",
    toEmail: opts.toEmail ?? "prospect@acme.test",
    evidenceIdsJson: "[]",
    createdByUserId: opts.userId,
    reviewedByUserId: opts.userId,
    reviewedAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  });

  return { campaignId, messageId };
}
