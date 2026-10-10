import type { Lead, LeadEvidence } from "@/db/schema";

type AuditLike = {
  title: string;
  summary: string;
};

/**
 * Evidence-backed drafts — never invent contacts or claims without evidence.
 */
export function draftAuditSummary(input: {
  lead: Lead;
  audit: AuditLike;
  findings: Array<{ title: string; kind: string; detail: string }>;
  evidence: LeadEvidence[];
}) {
  const facts = input.findings.filter((f) => f.kind === "fact");
  const inferences = input.findings.filter((f) => f.kind === "inference");
  const unknowns = input.findings.filter((f) => f.kind === "unknown");

  const evidenceLines = input.evidence
    .slice(0, 5)
    .map(
      (e) =>
        `- [${e.kind}] ${e.field}: ${e.claim}${e.value ? ` (${e.value})` : ""}`,
    );

  const body = [
    `Hi ${input.lead.name},`,
    "",
    `I put together a brief audit focused on ${input.lead.company || input.lead.domain || "your business"}.`,
    "",
    input.audit.summary || input.audit.title,
    "",
    facts.length ? "Observed facts:" : null,
    ...facts.map((f) => `• ${f.title}: ${f.detail}`),
    inferences.length ? "" : null,
    inferences.length ? "Working inferences (flagged as such):" : null,
    ...inferences.map((f) => `• ${f.title}: ${f.detail}`),
    unknowns.length ? "" : null,
    unknowns.length ? "Unknown / not verified:" : null,
    ...unknowns.map((f) => `• ${f.title}`),
    "",
    evidenceLines.length ? "Evidence referenced:" : null,
    ...evidenceLines,
    "",
    "Happy to walk through this if useful — no invented contact details were used.",
    "",
    "Best,",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    subject: `Audit notes for ${input.lead.company || input.lead.name}`,
    bodyText: body,
    personalizationNotes: `Based on ${input.evidence.length} evidence records; ${facts.length} facts / ${inferences.length} inferences / ${unknowns.length} unknowns`,
  };
}

export function draftPersonalizedOutreach(input: {
  lead: Lead;
  audit?: { title: string } | null;
  evidence: LeadEvidence[];
  angle?: string;
}) {
  const domainHint = input.lead.domain
    ? `I noticed ${input.lead.domain}`
    : "I came across your work";
  const observedFact = input.evidence.find((e) => e.kind === "fact");
  const factLine = observedFact
    ? `One concrete observation: ${observedFact.claim}${observedFact.value ? ` — ${observedFact.value}` : ""}.`
    : "I don't have a verified public contact detail beyond what you've published, so I'll keep this high-level.";

  const body = [
    `Hi ${input.lead.name},`,
    "",
    `${domainHint}${input.lead.niche ? ` in ${input.lead.niche}` : ""}.`,
    factLine,
    input.angle
      ? input.angle
      : "If helpful, I can share a short teardown focused on conversion and offer clarity.",
    input.audit
      ? `I also drafted an internal audit (${input.audit.title}) grounded in collected evidence.`
      : null,
    "",
    "If this isn't relevant, reply stop or use the unsubscribe link and I won't follow up.",
    "",
    "Thanks,",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    subject: input.lead.company
      ? `Quick idea for ${input.lead.company}`
      : "Quick idea for your team",
    bodyText: body,
    personalizationNotes: observedFact
      ? `Personalized from evidence ${observedFact.id}`
      : "Limited personalization — sparse observed evidence",
  };
}

export function draftProposal(input: {
  lead: Lead;
  serviceName: string;
  scope: string;
  investment: string;
  evidence: LeadEvidence[];
}) {
  const body = [
    `Hi ${input.lead.name},`,
    "",
    `Proposal: ${input.serviceName}`,
    "",
    "Scope:",
    input.scope,
    "",
    `Investment: ${input.investment}`,
    "",
    "This proposal references only evidence-backed observations and clearly marked inferences. Unknowns are left open rather than invented.",
    input.evidence[0]
      ? `Primary evidence: ${input.evidence[0].claim}`
      : "Evidence pack attached in CRM.",
    "",
    "Next step: a 20-minute review call if useful.",
    "",
    "Best,",
  ].join("\n");

  return {
    subject: `Proposal — ${input.serviceName}`,
    bodyText: body,
    personalizationNotes: `Proposal for lead ${input.lead.id}`,
  };
}

export function draftFollowUp(input: {
  lead: Lead;
  previousSubject: string;
  daysSince: number;
}) {
  const body = [
    `Hi ${input.lead.name},`,
    "",
    `Following up on "${input.previousSubject}" from ${input.daysSince} day(s) ago.`,
    "Happy to close the loop if timing is better later — reply stop to opt out.",
    "",
    "Best,",
  ].join("\n");

  return {
    subject: `Re: ${input.previousSubject}`,
    bodyText: body,
    personalizationNotes: "Follow-up cadence draft",
  };
}
