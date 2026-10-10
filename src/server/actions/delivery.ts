"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DELIVERY_TEMPLATE_IDS, PRIVILEGED_ACTIONS } from "@/delivery/types";
import { createId } from "@/lib/id";
import { logger } from "@/lib/logger";
import { AuthorizationError, requireUser } from "@/server/authz";
import * as delivery from "@/server/services/delivery";

export type DeliveryActionState = {
  ok: boolean;
  message?: string;
  id?: string;
};

export async function createWorkflowAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({
        projectId: z.string().min(1),
        templateId: z.enum(DELIVERY_TEMPLATE_IDS),
        name: z.string().min(1),
        mode: z.enum(["mock", "live"]).default("mock"),
      })
      .safeParse({
        projectId: formData.get("projectId"),
        templateId: formData.get("templateId"),
        name: formData.get("name"),
        mode: formData.get("mode") || "mock",
      });
    if (!parsed.success) {
      return { ok: false, message: "Invalid workflow form." };
    }

    const brief: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("brief.")) {
        brief[key.slice(6)] = String(value);
      }
    }

    const workflow = await delivery.createWorkflow(user, {
      ...parsed.data,
      brief,
    });
    revalidatePath("/delivery");
    return {
      ok: true,
      message: "Workflow created.",
      id: workflow?.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Create failed",
    };
  }
}

export async function updateBriefAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  try {
    const user = await requireUser();
    const workflowId = String(formData.get("workflowId") ?? "");
    const brief: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("brief.")) {
        brief[key.slice(6)] = String(value);
      }
    }
    const check = await delivery.updateBrief(user, workflowId, brief);
    revalidatePath("/delivery");
    revalidatePath(`/delivery/${workflowId}`);
    return {
      ok: check.ok,
      message: check.ok
        ? "Brief updated — ready to run."
        : `Incomplete: missing ${check.missing.join(", ")}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Brief update failed",
    };
  }
}

export async function runDeliveryAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  try {
    const user = await requireUser();
    const workflowId = String(formData.get("workflowId") ?? "");
    const idempotencyKey =
      String(formData.get("idempotencyKey") ?? "") ||
      createId(`delivery_${workflowId}`);
    const result = await delivery.runDelivery(user, workflowId, idempotencyKey);
    revalidatePath("/delivery");
    revalidatePath(`/delivery/${workflowId}`);
    return {
      ok: true,
      message: result.replay
        ? `Idempotent replay — ${result.run.status}`
        : `Delivery run ${result.run.status}`,
      id: result.run.id,
    };
  } catch (error) {
    if (error instanceof delivery.DeliveryError) {
      return { ok: false, message: `${error.code}: ${error.message}` };
    }
    logger.error({ err: error }, "delivery run failed");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Run failed",
    };
  }
}

export async function reviseWorkflowAction(formData: FormData) {
  const user = await requireUser();
  const workflowId = String(formData.get("workflowId") ?? "");
  await delivery.reviseWorkflow(
    user,
    workflowId,
    String(formData.get("reason") ?? "Operator revision"),
  );
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${workflowId}`);
}

export async function requestAuthAction(formData: FormData) {
  const user = await requireUser();
  const action = z.enum(PRIVILEGED_ACTIONS).parse(formData.get("action"));
  await delivery.requestAuthorization(user, {
    workflowId: String(formData.get("workflowId") || "") || undefined,
    action,
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/delivery");
}

export async function approveAuthAction(formData: FormData) {
  const user = await requireUser();
  await delivery.approveAuth(
    user,
    String(formData.get("id") ?? ""),
    String(formData.get("note") ?? ""),
  );
  revalidatePath("/delivery");
}

export async function privilegedActionAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  try {
    const user = await requireUser();
    const action = z.enum(PRIVILEGED_ACTIONS).parse(formData.get("action"));
    const result = await delivery.performPrivilegedAction(user, {
      workflowId: String(formData.get("workflowId") ?? ""),
      action,
      note: String(formData.get("note") ?? ""),
    });
    revalidatePath("/delivery");
    return { ok: true, message: result.note, id: result.authorizationId };
  } catch (error) {
    if (error instanceof delivery.DeliveryError) {
      return { ok: false, message: `${error.code}: ${error.message}` };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Action failed",
    };
  }
}
