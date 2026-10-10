import { eq } from "drizzle-orm";
import {
  computeBackoffMs,
  computeBackoffMsDeterministic,
} from "@/agent/backoff";
import {
  assertRuntimeAllowed,
  getKillSwitchEnabled,
  recordSpend,
} from "@/agent/budgets";
import { getAgentEnv } from "@/agent/config";
import {
  BudgetExceededError,
  KillSwitchError,
  MissingCredentialsError,
} from "@/agent/errors";
import { getProvider } from "@/agent/providers/registry";
import { claimNextJob, transitionJob } from "@/agent/queue";
import { buildPrompt, parseStructuredOutput } from "@/agent/schemas/outputs";
import type { AgentType, JobState } from "@/agent/types";
import type { AppDatabase } from "@/db/factory";
import { agentJobAttempts, agentJobs } from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

export type WorkerOptions = {
  workerId?: string;
  deterministicBackoff?: boolean;
  once?: boolean;
  signal?: AbortSignal;
};

function scheduleRetry(
  attempt: number,
  retryAfterMs: number | undefined,
  deterministic: boolean,
) {
  const delay = deterministic
    ? computeBackoffMsDeterministic(attempt, { retryAfterMs, baseMs: 100 })
    : computeBackoffMs(attempt, { retryAfterMs });
  return new Date(Date.now() + delay).toISOString();
}

export async function processClaimedJob(
  db: AppDatabase,
  job: typeof agentJobs.$inferSelect,
  opts: WorkerOptions = {},
) {
  const started = nowIso();
  const attemptNumber = job.attemptCount + 1;
  const attemptId = createId("aattempt");

  if (await getKillSwitchEnabled(db)) {
    await transitionJob(db, job.id, "running", { attemptCount: attemptNumber });
    await transitionJob(db, job.id, "failed", {
      lastError: "Kill switch enabled",
      finishedAt: nowIso(),
      workerId: null,
      lockedAt: null,
      lockExpiresAt: null,
    });
    await transitionJob(db, job.id, "dead_letter", {
      deadLetterReason: "kill_switch",
      finishedAt: nowIso(),
    });
    return { status: "dead_letter" as const };
  }

  await transitionJob(db, job.id, "running", {
    attemptCount: attemptNumber,
    startedAt: job.startedAt ?? started,
  });

  await db.insert(agentJobAttempts).values({
    id: attemptId,
    jobId: job.id,
    attemptNumber,
    status: "running",
    provider: job.provider,
    model: job.model,
    startedAt: started,
    createdAt: started,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), job.timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort);

  const failToRetryOrDead = async (
    code: string,
    message: string,
    retryable: boolean,
    retryAfterMs?: number,
    extras?: {
      latencyMs?: number;
      cost?: number;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    },
  ) => {
    const cost = extras?.cost ?? 0;
    await db
      .update(agentJobAttempts)
      .set({
        status: code === "timeout" ? "timed_out" : "failed",
        finishedAt: nowIso(),
        errorCode: code,
        errorMessage: message,
        retryAfterMs: retryAfterMs ?? null,
        latencyMs: extras?.latencyMs ?? null,
        promptTokens: extras?.promptTokens ?? 0,
        completionTokens: extras?.completionTokens ?? 0,
        costCentsEstimate: cost,
      })
      .where(eq(agentJobAttempts.id, attemptId));

    if (cost > 0) await recordSpend(db, job.organizationId, cost);

    const nextCost = job.costCentsEstimate + cost;
    const canRetry = retryable && attemptNumber < job.maxAttempts;

    if (canRetry) {
      const availableAt = scheduleRetry(
        attemptNumber,
        retryAfterMs,
        Boolean(opts.deterministicBackoff),
      );
      await transitionJob(db, job.id, "retry_wait", {
        costCentsEstimate: nextCost,
        promptTokens: job.promptTokens + (extras?.promptTokens ?? 0),
        completionTokens:
          job.completionTokens + (extras?.completionTokens ?? 0),
        totalTokens: job.totalTokens + (extras?.totalTokens ?? 0),
        latencyMs: extras?.latencyMs ?? null,
        lastError: message,
        errorJson: JSON.stringify({ code, message }),
        availableAt,
        workerId: null,
        lockedAt: null,
        lockExpiresAt: null,
      });
      return { status: "retry_wait" as const, availableAt };
    }

    const terminal: JobState = code === "timeout" ? "timed_out" : "failed";
    await transitionJob(db, job.id, terminal, {
      costCentsEstimate: nextCost,
      lastError: message,
      errorJson: JSON.stringify({ code, message }),
      finishedAt: nowIso(),
      workerId: null,
      lockedAt: null,
      lockExpiresAt: null,
    });
    await transitionJob(db, job.id, "dead_letter", {
      deadLetterReason: code,
      finishedAt: nowIso(),
    });
    return { status: "dead_letter" as const };
  };

  try {
    await assertRuntimeAllowed(db, {
      jobBudgetCents: job.budgetCents,
      jobSpentCents: job.costCentsEstimate,
    });

    const latest = await db.query.agentJobs.findFirst({
      where: eq(agentJobs.id, job.id),
    });
    if (!latest || latest.status === "cancelled") {
      await db
        .update(agentJobAttempts)
        .set({
          status: "cancelled",
          finishedAt: nowIso(),
          errorCode: "cancelled",
          errorMessage: "Job cancelled",
        })
        .where(eq(agentJobAttempts.id, attemptId));
      return { status: "cancelled" as const };
    }

    const input = JSON.parse(job.inputJson) as Record<string, unknown>;

    // Decision-maker research runs the DMI pipeline (fixtures/live search) —
    // never fabricates results via unconstrained model generation.
    if (job.agentType === "research_decision_maker") {
      const { runDecisionMakerResearch } = await import("@/dmi/research");
      try {
        const research = await runDecisionMakerResearch({
          db,
          organizationId: job.organizationId,
          leadId: String(input.leadId ?? ""),
          targetService: String(input.targetService ?? "general"),
          mode: input.mode === "live" ? "live" : "mock",
          idempotencyKey: String(
            input.researchIdempotencyKey ?? `agent_${job.id}`,
          ),
        });
        const output = {
          agentType: "research_decision_maker" as const,
          summary: research.limitation
            ? `Research completed with limitation: ${research.limitation}`
            : `Decision-maker research completed (${research.candidateIds?.length ?? 0} candidates)`,
          data: {
            candidateIds: research.candidateIds ?? [],
            limitation: research.limitation ?? null,
            runId: research.run.id,
            cached: "cached" in research ? Boolean(research.cached) : false,
          },
        };
        const finished = nowIso();
        await db
          .update(agentJobAttempts)
          .set({
            status: "succeeded",
            finishedAt: finished,
            latencyMs: Date.now() - Date.parse(started),
          })
          .where(eq(agentJobAttempts.id, attemptId));
        await transitionJob(db, job.id, "succeeded", {
          outputJson: JSON.stringify(output),
          finishedAt: finished,
          workerId: null,
          lockedAt: null,
          lockExpiresAt: null,
        });
        return { status: "succeeded" as const };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "DMI research failed";
        return failToRetryOrDead("provider_outage", message, false);
      }
    }

    const prompt = buildPrompt(job.agentType as AgentType, input);
    const provider = getProvider(job.provider);
    const result = await provider.complete({
      provider: job.provider,
      model: job.model,
      agentType: job.agentType as AgentType,
      prompt,
      system:
        "You are an agency operations assistant. Respond with valid JSON only.",
      attempt: attemptNumber,
      signal: controller.signal,
    });

    if (!result.ok) {
      if (result.code === "cancelled") {
        await db
          .update(agentJobAttempts)
          .set({
            status: "cancelled",
            finishedAt: nowIso(),
            errorCode: "cancelled",
            errorMessage: result.message,
            latencyMs: result.latencyMs,
          })
          .where(eq(agentJobAttempts.id, attemptId));
        const current = await db.query.agentJobs.findFirst({
          where: eq(agentJobs.id, job.id),
        });
        if (current && current.status !== "cancelled") {
          await transitionJob(db, job.id, "cancelled", {
            cancelledAt: nowIso(),
            finishedAt: nowIso(),
            lastError: result.message,
            workerId: null,
            lockedAt: null,
            lockExpiresAt: null,
          });
        }
        return { status: "cancelled" as const };
      }

      return failToRetryOrDead(
        result.code,
        result.message,
        result.retryable,
        result.retryAfterMs,
        {
          latencyMs: result.latencyMs,
          cost: result.estimatedCostCents ?? 0,
          promptTokens: result.usage?.promptTokens ?? 0,
          completionTokens: result.usage?.completionTokens ?? 0,
          totalTokens: result.usage?.totalTokens ?? 0,
        },
      );
    }

    let output;
    try {
      output = parseStructuredOutput(job.agentType as AgentType, result.text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid structured output";
      return failToRetryOrDead("invalid_response", message, true, undefined, {
        latencyMs: result.latencyMs,
        cost: result.estimatedCostCents,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      });
    }

    const nextCost = job.costCentsEstimate + result.estimatedCostCents;
    if (nextCost > job.budgetCents) {
      await recordSpend(db, job.organizationId, result.estimatedCostCents);
      return failToRetryOrDead(
        "budget",
        "Job budget exceeded",
        false,
        undefined,
        {
          latencyMs: result.latencyMs,
          cost: 0,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
      );
    }

    await recordSpend(db, job.organizationId, result.estimatedCostCents);
    await db
      .update(agentJobAttempts)
      .set({
        status: "succeeded",
        finishedAt: nowIso(),
        latencyMs: result.latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costCentsEstimate: result.estimatedCostCents,
      })
      .where(eq(agentJobAttempts.id, attemptId));

    await transitionJob(db, job.id, "succeeded", {
      outputJson: JSON.stringify(output),
      costCentsEstimate: nextCost,
      promptTokens: job.promptTokens + result.usage.promptTokens,
      completionTokens: job.completionTokens + result.usage.completionTokens,
      totalTokens: job.totalTokens + result.usage.totalTokens,
      latencyMs: result.latencyMs,
      finishedAt: nowIso(),
      workerId: null,
      lockedAt: null,
      lockExpiresAt: null,
      lastError: null,
      errorJson: null,
    });

    return { status: "succeeded" as const, output };
  } catch (error) {
    if (
      error instanceof KillSwitchError ||
      error instanceof BudgetExceededError
    ) {
      return failToRetryOrDead(error.code, error.message, false);
    }
    if (error instanceof MissingCredentialsError) {
      return failToRetryOrDead("missing_credentials", error.message, false);
    }

    const isAbort = error instanceof Error && error.name === "AbortError";
    const message = error instanceof Error ? error.message : String(error);

    if (isAbort && !opts.signal?.aborted) {
      return failToRetryOrDead("timeout", "Attempt timed out", true);
    }
    if (isAbort) {
      await db
        .update(agentJobAttempts)
        .set({
          status: "cancelled",
          finishedAt: nowIso(),
          errorCode: "cancelled",
          errorMessage: message,
        })
        .where(eq(agentJobAttempts.id, attemptId));
      const current = await db.query.agentJobs.findFirst({
        where: eq(agentJobs.id, job.id),
      });
      if (current && current.status !== "cancelled") {
        await transitionJob(db, job.id, "cancelled", {
          cancelledAt: nowIso(),
          finishedAt: nowIso(),
          lastError: message,
          workerId: null,
          lockedAt: null,
          lockExpiresAt: null,
        });
      }
      return { status: "cancelled" as const };
    }

    // Simulated crash — leave lock for reclaim by claimNextJob.
    if (message.includes("Simulated worker crash")) {
      throw error;
    }

    return failToRetryOrDead("unknown", message, true);
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export async function runWorkerLoop(db: AppDatabase, opts: WorkerOptions = {}) {
  const env = getAgentEnv();
  const workerId = opts.workerId ?? createId("worker");
  const lockMs = env.AGENT_WORKER_LOCK_MS;

  do {
    if (opts.signal?.aborted) break;

    if (await getKillSwitchEnabled(db)) {
      if (opts.once) break;
      await new Promise((r) => setTimeout(r, env.AGENT_WORKER_POLL_MS));
      continue;
    }

    const job = await claimNextJob(db, workerId, lockMs);
    if (!job) {
      if (opts.once) break;
      await new Promise((r) => setTimeout(r, env.AGENT_WORKER_POLL_MS));
      continue;
    }

    try {
      await processClaimedJob(db, job, { ...opts, workerId });
    } catch (error) {
      // Crash mid-job: lock retained until expiry for reclaim.
      if (
        !(error instanceof Error) ||
        !error.message.includes("Simulated worker crash")
      ) {
        throw error;
      }
    }
  } while (!opts.once && !opts.signal?.aborted);

  return { workerId };
}
