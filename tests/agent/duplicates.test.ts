import { afterEach, describe, expect, it } from "vitest";
import { AgentCoordinator } from "@/agent/coordinator";
import { createAgentTestDb } from "../helpers/agent-test-db";

const handles: Array<ReturnType<typeof createAgentTestDb>> = [];

afterEach(() => {
  while (handles.length) handles.pop()?.close();
});

describe("agent idempotency", () => {
  it("returns the same job for duplicate idempotency keys", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const first = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "extract_entities",
      provider: "mock",
      idempotencyKey: "dup-key-1",
      input: { text: "Ada at Acme ada@acme.demo" },
    });
    expect(first.created).toBe(true);

    const second = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "extract_entities",
      provider: "mock",
      idempotencyKey: "dup-key-1",
      input: { text: "Different payload must not create a second job" },
    });

    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    const jobs = await coordinator.list(ctx.organizationId);
    expect(jobs.filter((j) => j.idempotencyKey === "dup-key-1")).toHaveLength(
      1,
    );
  });
});
