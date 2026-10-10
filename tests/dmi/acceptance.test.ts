import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { assertChannelLabeling, blockUnauthorizedDirectMessages } from "@/dmi/channels";
import { containsSensitivePersonalInfo } from "@/dmi/privacy";
import { canMarkRoleVerified, scoreRoleConfidence } from "@/dmi/scoring";
import { runDecisionMakerResearch } from "@/dmi/research";
import { buildOutreachStrategy } from "@/dmi/strategist";
import {
  contactChannels,
  decisionMakerCandidates,
  followUpSchedules,
  outreachCampaigns,
  outreachMessages,
  outreachSettings,
  personEvidence,
  relationshipInteractions,
  suppressionList,
  type PersonEvidence,
} from "@/db/schema";
import { createId } from "@/lib/id";
import {
  ensureOutreachSettings,
  isEmailSuppressed,
  setEmergencyStop,
  setSendingEnabled,
  tryReserveDailyQuota,
} from "@/outreach/gates";
import { enqueueAndSend } from "@/outreach/send";
import { resetOutreachEnvCache } from "@/outreach/config";
import { MockEmailSender } from "@/outreach/senders/mock";
import { setTestEmailSender } from "@/outreach/senders/registry";
import { applyStopConditionWithDb } from "@/outreach/stop";
import { createDmiTestDb } from "../helpers/dmi-test-db";

const fixtures: Array<ReturnType<typeof createDmiTestDb>> = [];

afterEach(() => {
  while (fixtures.length) fixtures.pop()?.close();
  setTestEmailSender(null);
  resetOutreachEnvCache();
});

function setup() {
  const ctx = createDmiTestDb();
  fixtures.push(ctx);
  return ctx;
}

function hypEvidence(
  overrides: Partial<PersonEvidence> & Pick<PersonEvidence, "claim" | "sourceUrl">,
): PersonEvidence {
  return {
    id: "pev_test",
    organizationId: "org",
    candidateId: "cand",
    sourceType: "fixture",
    supportingExcerpt: null,
    kind: "hypothesis",
    confidence: 20,
    verificationStatus: "unverified",
    retrievedAt: new Date().toISOString(),
    publicationDate: null,
    staleAfterAt: null,
    isStale: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DMI acceptance", () => {
  it("does not mark identity verified without supporting evidence", () => {
    expect(canMarkRoleVerified([])).toBe(false);
    expect(
      canMarkRoleVerified([
        hypEvidence({
          claim: "Maybe CEO",
          sourceUrl: "https://example.com",
        }),
      ]),
    ).toBe(false);
    expect(scoreRoleConfidence([])).toBe(0);
  });

  it("excludes sensitive personal information", () => {
    expect(containsSensitivePersonalInfo("home address is private")).toBe(true);
    expect(containsSensitivePersonalInfo("Founder focused on conversion")).toBe(
      false,
    );
  });

  it("blocks inferred contacts labeled verified and unauthorized DMs", () => {
    expect(() =>
      assertChannelLabeling({
        channelType: "business_email",
        value: "guess@acme.test",
        provenance: "verified",
        discoveryMethod: "inferred_pattern",
        allowedForAutomation: false,
      }),
    ).toThrow(/inferred/i);

    expect(() =>
      blockUnauthorizedDirectMessages({
        channelType: "authorized_networking",
        value: "linkedin",
        provenance: "unknown",
        discoveryMethod: "none",
        allowedForAutomation: false,
      }),
    ).toThrow(/Unauthorized direct-message/);
  });

  it("researches candidates with source-backed evidence (mock)", async () => {
    const ctx = setup();
    const result = await runDecisionMakerResearch({
      db: ctx.db,
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      targetService: "website redesign",
      mode: "mock",
      idempotencyKey: "dmi-1",
    });
    expect(result.candidateIds?.length).toBeGreaterThan(0);

    const evidence = await ctx.db.query.personEvidence.findMany({
      where: eq(personEvidence.organizationId, ctx.organizationId),
    });
    expect(evidence.every((e) => Boolean(e.sourceUrl))).toBe(true);
    expect(evidence.some((e) => e.kind === "fact")).toBe(true);

    const channels = await ctx.db.query.contactChannels.findMany({
      where: eq(contactChannels.organizationId, ctx.organizationId),
    });
    expect(
      channels.every((c) => c.provenance !== "verified" || c.sourceUrl),
    ).toBe(true);
    expect(
      channels.every(
        (c) => c.provenance !== "inferred" || !c.allowedForAutomation,
      ),
    ).toBe(true);
  });

  it("prevents cross-org access to private candidate data", async () => {
    const ctx = setup();
    await runDecisionMakerResearch({
      db: ctx.db,
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      targetService: "website",
      mode: "mock",
      idempotencyKey: "dmi-iso",
    });
    const foreign = await ctx.db.query.decisionMakerCandidates.findMany({
      where: eq(decisionMakerCandidates.organizationId, ctx.otherOrgId),
    });
    expect(foreign).toHaveLength(0);

    await expect(
      runDecisionMakerResearch({
        db: ctx.db,
        organizationId: ctx.otherOrgId,
        leadId: ctx.leadId,
        targetService: "website",
        mode: "mock",
        idempotencyKey: "dmi-cross",
      }),
    ).rejects.toThrow(/not found in organization/i);
  });

  it("strategy does not present unsupported facts as verified; provider failure fails closed", async () => {
    const ctx = setup();
    await runDecisionMakerResearch({
      db: ctx.db,
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      targetService: "website",
      mode: "mock",
      idempotencyKey: "dmi-strat",
    });
    const strategy = await buildOutreachStrategy({
      db: ctx.db,
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      serviceName: "Website redesign",
    });
    expect(strategy).toBeTruthy();
    expect(strategy!.primaryMessage.toLowerCase()).not.toMatch(
      /i (know|confirmed|verified) your family/,
    );
    expect(strategy!.evidenceExplanation.length).toBeGreaterThan(0);
    expect(strategy!.factsNeedingVerificationJson).toBeDefined();

    (process.env as Record<string, string>).BRAVE_SEARCH_API_KEY = "";
    await expect(
      runDecisionMakerResearch({
        db: ctx.db,
        organizationId: ctx.organizationId,
        leadId: ctx.leadId,
        targetService: "website",
        mode: "live",
        idempotencyKey: "dmi-live-fail",
        force: true,
      }),
    ).rejects.toThrow(/BRAVE_SEARCH_API_KEY|fail closed|fabricated/i);
  });

  it("suppressed recipients cannot be contacted; emergency stop cancels sends", async () => {
    const ctx = setup();
    (process.env as Record<string, string>).SESSION_SECRET =
      "dmi-session-secret-at-least-32-chars!!";
    (process.env as Record<string, string>).OUTREACH_SENDING_ENABLED = "true";
    (process.env as Record<string, string>).OUTREACH_FROM_EMAIL =
      "from@agency.test";
    resetOutreachEnvCache();
    setTestEmailSender(new MockEmailSender());
    await ensureOutreachSettings(ctx.db);
    await setSendingEnabled(ctx.db, true);

    await ctx.db.insert(suppressionList).values({
      id: createId("osupp"),
      organizationId: ctx.organizationId,
      email: "prospect@acme.test",
      reason: "unsubscribe",
      source: "test",
      createdAt: new Date().toISOString(),
    });
    expect(
      await isEmailSuppressed(ctx.db, ctx.organizationId, "prospect@acme.test"),
    ).toBeTruthy();

    const stamp = new Date().toISOString();
    const campaignId = createId("ocamp");
    await ctx.db.insert(outreachCampaigns).values({
      id: campaignId,
      organizationId: ctx.organizationId,
      name: "DMI",
      status: "approved",
      category: "approved_outreach",
      sendLimit: 10,
      sentCount: 0,
      approvalRequired: true,
      approvedByUserId: ctx.userId,
      approvedAt: stamp,
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const messageId = createId("omsg");
    await ctx.db.insert(outreachMessages).values({
      id: messageId,
      organizationId: ctx.organizationId,
      campaignId,
      leadId: ctx.leadId,
      type: "personalized_outreach",
      status: "approved",
      subject: "Hi",
      bodyText: "Hello",
      toEmail: "prospect@acme.test",
      evidenceIdsJson: "[]",
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });

    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "supp-1",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "suppressed" });

    await setEmergencyStop(ctx.db, true);
    await ctx.db.delete(suppressionList);
    const messageId2 = createId("omsg");
    await ctx.db.insert(outreachMessages).values({
      id: messageId2,
      organizationId: ctx.organizationId,
      campaignId,
      leadId: ctx.leadId,
      type: "follow_up",
      status: "approved",
      subject: "Hi2",
      bodyText: "Hello",
      toEmail: "prospect@acme.test",
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
        idempotencyKey: "estop-1",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "emergency_stop" });
  });

  it("replies and opt-outs stop subsequent follow-ups", async () => {
    const ctx = setup();
    const stamp = new Date().toISOString();
    const campaignId = createId("ocamp");
    await ctx.db.insert(outreachCampaigns).values({
      id: campaignId,
      organizationId: ctx.organizationId,
      name: "Follow",
      status: "approved",
      category: "approved_outreach",
      sendLimit: 10,
      sentCount: 0,
      approvalRequired: false,
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const messageId = createId("omsg");
    await ctx.db.insert(outreachMessages).values({
      id: messageId,
      organizationId: ctx.organizationId,
      campaignId,
      leadId: ctx.leadId,
      type: "follow_up",
      status: "approved",
      subject: "Follow up",
      bodyText: "Checking in",
      toEmail: "prospect@acme.test",
      evidenceIdsJson: "[]",
      createdByUserId: ctx.userId,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const followId = createId("ofup");
    await ctx.db.insert(followUpSchedules).values({
      id: followId,
      organizationId: ctx.organizationId,
      messageId,
      leadId: ctx.leadId,
      dueAt: stamp,
      status: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });

    await applyStopConditionWithDb(
      ctx.db,
      ctx.organizationId,
      "prospect@acme.test",
      "replied",
    );

    const follow = await ctx.db.query.followUpSchedules.findFirst({
      where: eq(followUpSchedules.id, followId),
    });
    expect(follow?.status).toBe("stopped");
    const msg = await ctx.db.query.outreachMessages.findFirst({
      where: eq(outreachMessages.id, messageId),
    });
    expect(msg?.status).toBe("cancelled");
    expect(
      await isEmailSuppressed(ctx.db, ctx.organizationId, "prospect@acme.test"),
    ).toBeTruthy();
  });

  it("shared daily quota cannot be exceeded by concurrent reservations", async () => {
    const ctx = setup();
    await ensureOutreachSettings(ctx.db);
    await ctx.db
      .update(outreachSettings)
      .set({ dailyQuota: 2 })
      .where(eq(outreachSettings.id, "global"));

    const results = await Promise.all([
      tryReserveDailyQuota(ctx.db, ctx.organizationId, 2),
      tryReserveDailyQuota(ctx.db, ctx.organizationId, 2),
      tryReserveDailyQuota(ctx.db, ctx.organizationId, 2),
      tryReserveDailyQuota(ctx.db, ctx.organizationId, 2),
    ]);
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("persists research and interactions across reopen (restart simulation)", async () => {
    const ctx = setup();
    await runDecisionMakerResearch({
      db: ctx.db,
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      targetService: "website",
      mode: "mock",
      idempotencyKey: "persist-1",
    });
    const before = await ctx.db.query.relationshipInteractions.findMany({
      where: eq(relationshipInteractions.leadId, ctx.leadId),
    });
    expect(before.length).toBeGreaterThan(0);

    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const schema = await import("@/db/schema");
    const db2 = drizzle(ctx.sqlite, { schema });
    const after = await db2.query.relationshipInteractions.findMany({
      where: eq(relationshipInteractions.leadId, ctx.leadId),
    });
    expect(after.length).toBe(before.length);
    const candidates = await db2.query.decisionMakerCandidates.findMany({
      where: eq(decisionMakerCandidates.leadId, ctx.leadId),
    });
    expect(candidates.length).toBeGreaterThan(0);
  });
});
