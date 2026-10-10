import { afterEach, describe, expect, it } from "vitest";
import { AgentCoordinator } from "@/agent/coordinator";
import { createAgentTestDb } from "../helpers/agent-test-db";

const handles: Array<ReturnType<typeof createAgentTestDb>> = [];

afterEach(() => {
  while (handles.length) handles.pop()?.close();
});

describe("provider outages", () => {
  it("dead-letters after exhausting retries on outage", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "summarize_text",
      provider: "mock",
      idempotencyKey: "outage-1",
      maxAttempts: 2,
      input: { text: "__PROVIDER_OUTAGE__ persistent" },
    });

    await coordinator.runUntilIdle({ maxIterations: 5 });
    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("dead_letter");
    expect(final?.deadLetterReason).toBe("provider_outage");
    expect(final?.attemptCount).toBe(2);
  });

  it("never silently falls back to mock when gemini credentials are missing", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    process.env.GEMINI_API_KEY = "";
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "summarize_text",
      provider: "gemini",
      idempotencyKey: "no-fallback-1",
      maxAttempts: 1,
      input: { text: "Should fail closed without mock fallback" },
    });

    await coordinator.runUntilIdle({ maxIterations: 2 });
    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("dead_letter");
    expect(final?.deadLetterReason).toBe("missing_credentials");
    expect(final?.provider).toBe("gemini");
  });
});
