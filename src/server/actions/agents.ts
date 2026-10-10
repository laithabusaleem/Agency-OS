"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AgentCoordinator } from "@/agent/coordinator";
import { AGENT_PROVIDERS, AGENT_TYPES } from "@/agent/types";
import { getDb } from "@/db/client";
import { logger } from "@/lib/logger";
import { AuthorizationError, requireUser } from "@/server/authz";

export type AgentActionState = {
  ok: boolean;
  message?: string;
  jobId?: string;
};

const enqueueSchema = z.object({
  agentType: z.enum(AGENT_TYPES),
  provider: z.enum(AGENT_PROVIDERS),
  text: z.string().min(1).max(20_000),
  idempotencyKey: z.string().min(8).max(120),
  budgetCents: z.coerce.number().int().min(0).max(100_000).optional(),
});

export async function enqueueAgentJobAction(
  _prev: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  try {
    const user = await requireUser();
    const parsed = enqueueSchema.safeParse({
      agentType: formData.get("agentType"),
      provider: formData.get("provider"),
      text: formData.get("text"),
      idempotencyKey: formData.get("idempotencyKey"),
      budgetCents: formData.get("budgetCents") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "Validation failed." };
    }

    const coordinator = new AgentCoordinator(getDb());
    await coordinator.init();
    const { job, created } = await coordinator.enqueue({
      organizationId: user.organizationId,
      createdByUserId: user.id,
      agentType: parsed.data.agentType,
      provider: parsed.data.provider,
      idempotencyKey: parsed.data.idempotencyKey,
      budgetCents: parsed.data.budgetCents,
      input: { text: parsed.data.text },
    });

    revalidatePath("/agents");
    return {
      ok: true,
      jobId: job.id,
      message: created
        ? "Agent job enqueued."
        : "Idempotent replay — existing job returned.",
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    logger.error({ err: error }, "enqueue agent job failed");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Enqueue failed",
    };
  }
}

export async function cancelAgentJobAction(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("id") ?? "");
  const coordinator = new AgentCoordinator(getDb());
  const job = await coordinator.get(jobId);
  if (!job || job.organizationId !== user.organizationId) {
    throw new AuthorizationError("Job not found");
  }
  await coordinator.cancel(jobId);
  revalidatePath("/agents");
}

export async function setAgentKillSwitchAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthorizationError("Admin role required");
  }
  const enabled = String(formData.get("enabled")) === "true";
  const coordinator = new AgentCoordinator(getDb());
  await coordinator.setKillSwitch(enabled);
  revalidatePath("/agents");
  revalidatePath("/integrations");
}
