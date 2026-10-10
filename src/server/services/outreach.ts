import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  draftAuditSummary,
  draftFollowUp,
  draftPersonalizedOutreach,
  draftProposal,
} from "@/outreach/drafts";
import {
  ensureOutreachSettings,
  isEmailSuppressed,
  setEmergencyStop,
  setSendingEnabled,
} from "@/outreach/gates";
import { enqueueAndSend } from "@/outreach/send";
import { listSenderStatus } from "@/outreach/senders/registry";
import type { EmailCategory } from "@/outreach/types";
import type { AppDatabase } from "@/db/factory";
import { getDb } from "@/db/client";
import {
  auditFindings,
  businessAudits,
  followUpSchedules,
  leadEvidence,
  leads,
  outreachCampaigns,
  outreachMessages,
  outreachStrategyDrafts,
  suppressionList,
} from "@/db/schema";
import { createId } from "@/lib/id";
import type { AuthUser } from "@/server/authz-rules";
import { assertOrgAccess, AuthorizationError } from "@/server/authz-rules";

function now() {
  return new Date().toISOString();
}

export async function getOutreachStatus(user: AuthUser) {
  assertOrgAccess(user, user.organizationId);
  const db = getDb();
  const settings = await ensureOutreachSettings(db);
  return {
    settings,
    senders: listSenderStatus(),
  };
}

export async function adminSetSendingEnabled(user: AuthUser, enabled: boolean) {
  if (user.role !== "admin") throw new AuthorizationError("Admin required");
  await setSendingEnabled(getDb(), enabled);
}

export async function adminSetEmergencyStop(user: AuthUser, enabled: boolean) {
  if (user.role !== "admin") throw new AuthorizationError("Admin required");
  await setEmergencyStop(getDb(), enabled);
}

export async function createBusinessAudit(
  user: AuthUser,
  input: {
    leadId: string;
    title: string;
    summary: string;
    findings: Array<{
      kind: "fact" | "inference" | "unknown";
      severity?: "low" | "medium" | "high";
      title: string;
      detail: string;
      evidenceIds?: string[];
    }>;
  },
) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, input.leadId),
  });
  if (!lead) throw new Error("Lead not found");
  assertOrgAccess(user, lead.organizationId);

  const evidence = await db.query.leadEvidence.findMany({
    where: eq(leadEvidence.leadId, lead.id),
  });
  const evidenceIds = evidence.map((e) => e.id);
  const auditId = createId("audit");
  const stamp = now();

  await db.insert(businessAudits).values({
    id: auditId,
    organizationId: user.organizationId,
    leadId: lead.id,
    title: input.title,
    summary: input.summary,
    status: "draft",
    evidenceIdsJson: JSON.stringify(evidenceIds),
    createdByUserId: user.id,
    createdAt: stamp,
    updatedAt: stamp,
  });

  for (const finding of input.findings) {
    await db.insert(auditFindings).values({
      id: createId("afind"),
      auditId,
      organizationId: user.organizationId,
      kind: finding.kind,
      severity: finding.severity ?? "medium",
      title: finding.title,
      detail: finding.detail,
      evidenceIdsJson: JSON.stringify(
        finding.evidenceIds ?? evidenceIds.slice(0, 3),
      ),
      createdAt: stamp,
    });
  }

  return getAudit(user, auditId);
}

export async function getAudit(user: AuthUser, auditId: string) {
  const db = getDb();
  const audit = await db.query.businessAudits.findFirst({
    where: eq(businessAudits.id, auditId),
  });
  if (!audit) return null;
  assertOrgAccess(user, audit.organizationId);
  const findings = await db.query.auditFindings.findMany({
    where: eq(auditFindings.auditId, auditId),
  });
  return { audit, findings };
}

export async function listAudits(user: AuthUser) {
  return getDb().query.businessAudits.findMany({
    where: eq(businessAudits.organizationId, user.organizationId),
    orderBy: [desc(businessAudits.createdAt)],
  });
}

export async function createCampaign(
  user: AuthUser,
  input: { name: string; sendLimit?: number; category?: EmailCategory },
) {
  const id = createId("ocamp");
  const stamp = now();
  await getDb()
    .insert(outreachCampaigns)
    .values({
      id,
      organizationId: user.organizationId,
      name: input.name,
      status: "draft",
      category: input.category ?? "approved_outreach",
      sendLimit: input.sendLimit ?? 50,
      sentCount: 0,
      approvalRequired: true,
      createdByUserId: user.id,
      createdAt: stamp,
      updatedAt: stamp,
    });
  return getDb().query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, id),
  });
}

export async function submitCampaignForReview(
  user: AuthUser,
  campaignId: string,
) {
  const db = getDb();
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  assertOrgAccess(user, campaign.organizationId);
  if (campaign.status !== "draft" && campaign.status !== "rejected") {
    throw new Error(`Cannot submit from status ${campaign.status}`);
  }
  await db
    .update(outreachCampaigns)
    .set({ status: "pending_review", updatedAt: now() })
    .where(eq(outreachCampaigns.id, campaignId));
}

/** Explicit human approval — required before any approved_outreach send. */
export async function approveCampaign(
  user: AuthUser,
  campaignId: string,
  note?: string,
) {
  if (user.role !== "admin") {
    throw new AuthorizationError("Only admins can approve campaigns");
  }
  const db = getDb();
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  assertOrgAccess(user, campaign.organizationId);
  if (campaign.status !== "pending_review" && campaign.status !== "draft") {
    throw new Error(`Cannot approve from status ${campaign.status}`);
  }
  await db
    .update(outreachCampaigns)
    .set({
      status: "approved",
      approvedByUserId: user.id,
      approvedAt: now(),
      approvalNote: note ?? "Approved",
      updatedAt: now(),
    })
    .where(eq(outreachCampaigns.id, campaignId));
}

export async function stopCampaign(
  user: AuthUser,
  campaignId: string,
  reason: string,
) {
  const db = getDb();
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  assertOrgAccess(user, campaign.organizationId);
  await db
    .update(outreachCampaigns)
    .set({
      status: "stopped",
      stopReason: reason,
      updatedAt: now(),
    })
    .where(eq(outreachCampaigns.id, campaignId));
}

export async function listCampaigns(user: AuthUser) {
  return getDb().query.outreachCampaigns.findMany({
    where: eq(outreachCampaigns.organizationId, user.organizationId),
    orderBy: [desc(outreachCampaigns.createdAt)],
  });
}

export async function createMessageDraft(
  user: AuthUser,
  input: {
    leadId: string;
    campaignId?: string;
    auditId?: string;
    type: "audit_summary" | "personalized_outreach" | "proposal" | "follow_up";
    serviceName?: string;
    scope?: string;
    investment?: string;
    previousSubject?: string;
    scheduledFor?: string;
  },
) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, input.leadId),
  });
  if (!lead) throw new Error("Lead not found");
  assertOrgAccess(user, lead.organizationId);

  if (!lead.email || lead.emailProvenance !== "observed") {
    throw new Error(
      "Cannot draft outbound message: lead has no observed email (contacts are never invented)",
    );
  }

  const evidence = await db.query.leadEvidence.findMany({
    where: eq(leadEvidence.leadId, lead.id),
  });

  let draft: {
    subject: string;
    bodyText: string;
    personalizationNotes: string;
  };
  let auditId = input.auditId ?? null;

  if (input.type === "audit_summary") {
    const auditBundle = input.auditId
      ? await getAudit(user, input.auditId)
      : null;
    if (!auditBundle) throw new Error("Audit required for audit_summary");
    auditId = auditBundle.audit.id;
    draft = draftAuditSummary({
      lead,
      audit: auditBundle.audit,
      findings: auditBundle.findings,
      evidence,
    });
  } else if (input.type === "proposal") {
    draft = draftProposal({
      lead,
      serviceName: input.serviceName || "Engagement",
      scope: input.scope || "Discovery + delivery",
      investment: input.investment || "TBD",
      evidence,
    });
  } else if (input.type === "follow_up") {
    draft = draftFollowUp({
      lead,
      previousSubject: input.previousSubject || "Earlier note",
      daysSince: 3,
    });
  } else {
    // Prefer evidence-backed DMI strategy when available
    const strategy = await db.query.outreachStrategyDrafts.findFirst({
      where: and(
        eq(outreachStrategyDrafts.organizationId, user.organizationId),
        eq(outreachStrategyDrafts.leadId, lead.id),
      ),
      orderBy: [desc(outreachStrategyDrafts.createdAt)],
    });
    if (strategy && strategy.primaryMessage) {
      draft = {
        subject: strategy.subjectLine || `Quick idea for ${lead.company || lead.name}`,
        bodyText: strategy.primaryMessage,
        personalizationNotes: `${strategy.evidenceExplanation}; strategy=${strategy.id}; confidence=${strategy.confidence}`,
      };
    } else {
      const audit = input.auditId ? await getAudit(user, input.auditId) : null;
      draft = draftPersonalizedOutreach({
        lead,
        audit: audit?.audit ?? null,
        evidence,
      });
    }
  }

  const id = createId("omsg");
  const stamp = now();
  await db.insert(outreachMessages).values({
    id,
    organizationId: user.organizationId,
    campaignId: input.campaignId ?? null,
    leadId: lead.id,
    auditId,
    type: input.type,
    status: "draft",
    subject: draft.subject,
    bodyText: draft.bodyText,
    toEmail: lead.email,
    evidenceIdsJson: JSON.stringify(evidence.map((e) => e.id)),
    personalizationNotes: draft.personalizationNotes,
    scheduledFor: input.scheduledFor ?? null,
    createdByUserId: user.id,
    createdAt: stamp,
    updatedAt: stamp,
  });

  if (input.scheduledFor) {
    await db.insert(followUpSchedules).values({
      id: createId("ofollow"),
      organizationId: user.organizationId,
      messageId: id,
      leadId: lead.id,
      dueAt: input.scheduledFor,
      status: "scheduled",
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  return db.query.outreachMessages.findFirst({
    where: eq(outreachMessages.id, id),
  });
}

export async function submitMessageForReview(
  user: AuthUser,
  messageId: string,
) {
  const db = getDb();
  const message = await db.query.outreachMessages.findFirst({
    where: eq(outreachMessages.id, messageId),
  });
  if (!message) throw new Error("Message not found");
  assertOrgAccess(user, message.organizationId);
  await db
    .update(outreachMessages)
    .set({ status: "in_review", updatedAt: now() })
    .where(eq(outreachMessages.id, messageId));
}

export async function approveMessage(
  user: AuthUser,
  messageId: string,
  note?: string,
) {
  if (user.role !== "admin") {
    throw new AuthorizationError("Only admins can approve outreach messages");
  }
  const db = getDb();
  const message = await db.query.outreachMessages.findFirst({
    where: eq(outreachMessages.id, messageId),
  });
  if (!message) throw new Error("Message not found");
  assertOrgAccess(user, message.organizationId);
  await db
    .update(outreachMessages)
    .set({
      status: message.scheduledFor ? "scheduled" : "approved",
      reviewedByUserId: user.id,
      reviewedAt: now(),
      reviewNote: note ?? "Approved for send",
      updatedAt: now(),
    })
    .where(eq(outreachMessages.id, messageId));
}

export async function listReviewQueue(user: AuthUser) {
  return getDb().query.outreachMessages.findMany({
    where: and(
      eq(outreachMessages.organizationId, user.organizationId),
      inArray(outreachMessages.status, ["in_review", "draft"]),
    ),
    orderBy: [desc(outreachMessages.updatedAt)],
  });
}

export async function listMessages(user: AuthUser) {
  return getDb().query.outreachMessages.findMany({
    where: eq(outreachMessages.organizationId, user.organizationId),
    orderBy: [desc(outreachMessages.createdAt)],
    limit: 100,
  });
}

export async function addSuppression(
  user: AuthUser,
  email: string,
  reason:
    | "unsubscribe"
    | "bounce"
    | "complaint"
    | "reply_stop"
    | "manual"
    | "invalid",
  notes?: string,
) {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const existing = await isEmailSuppressed(db, user.organizationId, normalized);
  if (existing) return existing;
  const id = createId("osupp");
  await db.insert(suppressionList).values({
    id,
    organizationId: user.organizationId,
    email: normalized,
    reason,
    source: user.id,
    notes: notes ?? null,
    createdAt: now(),
  });
  return db.query.suppressionList.findFirst({
    where: eq(suppressionList.id, id),
  });
}

export async function listSuppressions(user: AuthUser) {
  return getDb().query.suppressionList.findMany({
    where: eq(suppressionList.organizationId, user.organizationId),
    orderBy: [desc(suppressionList.createdAt)],
  });
}

/** Public unsubscribe — no session; org scoped via token/query. */
export async function handleUnsubscribe(organizationId: string, email: string) {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const existing = await isEmailSuppressed(db, organizationId, normalized);
  if (!existing) {
    await db.insert(suppressionList).values({
      id: createId("osupp"),
      organizationId,
      email: normalized,
      reason: "unsubscribe",
      source: "unsubscribe_link",
      notes: "One-click / link unsubscribe",
      createdAt: now(),
    });
  }
  await applyStopCondition(organizationId, normalized, "unsubscribed");
  return { ok: true as const };
}

export async function applyStopCondition(
  organizationId: string,
  email: string,
  type: "unsubscribed" | "bounced" | "complained" | "replied" | "stopped",
  db?: AppDatabase,
) {
  const { applyStopConditionWithDb } = await import("@/outreach/stop");
  return applyStopConditionWithDb(db ?? getDb(), organizationId, email, type);
}

/**
 * Attempt send — requires approved message + approved campaign workflow.
 * Never sends merely because an agent requested it.
 */
export async function sendApprovedMessage(
  user: AuthUser,
  messageId: string,
  idempotencyKey: string,
) {
  if (user.role !== "admin") {
    throw new AuthorizationError("Only admins can send approved outreach");
  }
  const db = getDb();
  const message = await db.query.outreachMessages.findFirst({
    where: eq(outreachMessages.id, messageId),
  });
  if (!message) throw new Error("Message not found");
  assertOrgAccess(user, message.organizationId);

  let category: EmailCategory = "approved_outreach";
  if (message.type === "transactional") category = "transactional";

  if (message.campaignId) {
    const campaign = await db.query.outreachCampaigns.findFirst({
      where: eq(outreachCampaigns.id, message.campaignId),
    });
    if (campaign) category = campaign.category;
  }

  return enqueueAndSend({
    db,
    organizationId: user.organizationId,
    messageId,
    idempotencyKey,
    category,
    claimerId: user.id,
  });
}

export async function getSettingsRow() {
  return ensureOutreachSettings(getDb());
}

export async function listSettingsPublic(user: AuthUser) {
  void user;
  const settings = await ensureOutreachSettings(getDb());
  return {
    sendingEnabled: settings.sendingEnabled,
    emergencyStop: settings.emergencyStop,
    dailyQuota: settings.dailyQuota,
    perCampaignLimit: settings.perCampaignLimit,
    rateLimitPerMinute: settings.rateLimitPerMinute,
    fromConfigured: Boolean(settings.defaultFromEmail),
  };
}
