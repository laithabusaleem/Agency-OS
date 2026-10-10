import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { OutreachGateError } from "@/outreach/errors";
import { resetOutreachEnvCache } from "@/outreach/config";
import { enqueueAndSend } from "@/outreach/send";
import {
  getEmailSender,
  setTestEmailSender,
} from "@/outreach/senders/registry";
import { MockEmailSender } from "@/outreach/senders/mock";
import {
  outreachQuotaDaily,
  outreachSends,
  suppressionList,
} from "@/db/schema";
import { createId } from "@/lib/id";
import {
  createOutreachTestDb,
  seedApprovedSendFixture,
} from "../helpers/outreach-test-db";

const fixtures: Array<ReturnType<typeof createOutreachTestDb>> = [];

afterEach(() => {
  while (fixtures.length) {
    fixtures.pop()?.close();
  }
  setTestEmailSender(null);
  resetOutreachEnvCache();
});

function setup() {
  const ctx = createOutreachTestDb();
  fixtures.push(ctx);
  return ctx;
}

describe("outreach send gates", () => {
  it("blocks send when master switch / runtime sending is disabled", async () => {
    const ctx = setup();
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);
    // env is true from helper, but runtime settings start disabled
    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "k-disabled",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "sending_disabled" });
    expect(ctx.mockSender.sent).toHaveLength(0);
  });

  it("blocks send when campaign lacks explicit approval", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, {
      ...ctx,
      campaignStatus: "pending_review",
      approved: false,
    });

    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "k-no-approval",
        category: "approved_outreach",
      }),
    ).rejects.toBeInstanceOf(OutreachGateError);

    try {
      await enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "k-no-approval-2",
        category: "approved_outreach",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OutreachGateError);
      expect((error as OutreachGateError).code).toMatch(
        /missing_approval|invalid_campaign_status/,
      );
    }
    expect(ctx.mockSender.sent).toHaveLength(0);
  });

  it("blocks suppressed recipients", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);

    await ctx.db.insert(suppressionList).values({
      id: createId("osupp"),
      organizationId: ctx.organizationId,
      email: "prospect@acme.test",
      reason: "unsubscribe",
      source: "test",
      createdAt: new Date().toISOString(),
    });

    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "k-supp",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "suppressed" });
    expect(ctx.mockSender.sent).toHaveLength(0);
  });

  it("blocks when daily quota is exhausted", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);

    const day = new Date().toISOString().slice(0, 10);
    await ctx.db.insert(outreachQuotaDaily).values({
      id: createId("oquota"),
      organizationId: ctx.organizationId,
      day,
      sentCount: 50,
      updatedAt: new Date().toISOString(),
    });

    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "k-quota",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "quota_exhausted" });
    expect(ctx.mockSender.sent).toHaveLength(0);
  });

  it("blocks when emergency stop is active", async () => {
    const ctx = setup();
    await ctx.enableSending();
    await ctx.emergencyStop(true);
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);

    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "k-estop",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "emergency_stop" });
    expect(ctx.mockSender.sent).toHaveLength(0);
  });

  it("sends once when all gates pass", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);

    const result = await enqueueAndSend({
      db: ctx.db,
      organizationId: ctx.organizationId,
      messageId,
      idempotencyKey: "k-ok",
      category: "approved_outreach",
    });

    expect(result.replay).toBe(false);
    expect(result.send.status).toBe("sent");
    expect(ctx.mockSender.sent).toHaveLength(1);
  });
});

describe("outreach races and idempotency", () => {
  it("dedupes duplicate retries with the same idempotency key", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);

    const first = await enqueueAndSend({
      db: ctx.db,
      organizationId: ctx.organizationId,
      messageId,
      idempotencyKey: "idem-dup",
      category: "approved_outreach",
    });
    const second = await enqueueAndSend({
      db: ctx.db,
      organizationId: ctx.organizationId,
      messageId,
      idempotencyKey: "idem-dup",
      category: "approved_outreach",
    });

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.send.id).toBe(first.send.id);
    expect(ctx.mockSender.sent).toHaveLength(1);
  });

  it("only one concurrent worker wins the claim race", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, ctx);

    const key = "idem-race";
    const [a, b] = await Promise.all([
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: key,
        category: "approved_outreach",
        claimerId: "worker-a",
      }),
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: key,
        category: "approved_outreach",
        claimerId: "worker-b",
      }),
    ]);

    const sends = await ctx.db.query.outreachSends.findMany({
      where: eq(outreachSends.idempotencyKey, key),
    });
    expect(sends).toHaveLength(1);
    expect(sends[0]?.status).toBe("sent");

    const providerCalls = ctx.mockSender.sent.length;
    expect(providerCalls).toBe(1);

    const winners = [a, b].filter(
      (r) => !r.replay && !("lostRace" in r && r.lostRace),
    );
    const losers = [a, b].filter(
      (r) => r.replay || ("lostRace" in r && r.lostRace),
    );
    expect(winners.length + losers.length).toBe(2);
    expect(winners.length).toBeGreaterThanOrEqual(1);
  });

  it("never sends merely because a mock agent requested it without approval", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const { messageId } = await seedApprovedSendFixture(ctx.db, {
      ...ctx,
      messageStatus: "draft",
      campaignStatus: "draft",
      approved: false,
    });

    // Simulate an agent inventing a send request — gates must still fail.
    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId,
        idempotencyKey: "agent-request",
        category: "approved_outreach",
        claimerId: "agent_bot",
      }),
    ).rejects.toBeInstanceOf(OutreachGateError);
    expect(ctx.mockSender.sent).toHaveLength(0);
  });
});

describe("outreach stop conditions", () => {
  it("respects emergency stop after enabling sending", async () => {
    const ctx = setup();
    await ctx.enableSending();
    const fixture = await seedApprovedSendFixture(ctx.db, ctx);

    const ok = await enqueueAndSend({
      db: ctx.db,
      organizationId: ctx.organizationId,
      messageId: fixture.messageId,
      idempotencyKey: "before-stop",
      category: "approved_outreach",
    });
    expect(ok.send.status).toBe("sent");

    await ctx.emergencyStop(true);
    const next = await seedApprovedSendFixture(ctx.db, ctx);

    await expect(
      enqueueAndSend({
        db: ctx.db,
        organizationId: ctx.organizationId,
        messageId: next.messageId,
        idempotencyKey: "after-stop",
        category: "approved_outreach",
      }),
    ).rejects.toMatchObject({ code: "emergency_stop" });
  });
});

describe("outreach sender registry", () => {
  it("does not use mock as a silent production fallback", () => {
    setTestEmailSender(null);
    (
      process.env as Record<string, string | undefined>
    ).OUTREACH_SENDING_ENABLED = "false";
    resetOutreachEnvCache();
    expect(getEmailSender().id).toBe("disabled");
  });

  it("mock sender records outbound mail when injected for tests", async () => {
    const mock = new MockEmailSender();
    setTestEmailSender(mock);
    const result = await mock.send({
      to: "a@b.test",
      from: "from@agency.test",
      subject: "t",
      text: "body",
      category: "transactional",
      idempotencyKey: "m1",
    });
    expect(result.ok).toBe(true);
    expect(mock.sent).toHaveLength(1);
  });
});
