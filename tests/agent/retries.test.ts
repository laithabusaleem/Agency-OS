import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AgentCoordinator } from "@/agent/coordinator";
import { agentJobAttempts } from "@/db/schema";
import { createAgentTestDb } from "../helpers/agent-test-db";

const handles: Array<ReturnType<typeof createAgentTestDb>> = [];

afterEach(() => {
  while (handles.length) handles.pop()?.close();
});

describe("agent retries", () => {
  it("retries transient failures with exponential backoff then succeeds", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "summarize_text",
      provider: "mock",
      idempotencyKey: "retry-once-1",
      maxAttempts: 3,
      input: { text: "__FAIL_ONCE__ please summarize Acme notes" },
    });

    const outcomes = await coordinator.runUntilIdle({ maxIterations: 5 });
    expect(outcomes.length).toBeGreaterThanOrEqual(2);

    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("succeeded");
    expect(final?.attemptCount).toBe(2);

    const attempts = await ctx.db.query.agentJobAttempts.findMany({
      where: eq(agentJobAttempts.jobId, job.id),
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.status).toBe("failed");
    expect(attempts[1]?.status).toBe("succeeded");
  });

  it("honors Retry-After from rate limits before retry", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "summarize_text",
      provider: "mock",
      idempotencyKey: "retry-after-1",
      maxAttempts: 2,
      input: { text: "__FAIL_RATE_LIMIT__ then ok" },
    });

    const first = await coordinator.drainOnce({ deterministicBackoff: true });
    expect(first?.result.status).toBe("retry_wait");

    const waiting = await coordinator.get(job.id);
    expect(waiting?.status).toBe("retry_wait");
    expect(waiting?.lastError).toMatch(/rate limit/i);

    const attempts = await coordinator.attempts(job.id);
    expect(attempts[0]?.retryAfterMs).toBe(1200);
  });
});
