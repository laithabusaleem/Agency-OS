import { and, eq } from "drizzle-orm";
import { getDeliveryEnv } from "@/delivery/config";
import { DeliveryError } from "@/delivery/errors";
import type { PrivilegedAction } from "@/delivery/types";
import type { AppDatabase } from "@/db/factory";
import {
  deliveryAuthorizations,
  deliverySettings,
  deliveryWorkflows,
} from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

export async function ensureDeliverySettings(db: AppDatabase) {
  const env = getDeliveryEnv();
  const existing = await db.query.deliverySettings.findFirst({
    where: eq(deliverySettings.id, "global"),
  });
  if (existing) return existing;
  const row = {
    id: "global" as const,
    runsEnabled: env.DELIVERY_RUNS_ENABLED,
    deployEnabled: env.DELIVERY_DEPLOY_ENABLED,
    publicationEnabled: env.DELIVERY_PUBLICATION_ENABLED,
    spendingEnabled: env.DELIVERY_SPENDING_ENABLED,
    destructiveEnabled: env.DELIVERY_DESTRUCTIVE_ENABLED,
    allowModelCodeExecution: false,
    workspaceRoot: env.DELIVERY_WORKSPACE_ROOT,
    updatedAt: nowIso(),
  };
  await db.insert(deliverySettings).values(row);
  return row;
}

/**
 * Privileged actions require:
 * 1. Env/runtime capability enabled
 * 2. Explicit approved authorization row (not expired)
 * Agents cannot approve themselves.
 */
export async function evaluatePrivilegedAction(
  db: AppDatabase,
  input: {
    organizationId: string;
    workflowId?: string | null;
    action: PrivilegedAction;
  },
): Promise<
  | { ok: true; authorizationId: string }
  | { ok: false; code: string; message: string }
> {
  const env = getDeliveryEnv();
  const settings = await ensureDeliverySettings(db);

  if (
    env.DELIVERY_ALLOW_MODEL_CODE_EXECUTION ||
    settings.allowModelCodeExecution
  ) {
    return {
      ok: false,
      code: "model_code_blocked",
      message:
        "Model-generated code execution is permanently blocked on the host",
    };
  }

  const capabilityOn =
    input.action === "deploy"
      ? settings.deployEnabled && env.DELIVERY_DEPLOY_ENABLED
      : input.action === "external_publication"
        ? settings.publicationEnabled && env.DELIVERY_PUBLICATION_ENABLED
        : input.action === "spending"
          ? settings.spendingEnabled && env.DELIVERY_SPENDING_ENABLED
          : settings.destructiveEnabled && env.DELIVERY_DESTRUCTIVE_ENABLED;

  if (!capabilityOn) {
    return {
      ok: false,
      code: "unauthorized_action",
      message: `${input.action} is disabled (env + runtime switches required)`,
    };
  }

  const rows = await db.query.deliveryAuthorizations.findMany({
    where: and(
      eq(deliveryAuthorizations.organizationId, input.organizationId),
      eq(deliveryAuthorizations.action, input.action),
      eq(deliveryAuthorizations.status, "approved"),
    ),
  });

  const now = Date.now();
  const match = rows.find((row) => {
    if (
      input.workflowId &&
      row.workflowId &&
      row.workflowId !== input.workflowId
    ) {
      return false;
    }
    if (row.expiresAt && Date.parse(row.expiresAt) < now) return false;
    return Boolean(row.approvedByUserId && row.approvedAt);
  });

  if (!match) {
    return {
      ok: false,
      code: "unauthorized_action",
      message: `No explicit approved authorization for ${input.action}`,
    };
  }

  return { ok: true, authorizationId: match.id };
}

export async function assertPrivilegedAction(
  db: AppDatabase,
  input: {
    organizationId: string;
    workflowId?: string | null;
    action: PrivilegedAction;
  },
) {
  const result = await evaluatePrivilegedAction(db, input);
  if (!result.ok) {
    throw new DeliveryError(
      result.code === "model_code_blocked"
        ? "model_code_blocked"
        : "unauthorized_action",
      result.message,
    );
  }
  return result;
}

export async function consumeAuthorization(
  db: AppDatabase,
  authorizationId: string,
) {
  await db
    .update(deliveryAuthorizations)
    .set({
      status: "consumed",
      consumedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(deliveryAuthorizations.id, authorizationId));
}

export async function createAuthorizationRequest(
  db: AppDatabase,
  input: {
    organizationId: string;
    workflowId?: string | null;
    action: PrivilegedAction;
    note?: string;
  },
) {
  if (input.workflowId) {
    const workflow = await db.query.deliveryWorkflows.findFirst({
      where: eq(deliveryWorkflows.id, input.workflowId),
    });
    if (!workflow || workflow.organizationId !== input.organizationId) {
      throw new DeliveryError(
        "unauthorized_action",
        "Workflow not found in organization",
      );
    }
  }

  const id = createId("dauth");
  const stamp = nowIso();
  await db.insert(deliveryAuthorizations).values({
    id,
    organizationId: input.organizationId,
    workflowId: input.workflowId ?? null,
    action: input.action,
    status: "pending",
    note: input.note ?? null,
    createdAt: stamp,
    updatedAt: stamp,
  });
  return id;
}

export async function approveAuthorization(
  db: AppDatabase,
  input: {
    authorizationId: string;
    organizationId: string;
    approvedByUserId: string;
    expiresAt?: string;
    note?: string;
  },
) {
  const existing = await db.query.deliveryAuthorizations.findFirst({
    where: eq(deliveryAuthorizations.id, input.authorizationId),
  });
  if (!existing || existing.organizationId !== input.organizationId) {
    throw new DeliveryError(
      "unauthorized_action",
      "Authorization not found in organization",
    );
  }

  await db
    .update(deliveryAuthorizations)
    .set({
      status: "approved",
      approvedByUserId: input.approvedByUserId,
      approvedAt: nowIso(),
      expiresAt: input.expiresAt ?? null,
      note: input.note ?? undefined,
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(deliveryAuthorizations.id, input.authorizationId),
        eq(deliveryAuthorizations.organizationId, input.organizationId),
      ),
    );
}
