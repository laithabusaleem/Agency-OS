export const PROVENANCE_KINDS = ["observed", "inferred", "unknown"] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const EVIDENCE_KINDS = ["fact", "inference", "unknown"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const RESEARCH_PROVIDERS = [
  "brave",
  "openrouter",
  "manual",
  "csv",
  "mock",
] as const;
export type ResearchProviderId = (typeof RESEARCH_PROVIDERS)[number];

export type NormalizedProspect = {
  name: string;
  nameProvenance: ProvenanceKind;
  email: string;
  emailProvenance: ProvenanceKind;
  phone: string;
  phoneProvenance: ProvenanceKind;
  company: string;
  domain: string | null;
  websiteUrl: string | null;
  market: string;
  niche: string;
  notes: string;
  source: string;
  acquisitionSource: "manual" | "csv" | "brave_search" | "website" | "mixed";
};

export type SearchHit = {
  title: string;
  url: string;
  description: string;
  provider: ResearchProviderId;
  retrievedAt: string;
};

export type FetchOutcome =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      status: number;
      contentType: string;
      text: string;
      retrievedAt: string;
    }
  | {
      ok: false;
      url: string;
      reason:
        | "robots_disallow"
        | "blocked"
        | "captcha"
        | "login_wall"
        | "rate_limited"
        | "unsupported"
        | "network"
        | "timeout";
      message: string;
      status?: number;
      retrievedAt: string;
    };

export type LeadFilters = {
  market?: string;
  niche?: string;
  status?: string;
  minScore?: number;
  minServiceFit?: number;
  domain?: string;
  q?: string;
};

export type ScoreFactorInput = {
  key: string;
  label: string;
  points: number;
  weight: number;
  kind: EvidenceKind;
  rationale: string;
  evidenceIds?: string[];
};
