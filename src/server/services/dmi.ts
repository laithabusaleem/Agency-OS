import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { DecisionMakerCoordinator } from "@/dmi/coordinator";
import { runDecisionMakerResearch } from "@/dmi/research";
import { buildOutreachStrategy } from "@/dmi/strategist";
import { getDb } from "@/db/client";
import {
  contactChannels,
  decisionMakerCandidates,
  leads,
  outreachStrategyDrafts,
  personEvidence,
  relationshipInteractions,
} from "@/db/schema";
import { createId } from "@/lib/id";
import type { AuthUser } from "@/server/authz-rules";
import { assertOrgAccess, AuthorizationError } from "@/server/authz-rules";

export async function listCandidates(user: AuthUser, leadId?: string) {
  const db = getDb();
  if (leadId) {
    return db.query.decisionMakerCandidates.findMany({
      where: and(
        eq(decisionMakerCandidates.organizationId, user.organizationId),
        eq(decisionMakerCandidates.leadId, leadId),
      ),
      orderBy: [desc(decisionMakerCandidates.serviceRelevanceScore)],
    });
  }
  return db.query.decisionMakerCandidates.findMany({
    where: eq(decisionMakerCandidates.organizationId, user.organizationId),
    orderBy: [desc(decisionMakerCandidates.updatedAt)],
    limit: 100,
  });
}

export async function getCandidateDetail(user: AuthUser, candidateId: string) {
  const db = getDb();
  const candidate = await db.query.decisionMakerCandidates.findFirst({
    where: eq(decisionMakerCandidates.id, candidateId),
  });
  if (!candidate) return null;
  assertOrgAccess(user, candidate.organizationId);

  const [lead, evidence, channels, interactions, strategies] =
    await Promise.all([
      db.query.leads.findFirst({
        where: and(
          eq(leads.id, candidate.leadId),
          eq(leads.organizationId, user.organizationId),
        ),
      }),
      db.query.personEvidence.findMany({
        where: eq(personEvidence.candidateId, candidateId),
        orderBy: [desc(personEvidence.retrievedAt)],
      }),
      db.query.contactChannels.findMany({
        where: eq(contactChannels.candidateId, candidateId),
      }),
      db.query.relationshipInteractions.findMany({
        where: and(
          eq(relationshipInteractions.organizationId, user.organizationId),
          eq(relationshipInteractions.leadId, candidate.leadId),
        ),
        orderBy: [desc(relationshipInteractions.createdAt)],
        limit: 50,
      }),
      db.query.outreachStrategyDrafts.findMany({
        where: and(
          eq(outreachStrategyDrafts.organizationId, user.organizationId),
          eq(outreachStrategyDrafts.leadId, candidate.leadId),
        ),
        orderBy: [desc(outreachStrategyDrafts.createdAt)],
        limit: 10,
      }),
    ]);

  return { candidate, lead, evidence, channels, interactions, strategies };
}

export async function runResearch(
  user: AuthUser,
  input: {
    leadId: string;
    targetService: string;
    mode?: "mock" | "live";
    force?: boolean;
  },
) {
  return runDecisionMakerResearch({
    db: getDb(),
    organizationId: user.organizationId,
    leadId: input.leadId,
    targetService: input.targetService,
    mode: input.mode ?? "mock",
    idempotencyKey: input.force
      ? createId(`ui_${input.leadId}`)
      : `ui_${input.leadId}_${input.targetService}_v1`,
    userId: user.id,
    force: input.force,
  });
}

export async function scheduleQualifiedResearch(
  user: AuthUser,
  input: { leadId: string; targetService: string; mode?: "mock" | "live" },
) {
  const coord = new DecisionMakerCoordinator(getDb());
  return coord.scheduleAfterQualification({
    organizationId: user.organizationId,
    leadId: input.leadId,
    targetService: input.targetService,
    mode: input.mode ?? "mock",
    userId: user.id,
  });
}

export async function createStrategy(
  user: AuthUser,
  input: { leadId: string; serviceName: string; candidateId?: string },
) {
  return buildOutreachStrategy({
    db: getDb(),
    organizationId: user.organizationId,
    leadId: input.leadId,
    serviceName: input.serviceName,
    candidateId: input.candidateId,
  });
}

export async function rejectCandidate(
  user: AuthUser,
  candidateId: string,
  note?: string,
) {
  const db = getDb();
  const candidate = await db.query.decisionMakerCandidates.findFirst({
    where: eq(decisionMakerCandidates.id, candidateId),
  });
  if (!candidate) throw new Error("Candidate not found");
  assertOrgAccess(user, candidate.organizationId);
  await db
    .update(decisionMakerCandidates)
    .set({
      researchStatus: "rejected",
      selectedForOutreach: false,
      uncertaintyNotes: note ?? "Rejected by operator",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(decisionMakerCandidates.id, candidateId));
}

export async function markEvidenceOutdated(user: AuthUser, evidenceId: string) {
  const db = getDb();
  const row = await db.query.personEvidence.findFirst({
    where: eq(personEvidence.id, evidenceId),
  });
  if (!row) throw new Error("Evidence not found");
  assertOrgAccess(user, row.organizationId);
  await db
    .update(personEvidence)
    .set({
      isStale: true,
      verificationStatus: "outdated",
    })
    .where(eq(personEvidence.id, evidenceId));
}

export async function approveStrategy(user: AuthUser, strategyId: string) {
  if (user.role !== "admin") {
    throw new AuthorizationError("Only admins can approve outreach strategies");
  }
  const db = getDb();
  const row = await db.query.outreachStrategyDrafts.findFirst({
    where: eq(outreachStrategyDrafts.id, strategyId),
  });
  if (!row) throw new Error("Strategy not found");
  assertOrgAccess(user, row.organizationId);
  await db
    .update(outreachStrategyDrafts)
    .set({ status: "approved", updatedAt: new Date().toISOString() })
    .where(eq(outreachStrategyDrafts.id, strategyId));
}

export async function listInteractions(user: AuthUser, leadId: string) {
  return getDb().query.relationshipInteractions.findMany({
    where: and(
      eq(relationshipInteractions.organizationId, user.organizationId),
      eq(relationshipInteractions.leadId, leadId),
    ),
    orderBy: [desc(relationshipInteractions.createdAt)],
  });
}
