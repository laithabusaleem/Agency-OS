import type { EvidenceKind, ScoreFactorInput } from "@/acquisition/types";

export function computeWeightedScore(factors: ScoreFactorInput[]): number {
  if (factors.length === 0) return 0;
  let weighted = 0;
  let totalWeight = 0;
  for (const factor of factors) {
    const weight = Math.max(0, factor.weight);
    const points = Math.min(100, Math.max(0, factor.points));
    weighted += points * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weighted / totalWeight);
}

export function defaultScoreFactors(input: {
  hasObservedEmail: boolean;
  hasWebsite: boolean;
  market?: string;
  niche?: string;
  serviceFit: number;
  evidenceStale: boolean;
}): ScoreFactorInput[] {
  const factors: ScoreFactorInput[] = [
    {
      key: "data_quality",
      label: "Data quality",
      points: input.hasObservedEmail ? 80 : input.hasWebsite ? 45 : 15,
      weight: 2,
      kind: input.hasObservedEmail ? "fact" : "unknown",
      rationale: input.hasObservedEmail
        ? "Observed contact email present"
        : input.hasWebsite
          ? "Website known; contact email unknown (not invented)"
          : "Sparse identity data",
    },
    {
      key: "service_fit",
      label: "Service fit",
      points: Math.min(100, Math.max(0, input.serviceFit)),
      weight: 3,
      kind: input.serviceFit > 0 ? "inference" : "unknown",
      rationale:
        input.serviceFit > 0
          ? "Editable service-fit estimate"
          : "Service fit not yet assessed",
    },
    {
      key: "market_niche",
      label: "Market / niche clarity",
      points:
        input.market && input.niche
          ? 70
          : input.market || input.niche
            ? 40
            : 10,
      weight: 2,
      kind: input.market || input.niche ? "inference" : "unknown",
      rationale: "Based on tagged market/niche fields",
    },
    {
      key: "evidence_freshness",
      label: "Evidence freshness",
      points: input.evidenceStale ? 20 : 75,
      weight: 1,
      kind: input.evidenceStale ? "fact" : "fact",
      rationale: input.evidenceStale
        ? "One or more evidence records are stale"
        : "Evidence within TTL",
    },
  ];
  return factors;
}

export function classifyScoreKind(
  points: number,
  hasFacts: boolean,
): EvidenceKind {
  if (!hasFacts && points === 0) return "unknown";
  if (hasFacts) return "fact";
  return "inference";
}
