import { and, desc, eq } from "drizzle-orm";
import { rankChannels } from "@/dmi/channels";
import { containsSensitivePersonalInfo, sanitizeProfessionalText } from "@/dmi/privacy";
import type { AppDatabase } from "@/db/factory";
import {
  contactChannels,
  decisionMakerCandidates,
  outreachStrategyDrafts,
  personEvidence,
  relationshipInteractions,
  type DecisionMakerCandidate,
  type PersonEvidence,
} from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

/**
 * Personalized outreach strategist — evidence-backed only.
 * Unverified claims cannot appear as verified facts in messages.
 */
export async function buildOutreachStrategy(input: {
  db: AppDatabase;
  organizationId: string;
  leadId: string;
  candidateId?: string | null;
  serviceName: string;
}) {
  const { db } = input;
  let candidate: DecisionMakerCandidate | undefined;
  if (input.candidateId) {
    candidate = await db.query.decisionMakerCandidates.findFirst({
      where: and(
        eq(decisionMakerCandidates.id, input.candidateId),
        eq(decisionMakerCandidates.organizationId, input.organizationId),
      ),
    });
  } else {
    candidate = await db.query.decisionMakerCandidates.findFirst({
      where: and(
        eq(decisionMakerCandidates.leadId, input.leadId),
        eq(decisionMakerCandidates.organizationId, input.organizationId),
        eq(decisionMakerCandidates.selectedForOutreach, true),
      ),
    });
  }

  const evidence: PersonEvidence[] = candidate
    ? await db.query.personEvidence.findMany({
        where: and(
          eq(personEvidence.candidateId, candidate.id),
          eq(personEvidence.organizationId, input.organizationId),
        ),
        orderBy: [desc(personEvidence.retrievedAt)],
      })
    : [];

  const channels = candidate
    ? await db.query.contactChannels.findMany({
        where: eq(contactChannels.candidateId, candidate.id),
      })
    : [];

  const verifiedFacts = evidence.filter(
    (e) => e.kind === "fact" && e.verificationStatus === "verified",
  );
  const hypotheses = evidence.filter((e) => e.kind === "hypothesis");
  const needingVerification = [
    ...hypotheses.map((e) => e.claim),
    ...evidence
      .filter((e) => e.verificationStatus === "unverified")
      .map((e) => e.claim),
  ];

  for (const f of verifiedFacts) {
    if (containsSensitivePersonalInfo(f.claim)) {
      throw new Error("Sensitive personal information excluded from strategy");
    }
  }

  const ranked = rankChannels(
    channels.map((c) => ({
      channelType: c.channelType,
      value: c.value,
      provenance: c.provenance,
      sourceUrl: c.sourceUrl ?? undefined,
      discoveryMethod: c.discoveryMethod,
      allowedForAutomation: c.allowedForAutomation,
    })),
  );
  const recommended = ranked[0];

  const priorities = candidate
    ? (JSON.parse(candidate.verifiedPrioritiesJson || "[]") as string[])
    : [];
  const opportunities = candidate
    ? (JSON.parse(candidate.potentialOpportunitiesJson || "[]") as string[])
    : [];

  const weakEvidence = verifiedFacts.length === 0;
  const firstName = candidate?.fullName?.split(/\s+/)[0] || "there";

  const factLine = verifiedFacts[0]
    ? `I read that ${verifiedFacts[0].claim.replace(/\.$/, "")} (${sourceHost(verifiedFacts[0].sourceUrl)}).`
    : "I reviewed publicly available information about your company and kept this note high-level because I could not verify a specific decision-maker claim.";

  const opportunity =
    opportunities[0] ||
    (weakEvidence
      ? `Observable company needs related to ${input.serviceName}`
      : priorities[0] || `Potential fit for ${input.serviceName}`);

  const primaryMessage = sanitizeProfessionalText(
    [
      `Hi ${firstName},`,
      "",
      candidate
        ? `I'm reaching out because your role as ${candidate.currentRole || "a leader"} at the company appears relevant to ${input.serviceName}.`
        : `I'm reaching out regarding ${input.serviceName} based on publicly observable company needs.`,
      factLine,
      `If useful, I can share a short, concrete note on ${opportunity} — no fabricated familiarity, and happy to stop if this isn't relevant.`,
      "",
      "Best,",
    ].join("\n"),
  );

  const alternativeMessage = sanitizeProfessionalText(
    [
      `Hi ${firstName},`,
      "",
      weakEvidence
        ? `Quick professional note about ${input.serviceName} in case it helps your team.`
        : `Another angle: ${priorities[1] || opportunity}.`,
      "Happy to send a one-page outline if you want it — or point me to the right person.",
      "",
      "Thanks,",
    ].join("\n"),
  );

  const subjectLine = candidate?.fullName
    ? `Quick note for ${candidate.fullName.split(/\s+/)[0]} — ${input.serviceName}`
    : `Quick note — ${input.serviceName}`;

  const confidence = Math.min(
    100,
    Math.round(
      (candidate?.roleConfidence ?? 0) * 0.5 +
        (candidate?.serviceRelevanceScore ?? 0) * 0.3 +
        Math.min(20, verifiedFacts.length * 10),
    ),
  );

  const status =
    needingVerification.length > 0 || weakEvidence
      ? ("needs_verification" as const)
      : ("draft" as const);

  // Guard: no unverified claim may be asserted as fact in primary message
  for (const h of hypotheses) {
    const snippet = h.claim.slice(0, 40);
    if (
      primaryMessage.toLowerCase().includes(snippet.toLowerCase()) &&
      /i (know|confirmed|verified)/i.test(primaryMessage)
    ) {
      throw new Error(
        "Unsupported facts cannot enter outreach as verified claims",
      );
    }
  }

  const id = createId("ostrat");
  await db.insert(outreachStrategyDrafts).values({
    id,
    organizationId: input.organizationId,
    leadId: input.leadId,
    candidateId: candidate?.id ?? null,
    status,
    relevanceReason: candidate
      ? `${candidate.fullName} (${candidate.decisionMakerType}) scored ${candidate.serviceRelevanceScore} for ${input.serviceName}`
      : "No verified decision-maker — company-level approach",
    opportunity,
    serviceRationale: `Service ${input.serviceName} aligned to public priorities where evidenced`,
    evidenceExplanation: verifiedFacts.length
      ? `Grounded in ${verifiedFacts.length} verified fact(s): ${verifiedFacts
          .map((f) => f.id)
          .join(", ")}`
      : "Weak evidence — professional company-level message only",
    recipientValue: opportunity,
    recommendedChannelId: recommended
      ? channels.find((c) => c.value === recommended.value)?.id ?? null
      : null,
    subjectLine,
    primaryMessage,
    alternativeMessage,
    proposalOutline: opportunities[0]
      ? `Outline: ${opportunities[0]} → discovery call → scoped proposal`
      : null,
    confidence,
    factsNeedingVerificationJson: JSON.stringify(needingVerification),
    evidenceIdsJson: JSON.stringify(verifiedFacts.map((f) => f.id)),
    nextStep: recommended
      ? `Review draft; contact via ${recommended.channelType} (${recommended.provenance}) after approval`
      : "Identify a permitted company contact channel before sending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  await db.insert(relationshipInteractions).values({
    id: createId("rint"),
    organizationId: input.organizationId,
    leadId: input.leadId,
    candidateId: candidate?.id ?? null,
    type: "message_drafted",
    summary: `Strategy draft ${id} (confidence ${confidence})`,
    payloadJson: JSON.stringify({ strategyId: id, status }),
    createdAt: nowIso(),
  });

  return db.query.outreachStrategyDrafts.findFirst({
    where: eq(outreachStrategyDrafts.id, id),
  });
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "public source";
  }
}
