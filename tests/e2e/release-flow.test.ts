/**
 * End-to-end release flow (service-level):
 * lead → evidence audit → campaign/message approval → mock send →
 * project workflow → artifact generation → independent QA
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { enqueueAndSend } from "@/outreach/send";
import { resetOutreachEnvCache } from "@/outreach/config";
import { MockEmailSender } from "@/outreach/senders/mock";
import { setTestEmailSender } from "@/outreach/senders/registry";
import {
  ensureOutreachSettings,
  setEmergencyStop,
  setSendingEnabled,
} from "@/outreach/gates";
import { runWorkflowDelivery } from "@/delivery/runner";
import { resetDeliveryEnvCache } from "@/delivery/config";
import {
  businessAudits,
  auditFindings,
  leadEvidence,
  leads,
  outreachCampaigns,
  outreachMessages,
  projects,
  suppressionList,
} from "@/db/schema";
import { createId } from "@/lib/id";
import { createOutreachTestDb } from "../helpers/outreach-test-db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtures: Array<
  ReturnType<typeof createOutreachTestDb> & { workspace?: string }
> = [];

afterEach(() => {
  while (fixtures.length) {
    const ctx = fixtures.pop();
    ctx?.close();
    if (ctx?.workspace) {
      fs.rmSync(ctx.workspace, { recursive: true, force: true });
    }
  }
  setTestEmailSender(null);
  resetOutreachEnvCache();
  resetDeliveryEnvCache();
});

describe("release readiness E2E flow", () => {
  it("runs lead → audit → approved outreach → send → delivery QA", async () => {
    const ctx = createOutreachTestDb();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agency-e2e-ws-"));
    fixtures.push({ ...ctx, workspace });

    (process.env as Record<string, string>).SESSION_SECRET =
      "e2e-session-secret-at-least-32-chars!";
    (process.env as Record<string, string>).DELIVERY_WORKSPACE_ROOT = workspace;
    (process.env as Record<string, string>).OUTREACH_SENDING_ENABLED = "true";
    (process.env as Record<string, string>).OUTREACH_EMERGENCY_STOP = "false";
    (process.env as Record<string, string>).OUTREACH_FROM_EMAIL =
      "sender@agency.test";
    resetOutreachEnvCache();
    resetDeliveryEnvCache();

    const mock = new MockEmailSender();
    setTestEmailSender(mock);
    await ensureOutreachSettings(ctx.db);
    await setSendingEnabled(ctx.db, true);
    await setEmergencyStop(ctx.db, false);

    // 1) Lead already seeded with observed email — add evidence
    const stamp = new Date().toISOString();
    await ctx.db.insert(leadEvidence).values({
      id: createId("ev"),
      leadId: ctx.leadId,
      organizationId: ctx.organizationId,
      kind: "fact",
      field: "website",
      claim: "Homepage CTA is unclear",
      value: "Learn more",
      sourceType: "manual",
      sourceUrl: "https://acme.test",
      retrievedAt: stamp,
      createdAt: stamp,
    });

    // 2) Evidence-backed audit
    const auditId = createId("audit");
    await ctx.db.insert(businessAudits).values({
      id: auditId,
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      title: "Acme clarity audit",
      summary: "CTA lacks specificity",
      status: "approved",
      evidenceIdsJson: "[]",
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await ctx.db.insert(auditFindings).values({
      id: createId("afind"),
      auditId,
      organizationId: ctx.organizationId,
      kind: "fact",
      severity: "medium",
      title: "Vague CTA",
      detail: "Observed 'Learn more' on homepage",
      evidenceIdsJson: "[]",
      createdAt: stamp,
    });

    // 3) Campaign + approved message
    const campaignId = createId("ocamp");
    await ctx.db.insert(outreachCampaigns).values({
      id: campaignId,
      organizationId: ctx.organizationId,
      name: "E2E Campaign",
      status: "approved",
      category: "approved_outreach",
      sendLimit: 10,
      sentCount: 0,
      approvalRequired: true,
      approvedByUserId: ctx.userId,
      approvedAt: stamp,
      approvalNote: "E2E approved",
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });

    const lead = await ctx.db.query.leads.findFirst({
      where: eq(leads.id, ctx.leadId),
    });
    const messageId = createId("omsg");
    await ctx.db.insert(outreachMessages).values({
      id: messageId,
      organizationId: ctx.organizationId,
      campaignId,
      leadId: ctx.leadId,
      auditId,
      type: "personalized_outreach",
      status: "approved",
      subject: "Quick idea for Acme",
      bodyText: "Based on evidence: Homepage CTA is unclear",
      toEmail: lead!.email,
      evidenceIdsJson: "[]",
      reviewedByUserId: ctx.userId,
      reviewedAt: stamp,
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });

    // 4) Authorized/simulated send
    const sendResult = await enqueueAndSend({
      db: ctx.db,
      organizationId: ctx.organizationId,
      messageId,
      idempotencyKey: "e2e-send-1",
      category: "approved_outreach",
      claimerId: ctx.userId,
    });
    expect(sendResult.send.status).toBe("sent");
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0]?.headers?.["List-Unsubscribe"]).toMatch(/token=/);

    // Suppression persistence after unsubscribe-style stop
    await ctx.db.insert(suppressionList).values({
      id: createId("osupp"),
      organizationId: ctx.organizationId,
      email: lead!.email.toLowerCase(),
      reason: "unsubscribe",
      source: "e2e",
      createdAt: stamp,
    });
    const suppressed = await ctx.db.query.suppressionList.findFirst({
      where: eq(suppressionList.email, lead!.email.toLowerCase()),
    });
    expect(suppressed?.reason).toBe("unsubscribe");

    // Kill switch still blocks further sends
    await setEmergencyStop(ctx.db, true);
    const messageId2 = createId("omsg");
    await ctx.db.insert(outreachMessages).values({
      id: messageId2,
      organizationId: ctx.organizationId,
      campaignId,
      leadId: ctx.leadId,
      type: "follow_up",
      status: "approved",
      subject: "Follow up",
      bodyText: "Checking in",
      toEmail: lead!.email,
      evidenceIdsJson: "[]",
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId: messageId2,
        idempotencyKey: "e2e-send-2",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "emergency_stop" });
    await setEmergencyStop(ctx.db, false);

    // 5) Project + delivery workflow artifacts + QA
    // outreach test db has org/user/lead but needs a project — create one
    const projectId = createId("proj");
    await ctx.db.insert(projects).values({
      id: projectId,
      organizationId: ctx.organizationId,
      name: "E2E Website",
      status: "active",
      isDemo: true,
      createdAt: stamp,
      updatedAt: stamp,
    });

    const { deliveryWorkflows } = await import("@/db/schema");
    const workflowId = createId("dwf");
    await ctx.db.insert(deliveryWorkflows).values({
      id: workflowId,
      organizationId: ctx.organizationId,
      projectId,
      templateId: "website_project",
      name: "E2E Site",
      status: "ready",
      mode: "mock",
      briefJson: JSON.stringify({
        businessName: "Acme Co",
        primaryGoal: "Book a consult",
        brandTone: "professional",
      }),
      scopeJson: "{}",
      currentVersion: 0,
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });

    const delivery = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "e2e-delivery-1",
    });
    expect(delivery.run.status).toBe("succeeded");
    expect(delivery.qa?.ok).toBe(true);
    expect(delivery.workspace).toBeTruthy();
    expect(
      fs.existsSync(path.join(delivery.workspace!, "site/index.html")),
    ).toBe(true);

    // Idempotent replay
    const replay = await runWorkflowDelivery({
      db: ctx.db,
      organizationId: ctx.organizationId,
      workflowId,
      idempotencyKey: "e2e-delivery-1",
    });
    expect(replay.replay).toBe(true);
  });
});
