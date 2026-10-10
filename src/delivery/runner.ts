import { and, desc, eq } from "drizzle-orm";
import { runDeliveryAgent } from "@/delivery/agents/delivery";
import { runQaAgent } from "@/delivery/agents/qa";
import { ensureDeliverySettings } from "@/delivery/authz";
import { getDeliveryEnv, resolveWorkspaceRoot } from "@/delivery/config";
import { DeliveryError } from "@/delivery/errors";
import { getWorkflowTemplate, validateBrief } from "@/delivery/templates";
import {
  ensureWorkspace,
  workspaceDir,
  writeWorkspaceFile,
} from "@/delivery/workspace";
import type { AppDatabase } from "@/db/factory";
import {
  deliveryArtifacts,
  deliveryQaChecks,
  deliveryRuns,
  deliveryRevisions,
  deliveryWorkflows,
} from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

async function persistArtifacts(
  db: AppDatabase,
  input: {
    organizationId: string;
    workflowId: string;
    runId: string;
    version: number;
    workspace: string;
    artifacts: Array<{
      key: string;
      relativePath: string;
      contentType: string;
      content: string | Buffer;
      metadata?: Record<string, unknown>;
    }>;
  },
) {
  const stored: Array<{
    key: string;
    relativePath: string;
    checksumSha256: string;
  }> = [];

  for (const art of input.artifacts) {
    const written = await writeWorkspaceFile(
      input.workspace,
      art.relativePath,
      art.content,
    );
    const id = createId("dart");
    await db.insert(deliveryArtifacts).values({
      id,
      organizationId: input.organizationId,
      workflowId: input.workflowId,
      runId: input.runId,
      key: art.key,
      relativePath: written.relativePath,
      contentType: art.contentType,
      checksumSha256: written.checksumSha256,
      byteSize: written.byteSize,
      version: input.version,
      metadataJson: JSON.stringify(art.metadata ?? {}),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    stored.push({
      key: art.key,
      relativePath: written.relativePath,
      checksumSha256: written.checksumSha256,
    });
  }
  return stored;
}

/**
 * Full delivery + independent QA pipeline for a workflow.
 * Idempotent on (organizationId, idempotencyKey).
 */
export async function runWorkflowDelivery(input: {
  db: AppDatabase;
  organizationId: string;
  workflowId: string;
  idempotencyKey: string;
  forceRevision?: boolean;
}) {
  const { db } = input;
  const settings = await ensureDeliverySettings(db);
  const env = getDeliveryEnv();
  if (!settings.runsEnabled || !env.DELIVERY_RUNS_ENABLED) {
    throw new DeliveryError("runs_disabled", "Delivery runs are disabled");
  }

  const existing = await db.query.deliveryRuns.findFirst({
    where: and(
      eq(deliveryRuns.organizationId, input.organizationId),
      eq(deliveryRuns.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (existing?.status === "succeeded") {
    return { run: existing, replay: true as const };
  }

  const workflow = await db.query.deliveryWorkflows.findFirst({
    where: eq(deliveryWorkflows.id, input.workflowId),
  });
  if (!workflow || workflow.organizationId !== input.organizationId) {
    throw new DeliveryError("workspace_error", "Workflow not found");
  }

  const template = getWorkflowTemplate(workflow.templateId);
  const brief = JSON.parse(workflow.briefJson || "{}") as Record<
    string,
    string | number | boolean
  >;
  const briefCheck = validateBrief(template.intakeQuestions, brief);
  if (!briefCheck.ok) {
    await db
      .update(deliveryWorkflows)
      .set({
        status: "brief_incomplete",
        failureReason: `missing=${briefCheck.missing.join(",")}`,
        updatedAt: nowIso(),
      })
      .where(eq(deliveryWorkflows.id, workflow.id));
    throw new DeliveryError(
      "incomplete_brief",
      `Incomplete brief: ${briefCheck.missing.join(", ")}`,
    );
  }

  const version = workflow.currentVersion + 1;
  const root = resolveWorkspaceRoot();
  const workspace = workspaceDir({
    organizationId: workflow.organizationId,
    projectId: workflow.projectId,
    workflowId: workflow.id,
    root,
  });
  await ensureWorkspace(workspace);

  const runId = existing?.id ?? createId("drun");
  const stamp = nowIso();
  if (!existing) {
    await db.insert(deliveryRuns).values({
      id: runId,
      organizationId: input.organizationId,
      workflowId: workflow.id,
      agentKind: "delivery",
      status: "running",
      version,
      idempotencyKey: input.idempotencyKey,
      inputJson: JSON.stringify({ brief, forceRevision: input.forceRevision }),
      startedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    });
  } else {
    await db
      .update(deliveryRuns)
      .set({ status: "running", startedAt: stamp, updatedAt: stamp, version })
      .where(eq(deliveryRuns.id, runId));
  }

  await db
    .update(deliveryWorkflows)
    .set({
      status: "running",
      workspacePath: workspace,
      updatedAt: stamp,
    })
    .where(eq(deliveryWorkflows.id, workflow.id));

  try {
    const delivery = await runDeliveryAgent({
      template,
      ctx: {
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
        projectId: workflow.projectId,
        workspaceRoot: workspace,
        mode: workflow.mode,
        brief,
        version,
        bag: {},
      },
    });

    if (!delivery.ok) {
      await failRun(
        db,
        runId,
        workflow.id,
        delivery.error ?? "Delivery failed",
      );
      throw new DeliveryError(
        "tool_failure",
        delivery.error ?? "Delivery failed",
      );
    }

    const stored = await persistArtifacts(db, {
      organizationId: workflow.organizationId,
      workflowId: workflow.id,
      runId,
      version,
      workspace,
      artifacts: delivery.artifacts,
    });

    await db
      .update(deliveryWorkflows)
      .set({
        status: "awaiting_qa",
        currentVersion: version,
        updatedAt: nowIso(),
      })
      .where(eq(deliveryWorkflows.id, workflow.id));

    const qaKey = `${input.idempotencyKey}:qa`;
    const existingQa = await db.query.deliveryRuns.findFirst({
      where: and(
        eq(deliveryRuns.organizationId, workflow.organizationId),
        eq(deliveryRuns.idempotencyKey, qaKey),
      ),
    });
    const qaRunId = existingQa?.id ?? createId("dqarun");
    const qaStamp = nowIso();
    if (!existingQa) {
      await db.insert(deliveryRuns).values({
        id: qaRunId,
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
        agentKind: "qa",
        status: "running",
        version,
        idempotencyKey: qaKey,
        inputJson: JSON.stringify({ deliveryRunId: runId }),
        startedAt: qaStamp,
        createdAt: qaStamp,
        updatedAt: qaStamp,
      });
    } else {
      await db
        .update(deliveryRuns)
        .set({
          status: "running",
          version,
          startedAt: qaStamp,
          updatedAt: qaStamp,
          errorMessage: null,
        })
        .where(eq(deliveryRuns.id, qaRunId));
    }

    const qa = await runQaAgent({
      template,
      brief,
      workspaceRoot: workspace,
      artifacts: stored,
    });

    for (const check of qa.checks) {
      await db.insert(deliveryQaChecks).values({
        id: createId("dqacheck"),
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
        runId: qaRunId,
        checkId: check.checkId,
        status: check.status,
        message: check.message,
        evidenceJson: JSON.stringify(check.evidence ?? {}),
        createdAt: nowIso(),
      });
    }

    if (!qa.ok) {
      await db
        .update(deliveryRuns)
        .set({
          status: "needs_revision",
          resultJson: JSON.stringify({ delivery, qa }),
          finishedAt: nowIso(),
          updatedAt: nowIso(),
          errorMessage: "QA failed",
        })
        .where(eq(deliveryRuns.id, runId));
      await db
        .update(deliveryRuns)
        .set({
          status: "failed",
          resultJson: JSON.stringify({ checks: qa.checks }),
          finishedAt: nowIso(),
          updatedAt: nowIso(),
          errorMessage: "QA checks failed",
        })
        .where(eq(deliveryRuns.id, qaRunId));
      await db
        .update(deliveryWorkflows)
        .set({
          status: "qa_failed",
          failureReason: "Independent QA rejected artifacts",
          updatedAt: nowIso(),
        })
        .where(eq(deliveryWorkflows.id, workflow.id));
      throw new DeliveryError("qa_failed", "Independent QA rejected artifacts");
    }

    await db
      .update(deliveryRuns)
      .set({
        status: "succeeded",
        resultJson: JSON.stringify({
          steps: delivery.steps,
          artifacts: stored,
        }),
        finishedAt: nowIso(),
        updatedAt: nowIso(),
      })
      .where(eq(deliveryRuns.id, runId));
    await db
      .update(deliveryRuns)
      .set({
        status: "succeeded",
        resultJson: JSON.stringify({ checks: qa.checks }),
        finishedAt: nowIso(),
        updatedAt: nowIso(),
      })
      .where(eq(deliveryRuns.id, qaRunId));
    await db
      .update(deliveryWorkflows)
      .set({
        status: "delivered",
        failureReason: null,
        currentVersion: version,
        updatedAt: nowIso(),
      })
      .where(eq(deliveryWorkflows.id, workflow.id));

    const run = await db.query.deliveryRuns.findFirst({
      where: eq(deliveryRuns.id, runId),
    });
    return { run: run!, replay: false as const, qa, version, workspace };
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await failRun(db, runId, workflow.id, message);
    throw new DeliveryError("tool_failure", message);
  }
}

async function failRun(
  db: AppDatabase,
  runId: string,
  workflowId: string,
  message: string,
) {
  await db
    .update(deliveryRuns)
    .set({
      status: "failed",
      errorMessage: message,
      finishedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(deliveryRuns.id, runId));
  await db
    .update(deliveryWorkflows)
    .set({
      status: "failed",
      failureReason: message,
      updatedAt: nowIso(),
    })
    .where(eq(deliveryWorkflows.id, workflowId));
}

/** Open a revision after QA failure or operator request — bumps version on next run. */
export async function openRevision(
  db: AppDatabase,
  input: {
    organizationId: string;
    workflowId: string;
    reason: string;
    userId?: string;
    briefPatch?: Record<string, string | number | boolean>;
  },
) {
  const workflow = await db.query.deliveryWorkflows.findFirst({
    where: eq(deliveryWorkflows.id, input.workflowId),
  });
  if (!workflow || workflow.organizationId !== input.organizationId) {
    throw new DeliveryError("workspace_error", "Workflow not found");
  }

  const fromVersion = workflow.currentVersion;
  const brief = {
    ...JSON.parse(workflow.briefJson || "{}"),
    ...(input.briefPatch ?? {}),
  };

  await db.insert(deliveryRevisions).values({
    id: createId("drev"),
    organizationId: input.organizationId,
    workflowId: workflow.id,
    fromVersion,
    toVersion: fromVersion + 1,
    reason: input.reason,
    createdByUserId: input.userId ?? null,
    createdAt: nowIso(),
  });

  await db
    .update(deliveryWorkflows)
    .set({
      status: "needs_revision",
      briefJson: JSON.stringify(brief),
      failureReason: null,
      updatedAt: nowIso(),
    })
    .where(eq(deliveryWorkflows.id, workflow.id));

  return { fromVersion, toVersion: fromVersion + 1 };
}

export async function listLatestArtifacts(db: AppDatabase, workflowId: string) {
  const rows = await db.query.deliveryArtifacts.findMany({
    where: eq(deliveryArtifacts.workflowId, workflowId),
    orderBy: [desc(deliveryArtifacts.version)],
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.key)) latest.set(row.key, row);
  }
  return [...latest.values()];
}
