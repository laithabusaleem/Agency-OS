import "server-only";
import { z } from "zod";
export { getPublicEnv, type PublicEnv } from "@/lib/env-public";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  DATABASE_PATH: z.string().min(1).default("./data/agency.sqlite"),
  LOG_PRETTY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SEED_DEMO_DATA: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  SLACK_BOT_TOKEN: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional().default(""),
  // Agent runtime (also validated in src/agent/config.ts for the worker process)
  AGENT_DEFAULT_PROVIDER: z
    .enum(["mock", "gemini", "groq", "openrouter"])
    .default("mock"),
  AGENT_ALLOW_MOCK_IN_PRODUCTION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  AGENT_KILL_SWITCH: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  // Phase 3 — lead acquisition
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  ACQUISITION_ALLOW_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Phase 4 — outreach (also validated in src/outreach/config.ts)
  OUTREACH_SENDING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  OUTREACH_EMERGENCY_STOP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  OUTREACH_FROM_EMAIL: z.string().optional().default(""),
  // Phase 5 — delivery
  DELIVERY_RUNS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DELIVERY_WORKSPACE_ROOT: z.string().default("./data/workspaces"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function resetServerEnvCache() {
  cached = null;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${message}`);
  }
  cached = parsed.data;
  return cached;
}

/** Integration status without exposing secret values to clients. */
export function getIntegrationStatus() {
  const env = getServerEnv();
  return [
    {
      id: "stripe",
      name: "Stripe",
      description: "Payments and invoicing",
      configured: Boolean(env.STRIPE_SECRET_KEY),
    },
    {
      id: "slack",
      name: "Slack",
      description: "Team notifications",
      configured: Boolean(env.SLACK_BOT_TOKEN),
    },
    {
      id: "resend",
      name: "Resend",
      description:
        "Email (transactional / approved outreach; disabled until OUTREACH_SENDING_ENABLED)",
      configured: Boolean(env.RESEND_API_KEY && env.OUTREACH_FROM_EMAIL),
    },
    {
      id: "google_calendar",
      name: "Google Calendar",
      description: "Scheduling sync",
      configured: Boolean(
        env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET,
      ),
    },
    {
      id: "gemini",
      name: "Google Gemini",
      description: "Agent provider",
      configured: Boolean(env.GEMINI_API_KEY),
    },
    {
      id: "groq",
      name: "Groq",
      description: "Agent provider",
      configured: Boolean(env.GROQ_API_KEY),
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      description: "Agent provider",
      configured: Boolean(env.OPENROUTER_API_KEY),
    },
    {
      id: "brave_search",
      name: "Brave Search",
      description: "Lead acquisition research",
      configured: Boolean(env.BRAVE_SEARCH_API_KEY),
    },
    {
      id: "openrouter_search",
      name: "OpenRouter web search",
      description: "Lead acquisition via AI web search (citations required)",
      configured: Boolean(env.OPENROUTER_API_KEY),
    },
  ] as const;
}
