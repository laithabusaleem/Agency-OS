import { z } from "zod";

const boolFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z.object({
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  BRAVE_SEARCH_BASE_URL: z
    .string()
    .default("https://api.search.brave.com/res/v1/web/search"),
  ACQUISITION_DEFAULT_PROVIDER: z
    .enum(["brave", "openrouter", "manual", "csv", "mock"])
    .default("manual"),
  ACQUISITION_ALLOW_MOCK: boolFromEnv,
  ACQUISITION_EVIDENCE_TTL_HOURS: z.coerce.number().int().min(1).default(168),
  ACQUISITION_MAX_FETCHES_PER_RUN: z.coerce
    .number()
    .int()
    .min(0)
    .max(20)
    .default(3),
});

export type AcquisitionEnv = z.infer<typeof schema>;

let cached: AcquisitionEnv | null = null;

export function getAcquisitionEnv(
  env: NodeJS.ProcessEnv = process.env,
): AcquisitionEnv {
  if (cached && env === process.env) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid acquisition env: ${parsed.error.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetAcquisitionEnvCache() {
  cached = null;
}
