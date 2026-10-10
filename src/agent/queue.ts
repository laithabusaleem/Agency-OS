import { and, asc, eq, inArray, lte, or, isNull, sql } from "drizzle-orm";
import { getAgentEnv, defaultModelFor } from "@/agent/config";
import { ensureRuntimeSettings } from "@/agent/budgets";
import { BudgetExceededError } from "@/agent/errors";
import { AgentRuntimeError } from "@/agent/errors";
import { assertTransition, isTerminalState } from "@/agent/state-machine";
import type { EnqueueJobInput, JobState } from "@/agent/types";
import type { AppDatabase } from "@/db/factory";
import { agentJobs } from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

function asJobState(value: string): JobState {
  return value as JobState;
}

export async function enqueueJob(db: AppDatabase, input: EnqueueJobInput) {
  await ensureRuntimeSettings(db);
  const env = getAgentEnv();

  const existing = await db.query.agentJobs.findFirst({
    where: and(
      eq(agentJobs.organizationId, input.organizationId),
      eq(agentJobs.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (existing) {
    return { job: existing, created: false as const };
  }

  const budgetCents = input.budgetCents ?? env.AGENT_DEFAULT_JOB_BUDGET_CENTS;
  // Kill switch blocks processing, not enqueue. Global budget still enforced here.
  const settings = await ensureRuntimeSettings(db);
  if (settings.globalSpendCents >= settings.globalBudgetCents) {
    throw new BudgetExceededError("global");
  }

  const model = input.model ?? defaultModelFor(input.provider, env);
  const id = createId("ajob");
  const stamp = nowIso();
  const row = {
    id,
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId ?? null,
    idempotencyKey: input.idempotencyKey,
    agentType: input.agentType,
    provider: input.provider,
    model,
    status: "pending" as const,
    inputJson: JSON.stringify(input.input),
    outputJson: null,
    errorJson: null,
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? env.AGENT_DEFAULT_MAX_ATTEMPTS,
    timeoutMs: input.timeoutMs ?? env.AGENT_DEFAULT_TIMEOUT_MS,
    budgetCents,
    costCentsEstimate: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMs: null,
    workerId: null,
    lockedAt: null,
    lockExpiresAt: null,
    availableAt: input.availableAt ?? stamp,
    startedAt: null,
    finishedAt: null,
    cancelledAt: null,
    lastError: null,
    deadLetterReason: null,
    createdAt: stamp,
    updatedAt: stamp,
  };

  try {
    await db.insert(agentJobs).values(row);
  } catch (error) {
    // Unique race on idempotency — return the winner.
    const again = await db.query.agentJobs.findFirst({
      where: and(
        eq(agentJobs.organizationId, input.organizationId),
        eq(agentJobs.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (again) return { job: again, created: false as const };
    throw error;
  }

  return { job: row, created: true as const };
}

export async function transitionJob(
  db: AppDatabase,
  jobId: string,
  to: JobState,
  patch: Partial<typeof agentJobs.$inferInsert> = {},
) {
  const job = await db.query.agentJobs.findFirst({
    where: eq(agentJobs.id, jobId),
  });
  if (!job) {
    throw new AgentRuntimeError(`Job ${jobId} not found`, "not_found");
  }
  assertTransition(asJobState(job.status), to);
  const updatedAt = nowIso();
  await db
    .update(agentJobs)
    .set({ ...patch, status: to, updatedAt })
    .where(eq(agentJobs.id, jobId));
  return db.query.agentJobs.findFirst({ where: eq(agentJobs.id, jobId) });
}

export async function cancelJob(db: AppDatabase, jobId: string) {
  const job = await db.query.agentJobs.findFirst({
    where: eq(agentJobs.id, jobId),
  });
  if (!job) {
    throw new AgentRuntimeError(`Job ${jobId} not found`, "not_found");
  }
  if (isTerminalState(asJobState(job.status))) {
    return job;
  }
  return transitionJob(db, jobId, "cancelled", {
    cancelledAt: nowIso(),
    finishedAt: nowIso(),
    workerId: null,
    lockedAt: null,
    lockExpiresAt: null,
    lastError: "Cancelled by user or coordinator",
  });
}

/**
 * Claim the next available job with a worker lock.
 * Expired locks on claimed/running jobs are re-queued as pending (crash recovery).
 */
export async function claimNextJob(
  db: AppDatabase,
  workerId: string,
  lockMs: number,
) {
  const now = nowIso();

  // Recover crashed workers whose locks expired.
  const stale = await db.query.agentJobs.findMany({
    where: and(
      inArray(agentJobs.status, ["claimed", "running"]),
      lte(agentJobs.lockExpiresAt, now),
    ),
  });
  for (const job of stale) {
    try {
      assertTransition(asJobState(job.status), "pending");
      await db
        .update(agentJobs)
        .set({
          status: "pending",
          workerId: null,
          lockedAt: null,
          lockExpiresAt: null,
          availableAt: now,
          lastError: "Recovered after worker lock expiry (possible crash)",
          updatedAt: now,
        })
        .where(eq(agentJobs.id, job.id));
    } catch {
      // Ignore illegal transitions (already terminal).
    }
  }

  const candidates = await db.query.agentJobs.findMany({
    where: and(
      inArray(agentJobs.status, ["pending", "retry_wait"]),
      lte(agentJobs.availableAt, now),
      or(isNull(agentJobs.lockExpiresAt), lte(agentJobs.lockExpiresAt, now)),
    ),
    orderBy: [asc(agentJobs.availableAt), asc(agentJobs.createdAt)],
    limit: 5,
  });

  for (const candidate of candidates) {
    const lockExpiresAt = new Date(Date.now() + lockMs).toISOString();
    const result = await db
      .update(agentJobs)
      .set({
        status: "claimed",
        workerId,
        lockedAt: now,
        lockExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentJobs.id, candidate.id),
          inArray(agentJobs.status, ["pending", "retry_wait"]),
        ),
      );
    // better-sqlite3 drizzle returns info; verify by re-read
    const claimed = await db.query.agentJobs.findFirst({
      where: and(
        eq(agentJobs.id, candidate.id),
        eq(agentJobs.workerId, workerId),
      ),
    });
    if (claimed && claimed.status === "claimed") {
      void result;
      return claimed;
    }
  }
  return null;
}

export async function listJobs(
  db: AppDatabase,
  organizationId: string,
  limit = 50,
) {
  return db.query.agentJobs.findMany({
    where: eq(agentJobs.organizationId, organizationId),
    orderBy: [sql`${agentJobs.createdAt} desc`],
    limit,
  });
}

export async function getJob(db: AppDatabase, jobId: string) {
  return db.query.agentJobs.findFirst({ where: eq(agentJobs.id, jobId) });
}
