import { and, eq, or } from "drizzle-orm";
import { getOutreachEnv } from "@/outreach/config";
import { OutreachGateError } from "@/outreach/errors";
import {
  ensureOutreachSettings,
  evaluateSendGates,
  incrementCampaignSent,
  tryReserveDailyQuota,
} from "@/outreach/gates";
import { getEmailSender } from "@/outreach/senders/registry";
import type { EmailCategory } from "@/outreach/types";
import type { AppDatabase } from "@/db/factory";
import {
  leads,
  outreachCampaigns,
  outreachEvents,
  outreachMessages,
  outreachSends,
} from "@/db/schema";
import { createId } from "@/lib/id";
import { buildUnsubscribeUrl } from "@/lib/security/unsubscribe-token";

function nowIso() {
  return new Date().toISOString();
}

async function failSend(
  db: AppDatabase,
  sendId: string,
  message: string,
  provider = "none",
  status: "failed" | "suppressed" = "failed",
) {
  await db
    .update(outreachSends)
    .set({
      status,
      errorMessage: message,
      provider,
      updatedAt: nowIso(),
      claimedBy: null,
    })
    .where(eq(outreachSends.id, sendId));
}

/**
 * Race-safe send with idempotency:
 * - Duplicate idempotency keys return the existing send (no double provider call when sent)
 * - Claim uses conditional update so only one worker wins
 * - Gates re-checked after claim; agents cannot bypass
 */
export async function enqueueAndSend(input: {
  db: AppDatabase;
  organizationId: string;
  messageId: string;
  idempotencyKey: string;
  category: EmailCategory;
  claimerId?: string;
}) {
  const { db } = input;
  const message = await db.query.outreachMessages.findFirst({
    where: eq(outreachMessages.id, input.messageId),
  });
  if (!message || message.organizationId !== input.organizationId) {
    throw new OutreachGateError("ineligible_recipient", "Message not found");
  }

  const existing = await db.query.outreachSends.findFirst({
    where: and(
      eq(outreachSends.organizationId, input.organizationId),
      eq(outreachSends.idempotencyKey, input.idempotencyKey),
    ),
  });

  if (existing?.status === "sent") {
    return { send: existing, replay: true as const };
  }

  let sendId = existing?.id;
  if (!sendId) {
    const env = getOutreachEnv();
    sendId = createId("osend");
    const stamp = nowIso();
    try {
      await db.insert(outreachSends).values({
        id: sendId,
        organizationId: input.organizationId,
        campaignId: message.campaignId,
        messageId: message.id,
        idempotencyKey: input.idempotencyKey,
        status: "queued",
        provider: "none",
        category: input.category,
        toEmail: message.toEmail.toLowerCase(),
        fromEmail: env.OUTREACH_FROM_EMAIL || "noreply@localhost",
        createdAt: stamp,
        updatedAt: stamp,
      });
    } catch {
      const raced = await db.query.outreachSends.findFirst({
        where: and(
          eq(outreachSends.organizationId, input.organizationId),
          eq(outreachSends.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (!raced) throw new Error("Failed to create send record");
      if (raced.status === "sent") {
        return { send: raced, replay: true as const };
      }
      sendId = raced.id;
    }
  }

  const claimer = input.claimerId ?? createId("claimer");
  const stamp = nowIso();
  await db
    .update(outreachSends)
    .set({
      status: "sending",
      claimedBy: claimer,
      claimedAt: stamp,
      updatedAt: stamp,
      errorMessage: null,
    })
    .where(
      and(
        eq(outreachSends.id, sendId),
        or(
          eq(outreachSends.status, "queued"),
          eq(outreachSends.status, "failed"),
        ),
      ),
    );

  const send = await db.query.outreachSends.findFirst({
    where: eq(outreachSends.id, sendId),
  });
  if (!send) throw new Error("Send disappeared");

  if (send.status === "sent") {
    return { send, replay: true as const };
  }
  if (send.status !== "sending" || send.claimedBy !== claimer) {
    return { send, replay: true as const, lostRace: true as const };
  }

  const campaign = message.campaignId
    ? await db.query.outreachCampaigns.findFirst({
        where: eq(outreachCampaigns.id, message.campaignId),
      })
    : null;
  const lead = message.leadId
    ? await db.query.leads.findFirst({ where: eq(leads.id, message.leadId) })
    : null;

  const gate = await evaluateSendGates(db, {
    organizationId: send.organizationId,
    message,
    campaign: campaign ?? null,
    lead: lead ?? null,
    category: send.category,
  });

  if (!gate.ok) {
    await failSend(
      db,
      send.id,
      gate.message,
      "none",
      gate.code === "suppressed" ? "suppressed" : "failed",
    );
    if (gate.code === "suppressed") {
      await db
        .update(outreachMessages)
        .set({ status: "suppressed", updatedAt: nowIso() })
        .where(eq(outreachMessages.id, message.id));
    }
    throw new OutreachGateError(gate.code, gate.message);
  }

  const settings = await ensureOutreachSettings(db);
  const reserved = await tryReserveDailyQuota(
    db,
    send.organizationId,
    settings.dailyQuota,
  );
  if (!reserved) {
    await failSend(db, send.id, "Daily quota exhausted", "none");
    throw new OutreachGateError("quota_exhausted", "Daily quota exhausted");
  }

  const env = getOutreachEnv();
  const sender = getEmailSender();
  const unsubUrl = buildUnsubscribeUrl({
    baseUrl: env.OUTREACH_UNSUBSCRIBE_BASE_URL,
    organizationId: send.organizationId,
    email: message.toEmail,
  });

  const result = await sender.send({
    to: message.toEmail,
    from: send.fromEmail,
    fromName: env.OUTREACH_FROM_NAME,
    subject: message.subject,
    text: `${message.bodyText}\n\nUnsubscribe: ${unsubUrl}`,
    html: message.bodyHtml ?? undefined,
    category: send.category,
    idempotencyKey: send.idempotencyKey,
    headers: { "List-Unsubscribe": `<${unsubUrl}>` },
    tags: {
      campaign: message.campaignId ?? "none",
      message: message.id,
    },
  });

  if (!result.ok) {
    await failSend(db, send.id, result.message, result.provider);
    throw new OutreachGateError(
      result.code === "sending_disabled"
        ? "sending_disabled"
        : "sender_unconfigured",
      result.message,
    );
  }

  const sentAt = nowIso();
  await db
    .update(outreachSends)
    .set({
      status: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt,
      updatedAt: sentAt,
      errorMessage: null,
    })
    .where(
      and(eq(outreachSends.id, send.id), eq(outreachSends.claimedBy, claimer)),
    );

  const finalized = await db.query.outreachSends.findFirst({
    where: eq(outreachSends.id, send.id),
  });
  if (!finalized || finalized.status !== "sent") {
    return { send: finalized!, replay: true as const, lostRace: true as const };
  }

  await db
    .update(outreachMessages)
    .set({ status: "sent", updatedAt: sentAt })
    .where(eq(outreachMessages.id, message.id));

  if (message.campaignId) {
    await incrementCampaignSent(db, message.campaignId);
  }

  await db.insert(outreachEvents).values({
    id: createId("oevent"),
    organizationId: send.organizationId,
    sendId: send.id,
    messageId: message.id,
    campaignId: message.campaignId,
    type: "sent",
    email: message.toEmail,
    payloadJson: JSON.stringify({
      providerMessageId: result.providerMessageId,
    }),
    createdAt: sentAt,
  });

  return { send: finalized, replay: false as const };
}
