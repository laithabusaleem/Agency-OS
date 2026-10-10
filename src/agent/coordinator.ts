import { eq } from "drizzle-orm";
import { ensureRuntimeSettings, setKillSwitch } from "@/agent/budgets";
import {
  assertProviderAllowed,
  defaultModelFor,
  getAgentEnv,
} from "@/agent/config";
import { listProviderStatus } from "@/agent/providers/registry";
import {
  cancelJob,
  claimNextJob,
  enqueueJob,
  getJob,
  listJobs,
} from "@/agent/queue";
import { processClaimedJob, runWorkerLoop } from "@/agent/worker";
import type { EnqueueJobInput } from "@/agent/types";
import type { AppDatabase } from "@/db/factory";
import { agentJobAttempts, agentJobs, agentRuntimeSettings } from "@/db/schema";
import { createId } from "@/lib/id";

/**
 * Coordinator — typed facade over enqueue, cancel, inspect, and inline drain.
 * Production uses `scripts/worker.ts`; tests may call `drainOnce` / `runUntilIdle`.
 */
export class AgentCoordinator {
  constructor(private readonly db: AppDatabase) {}

  async init() {
    await ensureRuntimeSettings(this.db);
  }

  async enqueue(input: EnqueueJobInput) {
    assertProviderAllowed(input.provider);
    return enqueueJob(this.db, {
      ...input,
      model: input.model ?? defaultModelFor(input.provider),
    });
  }

  async cancel(jobId: string) {
    return cancelJob(this.db, jobId);
  }

  async get(jobId: string) {
    return getJob(this.db, jobId);
  }

  async list(organizationId: string, limit = 50) {
    return listJobs(this.db, organizationId, limit);
  }

  async attempts(jobId: string) {
    return this.db.query.agentJobAttempts.findMany({
      where: eq(agentJobAttempts.jobId, jobId),
    });
  }

  async runtimeStatus() {
    const settings = await ensureRuntimeSettings(this.db);
    const env = getAgentEnv();
    return {
      killSwitchEnabled: settings.killSwitchEnabled || env.AGENT_KILL_SWITCH,
      globalBudgetCents: settings.globalBudgetCents,
      globalSpendCents: settings.globalSpendCents,
      defaultProvider: env.AGENT_DEFAULT_PROVIDER,
      providers: listProviderStatus(),
    };
  }

  async setKillSwitch(enabled: boolean) {
    await setKillSwitch(this.db, enabled);
  }

  async drainOnce(opts?: {
    deterministicBackoff?: boolean;
    workerId?: string;
  }) {
    const workerId = opts?.workerId ?? createId("worker");
    const lockMs = getAgentEnv().AGENT_WORKER_LOCK_MS;
    const job = await claimNextJob(this.db, workerId, lockMs);
    if (!job) return null;
    const result = await processClaimedJob(this.db, job, {
      workerId,
      deterministicBackoff: opts?.deterministicBackoff ?? true,
    });
    return { jobId: job.id, result };
  }

  async runUntilIdle(opts?: {
    maxIterations?: number;
    fastForwardRetries?: boolean;
  }) {
    const max = opts?.maxIterations ?? 50;
    const outcomes = [];
    for (let i = 0; i < max; i++) {
      const outcome = await this.drainOnce({ deterministicBackoff: true });
      if (!outcome) break;
      outcomes.push(outcome);

      if (
        outcome.result.status === "retry_wait" &&
        opts?.fastForwardRetries !== false
      ) {
        await this.db
          .update(agentJobs)
          .set({ availableAt: new Date().toISOString() })
          .where(eq(agentJobs.id, outcome.jobId));
      }
    }
    return outcomes;
  }

  async startWorker(signal?: AbortSignal) {
    return runWorkerLoop(this.db, {
      signal,
      deterministicBackoff: getAgentEnv().NODE_ENV === "test",
    });
  }

  async getSettings() {
    return this.db.query.agentRuntimeSettings.findFirst({
      where: eq(agentRuntimeSettings.id, "global"),
    });
  }
}
