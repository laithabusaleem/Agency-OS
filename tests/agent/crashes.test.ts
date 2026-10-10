import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AgentCoordinator } from "@/agent/coordinator";
import { claimNextJob } from "@/agent/queue";
import { processClaimedJob } from "@/agent/worker";
import { agentJobs } from "@/db/schema";
import { createAgentTestDb } from "../helpers/agent-test-db";

const handles: Array<ReturnType<typeof createAgentTestDb>> = [];

afterEach(() => {
  while (handles.length) handles.pop()?.close();
});

describe("agent crash recovery", () => {
  it("reclaims jobs after worker crash / lock expiry", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "summarize_text",
      provider: "mock",
      idempotencyKey: "crash-1",
      input: { text: "__CRASH__ mid run" },
    });

    const claimed = await claimNextJob(ctx.db, "worker-crash", 50);
    expect(claimed?.id).toBe(job.id);

    await expect(
      processClaimedJob(ctx.db, claimed!, { workerId: "worker-crash" }),
    ).rejects.toThrow(/Simulated worker crash/);

    // Expire the lock
    await ctx.db
      .update(agentJobs)
      .set({
        lockExpiresAt: new Date(Date.now() - 1000).toISOString(),
      })
      .where(eq(agentJobs.id, job.id));

    // Re-enqueue with a non-crash prompt by updating input, then reclaim
    await ctx.db
      .update(agentJobs)
      .set({
        inputJson: JSON.stringify({ text: "Recovered Acme summary request" }),
      })
      .where(eq(agentJobs.id, job.id));

    const outcomes = await coordinator.runUntilIdle({ maxIterations: 3 });
    expect(outcomes.length).toBeGreaterThanOrEqual(1);

    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("succeeded");
    expect(final?.lastError ?? "").toMatch(
      /Recovered after worker lock expiry|/,
    );
  });
});
