import { getAcquisitionEnv } from "@/acquisition/config";
import { fetchPublicPage } from "@/acquisition/fetch/public-fetch";
import { normalizeDomain, normalizeProspect } from "@/acquisition/normalize";
import { getResearchProvider } from "@/acquisition/providers/registry";
import {
  detectPromptInjection,
  extractObservedEmails,
  sanitizeRetrievedText,
} from "@/acquisition/sanitize";
import type { ResearchProviderId, SearchHit } from "@/acquisition/types";

export type ResearchedProspect = {
  prospect: ReturnType<typeof normalizeProspect>;
  evidence: Array<{
    kind: "fact" | "inference" | "unknown";
    field: string;
    claim: string;
    value?: string | null;
    sourceType: "brave_search" | "website" | "model" | "manual" | "csv";
    sourceUrl?: string | null;
    rawExcerpt?: string | null;
    retrievedAt: string;
  }>;
  injectionDetected: boolean;
  fetchBlockedReason?: string;
};

export async function researchProspects(input: {
  query: string;
  market?: string;
  niche?: string;
  provider: ResearchProviderId;
  fetchImpl?: typeof fetch;
}): Promise<{
  hits: SearchHit[];
  prospects: ResearchedProspect[];
  provider: ResearchProviderId;
}> {
  if (input.provider === "manual" || input.provider === "csv") {
    return { hits: [], prospects: [], provider: input.provider };
  }

  const provider = getResearchProvider(input.provider);
  const hits = await provider.search({
    query: input.query,
    market: input.market,
    niche: input.niche,
    count: 5,
  });

  const env = getAcquisitionEnv();
  const byDomain = new Map<string, SearchHit>();
  for (const hit of hits) {
    const domain = normalizeDomain(hit.url);
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, hit);
  }

  const prospects: ResearchedProspect[] = [];
  let fetches = 0;

  const hitSourceType =
    input.provider === "brave"
      ? ("brave_search" as const)
      : input.provider === "openrouter"
        ? ("model" as const)
        : ("website" as const);

  for (const [domain, hit] of byDomain) {
    const evidence: ResearchedProspect["evidence"] = [
      {
        kind: "fact",
        field: "website",
        claim: "Public search result URL",
        value: hit.url,
        sourceType: hitSourceType,
        sourceUrl: hit.url,
        rawExcerpt: sanitizeRetrievedText(hit.description, 500),
        retrievedAt: hit.retrievedAt,
      },
      {
        kind: "inference",
        field: "company",
        claim: "Company name inferred from result title (editable)",
        value: hit.title,
        sourceType: hitSourceType,
        sourceUrl: hit.url,
        rawExcerpt: sanitizeRetrievedText(hit.title, 200),
        retrievedAt: hit.retrievedAt,
      },
    ];

    let email = "";
    let injectionDetected = false;
    let fetchBlockedReason: string | undefined;
    let pageText = "";

    if (fetches < env.ACQUISITION_MAX_FETCHES_PER_RUN) {
      fetches += 1;
      const page = await fetchPublicPage(hit.url, {
        fetchImpl: input.fetchImpl,
      });
      if (page.ok) {
        pageText = page.text;
        injectionDetected = detectPromptInjection(page.text);
        const emails = extractObservedEmails(page.text);
        if (emails[0]) {
          email = emails[0];
          evidence.push({
            kind: "fact",
            field: "email",
            claim: "Email observed on public page",
            value: email,
            sourceType: "website",
            sourceUrl: page.finalUrl,
            rawExcerpt: sanitizeRetrievedText(pageText.slice(0, 400), 400),
            retrievedAt: page.retrievedAt,
          });
        } else {
          evidence.push({
            kind: "unknown",
            field: "email",
            claim: "No contact email observed on public page (not invented)",
            value: null,
            sourceType: "website",
            sourceUrl: page.finalUrl,
            rawExcerpt: sanitizeRetrievedText(pageText.slice(0, 200), 200),
            retrievedAt: page.retrievedAt,
          });
        }
        if (injectionDetected) {
          evidence.push({
            kind: "fact",
            field: "security",
            claim: "Prompt-injection patterns filtered from retrieved content",
            value: "filtered",
            sourceType: "website",
            sourceUrl: page.finalUrl,
            rawExcerpt: "[filtered]",
            retrievedAt: page.retrievedAt,
          });
        }
      } else {
        fetchBlockedReason = `${page.reason}: ${page.message}`;
        evidence.push({
          kind: "unknown",
          field: "website_content",
          claim: `Public fetch skipped/blocked (${page.reason})`,
          value: null,
          sourceType: "website",
          sourceUrl: hit.url,
          rawExcerpt: page.message,
          retrievedAt: page.retrievedAt,
        });
      }
    }

    const prospect = normalizeProspect({
      name: hit.title,
      company: hit.title,
      websiteUrl: hit.url,
      domain,
      email,
      market: input.market,
      niche: input.niche,
      notes: hit.description,
      source: `${input.provider}_search`,
      acquisitionSource:
        input.provider === "brave"
          ? "brave_search"
          : input.provider === "openrouter"
            ? "mixed"
            : "website",
      emailProvenance: email ? "observed" : "unknown",
      nameProvenance: "inferred",
      phoneProvenance: "unknown",
    });

    prospects.push({
      prospect,
      evidence,
      injectionDetected,
      fetchBlockedReason,
    });
  }

  return { hits, prospects, provider: input.provider };
}
