import { and, eq, gte } from "drizzle-orm";
import { AgentCoordinator } from "@/agent/coordinator";
import { runDecisionMakerResearch } from "@/dmi/research";
import { buildOutreachStrategy } from "@/dmi/strategist";
import type { AppDatabase } from "@/db/factory";
import {
  decisionMakerCandidates,
  dmiResearchRuns,
  leads,
} from "@/db/schema";
import { createId } from "@/lib/id";

/**
 * DMI coordinator hooks — schedules research after qualification,
 * avoids duplicate work, caches fresh evidence, recovers without fabricating.
 */
export class DecisionMakerCoordinator {
  private agents: AgentCoordinator;

  constructor(private readonly db: AppDatabase) {
    this.agents = new AgentCoordinator(db);
  }

  /**
   * After a lead passes initial qualification, schedule decision-maker research.
   */
  async scheduleAfterQualification(input: {
    organizationId: string;
    leadId: string;
    targetService: string;
    minScore?: number;
    mode?: "mock" | "live";
    userId?: string | null;
    useAgentJob?: boolean;
  }) {
    const lead = await this.db.query.leads.findFirst({
      where: eq(leads.id, input.leadId),
    });
    if (!lead || lead.organizationId !== input.organizationId) {
      throw new Error("Lead not found in organization");
    }
    const minScore = input.minScore ?? 40;
    if (lead.score < minScore && lead.status === "new") {
      return {
        scheduled: false as const,
        reason: `Lead score ${lead.score} below qualification threshold ${minScore}`,
      };
    }

    const idempotencyKey = `dmi_research_${lead.id}_${input.targetService}`;
    const recent = await this.db.query.dmiResearchRuns.findFirst({
      where: and(
        eq(dmiResearchRuns.organizationId, input.organizationId),
        eq(dmiResearchRuns.leadId, lead.id),
        eq(dmiResearchRuns.status, "succeeded"),
        gte(
          dmiResearchRuns.updatedAt,
          new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
        ),
      ),
    });
    if (recent) {
      return {
        scheduled: false as const,
        reason: "Fresh research already cached",
        runId: recent.id,
      };
    }

    if (input.useAgentJob) {
      const job = await this.agents.enqueue({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        agentType: "research_decision_maker",
        provider: "mock",
        idempotencyKey: createId("dmi_job"),
        input: {
          leadId: lead.id,
          targetService: input.targetService,
          mode: input.mode ?? "mock",
          researchIdempotencyKey: idempotencyKey,
        },
      });
      return { scheduled: true as const, via: "agent_job" as const, job };
    }

    const result = await runDecisionMakerResearch({
      db: this.db,
      organizationId: input.organizationId,
      leadId: lead.id,
      targetService: input.targetService,
      mode: input.mode ?? "mock",
      idempotencyKey,
      userId: input.userId,
    });

    return { scheduled: true as const, via: "inline" as const, result };
  }

  async reassignWhenUnverified(input: {
    organizationId: string;
    leadId: string;
  }) {
    const candidates = await this.db.query.decisionMakerCandidates.findMany({
      where: and(
        eq(decisionMakerCandidates.organizationId, input.organizationId),
        eq(decisionMakerCandidates.leadId, input.leadId),
      ),
    });
    const unverified = candidates.filter(
      (c) => c.researchStatus !== "verified",
    );
    if (!unverified.length) return { reassigned: false as const };
    // Prefer next-best by service relevance among needs_review
    const next = [...candidates]
      .filter((c) => c.researchStatus === "needs_review")
      .sort((a, b) => b.serviceRelevanceScore - a.serviceRelevanceScore)[0];
    if (!next) return { reassigned: false as const, needsHumanReview: true };
    await this.db
      .update(decisionMakerCandidates)
      .set({ selectedForOutreach: false })
      .where(eq(decisionMakerCandidates.leadId, input.leadId));
    await this.db
      .update(decisionMakerCandidates)
      .set({ selectedForOutreach: true })
      .where(eq(decisionMakerCandidates.id, next.id));
    return { reassigned: true as const, candidateId: next.id };
  }

  async draftStrategy(input: {
    organizationId: string;
    leadId: string;
    serviceName: string;
    candidateId?: string;
  }) {
    return buildOutreachStrategy({
      db: this.db,
      ...input,
    });
  }
}
