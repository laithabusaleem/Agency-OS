import { afterEach, describe, expect, it } from "vitest";
import { assertProviderAllowed, resetAgentEnvCache } from "@/agent/config";
import { MissingCredentialsError } from "@/agent/errors";
import { getProvider } from "@/agent/providers/registry";
import { AgentCoordinator } from "@/agent/coordinator";
import { createAgentTestDb } from "../helpers/agent-test-db";

const handles: Array<ReturnType<typeof createAgentTestDb>> = [];

afterEach(() => {
  while (handles.length) handles.pop()?.close();
  resetAgentEnvCache();
});

describe("provider credentials", () => {
  it("throws MissingCredentialsError for unconfigured groq", () => {
    process.env.GROQ_API_KEY = "";
    resetAgentEnvCache();
    expect(() => getProvider("groq")).toThrow(MissingCredentialsError);
  });

  it("blocks mock provider in production unless explicitly allowed", () => {
    const previous = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    env.AGENT_ALLOW_MOCK_IN_PRODUCTION = "false";
    resetAgentEnvCache();
    expect(() => assertProviderAllowed("mock")).toThrow(
      /Mock provider is disabled/,
    );
    env.NODE_ENV = previous;
    resetAgentEnvCache();
  });

  it("dead-letters openrouter jobs when credentials are missing", async () => {
    const ctx = createAgentTestDb();
    handles.push(ctx);
    process.env.OPENROUTER_API_KEY = "";
    resetAgentEnvCache();

    const coordinator = new AgentCoordinator(ctx.db);
    await coordinator.init();

    const { job } = await coordinator.enqueue({
      organizationId: ctx.organizationId,
      agentType: "extract_entities",
      provider: "openrouter",
      idempotencyKey: "creds-openrouter-1",
      maxAttempts: 1,
      input: { text: "Need credentials" },
    });

    await coordinator.runUntilIdle({ maxIterations: 2 });
    const final = await coordinator.get(job.id);
    expect(final?.status).toBe("dead_letter");
    expect(final?.deadLetterReason).toBe("missing_credentials");
  });
});
