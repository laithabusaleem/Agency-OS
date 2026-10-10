import type { PersonEvidence } from "@/db/schema";

/**
 * Confidence must reflect source quality — never LLM certainty.
 */
export function scoreRoleConfidence(evidence: PersonEvidence[]): number {
  if (!evidence.length) return 0;
  const verifiedFacts = evidence.filter(
    (e) => e.kind === "fact" && e.verificationStatus === "verified",
  );
  const recent = verifiedFacts.filter((e) => {
    const t = Date.parse(e.retrievedAt);
    return Number.isFinite(t) && Date.now() - t < 1000 * 60 * 60 * 24 * 180;
  });
  const firstParty = verifiedFacts.filter((e) =>
    ["company_website", "public_bio", "press"].includes(e.sourceType),
  );
  const conflicted = evidence.some((e) => e.verificationStatus === "conflicted");

  let score = 0;
  score += Math.min(40, verifiedFacts.length * 15);
  score += Math.min(25, recent.length * 10);
  score += Math.min(25, firstParty.length * 12);
  if (conflicted) score = Math.max(0, score - 30);
  if (!verifiedFacts.length) score = Math.min(score, 25);
  return Math.max(0, Math.min(100, score));
}

export function scoreServiceRelevance(input: {
  decisionMakerType: string;
  preferred: string[];
  hasOpportunityEvidence: boolean;
}): number {
  const rank = input.preferred.indexOf(input.decisionMakerType);
  let score = rank === -1 ? 20 : Math.max(30, 90 - rank * 12);
  if (input.hasOpportunityEvidence) score = Math.min(100, score + 15);
  return score;
}

export function canMarkRoleVerified(evidence: PersonEvidence[]): boolean {
  return evidence.some(
    (e) =>
      e.kind === "fact" &&
      e.verificationStatus === "verified" &&
      /role|title|founder|ceo|director|owner|marketing|operations/i.test(
        e.claim,
      ) &&
      Boolean(e.sourceUrl),
  );
}
