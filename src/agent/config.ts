import { z } from "zod";
import type { AgentProviderId } from "@/agent/types";

const boolFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const agentEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  AGENT_DEFAULT_PROVIDER: z
    .enum(["mock", "gemini", "groq", "openrouter"])
    .default("mock"),
  AGENT_ALLOW_MOCK_IN_PRODUCTION: boolFromEnv,
  AGENT_KILL_SWITCH: boolFromEnv,
  AGENT_GLOBAL_BUDGET_CENTS: z.coerce.number().int().min(0).default(50_000),
  AGENT_DEFAULT_JOB_BUDGET_CENTS: z.coerce.number().int().min(0).default(100),
  AGENT_DEFAULT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  AGENT_DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  AGENT_WORKER_POLL_MS: z.coerce.number().int().min(50).default(500),
  AGENT_WORKER_LOCK_MS: z.coerce.number().int().min(50).default(60_000),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
});

export type AgentEnv = z.infer<typeof agentEnvSchema>;

let cached: AgentEnv | null = null;

export function getAgentEnv(env: NodeJS.ProcessEnv = process.env): AgentEnv {
  if (cached && env === process.env) return cached;
  const parsed = agentEnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid agent environment: ${message}`);
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetAgentEnvCache() {
  cached = null;
}

export function defaultModelFor(
  provider: AgentProviderId,
  env = getAgentEnv(),
) {
  switch (provider) {
    case "mock":
      return "mock-deterministic-v1";
    case "gemini":
      return env.GEMINI_MODEL;
    case "groq":
      return env.GROQ_MODEL;
    case "openrouter":
      return env.OPENROUTER_MODEL;
  }
}

/** Production must never silently use mock unless explicitly allowed. */
export function assertProviderAllowed(
  provider: AgentProviderId,
  env = getAgentEnv(),
) {
  if (
    provider === "mock" &&
    env.NODE_ENV === "production" &&
    !env.AGENT_ALLOW_MOCK_IN_PRODUCTION
  ) {
    throw new Error(
      "Mock provider is disabled in production. Set AGENT_ALLOW_MOCK_IN_PRODUCTION=true only for controlled drills.",
    );
  }
}
