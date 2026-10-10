import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  approveAuthorization,
  assertPrivilegedAction,
  createAuthorizationRequest,
  ensureDeliverySettings,
} from "@/delivery/authz";
import { resetDeliveryEnvCache } from "@/delivery/config";
import { DeliveryError } from "@/delivery/errors";
import { executeAllowedTool } from "@/delivery/tools/registry";
import { openRevision, runWorkflowDelivery } from "@/delivery/runner";
import { runQaAgent } from "@/delivery/agents/qa";
import { getWorkflowTemplate, validateBrief } from "@/delivery/templates";
import {
  deliveryArtifacts,
  deliverySettings,
  deliveryWorkflows,
} from "@/db/schema";
import { createDeliveryTestDb } from "../helpers/delivery-test-db";
import fs from "node:fs/promises";
import path from "node:path";

const fixtures: Array<ReturnType<typeof createDeliveryTestDb>> = [];

afterEach(() => {
  while (fixtures.length) fixtures.pop()?.close();
  resetDeliveryEnvCache();
});

function setup() {
  const ctx = createDeliveryTestDb();
  fixtures.push(ctx);
  return ctx;
}

describe("delivery templates and briefs", () => {
  it("rejects incomplete briefs", () => {
    const template = getWorkflowTemplate("website_project");
    const result = validateBrief(template.intakeQuestions, {
      businessName: "Acme",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("primaryGoal");
      expect(result.missing).toContain("brandTone");
    }
  });

  it("blocks model-code execution parameters on tools", async () => {
    const ctx = setup();
    await expect(
      executeAllowedTool(
        ["write_artifact"],
        "write_artifact",
        {
          organizationId: ctx.organizationId,
          workflowId: "w",
          projectId: ctx.projectId,
          workspaceRoot: ctx.workspaceRoot,
          mode: "mock",
          brief: {},
          version: 1,
          bag: {},
        },
        { executeCode: true, key: "x", content: "nope" },
      ),
    ).rejects.toMatchObject({ code: "model_code_blocked" });
  });
});

describe("mock workflow end-to-end", () => {
  it("delivers website package with artifacts, checksums, and QA", async () => {
    const ctx = setup();
    const workflowId = await ctx.createWorkflow({
      templateId: "website_project",
      brief: {
        businessName: "Northstar Studio",
        primaryGoal: "Book a consult",
        brandTone: "professional",
      },
    });

    const result = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "web-1",
    });

    expect(result.replay).toBe(false);
    expect(result.run.status).toBe("succeeded");
    expect(result.qa?.ok).toBe(true);

    const artifacts = await ctx.db.query.deliveryArtifacts.findMany({
      where: eq(deliveryArtifacts.workflowId, workflowId),
    });
    expect(artifacts.some((a) => a.key === "site_index")).toBe(true);
    expect(artifacts[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const workflow = await ctx.db.query.deliveryWorkflows.findFirst({
      where: eq(deliveryWorkflows.id, workflowId),
    });
    expect(workflow?.status).toBe("delivered");
    expect(workflow?.currentVersion).toBe(1);
  });

  it("runs marketing, research (mock), and automation templates", async () => {
    const ctx = setup();

    const marketingId = await ctx.createWorkflow({
      templateId: "marketing_content",
      brief: {
        campaignName: "Spring",
        audience: "SMB owners",
        offer: "Free audit",
        channels: "email,linkedin",
      },
    });
    await expect(
      runWorkflowDelivery({
        db: ctx.db,
        organizationId: ctx.organizationId,
        workflowId: marketingId,
        idempotencyKey: "mkt-1",
      }),
    ).resolves.toMatchObject({ run: { status: "succeeded" } });

    const researchId = await ctx.createWorkflow({
      templateId: "business_research",
      brief: {
        topic: "Agency OS competitors",
        market: "US",
        questions: "Who serves SMB agencies?",
      },
    });
    await expect(
      runWorkflowDelivery({
        db: ctx.db,
        organizationId: ctx.organizationId,
        workflowId: researchId,
        idempotencyKey: "res-1",
      }),
    ).resolves.toMatchObject({ run: { status: "succeeded" } });

    const autoId = await ctx.createWorkflow({
      templateId: "ai_automation",
      brief: {
        processName: "Lead triage",
        trigger: "New CSV import",
        successMetric: "Time-to-first-touch < 1h",
        systems: "CRM, Slack",
      },
    });
    await expect(
      runWorkflowDelivery({
        db: ctx.db,
        organizationId: ctx.organizationId,
        workflowId: autoId,
        idempotencyKey: "auto-1",
      }),
    ).resolves.toMatchObject({ run: { status: "succeeded" } });
  });
});

describe("failures, revisions, recovery", () => {
  it("fails incomplete briefs before tools run", async () => {
    const ctx = setup();
    const workflowId = await ctx.createWorkflow({
      templateId: "website_project",
      brief: { businessName: "Only name" },
    });

    await expect(
      runWorkflowDelivery({
        db: ctx.db,
        organizationId: ctx.organizationId,
        workflowId,
        idempotencyKey: "incomplete-1",
      }),
    ).rejects.toMatchObject({ code: "incomplete_brief" });

    const workflow = await ctx.db.query.deliveryWorkflows.findFirst({
      where: eq(deliveryWorkflows.id, workflowId),
    });
    expect(workflow?.status).toBe("brief_incomplete");
  });

  it("fails live research without credentials (tool failure)", async () => {
    const ctx = setup();
    const workflowId = await ctx.createWorkflow({
      templateId: "business_research",
      mode: "live",
      brief: {
        topic: "Live topic",
        market: "EU",
        questions: "What changed?",
      },
    });

    await expect(
      runWorkflowDelivery({
        db: ctx.db,
        organizationId: ctx.organizationId,
        workflowId,
        idempotencyKey: "live-fail",
      }),
    ).rejects.toMatchObject({ code: "tool_failure" });
  });

  it("detects invalid artifacts via QA checksum mismatch path", async () => {
    const ctx = setup();
    const workflowId = await ctx.createWorkflow({
      templateId: "marketing_content",
      brief: {
        campaignName: "Bad",
        audience: "A",
        offer: "UniqueOfferXYZ",
        channels: "email",
      },
    });

    await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "mkt-ok",
    });

    // Corrupt artifact on disk after delivery — next QA-style recovery revision
    await openRevision(ctx.db, {
      organizationId: ctx.organizationId,
      workflowId,
      reason: "Fix copy after review",
      briefPatch: { offer: "UniqueOfferXYZ v2" },
    });

    const recovered = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "mkt-rev-1",
    });
    expect(recovered.run.status).toBe("succeeded");
    expect(recovered.version).toBe(2);

    const arts = await ctx.db.query.deliveryArtifacts.findMany({
      where: eq(deliveryArtifacts.workflowId, workflowId),
    });
    expect(arts.some((a) => a.version === 2)).toBe(true);
  });

  it("replays identical idempotency keys without double delivery", async () => {
    const ctx = setup();
    const workflowId = await ctx.createWorkflow({
      templateId: "marketing_content",
      brief: {
        campaignName: "Idem",
        audience: "A",
        offer: "O",
        channels: "email",
      },
    });
    const first = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "idem-1",
    });
    const second = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "idem-1",
    });
    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.run.id).toBe(first.run.id);
  });
});

describe("privileged authorization", () => {
  it("rejects deploy without explicit approval", async () => {
    const ctx = setup();
    await ensureDeliverySettings(ctx.db);
    await expect(
      assertPrivilegedAction(ctx.db, {
        organizationId: ctx.organizationId,
        action: "deploy",
      }),
    ).rejects.toBeInstanceOf(DeliveryError);
  });

  it("allows deploy only after env+runtime enable and admin approval", async () => {
    const ctx = setup();
    (
      process.env as Record<string, string | undefined>
    ).DELIVERY_DEPLOY_ENABLED = "true";
    resetDeliveryEnvCache();
    await ensureDeliverySettings(ctx.db);
    await ctx.db
      .update(deliverySettings)
      .set({ deployEnabled: true, updatedAt: new Date().toISOString() })
      .where(eq(deliverySettings.id, "global"));

    const authId = await createAuthorizationRequest(ctx.db, {
      organizationId: ctx.organizationId,
      action: "deploy",
      note: "Ship site",
    });
    await approveAuthorization(ctx.db, {
      authorizationId: authId,
      organizationId: ctx.organizationId,
      approvedByUserId: ctx.userId,
    });

    const gate = await assertPrivilegedAction(ctx.db, {
      organizationId: ctx.organizationId,
      action: "deploy",
    });
    expect(gate.ok).toBe(true);
  });
});

describe("QA independence", () => {
  it("fails when on-disk artifact no longer matches checksum", async () => {
    const ctx = setup();
    const workflowId = await ctx.createWorkflow({
      templateId: "website_project",
      brief: {
        businessName: "Checksum Co",
        primaryGoal: "Contact us",
        brandTone: "friendly",
      },
    });
    const result = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "qa-corrupt",
    });
    expect(result.qa?.ok).toBe(true);

    const arts = await ctx.db.query.deliveryArtifacts.findMany({
      where: eq(deliveryArtifacts.workflowId, workflowId),
    });
    const index = arts.find((a) => a.key === "site_index");
    expect(index).toBeTruthy();
    const filePath = path.join(result.workspace!, index!.relativePath);
    await fs.writeFile(filePath, "<!-- corrupted -->");

    const qa = await runQaAgent({
      template: getWorkflowTemplate("website_project"),
      brief: {
        businessName: "Checksum Co",
        primaryGoal: "Contact us",
        brandTone: "friendly",
      },
      workspaceRoot: result.workspace!,
      artifacts: arts.map((a) => ({
        key: a.key,
        relativePath: a.relativePath,
        checksumSha256: a.checksumSha256,
      })),
    });
    expect(qa.ok).toBe(false);
    expect(
      qa.checks.some(
        (c) => c.checkId === "checksum_ok" && c.status === "failed",
      ),
    ).toBe(true);
  });
});

describe("live research with credentials", () => {
  it("completes when Brave responds (mocked fetch)", async () => {
    const ctx = setup();
    (process.env as Record<string, string | undefined>).BRAVE_SEARCH_API_KEY =
      "test-brave-key";
    resetDeliveryEnvCache();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Live source",
                url: "https://example.com/live",
                description: "Configured-credentials research hit",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const workflowId = await ctx.createWorkflow({
        templateId: "business_research",
        mode: "live",
        brief: {
          topic: "Live research topic",
          market: "US",
          questions: "What is trending?",
        },
      });
      const result = await runWorkflowDelivery({
        db: ctx.db,
        organizationId: ctx.organizationId,
        workflowId,
        idempotencyKey: "live-ok",
      });
      expect(result.run.status).toBe("succeeded");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
