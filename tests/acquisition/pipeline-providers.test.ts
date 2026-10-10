import { afterEach, describe, expect, it } from "vitest";
import {
  getAcquisitionEnv,
  resetAcquisitionEnvCache,
} from "@/acquisition/config";
import { getResearchProvider } from "@/acquisition/providers/registry";
import { researchProspects } from "@/acquisition/pipeline";
import {
  defaultScoreFactors,
  computeWeightedScore,
} from "@/acquisition/scoring";

afterEach(() => {
  resetAcquisitionEnvCache();
});

describe("acquisition providers and scoring", () => {
  it("fails closed when Brave is missing", () => {
    (process.env as Record<string, string | undefined>).BRAVE_SEARCH_API_KEY =
      "";
    resetAcquisitionEnvCache();
    expect(() => getResearchProvider("brave")).toThrow(/not configured/i);
    expect(getAcquisitionEnv().BRAVE_SEARCH_API_KEY).toBe("");
  });

  it("dedupes mock research hits by domain and keeps email unknown without observation", async () => {
    (process.env as Record<string, string | undefined>).ACQUISITION_ALLOW_MOCK =
      "true";
    (
      process.env as Record<string, string | undefined>
    ).ACQUISITION_MAX_FETCHES_PER_RUN = "0";
    resetAcquisitionEnvCache();

    const result = await researchProspects({
      query: "branding studios",
      market: "US",
      niche: "branding",
      provider: "mock",
    });

    expect(result.prospects.length).toBe(1);
    expect(result.prospects[0]?.prospect.domain).toBe("acme.example");
    expect(result.prospects[0]?.prospect.email).toBe("");
    expect(result.prospects[0]?.prospect.emailProvenance).toBe("unknown");
  });

  it("marks stale evidence impact in scoring", () => {
    const fresh = computeWeightedScore(
      defaultScoreFactors({
        hasObservedEmail: true,
        hasWebsite: true,
        market: "US",
        niche: "saas",
        serviceFit: 80,
        evidenceStale: false,
      }),
    );
    const stale = computeWeightedScore(
      defaultScoreFactors({
        hasObservedEmail: true,
        hasWebsite: true,
        market: "US",
        niche: "saas",
        serviceFit: 80,
        evidenceStale: true,
      }),
    );
    expect(fresh).toBeGreaterThan(stale);
  });
});
