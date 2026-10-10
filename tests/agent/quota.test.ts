import { afterEach, describe, expect, it } from "vitest";
import { AgentCoordinator } from "@/agent/coordinator";
import { createAgentTestDb } from "../helpers/agent-test-db";

const handles: Array<ReturnType<typeof createAgentTestDb>> = [];

afterEach(() => {
  while (handles.length) handles.pop()?.close();
});

describe("quota and budgets", () => {
  it("dead-letters on quota exhaustion without retry", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "draft_outreach",
      provider: "mock",
      idempotencyKey: "quota-1",
      maxAttempts: 5,
      input: { text: "__FAIL_QUOTA__ draft this" },
    });

    await coordinator.runUntilIdle({ maxIterations: 3 });
    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("dead_letter");
    expect(final?.deadLetterReason).toBe("quota_exhausted");
    expect(final?.attemptCount).toBe(1);
  });

  it("respects the kill switch", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();
    await coordinator.setKillSwitch(true);

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "summarize_text",
      provider: "mock",
      idempotencyKey: "kill-1",
      input: { text: "Should not run" },
    });

    // Enqueue is allowed; processing dead-letters under kill switch.
    await coordinator.runUntilIdle({ maxIterations: 2 });
    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("dead_letter");
    expect(final?.deadLetterReason).toBe("kill_switch");
  });
});
