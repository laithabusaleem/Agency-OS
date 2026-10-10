import { and, eq, gte, sql } from "drizzle-orm";
import { getOutreachEnv } from "@/outreach/config";
import { OutreachGateError } from "@/outreach/errors";
import { getEmailSender } from "@/outreach/senders/registry";
import {
  SENDABLE_CAMPAIGN_STATUSES,
  type EmailCategory,
  type SendGateResult,
} from "@/outreach/types";
import type { AppDatabase } from "@/db/factory";
import {
  outreachCampaigns,
  outreachQuotaDaily,
  outreachSends,
  outreachSettings,
  suppressionList,
  type Lead,
  type OutreachCampaign,
  type OutreachMessage,
} from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function ensureOutreachSettings(db: AppDatabase) {
  const env = getOutreachEnv();
  const existing = await db.query.outreachSettings.findFirst({
    where: eq(outreachSettings.id, "global"),
  });
  if (existing) return existing;
  // Runtime toggle starts OFF even when env master switch is true —
  // admins must explicitly enable sending in-app after configuring sender.
  const row = {
    id: "global",
    sendingEnabled: false,
    emergencyStop: env.OUTREACH_EMERGENCY_STOP,
    dailyQuota: env.OUTREACH_DAILY_QUOTA,
    perCampaignLimit: env.OUTREACH_PER_CAMPAIGN_LIMIT,
    rateLimitPerMinute: env.OUTREACH_RATE_LIMIT_PER_MINUTE,
    defaultFromEmail: env.OUTREACH_FROM_EMAIL || null,
    defaultFromName: env.OUTREACH_FROM_NAME || null,
    updatedAt: nowIso(),
  };
  await db.insert(outreachSettings).values(row);
  return row;
}

export async function isEmailSuppressed(
  db: AppDatabase,
  organizationId: string,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const row = await db.query.suppressionList.findFirst({
    where: and(
      eq(suppressionList.organizationId, organizationId),
      eq(suppressionList.email, normalized),
    ),
  });
  return row ?? null;
}

export async function getDailySentCount(
  db: AppDatabase,
  organizationId: string,
) {
  const day = today();
  const row = await db.query.outreachQuotaDaily.findFirst({
    where: and(
      eq(outreachQuotaDaily.organizationId, organizationId),
      eq(outreachQuotaDaily.day, day),
    ),
  });
  return row?.sentCount ?? 0;
}

export async function getRecentSendCount(
  db: AppDatabase,
  organizationId: string,
  windowMs: number,
) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const rows = await db.query.outreachSends.findMany({
    where: and(
      eq(outreachSends.organizationId, organizationId),
      gte(outreachSends.createdAt, since),
    ),
  });
  return rows.filter((r) => r.status === "sending" || r.status === "sent")
    .length;
}

/**
 * Server-side eligibility — never trust agent/client assertions.
 * An agent requesting send is insufficient; all checks must pass here.
 */
export async function evaluateSendGates(
  db: AppDatabase,
  input: {
    organizationId: string;
    message: OutreachMessage;
    campaign: OutreachCampaign | null;
    lead: Lead | null;
    category: EmailCategory;
  },
): Promise<SendGateResult> {
  const env = getOutreachEnv();
  const settings = await ensureOutreachSettings(db);

  // Hard ops switch (env) AND runtime admin toggle (DB). Default both off.
  if (!env.OUTREACH_SENDING_ENABLED) {
    return {
      ok: false,
      code: "sending_disabled",
      message:
        "Outbound sending is disabled by default (OUTREACH_SENDING_ENABLED=false)",
    };
  }
  if (!settings.sendingEnabled) {
    return {
      ok: false,
      code: "sending_disabled",
      message:
        "Sending disabled in runtime settings — enable via admin controls",
    };
  }
  if (settings.emergencyStop || env.OUTREACH_EMERGENCY_STOP) {
    return {
      ok: false,
      code: "emergency_stop",
      message: "Emergency stop is active — all sends halted",
    };
  }

  if (
    input.message.status !== "approved" &&
    input.message.status !== "scheduled"
  ) {
    return {
      ok: false,
      code: "message_not_approved",
      message: `Message status "${input.message.status}" is not sendable`,
    };
  }

  if (input.category === "approved_outreach") {
    if (!input.campaign) {
      return {
        ok: false,
        code: "missing_approval",
        message: "Approved outreach requires a campaign",
      };
    }
    if (input.campaign.approvalRequired) {
      if (!input.campaign.approvedByUserId || !input.campaign.approvedAt) {
        return {
          ok: false,
          code: "missing_approval",
          message: "Campaign lacks explicit human approval",
        };
      }
    }
    if (
      !SENDABLE_CAMPAIGN_STATUSES.includes(
        input.campaign.status as (typeof SENDABLE_CAMPAIGN_STATUSES)[number],
      )
    ) {
      return {
        ok: false,
        code: "invalid_campaign_status",
        message: `Campaign status "${input.campaign.status}" is not sendable`,
      };
    }
    if (input.campaign.sentCount >= input.campaign.sendLimit) {
      return {
        ok: false,
        code: "campaign_limit",
        message: "Campaign send limit reached",
      };
    }
  }

  const to = input.message.toEmail.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return {
      ok: false,
      code: "ineligible_recipient",
      message: "Recipient email missing or invalid",
    };
  }

  if (input.lead) {
    if (input.lead.emailProvenance !== "observed" || !input.lead.email) {
      return {
        ok: false,
        code: "ineligible_recipient",
        message:
          "Recipient email is not an observed contact — never send to invented addresses",
      };
    }
    if (input.lead.email.toLowerCase() !== to) {
      return {
        ok: false,
        code: "ineligible_recipient",
        message: "Message recipient does not match lead observed email",
      };
    }
  }

  const suppressed = await isEmailSuppressed(db, input.organizationId, to);
  if (suppressed) {
    return {
      ok: false,
      code: "suppressed",
      message: `Recipient suppressed (${suppressed.reason})`,
    };
  }

  const daily = await getDailySentCount(db, input.organizationId);
  if (daily >= settings.dailyQuota) {
    return {
      ok: false,
      code: "quota_exhausted",
      message: `Daily quota exhausted (${daily}/${settings.dailyQuota})`,
    };
  }

  const recent = await getRecentSendCount(db, input.organizationId, 60_000);
  if (recent >= settings.rateLimitPerMinute) {
    return {
      ok: false,
      code: "rate_limited",
      message: `Rate limit exceeded (${recent}/${settings.rateLimitPerMinute} per minute)`,
    };
  }

  const from = settings.defaultFromEmail || env.OUTREACH_FROM_EMAIL;
  if (!from) {
    return {
      ok: false,
      code: "sender_unconfigured",
      message: "Sender from-email is not configured",
    };
  }

  const sender = getEmailSender();
  if (!sender.isConfigured() || sender.id === "disabled") {
    return {
      ok: false,
      code: "sender_unconfigured",
      message: "No active email sender configured (sending remains disabled)",
    };
  }
  if (!sender.supportsCategory(input.category)) {
    return {
      ok: false,
      code: "category_not_permitted",
      message: `Provider does not permit category ${input.category}`,
    };
  }

  return { ok: true };
}

export function assertGate(result: SendGateResult) {
  if (!result.ok) {
    throw new OutreachGateError(result.code, result.message);
  }
}

export async function setEmergencyStop(db: AppDatabase, enabled: boolean) {
  await ensureOutreachSettings(db);
  await db
    .update(outreachSettings)
    .set({ emergencyStop: enabled, updatedAt: nowIso() })
    .where(eq(outreachSettings.id, "global"));
}

export async function setSendingEnabled(db: AppDatabase, enabled: boolean) {
  await ensureOutreachSettings(db);
  await db
    .update(outreachSettings)
    .set({ sendingEnabled: enabled, updatedAt: nowIso() })
    .where(eq(outreachSettings.id, "global"));
}

/**
 * Atomically reserve one send against the daily quota.
 * Returns false if the quota is already exhausted (race-safe).
 * Uses a single conditional UPDATE so concurrent callers cannot overshoot.
 */
export async function tryReserveDailyQuota(
  db: AppDatabase,
  organizationId: string,
  dailyQuota: number,
): Promise<boolean> {
  if (dailyQuota < 1) return false;
  const day = today();
  const stamp = nowIso();

  // Ensure a row exists (sent_count starts at 0). Unique (org, day) prevents dupes.
  try {
    await db.insert(outreachQuotaDaily).values({
      id: createId("oquota"),
      organizationId,
      day,
      sentCount: 0,
      updatedAt: stamp,
    });
  } catch {
    // Concurrent create — row already exists
  }

  const result = db
    .update(outreachQuotaDaily)
    .set({
      sentCount: sql`${outreachQuotaDaily.sentCount} + 1`,
      updatedAt: stamp,
    })
    .where(
      and(
        eq(outreachQuotaDaily.organizationId, organizationId),
        eq(outreachQuotaDaily.day, day),
        sql`${outreachQuotaDaily.sentCount} < ${dailyQuota}`,
      ),
    )
    .run();

  return (result.changes ?? 0) > 0;
}

/** @deprecated Prefer tryReserveDailyQuota for race-safe sends */
export async function incrementDailyQuota(
  db: AppDatabase,
  organizationId: string,
) {
  const settings = await ensureOutreachSettings(db);
  await tryReserveDailyQuota(db, organizationId, settings.dailyQuota);
}

export async function incrementCampaignSent(
  db: AppDatabase,
  campaignId: string,
) {
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, campaignId),
  });
  if (!campaign) return;
  await db
    .update(outreachCampaigns)
    .set({
      sentCount: campaign.sentCount + 1,
      status: campaign.status === "approved" ? "active" : campaign.status,
      updatedAt: nowIso(),
    })
    .where(eq(outreachCampaigns.id, campaignId));
}
