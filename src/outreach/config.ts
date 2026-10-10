import { z } from "zod";

const boolFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z.object({
  /** Master kill for outbound email. Default false — never send by default. */
  OUTREACH_SENDING_ENABLED: boolFromEnv,
  OUTREACH_EMERGENCY_STOP: boolFromEnv,
  OUTREACH_DAILY_QUOTA: z.coerce.number().int().min(0).default(50),
  OUTREACH_PER_CAMPAIGN_LIMIT: z.coerce.number().int().min(0).default(100),
  OUTREACH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  OUTREACH_FROM_EMAIL: z.string().optional().default(""),
  OUTREACH_FROM_NAME: z.string().optional().default("Agency OS"),
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_WEBHOOK_SECRET: z.string().optional().default(""),
  OUTREACH_UNSUBSCRIBE_BASE_URL: z
    .string()
    .optional()
    .default("http://localhost:3000/api/outreach/unsubscribe"),
});

export type OutreachEnv = z.infer<typeof schema>;

let cached: OutreachEnv | null = null;

export function getOutreachEnv(
  env: NodeJS.ProcessEnv = process.env,
): OutreachEnv {
  if (cached && env === process.env) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid outreach env: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetOutreachEnvCache() {
  cached = null;
}
