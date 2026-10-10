import { describe, expect, it } from "vitest";
import {
  domainFromEmail,
  normalizeDomain,
  normalizeProspect,
} from "@/acquisition/normalize";
import { parseLeadsCsv } from "@/acquisition/csv";

describe("lead normalization", () => {
  it("normalizes domains and never invents email", () => {
    expect(normalizeDomain("https://WWW.Acme.Example/path")).toBe(
      "acme.example",
    );
    expect(domainFromEmail("ada@acme.example")).toBe("acme.example");

    const prospect = normalizeProspect({
      name: "Acme",
      websiteUrl: "https://acme.example",
      market: "B2B",
    });
    expect(prospect.email).toBe("");
    expect(prospect.emailProvenance).toBe("unknown");
    expect(prospect.domain).toBe("acme.example");
  });
});

describe("csv import", () => {
  it("parses rows and supports blank emails", () => {
    const csv = `name,email,company,domain,websiteUrl,market,niche,status
Ada,,Acme,acme.example,https://acme.example,B2B,analytics,new
`;
    const { rows } = parseLeadsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("");
    expect(rows[0]?.emailProvenance).toBe("unknown");
    expect(rows[0]?.domain).toBe("acme.example");

    const missing = parseLeadsCsv(`name,email,domain\n,,\n`);
    expect(missing.rows).toHaveLength(0);
  });

  it("dedupes conceptually by domain across duplicate CSV domains", () => {
    const csv = `name,email,domain
One,,acme.example
Two,,www.acme.example
`;
    const { rows } = parseLeadsCsv(csv);
    expect(rows[0]?.domain).toBe("acme.example");
    expect(rows[1]?.domain).toBe("acme.example");
  });
});
