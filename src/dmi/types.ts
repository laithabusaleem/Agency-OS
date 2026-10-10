export const DECISION_MAKER_TYPES = [
  "founder",
  "owner",
  "ceo",
  "managing_director",
  "head_of_marketing",
  "operations_director",
  "other",
  "unknown",
] as const;

export type DecisionMakerType = (typeof DECISION_MAKER_TYPES)[number];

export const CONTACT_PROVENANCE = [
  "verified",
  "published",
  "company_level",
  "inferred",
  "unknown",
] as const;

export type ContactProvenance = (typeof CONTACT_PROVENANCE)[number];

export type ServiceKind =
  | "website"
  | "marketing"
  | "automation"
  | "research"
  | "general";

/** Roles preferred for each service — not a guarantee of purchasing authority. */
export const SERVICE_ROLE_PREFERENCE: Record<
  ServiceKind,
  DecisionMakerType[]
> = {
  website: ["owner", "founder", "head_of_marketing", "ceo", "managing_director"],
  marketing: [
    "head_of_marketing",
    "founder",
    "owner",
    "ceo",
    "managing_director",
  ],
  automation: [
    "operations_director",
    "ceo",
    "managing_director",
    "founder",
    "owner",
  ],
  research: ["founder", "ceo", "owner", "managing_director", "other"],
  general: ["founder", "owner", "ceo", "managing_director", "other"],
};

export const SENSITIVE_FIELD_PATTERNS = [
  /\bhome\s*address\b/i,
  /\bfamily\b/i,
  /\bspouse\b/i,
  /\bchildren\b/i,
  /\bhealth\b/i,
  /\breligio/i,
  /\bpolitic/i,
  /\bssn\b/i,
  /\bpassport\b/i,
  /\bprivate\s+account\b/i,
  /\bpersonal\s+phone\b/i,
  /\bdob\b/i,
  /\bdate of birth\b/i,
];
