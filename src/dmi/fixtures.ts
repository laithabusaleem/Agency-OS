/**
 * Offline fixtures for mock-mode decision-maker research.
 * Never invent contacts — emails here are explicitly marked published/company-level.
 */
export type FixtureCandidate = {
  fullName: string;
  currentRole: string;
  decisionMakerType:
    | "founder"
    | "owner"
    | "ceo"
    | "managing_director"
    | "head_of_marketing"
    | "operations_director"
    | "other";
  summary: string;
  priorities: string[];
  opportunities: string[];
  evidence: Array<{
    claim: string;
    excerpt: string;
    sourceUrl: string;
    sourceType:
      | "company_website"
      | "press"
      | "interview"
      | "public_bio"
      | "fixture"
      | "brave_search"
      | "professional_profile";
    kind: "fact" | "hypothesis" | "unknown";
  }>;
  channels: Array<{
    channelType:
      | "business_email"
      | "published_professional_email"
      | "company_contact_form"
      | "company_general_email";
    value: string;
    provenance: "verified" | "published" | "company_level" | "inferred";
    sourceUrl?: string;
    discoveryMethod: string;
    allowedForAutomation: boolean;
  }>;
};

export function fixtureForDomain(domain: string | null | undefined): {
  candidates: FixtureCandidate[];
  limitation?: string;
} {
  const d = (domain || "example.com").toLowerCase();

  if (d.includes("acme") || d.includes("northstar") || d.includes("test")) {
    return {
      candidates: [
        {
          fullName: "Jordan Lee",
          currentRole: "Founder & CEO",
          decisionMakerType: "founder",
          summary:
            "Public founder profile associated with company growth and digital presence.",
          priorities: [
            "Improving website conversion",
            "Clarifying service offers online",
          ],
          opportunities: [
            "Website clarity / conversion teardown grounded in public homepage observations",
          ],
          evidence: [
            {
              claim: "Jordan Lee is listed as Founder & CEO",
              excerpt: "Founder & CEO — Jordan Lee",
              sourceUrl: `https://${d}/about`,
              sourceType: "company_website",
              kind: "fact",
            },
            {
              claim: "Company publicly discusses improving online conversion",
              excerpt: "We are focused on converting more visitors into conversations.",
              sourceUrl: `https://${d}/blog/growth`,
              sourceType: "press",
              kind: "fact",
            },
          ],
          channels: [
            {
              channelType: "company_general_email",
              value: `hello@${d.replace(/^www\./, "")}`,
              provenance: "company_level",
              sourceUrl: `https://${d}/contact`,
              discoveryMethod: "company_contact_page",
              allowedForAutomation: false,
            },
            {
              channelType: "published_professional_email",
              value: `jordan@${d.replace(/^www\./, "")}`,
              provenance: "published",
              sourceUrl: `https://${d}/about`,
              discoveryMethod: "about_page_mailto",
              allowedForAutomation: false,
            },
          ],
        },
        {
          fullName: "Sam Rivera",
          currentRole: "Head of Marketing",
          decisionMakerType: "head_of_marketing",
          summary: "Marketing lead referenced on the company team page.",
          priorities: ["Campaign messaging", "Lead quality"],
          opportunities: ["Marketing content package aligned to public offer"],
          evidence: [
            {
              claim: "Sam Rivera is listed as Head of Marketing",
              excerpt: "Head of Marketing — Sam Rivera",
              sourceUrl: `https://${d}/team`,
              sourceType: "company_website",
              kind: "fact",
            },
          ],
          channels: [
            {
              channelType: "company_contact_form",
              value: `https://${d}/contact`,
              provenance: "company_level",
              sourceUrl: `https://${d}/contact`,
              discoveryMethod: "contact_form_link",
              allowedForAutomation: false,
            },
          ],
        },
      ],
    };
  }

  return {
    candidates: [],
    limitation:
      "No decision-maker fixture matched this domain. Live mode requires configured search credentials; contacts are never invented.",
  };
}
