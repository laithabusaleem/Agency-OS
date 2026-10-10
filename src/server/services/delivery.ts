import "server-only";
import { desc, eq } from "drizzle-orm";
import {
  approveAuthorization,
  assertPrivilegedAction,
  consumeAuthorization,
  createAuthorizationRequest,
  ensureDeliverySettings,
} from "@/delivery/authz";
import { DeliveryError } from "@/delivery/errors";
import {
  listWorkflowTemplates,
  getWorkflowTemplate,
  validateBrief,
} from "@/delivery/templates";
import {
  listLatestArtifacts,
  openRevision,
  runWorkflowDelivery,
} from "@/delivery/runner";
import type {
  BriefAnswers,
  DeliveryTemplateId,
  PrivilegedAction,
} from "@/delivery/types";
import { getDb } from "@/db/client";
import {
  deliveryAuthorizations,
  deliveryQaChecks,
  deliveryRuns,
  deliveryWorkflows,
  projects,
} from "@/db/schema";
import { createId } from "@/lib/id";
import type { AuthUser } from "@/server/authz-rules";
import { assertOrgAccess, AuthorizationError } from "@/server/authz-rules";

function now() {
  return new Date().toISOString();
}

export function getTemplates() {
  return listWorkflowTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    intakeQuestions: t.intakeQuestions,
    scope: t.scope,
    allowedTools: t.allowedTools,
    outputs: t.outputs,
    acceptanceCriteria: t.acceptanceCriteria,
  }));
}

export async function getDeliveryStatus(user: AuthUser) {
  assertOrgAccess(user, user.organizationId);
  return ensureDeliverySettings(getDb());
}

export async function listWorkflows(user: AuthUser) {
  return getDb().query.deliveryWorkflows.findMany({
    where: eq(deliveryWorkflows.organizationId, user.organizationId),
    orderBy: [desc(deliveryWorkflows.createdAt)],
  });
}

export async function getWorkflowDetail(user: AuthUser, workflowId: string) {
  const db = getDb();
  const workflow = await db.query.deliveryWorkflows.findFirst({
    where: eq(deliveryWorkflows.id, workflowId),
  });
  if (!workflow) return null;
  assertOrgAccess(user, workflow.organizationId);
  const template = getWorkflowTemplate(workflow.templateId);
  const artifacts = await listLatestArtifacts(db, workflowId);
  const runs = await db.query.deliveryRuns.findMany({
    where: eq(deliveryRuns.workflowId, workflowId),
    orderBy: [desc(deliveryRuns.createdAt)],
    limit: 20,
  });
  const qaChecks = await db.query.deliveryQaChecks.findMany({
    where: eq(deliveryQaChecks.workflowId, workflowId),
    orderBy: [desc(deliveryQaChecks.createdAt)],
    limit: 50,
  });
  const authorizations = await db.query.deliveryAuthorizations.findMany({
    where: eq(deliveryAuthorizations.organizationId, user.organizationId),
    orderBy: [desc(deliveryAuthorizations.createdAt)],
    limit: 20,
  });
  return { workflow, template, artifacts, runs, qaChecks, authorizations };
}

export async function createWorkflow(
  user: AuthUser,
  input: {
    projectId: string;
    templateId: DeliveryTemplateId;
    name: string;
    mode?: "mock" | "live";
    brief?: BriefAnswers;
  },
) {
  const db = getDb();
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, input.projectId),
  });
  if (!project) throw new Error("Project not found");
  assertOrgAccess(user, project.organizationId);

  const template = getWorkflowTemplate(input.templateId);
  const brief = input.brief ?? {};
  const briefCheck = validateBrief(template.intakeQuestions, brief);
  const id = createId("dwf");
  const stamp = now();

  await db.insert(deliveryWorkflows).values({
    id,
    organizationId: user.organizationId,
    projectId: project.id,
    templateId: template.id,
    name: input.name,
    status: briefCheck.ok ? "ready" : "brief_incomplete",
    mode: input.mode ?? "mock",
    briefJson: JSON.stringify(brief),
    scopeJson: JSON.stringify(template.scope),
    currentVersion: 0,
    createdByUserId: user.id,
    createdAt: stamp,
    updatedAt: stamp,
  });

  return db.query.deliveryWorkflows.findFirst({
    where: eq(deliveryWorkflows.id, id),
  });
}

export async function updateBrief(
  user: AuthUser,
  workflowId: string,
  brief: BriefAnswers,
) {
  const db = getDb();
  const workflow = await db.query.deliveryWorkflows.findFirst({
    where: eq(deliveryWorkflows.id, workflowId),
  });
  if (!workflow) throw new Error("Workflow not found");
  assertOrgAccess(user, workflow.organizationId);
  const template = getWorkflowTemplate(workflow.templateId);
  const check = validateBrief(template.intakeQuestions, brief);
  await db
    .update(deliveryWorkflows)
    .set({
      briefJson: JSON.stringify(brief),
      status: check.ok ? "ready" : "brief_incomplete",
      failureReason: check.ok ? null : `missing=${check.missing.join(",")}`,
      updatedAt: now(),
    })
    .where(eq(deliveryWorkflows.id, workflowId));
  return check;
}

export async function runDelivery(
  user: AuthUser,
  workflowId: string,
  idempotencyKey: string,
) {
  assertOrgAccess(user, user.organizationId);
  return runWorkflowDelivery({
    db: getDb(),
    organizationId: user.organizationId,
    workflowId,
    idempotencyKey,
  });
}

export async function reviseWorkflow(
  user: AuthUser,
  workflowId: string,
  reason: string,
  briefPatch?: BriefAnswers,
) {
  return openRevision(getDb(), {
    organizationId: user.organizationId,
    workflowId,
    reason,
    userId: user.id,
    briefPatch,
  });
}

export async function requestAuthorization(
  user: AuthUser,
  input: {
    workflowId?: string;
    action: PrivilegedAction;
    note?: string;
  },
) {
  return createAuthorizationRequest(getDb(), {
    organizationId: user.organizationId,
    workflowId: input.workflowId,
    action: input.action,
    note: input.note,
  });
}

export async function approveAuth(
  user: AuthUser,
  authorizationId: string,
  note?: string,
) {
  if (user.role !== "admin") {
    throw new AuthorizationError("Only admins can approve privileged actions");
  }
  await approveAuthorization(getDb(), {
    authorizationId,
    organizationId: user.organizationId,
    approvedByUserId: user.id,
    note,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
}

/**
 * Attempt a privileged action — requires explicit authorization.
 * Never granted merely because a delivery/QA agent requested it.
 */
export async function performPrivilegedAction(
  user: AuthUser,
  input: {
    workflowId: string;
    action: PrivilegedAction;
    note?: string;
  },
) {
  if (user.role !== "admin") {
    throw new AuthorizationError("Admin required for privileged actions");
  }
  const db = getDb();
  const workflow = await db.query.deliveryWorkflows.findFirst({
    where: eq(deliveryWorkflows.id, input.workflowId),
  });
  if (!workflow) throw new Error("Workflow not found");
  assertOrgAccess(user, workflow.organizationId);

  const gate = await assertPrivilegedAction(db, {
    organizationId: user.organizationId,
    workflowId: workflow.id,
    action: input.action,
  });

  await consumeAuthorization(db, gate.authorizationId);

  return {
    ok: true as const,
    action: input.action,
    authorizationId: gate.authorizationId,
    note:
      input.note ??
      `Privileged action ${input.action} executed under authorization ${gate.authorizationId}`,
  };
}

export async function listProjectsForDelivery(user: AuthUser) {
  return getDb().query.projects.findMany({
    where: eq(projects.organizationId, user.organizationId),
    orderBy: [desc(projects.updatedAt)],
  });
}

export { DeliveryError };
