import { and, eq } from "drizzle-orm";
import { getAgentEnv } from "@/agent/config";
import { BudgetExceededError, KillSwitchError } from "@/agent/errors";
import type { AppDatabase } from "@/db/factory";
import { agentRuntimeSettings, agentUsageDaily } from "@/db/schema";
import { createId } from "@/lib/id";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

export async function ensureRuntimeSettings(db: AppDatabase) {
  const env = getAgentEnv();
  const existing = await db.query.agentRuntimeSettings.findFirst({
    where: eq(agentRuntimeSettings.id, "global"),
  });
  if (existing) return existing;

  const row = {
    id: "global",
    killSwitchEnabled: env.AGENT_KILL_SWITCH,
    globalBudgetCents: env.AGENT_GLOBAL_BUDGET_CENTS,
    globalSpendCents: 0,
    updatedAt: nowIso(),
  };
  await db.insert(agentRuntimeSettings).values(row);
  return row;
}

export async function getKillSwitchEnabled(db: AppDatabase) {
  const settings = await ensureRuntimeSettings(db);
  const env = getAgentEnv();
  return settings.killSwitchEnabled || env.AGENT_KILL_SWITCH;
}

export async function setKillSwitch(db: AppDatabase, enabled: boolean) {
  await ensureRuntimeSettings(db);
  await db
    .update(agentRuntimeSettings)
    .set({ killSwitchEnabled: enabled, updatedAt: nowIso() })
    .where(eq(agentRuntimeSettings.id, "global"));
}

export async function assertRuntimeAllowed(
  db: AppDatabase,
  opts: { jobBudgetCents: number; jobSpentCents?: number },
) {
  if (await getKillSwitchEnabled(db)) {
    throw new KillSwitchError();
  }
  const settings = await ensureRuntimeSettings(db);
  if (settings.globalSpendCents >= settings.globalBudgetCents) {
    throw new BudgetExceededError("global");
  }
  if ((opts.jobSpentCents ?? 0) > opts.jobBudgetCents) {
    throw new BudgetExceededError("job");
  }
}

export async function recordSpend(
  db: AppDatabase,
  organizationId: string,
  costCents: number,
) {
  if (costCents <= 0) return;
  const settings = await ensureRuntimeSettings(db);
  await db
    .update(agentRuntimeSettings)
    .set({
      globalSpendCents: settings.globalSpendCents + costCents,
      updatedAt: nowIso(),
    })
    .where(eq(agentRuntimeSettings.id, "global"));

  const day = today();
  const existing = await db.query.agentUsageDaily.findFirst({
    where: and(
      eq(agentUsageDaily.organizationId, organizationId),
      eq(agentUsageDaily.day, day),
    ),
  });

  if (existing) {
    await db
      .update(agentUsageDaily)
      .set({
        spendCents: existing.spendCents + costCents,
        requestCount: existing.requestCount + 1,
        updatedAt: nowIso(),
      })
      .where(eq(agentUsageDaily.id, existing.id));
  } else {
    await db.insert(agentUsageDaily).values({
      id: createId("usage"),
      organizationId,
      day,
      spendCents: costCents,
      requestCount: 1,
      updatedAt: nowIso(),
    });
  }
}
