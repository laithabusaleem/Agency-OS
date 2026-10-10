import { getAcquisitionEnv } from "@/acquisition/config";
import { BraveSearchProvider } from "@/acquisition/providers/brave";
import { MockResearchProvider } from "@/acquisition/providers/mock";
import { OpenRouterSearchProvider } from "@/acquisition/providers/openrouter-search";
import type { ResearchProvider } from "@/acquisition/providers/types";
import type { ResearchProviderId } from "@/acquisition/types";

const brave = new BraveSearchProvider();
const openrouter = new OpenRouterSearchProvider();
const mock = new MockResearchProvider();

export function listResearchProviderStatus() {
  const env = getAcquisitionEnv();
  return [
    {
      id: "openrouter" as const,
      name: "AI web search (OpenRouter)",
      configured: openrouter.isConfigured(),
      description:
        "Live web search via OpenRouter — citations required, no invented contacts",
    },
    {
      id: "brave" as const,
      name: "Brave Search",
      configured: brave.isConfigured(),
      description: "Web search for public prospects (API key required)",
    },
    {
      id: "manual" as const,
      name: "Manual entry",
      configured: true,
      description: "Always available — no API required",
    },
    {
      id: "csv" as const,
      name: "CSV import",
      configured: true,
      description: "Always available — no API required",
    },
    {
      id: "mock" as const,
      name: "Mock research",
      configured:
        env.ACQUISITION_ALLOW_MOCK ||
        env.ACQUISITION_DEFAULT_PROVIDER === "mock",
      description: "Deterministic test provider (explicit opt-in)",
    },
  ];
}

export function getResearchProvider(id: ResearchProviderId): ResearchProvider {
  const env = getAcquisitionEnv();
  if (id === "openrouter") {
    if (!openrouter.isConfigured()) {
      throw new Error(
        "OpenRouter search is not configured. Set OPENROUTER_API_KEY.",
      );
    }
    return openrouter;
  }
  if (id === "brave") {
    if (!brave.isConfigured()) {
      throw new Error(
        "Brave Search is not configured. Use OpenRouter AI search, manual entry, or CSV import, or set BRAVE_SEARCH_API_KEY.",
      );
    }
    return brave;
  }
  if (id === "mock") {
    if (!env.ACQUISITION_ALLOW_MOCK && process.env.NODE_ENV === "production") {
      throw new Error("Mock research provider is disabled in production.");
    }
    return mock;
  }
  throw new Error(
    `Provider "${id}" does not perform remote research. Use manual or CSV workflows.`,
  );
}
