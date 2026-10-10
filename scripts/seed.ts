/**
 * Deterministic demo seed. All seeded rows are flagged isDemo=true and
 * use stable IDs so re-seeding is idempotent.
 *
 * Demo login: demo@agency.local / DemoPass123!
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./data/agency.sqlite";

const DEMO = {
  orgId: "org_demo_agency_001",
  userId: "user_demo_admin_001",
  clientId: "client_demo_northwind",
  leadId: "lead_demo_acme",
  serviceId: "svc_demo_brand",
  projectId: "proj_demo_website",
  taskId: "task_demo_kickoff",
  email: "demo@agency.local",
  password: "DemoPass123!",
} as const;

async function main() {
  if (process.env.SEED_DEMO_DATA !== "true") {
    console.error("Refusing to seed: set SEED_DEMO_DATA=true explicitly.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }

  const relative = DATABASE_PATH.replace(/^\.\/?/, "");
  const scoped = path.isAbsolute(DATABASE_PATH)
    ? DATABASE_PATH
    : relative.startsWith("data/")
      ? relative
      : path.posix.join("data", path.posix.basename(relative));
  const dbPath = path.isAbsolute(scoped)
    ? scoped
    : path.join(process.cwd(), scoped);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  const passwordHash = await bcrypt.hash(DEMO.password, 12);
  const stamp = "2026-01-01T00:00:00.000Z";

  await db
    .insert(schema.organizations)
    .values({
      id: DEMO.orgId,
      name: "[DEMO] Northstar Agency",
      slug: "demo-northstar",
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.organizations.id,
      set: {
        name: "[DEMO] Northstar Agency",
        isDemo: true,
        updatedAt: stamp,
      },
    });

  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.id, DEMO.userId),
  });
  if (existingUser) {
    await db
      .update(schema.users)
      .set({
        email: DEMO.email,
        name: "[DEMO] Admin User",
        passwordHash,
        role: "admin",
        organizationId: DEMO.orgId,
        isDemo: true,
        updatedAt: stamp,
      })
      .where(eq(schema.users.id, DEMO.userId));
  } else {
    await db.insert(schema.users).values({
      id: DEMO.userId,
      email: DEMO.email,
      name: "[DEMO] Admin User",
      passwordHash,
      role: "admin",
      organizationId: DEMO.orgId,
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  await db
    .insert(schema.clients)
    .values({
      id: DEMO.clientId,
      organizationId: DEMO.orgId,
      name: "[DEMO] Northwind Traders",
      email: "contact@northwind.demo",
      company: "Northwind Traders",
      phone: "+1-555-0100",
      status: "active",
      notes: "Demo client — safe to delete.",
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.clients.id,
      set: { name: "[DEMO] Northwind Traders", isDemo: true, updatedAt: stamp },
    });

  await db
    .insert(schema.leads)
    .values({
      id: DEMO.leadId,
      organizationId: DEMO.orgId,
      name: "[DEMO] Ada Lovelace",
      email: "ada@acme.demo",
      company: "Acme Analytics",
      status: "qualified",
      source: "referral",
      notes: "Demo lead — labeled for easy identification.",
      domain: "acme.demo",
      websiteUrl: "https://acme.demo",
      market: "B2B",
      niche: "analytics",
      serviceFit: 72,
      score: 68,
      emailProvenance: "observed",
      phoneProvenance: "unknown",
      nameProvenance: "observed",
      acquisitionSource: "manual",
      lastRetrievedAt: stamp,
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.leads.id,
      set: {
        name: "[DEMO] Ada Lovelace",
        isDemo: true,
        domain: "acme.demo",
        market: "B2B",
        niche: "analytics",
        updatedAt: stamp,
      },
    });

  await db
    .insert(schema.services)
    .values({
      id: DEMO.serviceId,
      organizationId: DEMO.orgId,
      name: "[DEMO] Brand Strategy",
      description: "Demo service package for workshops and positioning.",
      billingType: "fixed",
      unitPriceCents: 850000,
      isActive: true,
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.services.id,
      set: { name: "[DEMO] Brand Strategy", isDemo: true, updatedAt: stamp },
    });

  await db
    .insert(schema.projects)
    .values({
      id: DEMO.projectId,
      organizationId: DEMO.orgId,
      clientId: DEMO.clientId,
      name: "[DEMO] Marketing Site Redesign",
      description: "Demo project tied to the Northwind client.",
      status: "active",
      startDate: "2026-01-15",
      dueDate: "2026-03-31",
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.projects.id,
      set: {
        name: "[DEMO] Marketing Site Redesign",
        isDemo: true,
        updatedAt: stamp,
      },
    });

  await db
    .insert(schema.tasks)
    .values({
      id: DEMO.taskId,
      organizationId: DEMO.orgId,
      projectId: DEMO.projectId,
      title: "[DEMO] Kickoff workshop",
      description: "Demo task for onboarding the redesign engagement.",
      status: "todo",
      priority: "high",
      assigneeId: DEMO.userId,
      dueDate: "2026-01-20",
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.tasks.id,
      set: { title: "[DEMO] Kickoff workshop", isDemo: true, updatedAt: stamp },
    });

  await db
    .insert(schema.agentRuntimeSettings)
    .values({
      id: "global",
      killSwitchEnabled: false,
      globalBudgetCents: Number(
        process.env.AGENT_GLOBAL_BUDGET_CENTS ?? 50_000,
      ),
      globalSpendCents: 0,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.agentRuntimeSettings.id,
      set: {
        killSwitchEnabled: false,
        globalBudgetCents: Number(
          process.env.AGENT_GLOBAL_BUDGET_CENTS ?? 50_000,
        ),
        updatedAt: stamp,
      },
    });

  await db
    .insert(schema.outreachSettings)
    .values({
      id: "global",
      sendingEnabled: false,
      emergencyStop: false,
      dailyQuota: Number(process.env.OUTREACH_DAILY_QUOTA ?? 50),
      perCampaignLimit: Number(process.env.OUTREACH_PER_CAMPAIGN_LIMIT ?? 100),
      rateLimitPerMinute: Number(
        process.env.OUTREACH_RATE_LIMIT_PER_MINUTE ?? 10,
      ),
      defaultFromEmail: process.env.OUTREACH_FROM_EMAIL || null,
      defaultFromName: process.env.OUTREACH_FROM_NAME || "Agency OS",
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.outreachSettings.id,
      set: {
        sendingEnabled: false,
        emergencyStop: false,
        dailyQuota: Number(process.env.OUTREACH_DAILY_QUOTA ?? 50),
        perCampaignLimit: Number(
          process.env.OUTREACH_PER_CAMPAIGN_LIMIT ?? 100,
        ),
        rateLimitPerMinute: Number(
          process.env.OUTREACH_RATE_LIMIT_PER_MINUTE ?? 10,
        ),
        updatedAt: stamp,
      },
    });

  console.log("Demo seed complete.");
  console.log(`  Org:    [DEMO] Northstar Agency (${DEMO.orgId})`);
  console.log(`  Login:  ${DEMO.email} / ${DEMO.password}`);
  console.log(
    "  All seeded records are prefixed [DEMO] and flagged isDemo=true.",
  );
  console.log("  Agent runtime settings row: global");
  console.log("  Outreach sending: DISABLED by default");

  await db
    .insert(schema.deliverySettings)
    .values({
      id: "global",
      runsEnabled: true,
      deployEnabled: false,
      publicationEnabled: false,
      spendingEnabled: false,
      destructiveEnabled: false,
      allowModelCodeExecution: false,
      workspaceRoot: process.env.DELIVERY_WORKSPACE_ROOT ?? "./data/workspaces",
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: schema.deliverySettings.id,
      set: {
        runsEnabled: true,
        deployEnabled: false,
        publicationEnabled: false,
        spendingEnabled: false,
        destructiveEnabled: false,
        allowModelCodeExecution: false,
        updatedAt: stamp,
      },
    });

  console.log("  Delivery privileged actions: LOCKED by default");
  sqlite.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
