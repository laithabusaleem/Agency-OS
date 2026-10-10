import path from "node:path";
import { z } from "zod";

const boolFromEnv = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((v) => v === "true");

const schema = z.object({
  DELIVERY_RUNS_ENABLED: boolFromEnv("true"),
  DELIVERY_DEPLOY_ENABLED: boolFromEnv("false"),
  DELIVERY_PUBLICATION_ENABLED: boolFromEnv("false"),
  DELIVERY_SPENDING_ENABLED: boolFromEnv("false"),
  DELIVERY_DESTRUCTIVE_ENABLED: boolFromEnv("false"),
  /** Hard fail-closed: model-generated code must never run on the host */
  DELIVERY_ALLOW_MODEL_CODE_EXECUTION: boolFromEnv("false"),
  DELIVERY_WORKSPACE_ROOT: z.string().default("./data/workspaces"),
  DELIVERY_PLAYWRIGHT_ENABLED: boolFromEnv("false"),
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
});

export type DeliveryEnv = z.infer<typeof schema>;

let cached: DeliveryEnv | null = null;

export function getDeliveryEnv(
  env: NodeJS.ProcessEnv = process.env,
): DeliveryEnv {
  if (cached && env === process.env) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid delivery env: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetDeliveryEnvCache() {
  cached = null;
}

export function resolveWorkspaceRoot(env = getDeliveryEnv()) {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    env.DELIVERY_WORKSPACE_ROOT,
  );
}
