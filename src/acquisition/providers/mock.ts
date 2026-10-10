import type {
  ResearchProvider,
  ResearchSearchInput,
} from "@/acquisition/providers/types";
import type { SearchHit } from "@/acquisition/types";

/**
 * Deterministic mock research provider for tests / local drills.
 * Never used as a silent production fallback when Brave is requested.
 */
export class MockResearchProvider implements ResearchProvider {
  readonly id = "mock" as const;

  isConfigured() {
    return true;
  }

  async search(input: ResearchSearchInput): Promise<SearchHit[]> {
    if (input.query.includes("__MALFORMED__")) {
      // Caller tests parseBraveResults separately; this returns empty for pipeline.
      return [];
    }
    if (input.query.includes("__EMPTY__")) {
      return [];
    }

    const retrievedAt = new Date().toISOString();
    const niche = input.niche || "agencies";
    return [
      {
        title: `Acme ${niche} studio`,
        url: "https://acme.example/about",
        description: `Public site for Acme working in ${input.market || "general"} ${niche}. Contact listed on site only when observed.`,
        provider: "mock",
        retrievedAt,
      },
      {
        title: "Duplicate domain candidate",
        url: "https://www.acme.example/services",
        description: "Same domain — should dedupe.",
        provider: "mock",
        retrievedAt,
      },
    ];
  }
}
