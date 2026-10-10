import { describe, expect, it } from "vitest";
import {
  draftAuditSummary,
  draftFollowUp,
  draftPersonalizedOutreach,
  draftProposal,
} from "@/outreach/drafts";
import type { Lead, LeadEvidence } from "@/db/schema";

const lead = {
  id: "lead_1",
  name: "Jordan Lee",
  email: "jordan@acme.test",
  company: "Acme Co",
  emailProvenance: "observed",
  domain: "acme.test",
  niche: "saas",
} as Lead;

const audit = {
  id: "audit_1",
  title: "Website clarity audit",
  summary: "Homepage CTA is unclear relative to services.",
};

const findings = [
  {
    kind: "fact",
    title: "Primary CTA is 'Learn more'",
    detail: "Observed on homepage hero",
  },
  {
    kind: "unknown",
    title: "Conversion rate",
    detail: "Not available from public sources",
  },
];

const evidence = [
  {
    id: "ev1",
    kind: "fact",
    field: "cta",
    claim: "Homepage CTA label is Learn more",
    value: "Learn more",
    sourceUrl: "https://acme.test",
  },
] as LeadEvidence[];

describe("outreach drafts", () => {
  it("keeps audit summary grounded in findings and evidence", () => {
    const draft = draftAuditSummary({ lead, audit, findings, evidence });
    expect(draft.subject).toMatch(/Acme|Jordan|audit/i);
    expect(draft.bodyText).toContain("Learn more");
    expect(draft.bodyText).toMatch(/unknown|not available/i);
    expect(draft.personalizationNotes.length).toBeGreaterThan(0);
  });

  it("personalizes outreach from evidence without inventing contacts", () => {
    const draft = draftPersonalizedOutreach({ lead, audit, evidence });
    expect(draft.bodyText).toContain("acme.test");
    expect(draft.bodyText).toContain("Homepage CTA label is Learn more");
    expect(draft.personalizationNotes).toMatch(/ev1/);
  });

  it("drafts proposals and follow-ups", () => {
    const proposal = draftProposal({
      lead,
      serviceName: "Site redesign",
      scope: "Discovery + IA + launch",
      investment: "$12k",
      evidence,
    });
    expect(proposal.bodyText).toContain("Site redesign");
    expect(proposal.bodyText).toContain("$12k");

    const follow = draftFollowUp({
      lead,
      previousSubject: "Quick note on Acme",
      daysSince: 4,
    });
    expect(follow.subject.toLowerCase()).toContain("quick note on acme");
    expect(follow.bodyText).toContain("Quick note on Acme");
  });
});
